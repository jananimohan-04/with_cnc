import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Super Admin view of the Quotation / Invoice / Delivery Challan profiles: who created each one, how many, and what they hold.
interface Row {
  id: string; kind: 'quotation' | 'invoice' | 'dc'; company_id: string; company_name: string;
  owner_id: string | null; owner_name: string; owner_email: string; owner_role: string;
  org_name: string; gstin: string; has_logo: boolean; has_signature: boolean; sub_companies: number;
  shared: boolean; created_at: string | null; updated_at: string | null;
}
const KIND_LABEL: Record<Row['kind'], string> = { quotation: 'Quotation', invoice: 'Invoice', dc: 'Delivery Challan' };
const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'Super Admin', COMPANY_ADMIN: 'Admin', USER: 'User' };
const when = (v: string | null) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export function ProfilesCreatedPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [company, setCompany] = useState('all');

  useEffect(() => {
    let off = false;
    void (async () => {
      const { data, error } = await supabase.rpc('erp_list_company_profiles' as never);
      if (off) return;
      if (error) { setErr(error.message); setRows([]); } else setRows(Array.isArray(data) ? (data as unknown as Row[]) : []);
    })();
    return () => { off = true; };
  }, []);

  const companies = useMemo(() => [...new Map((rows ?? []).map((r) => [r.company_id, r.company_name])).entries()], [rows]);
  const shown = useMemo(() => (rows ?? []).filter((r) => company === 'all' || r.company_id === company), [rows, company]);
  const creators = useMemo(() => new Set(shown.filter((r) => !r.shared).map((r) => r.owner_id)).size, [shown]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Profiles Created</h2>
          <p className="text-sm text-slate-500">Every admin and user keeps their own Quotation, Invoice and Delivery Challan profile. This shows who created what.</p>
        </div>
        <select value={company} onChange={(e) => setCompany(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">
          <option value="all">All companies</option>
          {companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full bg-orange-50 px-3 py-1 text-orange-700">{shown.length} profile(s)</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{creators} creator(s)</span>
        {(['quotation', 'invoice', 'dc'] as const).map((k) => (
          <span key={k} className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{KIND_LABEL[k]}: {shown.filter((r) => r.kind === k).length}</span>
        ))}
      </div>

      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}. Run the latest SQL file (20261105000000_per_user_document_profiles.sql) in Supabase.</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2">Company</th><th className="px-3 py-2">Created by</th><th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Profile</th><th className="px-3 py-2">Organisation / GSTIN</th><th className="px-3 py-2">Has</th>
              <th className="px-3 py-2">Created</th><th className="px-3 py-2">Last changed</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>}
            {rows !== null && shown.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">No profiles saved yet.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-800">{r.company_name}</td>
                <td className="px-3 py-2">
                  {r.shared ? <span className="text-slate-500">Company-wide (saved before per-user profiles{r.owner_name ? `, by ${r.owner_name}` : ''})</span> : (
                    <><div className="font-medium text-slate-800">{r.owner_name || '—'}</div><div className="text-xs text-slate-500">{r.owner_email}</div></>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{r.shared ? '—' : ROLE_LABEL[r.owner_role] ?? r.owner_role}</td>
                <td className="px-3 py-2"><span className="rounded-md bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">{KIND_LABEL[r.kind]}</span></td>
                <td className="px-3 py-2"><div className="text-slate-800">{r.org_name || '—'}</div><div className="font-mono text-xs text-slate-500">{r.gstin || '—'}</div></td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {[r.has_logo && 'Logo', r.has_signature && 'Signature', r.sub_companies > 0 && `${r.sub_companies} sub-co.`].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{when(r.created_at)}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{when(r.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
