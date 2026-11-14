import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Card';

// Each company links its OWN Razorpay account. Payment links for Digital Store orders, quotations and invoices are made with it.
// The Key Secret goes to the server only, is stored encrypted and is never shown again.

interface PayInfo { provider: string; key_id: string; verified_at: string | null }

async function payApi(path: string, body: Record<string, unknown>) {
  const sess = await supabase.auth.getSession();
  const r = await fetch(`/api/digital-pay/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (sess.data.session?.access_token ?? '') }, body: JSON.stringify(body) });
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
    <div className="space-y-4 max-w-3xl">
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
