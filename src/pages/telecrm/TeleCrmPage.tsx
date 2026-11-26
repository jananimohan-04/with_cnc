// Tele CRM (Sales > Tele CRM, /telecrm): cloud-phone calling for telecalling teams (hospitals, clinics, any business).
// Tabs: Dashboard · Phone · Contacts · Call History · Follow-ups · Team · Settings.
// Calls are made / answered in the browser through the cloud phone provider configured on the server
// (server/telecrm); this page never shows a call that did not really happen: call rows are written only by the
// server from the provider's webhooks. Data: tele_* tables (migration 20261126000000_tele_crm.sql).

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarClock, Clock, Contact as ContactIcon, Delete, History, Loader2, Phone, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, RefreshCw, Search, Settings2, Timer, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useGlobalDateFilter } from '@/contexts/DateRangeContext';
import { intersectRange } from '@/lib/globalDate';
import { BarChart, DonutChart } from '@/components/ui/Charts';
import { usePhone, MobileConnect } from '@/lib/telecrm/phone';
import { fmtDuration, teleApi, type TeleStatus } from '@/lib/telecrm/api';
import { useTeleData, isAnswered, dayISO, STATUS_STYLE, statusLabel, fmtDateTime, CALL_STATUSES, type Contact } from './shared';
import { ContactsTab, FollowupsTab } from './TeleContacts';
import { CallHistoryTab } from './TeleCalls';
import { TeamTab, SettingsTab } from './TeleAdmin';

type Tab = 'dashboard' | 'phone' | 'contacts' | 'calls' | 'followups' | 'team' | 'settings';

export function TeleCrmPage() {
  const { profile, isCompanyAdmin, isSuperAdmin } = useAuth();
  const me = profile?.id ?? '';
  const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem('telecrm.tab') as Tab) || 'dashboard'; } catch { return 'dashboard'; } });
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem('telecrm.tab', t); } catch { /* not saved */ } };

  // dates: last 30 days by default, narrowed by the top-bar date filter
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 29); return dayISO(d); });
  const [to, setTo] = useState(() => dayISO());
  const g = useGlobalDateFilter();
  const eff = intersectRange(from, to, g.from, g.to);
  const { data, setData, loading, error, setupNeeded, reload } = useTeleData(eff.from, eff.to);

  const [status, setStatus] = useState<TeleStatus | null>(null);
  const [statusErr, setStatusErr] = useState('');
  const loadStatus = () => { teleApi.status().then((s) => { setStatus(s); setStatusErr(''); }).catch((e) => setStatusErr(e instanceof Error ? e.message : String(e))); };
  useEffect(loadStatus, []);

  const myAgent = data.agents.find((a) => a.user_id === me && a.active);
  const isManager = isCompanyAdmin || isSuperAdmin || myAgent?.role === 'supervisor';
  const nameOf = useMemo(() => { const m = new Map(data.people.map((p) => [p.id, p.name])); return (id: string | null) => (id ? m.get(id) ?? '—' : '—'); }, [data.people]);

  const tabs: { key: Tab; label: string; icon: typeof Phone; managers?: boolean; badge?: number }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'phone', label: 'Phone', icon: Phone },
    { key: 'contacts', label: 'Contacts', icon: ContactIcon },
    { key: 'calls', label: 'Call History', icon: History },
    { key: 'followups', label: 'Follow-ups', icon: CalendarClock, badge: data.followups.filter((f) => f.status === 'pending' && new Date(f.due_at) <= new Date()).length },
    { key: 'team', label: 'Team', icon: Users, managers: true },
    { key: 'settings', label: 'Settings', icon: Settings2, managers: true },
  ];

  return (
    <div className="space-y-3">
      {/* tab bar + date range */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-1 rounded-xl bg-white border border-slate-200 p-1 shadow-sm">
          {tabs.filter((t) => !t.managers || isManager).map((t) => (
            <button key={t.key} onClick={() => pick(t.key)} data-testid={`tele-tab-${t.key}`}
              className={`relative inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition ${tab === t.key ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-600 hover:bg-orange-50 hover:text-orange-700'}`}>
              <t.icon size={14} />{t.label}
              {!!t.badge && <span className={`ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] leading-[18px] ${tab === t.key ? 'bg-white text-orange-700' : 'bg-red-600 text-white'}`}>{t.badge}</span>}
            </button>
          ))}
        </div>
        {(tab === 'dashboard' || tab === 'calls') && (
          <div className="flex items-center gap-1.5 text-xs">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2" aria-label="From date" />
            <span className="text-slate-400">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2" aria-label="To date" />
            <button onClick={() => void reload()} className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" title="Refresh"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          </div>
        )}
      </div>

      <ConnectionBanner status={status} statusErr={statusErr} isManager={isManager} onSettings={() => pick('settings')} />

      {setupNeeded ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Tele CRM is not set up in the database yet. Run the SQL file <b>20261126000000_tele_crm.sql</b> once, then refresh this page.
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : loading && !data.calls.length && !data.contacts.length && !data.agents.length ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 p-6"><Loader2 size={16} className="animate-spin" /> Loading Tele CRM…</div>
      ) : (
        <>
          {tab === 'dashboard' && <DashboardTab data={data} nameOf={nameOf} isManager={isManager} me={me} />}
          {tab === 'phone' && <PhoneTab contacts={data.contacts} calls={data.calls} me={me} nameOf={nameOf} />}
          {tab === 'contacts' && <ContactsTab data={data} setData={setData} reload={reload} isManager={isManager} me={me} nameOf={nameOf} />}
          {tab === 'calls' && <CallHistoryTab data={data} reload={reload} isManager={isManager} nameOf={nameOf} settings={data.settings} myAgent={myAgent} />}
          {tab === 'followups' && <FollowupsTab data={data} reload={reload} isManager={isManager} me={me} nameOf={nameOf} />}
          {tab === 'team' && isManager && <TeamTab data={data} reload={reload} nameOf={nameOf} />}
          {tab === 'settings' && isManager && <SettingsTab data={data} reload={reload} status={status} reloadStatus={loadStatus} />}
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------- connection state (honest)
function ConnectionBanner({ status, statusErr, isManager, onSettings }: { status: TeleStatus | null; statusErr: string; isManager: boolean; onSettings: () => void }) {
  const phone = usePhone();
  if (statusErr) return <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{statusErr}</div>;
  if (!status) return null;
  let tone = 'border-amber-200 bg-amber-50 text-amber-900';
  let text: string;
  if (!status.configured) text = 'Calling is not active: no cloud phone provider is configured on the server yet. Contacts, notes and follow-ups work now; calls start once the provider is connected.';
  else if (!status.numbers.length) text = 'The cloud phone provider is configured, but no business number is connected to this company yet.';
  else if (!status.me.agent) text = `Business number ${status.numbers.map((n) => n.e164).join(', ')} is connected. You are not set up as a telecaller, so calls will not ring for you.`;
  else if (phone?.callVia === 'mobile') {
    const a = status.me.agent;
    if (a.mobile_status === 'verified') { tone = 'border-emerald-200 bg-emerald-50 text-emerald-800'; text = `Calls ring your mobile ${a.mobile_e164} first, then the customer, from ${status.numbers.find((n) => n.is_default)?.e164 ?? status.numbers[0].e164}.`; }
    else text = 'Connect and verify your mobile in the Phone tab to start calling.';
  }
  else if (phone?.state === 'ready') { tone = 'border-emerald-200 bg-emerald-50 text-emerald-800'; text = `Phone ready on ${status.numbers.find((n) => n.is_default)?.e164 ?? status.numbers[0].e164}${status.me.agent.presence === 'away' ? ' · you are set to Away (incoming calls will not ring)' : ''}.`; }
  else if (phone?.state === 'starting') text = 'Starting the phone…';
  else if (phone?.state === 'error') { tone = 'border-red-200 bg-red-50 text-red-700'; text = `The phone could not start: ${phone.error}`; }
  else text = 'The phone is off.';
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${tone}`} data-testid="tele-connection">
      <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${phone?.state === 'ready' || (phone?.callVia === 'mobile' && status.me.agent?.mobile_status === 'verified') ? 'bg-emerald-500 animate-pulse' : 'bg-current opacity-60'}`} />{text}</span>
      <span className="flex gap-1.5">
        {phone?.state === 'error' && <button onClick={phone.restart} className="font-semibold underline">Retry</button>}
        {isManager && (!status.configured || !status.numbers.length) && <button onClick={onSettings} className="font-semibold underline">Open settings</button>}
      </span>
    </div>
  );
}

// ----------------------------------------------------------------------------- dashboard
function DashboardTab({ data, nameOf, isManager, me }: { data: ReturnType<typeof useTeleData>['data']; nameOf: (id: string | null) => string; isManager: boolean; me: string }) {
  const [agent, setAgent] = useState('');
  const [st, setSt] = useState('');
  const calls = data.calls.filter((c) => (!agent || c.agent_user_id === agent) && (!st || c.status === st));
  const answered = calls.filter(isAnswered);
  const talk = answered.reduce((n, c) => n + (c.duration_seconds || 0), 0);
  const due = data.followups.filter((f) => f.status === 'pending' && new Date(f.due_at) <= new Date() && (!agent || f.assigned_user_id === agent));

  const days = useMemo(() => {
    const m = new Map<string, { label: string; inbound: number; outbound: number; missed: number }>();
    for (const c of calls.slice().reverse()) {
      const d = c.started_at.slice(0, 10);
      const row = m.get(d) ?? { label: new Date(c.started_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), inbound: 0, outbound: 0, missed: 0 };
      if (c.status === 'missed') row.missed += 1; else if (c.direction === 'inbound') row.inbound += 1; else row.outbound += 1;
      m.set(d, row);
    }
    return Array.from(m.values()).slice(-21);
  }, [calls]);

  const perf = useMemo(() => {
    const ids = new Set<string>([...data.agents.filter((a) => a.active).map((a) => a.user_id), ...calls.map((c) => c.agent_user_id).filter(Boolean) as string[]]);
    return Array.from(ids).map((id) => {
      const mine = calls.filter((c) => c.agent_user_id === id);
      const ans = mine.filter(isAnswered);
      const t = ans.reduce((n, c) => n + (c.duration_seconds || 0), 0);
      return {
        id, name: nameOf(id), total: mine.length, inbound: mine.filter((c) => c.direction === 'inbound').length, outbound: mine.filter((c) => c.direction === 'outbound').length,
        answered: ans.length, missed: mine.filter((c) => c.status === 'missed').length, talk: t, avg: ans.length ? t / ans.length : 0,
        pending: data.followups.filter((f) => f.status === 'pending' && f.assigned_user_id === id).length,
      };
    }).filter((r) => isManager || r.id === me).sort((a, b) => b.total - a.total);
  }, [calls, data.agents, data.followups, nameOf, isManager, me]);

  const kpis = [
    { label: 'Total Calls', value: calls.length, icon: PhoneCall, tone: 'text-slate-800' },
    { label: 'Incoming', value: calls.filter((c) => c.direction === 'inbound').length, icon: PhoneIncoming, tone: 'text-sky-700' },
    { label: 'Outgoing', value: calls.filter((c) => c.direction === 'outbound').length, icon: PhoneOutgoing, tone: 'text-indigo-700' },
    { label: 'Answered', value: answered.length, icon: Phone, tone: 'text-emerald-700' },
    { label: 'Missed', value: calls.filter((c) => c.status === 'missed').length, icon: PhoneMissed, tone: 'text-red-600' },
    { label: 'Avg Duration', value: fmtDuration(answered.length ? talk / answered.length : 0), icon: Timer, tone: 'text-slate-800' },
    { label: 'Total Duration', value: fmtDuration(talk), icon: Clock, tone: 'text-slate-800' },
    { label: 'Follow-ups Due', value: due.length, icon: CalendarClock, tone: due.length ? 'text-orange-600' : 'text-slate-800' },
  ];
  const byStatus = CALL_STATUSES.map((s, i) => ({ label: statusLabel(s), value: calls.filter((c) => c.status === s).length, color: ['#10b981', '#ef4444', '#0ea5e9', '#f59e0b', '#f97316', '#dc2626', '#94a3b8', '#64748b', '#cbd5e1'][i] })).filter((x) => x.value);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {isManager && (
          <select value={agent} onChange={(e) => setAgent(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2" aria-label="Telecaller">
            <option value="">All telecallers</option>
            {perf.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select value={st} onChange={(e) => setSt(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2" aria-label="Call status">
          <option value="">All statuses</option>
          {CALL_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 shadow-sm">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.label}<k.icon size={14} className="text-slate-400" /></div>
            <div className={`mt-1 text-xl font-bold tabular-nums ${k.tone}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 rounded-xl bg-white border border-slate-200 p-3 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Calls by day</div>
          {days.length ? <BarChart data={days} height={210} series={[{ key: 'inbound', color: '#0ea5e9', label: 'Incoming' }, { key: 'outbound', color: '#6366f1', label: 'Outgoing' }, { key: 'missed', color: '#ef4444', label: 'Missed' }]} />
            : <p className="text-sm text-slate-400 py-10 text-center">No calls in this period.</p>}
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Call status</div>
          {byStatus.length ? <div className="flex flex-col items-center"><DonutChart data={byStatus} size={170} />
            <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-slate-600">{byStatus.map((b) => <span key={b.label} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: b.color }} />{b.label} {b.value}</span>)}</div></div>
            : <p className="text-sm text-slate-400 py-10 text-center">No calls in this period.</p>}
        </div>
      </div>

      <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 border-b border-slate-100">Telecaller performance</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs no-stripe">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide">
              <tr>{['Telecaller', 'Calls', 'In', 'Out', 'Answered', 'Missed', 'Answer rate', 'Talk time', 'Avg', 'Follow-ups pending'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {perf.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-400">No telecallers yet. Add them in the Team tab.</td></tr>}
              {perf.map((p) => {
                const rate = p.total ? Math.round((p.answered / p.total) * 100) : 0;
                return (
                  <tr key={p.id} className="border-t border-slate-100 hover:bg-orange-50/40">
                    <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{p.name}</td>
                    <td className="px-3 py-2 tabular-nums">{p.total}</td>
                    <td className="px-3 py-2 tabular-nums">{p.inbound}</td>
                    <td className="px-3 py-2 tabular-nums">{p.outbound}</td>
                    <td className="px-3 py-2 tabular-nums text-emerald-700">{p.answered}</td>
                    <td className="px-3 py-2 tabular-nums text-red-600">{p.missed}</td>
                    <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${rate}%` }} /></div><span className="tabular-nums">{rate}%</span></div></td>
                    <td className="px-3 py-2 tabular-nums">{fmtDuration(p.talk)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtDuration(p.avg)}</td>
                    <td className="px-3 py-2 tabular-nums">{p.pending}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------- phone / dialer
function PhoneTab({ contacts, calls, me, nameOf }: { contacts: Contact[]; calls: ReturnType<typeof useTeleData>['data']['calls']; me: string; nameOf: (id: string | null) => string }) {
  const phone = usePhone();
  const [num, setNum] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const ready = !!phone?.canCall;
  const onCall = !!phone?.call && phone.call.phase !== 'ended';
  const go = async (n: string, c?: Contact) => {
    setErr('');
    try { await phone?.dial(n, c ? { id: c.id, name: c.name, phone: c.phone, contact_type: c.contact_type, status: c.status, assigned_user_id: c.assigned_user_id, notes: c.notes } : null); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? contacts.filter((c) => c.name.toLowerCase().includes(s) || c.phone.replace(/\D/g, '').includes(s.replace(/\D/g, '') || '§') || c.contact_type.toLowerCase().includes(s)) : contacts;
    return list.slice(0, 60);
  }, [contacts, q]);
  const recent = calls.filter((c) => c.agent_user_id === me).slice(0, 12);
  const contactOf = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const why = !phone ? 'Calling is not active for you yet.'
    : phone.callVia === 'mobile' ? (!phone.canCall ? 'Calling is not active for you yet (see the message above).' : phone.status?.me.agent?.mobile_status !== 'verified' ? 'Verify your mobile below before calling.' : '')
    : phone.state === 'off' ? 'Calling is not active for you yet (see the message above).' : phone.state === 'starting' ? 'Starting the phone…' : phone.state === 'error' ? phone.error : !phone.canCallOut ? 'You are not allowed to make outgoing calls.' : '';

  return (
    <div className="grid lg:grid-cols-[320px,1fr] gap-3">
      <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-sm">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">Dial a number</div>
        <div className="flex items-center gap-1 rounded-xl border border-slate-300 px-2 h-12 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20">
          <input value={num} onChange={(e) => setNum(e.target.value.replace(/[^\d+\s\-()]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter' && ready && num.trim()) void go(num); }}
            placeholder="+91 98765 43210" inputMode="tel" className="flex-1 min-w-0 text-lg font-semibold tracking-wide tabular-nums outline-none bg-transparent" aria-label="Phone number" />
          {num && <button onClick={() => setNum((n) => n.slice(0, -1))} className="text-slate-400 hover:text-slate-700" aria-label="Delete digit"><Delete size={18} /></button>}
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '0', '#'].map((k) => (
            <button key={k} onClick={() => setNum((n) => n + k)} className="h-11 rounded-xl bg-slate-50 border border-slate-200 text-lg font-semibold text-slate-700 hover:bg-orange-50 hover:border-orange-200 active:scale-95 transition">{k}</button>
          ))}
        </div>
        <button disabled={!ready || !num.trim() || onCall} onClick={() => void go(num)} className="mt-2 w-full h-11 rounded-xl bg-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-40">
          <Phone size={17} /> Call
        </button>
        {(why || err) && <p className="mt-2 text-xs text-slate-500">{err || why}</p>}
        {phone?.status?.bridgeCalling && phone.status.me.agent && phone.status.me.agent.mobile_status !== undefined && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="font-bold uppercase tracking-wide text-[10px] text-slate-500">Call through</span>
              <span className="inline-flex rounded-lg border border-slate-200 p-0.5">
                {(['mobile', 'browser'] as const).map((v) => (
                  <button key={v} onClick={() => void phone.setCallVia(v).catch((e) => setErr(e instanceof Error ? e.message : String(e)))}
                    className={`h-6 px-2 rounded-md text-[11px] font-semibold ${phone.callVia === v ? 'bg-orange-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{v === 'mobile' ? 'My mobile' : 'This computer'}</button>
                ))}
              </span>
            </div>
            {phone.callVia === 'mobile' && <MobileConnect />}
          </div>
        )}
        {phone?.status?.me.agent && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Incoming calls</span>
            <PresenceToggle />
          </div>
        )}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col min-h-[320px]">
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts by name, number or type" className="w-full h-9 rounded-lg border border-slate-300 pl-8 pr-2 text-sm" />
            </div>
          </div>
          <div className="flex-1 overflow-auto max-h-[460px]">
            {found.length === 0 && <p className="p-4 text-sm text-slate-400">No contacts found.</p>}
            {found.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-50 hover:bg-orange-50/40">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">{c.name || c.phone}</div>
                  <div className="text-[11px] text-slate-500 truncate">{c.phone} · {c.contact_type} · {c.status}</div>
                </div>
                <button disabled={!ready || onCall || c.status === 'Do not call'} onClick={() => void go(c.phone, c)} title={c.status === 'Do not call' ? 'Marked do not call' : `Call ${c.phone}`}
                  className="shrink-0 h-8 w-8 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center hover:bg-emerald-700 disabled:opacity-30"><Phone size={14} /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 border-b border-slate-100">My recent calls</div>
          {recent.length === 0 && <p className="p-4 text-sm text-slate-400">No calls yet.</p>}
          {recent.map((c) => {
            const ct = c.contact_id ? contactOf.get(c.contact_id) : undefined;
            return (
              <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-50">
                <div className="min-w-0 flex items-center gap-2">
                  {c.status === 'missed' ? <PhoneMissed size={15} className="text-red-500 shrink-0" /> : c.direction === 'inbound' ? <PhoneIncoming size={15} className="text-sky-600 shrink-0" /> : <PhoneOutgoing size={15} className="text-indigo-600 shrink-0" />}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{ct?.name || c.customer_number}</div>
                    <div className="text-[11px] text-slate-500">{fmtDateTime(c.started_at)} · {fmtDuration(c.duration_seconds)}{c.transferred_to ? ` · moved to ${nameOf(c.transferred_to)}` : ''}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_STYLE[c.status] ?? STATUS_STYLE.initiated}`}>{statusLabel(c.status, c.direction)}</span>
                  <button disabled={!ready || onCall} onClick={() => void go(c.customer_number, ct)} className="h-7 w-7 rounded-full border border-emerald-300 text-emerald-700 inline-flex items-center justify-center hover:bg-emerald-50 disabled:opacity-30" title="Call back"><Phone size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PresenceToggle() {
  const phone = usePhone();
  const agent = phone?.status?.me.agent;
  const [away, setAway] = useState(agent?.presence === 'away');
  const [busy, setBusy] = useState(false);
  const flip = async () => {
    setBusy(true);
    const next = away ? 'available' : 'away';
    const { error } = await supabase.rpc('tele_set_presence', { p_presence: next });
    if (!error) setAway(!away);
    setBusy(false);
  };
  return (
    <button onClick={() => void flip()} disabled={busy} className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold border ${away ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}`}>
      <span className={`h-2 w-2 rounded-full ${away ? 'bg-slate-400' : 'bg-emerald-500'}`} />{away ? 'Away' : 'Available'}
    </button>
  );
}
