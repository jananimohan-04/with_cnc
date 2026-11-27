// Links a Clarity task (Today's List / To Do List) to a task on Production > Scheduling.
// A dated task sits on the Planned timeline; when it is ticked done it moves to the Actual timeline (mode 'actual').
// The link is kept in the scheduled task's notes ("clarity:<task id>"), so no extra column is needed.

import { supabase } from '@/lib/supabase';
import { createScheduledTask, updateScheduledTask } from '@/lib/scheduledTasks';

export const linkNote = (clarityTaskId: string) => `clarity:${clarityTaskId}`;

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Puts the scheduling task in step with the Clarity task's done tick. Throws when it could not be saved. */
export async function markScheduled(t: { id: string; title: string; assignee: string; due_date: string | null; done: boolean }, myName: string): Promise<void> {
  const { data, error } = await supabase.from('cnc_scheduled_tasks' as never).select('id').eq('notes' as never, linkNote(t.id) as never).limit(1);
  if (error) throw new Error(error.message);
  const linked = (data as { id: string }[] | null)?.[0];
  if (linked) {
    await updateScheduledTask(linked.id, t.done ? { mode: 'actual', status: 'Completed' } : { mode: 'planned', status: 'Planned' });
    return;
  }
  if (!t.done) return;
  // ticked but never on the calendar: record it as done now
  const now = new Date();
  const start = new Date(Math.max(now.getTime() - 30 * 60000, new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()));
  await createScheduledTask({
    task_name: t.title, member_name: t.assignee || myName, task_date: todayISO(), start_time: hhmm(start), end_time: hhmm(now),
    mode: 'actual', status: 'Completed', notes: linkNote(t.id),
  });
}
