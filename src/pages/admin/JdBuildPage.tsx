import { useCallback, useEffect, useMemo, useState } from 'react';
import { Briefcase, Copy, Check, Edit2, Eye, MapPin, Plus, Printer, Search, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/Card';
import { Modal, inputClass } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import {
  DEPARTMENTS, EMPLOYMENT_TYPES, WORKPLACES, EMPTY_JD,
  createJobDescription, deleteJobDescription, fetchJobDescriptions, fromLines, jdToHtml, jdToText, toLines, updateJobDescription,
  type JobDescription, type JobDescriptionInput,
} from '@/lib/jdBuild';

/** The form works on text boxes (one point per line); they become lists when saved. */
interface Draft {
  title: string; department: string; employment: string; workplace: string; location: string; reporting_to: string;
  summary: string; responsibilities: string; kpis: string; skills: string; qualification: string; working_hours: string; salary_range: string;
}
const toDraft = (j: JobDescriptionInput): Draft => ({
  title: j.title, department: j.department, employment: j.employment, workplace: j.workplace, location: j.location, reporting_to: j.reporting_to,
  summary: j.summary, responsibilities: fromLines(j.responsibilities), kpis: fromLines(j.kpis), skills: fromLines(j.skills_required),
  qualification: j.qualification, working_hours: j.working_hours, salary_range: j.salary_range,
});
const fromDraft = (d: Draft): JobDescriptionInput => ({
  title: d.title.trim(), department: d.department, employment: d.employment, workplace: d.workplace, location: d.location, reporting_to: d.reporting_to,
  summary: d.summary, responsibilities: toLines(d.responsibilities), kpis: toLines(d.kpis), skills_required: toLines(d.skills),
  qualification: d.qualification, working_hours: d.working_hours, salary_range: d.salary_range,
});

const fmtDate = (s?: string) => { try { return s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''; } catch { return ''; } };
const label = 'block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1';
const panel = 'rounded-xl border border-slate-200 bg-slate-50/70 p-4';
const panelTitle = 'mb-2 text-[11px] font-extrabold uppercase tracking-wide text-orange-600';

export function JdBuildPage() {
  const { canDo, company } = useAuth();
  const mayCreate = canDo('jd-build', 'create');
  const mayEdit = canDo('jd-build', 'edit');
  const mayDelete = canDo('jd-build', 'delete');

  const [jds, setJds] = useState<JobDescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('All');
  const [editing, setEditing] = useState<JobDescription | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft(EMPTY_JD));
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<JobDescription | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { setJds(await fetchJobDescriptions()); }
    catch (e) { setLoadError(e instanceof Error ? e.message : String(e)); setJds([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const departments = useMemo(() => ['All', ...Array.from(new Set(jds.map((j) => j.department).filter(Boolean))).sort()], [jds]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jds.filter((j) => (dept === 'All' || j.department === dept)
      && (!q || `${j.title} ${j.department} ${j.location} ${j.reporting_to} ${j.summary}`.toLowerCase().includes(q)));
  }, [jds, search, dept]);

  const openNew = () => { setDraft(toDraft(EMPTY_JD)); setFormError(''); setEditing('new'); };
  const openEdit = (j: JobDescription) => { setDraft(toDraft(j)); setFormError(''); setEditing(j); };
  const duplicate = (j: JobDescription) => { setDraft({ ...toDraft(j), title: `${j.title} (copy)` }); setFormError(''); setEditing('new'); };
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const save = async () => {
    setFormError('');
    if (!draft.title.trim()) { setFormError('Enter the role title.'); return; }
    setSaving(true);
    try {
      if (editing && editing !== 'new') await updateJobDescription(editing.id, fromDraft(draft));
      else await createJobDescription(fromDraft(draft));
      setEditing(null);
      await load();
    } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const remove = async (j: JobDescription) => {
    if (!window.confirm(`Delete the job description "${j.title}"?`)) return;
    try { await deleteJobDescription(j.id); setViewing(null); await load(); }
    catch (e) { window.alert(e instanceof Error ? e.message : String(e)); }
  };

  const print = (j: JobDescription) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentWindow?.document;
    if (!doc || !frame.contentWindow) { frame.remove(); return; }
    doc.open(); doc.write(jdToHtml(j, company?.company_name ?? '')); doc.close();
    setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1500); }, 250);
  };
  const copy = async (j: JobDescription) => {
    try { await navigator.clipboard.writeText(jdToText(j)); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="JD Build"
        description="Create job descriptions: the role, who it reports to, what the person does and how they are measured."
        actions={mayCreate ? <Button variant="primary" onClick={openNew} title="Create JD"><Plus size={16} /> Create JD</Button> : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input aria-label="Search job descriptions" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search role, department, location…"
            className="h-9 w-72 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm" />
        </div>
        <select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
          {departments.map((d) => <option key={d} value={d}>{d === 'All' ? 'All departments' : d}</option>)}
        </select>
        <span className="text-xs text-slate-500">{shown.length} of {jds.length}</span>
      </div>

      {loadError && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{loadError}</div>}
      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {!loading && !loadError && jds.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Briefcase size={28} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-700">No job descriptions yet</p>
          <p className="text-xs text-slate-500">{mayCreate ? 'Press Create JD to write the first one.' : 'Ask an administrator to create one.'}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((j) => (
          <div key={j.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600"><Briefcase size={16} /></span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-bold text-slate-800" title={j.title}>{j.title}</h3>
                <p className="text-xs text-slate-500">{[j.department, j.employment, j.workplace].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
              {j.location && <span className="inline-flex items-center gap-1"><MapPin size={11} />{j.location}</span>}
              {j.reporting_to && <span className="inline-flex items-center gap-1"><Users size={11} />Reports to {j.reporting_to}</span>}
            </div>
            {j.summary && <p className="mt-2 line-clamp-2 text-xs text-slate-600">{j.summary}</p>}
            <p className="mt-2 text-[11px] text-slate-400">{j.responsibilities.length} responsibilities · {j.kpis.length} KPIs · updated {fmtDate(j.updated_at)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5">
              <Button variant="secondary" size="sm" onClick={() => setViewing(j)} title={`View ${j.title}`}><Eye size={13} /> View</Button>
              {mayEdit && <Button variant="secondary" size="sm" onClick={() => openEdit(j)} title={`Edit ${j.title}`}><Edit2 size={13} /> Edit</Button>}
              {mayCreate && <Button variant="secondary" size="sm" onClick={() => duplicate(j)} title={`Duplicate ${j.title}`}><Copy size={13} /> Duplicate</Button>}
              {mayDelete && <Button variant="secondary" size="sm" className="ml-auto !text-red-600 hover:!bg-red-50" onClick={() => void remove(j)} title={`Delete ${j.title}`}><Trash2 size={13} /></Button>}
            </div>
          </div>
        ))}
      </div>

      {/* Create / edit */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing && editing !== 'new' ? 'Edit Job Description' : 'Create New Job Description'}
        subtitle="Configure role requirements, outcomes, and KPIs"
        size="xl"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save JD'}</Button>
          </div>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={label} htmlFor="jd-title">Role title *</label>
              <input id="jd-title" className={inputClass} placeholder="e.g. Executive Assistant, VMC Production Incharge" value={draft.title} onChange={set('title')} autoFocus />
            </div>
            <div>
              <label className={label} htmlFor="jd-dept">Department</label>
              <input id="jd-dept" list="jd-dept-list" className={inputClass} value={draft.department} onChange={set('department')} />
              <datalist id="jd-dept-list">{DEPARTMENTS.map((d) => <option key={d} value={d} />)}</datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <label className={label} htmlFor="jd-emp">Employment</label>
              <select id="jd-emp" className={inputClass} value={draft.employment} onChange={set('employment')}>{EMPLOYMENT_TYPES.map((x) => <option key={x}>{x}</option>)}</select>
            </div>
            <div>
              <label className={label} htmlFor="jd-work">Workplace</label>
              <select id="jd-work" className={inputClass} value={draft.workplace} onChange={set('workplace')}>{WORKPLACES.map((x) => <option key={x}>{x}</option>)}</select>
            </div>
            <div>
              <label className={label} htmlFor="jd-loc">Location</label>
              <input id="jd-loc" className={inputClass} value={draft.location} onChange={set('location')} />
            </div>
            <div>
              <label className={label} htmlFor="jd-rep">Reports to</label>
              <input id="jd-rep" className={inputClass} list="jd-rep-list" value={draft.reporting_to} onChange={set('reporting_to')} />
              <datalist id="jd-rep-list">{['CEO', 'Managing Director', 'General Manager', 'Production Manager', 'Plant Head', 'Accounts Manager', 'Sales Manager'].map((x) => <option key={x} value={x} />)}</datalist>
            </div>
          </div>

          <div className={panel}>
            <p className={panelTitle}>About the role</p>
            <textarea aria-label="About the role" rows={3} className={inputClass} placeholder="Accounts, Payments, Stock, Work plan, Work assignment, Operations." value={draft.summary} onChange={set('summary')} />
          </div>
          <div className={panel}>
            <p className={panelTitle}>Key responsibilities</p>
            <textarea aria-label="Key responsibilities" rows={5} className={inputClass} placeholder={'One point per line\nAccounts, Stock calculation\nWork planning, Work assignment\nCustomer handling'} value={draft.responsibilities} onChange={set('responsibilities')} />
          </div>
          <div className={panel}>
            <p className={panelTitle}>Performance expectations (KPIs)</p>
            <textarea aria-label="Performance expectations" rows={5} className={inputClass} placeholder={'One point per line\nOn time delivery >= 95%\nRejection rate 0%\nReview frequency: Quarterly'} value={draft.kpis} onChange={set('kpis')} />
          </div>
          <div className={panel}>
            <p className={panelTitle}>Skills &amp; qualification</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className={label} htmlFor="jd-skills">Skills required (one per line)</label>
                <textarea id="jd-skills" rows={4} className={inputClass} value={draft.skills} onChange={set('skills')} />
              </div>
              <div className="space-y-3">
                <div>
                  <label className={label} htmlFor="jd-qual">Qualification &amp; experience</label>
                  <input id="jd-qual" className={inputClass} placeholder="e.g. B.E. Mechanical, 3+ years in CNC" value={draft.qualification} onChange={set('qualification')} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={label} htmlFor="jd-hours">Working hours</label>
                    <input id="jd-hours" className={inputClass} placeholder="09:00 AM - 06:00 PM" value={draft.working_hours} onChange={set('working_hours')} />
                  </div>
                  <div>
                    <label className={label} htmlFor="jd-sal">Salary range (optional)</label>
                    <input id="jd-sal" className={inputClass} value={draft.salary_range} onChange={set('salary_range')} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          {formError && <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{formError}</p>}
        </form>
      </Modal>

      {/* View */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.title ?? ''}
        subtitle={viewing ? [viewing.department, viewing.employment, viewing.workplace, viewing.location].filter(Boolean).join(' · ') : ''}
        size="lg"
        footer={viewing ? (
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => print(viewing)}><Printer size={14} /> Print / PDF</Button>
              <Button variant="secondary" onClick={() => void copy(viewing)}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy text'}</Button>
            </div>
            <div className="flex gap-2">
              {mayEdit && <Button variant="secondary" onClick={() => { const j = viewing; setViewing(null); openEdit(j); }}><Edit2 size={14} /> Edit</Button>}
              <Button variant="primary" onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        ) : undefined}
      >
        {viewing && (
          <div className="space-y-4 text-sm text-slate-700">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
              {viewing.reporting_to && <span><b className="text-slate-500">Reports to:</b> {viewing.reporting_to}</span>}
              {viewing.working_hours && <span><b className="text-slate-500">Working hours:</b> {viewing.working_hours}</span>}
              {viewing.salary_range && <span><b className="text-slate-500">Salary:</b> {viewing.salary_range}</span>}
            </div>
            {viewing.summary && <section><h4 className={panelTitle}>About the role</h4><p className="whitespace-pre-wrap">{viewing.summary}</p></section>}
            {viewing.responsibilities.length > 0 && <section><h4 className={panelTitle}>Key responsibilities</h4><ul className="list-disc space-y-0.5 pl-5">{viewing.responsibilities.map((x, i) => <li key={i}>{x}</li>)}</ul></section>}
            {viewing.kpis.length > 0 && <section><h4 className={panelTitle}>Performance expectations (KPIs)</h4><ul className="list-disc space-y-0.5 pl-5">{viewing.kpis.map((x, i) => <li key={i}>{x}</li>)}</ul></section>}
            {viewing.skills_required.length > 0 && <section><h4 className={panelTitle}>Skills required</h4><ul className="list-disc space-y-0.5 pl-5">{viewing.skills_required.map((x, i) => <li key={i}>{x}</li>)}</ul></section>}
            {viewing.qualification && <section><h4 className={panelTitle}>Qualification &amp; experience</h4><p>{viewing.qualification}</p></section>}
          </div>
        )}
      </Modal>
    </div>
  );
}
