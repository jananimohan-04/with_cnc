// Clarity: Vision -> Mission -> Goals -> To Do List -> Today's List (Overview > Clarity, /clarity).
// Simple on purpose: five tabs, everything editable in place. Vision, mission and goals belong to the signed-in
// person; tasks are shared in the company (a task can be given to anyone), with "Me / Everyone" filters.
// Data: clarity_statements, clarity_lines, clarity_goals, clarity_tasks (migration 20261123000000_clarity.sql).

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronRight, ChevronUp, Eye, Filter, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

type Tab = 'today' | 'todo' | 'goals' | 'mission' | 'vision';
interface Statement { id: string; owner_id: string; kind: 'vision' | 'mission'; body: string; target_year: number | null }
interface Line { id: string; owner_id: string; kind: 'vision3y' | 'year_goal'; body: string; sort_order: number }
interface Goal { id: string; owner_id: string; title: string; assignee: string; start_date: string | null; end_date: string | null; sort_order: number; created_at: string }
interface Task { id: string; owner_id: string; goal_id: string | null; title: string; assignee: string; due_date: string | null; today: string | null; done: boolean; sort_order: number; created_at: string }

const MAX_GOALS = 7;
const GOAL_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#06b6d4', '#eab308'];
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDay = (s: string | null) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const fmtFull = (s: string | null) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '—';
const missingTable = (msg: string) => /relation .*clarity_|clarity_\w+.*(does not exist|schema cache)|PGRST205|42P01/i.test(msg);

export function ClarityPage() {
  const { profile } = useAuth();
  const me = profile?.id ?? '';
  const myName = profile?.full_name || profile?.email || 'Me';
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem('clarity.tab') as Tab) || 'today'; } catch { return 'today'; } });
  const pickTab = (t: Tab) => { setTab(t); try { localStorage.setItem('clarity.tab', t); } catch { /* not saved */ } };

  const [statements, setStatements] = useState<Statement[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [setupNeeded, setSetupNeeded] = useState(false);

  const fail = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    if (missingTable(msg)) setSetupNeeded(true); else setError(msg);
  };

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true); setError('');
    try {
      const [s, l, g, t, u] = await Promise.all([
        supabase.from('clarity_statements').select('*').eq('owner_id', me),
        supabase.from('clarity_lines').select('*').eq('owner_id', me).order('sort_order').order('created_at'),
        supabase.from('clarity_goals').select('*').eq('owner_id', me).order('sort_order').order('created_at'),
        supabase.from('clarity_tasks').select('*').order('sort_order').order('created_at').limit(2000),
        supabase.from('company_users').select('full_name,email,status').limit(500),
      ]);
      for (const r of [s, l, g, t]) if (r.error) throw r.error;
      setStatements((s.data ?? []) as Statement[]);
      setLines((l.data ?? []) as Line[]);
      setGoals((g.data ?? []) as Goal[]);
      setTasks((t.data ?? []) as Task[]);
      const names = new Set<string>([myName]);
      for (const p of (u.data ?? []) as { full_name?: string; email?: string; status?: string }[]) if (p.status !== 'Inactive') names.add(p.full_name || p.email || '');
      setPeople([...names].filter(Boolean).sort((a, b) => a.localeCompare(b)));
      setSetupNeeded(false);
    } catch (e) { fail(e); } finally { setLoading(false); }
  }, [me, myName]);
  useEffect(() => { void load(); }, [load]);

  // ------------------------------------------------------------------ saving
  const saveStatement = async (kind: 'vision' | 'mission', patch: Partial<Statement>) => {
    const cur = statements.find((x) => x.kind === kind);
    const row = { owner_id: me, kind, body: cur?.body ?? '', target_year: cur?.target_year ?? null, ...patch, updated_at: new Date().toISOString() };
    const r = cur
      ? await supabase.from('clarity_statements').update(row).eq('id', cur.id).select().single()
      : await supabase.from('clarity_statements').insert(row).select().single();
    if (r.error) return fail(r.error);
    setStatements((xs) => [...xs.filter((x) => x.kind !== kind), r.data as Statement]);
  };
  const addLine = async (kind: Line['kind'], body: string) => {
    const r = await supabase.from('clarity_lines').insert({ owner_id: me, kind, body, sort_order: lines.filter((x) => x.kind === kind).length }).select().single();
    if (r.error) return fail(r.error);
    setLines((xs) => [...xs, r.data as Line]);
  };
  const editLine = async (id: string, body: string) => {
    setLines((xs) => xs.map((x) => (x.id === id ? { ...x, body } : x)));
    const r = await supabase.from('clarity_lines').update({ body }).eq('id', id);
    if (r.error) fail(r.error);
  };
  const deleteLine = async (id: string) => {
    setLines((xs) => xs.filter((x) => x.id !== id));
    const r = await supabase.from('clarity_lines').delete().eq('id', id);
    if (r.error) fail(r.error);
  };
  const saveGoal = async (g: Partial<Goal> & { id?: string }) => {
    if (g.id) {
      const { id, ...rest } = g;
      setGoals((xs) => xs.map((x) => (x.id === id ? { ...x, ...rest } : x)));
      const r = await supabase.from('clarity_goals').update(rest).eq('id', id);
      if (r.error) fail(r.error);
      return;
    }
    const r = await supabase.from('clarity_goals').insert({ owner_id: me, assignee: myName, ...g, sort_order: goals.length }).select().single();
    if (r.error) return fail(r.error);
    setGoals((xs) => [...xs, r.data as Goal]);
  };
  const deleteGoal = async (id: string) => {
    if (!window.confirm('Delete this goal? Its steps stay in the To Do list without a goal.')) return;
    setGoals((xs) => xs.filter((x) => x.id !== id));
    setTasks((xs) => xs.map((t) => (t.goal_id === id ? { ...t, goal_id: null } : t)));
    const r = await supabase.from('clarity_goals').delete().eq('id', id);
    if (r.error) fail(r.error);
  };
  const addTask = async (t: Partial<Task>) => {
    const r = await supabase.from('clarity_tasks').insert({ owner_id: me, assignee: myName, ...t, sort_order: tasks.length }).select().single();
    if (r.error) return fail(r.error);
    setTasks((xs) => [...xs, r.data as Task]);
  };
  const editTask = async (id: string, patch: Partial<Task>) => {
    const full = { ...patch, ...(patch.done !== undefined ? { done_at: patch.done ? new Date().toISOString() : null } : {}) };
    setTasks((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const r = await supabase.from('clarity_tasks').update(full).eq('id', id);
    if (r.error) fail(r.error);
  };
  const deleteTask = async (id: string) => {
    setTasks((xs) => xs.filter((x) => x.id !== id));
    const r = await supabase.from('clarity_tasks').delete().eq('id', id);
    if (r.error) fail(r.error);
  };

  const ctx: Ctx = { me, myName, people, statements, lines, goals, tasks, saveStatement, addLine, editLine, deleteLine, saveGoal, deleteGoal, addTask, editTask, deleteTask };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'today', label: "Today's List" }, { id: 'todo', label: 'To Do List' }, { id: 'goals', label: 'Goals' }, { id: 'mission', label: 'Mission' }, { id: 'vision', label: 'Vision' },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow"><Layers size={20} /></span>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Crystal Clear Clarity</h1>
          <p className="text-xs text-slate-500">Moving busy to productive</p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-5 gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => pickTab(t.id)}
            className={`rounded-xl py-2 text-[11px] font-bold uppercase tracking-wider transition ${tab === t.id ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>{t.label}</button>
        ))}
      </div>

      {setupNeeded ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Clarity is not set up in the database yet. Please ask your administrator to run the SQL file <b>20261123000000_clarity.sql</b>, then refresh this page.
        </div>
      ) : loading ? (
        <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          {error && <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"><span className="flex-1">{error}</span><button type="button" onClick={() => setError('')}><X size={13} /></button></div>}
          {tab === 'today' && <TodayTab c={ctx} />}
          {tab === 'todo' && <TodoTab c={ctx} />}
          {tab === 'goals' && <GoalsTab c={ctx} />}
          {tab === 'mission' && <MissionTab c={ctx} />}
          {tab === 'vision' && <VisionTab c={ctx} />}
          <p className="mt-4 text-[11px] text-slate-400">Vision → Mission → Goals → To Do List → Today. Tap any card to edit it.</p>
        </>
      )}
    </div>
  );
}

interface Ctx {
  me: string; myName: string; people: string[]; statements: Statement[]; lines: Line[]; goals: Goal[]; tasks: Task[];
  saveStatement: (kind: 'vision' | 'mission', patch: Partial<Statement>) => Promise<void>;
  addLine: (kind: Line['kind'], body: string) => Promise<void>; editLine: (id: string, body: string) => Promise<void>; deleteLine: (id: string) => Promise<void>;
  saveGoal: (g: Partial<Goal> & { id?: string }) => Promise<void>; deleteGoal: (id: string) => Promise<void>;
  addTask: (t: Partial<Task>) => Promise<void>; editTask: (id: string, p: Partial<Task>) => Promise<void>; deleteTask: (id: string) => Promise<void>;
}

// ------------------------------------------------------------------ shared bits
function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] font-semibold text-slate-500"><span>{done} of {total} done</span><span className="text-slate-800">{pct}%</span></div>
      <div className="h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-gradient-to-r from-violet-500 to-orange-400 transition-all" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

/** A line of text you can click to edit (Enter saves, Esc cancels). */
function InlineText({ value, onSave, className = '', placeholder = '', multiline = false }: { value: string; onSave: (v: string) => void; className?: string; placeholder?: string; multiline?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  if (editing) {
    const done = () => { setEditing(false); if (draft.trim() !== value) onSave(draft.trim()); };
    const common = { autoFocus: true, value: draft, onBlur: done, className: `w-full rounded-lg border border-violet-300 bg-white px-2 py-1 text-inherit outline-none ring-2 ring-violet-100 ${className}` };
    return multiline
      ? <textarea {...common} rows={3} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(value); setEditing(false); } }} />
      : <input {...common} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }} />;
  }
  return <span onClick={() => setEditing(true)} className={`cursor-text ${value ? '' : 'italic text-slate-400'} ${className}`}>{value || placeholder}</span>;
}

/** "+ Add ..." box: type and press Enter. */
function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <input value={v} onChange={(e) => setV(e.target.value)} placeholder={`+ ${placeholder}`}
      onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } }}
      className="w-full rounded-xl border border-dashed border-slate-300 bg-white/70 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
  );
}

function Initials({ name }: { name: string }) {
  return <span title={name} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[9px] font-black text-violet-700">{initials(name)}</span>;
}

function Check1({ done, onToggle, color = '#94a3b8' }: { done: boolean; onToggle: () => void; color?: string }) {
  return (
    <button type="button" onClick={onToggle} title={done ? 'Mark as not done' : 'Mark as done'}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition" style={{ borderColor: done ? '#22c55e' : color, background: done ? '#22c55e' : 'transparent' }}>
      {done && <Check size={11} className="text-white" />}
    </button>
  );
}

/** One task row (used by Today's List and the To Do List). */
function TaskRow({ t, n, c, showToday = true }: { t: Task; n: number; c: Ctx; showToday?: boolean }) {
  const goalIdx = c.goals.findIndex((g) => g.id === t.goal_id);
  const goal = goalIdx >= 0 ? c.goals[goalIdx] : null;
  const onToday = t.today === todayISO();
  const late = !t.done && t.due_date && t.due_date < todayISO();
  return (
    <div className="group flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm hover:border-slate-200">
      <span className="w-5 text-right text-[11px] font-bold text-slate-400">{n}</span>
      <Check1 done={t.done} onToggle={() => void c.editTask(t.id, { done: !t.done })} color={goal ? GOAL_COLORS[goalIdx % GOAL_COLORS.length] : undefined} />
      <div className="min-w-0 flex-1">
        <InlineText value={t.title} onSave={(v) => v && void c.editTask(t.id, { title: v })} className={`text-[13px] font-semibold ${t.done ? 'text-slate-400 line-through' : 'text-slate-800'}`} />
        {goal && <span className="ml-1.5 text-[11px] text-slate-400">({goal.title})</span>}
      </div>
      {t.due_date && <span className={`text-[11px] font-bold ${late ? 'text-red-500' : 'text-slate-400'}`}>{fmtDay(t.due_date)}</span>}
      {showToday && (
        <button type="button" onClick={() => void c.editTask(t.id, { today: onToday ? null : todayISO() })} title={onToday ? "Remove from Today's List" : "Put on Today's List"}
          className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase ${onToday ? 'border-orange-400 bg-orange-500 text-white' : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
          {onToday ? '✓ Today' : '+ Today'}
        </button>
      )}
      <Initials name={t.assignee} />
      <button type="button" onClick={() => void c.deleteTask(t.id)} title="Delete" className="text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={13} /></button>
    </div>
  );
}

// ------------------------------------------------------------------ Today's List
function TodayTab({ c }: { c: Ctx }) {
  const day = todayISO();
  const list = c.tasks.filter((t) => t.today === day && (t.assignee === c.myName || t.owner_id === c.me));
  return (
    <div>
      <h2 className="mb-1 text-2xl font-extrabold text-slate-900">Today's <span className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">List</span></h2>
      <p className="mb-3 text-xs text-slate-500">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · pick from the To Do list with "+ Today", or add here.</p>
      <Card>
        <Progress done={list.filter((t) => t.done).length} total={list.length} />
        <div className="mt-3 space-y-2">
          {list.map((t, i) => <TaskRow key={t.id} t={t} n={i + 1} c={c} />)}
          {!list.length && <p className="py-4 text-center text-sm text-slate-400">Nothing on today's list yet.</p>}
          <AddLine placeholder="Add a task for today" onAdd={(v) => void c.addTask({ title: v, today: day, due_date: day })} />
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ To Do List
function TodoTab({ c }: { c: Ctx }) {
  const [goalF, setGoalF] = useState('all');
  const [personF, setPersonF] = useState('me');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [adding, setAdding] = useState(false);
  const list = c.tasks.filter((t) =>
    (goalF === 'all' || (goalF === 'none' ? !t.goal_id : t.goal_id === goalF))
    && (personF === 'all' || (personF === 'me' ? (t.assignee === c.myName || (t.owner_id === c.me && !t.assignee)) : t.assignee === personF))
    && (!from || (t.due_date ?? '') >= from) && (!to || (t.due_date ?? '9999') <= to));
  const sel = 'h-8 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600 focus:outline-none';
  return (
    <div>
      <h2 className="mb-3 text-2xl font-extrabold text-slate-900">To Do <span className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">List</span></h2>
      <Card>
        <Progress done={list.filter((t) => t.done).length} total={list.length} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-600 hover:bg-orange-100">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-white"><Plus size={11} /></span> Add task
          </button>
          <span className="flex-1" />
          <Filter size={13} className="text-slate-400" />
          <select value={goalF} onChange={(e) => setGoalF(e.target.value)} className={sel}>
            <option value="all">All goals</option>
            {c.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            <option value="none">No goal</option>
          </select>
          <select value={personF} onChange={(e) => setPersonF(e.target.value)} className={sel}>
            <option value="me">Me</option>
            <option value="all">Everyone</option>
            {c.people.filter((p) => p !== c.myName).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 text-[11px] text-slate-500">
            <CalendarDays size={12} />
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 w-[110px] bg-transparent text-[11px] focus:outline-none" title="From" />
            –
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 w-[110px] bg-transparent text-[11px] focus:outline-none" title="To" />
          </span>
        </div>
        {adding && <NewTaskForm c={c} onDone={() => setAdding(false)} />}
        <div className="mt-3 space-y-2">
          {list.map((t, i) => <TaskRow key={t.id} t={t} n={i + 1} c={c} />)}
          {!list.length && <p className="py-6 text-center text-sm text-slate-400">No tasks here. Press "Add task".</p>}
        </div>
      </Card>
    </div>
  );
}

function NewTaskForm({ c, onDone, goalId, defaultDue }: { c: Ctx; onDone?: () => void; goalId?: string; defaultDue?: string }) {
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState(goalId ?? '');
  const [who, setWho] = useState(c.myName);
  const [due, setDue] = useState(defaultDue ?? '');
  const save = () => {
    if (!title.trim()) return;
    void c.addTask({ title: title.trim(), goal_id: goal || null, assignee: who, due_date: due || null });
    setTitle('');
    if (!goalId) onDone?.();
  };
  const inp = 'h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs focus:border-violet-400 focus:outline-none';
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${goalId ? '' : 'mt-3 rounded-xl border border-dashed border-orange-300 bg-orange-50/40 p-2'}`}>
      <input autoFocus={!goalId} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        placeholder={goalId ? '+ Add step' : 'What needs to be done?'} className={`${inp} min-w-0 flex-1 ${goalId ? 'border-dashed' : ''}`} />
      {!goalId && (
        <select value={goal} onChange={(e) => setGoal(e.target.value)} className={inp}>
          <option value="">No goal</option>
          {c.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
      )}
      <select value={who} onChange={(e) => setWho(e.target.value)} className={`${inp} max-w-[130px]`} title="Who does it">
        {c.people.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inp} title="Due date" />
      <button type="button" onClick={save} className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white hover:bg-orange-600" title="Add"><Plus size={15} /></button>
    </div>
  );
}

// ------------------------------------------------------------------ Goals
function monthsBetween(start: string | null, end: string | null): { key: string; label: string; first: string; last: string }[] {
  const s = start ? new Date(`${start}T00:00:00`) : new Date();
  const e = end ? new Date(`${end}T00:00:00`) : new Date(s.getFullYear(), s.getMonth() + 2, 1);
  const out = [];
  const d = new Date(s.getFullYear(), s.getMonth(), 1);
  while (d <= e && out.length < 12) {
    const y = d.getFullYear(), m = d.getMonth();
    const pad = (n: number) => String(n).padStart(2, '0');
    out.push({ key: `${y}-${pad(m + 1)}`, label: d.toLocaleDateString('en-GB', { month: 'short' }), first: `${y}-${pad(m + 1)}-01`, last: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}` });
    d.setMonth(m + 1);
  }
  return out;
}

function GoalsTab({ c }: { c: Ctx }) {
  const [adding, setAdding] = useState(false);
  const [refOpen, setRefOpen] = useState(true);
  const yearGoals = c.lines.filter((l) => l.kind === 'year_goal');
  return (
    <div>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">Goals</h2>
          <p className="text-xs text-slate-500">Up to {MAX_GOALS} goals at a time</p>
        </div>
        <button type="button" disabled={c.goals.length >= MAX_GOALS} onClick={() => setAdding(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-40" title={c.goals.length >= MAX_GOALS ? `Finish or delete a goal first (${MAX_GOALS} at a time)` : 'Add a goal'}>
          <span className="flex h-4 w-4 items-center justify-center rounded bg-orange-500"><Plus size={11} /></span> New Goal
        </button>
      </div>

      {yearGoals.length > 0 && (
        <div className="mb-3 rounded-2xl border border-orange-200 bg-orange-50/70 p-3.5">
          <button type="button" onClick={() => setRefOpen((v) => !v)} className="flex w-full items-center gap-1.5 text-[12px] font-bold text-orange-600">
            <Eye size={13} /> Reference · This year's goals <span className="flex-1" />{refOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {refOpen && <ol className="mt-2 space-y-1 pl-1">{yearGoals.map((l, i) => <li key={l.id} className="text-[12.5px] font-semibold text-slate-800"><span className="mr-1 text-orange-500">{i + 1}.</span>{l.body}</li>)}</ol>}
        </div>
      )}

      {adding && <GoalForm c={c} onClose={() => setAdding(false)} />}
      <div className="space-y-3">
        {c.goals.map((g, i) => <GoalCard key={g.id} g={g} n={i + 1} c={c} />)}
        {!c.goals.length && !adding && <Card><p className="py-4 text-center text-sm text-slate-400">No goals yet. Press "New Goal".</p></Card>}
      </div>
    </div>
  );
}

function GoalForm({ c, onClose, goal }: { c: Ctx; onClose: () => void; goal?: Goal }) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const [title, setTitle] = useState(goal?.title ?? '');
  const [who, setWho] = useState(goal?.assignee || c.myName);
  const [start, setStart] = useState(goal?.start_date ?? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`);
  const [end, setEnd] = useState(goal?.end_date ?? (() => { const e = new Date(now.getFullYear(), now.getMonth() + 3, 0); return `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}`; })());
  const inp = 'h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:border-violet-400 focus:outline-none';
  const save = () => {
    if (!title.trim()) return;
    if (end && start && end < start) { window.alert('The end date must be after the start date.'); return; }
    void c.saveGoal({ id: goal?.id, title: title.trim(), assignee: who, start_date: start || null, end_date: end || null });
    onClose();
  };
  return (
    <Card className="mb-3 border-orange-200">
      <div className="grid gap-2 sm:grid-cols-[1fr_150px_140px_140px]">
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} placeholder="Goal (e.g. Market study with presentation)" className={inp} />
        <select value={who} onChange={(e) => setWho(e.target.value)} className={inp}>{c.people.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inp} title="Start" />
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inp} title="End" />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={save} className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-600">{goal ? 'Save goal' : 'Add goal'}</button>
      </div>
    </Card>
  );
}

function GoalCard({ g, n, c }: { g: Goal; n: number; c: Ctx }) {
  const [open, setOpen] = useState(n === 1);
  const [editing, setEditing] = useState(false);
  const steps = c.tasks.filter((t) => t.goal_id === g.id);
  const done = steps.filter((t) => t.done).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const months = useMemo(() => monthsBetween(g.start_date, g.end_date), [g.start_date, g.end_date]);
  const thisMonth = todayISO().slice(0, 7);
  if (editing) return <GoalForm c={c} goal={g} onClose={() => setEditing(false)} />;
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-black text-white shadow">{n}</span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[15px] font-bold text-slate-900">{g.title}</p>
          <p className="text-[11px] text-slate-500">{g.assignee} · {fmtFull(g.start_date)} – {fmtFull(g.end_date)} · {done}/{steps.length} steps done</p>
        </button>
        <Initials name={g.assignee} />
        <span className="w-10 text-right text-sm font-extrabold text-orange-500">{pct}%</span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-slate-400">{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-orange-400" style={{ width: `${pct}%` }} /></div>
      {open && (
        <>
          <div className="mt-2 flex justify-end gap-3">
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800"><Pencil size={11} /> Edit Goal</button>
            <button type="button" onClick={() => void c.deleteGoal(g.id)} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-red-500"><Trash2 size={11} /> Delete</button>
          </div>
          <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
            {months.map((m, mi) => {
              const inMonth = steps.filter((t) => (t.due_date ? t.due_date.slice(0, 7) === m.key : mi === 0));
              const isNow = m.key === thisMonth;
              return (
                <div key={m.key} className={`w-[230px] shrink-0 rounded-xl border p-2.5 ${isNow ? 'border-orange-400 bg-orange-50/40' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">{m.label}</span>
                    {isNow && <span className="rounded-full bg-orange-400 px-2 py-0.5 text-[10px] font-bold text-white">This month</span>}
                    <span className="flex-1" /><ChevronRight size={13} className="text-slate-400" />
                  </div>
                  <div className="space-y-1.5">
                    {inMonth.map((t) => (
                      <div key={t.id} className="group flex items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 shadow-sm">
                        <Check1 done={t.done} onToggle={() => void c.editTask(t.id, { done: !t.done })} />
                        <InlineText value={t.title} onSave={(v) => v && void c.editTask(t.id, { title: v })} className={`min-w-0 flex-1 truncate text-[12px] font-semibold ${t.done ? 'text-slate-400 line-through' : 'text-slate-800'}`} />
                        {t.due_date && <span className={`text-[10px] font-bold ${!t.done && t.due_date < todayISO() ? 'text-red-500' : 'text-slate-400'}`}>{fmtDay(t.due_date)}</span>}
                        <Initials name={t.assignee} />
                        <button type="button" onClick={() => void c.deleteTask(t.id)} className="text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><X size={11} /></button>
                      </div>
                    ))}
                    {!inMonth.length && <p className="text-[11px] text-slate-400">No steps yet</p>}
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-1.5">
                      <NewTaskForm c={c} goalId={g.id} defaultDue={isNow ? todayISO() : m.last} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ Mission & Vision
function ListBlock({ c, kind, placeholder, accent }: { c: Ctx; kind: Line['kind']; placeholder: string; accent: string }) {
  const items = c.lines.filter((l) => l.kind === kind);
  return (
    <div className="ml-2 space-y-2 border-l-2 pl-4" style={{ borderColor: `${accent}55` }}>
      {items.map((l) => (
        <div key={l.id} className="group relative flex items-start gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm">
          <span className="absolute -left-4 top-1/2 h-0.5 w-3" style={{ background: `${accent}55` }} />
          <InlineText value={l.body} onSave={(v) => (v ? void c.editLine(l.id, v) : void c.deleteLine(l.id))} className="min-w-0 flex-1 text-[13px] font-semibold text-slate-800" />
          <button type="button" onClick={() => void c.deleteLine(l.id)} className="text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100" title="Delete"><Trash2 size={13} /></button>
        </div>
      ))}
      <AddLine placeholder={placeholder} onAdd={(v) => void c.addLine(kind, v)} />
    </div>
  );
}

function YearLabel({ year, color, onSave }: { year: number; color: string; onSave: (y: number) => void }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="h-3 w-3 rounded-full" style={{ background: color }} />
      <InlineText value={String(year)} onSave={(v) => { const y = Number(v); if (y >= 2000 && y <= 2200) onSave(y); }} className="text-xl font-black" />
      <span className="text-[11px] font-semibold text-slate-500">by 31 Dec {year}</span>
    </div>
  );
}

function StatementCard({ title, value, onSave, tone }: { title: string; value: string; onSave: (v: string) => void; tone: 'teal' | 'orange' }) {
  const cls = tone === 'teal' ? 'border-emerald-200 from-emerald-50 to-teal-50 text-emerald-600' : 'border-orange-200 from-orange-50 to-amber-50 text-orange-600';
  return (
    <div className={`mb-4 rounded-2xl border bg-gradient-to-br p-4 shadow-sm ${cls}`}>
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider"><span>{title}</span><span className="inline-flex items-center gap-1 text-[10px] normal-case opacity-80"><Pencil size={10} /> click to edit</span></div>
      <InlineText value={value} onSave={onSave} multiline placeholder={`Write your ${title.toLowerCase()} here…`} className="block text-center text-[13.5px] leading-relaxed text-slate-800" />
    </div>
  );
}

function MissionTab({ c }: { c: Ctx }) {
  const mission = c.statements.find((s) => s.kind === 'mission');
  const vision = c.statements.find((s) => s.kind === 'vision');
  const year = mission?.target_year ?? new Date().getFullYear();
  const vision3y = c.lines.filter((l) => l.kind === 'vision3y');
  const [refOpen, setRefOpen] = useState(true);
  return (
    <div>
      <StatementCard title="Mission statement" tone="teal" value={mission?.body ?? ''} onSave={(v) => void c.saveStatement('mission', { body: v })} />
      <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-white to-orange-50/60 p-4 shadow-sm">
        <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-orange-500">Goals for this year</p>
        <YearLabel year={year} color="#f97316" onSave={(y) => void c.saveStatement('mission', { target_year: y })} />
        {vision3y.length > 0 && (
          <div className="mb-3 ml-2 rounded-xl border border-violet-200 bg-violet-50/70 p-3">
            <button type="button" onClick={() => setRefOpen((v) => !v)} className="flex w-full items-center gap-1.5 text-[12px] font-bold text-violet-600">
              <Eye size={13} /> Reference · 3 years vision ({vision?.target_year ?? new Date().getFullYear() + 3}) <span className="flex-1" />{refOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {refOpen && <ol className="mt-2 space-y-1">{vision3y.map((l, i) => <li key={l.id} className="text-[12.5px] font-semibold text-slate-800"><span className="mr-1 text-violet-500">{i + 1}.</span>{l.body}</li>)}</ol>}
          </div>
        )}
        <ListBlock c={c} kind="year_goal" placeholder="Add a goal for this year" accent="#f97316" />
      </div>
    </div>
  );
}

function VisionTab({ c }: { c: Ctx }) {
  const vision = c.statements.find((s) => s.kind === 'vision');
  const year = vision?.target_year ?? new Date().getFullYear() + 3;
  return (
    <div>
      <StatementCard title="Vision statement" tone="orange" value={vision?.body ?? ''} onSave={(v) => void c.saveStatement('vision', { body: v })} />
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/60 p-4 shadow-sm">
        <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-violet-500">3 years vision</p>
        <YearLabel year={year} color="#8b5cf6" onSave={(y) => void c.saveStatement('vision', { target_year: y })} />
        <ListBlock c={c} kind="vision3y" placeholder="Add to your 3 years vision" accent="#8b5cf6" />
      </div>
    </div>
  );
}
