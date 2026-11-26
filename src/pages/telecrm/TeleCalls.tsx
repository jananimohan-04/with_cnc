// Tele CRM: Call History. Recordings play through a 5-minute private link from our server (permission-checked and
// logged); the provider's own recording address is never sent to the browser.

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileAudio, Loader2, Pause, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Play, Search, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePhone } from '@/lib/telecrm/phone';
import { fmtDuration, teleApi, type TeleAgent } from '@/lib/telecrm/api';
import { exportCsv } from '@/lib/reportExport';
import { CALL_STATUSES, STATUS_STYLE, errText, fmtDateTime, statusLabel, type CallRow, type Recording, type Settings, type TeleData } from './shared';

export function CallHistoryTab({ data, reload, isManager, nameOf, settings, myAgent }: {
  data: TeleData; reload: () => Promise<void>; isManager: boolean; nameOf: (id: string | null) => string; settings: Settings; myAgent?: TeleAgent;
}) {
  const phone = usePhone();
  const ready = !!phone?.canCall && !(phone.call && phone.call.phase !== 'ended');
  const [q, setQ] = useState('');
  const [agent, setAgent] = useState('');
  const [st, setSt] = useState('');
  const [dir, setDir] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const contactOf = useMemo(() => new Map(data.contacts.map((c) => [c.id, c])), [data.contacts]);
  const recsOf = useMemo(() => { const m = new Map<string, Recording[]>(); for (const r of data.recordings) m.set(r.call_id, [...(m.get(r.call_id) ?? []), r]); return m; }, [data.recordings]);
  const notesOf = useMemo(() => { const m = new Map<string, typeof data.notes>(); for (const n of data.notes) if (n.call_id) m.set(n.call_id, [...(m.get(n.call_id) ?? []), n]); return m; }, [data.notes]);
  const fuOf = useMemo(() => { const m = new Map<string, string>(); for (const f of data.followups) if (f.call_id) m.set(f.call_id, f.status); return m; }, [data.followups]);
  const canListen = isManager || !!myAgent?.can_listen;
  const canDownload = settings.allow_download && (isManager || !!myAgent?.can_download);

  const rows = data.calls.filter((c) => {
    if (agent && c.agent_user_id !== agent) return false;
    if (st && c.status !== st) return false;
    if (dir && c.direction !== dir) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    const ct = c.contact_id ? contactOf.get(c.contact_id) : undefined;
    const digits = s.replace(/\D/g, '');
    return (ct?.name.toLowerCase().includes(s)) || (digits.length >= 3 && c.customer_number.replace(/\D/g, '').includes(digits));
  });

  const exportRows = () => exportCsv(`call-history-${new Date().toISOString().slice(0, 10)}`, [
    ['Started', 'Direction', 'Contact', 'Number', 'Telecaller', 'Status', 'Duration (s)', 'Recording', 'Notes', 'Follow-up'],
    ...rows.map((c) => [fmtDateTime(c.started_at), c.direction === 'inbound' ? 'Incoming' : 'Outgoing', (c.contact_id && contactOf.get(c.contact_id)?.name) || '', c.customer_number,
      nameOf(c.agent_user_id), statusLabel(c.status, c.direction), c.duration_seconds, (recsOf.get(c.id) ?? []).some((r) => r.status === 'available') ? 'Yes' : 'No',
      (notesOf.get(c.id) ?? []).map((n) => [n.outcome, n.body].filter(Boolean).join(': ')).join(' | '), fuOf.get(c.id) ?? '']),
  ]);

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-100">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contact or number" className="w-full h-9 rounded-lg border border-slate-300 pl-8 pr-2 text-sm" />
        </div>
        <select value={dir} onChange={(e) => setDir(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-xs" aria-label="Direction"><option value="">In & out</option><option value="inbound">Incoming</option><option value="outbound">Outgoing</option></select>
        <select value={st} onChange={(e) => setSt(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-xs" aria-label="Status"><option value="">All statuses</option>{CALL_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select>
        {isManager && <select value={agent} onChange={(e) => setAgent(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-xs" aria-label="Telecaller"><option value="">All telecallers</option>{data.agents.map((a) => <option key={a.user_id} value={a.user_id}>{nameOf(a.user_id)}</option>)}</select>}
        <button onClick={exportRows} className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50">Export</button>
      </div>
      <div className="overflow-x-auto max-h-[calc(100dvh-280px)]">
        <table className="w-full text-xs no-stripe">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide sticky top-0 z-10">
            <tr>{['', 'Started', 'Contact', 'Telecaller', 'Status', 'Duration', 'Recording', 'Notes', 'Follow-up', ''].map((h, i) => <th key={i} className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">No calls in this period.</td></tr>}
            {rows.slice(0, 600).map((c) => {
              const ct = c.contact_id ? contactOf.get(c.contact_id) : undefined;
              const recs = (recsOf.get(c.id) ?? []).filter((r) => r.status === 'available');
              const notes = notesOf.get(c.id) ?? [];
              const isOpen = open === c.id;
              return (
                <Fragment key={c.id}>
                  <tr className={`border-t border-slate-100 hover:bg-orange-50/40 ${isOpen ? 'bg-orange-50/60' : ''}`}>
                    <td className="pl-2.5"><button onClick={() => setOpen(isOpen ? null : c.id)} className="text-slate-400 hover:text-slate-700" aria-label="Details">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {c.status === 'missed' ? <PhoneMissed size={13} className="text-red-500" /> : c.direction === 'inbound' ? <PhoneIncoming size={13} className="text-sky-600" /> : <PhoneOutgoing size={13} className="text-indigo-600" />}
                        {fmtDateTime(c.started_at)}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap"><div className="font-semibold text-slate-800">{ct?.name || 'Unknown'}</div><div className="text-[10px] text-slate-500 tabular-nums">{c.customer_number}</div></td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{nameOf(c.agent_user_id)}{c.transferred_to ? <span className="text-slate-400"> → {nameOf(c.transferred_to)}</span> : null}</td>
                    <td className="px-2.5 py-2"><span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_STYLE[c.status] ?? STATUS_STYLE.initiated}`}>{statusLabel(c.status, c.direction)}</span></td>
                    <td className="px-2.5 py-2 tabular-nums">{fmtDuration(c.duration_seconds)}</td>
                    <td className="px-2.5 py-2">{recs.length ? (canListen ? <RecordingPlayer rec={recs[0]} canDownload={canDownload} canDelete={isManager} onDeleted={reload} /> : <span className="inline-flex items-center gap-1 text-slate-500"><FileAudio size={12} /> Yes</span>) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-2.5 py-2 max-w-[220px] truncate text-slate-600" title={notes.map((n) => n.body).join('\n')}>{notes.length ? [notes[0].outcome, notes[0].body].filter(Boolean).join(': ') : <span className="text-slate-300">—</span>}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{fuOf.get(c.id) ? <span className={fuOf.get(c.id) === 'pending' ? 'text-orange-600 font-semibold' : 'text-slate-500'}>{fuOf.get(c.id)}</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-2.5 py-2"><button disabled={!ready || ct?.status === 'Do not call'} onClick={() => void phone?.dial(c.customer_number, ct ? { id: ct.id, name: ct.name, phone: ct.phone, contact_type: ct.contact_type, status: ct.status, assigned_user_id: ct.assigned_user_id, notes: ct.notes } : null).catch((e) => alert(errText(e)))}
                      className="h-7 w-7 rounded-full border border-emerald-300 text-emerald-700 inline-flex items-center justify-center hover:bg-emerald-50 disabled:opacity-30" title="Call back"><Phone size={12} /></button></td>
                  </tr>
                  {isOpen && <tr className="bg-orange-50/30"><td colSpan={10} className="px-4 py-3"><CallDetail call={c} notes={notes} nameOf={nameOf} reload={reload} /></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 600 && <p className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-100">Showing 600 of {rows.length}. Narrow the dates or filters to see more.</p>}
    </div>
  );
}

function CallDetail({ call, notes, nameOf, reload }: { call: CallRow; notes: TeleData['notes']; nameOf: (id: string | null) => string; reload: () => Promise<void> }) {
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const add = async () => {
    if (!body.trim()) return;
    const { error } = await supabase.from('tele_call_notes').insert({ call_id: call.id, contact_id: call.contact_id, body: body.trim() });
    if (error) { setErr(errText(error)); return; }
    setBody(''); await reload();
  };
  return (
    <div className="grid md:grid-cols-2 gap-3 text-xs">
      <div className="space-y-0.5 text-slate-600">
        <div><b>From</b> {call.from_number} <b className="ml-2">To</b> {call.to_number}</div>
        <div><b>Started</b> {fmtDateTime(call.started_at)}{call.answered_at ? <> · <b>Answered</b> {fmtDateTime(call.answered_at)}</> : null}{call.ended_at ? <> · <b>Ended</b> {fmtDateTime(call.ended_at)}</> : null}</div>
        {call.ring_seconds > 0 && <div><b>Ringing</b> {fmtDuration(call.ring_seconds)}</div>}
        {call.error_text && <div className="text-red-600">{call.error_text}</div>}
      </div>
      <div>
        {notes.map((n) => <div key={n.id} className="py-1 border-b border-orange-100"><span className="text-[10px] text-slate-500">{fmtDateTime(n.created_at)} · {nameOf(n.author_id)}{n.outcome ? ` · ${n.outcome}` : ''}</span><div className="text-slate-700 whitespace-pre-wrap">{n.body}</div></div>)}
        <div className="mt-1.5 flex gap-1.5">
          <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} placeholder="Add a note to this call" className="flex-1 h-8 rounded-lg border border-slate-300 px-2" />
          <button onClick={() => void add()} disabled={!body.trim()} className="h-8 px-3 rounded-lg bg-orange-600 text-white font-semibold disabled:opacity-40">Add</button>
        </div>
        {err && <p className="text-red-600 mt-1">{err}</p>}
      </div>
    </div>
  );
}

function RecordingPlayer({ rec, canDownload, canDelete, onDeleted }: { rec: Recording; canDownload: boolean; canDelete: boolean; onDeleted: () => Promise<void> }) {
  const [src, setSrc] = useState('');
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const play = async () => {
    setErr('');
    if (audio && src) { if (playing) audio.pause(); else void audio.play(); return; }
    setBusy(true);
    try {
      const u = await teleApi.recordingLink(rec.id);
      setSrc(u);
      const a = new Audio(u);
      a.onplay = () => setPlaying(true); a.onpause = () => setPlaying(false); a.onended = () => setPlaying(false);
      a.onerror = () => { setErr('Could not play'); setPlaying(false); };
      setAudio(a);
      await a.play();
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const download = async () => {
    try { const u = await teleApi.recordingLink(rec.id, true); const a = document.createElement('a'); a.href = u; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
    catch (e) { setErr(errText(e)); }
  };
  const remove = async () => {
    if (!confirm('Delete this recording permanently? This cannot be undone.')) return;
    try { audio?.pause(); await teleApi.deleteRecording(rec.id); await onDeleted(); } catch (e) { setErr(errText(e)); }
  };
  return (
    <span className="inline-flex items-center gap-1" title={err || `Recording ${fmtDuration(rec.duration_seconds)}`}>
      <button onClick={() => void play()} className="h-7 px-2 rounded-full border border-orange-300 text-orange-700 inline-flex items-center gap-1 hover:bg-orange-50 text-[11px] font-semibold">
        {busy ? <Loader2 size={11} className="animate-spin" /> : playing ? <Pause size={11} /> : <Play size={11} />}{fmtDuration(rec.duration_seconds)}
      </button>
      {canDownload && <button onClick={() => void download()} className="h-7 w-7 rounded-full border border-slate-200 text-slate-500 inline-flex items-center justify-center hover:bg-slate-50" title="Download"><Download size={11} /></button>}
      {canDelete && <button onClick={() => void remove()} className="h-7 w-7 rounded-full border border-slate-200 text-slate-400 inline-flex items-center justify-center hover:text-red-600 hover:bg-red-50" title="Delete recording"><Trash2 size={11} /></button>}
      {err && <span className="text-[10px] text-red-600 max-w-[120px] truncate">{err}</span>}
    </span>
  );
}
