import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Mail, Send, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Card';

// Step by step: each company links its OWN e-mail account. Order confirmations to customers are sent from it.
// The password goes to the server only, is stored encrypted and is never shown again.

interface Props { storeId: string | null; payLink: string; payNote: string; onSaved: () => void }
interface MailInfo { provider: string | null; smtp_host: string; smtp_port: number; smtp_user: string; from_name: string | null; bcc: string | null; verified_at: string | null; last_error: string | null }

const PROVIDERS = [
  { id: 'gmail', name: 'Gmail / Google Workspace', host: 'smtp.gmail.com', port: 587, pwLabel: 'App password (16 letters)',
    steps: ['Open your Google account → Security and turn on 2-Step Verification (if it is not on).', 'Open the App passwords page (button below), type the name "Digital Store" and press Create.', 'Google shows a 16-letter password. Copy it; you paste it in the next step.'],
    link: 'https://myaccount.google.com/apppasswords' },
  { id: 'outlook', name: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587, pwLabel: 'Password or app password',
    steps: ['Sign in to your Microsoft account → Security → Advanced security options.', 'Turn on two-step verification, then choose "Create a new app password".', 'Copy the password. If your company uses Microsoft 365, ask your IT admin to allow "SMTP AUTH" for this mailbox.'],
    link: 'https://account.live.com/proofs/AppPassword' },
  { id: 'zoho', name: 'Zoho Mail', host: 'smtp.zoho.in', port: 587, pwLabel: 'Application-specific password',
    steps: ['Sign in to Zoho Accounts → Security → App Passwords.', 'Generate a new password named "Digital Store".', 'Copy it. (Outside India use smtp.zoho.com as the server in the next step.)'],
    link: 'https://accounts.zoho.in/home#security/app_password' },
  { id: 'other', name: 'Other (company mail / hosting)', host: '', port: 587, pwLabel: 'Mailbox password',
    steps: ['Ask whoever manages your e-mail (hosting or IT) for: the outgoing mail (SMTP) server name, the port (usually 587 or 465), and the mailbox password.', 'Type them in the next step.'], link: '' },
];

async function mailApi(path: string, body: Record<string, unknown>) {
  const sess = await supabase.auth.getSession();
  const r = await fetch(`/api/digital-mail/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (sess.data.session?.access_token ?? '') }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `The request failed (${r.status}).`);
  return j;
}

export function DigitalStoreMailSetup({ storeId, payLink, payNote, onSaved }: Props) {
  const { company, profile } = useAuth();
  const companyId = company?.id ?? '';
  const [info, setInfo] = useState<MailInfo | null | undefined>(undefined);
  const [step, setStep] = useState(1);
  const [provider, setProvider] = useState('gmail');
  const [f, setF] = useState({ host: 'smtp.gmail.com', port: '587', user: '', pass: '', from: '', bcc: '' });
  const [testTo, setTestTo] = useState('');
  const [pay, setPay] = useState({ link: payLink, note: payNote });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const prov = PROVIDERS.find(p => p.id === provider)!;

  const load = useCallback(async () => {
    try { const j = await mailApi('status', { company_id: companyId }); setInfo(j.mail ?? null); if (j.mail) setStep(0); }
    catch (e) { setInfo(null); setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPay({ link: payLink, note: payNote }); }, [payLink, payNote]);
  useEffect(() => { if (!testTo && profile?.email) setTestTo(profile.email); }, [profile?.email, testTo]);

  const pick = (id: string) => { const p = PROVIDERS.find(x => x.id === id)!; setProvider(id); setF(v => ({ ...v, host: p.host, port: String(p.port) })); };
  const run = async (label: string, fn: () => Promise<void>) => { setBusy(label); setMsg(null); try { await fn(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } setBusy(''); };

  const connect = () => run('connect', async () => {
    await mailApi('save', { company_id: companyId, provider, host: f.host, port: Number(f.port), user: f.user, pass: f.pass, from_name: f.from, bcc: f.bcc });
    setF(v => ({ ...v, pass: '' }));
    setMsg({ ok: true, text: 'Connected. The mail provider accepted the sign-in.' });
    await load(); setStep(4);
  });
  const sendTest = () => run('test', async () => { const j = await mailApi('test', { company_id: companyId, to: testTo }); setMsg({ ok: true, text: `Test e-mail sent to ${j.to}. Check that inbox (and spam).` }); });
  const disconnect = () => run('remove', async () => {
    if (!window.confirm('Disconnect this e-mail account? Customers will not get order e-mails until you link one again.')) return;
    await mailApi('remove', { company_id: companyId }); setInfo(null); setStep(1); setMsg(null);
  });
  const savePay = () => run('pay', async () => {
    if (!storeId) throw new Error('Create the store first (Rack settings).');
    const link = pay.link.trim();
    if (link && !/^https?:\/\//i.test(link)) throw new Error('The payment link must start with https://');
    const up = await supabase.from('digital_stores').update({ payment_link: link || null, payment_note: pay.note.trim() || null, updated_at: new Date().toISOString() }).eq('id', storeId);
    if (up.error) throw new Error(/payment_link/.test(up.error.message) ? 'Apply the database migration 20261110020000_digital_store_payment_mail.sql first.' : up.error.message);
    setMsg({ ok: true, text: 'Payment link saved.' }); onSaved();
  });

  const input = 'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm';
  const label = 'block text-xs font-bold text-slate-600 mb-1';
  const stepsList = [['1', 'Provider'], ['2', 'Get password'], ['3', 'Connect'], ['4', 'Payment link']] as const;

  if (info === undefined) return <div className="p-6 flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="animate-spin" size={16} /> Loading…</div>;
  if (!companyId) return <div className="p-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl">Choose a company in the top bar first. Each company links its own e-mail.</div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-slate-600">Customers who order from the Digital Store get a confirmation e-mail with the product, the amount and your payment link. It is sent from <b>this company's own e-mail address</b>. Each company links its own.</p>

      {msg && <div className={`text-sm rounded-lg px-3 py-2 border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      {info && step === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="text-emerald-600 mt-0.5" size={20} />
            <div className="flex-1">
              <div className="font-extrabold text-slate-900">E-mail linked: {info.smtp_user}</div>
              <div className="text-xs text-slate-600">{info.smtp_host}:{info.smtp_port}{info.from_name ? ` · sender name "${info.from_name}"` : ''}{info.bcc ? ` · copy to ${info.bcc}` : ''}{info.verified_at ? ` · checked ${new Date(info.verified_at).toLocaleString('en-IN')}` : ''}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[220px]"><label className={label}>Send a test e-mail to</label><input className={input} value={testTo} onChange={e => setTestTo(e.target.value)} /></div>
            <Button onClick={sendTest} disabled={!!busy} icon={<Send size={13} />}>{busy === 'test' ? 'Sending…' : 'Send test'}</Button>
            <Button variant="secondary" onClick={() => { setStep(1); setMsg(null); }}>Change account</Button>
            <Button variant="danger" onClick={disconnect} disabled={!!busy} icon={<Trash2 size={13} />}>Disconnect</Button>
          </div>
          <div className="border-t border-emerald-200 pt-3">
            <div className="text-xs font-extrabold uppercase tracking-wide text-slate-600 mb-2">Payment link in the e-mail</div>
            <PayFields pay={pay} setPay={setPay} input={input} label={label} />
            <div className="mt-2"><Button onClick={savePay} disabled={!!busy}>{busy === 'pay' ? 'Saving…' : 'Save payment link'}</Button></div>
          </div>
        </div>
      )}

      {step > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {stepsList.map(([n, name]) => (
              <button key={n} type="button" onClick={() => (Number(n) < step || (info && Number(n) !== 3)) && setStep(Number(n))} className={`flex items-center gap-2 text-xs font-bold px-2.5 py-1.5 rounded-full border ${Number(n) === step ? 'bg-orange-600 text-white border-orange-600' : Number(n) < step ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${Number(n) === step ? 'bg-white/25' : 'bg-white'}`}>{Number(n) < step ? '✓' : n}</span>{name}
              </button>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-3">
              <div className="font-extrabold text-slate-900">Step 1 · Which e-mail will send the orders?</div>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {PROVIDERS.map(p => (
                  <button key={p.id} type="button" onClick={() => pick(p.id)} className={`text-left rounded-xl border-2 p-3 transition ${provider === p.id ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="flex items-center gap-2 font-bold text-sm text-slate-900"><Mail size={15} className="text-orange-600" />{p.name}</div>
                  </button>
                ))}
              </div>
              <Button onClick={() => setStep(2)}>Next</Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="font-extrabold text-slate-900">Step 2 · Get the password for {prov.name}</div>
              <p className="text-xs text-slate-500">This is a special password for the Digital Store, so your normal password stays private.</p>
              <ol className="space-y-2">
                {prov.steps.map((t, i) => <li key={i} className="flex gap-2.5 text-sm text-slate-700"><span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>{t}</li>)}
              </ol>
              {prov.link && <a href={prov.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-orange-700 hover:underline"><ExternalLink size={14} /> Open the page</a>}
              <div className="flex gap-2"><Button variant="secondary" onClick={() => setStep(1)}>Back</Button><Button onClick={() => setStep(3)}>I have the password</Button></div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="font-extrabold text-slate-900">Step 3 · Enter your details and connect</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2"><label className={label}>Your e-mail address (orders are sent from this)</label><input className={input} type="email" placeholder="shop@yourcompany.com" value={f.user} onChange={e => setF({ ...f, user: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className={label}>{prov.pwLabel}</label><input className={input} type="password" autoComplete="new-password" placeholder={info ? 'Leave empty to keep the saved password' : ''} value={f.pass} onChange={e => setF({ ...f, pass: e.target.value })} /></div>
                <div><label className={label}>Sender name shown to the customer</label><input className={input} placeholder="e.g. Hexa Technologies" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></div>
                <div><label className={label}>Send me a copy at (optional)</label><input className={input} type="email" value={f.bcc} onChange={e => setF({ ...f, bcc: e.target.value })} /></div>
                {provider === 'other' && <>
                  <div><label className={label}>Outgoing mail server</label><input className={input} placeholder="mail.yourdomain.com" value={f.host} onChange={e => setF({ ...f, host: e.target.value })} /></div>
                  <div><label className={label}>Port</label><input className={input} inputMode="numeric" value={f.port} onChange={e => setF({ ...f, port: e.target.value })} /></div>
                </>}
              </div>
              <p className="text-[11px] text-slate-500">When you press Connect we sign in to the mail server to check the password. It is stored encrypted on the server and is never shown again.</p>
              <div className="flex gap-2"><Button variant="secondary" onClick={() => setStep(2)}>Back</Button><Button onClick={connect} disabled={!!busy}>{busy === 'connect' ? 'Checking…' : 'Connect'}</Button></div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="font-extrabold text-slate-900">Step 4 · Payment link (optional)</div>
              <PayFields pay={pay} setPay={setPay} input={input} label={label} />
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => run('pay', async () => { await savePay2(); setStep(0); })} disabled={!!busy}>{busy === 'pay' ? 'Saving…' : 'Save and finish'}</Button>
                <Button variant="secondary" onClick={() => setStep(0)}>Skip</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  async function savePay2() {
    if (!storeId) throw new Error('Create the store first (Rack settings).');
    const link = pay.link.trim();
    if (link && !/^https?:\/\//i.test(link)) throw new Error('The payment link must start with https://');
    const up = await supabase.from('digital_stores').update({ payment_link: link || null, payment_note: pay.note.trim() || null, updated_at: new Date().toISOString() }).eq('id', storeId);
    if (up.error) throw new Error(/payment_link/.test(up.error.message) ? 'Apply the database migration 20261110020000_digital_store_payment_mail.sql first.' : up.error.message);
    setMsg({ ok: true, text: 'Saved. Customers who order will now get the e-mail.' }); onSaved();
  }
}

function PayFields({ pay, setPay, input, label }: { pay: { link: string; note: string }; setPay: (p: { link: string; note: string }) => void; input: string; label: string }) {
  return (
    <div className="space-y-2">
      <div><label className={label}>Payment link</label><input className={input} placeholder="https://pay.example.com/your-page?amt={amount}&ref={order_no}" value={pay.link} onChange={e => setPay({ ...pay, link: e.target.value })} />
        <p className="text-[11px] text-slate-500 mt-1">Your payment page address (Razorpay, PayU, a UPI page…). <code>{'{amount}'}</code> and <code>{'{order_no}'}</code> are filled in for each order. Leave empty and the e-mail says "we will contact you with payment details".</p></div>
      <div><label className={label}>Message in the e-mail (optional)</label><input className={input} placeholder="e.g. Please pay within 24 hours to confirm your order." value={pay.note} onChange={e => setPay({ ...pay, note: e.target.value })} /></div>
    </div>
  );
}
