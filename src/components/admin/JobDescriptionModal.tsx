import { useState, useEffect } from 'react';
import { Briefcase, Check, Copy, Edit2, Eye, MapPin, Printer, Users } from 'lucide-react';
import { Button } from '@/components/ui/Card';
import { Modal, inputClass } from '@/components/ui/Modal';
import {
  DEPARTMENTS, EMPLOYMENT_TYPES, WORKPLACES, EMPTY_JD,
  createJobDescription, updateJobDescription, fromLines, toLines, jdToHtml, jdToText,
  type JobDescription, type JobDescriptionInput,
} from '@/lib/jdBuild';

export interface JdDraft {
  title: string;
  department: string;
  employment: string;
  workplace: string;
  location: string;
  reporting_to: string;
  summary: string;
  responsibilities: string;
  kpis: string;
  skills: string;
  qualification: string;
  working_hours: string;
  salary_range: string;
}

export const toDraft = (j: JobDescriptionInput): JdDraft => ({
  title: j.title || '',
  department: j.department || 'Operations',
  employment: j.employment || 'Full-time',
  workplace: j.workplace || 'Onsite',
  location: j.location || 'Coimbatore',
  reporting_to: j.reporting_to || 'CEO',
  summary: j.summary || '',
  responsibilities: fromLines(j.responsibilities),
  kpis: fromLines(j.kpis),
  skills: fromLines(j.skills_required),
  qualification: j.qualification || '',
  working_hours: j.working_hours || '',
  salary_range: j.salary_range || '',
});

export const fromDraft = (d: JdDraft): JobDescriptionInput => ({
  title: d.title.trim(),
  department: d.department,
  employment: d.employment,
  workplace: d.workplace,
  location: d.location,
  reporting_to: d.reporting_to,
  summary: d.summary,
  responsibilities: toLines(d.responsibilities),
  kpis: toLines(d.kpis),
  skills_required: toLines(d.skills),
  qualification: d.qualification,
  working_hours: d.working_hours,
  salary_range: d.salary_range,
});

export const jdLabelClass = 'block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1';
export const jdPanelClass = 'rounded-xl border border-slate-200 bg-slate-50/70 p-4';
export const jdPanelTitleClass = 'mb-2 text-[11px] font-extrabold uppercase tracking-wide text-orange-600';

/**
 * Reusable JD form fields matching the exact layout and panels from JD Build.
 */
export function JobDescriptionFormFields({
  draft,
  onChange,
}: {
  draft: JdDraft;
  onChange: (key: keyof JdDraft, value: string) => void;
}) {
  const set = (k: keyof JdDraft) => (e: { target: { value: string } }) => onChange(k, e.target.value);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className={jdLabelClass} htmlFor="jd-field-title">Role title *</label>
          <input
            id="jd-field-title"
            className={inputClass}
            placeholder="e.g. Executive Assistant, VMC Production Incharge"
            value={draft.title}
            onChange={set('title')}
            autoFocus
          />
        </div>
        <div>
          <label className={jdLabelClass} htmlFor="jd-field-dept">Department</label>
          <input
            id="jd-field-dept"
            list="jd-field-dept-list"
            className={inputClass}
            value={draft.department}
            onChange={set('department')}
          />
          <datalist id="jd-field-dept-list">
            {DEPARTMENTS.map((d) => <option key={d} value={d} />)}
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className={jdLabelClass} htmlFor="jd-field-emp">Employment</label>
          <select
            id="jd-field-emp"
            className={inputClass}
            value={draft.employment}
            onChange={set('employment')}
          >
            {EMPLOYMENT_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label className={jdLabelClass} htmlFor="jd-field-work">Workplace</label>
          <select
            id="jd-field-work"
            className={inputClass}
            value={draft.workplace}
            onChange={set('workplace')}
          >
            {WORKPLACES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label className={jdLabelClass} htmlFor="jd-field-loc">Location</label>
          <input
            id="jd-field-loc"
            className={inputClass}
            value={draft.location}
            onChange={set('location')}
          />
        </div>
        <div>
          <label className={jdLabelClass} htmlFor="jd-field-rep">Reports to</label>
          <input
            id="jd-field-rep"
            className={inputClass}
            list="jd-field-rep-list"
            value={draft.reporting_to}
            onChange={set('reporting_to')}
          />
          <datalist id="jd-field-rep-list">
            {['CEO', 'Managing Director', 'General Manager', 'Production Manager', 'Plant Head', 'Accounts Manager', 'Sales Manager'].map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </div>
      </div>

      <div className={jdPanelClass}>
        <p className={jdPanelTitleClass}>About the role</p>
        <textarea
          aria-label="About the role"
          rows={3}
          className={inputClass}
          placeholder="Accounts, Payments, Stock, Work plan, Work assignment, Operations."
          value={draft.summary}
          onChange={set('summary')}
        />
      </div>

      <div className={jdPanelClass}>
        <p className={jdPanelTitleClass}>Key responsibilities</p>
        <textarea
          aria-label="Key responsibilities"
          rows={5}
          className={inputClass}
          placeholder={'One point per line\nAccounts, Stock calculation\nWork planning, Work assignment\nCustomer handling'}
          value={draft.responsibilities}
          onChange={set('responsibilities')}
        />
      </div>

      <div className={jdPanelClass}>
        <p className={jdPanelTitleClass}>Performance expectations (KPIs)</p>
        <textarea
          aria-label="Performance expectations"
          rows={5}
          className={inputClass}
          placeholder={'One point per line\nOn time delivery >= 95%\nRejection rate 0%\nReview frequency: Quarterly'}
          value={draft.kpis}
          onChange={set('kpis')}
        />
      </div>

      <div className={jdPanelClass}>
        <p className={jdPanelTitleClass}>Skills &amp; qualification</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={jdLabelClass} htmlFor="jd-field-skills">Skills required (one per line)</label>
            <textarea
              id="jd-field-skills"
              rows={4}
              className={inputClass}
              value={draft.skills}
              onChange={set('skills')}
            />
          </div>
          <div className="space-y-3">
            <div>
              <label className={jdLabelClass} htmlFor="jd-field-qual">Qualification &amp; experience</label>
              <input
                id="jd-field-qual"
                className={inputClass}
                placeholder="e.g. B.E. Mechanical, 3+ years in CNC"
                value={draft.qualification}
                onChange={set('qualification')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={jdLabelClass} htmlFor="jd-field-hours">Working hours</label>
                <input
                  id="jd-field-hours"
                  className={inputClass}
                  placeholder="09:00 AM - 06:00 PM"
                  value={draft.working_hours}
                  onChange={set('working_hours')}
                />
              </div>
              <div>
                <label className={jdLabelClass} htmlFor="jd-field-sal">Salary range (optional)</label>
                <input
                  id="jd-field-sal"
                  className={inputClass}
                  value={draft.salary_range}
                  onChange={set('salary_range')}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The exact "CREATE NEW JOB DESCRIPTION" / "Edit Job Description" modal.
 */
export function JobDescriptionModal({
  open,
  onClose,
  initialData,
  onSaved,
  zIndex = 60,
  title,
  subtitle = 'Configure role requirements, outcomes, and KPIs',
}: {
  open: boolean;
  onClose: () => void;
  initialData?: JobDescription | JobDescriptionInput | null;
  onSaved: (jd: JobDescription) => void;
  zIndex?: number;
  title?: string;
  subtitle?: string;
}) {
  const [draft, setDraft] = useState<JdDraft>(() => toDraft(initialData || EMPTY_JD));
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(toDraft(initialData || EMPTY_JD));
      setFormError('');
    }
  }, [open, initialData]);

  const handleFieldChange = (key: keyof JdDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setFormError('');
    if (!draft.title.trim()) {
      setFormError('Enter the role title.');
      return;
    }
    setSaving(true);
    try {
      let saved: JobDescription;
      if (initialData && 'id' in initialData && initialData.id) {
        saved = await updateJobDescription(initialData.id, fromDraft(draft));
      } else {
        saved = await createJobDescription(fromDraft(draft));
      }
      onSaved(saved);
      onClose();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const modalTitle = title ?? (initialData && 'id' in initialData && initialData.id ? 'Edit Job Description' : 'CREATE NEW JOB DESCRIPTION');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      subtitle={subtitle}
      size="xl"
      zIndex={zIndex}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save JD'}
          </Button>
        </div>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
        <JobDescriptionFormFields draft={draft} onChange={handleFieldChange} />
        {formError && (
          <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}

/**
 * Modal to view a Job Description in detail with Print/PDF and Copy text.
 */
export function JobDescriptionViewModal({
  open,
  onClose,
  jd,
  onEdit,
  companyName = '',
  zIndex = 60,
}: {
  open: boolean;
  onClose: () => void;
  jd: JobDescription | null;
  onEdit?: (jd: JobDescription) => void;
  companyName?: string;
  zIndex?: number;
}) {
  const [copied, setCopied] = useState(false);

  if (!jd) return null;

  const handlePrint = () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentWindow?.document;
    if (!doc || !frame.contentWindow) {
      frame.remove();
      return;
    }
    doc.open();
    doc.write(jdToHtml(jd, companyName));
    doc.close();
    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1500);
    }, 250);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jdToText(jd));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={jd.title}
      subtitle={[jd.department, jd.employment, jd.workplace, jd.location].filter(Boolean).join(' · ')}
      size="lg"
      zIndex={zIndex}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handlePrint}>
              <Printer size={14} /> Print / PDF
            </Button>
            <Button variant="secondary" onClick={() => void handleCopy()}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy text'}
            </Button>
          </div>
          <div className="flex gap-2">
            {onEdit && (
              <Button
                variant="secondary"
                onClick={() => {
                  onClose();
                  onEdit(jd);
                }}
              >
                <Edit2 size={14} /> Edit
              </Button>
            )}
            <Button variant="primary" onClick={onClose}>Close</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-sm text-slate-700">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          {jd.reporting_to && <span><b className="text-slate-500">Reports to:</b> {jd.reporting_to}</span>}
          {jd.working_hours && <span><b className="text-slate-500">Working hours:</b> {jd.working_hours}</span>}
          {jd.salary_range && <span><b className="text-slate-500">Salary:</b> {jd.salary_range}</span>}
        </div>
        {jd.summary && (
          <section>
            <h4 className={jdPanelTitleClass}>About the role</h4>
            <p className="whitespace-pre-wrap">{jd.summary}</p>
          </section>
        )}
        {jd.responsibilities.length > 0 && (
          <section>
            <h4 className={jdPanelTitleClass}>Key responsibilities</h4>
            <ul className="list-disc space-y-0.5 pl-5">
              {jd.responsibilities.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </section>
        )}
        {jd.kpis.length > 0 && (
          <section>
            <h4 className={jdPanelTitleClass}>Performance expectations (KPIs)</h4>
            <ul className="list-disc space-y-0.5 pl-5">
              {jd.kpis.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </section>
        )}
        {jd.skills_required.length > 0 && (
          <section>
            <h4 className={jdPanelTitleClass}>Skills required</h4>
            <ul className="list-disc space-y-0.5 pl-5">
              {jd.skills_required.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </section>
        )}
        {jd.qualification && (
          <section>
            <h4 className={jdPanelTitleClass}>Qualification &amp; experience</h4>
            <p>{jd.qualification}</p>
          </section>
        )}
      </div>
    </Modal>
  );
}
