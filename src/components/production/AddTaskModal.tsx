import { useEffect, useState } from 'react';
import { Trash2, User, Wrench } from 'lucide-react';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Card';
import { Time24 } from '@/components/ui/Time24';
import { ymd } from '@/lib/operationPlans';
import { createScheduledTask, updateScheduledTask, deleteScheduledTask, type ScheduledTask } from '@/lib/scheduledTasks';

interface AddTaskModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  initialDate?: string;
  /** Planned page: a task for later. Actual page: a task that was done. */
  initialMode?: 'planned' | 'actual';
  initialTask?: ScheduledTask | null;
  machineOptions?: string[];
  memberOptions?: string[];
}

const QUICK = ['Machine cleaning (5S)', 'Tool preset & offsets', 'Material unloading', 'Gauge calibration', 'Preventive maintenance', 'Deburring & washing', 'Operator training'];

const toMin = (t: string) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** A small form: the task, who or what it is for (a machine or a team member), the day and the time. That is all. */
export function AddTaskModal({ open, onClose, onSaved, initialDate, initialMode = 'planned', initialTask, machineOptions = [], memberOptions = [] }: AddTaskModalProps) {
  const [name, setName] = useState('');
  const [forKind, setForKind] = useState<'machine' | 'member'>('member');
  const [who, setWho] = useState('');
  const [date, setDate] = useState(ymd(new Date()));
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (initialTask) {
      setName(initialTask.task_name || '');
      const isMachine = !!initialTask.machine && !initialTask.member_name;
      setForKind(isMachine ? 'machine' : 'member');
      setWho(isMachine ? initialTask.machine || '' : initialTask.member_name || '');
      setDate(initialTask.task_date || ymd(new Date()));
      setStart(initialTask.start_time || '09:00');
      setEnd(initialTask.end_time || '10:00');
    } else {
      setName(''); setForKind('member'); setWho('');
      setDate(initialDate || ymd(new Date()));
      setStart('09:00'); setEnd('10:00');
    }
  }, [open, initialTask, initialDate]);

  const options = forKind === 'machine' ? machineOptions : memberOptions;

  const save = async () => {
    setError('');
    if (!name.trim()) { setError('Enter the task name.'); return; }
    if (!date) { setError('Choose the day.'); return; }
    if (toMin(end) <= toMin(start)) { setError('The end time must be after the start time.'); return; }
    setSaving(true);
    try {
      const fields = {
        task_name: name.trim(),
        member_name: forKind === 'member' ? who.trim() : '',
        machine: forKind === 'machine' ? who.trim() || undefined : undefined,
        task_date: date, start_time: start, end_time: end,
      };
      let local = false;
      if (initialTask?.id) {
        const r = await updateScheduledTask(initialTask.id, { ...fields, machine: fields.machine ?? '' });
        local = !!r?.local;
      } else {
        const r = await createScheduledTask({ ...fields, mode: initialMode, status: initialMode === 'actual' ? 'Completed' : 'Planned' });
        local = !!r.local;
      }
      if (local) window.alert('Saved on this computer only, because the tasks table has not been created in the database yet. Ask your administrator to run the SQL migration "20261031000000_jd_build_and_scheduled_tasks.sql".');
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!initialTask?.id || !window.confirm(`Delete the task "${initialTask.task_name}"?`)) return;
    setSaving(true);
    try { await deleteScheduledTask(initialTask.id); onSaved?.(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialTask ? 'Edit task' : initialMode === 'actual' ? 'Add task (done)' : 'Add task'}
      size="md"
      footer={
        <div className="flex w-full items-center justify-between">
          <div>{initialTask && <Button variant="secondary" className="!text-red-600 hover:!bg-red-50" onClick={() => void remove()} disabled={saving}><Trash2 size={15} /> Delete</Button>}</div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : initialTask ? 'Update' : 'Save task'}</Button>
          </div>
        </div>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-4">
        <FormField label="Task name" required>
          <input type="text" aria-label="Task name" className={inputClass} placeholder="e.g. Machine cleaning, Tool preset, Quality audit" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </FormField>
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => setName(q)}
              className={`rounded-full border px-2 py-1 text-[11px] ${name === q ? 'border-indigo-400 bg-indigo-100 font-semibold text-indigo-800' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>{q}</button>
          ))}
        </div>

        <FormField label="For">
          <div className="grid grid-cols-2 gap-2">
            <div className="inline-flex overflow-hidden rounded border border-slate-300" role="group" aria-label="Task is for">
              {([{ id: 'member', label: 'Team member', icon: User }, { id: 'machine', label: 'Machine', icon: Wrench }] as const).map((o) => (
                <button key={o.id} type="button" aria-pressed={forKind === o.id} onClick={() => { setForKind(o.id); setWho(''); }}
                  className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold ${forKind === o.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}><o.icon size={13} />{o.label}</button>
              ))}
            </div>
            <div>
              <input type="text" aria-label={forKind === 'machine' ? 'Machine' : 'Team member'} list="add-task-who" className={inputClass} placeholder={forKind === 'machine' ? 'Choose or type a machine' : 'Choose or type a name'} value={who} onChange={(e) => setWho(e.target.value)} />
              <datalist id="add-task-who">{options.map((o) => <option key={o} value={o} />)}</datalist>
            </div>
          </div>
        </FormField>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Day" required>
            <input type="date" aria-label="Day" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="From" required>
            <div className="inline-flex h-[38px] w-full items-center rounded border border-slate-300 bg-white text-sm shadow-sm"><Time24 label="From" value={start} onChange={setStart} /></div>
          </FormField>
          <FormField label="To" required>
            <div className="inline-flex h-[38px] w-full items-center rounded border border-slate-300 bg-white text-sm shadow-sm"><Time24 label="To" value={end} onChange={setEnd} /></div>
          </FormField>
        </div>
        {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
      </form>
    </Modal>
  );
}
