// JD Build: job descriptions (role, where it works, who it reports to, what the person does and how they are measured).
// Stored in cnc_job_descriptions; one company's descriptions are invisible to another (row level security, see the migration).
import { supabase } from '@/lib/supabase';

export interface JobDescription {
  id: string;
  title: string;
  department: string;
  employment: string;
  workplace: string;
  location: string;
  reporting_to: string;
  /** "About the role" */
  summary: string;
  responsibilities: string[];
  kpis: string[];
  skills_required: string[];
  qualification: string;
  working_hours: string;
  salary_range: string;
  created_at?: string;
  updated_at?: string;
}

export type JobDescriptionInput = Omit<JobDescription, 'id' | 'created_at' | 'updated_at'>;

export const DEPARTMENTS = ['Operations', 'Production', 'Sales', 'Accounts', 'Stores & Inventory', 'Purchase', 'Quality', 'Maintenance', 'Engineering', 'Dispatch', 'HR & Admin', 'Management'];
export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Intern', 'Freelance'];
export const WORKPLACES = ['Onsite', 'Hybrid', 'Remote'];

export const EMPTY_JD: JobDescriptionInput = {
  title: '', department: 'Operations', employment: 'Full-time', workplace: 'Onsite', location: 'Coimbatore', reporting_to: 'CEO',
  summary: '', responsibilities: [], kpis: [], skills_required: [], qualification: '', working_hours: '', salary_range: '',
};

const TABLE = 'cnc_job_descriptions';

/** Lines of a text box -> a list (blank lines and leading bullets removed). */
export const toLines = (text: string): string[] =>
  String(text ?? '').split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim()).filter(Boolean);
export const fromLines = (list: string[] | null | undefined): string => (Array.isArray(list) ? list : []).join('\n');

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);

function normalise(d: Record<string, any>): JobDescription {
  return {
    id: String(d.id),
    title: String(d.title ?? ''),
    department: String(d.department ?? ''),
    employment: String(d.employment ?? ''),
    workplace: String(d.workplace ?? ''),
    location: String(d.location ?? ''),
    reporting_to: String(d.reporting_to ?? ''),
    summary: String(d.summary ?? ''),
    responsibilities: asList(d.responsibilities),
    kpis: asList(d.kpis),
    skills_required: asList(d.skills_required),
    qualification: String(d.qualification ?? ''),
    working_hours: String(d.working_hours ?? ''),
    salary_range: String(d.salary_range ?? ''),
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

const missing = (e: { code?: string; message?: string }) => e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache|could not find the table/i.test(String(e.message ?? ''));
const explain = (e: { code?: string; message?: string }) => missing(e)
  ? 'The job descriptions table has not been created yet. Ask your administrator to run the SQL migration "20261031000000_jd_build_and_scheduled_tasks.sql" in Supabase.'
  : String(e.message ?? 'Something went wrong.');

const rowOf = (j: JobDescriptionInput) => ({
  title: j.title.trim(), department: j.department.trim() || null, employment: j.employment.trim() || null, workplace: j.workplace.trim() || null,
  location: j.location.trim() || null, reporting_to: j.reporting_to.trim() || null, summary: j.summary.trim() || null,
  responsibilities: j.responsibilities, kpis: j.kpis, skills_required: j.skills_required,
  qualification: j.qualification.trim() || null, working_hours: j.working_hours.trim() || null, salary_range: j.salary_range.trim() || null,
});

export async function fetchJobDescriptions(): Promise<JobDescription[]> {
  const { data, error } = await supabase.from(TABLE as never).select('*').order('updated_at' as never, { ascending: false });
  if (error) throw new Error(explain(error));
  return ((data ?? []) as Record<string, any>[]).map(normalise);
}

export async function createJobDescription(j: JobDescriptionInput): Promise<JobDescription> {
  const { data, error } = await supabase.from(TABLE as never).insert([rowOf(j)] as never).select().single();
  if (error) throw new Error(explain(error));
  return normalise(data as Record<string, any>);
}

export async function updateJobDescription(id: string, j: JobDescriptionInput): Promise<JobDescription> {
  const { data, error } = await supabase.from(TABLE as never).update({ ...rowOf(j), updated_at: new Date().toISOString() } as never).eq('id' as never, id as never).select().single();
  if (error) throw new Error(explain(error));
  return normalise(data as Record<string, any>);
}

export async function deleteJobDescription(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE as never).delete().eq('id' as never, id as never);
  if (error) throw new Error(explain(error));
}

/** The description as plain text (for copying). */
export function jdToText(j: JobDescriptionInput & { title: string }): string {
  const bullets = (l: string[]) => l.map((x) => `  - ${x}`).join('\n');
  const parts = [
    j.title.toUpperCase(),
    [j.department, j.employment, j.workplace, j.location].filter(Boolean).join(' | '),
    j.reporting_to ? `Reports to: ${j.reporting_to}` : '',
    j.working_hours ? `Working hours: ${j.working_hours}` : '',
    j.summary ? `\nABOUT THE ROLE\n${j.summary}` : '',
    j.responsibilities.length ? `\nKEY RESPONSIBILITIES\n${bullets(j.responsibilities)}` : '',
    j.kpis.length ? `\nPERFORMANCE EXPECTATIONS (KPIs)\n${bullets(j.kpis)}` : '',
    j.skills_required.length ? `\nSKILLS REQUIRED\n${bullets(j.skills_required)}` : '',
    j.qualification ? `\nQUALIFICATION & EXPERIENCE\n${j.qualification}` : '',
    j.salary_range ? `\nSALARY RANGE\n${j.salary_range}` : '',
  ];
  return parts.filter((p) => p !== '').join('\n');
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** The description as a printable page (the browser's Print > Save as PDF makes the PDF). */
export function jdToHtml(j: JobDescriptionInput, companyName: string): string {
  const list = (l: string[]) => `<ul>${l.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const sec = (h: string, body: string) => (body ? `<h2>${h}</h2>${body}` : '');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(j.title)} - Job Description</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:36px 44px;font-size:13px;line-height:1.5}
    .co{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700}
    h1{font-size:24px;margin:4px 0 2px}.meta{color:#475569;margin-bottom:6px}
    h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#c2410c;margin:20px 0 6px;border-bottom:1px solid #e2e8f0;padding-bottom:3px}
    ul{margin:4px 0 0 18px;padding:0}li{margin:2px 0}p{margin:4px 0;white-space:pre-wrap}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:2px 24px;margin-top:10px}.grid b{color:#475569;font-weight:600}
    @media print{body{margin:18mm}}
  </style></head><body>
    <div class="co">${esc(companyName)}</div><h1>${esc(j.title)}</h1>
    <div class="meta">Job Description</div>
    <div class="grid">
      ${[['Department', j.department], ['Employment', j.employment], ['Workplace', j.workplace], ['Location', j.location], ['Reports to', j.reporting_to], ['Working hours', j.working_hours]]
        .filter(([, v]) => v).map(([k, v]) => `<div><b>${k}:</b> ${esc(v)}</div>`).join('')}
    </div>
    ${sec('About the role', j.summary ? `<p>${esc(j.summary)}</p>` : '')}
    ${sec('Key responsibilities', j.responsibilities.length ? list(j.responsibilities) : '')}
    ${sec('Performance expectations (KPIs)', j.kpis.length ? list(j.kpis) : '')}
    ${sec('Skills required', j.skills_required.length ? list(j.skills_required) : '')}
    ${sec('Qualification &amp; experience', j.qualification ? `<p>${esc(j.qualification)}</p>` : '')}
    ${sec('Salary range', j.salary_range ? `<p>${esc(j.salary_range)}</p>` : '')}
  </body></html>`;
}
