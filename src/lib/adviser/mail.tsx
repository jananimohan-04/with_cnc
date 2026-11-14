// E-mail from the Adviser: each person connects their own account once, the AI drafts an e-mail as a card in the chat, and
// the person checks / edits it and presses Send. Nothing is sent without that click.

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Mail, Send, Trash2, X } from 'lucide-react';
import { serverPost } from './serverAi';

export interface EmailDraft { to: string; cc?: string; subject: string; body: string }
export interface MailInfo { provider: string | null; smtp_host: string; smtp_port: number; smtp_user: string; from_name: string | null; verified_at: string | null; last_error: string | null }

const PROVIDERS = [
  { id: 'gmail', name: 'Gmail / Google Workspace', host: 'smtp.gmail.com', port: 587, pw: 'App password (16 letters)',
    help: 'Google account → Security → turn on 2-Step Verification → App passwords → create one named "Argus" and paste it here.', link: 'https://myaccount.google.com/apppasswords' },
  { id: 'outlook', name: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587, pw: 'Password or app password',
    help: 'Microsoft account → Security → Advanced security → create an app password. For Microsoft 365, IT may need to allow "SMTP AUTH".', link: 'https://account.live.com/proofs/AppPassword' },
  { id: 'zoho', name: 'Zoho Mail', host: 'smtp.zoho.in', port: 587, pw: 'Application-specific password',
    help: 'Zoho Accounts → Security → App Passwords → generate one. Outside India use smtp.zoho.com.', link: 'https://accounts.zoho.in/home#security/app_password' },
  { id: 'other', name: 'Other (company mail)', host: '', port: 587, pw: 'Mailbox password', help: 'Ask your IT / hosting for the outgoing (SMTP) server name and port (587 or 465).', link: '' },
];

// ------------------------------------------------------------------ the connection state (shared by every card)
let cached: { connected: boolean; mail: MailInfo | null; name: string } | null = null;
const EVT = 'argus:adviser-mail';

export function useAdviserMail() {
  const [state, setState] = useState(cached);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const j = await serverPost<{ connected: boolean; mail: MailInfo | null; suggestedName: string }>('/api/adviser-mail/status', {});
      cached = { connected: j.connected, mail: j.mail, name: j.suggestedName || '' };
      setError('');
      window.dispatchEvent(new Event(EVT));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => {
    const h = () => setState(cached);
    window.addEventListener(EVT, h);
    if (!cached) void refresh();
    return () => window.removeEventListener(EVT, h);
  }, [refresh]);
  return { state, error, refresh };
}

// ------------------------------------------------------------------ connect / disconnect form
export function MailConnect({ onClose }: { onClose: () => void }) {
  const { state, refresh } = useAdviserMail();
  const [prov, setProv] = useState(PROVIDERS[0]);
  const [f, setF] = useState({ host: 'smtp.gmail.com', port: '587', user: '', pass: '', from: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (state?.mail) setF((v) => ({ ...v, host: state.mail!.smtp_host, port: String(state.mail!.smtp_port), user: state.mail!.smtp_user, from: state.mail!.from_name ?? '' }));
    else if (state?.name) setF((v) => ({ ...v, from: v.from || state.name }));
  }, [state]);
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await serverPost('/api/adviser-mail/save', { provider: prov.id, host: f.host, port: Number(f.port) || 587, user: f.user, pass: f.pass, from_name: f.from });
      await refresh();
      setMsg({ ok: true, text: 'Connected. The Adviser can now send e-mails from this address after you check them.' });
      setF((v) => ({ ...v, pass: '' }));
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true); setMsg(null);
    try { await serverPost('/api/adviser-mail/remove', {}); await refresh(); setMsg({ ok: true, text: 'Disconnected.' }); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    setBusy(false);
  };
  const input = 'h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none';
  return (
    <div className="border-b border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-xs">
      <div className="mb-2 flex items-center gap-2">
        <Mail size={14} className="text-emerald-700" />
        <span className="flex-1 font-bold text-emerald-900">{state?.connected ? 'Your e-mail is connected' : 'Connect your e-mail'}</span>
        <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-white" title="Close"><X size={14} /></button>
      </div>
      {state?.connected && state.mail && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5">
          <CheckCircle2 size={14} className="text-emerald-600" />
          <span className="min-w-0 flex-1 truncate">Sending as <b>{state.mail.from_name ? `${state.mail.from_name} <${state.mail.smtp_user}>` : state.mail.smtp_user}</b></span>
          <button type="button" disabled={busy} onClick={remove} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50"><Trash2 size={12} />Disconnect</button>
        </div>
      )}
      <div className="mb-1.5 flex flex-wrap gap-1">
        {PROVIDERS.map((p) => (
          <button key={p.id} type="button" onClick={() => { setProv(p); setF((v) => ({ ...v, host: p.host || v.host, port: String(p.port) })); }}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${prov.id === p.id ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400'}`}>{p.name}</button>
        ))}
      </div>
      <p className="mb-1.5 text-[11px] leading-snug text-slate-600">{prov.help} {prov.link && <a href={prov.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 underline">Open <ExternalLink size={10} /></a>}</p>
      <div className="grid grid-cols-2 gap-1.5">
        <input className={input} placeholder="Your e-mail address" value={f.user} onChange={(e) => setF({ ...f, user: e.target.value.trim() })} autoComplete="off" />
        <input className={input} type="password" placeholder={state?.connected ? `${prov.pw} (blank = keep)` : prov.pw} value={f.pass} onChange={(e) => setF({ ...f, pass: e.target.value })} autoComplete="new-password" />
        <input className={input} placeholder="Name shown to receivers" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <div className="flex gap-1.5">
          <input className={input} placeholder="Mail server" value={f.host} onChange={(e) => setF({ ...f, host: e.target.value.trim() })} />
          <input className={`${input} !w-16`} placeholder="Port" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value.replace(/\D/g, '') })} />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" disabled={busy || !f.user} onClick={save}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}{state?.connected ? 'Save changes' : 'Connect'}
        </button>
        <span className="text-[10px] text-slate-500">The password is checked with your mail provider, stored encrypted, and never shown again.</span>
      </div>
      {msg && <p className={`mt-1.5 rounded-md px-2 py-1 ${msg.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ the draft card in the chat
export function EmailCard({ draft, onConnect }: { draft: EmailDraft; onConnect: () => void }) {
  const { state } = useAdviserMail();
  const [d, setD] = useState<EmailDraft>({ to: draft.to || '', cc: draft.cc || '', subject: draft.subject || '', body: draft.body || '' });
  const [phase, setPhase] = useState<'edit' | 'sending' | 'sent'>('edit');
  const [err, setErr] = useState('');
  const send = async () => {
    setPhase('sending'); setErr('');
    try {
      await serverPost('/api/adviser-mail/send', { to: d.to, cc: d.cc, subject: d.subject, body: d.body });
      setPhase('sent');
    } catch (e) {
      setPhase('edit');
      const x = e as Error & { needConnect?: boolean };
      setErr(x.message);
      if (x.needConnect) onConnect();
    }
  };
  const field = 'w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none disabled:bg-slate-50';
  const locked = phase !== 'edit';
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-emerald-200 bg-white text-left">
      <div className="flex items-center gap-1.5 border-b border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-800">
        <Mail size={13} />E-mail draft · check it, then press Send
      </div>
      <div className="space-y-1.5 p-2.5 whitespace-normal">
        <label className="flex items-center gap-2"><span className="w-12 shrink-0 text-[11px] font-semibold text-slate-500">To</span>
          <input className={field} disabled={locked} value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} placeholder="name@company.com (several: separate with commas)" /></label>
        <label className="flex items-center gap-2"><span className="w-12 shrink-0 text-[11px] font-semibold text-slate-500">Cc</span>
          <input className={field} disabled={locked} value={d.cc} onChange={(e) => setD({ ...d, cc: e.target.value })} placeholder="optional" /></label>
        <label className="flex items-center gap-2"><span className="w-12 shrink-0 text-[11px] font-semibold text-slate-500">Subject</span>
          <input className={`${field} font-semibold`} disabled={locked} value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} /></label>
        <textarea className={`${field} min-h-[9rem] leading-relaxed`} disabled={locked} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} />
        {phase === 'sent' ? (
          <p className="flex items-center gap-1.5 rounded-md bg-emerald-100 px-2 py-1.5 text-xs font-bold text-emerald-800"><CheckCircle2 size={14} />Sent to {d.to}{d.cc ? ` (cc ${d.cc})` : ''}</p>
        ) : !state?.connected ? (
          <button type="button" onClick={onConnect} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
            <Mail size={13} />Connect your e-mail to send this
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" disabled={phase === 'sending' || !d.to.trim() || !d.subject.trim() || !d.body.trim()} onClick={send}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {phase === 'sending' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}Send
            </button>
            <span className="truncate text-[10px] text-slate-500">from {state.mail?.smtp_user}</span>
          </div>
        )}
        {err && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{err}</p>}
      </div>
    </div>
  );
}
