// Tele CRM browser phone: one per signed-in telecaller, mounted for the whole app so an incoming call rings on any page.
// It does nothing (and loads nothing) unless Tele CRM is allowed for the person, the provider is configured on the
// server, the company has a connected number and the person is an active telecaller.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRightLeft, Loader2, Mic, MicOff, Phone, PhoneIncoming, PhoneOff, PhoneOutgoing, Smartphone, UserPlus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { createPhoneDevice, type PhoneCallHandle, type PhoneDevice } from './adapters';
import { TeleError, fmtDuration, phoneKey, teleApi, toE164, type TeleStatus } from './api';

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
  /** browser = WebRTC in this tab; bridge = the provider rings the agent's mobile, then the customer */
  mode: 'browser' | 'bridge';
  /** bridge: the call record's status / whether the customer leg has started */
  status?: string;
  customerLeg?: boolean;
}
type PhoneState = 'off' | 'starting' | 'ready' | 'error';

interface PhoneApi {
  state: PhoneState;
  error: string;
  status: TeleStatus | null;
  call: LiveCall | null;
  canCallOut: boolean;
  /** Can the Call buttons be used right now (for the agent's calling method)? */
  canCall: boolean;
  callVia: 'mobile' | 'browser';
  setCallVia: (via: 'mobile' | 'browser') => Promise<void>;
  /** The agent pressed Call without a verified mobile: the connect prompt is open. */
  needMobile: boolean;
  closeNeedMobile: () => void;
  refreshStatus: () => Promise<void>;
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
  const [needMobile, setNeedMobile] = useState(false);
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
          setCall({ direction: 'inbound', number, callRef: h.params.callRef || '', contact: null, phase: 'ringing', startedAt: null, muted: false, transferred: h.params.transfer === '1', mode: 'browser' });
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

  const agent = status?.me.agent ?? null;
  // mobile when bridge calling is available and the agent chose it, or when calling from the computer is not set up at all
  const callVia: 'mobile' | 'browser' = status?.bridgeCalling && agent?.mobile_status !== undefined && ((agent?.call_via ?? 'mobile') === 'mobile' || !status.browserCalling) ? 'mobile' : 'browser';
  const canCall = callVia === 'mobile'
    ? !!(status?.configured && agent?.can_call_out)   // a business number is optional: the verified SIM can be the caller number
    : state === 'ready' && canCallOut;

  const refreshStatus = useCallback(async () => { try { setStatus(await teleApi.status()); } catch { /* keep the last one */ } }, []);

  const dial = useCallback(async (number: string, contact?: CallContact | null) => {
    const to = toE164(number);
    if (!to) throw new Error('Enter a valid phone number (with country code for numbers outside India).');
    if (callRef.current && callRef.current.phase !== 'ended') throw new Error('Finish the current call first.');
    if (callVia === 'mobile') {
      if (agent?.mobile_status !== 'verified') { setNeedMobile(true); return; }
      const c = contact ?? (await contactByPhone(to));
      setCall({ direction: 'outbound', number: to, callRef: '', contact: c, phase: 'connecting', startedAt: null, muted: false, transferred: false, mode: 'bridge', status: 'initiated' });
      try {
        const r = await teleApi.bridge(to, c?.id);
        patch({ callRef: r.callId });
      } catch (e) {
        if (e instanceof TeleError && e.needMobile) { setCall(null); setNeedMobile(true); void refreshStatus(); return; }
        patch({ phase: 'ended', status: 'failed', endedReason: e instanceof Error ? e.message : 'Call failed' });
      }
      return;
    }
    if (!device.current || state !== 'ready') throw new Error('The phone is not ready.');
    const c = contact ?? (await contactByPhone(to));
    setCall({ direction: 'outbound', number: to, callRef: '', contact: c, phase: 'connecting', startedAt: null, muted: false, transferred: false, mode: 'browser' });
    try {
      const h = await device.current.connect({ To: to, ...(c?.id ? { contactId: c.id } : {}) });
      bind(h);
    } catch (e) {
      patch({ phase: 'ended', endedReason: e instanceof Error ? e.message : 'Call failed' });
    }
  }, [state, bind, callVia, agent?.mobile_status, refreshStatus]);

  // bridge call: follow the call record (written by the server from the provider's webhooks) until it ends
  const bridgeId = call?.mode === 'bridge' && call.phase !== 'ended' ? call.callRef : '';
  useEffect(() => {
    if (!bridgeId) return;
    let stop = false;
    const DONE: Record<string, string> = { completed: '', missed: 'No answer', busy: 'Busy', failed: 'Call failed', cancelled: 'Call cancelled', rejected: 'Call rejected' };
    const read = async () => {
      const { data } = await supabase.from('tele_calls').select('status, provider_leg_id, answered_at, ended_at, error_text').eq('id', bridgeId).maybeSingle();
      if (stop || !data) return;
      const st = String(data.status);
      if (st in DONE) {
        setCall((c) => (c && c.callRef === bridgeId ? { ...c, phase: 'ended', status: st, endedReason: st === 'completed' && !data.answered_at ? 'Call ended' : (data.error_text || DONE[st]) } : c));
        return;
      }
      setCall((c) => (c && c.callRef === bridgeId ? {
        ...c, status: st, customerLeg: !!data.provider_leg_id,
        phase: st === 'in-progress' ? 'live' : 'connecting',
        startedAt: st === 'in-progress' ? (c.startedAt ?? (data.answered_at ? Date.parse(data.answered_at) : Date.now())) : null,
      } : c));
    };
    void read();
    const t = setInterval(() => { void read(); }, 2000);
    const ch = supabase.channel(`tele-bridge-${bridgeId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tele_calls', filter: `id=eq.${bridgeId}` }, () => { void read(); })
      .subscribe();
    return () => { stop = true; clearInterval(t); void supabase.removeChannel(ch); };
  }, [bridgeId]);

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
    state, error, status, call, canCallOut, canCall, callVia, needMobile,
    closeNeedMobile: () => setNeedMobile(false),
    refreshStatus,
    setCallVia: async (via) => {
      const { error: e } = await supabase.rpc('tele_set_call_via', { p_via: via });
      if (e) throw new Error(e.message);
      await refreshStatus();
    },
    dial,
    accept: () => { handle.current?.accept(); patch({ phase: 'connecting' }); },
    reject: () => { handle.current?.reject(); patch({ phase: 'ended', endedReason: 'Call rejected' }); },
    hangup: () => {
      const c = callRef.current;
      if (c?.mode === 'bridge') { if (c.callRef) void teleApi.hangup(c.callRef).catch(() => {}); else patch({ phase: 'ended', endedReason: 'Call cancelled' }); return; }
      handle.current?.hangup();
    },
    toggleMute: () => { const h = handle.current; if (!h) return; const on = !h.isMuted(); h.mute(on); patch({ muted: on }); },
    transfer: async (toUserId: string) => {
      const id = await findCallId();
      if (!id) throw new Error('This call is not saved yet; try again in a moment.');
      await teleApi.transfer(id, toUserId);
    },
    dismiss: () => setCall(null),
    restart: () => setEpoch((n) => n + 1),
  }), [state, error, status, call, canCallOut, canCall, callVia, needMobile, refreshStatus, dial, findCallId]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {call && <CallWindow api={api} findCallId={findCallId} />}
      {needMobile && !call && <NeedMobilePrompt api={api} />}
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
            {call.mode === 'bridge'
              ? (call.phase === 'live' ? 'Connected' : call.phase === 'ended' ? 'Call ended' : call.status === 'ringing' ? (call.customerLeg ? 'Ringing customer…' : 'Ringing your mobile…') : 'Initiating…')
              : call.phase === 'ringing' ? (call.transferred ? 'Transferred call' : 'Incoming call') : call.phase === 'connecting' ? (call.direction === 'outbound' ? 'Calling…' : 'Connecting…') : call.phase === 'live' ? 'On call' : 'Call ended'}
          </span>
          {call.phase === 'live' && <span className="tabular-nums text-sm normal-case tracking-normal">{fmtDuration(secs)}</span>}
          {call.phase === 'ended' && <button onClick={api.dismiss} aria-label="Close" className="opacity-80 hover:opacity-100"><X size={15} /></button>}
        </div>
        <div className="mt-1.5 text-lg font-bold leading-tight truncate">{who}</div>
        <div className="text-xs opacity-90 truncate">
          {call.contact ? `${call.number} · ${call.contact.contact_type} · ${call.contact.status}` : call.number ? 'Not in contacts' : ''}
        </div>
      </div>

      {call.mode === 'bridge' && call.phase === 'connecting' && !call.customerLeg && (
        <div className="px-4 py-2 text-[11px] text-orange-800 bg-orange-50 border-b border-orange-100 inline-flex items-center gap-1.5 w-full"><Smartphone size={12} /> Answer the call on your mobile and press 1 to connect.</div>
      )}
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
              <button onClick={api.toggleMute} disabled={call.phase !== 'live' || call.mode === 'bridge'} title={call.mode === 'bridge' ? 'Use mute on your mobile' : undefined} className={`h-11 rounded-xl border text-xs font-semibold inline-flex flex-col items-center justify-center disabled:opacity-40 ${call.muted ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
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

// ----------------------------------------------------------------------------- bridge calling: the agent's own mobile
/** Connect + verify the agent's mobile through the provider's own verification call (the code is typed on the phone). */
export function MobileConnect({ compact = false }: { compact?: boolean }) {
  const phone = usePhone();
  const agent = phone?.status?.me.agent ?? null;
  const [num, setNum] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pending = agent?.mobile_status === 'pending';
  const verified = agent?.mobile_status === 'verified';

  // while the provider's verification call is on, keep checking (it confirms on its own when the code is typed)
  useEffect(() => {
    if (!pending) return;
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      if (n > 45) { clearInterval(t); return; }
      void teleApi.checkMobile().then((r) => { if (r.verified) { setCode(''); setMsg({ ok: true, text: `${r.e164} is verified. Calls will ring this mobile.` }); void phone?.refreshStatus(); } }).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [pending, phone]);

  if (!phone?.status?.bridgeCalling || !agent) return null;
  const start = async () => {
    setBusy(true); setMsg(null); setCode('');
    try {
      const r = await teleApi.connectMobile(num);
      if (r.verified) setMsg({ ok: true, text: `${r.e164} is verified. Calls will ring this mobile.` });
      else { setCode(r.code); setMsg({ ok: true, text: `You will get a call on ${r.e164} now. Answer it and type the code below on the phone keypad.` }); }
      setNum('');
      await phone.refreshStatus();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  };
  const check = async () => {
    setBusy(true); setMsg(null);
    try { const r = await teleApi.checkMobile(); setMsg(r.verified ? { ok: true, text: `${r.e164} is verified.` } : { ok: false, text: 'Not verified yet. Answer the verification call and type the code.' }); if (r.verified) setCode(''); await phone.refreshStatus(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm('Disconnect your mobile? You will not be able to call through it until you connect it again.')) return;
    setBusy(true); setMsg(null);
    try { await teleApi.disconnectMobile(); setCode(''); await phone.refreshStatus(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  };
  return (
    <div className={compact ? 'space-y-2' : 'space-y-2 text-xs'}>
      {agent.mobile_e164 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums"><Smartphone size={14} className="text-slate-500" />{agent.mobile_e164}</span>
          <span className="flex items-center gap-2 text-[11px]">
            <span className={`px-1.5 py-0.5 rounded-full border font-semibold ${verified ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{verified ? 'Verified' : pending ? 'Waiting for code' : 'Not verified'}</span>
            <button onClick={() => void remove()} disabled={busy} className="text-red-600 hover:underline">Disconnect</button>
          </span>
        </div>
      )}
      {code && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-center">
          <div className="text-[11px] text-orange-800">Type this code on your phone when the verification call asks for it</div>
          <div className="text-2xl font-bold tracking-[0.3em] text-orange-700 tabular-nums">{code}</div>
        </div>
      )}
      {pending && <button onClick={() => void check()} disabled={busy} className="h-8 px-3 rounded-lg border border-slate-300 text-xs font-semibold hover:bg-slate-50 inline-flex items-center gap-1">{busy && <Loader2 size={12} className="animate-spin" />}I have typed the code: check now</button>}
      {!verified && (
        <div className="flex gap-1.5">
          <input value={num} onChange={(e) => setNum(e.target.value)} inputMode="tel" placeholder={agent.mobile_e164 ? 'Another mobile' : 'Your mobile, e.g. 98765 43210'} aria-label="Your mobile"
            className="flex-1 min-w-0 h-9 rounded-lg border border-slate-300 px-2.5 text-sm tabular-nums focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20" />
          <button onClick={() => void start()} disabled={busy || !num.trim()} className="h-9 px-3 rounded-lg bg-orange-600 text-white text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1">{busy && <Loader2 size={12} className="animate-spin" />}{pending ? 'Resend' : 'Verify'}</button>
        </div>
      )}
      {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>}
    </div>
  );
}

function NeedMobilePrompt({ api }: { api: PhoneApi }) {
  return (
    <div className="fixed z-[70] right-3 bottom-3 sm:right-5 sm:bottom-5 w-[min(360px,calc(100vw-24px))] rounded-2xl bg-white shadow-[0_18px_50px_rgba(15,23,42,0.35)] border border-slate-200 overflow-hidden" role="dialog" aria-label="Connect your mobile">
      <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white px-4 py-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider opacity-90 inline-flex items-center gap-1.5"><Smartphone size={13} /> Connect your mobile first</div>
          <div className="mt-1 text-sm leading-snug">Calls ring your own mobile first, then the customer is connected. Verify your mobile once to start calling.</div>
        </div>
        <button onClick={api.closeNeedMobile} aria-label="Close" className="opacity-80 hover:opacity-100"><X size={15} /></button>
      </div>
      <div className="p-3"><MobileConnect compact /></div>
    </div>
  );
}
