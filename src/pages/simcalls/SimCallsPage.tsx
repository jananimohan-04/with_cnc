// Sales > SIM Calls (/sim-calls): calls made and received on company SIMs, copied from the staff's Android phones.
// On the Android app the top card shows this phone's company SIM (send now, change SIM, call a number through it).
// Everyone sees their own calls; people with Approve on SIM Calls (and admins) see the whole company.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Mic, Phone, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Play, RefreshCw, Search, Smartphone, Square } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { exportCsv } from '@/lib/reportExport';
import { missingSimTable, simCallsAvailable, simNative, simTitle, type SimStatus } from '@/lib/simcalls/native';
import { SIM_SYNCED_EVENT, SimSetup } from './SimSetup';

interface SimLine { id: string; user_id: string; device_id: string; device_model: string; sim_slot: number; carrier: string; sim_label: string; phone_number: string; active: boolean; last_sync_at: string | null; created_at: string }
interface SimCall { id: string; line_id: string; user_id: string | null; number: string; contact_name: string; direction: string; started_at: string; duration_sec: number; recording_path?: string }
interface SimSettings { save_recordings: boolean; recording_days: number }
const CALL_COLS = 'id, line_id, user_id, number, contact_name, direction, started_at, duration_sec';

/** ▶ plays a call recording through a 5-minute private link (only people who can see the call get one). */
function PlayRecording({ path, playing, onPlay }: { path: string; playing: boolean; onPlay: (url: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (playing) { onPlay(null); return; }
    setBusy(true);
    const { data, error } = await supabase.storage.from('sim-recordings').createSignedUrl(path, 300);
    setBusy(false);
    if (error || !data?.signedUrl) { alert('Could not open the recording: ' + (error?.message ?? 'not found')); return; }
    onPlay(data.signedUrl);
  };
  return (
    <button onClick={() => void open()} className={`p-2 rounded-full shrink-0 ${playing ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700'}`} aria-label={playing ? 'Close recording' : 'Play recording'}>
      {busy ? <Loader2 size={14} className="animate-spin" /> : playing ? <Square size={14} /> : <Play size={14} />}
    </button>
  );
}

const DIR: Record<string, { label: string; cls: string; Icon: typeof Phone }> = {
  incoming: { label: 'Incoming', cls: 'bg-emerald-50 text-emerald-700', Icon: PhoneIncoming },
  outgoing: { label: 'Outgoing', cls: 'bg-sky-50 text-sky-700', Icon: PhoneOutgoing },
  missed:   { label: 'Missed', cls: 'bg-rose-50 text-rose-700', Icon: PhoneMissed },
  rejected: { label: 'Rejected', cls: 'bg-amber-50 text-amber-700', Icon: PhoneOff },
  blocked:  { label: 'Blocked', cls: 'bg-slate-100 text-slate-600', Icon: PhoneOff },
  unknown:  { label: 'Other', cls: 'bg-slate-100 text-slate-600', Icon: Phone },
};
const RANGES = [{ k: 'today', label: 'Today', days: 0 }, { k: '7', label: '7 days', days: 7 }, { k: '30', label: '30 days', days: 30 }, { k: '90', label: '90 days', days: 90 }] as const;

const fmtDur = (s: number) => { if (!s) return '0s'; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h ? `${h}h ${m}m` : m ? `${m}m ${r}s` : `${r}s`; };
const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const ago = (ms: number) => { if (!ms) return 'not yet'; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(ms).toLocaleDateString('en-IN'); };
const fromOf = (k: string) => { const d = new Date(); d.setHours(0, 0, 0, 0); const r = RANGES.find((x) => x.k === k); if (r && r.days) d.setDate(d.getDate() - r.days + 1); return d.toISOString(); };

export function SimCallsPage() {
  const { canDo, profile } = useAuth();
  const canExport = canDo('sim-calls', 'export');
  const [isManager, setIsManager] = useState(false);
  const [range, setRange] = useState<string>('7');
  const [calls, setCalls] = useState<SimCall[]>([]);
  const [lines, setLines] = useState<SimLine[]>([]);
  const [people, setPeople] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [dir, setDir] = useState('');
  const [person, setPerson] = useState('');
  const [tab, setTab] = useState<'calls' | 'phones'>('calls');
  const [play, setPlay] = useState<{ id: string; url: string } | null>(null);
  const [settings, setSettings] = useState<SimSettings | null>(null);   // null = recordings not set up yet
  const [savingSet, setSavingSet] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    const [c, l, p, m] = await Promise.all([
      (async () => {
        const q = (cols: string) => supabase.from('sim_calls').select(cols).gte('started_at', fromOf(range)).order('started_at', { ascending: false }).limit(3000);
        const withRec = await q(CALL_COLS + ', recording_path');
        // before the recordings update (20261130000000) the column does not exist yet
        return withRec.error && /recording_path/.test(withRec.error.message) ? q(CALL_COLS) : withRec;
      })(),
      supabase.from('sim_lines').select('id, user_id, device_id, device_model, sim_slot, carrier, sim_label, phone_number, active, last_sync_at, created_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('company_users').select('id, full_name, email').limit(2000),
      supabase.rpc('sim_is_manager'),
    ]);
    const e = c.error || l.error;
    if (e) setErr(missingSimTable(e.message) ? 'SIM Calls is not set up in the database yet. Ask your administrator to run the SIM Calls update.' : e.message);
    setCalls((c.data ?? []) as unknown as SimCall[]);
    const st = await supabase.from('sim_settings').select('save_recordings, recording_days').maybeSingle();
    setSettings(st.error ? null : ((st.data as SimSettings | null) ?? { save_recordings: true, recording_days: 90 }));
    setLines((l.data ?? []) as SimLine[]);
    setPeople(new Map(((p.data ?? []) as { id: string; full_name: string | null; email: string }[]).map((u) => [u.id, u.full_name || u.email])));
    setIsManager(m.data === true);
    setLoading(false);
  }, [range]);

  useEffect(() => { setLoading(true); void load(); }, [load]);
  useEffect(() => { const f = () => void load(); window.addEventListener(SIM_SYNCED_EVENT, f); return () => window.removeEventListener(SIM_SYNCED_EVENT, f); }, [load]);

  const lineOf = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  const nameOf = (id: string | null) => (id && people.get(id)) || '—';

  const rows = calls.filter((c) => {
    if (dir && c.direction !== dir) return false;
    if (person && c.user_id !== person) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    const digits = s.replace(/\D/g, '');
    return c.contact_name.toLowerCase().includes(s) || (digits.length >= 3 && c.number.replace(/\D/g, '').includes(digits));
  });
  const totals = useMemo(() => ({
    all: rows.length,
    incoming: rows.filter((r) => r.direction === 'incoming').length,
    outgoing: rows.filter((r) => r.direction === 'outgoing').length,
    missed: rows.filter((r) => r.direction === 'missed' || r.direction === 'rejected').length,
    talk: rows.reduce((a, r) => a + (r.duration_sec || 0), 0),
  }), [rows]);
  const callers = useMemo(() => [...new Set(calls.map((c) => c.user_id).filter(Boolean) as string[])], [calls]);

  const exportRows = () => exportCsv(`sim-calls-${new Date().toISOString().slice(0, 10)}`, [
    ['Date & time', 'Person', 'Company SIM', 'Type', 'Number', 'Name', 'Duration (s)'],
    ...rows.map((c) => { const l = lineOf.get(c.line_id); return [new Date(c.started_at).toLocaleString('en-IN'), nameOf(c.user_id), l ? (l.phone_number || simTitle({ slot: l.sim_slot, carrier: l.carrier, label: l.sim_label, number: '' })) : '', DIR[c.direction]?.label ?? c.direction, c.number, c.contact_name, c.duration_sec]; }),
  ]);

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSet(true);
    const { error } = await supabase.from('sim_settings').upsert({ ...settings, updated_at: new Date().toISOString() }, { onConflict: 'company_id' });
    setSavingSet(false);
    if (error) alert('Could not save: ' + error.message);
  };

  const disconnectLine = async (l: SimLine) => {
    if (!confirm(`Stop saving calls from ${nameOf(l.user_id)}'s ${l.device_model || 'phone'}? Calls already saved stay.`)) return;
    const { error } = await supabase.rpc('sim_disconnect', { p_line_id: l.id });
    if (error) alert(error.message); else void load();
  };

  return (
    <div className="p-3 lg:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 mr-auto min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center"><Smartphone size={18} /></div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">SIM Calls</h1>
            <p className="text-xs text-slate-500">Calls on company SIMs, saved from the mobile app{isManager ? ' (whole company)' : ' (your calls)'}</p>
          </div>
        </div>
        <button onClick={() => { setLoading(true); void load(); }} className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 flex items-center gap-1.5 shrink-0" aria-label="Refresh"><RefreshCw size={14} /><span className="hidden sm:inline">Refresh</span></button>
      </div>

      {simCallsAvailable() && <ThisPhone onChange={() => void load()} />}

      {err && <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs px-3 py-2">{err}</div>}

      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {[['Calls', totals.all, 'text-slate-800'], ['In', totals.incoming, 'text-emerald-700'], ['Out', totals.outgoing, 'text-sky-700'], ['Missed', totals.missed, 'text-rose-700'], ['Talk', fmtDur(totals.talk), 'text-indigo-700']].map(([l, v, c]) => (
          <div key={l as string} className="rounded-xl bg-white border border-slate-200 px-1 sm:px-3 py-2 sm:py-2.5 shadow-sm text-center sm:text-left min-w-0">
            <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase truncate">{l}</div>
            <div className={`text-base sm:text-xl font-bold truncate ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      {isManager && (
        <div className="flex gap-1">
          {(['calls', 'phones'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`h-8 px-3 rounded-lg text-xs font-semibold ${tab === t ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{t === 'calls' ? 'Calls' : `Connected phones (${lines.filter((l) => l.active).length})`}</button>
          ))}
        </div>
      )}

      {tab === 'calls' || !isManager ? (
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-100">
            <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[160px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or number" className="w-full h-9 rounded-lg border border-slate-300 pl-8 pr-2 text-sm" />
            </div>
            <select value={range} onChange={(e) => setRange(e.target.value)} className="flex-1 sm:flex-none h-9 rounded-lg border border-slate-300 px-2 text-xs" aria-label="Period">{RANGES.map((r) => <option key={r.k} value={r.k}>{r.label}</option>)}</select>
            <select value={dir} onChange={(e) => setDir(e.target.value)} className="flex-1 sm:flex-none h-9 rounded-lg border border-slate-300 px-2 text-xs" aria-label="Type"><option value="">All types</option>{Object.entries(DIR).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}</select>
            {isManager && <select value={person} onChange={(e) => setPerson(e.target.value)} className="flex-1 sm:flex-none h-9 rounded-lg border border-slate-300 px-2 text-xs" aria-label="Person"><option value="">Everyone</option>{callers.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}</select>}
            {canExport && <button onClick={exportRows} className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50">Export</button>}
          </div>
          {/* phones: one compact row per call */}
          <div className="sm:hidden divide-y divide-slate-100">
            {loading && <div className="py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></div>}
            {!loading && !rows.length && <div className="px-3 py-10 text-center text-xs text-slate-400">No calls in this period. A call shows here a few seconds after it ends.</div>}
            {!loading && rows.map((c) => {
              const d = DIR[c.direction] ?? DIR.unknown;
              return (
                <div key={c.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${d.cls}`}><d.Icon size={16} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800 truncate">{c.contact_name || c.number || 'Private number'}</div>
                      <div className="text-[11px] text-slate-500 truncate">{[c.contact_name ? c.number : '', d.label, fmtDur(c.duration_sec), isManager ? nameOf(c.user_id) : ''].filter(Boolean).join(' · ')}</div>
                    </div>
                    <div className="text-[11px] text-slate-400 text-right whitespace-nowrap">{fmtTime(c.started_at)}</div>
                    {c.recording_path && <PlayRecording path={c.recording_path} playing={play?.id === c.id} onPlay={(url) => setPlay(url ? { id: c.id, url } : null)} />}
                    {simCallsAvailable() && c.number && <button onClick={() => void simNative.dial(c.number).catch((e) => alert(e.message))} className="p-2 rounded-full bg-emerald-600 text-white shrink-0" aria-label="Call back"><Phone size={14} /></button>}
                  </div>
                  {play?.id === c.id && <audio src={play.url} controls autoPlay className="mt-2 w-full h-10" />}
                </div>
              );
            })}
          </div>
          <div className="hidden sm:block overflow-x-auto max-h-[calc(100dvh-330px)]">
            <table className="w-full text-xs no-stripe">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left font-semibold px-3 py-2">Date & time</th>
                  <th className="text-left font-semibold px-3 py-2">Type</th>
                  <th className="text-left font-semibold px-3 py-2">Number</th>
                  <th className="text-left font-semibold px-3 py-2">Name</th>
                  <th className="text-right font-semibold px-3 py-2">Duration</th>
                  {isManager && <th className="text-left font-semibold px-3 py-2">Person</th>}
                  <th className="text-left font-semibold px-3 py-2">Company SIM</th>
                  <th className="text-left font-semibold px-3 py-2">Recording</th>
                  {simCallsAvailable() && <th className="px-2 py-2" />}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400"><Loader2 size={18} className="inline animate-spin" /></td></tr>}
                {!loading && !rows.length && <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">No calls in this period{simCallsAvailable() ? '' : '. Calls appear here once staff choose their company SIM in the mobile app.'}</td></tr>}
                {!loading && rows.map((c) => {
                  const d = DIR[c.direction] ?? DIR.unknown; const l = lineOf.get(c.line_id);
                  return (
                    <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">{fmtTime(c.started_at)}</td>
                      <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${d.cls}`}><d.Icon size={12} />{d.label}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">{c.number || 'Private number'}</td>
                      <td className="px-3 py-2 text-slate-600">{c.contact_name || '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{fmtDur(c.duration_sec)}</td>
                      {isManager && <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{nameOf(c.user_id)}</td>}
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{l ? (l.phone_number || `SIM ${l.sim_slot} ${l.carrier}`) : '—'}</td>
                      <td className="px-3 py-2">
                        {c.recording_path ? (
                          <div className="flex items-center gap-2">
                            <PlayRecording path={c.recording_path} playing={play?.id === c.id} onPlay={(url) => setPlay(url ? { id: c.id, url } : null)} />
                            {play?.id === c.id && <audio src={play.url} controls autoPlay className="h-8 w-56" />}
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      {simCallsAvailable() && <td className="px-2 py-2">{c.number && <button onClick={() => void simNative.dial(c.number).catch((e) => alert(e.message))} className="p-1.5 rounded-lg bg-emerald-600 text-white" aria-label="Call back"><Phone size={13} /></button>}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
        {settings && (
          <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-3">
            <Mic size={16} className="text-indigo-600" />
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={settings.save_recordings} onChange={(e) => setSettings({ ...settings, save_recordings: e.target.checked })} />
              Save call recordings
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">Keep for
              <input type="number" min={1} max={3650} value={settings.recording_days} onChange={(e) => setSettings({ ...settings, recording_days: Math.max(1, Math.min(3650, Number(e.target.value) || 1)) })} className="w-20 h-8 rounded-lg border border-slate-300 px-2 text-xs" />
              days, then delete
            </label>
            <button disabled={savingSet} onClick={() => void saveSettings()} className="ml-auto h-8 px-3 rounded-lg bg-slate-800 text-white text-xs font-semibold disabled:opacity-60">{savingSet ? 'Saving…' : 'Save'}</button>
            <p className="basis-full text-[11px] text-slate-500">Recordings come from each phone's own dialer: switch on <b>Record calls</b> in the phone's Phone app settings. Let staff and customers know calls are recorded.</p>
          </div>
        )}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-xs no-stripe">
            <thead className="bg-slate-50 text-slate-500">
              <tr><th className="text-left font-semibold px-3 py-2">Person</th><th className="text-left font-semibold px-3 py-2">Company SIM</th><th className="text-left font-semibold px-3 py-2">Phone</th><th className="text-left font-semibold px-3 py-2">Last sent</th><th className="text-left font-semibold px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {!lines.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No phones yet. Staff connect their company SIM in the mobile app (Sales → SIM Calls).</td></tr>}
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{nameOf(l.user_id)}</td>
                  <td className="px-3 py-2 text-slate-700">{simTitle({ slot: l.sim_slot, carrier: l.carrier, label: l.sim_label, number: l.phone_number })}</td>
                  <td className="px-3 py-2 text-slate-500">{l.device_model || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{l.last_sync_at ? ago(Date.parse(l.last_sync_at)) : 'not yet'}</td>
                  <td className="px-3 py-2">{l.active ? <span className="rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 font-semibold">Saving calls</span> : <span className="rounded-full px-2 py-0.5 bg-slate-100 text-slate-500 font-semibold">Stopped</span>}</td>
                  <td className="px-3 py-2 text-right">{l.active && (isManager || l.user_id === profile?.id) && <button onClick={() => void disconnectLine(l)} className="text-rose-600 font-semibold hover:underline">Stop</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  );
}

/** Android app only: this phone's company SIM, sending, changing the SIM and calling through it. */
function ThisPhone({ onChange }: { onChange: () => void }) {
  const [st, setSt] = useState<SimStatus | null>(null);
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [num, setNum] = useState('');

  const refresh = useCallback(async () => { try { setSt(await simNative.status()); } catch { setSt(null); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const f = () => void refresh(); window.addEventListener(SIM_SYNCED_EVENT, f); return () => window.removeEventListener(SIM_SYNCED_EVENT, f); }, [refresh]);

  if (!st) return null;
  if (!st.connected || setup) {
    return (
      <div className="rounded-xl bg-white border border-emerald-200 shadow-sm p-4">
        <SimSetup compact onDone={() => { setSetup(false); void refresh(); onChange(); }} onLater={setup ? () => setSetup(false) : undefined} />
        {st.lastError && !setup && <p className="mt-2 text-xs text-amber-700">{st.lastError}</p>}
      </div>
    );
  }

  const sendNow = async () => {
    setBusy(true); setMsg('');
    try { const r = await simNative.syncNow(); setMsg(r.error ? r.error : r.sent ? `${r.sent} new call${r.sent === 1 ? '' : 's'} saved.` : 'Up to date.'); onChange(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); void refresh(); }
  };
  const stop = async () => {
    if (!confirm('Stop saving calls from this phone? Calls already saved stay in BI.')) return;
    try { await simNative.disconnect(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    void refresh(); onChange();
  };
  const call = async () => {
    if (num.replace(/\D/g, '').length < 3) { setMsg('Enter a number to call.'); return; }
    try { await simNative.dial(num.trim()); setNum(''); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="rounded-xl bg-white border border-emerald-200 shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 shrink-0 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">SIM{st.sim?.slot}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-slate-800 truncate">{st.sim ? [st.sim.carrier || st.sim.label, st.sim.number].filter(Boolean).join(' · ') || `SIM ${st.sim.slot}` : 'Company SIM'}</div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />Saving calls · sent {ago(st.lastSync)}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button onClick={sendNow} disabled={busy} className="h-9 rounded-lg bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60 whitespace-nowrap">{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Send now</button>
        <button onClick={() => setSetup(true)} className="h-9 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 whitespace-nowrap">Change SIM</button>
        <button onClick={stop} className="h-9 rounded-lg border border-rose-200 text-xs font-semibold text-rose-600 whitespace-nowrap">Stop</button>
      </div>
      <div className="flex gap-2">
        <input value={num} onChange={(e) => setNum(e.target.value)} inputMode="tel" placeholder="Number to call" className="flex-1 min-w-0 h-10 rounded-lg border border-slate-300 px-3 text-sm" />
        <button onClick={call} className="h-10 px-4 shrink-0 rounded-lg bg-sky-600 text-white text-sm font-semibold flex items-center gap-1.5"><Phone size={15} />Call</button>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <Mic size={14} className="text-indigo-600 shrink-0" />
        {st.recordingsAllowed === false ? (
          <>
            <span className="flex-1">Recordings: allow access so your dialer's call recordings are saved.</span>
            <button onClick={() => void simNative.requestRecordings().then((r) => { if (!r.granted) setMsg('Allow "Music and audio" for Argus in the phone Settings → Apps → Permissions.'); void refresh(); })} className="h-8 px-3 rounded-lg bg-indigo-600 text-white font-semibold shrink-0">Allow</button>
          </>
        ) : (
          <span className="flex-1">Recordings on{st.lastRecordingAt ? ` · last saved ${ago(st.lastRecordingAt)}` : ''}{st.recordingsWaiting ? ` · ${st.recordingsWaiting} call${st.recordingsWaiting === 1 ? '' : 's'} waiting` : ''}. Turn on call recording in your phone's dialer.</span>
        )}
      </div>
      {(msg || st.lastError || st.lastRecordingError) && <p className={`text-xs ${!msg ? 'text-amber-700' : 'text-slate-600'}`}>{msg || st.lastError || st.lastRecordingError}</p>}
    </div>
  );
}
