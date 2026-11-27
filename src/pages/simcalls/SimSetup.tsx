// SIM Calls on the Android app: choosing the company SIM (after sign-in, and from the SIM Calls page), and sending
// new calls whenever the app opens or comes back to the front.

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, Smartphone, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { missingSimTable, simCallsAvailable, simNative, simTitle, type PhoneSim } from '@/lib/simcalls/native';

export const SIM_SYNCED_EVENT = 'argus:sim-calls-synced';
const LATER_KEY = 'argus.simcalls.later';

/** Pick the company SIM and connect it. */
export function SimSetup({ onDone, onLater, compact = false }: { onDone: () => void; onLater?: () => void; compact?: boolean }) {
  const [step, setStep] = useState<'intro' | 'pick' | 'denied'>('intro');
  const [sims, setSims] = useState<PhoneSim[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const loadSims = useCallback(async () => {
    const list = await simNative.listSims();
    setSims(list);
    if (list.length === 1) { setChosen(list[0].subscriptionId); setNumber(list[0].number); }
    setStep('pick');
  }, []);

  // permission already given earlier: go straight to the SIM list
  useEffect(() => { void simNative.status().then((s) => { if (s.granted) void loadSims().catch(() => {}); }).catch(() => {}); }, [loadSims]);

  const allow = async () => {
    setBusy(true); setErr('');
    try {
      const r = await simNative.requestAccess();
      if (!r.granted) { setStep('denied'); return; }
      await loadSims();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const connect = async () => {
    const sim = sims.find((s) => s.subscriptionId === chosen);
    if (!sim) { setErr('Choose the company SIM.'); return; }
    const n = number.trim();
    if (n && n.replace(/\D/g, '').length < 10) { setErr('Enter the full mobile number of this SIM (10 digits).'); return; }
    setBusy(true); setErr('');
    try {
      await simNative.connect(sim, n);
      // call recordings saved by the phone's dialer (optional: calls are saved either way)
      await simNative.requestRecordings().catch(() => undefined);
      window.dispatchEvent(new Event(SIM_SYNCED_EVENT));
      onDone();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(missingSimTable(m) ? 'SIM Calls is not set up in BI yet. Ask your administrator to run the SIM Calls update.' : m);
    } finally { setBusy(false); }
  };

  return (
    <div className={compact ? '' : 'p-5'}>
      {step === 'intro' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center"><Smartphone size={22} /></div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Which SIM is your company SIM?</h3>
              <p className="text-xs text-slate-500">Calls on that SIM are saved in BI: number, name, incoming / outgoing / missed, time and duration.</p>
            </div>
          </div>
          <ul className="text-xs text-slate-600 space-y-1.5 pl-1">
            <li className="flex gap-2"><ShieldCheck size={14} className="text-emerald-600 shrink-0 mt-0.5" />Only the SIM you choose is saved. Calls on your other SIM stay on your phone.</li>
            <li className="flex gap-2"><ShieldCheck size={14} className="text-emerald-600 shrink-0 mt-0.5" />If your phone's dialer records calls, those recordings are saved with the calls too.</li>
          </ul>
          <p className="text-[11px] text-slate-500">Next, your phone asks to allow <b>Phone</b> and <b>Call logs</b> (needed to see the SIMs and their calls), and then <b>Music and audio</b> (for the recordings).</p>
          <div className="flex gap-2 pt-1">
            <button onClick={allow} disabled={busy} className="flex-1 h-10 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
              {busy && <Loader2 size={16} className="animate-spin" />}Allow and choose SIM
            </button>
            {onLater && <button onClick={onLater} className="h-10 px-4 rounded-lg border border-slate-300 text-sm text-slate-600">Later</button>}
          </div>
        </div>
      )}

      {step === 'denied' && (
        <div className="space-y-3">
          <h3 className="text-base font-bold text-slate-800">Phone access is off</h3>
          <p className="text-xs text-slate-600">Open your phone's <b>Settings → Apps → Argus Business Intelligence → Permissions</b>, allow <b>Phone</b> and <b>Call logs</b>, then come back and try again.</p>
          <div className="flex gap-2">
            <button onClick={allow} className="flex-1 h-10 rounded-lg bg-emerald-600 text-white text-sm font-semibold">Try again</button>
            {onLater && <button onClick={onLater} className="h-10 px-4 rounded-lg border border-slate-300 text-sm text-slate-600">Later</button>}
          </div>
        </div>
      )}

      {step === 'pick' && (
        <div className="space-y-3">
          <h3 className="text-base font-bold text-slate-800">Choose the company SIM</h3>
          {!sims.length && <p className="text-sm text-slate-500">No SIM was found in this phone. Insert the company SIM and try again.</p>}
          <div className="space-y-2">
            {sims.map((s) => (
              <button key={s.subscriptionId} type="button" onClick={() => { setChosen(s.subscriptionId); setNumber(s.number); setErr(''); }}
                className={`w-full text-left rounded-xl border-2 px-3 py-2.5 flex items-center gap-3 ${chosen === s.subscriptionId ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${chosen === s.subscriptionId ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>SIM{s.slot}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800 truncate">{s.carrier || s.label || `SIM ${s.slot}`}</div>
                  <div className="text-xs text-slate-500 truncate">{s.number || 'Number not shown by the SIM'}</div>
                </div>
                {chosen === s.subscriptionId && <CheckCircle2 size={18} className="text-emerald-600" />}
              </button>
            ))}
          </div>
          {chosen !== null && (
            <label className="block text-xs font-semibold text-slate-600">Mobile number of this SIM
              <input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="tel" placeholder="e.g. 98765 43210"
                className="mt-1 w-full h-10 rounded-lg border border-slate-300 px-3 text-sm font-normal" />
              <span className="block mt-1 font-normal text-[11px] text-slate-500">Shown in BI next to these calls. Many SIMs don't share their own number, so type it if it's empty.</span>
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={connect} disabled={busy || chosen === null} className="flex-1 h-10 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
              {busy && <Loader2 size={16} className="animate-spin" />}Start saving calls
            </button>
            {onLater && <button onClick={onLater} className="h-10 px-4 rounded-lg border border-slate-300 text-sm text-slate-600">Later</button>}
          </div>
        </div>
      )}
      {err && <p className="mt-3 text-xs text-rose-600">{err}</p>}
    </div>
  );
}

/**
 * Mounted once inside the signed-in app. On the Android app, for people with SIM Calls access:
 *   - asks for the company SIM once after sign-in (until chosen; "Later" hides it until the app restarts);
 *   - sends new calls when the app opens and whenever it comes back to the front (e.g. right after a call).
 */
export function SimCallsGate() {
  const { canView, permissions } = useAuth();
  const allowed = permissions !== null && canView('sim-calls');
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    if (!allowed || !simCallsAvailable()) return;
    let later = false;
    try { later = sessionStorage.getItem(LATER_KEY) === '1'; } catch { /* private mode */ }
    const sync = () => {
      void simNative.syncNow().then((r) => { if (r.sent > 0) window.dispatchEvent(new Event(SIM_SYNCED_EVENT)); }).catch(() => {});
    };
    void simNative.status().then(async (s) => {
      if (s.connected) { await simNative.configure().catch(() => undefined); sync(); }
      else if (!later) setAsk(true);
    }).catch(() => {});
    let remove: (() => void) | undefined;
    void import('@capacitor/app').then(({ App }) => App.addListener('resume', sync)).then((h) => { remove = () => void h.remove(); }).catch(() => {});
    return () => remove?.();
  }, [allowed]);

  if (!ask) return null;
  const later = () => { try { sessionStorage.setItem(LATER_KEY, '1'); } catch { /* private mode */ } setAsk(false); };
  return (
    <div className="fixed inset-0 z-[90] bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl pb-[env(safe-area-inset-bottom)]">
        <button onClick={later} className="absolute right-3 top-3 p-1 text-slate-400" aria-label="Close"><X size={18} /></button>
        <SimSetup onDone={() => setAsk(false)} onLater={later} />
      </div>
    </div>
  );
}

export { simTitle };
