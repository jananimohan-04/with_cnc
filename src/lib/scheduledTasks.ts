// Tasks for a machine or a team member that are not a production job (cleaning, tool preset, training, maintenance ...).
// They live in cnc_scheduled_tasks (one company's tasks are invisible to another: row level security, see the migration).
// Only until that SQL has been run, a task is kept in this browser instead, and the person is told so.
import { supabase } from '@/lib/supabase';
import { ymd } from '@/lib/operationPlans';

export interface ScheduledTask {
  id: string;
  task_name: string;
  member_name: string;
  task_date: string; // YYYY-MM-DD
  start_time: string; // HH:mm (24h)
  end_time: string; // HH:mm (24h)
  machine?: string;
  mode?: 'planned' | 'actual';
  status?: 'Planned' | 'In Progress' | 'Completed';
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

/** A saved task; `local` is true when it could only be kept in this browser (the SQL has not been run yet). */
export type SavedTask = ScheduledTask & { local?: boolean };

const LOCAL_KEY = 'cnc_scheduled_tasks_v2';
const TABLE = 'cnc_scheduled_tasks';

const tableMissing = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache|could not find the table/i.test(String(e.message ?? '')));

function readLocal(): ScheduledTask[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function writeLocal(list: ScheduledTask[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list)); } catch { /* storage restricted */ }
}

const inRange = (t: ScheduledTask, r?: { from?: string; to?: string }) => !r || ((!r.from || t.task_date >= r.from) && (!r.to || t.task_date <= r.to));

const normalise = (d: Record<string, any>): ScheduledTask => ({
  id: String(d.id),
  task_name: String(d.task_name ?? ''),
  member_name: String(d.member_name ?? ''),
  task_date: String(d.task_date ?? '').slice(0, 10),
  start_time: String(d.start_time ?? '09:00').slice(0, 5),
  end_time: String(d.end_time ?? '10:00').slice(0, 5),
  machine: d.machine ? String(d.machine) : undefined,
  mode: d.mode === 'actual' ? 'actual' : 'planned',
  status: d.status === 'Completed' || d.status === 'In Progress' ? d.status : 'Planned',
  notes: d.notes ? String(d.notes) : undefined,
  created_at: d.created_at,
  updated_at: d.updated_at,
});

/** The tasks (optionally for a date range). Never throws: a problem shows as an empty list. */
export async function fetchScheduledTasks(range?: { from?: string; to?: string }): Promise<ScheduledTask[]> {
  try {
    let q = supabase.from(TABLE as never).select('*').order('task_date' as never).order('start_time' as never);
    if (range?.from) q = q.gte('task_date' as never, range.from as never);
    if (range?.to) q = q.lte('task_date' as never, range.to as never);
    const { data, error } = await q;
    if (error) {
      if (!tableMissing(error)) console.warn('Tasks could not be read:', error.message);
      return tableMissing(error) ? readLocal().filter((t) => inRange(t, range)) : [];
    }
    return ((data ?? []) as Record<string, any>[]).map(normalise);
  } catch (e) {
    console.warn('Tasks could not be read:', e);
    return [];
  }
}

export async function createScheduledTask(task: Omit<ScheduledTask, 'id' | 'created_at' | 'updated_at'>): Promise<SavedTask> {
  const now = new Date().toISOString();
  const row: ScheduledTask = {
    ...task,
    id: crypto.randomUUID(),
    task_date: task.task_date || ymd(new Date()),
    start_time: task.start_time || '09:00',
    end_time: task.end_time || '10:00',
    mode: task.mode || 'planned',
    status: task.status || 'Planned',
    created_at: now,
    updated_at: now,
  };
  const { error } = await supabase.from(TABLE as never).insert([{
    id: row.id, task_name: row.task_name, member_name: row.member_name || null, task_date: row.task_date,
    start_time: row.start_time, end_time: row.end_time, machine: row.machine || null, mode: row.mode, status: row.status, notes: row.notes || null,
  }] as never);
  if (!error) return row;
  if (!tableMissing(error)) throw new Error(error.message);
  writeLocal([row, ...readLocal()]);
  return { ...row, local: true };
}

export async function updateScheduledTask(id: string, patch: Partial<ScheduledTask>): Promise<SavedTask | null> {
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ['task_name', 'member_name', 'task_date', 'start_time', 'end_time', 'machine', 'mode', 'status', 'notes'] as const) {
    if (k in patch) dbPatch[k] = (patch as Record<string, unknown>)[k] || null;
  }
  const { data, error } = await supabase.from(TABLE as never).update(dbPatch as never).eq('id' as never, id as never).select().maybeSingle();
  if (!error) return data ? normalise(data as Record<string, any>) : null;
  if (!tableMissing(error)) throw new Error(error.message);
  const list = readLocal();
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, updated_at: new Date().toISOString() };
  writeLocal(list);
  return { ...list[i], local: true };
}

export async function deleteScheduledTask(id: string): Promise<boolean> {
  const { error } = await supabase.from(TABLE as never).delete().eq('id' as never, id as never);
  if (!error) return true;
  if (!tableMissing(error)) throw new Error(error.message);
  writeLocal(readLocal().filter((t) => t.id !== id));
  return true;
}
