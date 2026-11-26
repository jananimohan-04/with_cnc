// Tele CRM: Team (telecallers, permissions, stats) and Settings (connection, numbers, routing, recording policy,
// audit log). Only company admins, the Super Admin and Tele CRM supervisors see these tabs; the database enforces it too.

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Loader2, Plus, ShieldCheck, Star, Trash2, TriangleAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fmtDuration, teleApi, type TeleAgent, type TeleStatus } from '@/lib/telecrm/api';
import { CONTACT_TYPES, errText, fmtDateTime, isAnswered, type Rule, type Settings, type TeleData } from './shared';

const box = 'rounded-xl bg-white border border-slate-200 shadow-sm';
const head = 'px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 border-b border-slate-100 flex items-center justify-between gap-2';
const input = 'h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20';

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-40`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

// ----------------------------------------------------------------------------- team
export function TeamTab({ data, reload, nameOf }: { data: TeleData; reload: () => Promise<void>; nameOf: (id: string | null) => string }) {
  const [add, setAdd] = useState('');
  const [err, setErr] = useState('');
  const free = data.people.filter((p) => !data.agents.some((a) => a.user_id === p.id));
  const today = new Date().toISOString().slice(0, 10);

  const update = async (a: TeleAgent, patch: Partial<TeleAgent>) => {
    setErr('');
    const { error } = await supabase.from('tele_agents').update(patch).eq('id', a.id);
    if (error) setErr(errText(error)); else await reload();
  };
  const create = async () => {
    if (!add) return;
    setErr('');
    const { error } = await supabase.from('tele_agents').insert({ user_id: add, role: 'telecaller' });
    if (error) setErr(errText(error)); else { setAdd(''); await reload(); }
  };
  const remove = async (a: TeleAgent) => {
    if (!confirm(`Remove ${nameOf(a.user_id)} from Tele CRM? Their past calls stay in the history.`)) return;
    const { error } = await supabase.from('tele_agents').delete().eq('id', a.id);
    if (error) setErr(errText(error)); else await reload();
  };

  return (
    <div className={box}>
      <div className={head}>
        <span>Telecallers ({data.agents.length})</span>
        <span className="flex items-center gap-1.5 normal-case tracking-normal font-normal">
          <select value={add} onChange={(e) => setAdd(e.target.value)} className="h-8 rounded-lg border border-slate-300 px-2 text-xs" aria-label="Person to add">
            <option value="">Add a person of this company…</option>
            {free.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => void create()} disabled={!add} className="h-8 px-3 rounded-lg bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40"><Plus size={13} /> Add</button>
        </span>
      </div>
      {err && <p className="px-3 py-2 text-xs text-red-600">{err}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs no-stripe">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
            <tr>{['Telecaller', 'Mobile', 'Role', 'Make calls', 'Receive calls', 'Play recordings', 'Download', 'Now', 'Today', 'Missed', 'Follow-ups', 'Active', ''].map((h) => <th key={h} className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.agents.length === 0 && <tr><td colSpan={13} className="px-3 py-8 text-center text-slate-400">No telecallers yet. People are added to the company in User Management; add them here to let them call.</td></tr>}
            {data.agents.map((a) => {
              const mine = data.calls.filter((c) => c.agent_user_id === a.user_id);
              const td = mine.filter((c) => c.started_at.slice(0, 10) === today);
              return (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-2.5 py-2 font-semibold text-slate-800 whitespace-nowrap">{nameOf(a.user_id)}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap tabular-nums">{a.mobile_e164 ? <>{a.mobile_e164} <span className={a.mobile_status === 'verified' ? 'text-emerald-600' : 'text-amber-600'}>{a.mobile_status === 'verified' ? '✓' : '(not verified)'}</span></> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-2.5 py-2"><select value={a.role} onChange={(e) => void update(a, { role: e.target.value as TeleAgent['role'] })} className="h-7 rounded border border-slate-300 px-1 text-xs"><option value="telecaller">Telecaller</option><option value="supervisor">Supervisor</option></select></td>
                  <td className="px-2.5 py-2"><Toggle label="Make calls" on={a.can_call_out} onChange={(v) => void update(a, { can_call_out: v })} /></td>
                  <td className="px-2.5 py-2"><Toggle label="Receive calls" on={a.can_receive} onChange={(v) => void update(a, { can_receive: v })} /></td>
                  <td className="px-2.5 py-2"><Toggle label="Play recordings" on={a.can_listen} onChange={(v) => void update(a, { can_listen: v })} /></td>
                  <td className="px-2.5 py-2"><Toggle label="Download recordings" on={a.can_download} onChange={(v) => void update(a, { can_download: v })} /></td>
                  <td className="px-2.5 py-2 whitespace-nowrap"><span className={`inline-flex items-center gap-1 ${a.presence === 'available' ? 'text-emerald-700' : 'text-slate-500'}`}><span className={`h-2 w-2 rounded-full ${a.presence === 'available' ? 'bg-emerald-500' : 'bg-slate-400'}`} />{a.presence === 'available' ? 'Available' : 'Away'}</span></td>
                  <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">{td.length} · {fmtDuration(td.filter(isAnswered).reduce((n, c) => n + c.duration_seconds, 0))}</td>
                  <td className="px-2.5 py-2 tabular-nums text-red-600">{mine.filter((c) => c.status === 'missed').length}</td>
                  <td className="px-2.5 py-2 tabular-nums">{data.followups.filter((f) => f.assigned_user_id === a.user_id && f.status === 'pending').length}</td>
                  <td className="px-2.5 py-2"><Toggle label="Active" on={a.active} onChange={(v) => void update(a, { active: v })} /></td>
                  <td className="px-2.5 py-2"><button onClick={() => void remove(a)} className="h-7 w-7 rounded-lg border border-slate-200 text-slate-400 inline-flex items-center justify-center hover:text-red-600 hover:bg-red-50" title="Remove"><Trash2 size={12} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-100">Supervisors see and manage all Tele CRM data of the company. Telecallers see only their own contacts, calls and follow-ups.</p>
    </div>
  );
}

// ----------------------------------------------------------------------------- settings
export function SettingsTab({ data, reload, status, reloadStatus }: { data: TeleData; reload: () => Promise<void>; status: TeleStatus | null; reloadStatus: () => void }) {
  const [s, setS] = useState<Settings>(data.settings);
  useEffect(() => setS(data.settings), [data.settings]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(data.settings);

  const save = async () => {
    setSaving(true); setMsg(null);
    const row = { routing_mode: s.routing_mode, ring_seconds: s.ring_seconds, record_calls: s.record_calls, announce_recording: s.announce_recording, announcement_text: s.announcement_text, retention_days: s.retention_days, allow_download: s.allow_download, missed_call_followup: s.missed_call_followup, ...(data.settings.bridge_caller_id !== undefined && s.bridge_caller_id ? { bridge_caller_id: s.bridge_caller_id } : {}), updated_at: new Date().toISOString() };
    const { error } = data.settings.id ? await supabase.from('tele_settings').update(row).eq('id', data.settings.id) : await supabase.from('tele_settings').insert(row);
    if (!error) await supabase.from('tele_audit').insert({ action: 'settings.changed', detail: row });
    setSaving(false);
    if (error) setMsg({ ok: false, text: errText(error) }); else { setMsg({ ok: true, text: 'Saved.' }); await reload(); }
  };
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));

  return (
    <div className="grid xl:grid-cols-2 gap-3">
      <div className="space-y-3">
        <ConnectionCard status={status} />
        <NumbersCard status={status} reloadStatus={reloadStatus} />
        <AuditCard />
      </div>
      <div className="space-y-3">
        <div className={box}>
          <div className={head}><span>Call routing</span></div>
          <div className="p-3 space-y-3 text-sm">
            <label className="block text-xs font-semibold text-slate-600">When a customer calls
              <select value={s.routing_mode} onChange={(e) => set('routing_mode', e.target.value as Settings['routing_mode'])} className={`${input} w-full mt-1`}>
                <option value="assigned_then_all">Ring their assigned telecaller first, then everyone available</option>
                <option value="ring_all">Ring everyone available at the same time</option>
                <option value="round_robin">Ring one telecaller at a time, taking turns</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">Ring each step for (seconds)
              <input type="number" min={10} max={90} value={s.ring_seconds} onChange={(e) => set('ring_seconds', Math.min(90, Math.max(10, Number(e.target.value) || 25)))} className={`${input} w-24 text-right`} />
            </label>
            {data.settings.bridge_caller_id !== undefined && (
              <label className="block text-xs font-semibold text-slate-600">Number customers see when a telecaller calls through their mobile
                <select value={s.bridge_caller_id ?? 'agent_mobile'} onChange={(e) => set('bridge_caller_id', e.target.value as Settings['bridge_caller_id'])} className={`${input} w-full mt-1`}>
                  <option value="agent_mobile">The telecaller's own mobile (SIM) number</option>
                  <option value="business">The business number (when one is connected)</option>
                </select>
                <span className="block mt-1 font-normal text-[11px] text-slate-500">Calls to Indian numbers through an international provider may show a different number or "unknown" on the customer's phone, depending on the operator.</span>
              </label>
            )}
            <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">Create a follow-up for every missed call from a known contact
              <Toggle label="Missed call follow-up" on={s.missed_call_followup} onChange={(v) => set('missed_call_followup', v)} />
            </label>
            <RulesEditor data={data} reload={reload} />
          </div>
        </div>

        <div className={box}>
          <div className={head}><span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} /> Recording policy</span></div>
          <div className="p-3 space-y-3 text-xs font-semibold text-slate-600">
            <label className="flex items-center justify-between gap-3">Record calls (incoming and outgoing)
              <Toggle label="Record calls" on={s.record_calls} onChange={(v) => set('record_calls', v)} />
            </label>
            <label className="flex items-center justify-between gap-3">Tell the caller the call is recorded
              <Toggle label="Recording announcement" on={s.announce_recording} disabled={!s.record_calls} onChange={(v) => set('announce_recording', v)} />
            </label>
            {s.record_calls && s.announce_recording && (
              <label className="block">Announcement
                <textarea value={s.announcement_text} onChange={(e) => set('announcement_text', e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-normal" />
              </label>
            )}
            {s.record_calls && !s.announce_recording && (
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 font-normal text-amber-800"><TriangleAlert size={13} className="mt-0.5 shrink-0" />Recording without telling the caller may not be allowed. For patients and customers, keep the announcement on unless you have their consent in another way.</p>
            )}
            <label className="flex items-center justify-between gap-3">Delete recordings automatically after (days)
              <input type="number" min={1} max={3650} value={s.retention_days} onChange={(e) => set('retention_days', Math.min(3650, Math.max(1, Number(e.target.value) || 90)))} className={`${input} w-24 text-right font-normal`} />
            </label>
            <label className="flex items-center justify-between gap-3">Allow downloading recordings (only people given the Download permission)
              <Toggle label="Allow download" on={s.allow_download} onChange={(v) => set('allow_download', v)} />
            </label>
            <p className="font-normal text-slate-500">Recordings are never public: they play only through a private link that works for 5 minutes, for people allowed to hear them, and every play / download is logged. A new retention period applies to recordings made from now on.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</span>}
          <button onClick={() => setS(data.settings)} disabled={!dirty || saving} className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-40">Undo changes</button>
          <button onClick={() => void save()} disabled={!dirty || saving} className="h-9 px-4 rounded-lg bg-orange-600 text-white text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1.5">{saving && <Loader2 size={13} className="animate-spin" />}Save settings</button>
        </div>
      </div>
    </div>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 text-slate-500">{label}</span>
      <code className="flex-1 min-w-0 truncate rounded bg-slate-50 border border-slate-200 px-2 py-1 text-[11px]">{value}</code>
      <button onClick={() => { void navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }} className="h-7 w-7 shrink-0 rounded border border-slate-200 inline-flex items-center justify-center text-slate-500 hover:bg-slate-50" title="Copy">{done ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Copy size={12} />}</button>
    </div>
  );
}

function ConnectionCard({ status }: { status: TeleStatus | null }) {
  if (!status) return <div className={`${box} p-3 text-xs text-slate-500`}>Checking the cloud phone connection…</div>;
  return (
    <div className={box}>
      <div className={head}><span>Cloud phone connection</span>
        <span className={`normal-case tracking-normal text-[11px] font-semibold ${status.configured ? 'text-emerald-700' : 'text-amber-700'}`}>{status.configured ? `Connected: ${status.provider}` : 'Not connected'}</span>
      </div>
      <div className="p-3 space-y-2 text-xs text-slate-600">
        {!status.configured ? (
          <>
            <p>Calling starts once a cloud phone provider account is connected on the server. Your server administrator adds these settings to the server's environment (values stay on the server, never in the app):</p>
            <ul className="space-y-1">{status.missing.map((m) => <li key={m}><code className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[11px] text-amber-900">{m}</code></li>)}</ul>
            <p className="text-slate-500">Supported providers: {status.supported.join(', ')} (set <code>TELEPHONY_PROVIDER</code> to one of these). After that, connect the company's number below.</p>
          </>
        ) : (
          <>
            <p>The provider is configured. Calls through the agents' mobiles (bridge calling) work with this; numbers connected below are set up automatically.</p>
            {!!status.missingBrowser?.length && (
              <p className="text-slate-500">Optional, only for calling from the computer: {status.missingBrowser.map((m) => <code key={m} className="mx-0.5 rounded bg-slate-50 border border-slate-200 px-1 py-0.5 text-[11px]">{m}</code>)}. The calling app's voice address for it is below.</p>
            )}
          </>
        )}
        {status.webhookBase && (
          <div className="space-y-1.5 pt-1">
            <CopyLine label="Voice address" value={`${status.webhookBase}/voice`} />
            <CopyLine label="Status address" value={`${status.webhookBase}/status`} />
          </div>
        )}
      </div>
    </div>
  );
}

function NumbersCard({ status, reloadStatus }: { status: TeleStatus | null; reloadStatus: () => void }) {
  const [num, setNum] = useState('');
  const [label, setLabel] = useState('');
  const [def, setDef] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const connect = async () => {
    setBusy(true); setMsg(null);
    try { const r = await teleApi.connectNumber(num, label, def || !status?.numbers.length); setMsg({ ok: true, text: `${r.e164} is connected and set up to ring in Tele CRM.` }); setNum(''); setLabel(''); reloadStatus(); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  };
  const disconnect = async (id: string, e164: string) => {
    if (!confirm(`Disconnect ${e164} from this company? Calls to it will no longer ring here.`)) return;
    try { await teleApi.disconnectNumber(id); reloadStatus(); } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  };
  return (
    <div className={box}>
      <div className={head}><span>Business numbers</span></div>
      <div className="p-3 space-y-2">
        {(status?.numbers ?? []).length === 0 && <p className="text-xs text-slate-500">No number connected yet.</p>}
        {(status?.numbers ?? []).map((n) => (
          <div key={n.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums">{n.is_default && <Star size={12} className="text-amber-500 fill-amber-400" />}{n.e164}<span className="font-normal text-xs text-slate-500">{n.label}</span></span>
            <button onClick={() => void disconnect(n.id, n.e164)} className="text-xs text-red-600 hover:underline">Disconnect</button>
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="+91 80 1234 5678" inputMode="tel" className={`${input} flex-1 min-w-[150px] tabular-nums`} aria-label="Number" />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Reception)" className={`${input} flex-1 min-w-[130px]`} aria-label="Label" />
          <label className="inline-flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={def} onChange={(e) => setDef(e.target.checked)} /> Default caller ID</label>
          <button onClick={() => void connect()} disabled={busy || !num.trim() || !status?.configured} className="h-9 px-3 rounded-lg bg-orange-600 text-white text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1">{busy && <Loader2 size={13} className="animate-spin" />}Connect number</button>
        </div>
        {!status?.configured && <p className="text-[11px] text-slate-500">Connect the cloud phone provider first.</p>}
        <p className="text-[11px] text-slate-500">A number you got from the cloud phone provider (not a mobile SIM). It is checked in that account before it is connected.</p>
        <p className="text-[11px] text-slate-500">Optional for calling out through mobiles (customers can see the telecaller's own SIM). Needed to <b>receive</b> customer calls in Tele CRM: calls to it ring the telecallers' verified mobiles. A telecaller connects their own SIM in the Phone tab.</p>
        {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>}
      </div>
    </div>
  );
}

function RulesEditor({ data, reload }: { data: TeleData; reload: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [r, setR] = useState<Partial<Rule>>({ name: '', contact_type: '', agent_user_ids: [], priority: 100 });
  const [err, setErr] = useState('');
  const nameOf = useMemo(() => new Map(data.people.map((p) => [p.id, p.name])), [data.people]);
  const save = async () => {
    if (!r.agent_user_ids?.length) { setErr('Pick at least one telecaller.'); return; }
    const { error } = await supabase.from('tele_routing_rules').insert({ name: r.name || 'Rule', contact_type: r.contact_type || '', agent_user_ids: r.agent_user_ids, priority: r.priority ?? 100, active: true });
    if (error) { setErr(errText(error)); return; }
    setAdding(false); setR({ name: '', contact_type: '', agent_user_ids: [], priority: 100 }); setErr(''); await reload();
  };
  const del = async (id: string) => { const { error } = await supabase.from('tele_routing_rules').delete().eq('id', id); if (error) setErr(errText(error)); else await reload(); };
  return (
    <div className="pt-1">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">Special routing rules <button onClick={() => setAdding((a) => !a)} className="text-orange-700 hover:underline">{adding ? 'Close' : '+ Add rule'}</button></div>
      {data.rules.length === 0 && !adding && <p className="text-[11px] text-slate-500 mt-1">None: calls follow the setting above. Add a rule to send, say, patients to a specific team.</p>}
      {data.rules.map((x) => (
        <div key={x.id} className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">
          <span><b>{x.name}</b> · {x.contact_type ? `${x.contact_type} callers` : 'all callers'} → {x.agent_user_ids.map((id) => nameOf.get(id) ?? '?').join(', ')}</span>
          <button onClick={() => void del(x.id)} className="text-slate-400 hover:text-red-600" title="Delete rule"><Trash2 size={12} /></button>
        </div>
      ))}
      {adding && (
        <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50/40 p-2 space-y-1.5 text-xs">
          <div className="flex gap-1.5">
            <input value={r.name ?? ''} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Rule name" className={`${input} flex-1 h-8 text-xs`} />
            <select value={r.contact_type ?? ''} onChange={(e) => setR({ ...r, contact_type: e.target.value })} className={`${input} h-8 text-xs`}><option value="">Any caller</option>{CONTACT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div className="flex flex-wrap gap-1">
            {data.agents.filter((a) => a.active).map((a) => {
              const on = r.agent_user_ids?.includes(a.user_id);
              return <button key={a.user_id} onClick={() => setR({ ...r, agent_user_ids: on ? r.agent_user_ids!.filter((x) => x !== a.user_id) : [...(r.agent_user_ids ?? []), a.user_id] })}
                className={`px-2 py-0.5 rounded-full border ${on ? 'bg-orange-600 text-white border-orange-600' : 'bg-white border-slate-200 text-slate-600'}`}>{nameOf.get(a.user_id) ?? '?'}</button>;
            })}
          </div>
          {err && <p className="text-red-600">{err}</p>}
          <button onClick={() => void save()} className="h-8 px-3 rounded-lg bg-orange-600 text-white font-semibold">Save rule</button>
        </div>
      )}
    </div>
  );
}

function AuditCard() {
  const [rows, setRows] = useState<{ id: string; action: string; target: string; actor_id: string | null; created_at: string }[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('tele_audit').select('id, action, target, actor_id, created_at').order('created_at', { ascending: false }).limit(60);
      setRows((data ?? []) as typeof rows);
      const ids = Array.from(new Set((data ?? []).map((r) => r.actor_id).filter(Boolean))) as string[];
      if (ids.length) { const { data: u } = await supabase.from('company_users').select('id, full_name, email').in('id', ids); setNames(new Map((u ?? []).map((x) => [x.id as string, (x.full_name as string) || (x.email as string)]))); }
    })();
  }, []);
  const label: Record<string, string> = {
    'recording.played': 'Played a recording', 'recording.downloaded': 'Downloaded a recording', 'recording.deleted': 'Deleted a recording', 'recording.expired': 'Recording deleted (retention)',
    'number.connected': 'Connected number', 'number.disconnected': 'Disconnected number', 'call.transferred': 'Transferred a call', 'settings.changed': 'Changed settings',
  };
  return (
    <div className={box}>
      <div className={head}><span>Audit log</span></div>
      <div className="max-h-64 overflow-auto divide-y divide-slate-50">
        {rows.length === 0 && <p className="p-3 text-xs text-slate-500">Nothing logged yet.</p>}
        {rows.map((r) => (
          <div key={r.id} className="px-3 py-1.5 text-xs flex justify-between gap-2">
            <span><b className="text-slate-700">{r.actor_id ? names.get(r.actor_id) ?? 'Someone' : 'System'}</b> · {label[r.action] ?? r.action}{r.action.startsWith('number') ? ` ${r.target}` : ''}</span>
            <span className="text-slate-400 whitespace-nowrap">{fmtDateTime(r.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
