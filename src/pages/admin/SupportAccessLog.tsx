// Super Admin: which companies the support team opened, and when (support_access_log, 20261205000000_support_team.sql).
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Row { id: string; email: string; company_name: string | null; opened_at: string }

export function SupportAccessLog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!open || rows) return;
    void supabase.from('support_access_log').select('id, email, company_name, opened_at').order('opened_at', { ascending: false }).limit(200)
      .then(({ data, error }) => {
        if (error) { setProblem(/support_access_log|schema cache|does not exist|PGRST205/i.test(error.message) ? 'Run the SQL file 20261205000000_support_team.sql to start the support log.' : error.message); setRows([]); return; }
        setRows((data ?? []) as Row[]);
      });
  }, [open, rows]);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-amber-900">
        <ShieldCheck size={14} className="text-amber-600" /> Support access log
        <span className="font-normal text-amber-800">· every company the support team opened</span>
        <span className="flex-1" />{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="max-h-72 overflow-y-auto border-t border-amber-200 bg-white">
          {problem && <p className="px-3 py-2 text-xs text-amber-800">{problem}</p>}
          {!rows && <p className="px-3 py-3 text-xs text-slate-400">Loading…</p>}
          {rows && !rows.length && !problem && <p className="px-3 py-3 text-xs text-slate-400">The support team has not opened any company yet.</p>}
          {rows && rows.length > 0 && (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="px-3 py-1.5">When</th><th className="px-3 py-1.5">Support person</th><th className="px-3 py-1.5">Company opened</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{new Date(r.opened_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-3 py-1.5 font-semibold text-slate-700">{r.email}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.company_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
