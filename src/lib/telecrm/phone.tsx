// Tele CRM browser phone: one per signed-in telecaller, mounted for the whole app so an incoming call rings on any page.
// It does nothing (and loads nothing) unless Tele CRM is allowed for the person, the provider is configured on the
// server, the company has a connected number and the person is an active telecaller.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRightLeft, Mic, MicOff, Phone, PhoneIncoming, PhoneOff, PhoneOutgoing, UserPlus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { createPhoneDevice, type PhoneCallHandle, type PhoneDevice } from './adapters';
import { fmtDuration, phoneKey, teleApi, toE164, type TeleStatus } from './api';

export interface CallContact { id: string; name: string; phone: string; contact_type: string; status: string; assigned_user_id: string | null; notes?: string }
export interface LiveCall {
  direction: 'inbound' | 'outbound';
  number: string;
  callRef: string;
  contact: CallContact | null;
  phase: 'ringing' | 'connecting' | 'live' | 'ended';
  startedAt: number | null;
  muted: boolean;
  transferred: boolean;
  endedReason?: string;
}
type PhoneState = 'off' | 'starting' | 'ready' | 'error';

interface PhoneApi {
  state: PhoneState;
  error: string;
  status: TeleStatus | null;
  call: LiveCall | null;
  canCallOut: boolean;
  dial: (number: string, contact?: CallContact | null) => Promise<void>;
  accept: () => void;
  reject: () => void;
  hangup: () => void;
  toggleMute: () => void;
  transfer: (toUserId: string) => Promise<void>;
  dismiss: () => void;
  restart: () => void;
}

const Ctx = createContext<PhoneApi | null>(null);
export const usePhone = () => useContext(Ctx);

async function contactByPhone(num: string): Promise<CallContact | null> {
  const key = phoneKey(num);
  if (key.length < 6) return null;
  const { data } = await supabase.from('tele_contacts').select('id,name,phone,contact_type,status,assigned_user_id,notes').eq('phone_key', key).order('updated_at', { ascending: false }).limit(1);
  return ((data ?? [])[0] as CallContact | undefined) ?? null;
}

export function TelePhoneProvider({ children }: { children: ReactNode }) {
  const { profile, company, canView } = useAuth();
  const allowed = !!profile?.id && !!company?.id && canView('tele-crm');
  const [state, setState] = useState<PhoneState>('off');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<TeleStatus | null>(null);
  const [call, setCall] = useState<LiveCall | null>(null);
  const [canCallOut, setCanCallOut] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const device = useRef<PhoneDevice | null>(null);
  const handle = useRef<PhoneCallHandle | null>(null);
  const callRef = useRef<LiveCall | null>(null);
  callRef.current = call;

  const patch = (p: Partial<LiveCall>) => setCall((c) => (c ? { ...c, ...p } : c));

  const bind = useCallback((h: PhoneCallHandle) => {
    handle.current = h;
    h.on('accept', () => patch({ phase: 'live', startedAt: Date.now() }));
    h.on('ringing', () => patch({ phase: 'connecting' }));
    const end = (reason: string) => () => {
      if (handle.current === h) handle.current = null;
      setCall((c) => (c ? { ...c, phase: 'ended', endedReason: c.phase === 'live' ? '' : reason } : c));
    };
    h.on('disconnect', end('Call ended'));
    h.on('cancel', end('Caller hung up'));
    h.on('reject', end('Call rejected'));
    h.on('error', (e) => { setError((e as { message?: string })?.message || 'Call error'); end('Call failed')(); });
  }, []);

  // start / stop the browser phone
  useEffect(() => {
    let dead = false;
    let refresh: ReturnType<typeof setInterval> | null = null;
    async function start() {
      if (!allowed) { setState('off'); return; }
      try {
        const st = await teleApi.status();
        if (dead) return;
        setStatus(st);
        const agent = st.me.agent;
        if (!st.configured || !st.browserCalling || !st.numbers.length || !agent || (!agent.can_call_out && !agent.can_receive)) { setState('off'); return; }
        setState('starting');
        const tok = await teleApi.token();
        if (dead) return;
        const dev = await createPhoneDevice(tok.provider, tok.token, { edge: tok.edge });
        if (dead) { dev.destroy(); return; }
        device.current = dev;
        setCanCallOut(tok.canCallOut);
        dev.on('error', (e) => setError(e?.message || 'Phone error'));
        dev.on('tokenWillExpire', () => { void teleApi.token().then((t) => dev.updateToken(t.token)).catch(() => {}); });
        dev.on('incoming', (h: PhoneCallHandle) => {
          if (callRef.current && callRef.current.phase !== 'ended') { h.reject(); return; }   // already on a call
          const number = h.params.callerNumber || h.params.From || '';
          setCall({ direction: 'inbound', number, callRef: h.params.callRef || '', contact: null, phase: 'ringing', startedAt: null, muted: false, transferred: h.params.transfer === '1' });
          bind(h);
          void contactByPhone(number).then((c) => patch({ contact: c }));
          try { if (Notification?.permission === 'granted') new Notification('Incoming call', { body: number }); } catch { /* not supported */ }
        });
        if (tok.canReceive) await dev.register();
        setState('ready'); setError('');
        refresh = setInterval(() => { void teleApi.token().then((t) => dev.updateToken(t.token)).catch(() => {}); }, 50 * 60000);
      } catch (e) {
        if (dead) return;
        setState('error'); setError(e instanceof Error ? e.message : String(e));
      }
    }
    void start();
    return () => {
      dead = true;
      if (refresh) clearInterval(refresh);
      try { device.current?.destroy(); } catch { /* gone */ }
      device.current = null;
    };
  }, [allowed, company?.id, epoch, bind]);

  const dial = useCallback(async (number: string, contact?: CallContact | null) => {
    const to = toE164(number);
    if (!to) throw new Error('Enter a valid phone number (with country code for numbers outside India).');
    if (!device.current || state !== 'ready') throw new Error('The phone is not ready.');
    if (callRef.current && callRef.current.phase !== 'ended') throw new Error('Finish the current call first.');
    const c = contact ?? (await contactByPhone(to));
    setCall({ direction: 'outbound', number: to, callRef: '', contact: c, phase: 'connecting', startedAt: null, muted: false, transferred: false });
    try {
      const h = await device.current.connect({ To: to, ...(c?.id ? { contactId: c.id } : {}) });
      bind(h);
    } catch (e) {
      patch({ phase: 'ended', endedReason: e instanceof Error ? e.message : 'Call failed' });
    }
  }, [state, bind]);

  /** Our call record for the live call (the server created it; outgoing calls don't carry its id). */
  const findCallId = useCallback(async (): Promise<string> => {
    const c = callRef.current;
    if (!c) return '';
    if (c.callRef) return c.callRef;
    const { data } = await supabase.from('tele_calls').select('id').eq('agent_user_id', profile?.id ?? '').eq('customer_number', c.number).order('started_at', { ascending: false }).limit(1);
    const id = (data ?? [])[0]?.id as string | undefined;
    if (id) patch({ callRef: id });
    return id ?? '';
  }, [profile?.id]);

  const api = useMemo<PhoneApi>(() => ({
    state, error, status, call, canCallOut,
    dial,
    accept: () => { handle.current?.accept(); patch({ phase: 'connecting' }); },
    reject: () => { handle.current?.reject(); patch({ phase: 'ended', endedReason: 'Call rejected' }); },
    hangup: () => { handle.current?.hangup(); },
    toggleMute: () => { const h = handle.current; if (!h) return; const on = !h.isMuted(); h.mute(on); patch({ muted: on }); },
    transfer: async (toUserId: string) => {
      const id = await findCallId();
      if (!id) throw new Error('This call is not saved yet; try again in a moment.');
      await teleApi.transfer(id, toUserId);
    },
    dismiss: () => setCall(null),
    restart: () => setEpoch((n) => n + 1),
  }), [state, error, status, call, canCallOut, dial, findCallId]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {call && <CallWindow api={api} findCallId={findCallId} />}
    </Ctx.Provider>
  );
}

// ----------------------------------------------------------------------------- the floating call window
function useTicker(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => { if (!on) return; const t = setInterval(() => set((n) => n + 1), 1000); return () => clearInterval(t); }, [on]);
}

const OUTCOMES = ['Interested', 'Call back', 'Appointment booked', 'Information given', 'Not interested', 'Wrong number', 'No answer'];

function CallWindow({ api, findCallId }: { api: PhoneApi; findCallId: () => Promise<string> }) {
  const call = api.call!;
  const { profile } = useAuth();
  useTicker(call.phase === 'live');
  const [showTransfer, setShowTransfer] = useState(false);
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // wrap-up
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState('');
  const [followAt, setFollowAt] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('Enquiry');

  useEffect(() => {
    if (!showTransfer) return;
    void (async () => {
      const { data: ag } = await supabase.from('tele_agents').select('user_id').eq('active', true).eq('can_receive', true);
      const ids = (ag ?? []).map((a) => a.user_id as string).filter((x) => x !== profile?.id);
      if (!ids.length) { setTeam([]); return; }
      const { data: us } = await supabase.from('company_users').select('id, full_name, email').in('id', ids);
      setTeam((us ?? []).map((u) => ({ id: u.id as string, name: (u.full_name as string) || (u.email as string) })));
    })();
  }, [showTransfer, profile?.id]);

  const secs = call.startedAt ? (Date.now() - call.startedAt) / 1000 : 0;
  const who = call.contact?.name || call.number || 'Unknown caller';
  const tone = call.phase === 'ringing' ? 'from-emerald-500 to-teal-600' : call.phase === 'ended' ? 'from-slate-600 to-slate-700' : 'from-orange-500 to-orange-600';

  const saveWrapUp = async () => {
    setBusy(true); setMsg('');
    try {
      let contactId = call.contact?.id ?? '';
      if (!contactId && newName.trim()) {
        const { data, error } = await supabase.from('tele_contacts').insert({ name: newName.trim(), phone: call.number, phone_key: phoneKey(call.number), contact_type: newType, assigned_user_id: profile?.id ?? null, status: 'New' }).select('id').single();
        if (error) throw error;
        contactId = data.id as string;
      }
      const callId = await findCallId();
      if (note.trim() || outcome) {
        const { error } = await supabase.from('tele_call_notes').insert({ call_id: callId || null, contact_id: contactId || null, body: note.trim(), outcome });
        if (error) throw error;
      }
      if (followAt && contactId) {
        const due = new Date(followAt).toISOString();
        const { error } = await supabase.from('tele_followups').insert({ contact_id: contactId, call_id: callId || null, assigned_user_id: profile?.id ?? null, due_at: due, note: note.trim() || outcome || 'Follow-up call' });
        if (error) throw error;
        await supabase.from('tele_contacts').update({ next_followup_at: due, updated_at: new Date().toISOString() }).eq('id', contactId);
      }
      api.dismiss();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed z-[70] right-3 bottom-3 sm:right-5 sm:bottom-5 w-[min(360px,calc(100vw-24px))] rounded-2xl bg-white shadow-[0_18px_50px_rgba(15,23,42,0.35)] border border-slate-200 overflow-hidden" role="dialog" aria-label="Call">
      <div className={`bg-gradient-to-br ${tone} text-white px-4 py-3`}>
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider opacity-90">
          <span className="inline-flex items-center gap-1.5">
            {call.direction === 'inbound' ? <PhoneIncoming size={13} /> : <PhoneOutgoing size={13} />}
            {call.phase === 'ringing' ? (call.transferred ? 'Transferred call' : 'Incoming call') : call.phase === 'connecting' ? (call.direction === 'outbound' ? 'Calling…' : 'Connecting…') : call.phase === 'live' ? 'On call' : 'Call ended'}
          </span>
          {call.phase === 'live' && <span className="tabular-nums text-sm normal-case tracking-normal">{fmtDuration(secs)}</span>}
          {call.phase === 'ended' && <button onClick={api.dismiss} aria-label="Close" className="opacity-80 hover:opacity-100"><X size={15} /></button>}
        </div>
        <div className="mt-1.5 text-lg font-bold leading-tight truncate">{who}</div>
        <div className="text-xs opacity-90 truncate">
          {call.contact ? `${call.number} · ${call.contact.contact_type} · ${call.contact.status}` : call.number ? 'Not in contacts' : ''}
        </div>
      </div>

      {call.contact?.notes && call.phase !== 'ended' && (
        <div className="px-4 py-2 text-[11px] text-slate-600 border-b border-slate-100 line-clamp-2">{call.contact.notes}</div>
      )}

      {call.phase !== 'ended' ? (
        <div className="p-3">
          {call.phase === 'ringing' ? (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={api.reject} className="h-11 rounded-xl bg-red-50 text-red-700 border border-red-200 font-semibold text-sm inline-flex items-center justify-center gap-1.5 hover:bg-red-100"><PhoneOff size={16} /> Reject</button>
              <button onClick={api.accept} className="h-11 rounded-xl bg-emerald-600 text-white font-semibold text-sm inline-flex items-center justify-center gap-1.5 hover:bg-emerald-700 animate-pulse"><Phone size={16} /> Answer</button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <button onClick={api.toggleMute} disabled={call.phase !== 'live'} className={`h-11 rounded-xl border text-xs font-semibold inline-flex flex-col items-center justify-center disabled:opacity-40 ${call.muted ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                {call.muted ? <MicOff size={16} /> : <Mic size={16} />}{call.muted ? 'Unmute' : 'Mute'}
              </button>
              <button onClick={() => setShowTransfer((s) => !s)} disabled={call.phase !== 'live'} className="h-11 rounded-xl border bg-white border-slate-200 text-slate-700 text-xs font-semibold inline-flex flex-col items-center justify-center hover:bg-slate-50 disabled:opacity-40">
                <ArrowRightLeft size={16} />Transfer
              </button>
              <button onClick={api.hangup} className="h-11 rounded-xl bg-red-600 text-white text-xs font-semibold inline-flex flex-col items-center justify-center hover:bg-red-700"><PhoneOff size={16} />End</button>
            </div>
          )}
          {showTransfer && call.phase === 'live' && (
            <div className="mt-2 rounded-xl border border-slate-200 p-2 max-h-40 overflow-auto">
              {team.length === 0 ? <p className="text-xs text-slate-500 px-1 py-1">No other telecaller can take calls right now.</p> : team.map((t) => (
                <button key={t.id} disabled={busy} onClick={async () => { setBusy(true); setMsg(''); try { await api.transfer(t.id); setShowTransfer(false); setMsg(`Transferring to ${t.name}…`); } catch (e) { setMsg(e instanceof Error ? e.message : 'Transfer failed'); } finally { setBusy(false); } }}
                  className="w-full text-left px-2 py-1.5 rounded-lg text-sm hover:bg-orange-50">{t.name}</button>
              ))}
            </div>
          )}
          {msg && <p className="mt-2 text-xs text-slate-600">{msg}</p>}
        </div>
      ) : (
        <div className="p-3 space-y-2">
          {call.endedReason && <p className="text-xs text-slate-500">{call.endedReason}</p>}
          {!call.contact && call.number && (
            <div className="rounded-xl border border-dashed border-orange-300 bg-orange-50/50 p-2 space-y-1.5">
              <div className="text-[11px] font-semibold text-orange-800 inline-flex items-center gap-1"><UserPlus size={12} /> Save as a new contact</div>
              <div className="flex gap-1.5">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="flex-1 min-w-0 h-8 rounded-lg border border-slate-300 px-2 text-sm" />
                <select value={newType} onChange={(e) => setNewType(e.target.value)} className="h-8 rounded-lg border border-slate-300 px-1.5 text-xs">
                  {['Patient', 'Enquiry', 'Appointment', 'Customer', 'Other'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {OUTCOMES.map((o) => (
              <button key={o} onClick={() => setOutcome(outcome === o ? '' : o)} className={`px-2 py-0.5 rounded-full text-[11px] border ${outcome === o ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'}`}>{o}</button>
            ))}
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Call notes" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm resize-none" />
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="shrink-0">Follow-up</span>
            <input type="datetime-local" value={followAt} onChange={(e) => setFollowAt(e.target.value)} className="flex-1 min-w-0 h-8 rounded-lg border border-slate-300 px-2 text-xs" />
          </label>
          {followAt && !call.contact && !newName.trim() && <p className="text-[11px] text-amber-700">Add a name to save this caller as a contact; a follow-up needs a contact.</p>}
          {msg && <p className="text-xs text-red-600">{msg}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={api.dismiss} className="flex-1 h-9 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Skip</button>
            <button onClick={() => void saveWrapUp()} disabled={busy || (!note.trim() && !outcome && !followAt && !newName.trim())} className="flex-1 h-9 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
