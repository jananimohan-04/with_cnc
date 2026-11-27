// Today's List and To Do List (from Overview > Clarity) in the pop-up that opens from the top-bar date/time,
// like the calendar/notification panel when you click the clock on a laptop. Tick tasks done, move them to or from
// today, or add a new one, without leaving the page. The full lists stay in Clarity.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ExternalLink, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { createScheduledTask } from '@/lib/scheduledTasks';
import { linkNote, markScheduled } from '@/lib/clarityScheduling';

type View = 'today' | 'todo';
interface Task { id: string; owner_id: string; title: string; assignee: string; due_date: string | null; today: string | null; done: boolean; sort_order: number }

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDay = (s: string | null) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

export function ClarityQuickLists({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const me = profile?.id ?? '';
  const myName = profile?.full_name || profile?.email || 'Me';
  const navigate = useNavigate();
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem('clarity.quick') as View) || 'today'; } catch { return 'today'; } });
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [problem, setProblem] = useState('');
  const [draft, setDraft] = useState('');
  const [draftDate, setDraftDate] = useState(todayISO);

  const pick = (v: View) => { setView(v); try { localStorage.setItem('clarity.quick', v); } catch { /* not saved */ } };

  const load = useCallback(async () => {
    if (!me) return;
    const r = await supabase.from('clarity_tasks').select('id, owner_id, title, assignee, due_date, today, done, sort_order')
      .order('sort_order').order('created_at').limit(1000);
    if (r.error) { setProblem('Clarity is not set up yet.'); setTasks([]); return; }
    setTasks((r.data ?? []) as Task[]);
  }, [me]);
  useEffect(() => { void load(); }, [load]);

  const day = todayISO();
  // same rules as Clarity: Today = mine or created by me; To Do ("Me") = given to me
  const all = tasks ?? [];
  const todo = all.filter((t) => t.assignee === myName || (t.owner_id === me && !t.assignee));
  const list = view === 'today'
    ? all.filter((t) => t.today === day && (t.assignee === myName || t.owner_id === me))
    : [...todo.filter((t) => !t.done), ...todo.filter((t) => t.done)];
  const done = list.filter((t) => t.done).length;

  const edit = async (id: string, patch: Partial<Task>) => {
    const before = (tasks ?? []).find((x) => x.id === id);
    setTasks((xs) => (xs ?? []).map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const full = { ...patch, ...(patch.done !== undefined ? { done_at: patch.done ? new Date().toISOString() : null } : {}) };
    const r = await supabase.from('clarity_tasks').update(full).eq('id', id);
    if (r.error) { setProblem('Could not save. Please try again.'); void load(); return; }
    // ticked: the task moves from the Planned to the Actual timeline in Production > Scheduling
    if (before && patch.done !== undefined) {
      try { await markScheduled({ ...before, ...patch }, myName); } catch { setProblem('Saved here, but the scheduling calendar could not be updated.'); }
    }
  };
  const add = async () => {
    const title = draft.trim();
    if (!title || !me) return;
    const date = draftDate || (view === 'today' ? day : '');
    setDraft('');
    const row = { owner_id: me, assignee: myName, title, sort_order: tasks?.length ?? 0, due_date: date || null, ...(view === 'today' ? { today: day } : {}) };
    const r = await supabase.from('clarity_tasks').insert(row).select('id, owner_id, title, assignee, due_date, today, done, sort_order').single();
    if (r.error) { setProblem('Could not add the task. Please try again.'); return; }
    const t = r.data as Task;
    setTasks((xs) => [...(xs ?? []), t]);
    // with a date it also goes on the Planned timeline (Production > Scheduling) as a task
    if (date) {
      try {
        await createScheduledTask({ task_name: title, member_name: myName, task_date: date, start_time: '09:00', end_time: '10:00', mode: 'planned', status: 'Planned', notes: linkNote(t.id) });
      } catch { setProblem('Saved here, but it could not be put on the scheduling calendar.'); }
    }
  };
  const openClarity = () => {
    try { localStorage.setItem('clarity.tab', view); } catch { /* not saved */ }
    onClose();
    navigate('/clarity');
  };

  const pct = list.length ? Math.round((done / list.length) * 100) : 0;

  return (
    <div className="w-[320px] rounded-xl border border-slate-200 bg-white shadow-2xl animate-scale-in overflow-hidden">
      <div className="p-1.5 border-b border-slate-100 bg-slate-50/50">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-100">
          {(['today', 'todo'] as View[]).map((v) => (
            <button key={v} type="button" onClick={() => pick(v)}
              className={`rounded-lg py-2 text-[11px] font-extrabold uppercase tracking-wider transition ${view === v ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>
              {v === 'today' ? "Today's List" : 'To Do List'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 py-2.5">
        <div className="mb-1 flex justify-between text-[10px] font-semibold text-slate-500">
          <span>{view === 'today' ? new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : `${list.length - done} open`}</span>
          <span className="text-slate-700">{done}/{list.length} done · {pct}%</span>
        </div>
        <div className="h-1 rounded-full bg-slate-100"><div className="h-1 rounded-full bg-gradient-to-r from-violet-500 to-orange-400 transition-all" style={{ width: `${pct}%` }} /></div>

        <div className="mt-2 max-h-[240px] space-y-1 overflow-y-auto pr-0.5">
          {tasks === null && <p className="py-4 text-center text-xs text-slate-400">Loading…</p>}
          {tasks !== null && !list.length && (
            <p className="py-4 text-center text-xs text-slate-400">{view === 'today' ? "Nothing on today's list yet." : 'No tasks yet.'}</p>
          )}
          {list.map((t) => {
            const onToday = t.today === day;
            const late = !t.done && t.due_date && t.due_date < day;
            return (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5 hover:border-slate-200">
                <button type="button" onClick={() => void edit(t.id, { done: !t.done })} title={t.done ? 'Mark as not done' : 'Mark as done'}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition ${t.done ? 'border-green-500 bg-green-500' : 'border-slate-300 hover:border-green-500'}`}>
                  {t.done && <Check size={10} className="text-white" />}
                </button>
                <span className={`min-w-0 flex-1 truncate text-[12px] font-semibold ${t.done ? 'text-slate-400 line-through' : 'text-slate-800'}`} title={t.title}>{t.title}</span>
                {t.due_date && <span className={`shrink-0 text-[10px] font-bold ${late ? 'text-red-500' : 'text-slate-400'}`}>{fmtDay(t.due_date)}</span>}
                <button type="button" onClick={() => void edit(t.id, { today: onToday ? null : day })} title={onToday ? "Remove from Today's List" : "Put on Today's List"}
                  className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${onToday ? 'border-orange-400 bg-orange-500 text-white' : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
                  {onToday ? '✓ Today' : '+ Today'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
            placeholder={view === 'today' ? '+ Add a task for today' : '+ Add a task'}
            className="h-8 min-w-0 flex-1 rounded-lg border border-dashed border-slate-300 px-2 text-xs placeholder:text-slate-400 focus:border-violet-400 focus:outline-none" />
          <input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} title="Date (shows on the Planned timeline in Scheduling)"
            className="h-8 w-[112px] shrink-0 rounded-lg border border-slate-200 px-1.5 text-[11px] text-slate-600 focus:border-violet-400 focus:outline-none" />
          <button type="button" onClick={() => void add()} title="Add" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white hover:bg-orange-600"><Plus size={14} /></button>
        </div>
        {problem && <p className="mt-1.5 text-[11px] font-semibold text-red-600">{problem}</p>}

        <button type="button" onClick={openClarity} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-700">
          Open in Clarity <ExternalLink size={11} />
        </button>
      </div>
    </div>
  );
}
