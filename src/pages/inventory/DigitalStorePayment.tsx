import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Card';
import { API_BASE } from '@/retail/api';

// Each company links its OWN Razorpay account. Payment links for Digital Store orders, quotations and invoices are made with it.
// The Key Secret goes to the server only, is stored encrypted and is never shown again.

interface PayInfo { provider: string; key_id: string; verified_at: string | null }

async function payApi(path: string, body: Record<string, unknown>) {
  const sess = await supabase.auth.getSession();
  const r = await fetch(`${API_BASE}/api/digital-pay/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (sess.data.session?.access_token ?? '') }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `The request failed (${r.status}).`);
  return j;
}

export function DigitalStorePayment() {
  const { company } = useAuth();
  const companyId = company?.id ?? '';
  const [info, setInfo] = useState<PayInfo | null | undefined>(undefined);
  const [changing, setChanging] = useState(false);
  const [f, setF] = useState({ keyId: '', secret: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try { const j = await payApi('status', { company_id: companyId }); setInfo(j.payment ?? null); }
    catch (e) { setInfo(null); setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  const connect = async () => {
    setBusy(true); setMsg(null);
    try {
      const j = await payApi('save', { company_id: companyId, key_id: f.keyId, key_secret: f.secret });
      setF({ keyId: '', secret: '' }); setChanging(false);
      setMsg({ ok: true, text: `Razorpay connected (${j.mode} mode). Payment links are now created with your account.` });
      await load();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    setBusy(false);
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect Razorpay? Payment links will fall back to the fixed link in E-mail setup (if any).')) return;
    setBusy(true); setMsg(null);
    try { await payApi('remove', { company_id: companyId }); setInfo(null); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    setBusy(false);
  };

  const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm';
  const label = 'block text-xs font-bold text-slate-600 mb-1';
  if (info === undefined) return <div className="p-6 flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="animate-spin" size={16} /> Loading…</div>;
  if (!companyId) return <div className="p-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl">Choose a company in the top bar first. Each company links its own Razorpay account.</div>;
  const form = !info || changing;

  return (
    <div className="space-y-4 max-w-5xl">
      <p className="text-sm text-slate-600">Payment method: <b>Razorpay</b>. After a customer orders in the Digital Store they are taken straight to a payment page for the exact amount. The same account makes the <b>Pay now</b> links you share from quotations and invoices (WhatsApp or e-mail). The money goes to <b>this company's own Razorpay account</b>.</p>
      {msg && <div className={`text-sm rounded-lg px-3 py-2 border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      {info && !changing && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 flex items-start gap-3">
          <CheckCircle2 className="text-emerald-600 mt-0.5" size={20} />
          <div className="flex-1">
            <div className="font-extrabold text-slate-900">Razorpay linked: {info.key_id} <span className="text-xs font-bold ml-1 px-1.5 py-0.5 rounded bg-white border border-emerald-200 text-emerald-700">{info.key_id.startsWith('rzp_live_') ? 'LIVE' : 'TEST'}</span></div>
            <div className="text-xs text-slate-600">{info.verified_at ? `Checked ${new Date(info.verified_at).toLocaleString('en-IN')}` : ''}{info.key_id.startsWith('rzp_test_') ? ' · Test mode: no real money moves. Switch to the Live keys when you are ready.' : ''}</div>
            <div className="flex gap-2 mt-3">
              <Button onClick={() => setChanging(true)} disabled={busy}>Change keys</Button>
              <button type="button" onClick={disconnect} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Trash2 size={14} /> Disconnect</button>
            </div>
          </div>
        </div>
      )}

      {info && !changing && <PaymentsReceived companyId={companyId} />}

      {form && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="font-extrabold text-slate-900">Link your Razorpay account</div>
          <ol className="space-y-2">
            {['Sign in to Razorpay (dashboard.razorpay.com). If you have no account yet, create one; it is free to start in Test mode.',
              'Open Settings → Keys and press Generate Key.',
              'Copy the Key ID (starts with rzp_live_ or rzp_test_) and the Key Secret. Razorpay shows the secret only once.',
              'Paste both below and press Connect. We check them with Razorpay before saving.'].map((t, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-slate-700"><span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>{t}</li>
            ))}
          </ol>
          <a href="https://dashboard.razorpay.com/app/website-app-settings/api-keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-700 hover:underline"><ExternalLink size={13} /> Open Razorpay key settings</a>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={label}>Key ID</label><input className={input} value={f.keyId} onChange={e => setF(v => ({ ...v, keyId: e.target.value.trim() }))} placeholder="rzp_live_xxxxxxxxxxxx" autoComplete="off" /></div>
            <div><label className={label}>Key Secret</label><input className={input} type="password" value={f.secret} onChange={e => setF(v => ({ ...v, secret: e.target.value.trim() }))} placeholder={info ? 'Leave empty to keep the saved secret' : 'Paste the secret'} autoComplete="new-password" /></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={connect} disabled={busy || !f.keyId}>{busy ? 'Checking with Razorpay…' : 'Connect Razorpay'}</Button>
            {info && <button type="button" onClick={() => setChanging(false)} className="text-xs font-bold px-3 py-2 rounded-lg border border-slate-300 text-slate-600">Cancel</button>}
          </div>
        </div>
      )}
    </div>
  );
}

interface PayRow { id: string; url: string; status: string; amount: number; amountPaid: number; document: string; customer: string; createdAt: string | null; payments: { id: string; amount: number; method: string; at: string | null }[] }
interface PaySummary { links: number; paid: number; received: number; waiting: number; waitingAmount: number }
const rupees = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const STATUS: Record<string, [string, string]> = {
  paid: ['Paid', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
  partially_paid: ['Part paid', 'bg-amber-50 text-amber-700 border-amber-200'],
  created: ['Waiting', 'bg-slate-50 text-slate-600 border-slate-200'],
  expired: ['Expired', 'bg-slate-50 text-slate-400 border-slate-200'],
  cancelled: ['Cancelled', 'bg-red-50 text-red-600 border-red-200'],
};

// Every payment link made with this company's Razorpay account (quotations, invoices, Digital Store orders) and what was paid on it.
// Payments on a quotation / invoice link are also recorded on that invoice in the Retail Store automatically.
function PaymentsReceived({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<PayRow[] | null>(null);
  const [sum, setSum] = useState<PaySummary | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'paid' | 'waiting'>('all');
  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try { const j = await payApi('payments', { company_id: companyId }); setRows(j.rows || []); setSum(j.summary || null); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setRows((r) => r ?? []); }
    setBusy(false);
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);
  const shown = (rows || []).filter((r) => filter === 'all' || (filter === 'paid' ? r.amountPaid > 0 : r.status === 'created' || r.status === 'partially_paid'));
  const tiles: [string, string, string][] = sum ? [
    ['Payments received', String(sum.paid), 'text-emerald-700'],
    ['Amount received', rupees(sum.received), 'text-emerald-700'],
    ['Waiting for payment', String(sum.waiting), 'text-amber-700'],
    ['Amount waiting', rupees(sum.waitingAmount), 'text-amber-700'],
  ] : [];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-extrabold text-slate-900">Payments</div>
        <span className="text-xs text-slate-500">From your Razorpay account. A payment on a quotation or invoice link is also marked on that invoice in the Retail Store.</span>
        <button type="button" onClick={() => void load()} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
      {err && <div className="text-sm rounded-lg px-3 py-2 border bg-red-50 border-red-200 text-red-700">{err}</div>}
      {sum && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {tiles.map(([k, v, tone]) => (
            <div key={k} className="rounded-lg border border-slate-200 px-3 py-2"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{k}</div><div className={`text-lg font-black tabular-nums ${tone}`}>{v}</div></div>
          ))}
        </div>
      )}
      {rows === null ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="animate-spin" size={16} /> Reading payments from Razorpay…</div>
      ) : (
        <>
          <div className="flex gap-1">
            {([['all', `All (${rows.length})`], ['paid', 'Paid'], ['waiting', 'Waiting']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={`text-xs font-bold px-2.5 py-1 rounded-full border ${filter === k ? 'bg-orange-600 text-white border-orange-600' : 'border-slate-300 text-slate-600'}`}>{l}</button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">{rows.length ? 'Nothing here.' : 'No payment links yet. One is made when a quotation or invoice is e-mailed or shared, or when a Digital Store order is placed.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Created</th><th className="py-2 pr-3">For</th><th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3 text-right">Amount</th><th className="py-2 pr-3 text-right">Paid</th><th className="py-2 pr-3">Status</th><th className="py-2">Link</th>
                </tr></thead>
                <tbody>
                  {shown.map((r) => {
                    const [label, tone] = STATUS[r.status] || [r.status, 'bg-slate-50 text-slate-600 border-slate-200'];
                    return (
                      <tr key={r.id} className="border-b border-slate-100 align-top">
                        <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                        <td className="py-2 pr-3 text-slate-800">{r.document || '—'}</td>
                        <td className="py-2 pr-3 text-slate-700">{r.customer || '—'}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{rupees(r.amount)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums font-bold text-emerald-700">
                          {r.amountPaid > 0 ? rupees(r.amountPaid) : '—'}
                          {r.payments.map((p) => <div key={p.id} className="text-[10px] font-normal text-slate-500">{p.method ? p.method.toUpperCase() + ' · ' : ''}{p.at ? new Date(p.at).toLocaleDateString('en-IN') : ''} · {p.id}</div>)}
                        </td>
                        <td className="py-2 pr-3"><span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${tone}`}>{label}</span></td>
                        <td className="py-2"><a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-orange-700 hover:underline"><ExternalLink size={12} /> Open</a></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
