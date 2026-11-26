// Tele CRM: Contacts (patients, enquiries, appointments, customers ...) and Follow-ups.
// Only the fields a telecalling team needs: no medical records are kept here.

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { CalendarClock, Check, Pencil, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Plus, Search, Trash2, UserPlus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/ui/Modal';
import { usePhone } from '@/lib/telecrm/phone';
import { fmtDuration, phoneKey, toE164 } from '@/lib/telecrm/api';
import { CONTACT_STATUSES, CONTACT_TYPES, STATUS_STYLE, errText, fmtDate, fmtDateTime, statusLabel, type Contact, type Followup, type TeleData } from './shared';

const input = 'h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20';

function useDial() {
  const phone = usePhone();
  const ready = phone?.state === 'ready' && phone.canCallOut && !(phone.call && phone.call.phase !== 'ended');
  const dial = (c: Contact) => phone?.dial(c.phone, { id: c.id, name: c.name, phone: c.phone, contact_type: c.contact_type, status: c.status, assigned_user_id: c.assigned_user_id, notes: c.notes }).catch((e) => alert(errText(e)));
  return { ready, dial };
}

// ----------------------------------------------------------------------------- contacts
export function ContactsTab({ data, setData, reload, isManager, me, nameOf }: {
  data: TeleData; setData: Dispatch<SetStateAction<TeleData>>; reload: () => Promise<void>; isManager: boolean; me: string; nameOf: (id: string | null) => string;
}) {
  const { ready, dial } = useDial();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [assigned, setAssigned] = useState('');
  const [edit, setEdit] = useState<Partial<Contact> | null>(null);
  const [open, setOpen] = useState<Contact | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTo, setBulkTo] = useState('');

  const telecallers = data.agents.filter((a) => a.active).map((a) => ({ id: a.user_id, name: nameOf(a.user_id) }));
  const types = Array.from(new Set([...CONTACT_TYPES, ...data.contacts.map((c) => c.contact_type).filter(Boolean)]));
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, '');
    return data.contacts.filter((c) => (!type || c.contact_type === type) && (!status || c.status === status)
      && (!assigned || (assigned === '-' ? !c.assigned_user_id : c.assigned_user_id === assigned))
      && (!s || c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s) || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits))));
  }, [data.contacts, q, type, status, assigned]);
  const lastCall = useMemo(() => { const m = new Map<string, string>(); for (const c of data.calls) if (c.contact_id && !m.has(c.contact_id)) m.set(c.contact_id, c.started_at); return m; }, [data.calls]);

  const assignSelected = async () => {
    if (!selected.size) return;
    const { error } = await supabase.from('tele_contacts').update({ assigned_user_id: bulkTo || null, updated_at: new Date().toISOString() }).in('id', Array.from(selected));
    if (error) { alert(errText(error)); return; }
    setSelected(new Set()); await reload();
  };

  return (
    <div className="grid gap-3 xl:grid-cols-[1fr,380px]">
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-100">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, number, email" className="w-full h-9 rounded-lg border border-slate-300 pl-8 pr-2 text-sm" />
          </div>
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-xs" aria-label="Type"><option value="">All types</option>{types.map((t) => <option key={t}>{t}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-xs" aria-label="Status"><option value="">All statuses</option>{CONTACT_STATUSES.map((t) => <option key={t}>{t}</option>)}</select>
          {isManager && <select value={assigned} onChange={(e) => setAssigned(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-2 text-xs" aria-label="Assigned"><option value="">Everyone</option><option value="-">Not assigned</option>{telecallers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
          <button onClick={() => setEdit({ contact_type: 'Enquiry', status: 'New', assigned_user_id: isManager ? null : me })} className="h-9 px-3 rounded-lg bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-orange-700"><UserPlus size={14} /> New contact</button>
        </div>
        {isManager && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-orange-50 border-b border-orange-100 text-xs">
            <b>{selected.size} selected</b> · Assign to
            <select value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} className="h-7 rounded border border-slate-300 px-1.5"><option value="">Nobody</option>{telecallers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <button onClick={() => void assignSelected()} className="h-7 px-2.5 rounded bg-orange-600 text-white font-semibold">Assign</button>
            <button onClick={() => setSelected(new Set())} className="text-slate-500 underline">Clear</button>
          </div>
        )}
        <div className="overflow-x-auto max-h-[calc(100dvh-300px)]">
          <table className="w-full text-xs no-stripe">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wide sticky top-0 z-10">
              <tr>
                {isManager && <th className="w-8 px-2"><input type="checkbox" checked={rows.length > 0 && rows.every((r) => selected.has(r.id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} aria-label="Select all" /></th>}
                {['Name', 'Phone', 'Type', 'Status', 'Assigned to', 'Last call', 'Follow-up', ''].map((h) => <th key={h} className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">No contacts yet.</td></tr>}
              {rows.slice(0, 500).map((c) => (
                <tr key={c.id} onClick={() => setOpen(c)} className={`border-t border-slate-100 cursor-pointer hover:bg-orange-50/40 ${open?.id === c.id ? 'bg-orange-50/70' : ''}`}>
                  {isManager && <td className="px-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(c.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} aria-label={`Select ${c.name}`} /></td>}
                  <td className="px-2.5 py-2 font-semibold text-slate-800 whitespace-nowrap">{c.name || '—'}</td>
                  <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">{c.phone}</td>
                  <td className="px-2.5 py-2">{c.contact_type}</td>
                  <td className="px-2.5 py-2"><span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${c.status === 'Do not call' ? 'bg-red-50 text-red-700 border-red-200' : c.status === 'Converted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{c.status}</span></td>
                  <td className="px-2.5 py-2 whitespace-nowrap">{nameOf(c.assigned_user_id)}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap text-slate-500">{fmtDateTime(lastCall.get(c.id) ?? null)}</td>
                  <td className={`px-2.5 py-2 whitespace-nowrap ${c.next_followup_at && new Date(c.next_followup_at) < new Date() ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>{c.next_followup_at ? fmtDateTime(c.next_followup_at) : '—'}</td>
                  <td className="px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      <button disabled={!ready || c.status === 'Do not call'} onClick={() => void dial(c)} className="h-7 w-7 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center hover:bg-emerald-700 disabled:opacity-30" title="Call"><Phone size={12} /></button>
                      <button onClick={() => setEdit(c)} className="h-7 w-7 rounded-full border border-slate-200 text-slate-600 inline-flex items-center justify-center hover:bg-slate-50" title="Edit"><Pencil size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 500 && <p className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-100">Showing 500 of {rows.length}. Narrow the search to see more.</p>}
      </div>

      {open ? <ContactPanel contact={data.contacts.find((c) => c.id === open.id) ?? open} data={data} nameOf={nameOf} onClose={() => setOpen(null)} onEdit={() => setEdit(open)} onDial={dial} ready={ready} reload={reload} />
        : <div className="hidden xl:flex rounded-xl border border-dashed border-slate-300 items-center justify-center text-sm text-slate-400 p-6 text-center">Pick a contact to see its calls, notes and follow-ups.</div>}

      {edit && <ContactForm value={edit} isManager={isManager} telecallers={telecallers} types={types} onClose={() => setEdit(null)}
        onSaved={(row) => { setEdit(null); setData((d) => ({ ...d, contacts: [row, ...d.contacts.filter((c) => c.id !== row.id)] })); if (open?.id === row.id) setOpen(row); }}
        onDeleted={(id) => { setEdit(null); setData((d) => ({ ...d, contacts: d.contacts.filter((c) => c.id !== id) })); if (open?.id === id) setOpen(null); }} />}
    </div>
  );
}

function ContactForm({ value, isManager, telecallers, types, onClose, onSaved, onDeleted }: {
  value: Partial<Contact>; isManager: boolean; telecallers: { id: string; name: string }[]; types: string[];
  onClose: () => void; onSaved: (c: Contact) => void; onDeleted: (id: string) => void;
}) {
  const [f, setF] = useState<Partial<Contact>>(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof Contact, v: string | null) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const phone = (f.phone || '').trim();
    if (!toE164(phone)) { setErr('Enter a valid phone number.'); return; }
    setBusy(true); setErr('');
    const row = {
      name: (f.name || '').trim(), phone, phone_key: phoneKey(phone), email: (f.email || '').trim(), contact_type: f.contact_type || 'Enquiry',
      status: f.status || 'New', assigned_user_id: f.assigned_user_id || null, notes: (f.notes || '').trim(), updated_at: new Date().toISOString(),
    };
    const q = f.id ? supabase.from('tele_contacts').update(row).eq('id', f.id) : supabase.from('tele_contacts').insert(row);
    const { data, error } = await q.select('*').single();
    setBusy(false);
    if (error) { setErr(errText(error)); return; }
    onSaved(data as Contact);
  };
  const remove = async () => {
    if (!f.id || !confirm('Delete this contact? Its call history stays, without the contact link.')) return;
    const { error } = await supabase.from('tele_contacts').delete().eq('id', f.id);
    if (error) { setErr(errText(error)); return; }
    onDeleted(f.id);
  };
  return (
    <Modal open onClose={onClose} title={f.id ? 'Edit contact' : 'New contact'} size="md"
      footer={<div className="flex w-full items-center justify-between gap-2">
        {f.id && isManager ? <button onClick={() => void remove()} className="h-9 px-3 rounded-lg border border-red-200 text-red-600 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-red-50"><Trash2 size={13} /> Delete</button> : <span />}
        <div className="flex gap-2"><button onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-semibold">Cancel</button>
          <button onClick={() => void save()} disabled={busy} className="h-9 px-4 rounded-lg bg-orange-600 text-white text-xs font-semibold disabled:opacity-50">Save</button></div>
      </div>}>
      <div className="grid sm:grid-cols-2 gap-2.5">
        <label className="text-[11px] font-semibold text-slate-600">Name<input autoFocus value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} className={`${input} mt-1`} /></label>
        <label className="text-[11px] font-semibold text-slate-600">Phone *<input value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} inputMode="tel" placeholder="+91 98765 43210" className={`${input} mt-1 tabular-nums`} /></label>
        <label className="text-[11px] font-semibold text-slate-600">Email<input type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} className={`${input} mt-1`} /></label>
        <label className="text-[11px] font-semibold text-slate-600">Type
          <input list="tele-contact-types" value={f.contact_type ?? ''} onChange={(e) => set('contact_type', e.target.value)} className={`${input} mt-1`} />
          <datalist id="tele-contact-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <label className="text-[11px] font-semibold text-slate-600">Status
          <select value={f.status ?? 'New'} onChange={(e) => set('status', e.target.value)} className={`${input} mt-1`}>{CONTACT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <label className="text-[11px] font-semibold text-slate-600">Assigned telecaller
          <select value={f.assigned_user_id ?? ''} disabled={!isManager} onChange={(e) => set('assigned_user_id', e.target.value || null)} className={`${input} mt-1 disabled:bg-slate-50`}>
            <option value="">Not assigned</option>{telecallers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="sm:col-span-2 text-[11px] font-semibold text-slate-600">Notes<textarea value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" /></label>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </Modal>
  );
}

function ContactPanel({ contact, data, nameOf, onClose, onEdit, onDial, ready, reload }: {
  contact: Contact; data: TeleData; nameOf: (id: string | null) => string; onClose: () => void; onEdit: () => void;
  onDial: (c: Contact) => void; ready: boolean; reload: () => Promise<void>;
}) {
  const calls = data.calls.filter((c) => c.contact_id === contact.id);
  const callIds = new Set(calls.map((c) => c.id));
  const notes = data.notes.filter((n) => n.contact_id === contact.id || (n.call_id && callIds.has(n.call_id))).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const fus = data.followups.filter((f) => f.contact_id === contact.id).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');
  const [err, setErr] = useState('');
  const addNote = async () => {
    if (!note.trim()) return;
    const { error } = await supabase.from('tele_call_notes').insert({ contact_id: contact.id, body: note.trim() });
    if (error) { setErr(errText(error)); return; }
    setNote(''); await reload();
  };
  const addFollowup = async () => {
    if (!due) return;
    const iso = new Date(due).toISOString();
    const { error } = await supabase.from('tele_followups').insert({ contact_id: contact.id, assigned_user_id: contact.assigned_user_id, due_at: iso, note: note.trim() || 'Follow-up call' });
    if (error) { setErr(errText(error)); return; }
    await supabase.from('tele_contacts').update({ next_followup_at: iso, updated_at: new Date().toISOString() }).eq('id', contact.id);
    setDue(''); await reload();
  };
  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[calc(100dvh-200px)]">
      <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-br from-orange-50 to-white">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-base font-bold text-slate-900 truncate">{contact.name || contact.phone}</div>
            <div className="text-xs text-slate-500">{contact.phone}{contact.email ? ` · ${contact.email}` : ''}</div>
            <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-semibold">
              <span className="px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">{contact.contact_type}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">{contact.status}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">{nameOf(contact.assigned_user_id)}</span>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button disabled={!ready || contact.status === 'Do not call'} onClick={() => onDial(contact)} className="h-8 px-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-30"><Phone size={13} /> Call</button>
            <button onClick={onEdit} className="h-8 w-8 rounded-lg border border-slate-200 inline-flex items-center justify-center text-slate-600" title="Edit"><Pencil size={13} /></button>
            <button onClick={onClose} className="h-8 w-8 rounded-lg border border-slate-200 inline-flex items-center justify-center text-slate-600" title="Close"><X size={13} /></button>
          </div>
        </div>
        {contact.notes && <p className="mt-2 text-xs text-slate-600 whitespace-pre-wrap">{contact.notes}</p>}
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-3 text-xs">
        <section>
          <div className="font-bold uppercase tracking-wide text-[10px] text-slate-500 mb-1">Add note / follow-up</div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm resize-none" />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button onClick={() => void addNote()} disabled={!note.trim()} className="h-8 px-3 rounded-lg border border-slate-300 font-semibold disabled:opacity-40">Save note</button>
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 flex-1 min-w-[150px] rounded-lg border border-slate-300 px-2" aria-label="Follow-up time" />
            <button onClick={() => void addFollowup()} disabled={!due} className="h-8 px-3 rounded-lg bg-orange-600 text-white font-semibold disabled:opacity-40 inline-flex items-center gap-1"><CalendarClock size={13} /> Schedule</button>
          </div>
          {err && <p className="mt-1 text-red-600">{err}</p>}
        </section>
        <section>
          <div className="font-bold uppercase tracking-wide text-[10px] text-slate-500 mb-1">Follow-ups</div>
          {fus.length === 0 ? <p className="text-slate-400">None.</p> : fus.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 py-1 border-b border-slate-50">
              <span className={f.status === 'pending' && new Date(f.due_at) < new Date() ? 'text-red-600 font-semibold' : f.status !== 'pending' ? 'text-slate-400 line-through' : 'text-slate-700'}>{fmtDateTime(f.due_at)} · {f.note}</span>
              <span className="text-[10px] text-slate-500">{f.status}</span>
            </div>
          ))}
        </section>
        <section>
          <div className="font-bold uppercase tracking-wide text-[10px] text-slate-500 mb-1">Calls ({calls.length})</div>
          {calls.length === 0 ? <p className="text-slate-400">No calls in the selected period.</p> : calls.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 py-1 border-b border-slate-50">
              <span className="inline-flex items-center gap-1.5">
                {c.status === 'missed' ? <PhoneMissed size={13} className="text-red-500" /> : c.direction === 'inbound' ? <PhoneIncoming size={13} className="text-sky-600" /> : <PhoneOutgoing size={13} className="text-indigo-600" />}
                {fmtDateTime(c.started_at)} · {nameOf(c.agent_user_id)}
              </span>
              <span className="inline-flex items-center gap-1.5"><span className="tabular-nums text-slate-500">{fmtDuration(c.duration_seconds)}</span><span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_STYLE[c.status] ?? STATUS_STYLE.initiated}`}>{statusLabel(c.status)}</span></span>
            </div>
          ))}
        </section>
        <section>
          <div className="font-bold uppercase tracking-wide text-[10px] text-slate-500 mb-1">Notes</div>
          {notes.length === 0 ? <p className="text-slate-400">No notes yet.</p> : notes.map((n) => (
            <div key={n.id} className="py-1.5 border-b border-slate-50">
              <div className="text-[10px] text-slate-500">{fmtDateTime(n.created_at)} · {nameOf(n.author_id)}{n.outcome ? ` · ${n.outcome}` : ''}</div>
              {n.body && <div className="text-slate-700 whitespace-pre-wrap">{n.body}</div>}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------- follow-ups
export function FollowupsTab({ data, reload, isManager, me, nameOf }: { data: TeleData; reload: () => Promise<void>; isManager: boolean; me: string; nameOf: (id: string | null) => string }) {
  const { ready, dial } = useDial();
  const [view, setView] = useState<'due' | 'upcoming' | 'done'>('due');
  const [who, setWho] = useState(isManager ? '' : me);
  const contactOf = useMemo(() => new Map(data.contacts.map((c) => [c.id, c])), [data.contacts]);
  const now = new Date();
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const list = data.followups.filter((f) => (!who || f.assigned_user_id === who) && (
    view === 'due' ? f.status === 'pending' && new Date(f.due_at) <= endToday
      : view === 'upcoming' ? f.status === 'pending' && new Date(f.due_at) > endToday
        : f.status !== 'pending'));
  const counts = {
    due: data.followups.filter((f) => (!who || f.assigned_user_id === who) && f.status === 'pending' && new Date(f.due_at) <= endToday).length,
    upcoming: data.followups.filter((f) => (!who || f.assigned_user_id === who) && f.status === 'pending' && new Date(f.due_at) > endToday).length,
  };
  const mark = async (f: Followup, status: 'done' | 'cancelled') => {
    const { error } = await supabase.from('tele_followups').update({ status, done_at: new Date().toISOString() }).eq('id', f.id);
    if (error) { alert(errText(error)); return; }
    const next = data.followups.filter((x) => x.contact_id === f.contact_id && x.id !== f.id && x.status === 'pending').sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
    await supabase.from('tele_contacts').update({ next_followup_at: next ? next.due_at : null, updated_at: new Date().toISOString() }).eq('id', f.contact_id);
    await reload();
  };
  const snooze = async (f: Followup, hours: number) => {
    const due = new Date(Date.now() + hours * 3600000).toISOString();
    const { error } = await supabase.from('tele_followups').update({ due_at: due }).eq('id', f.id);
    if (error) { alert(errText(error)); return; }
    await reload();
  };
  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-slate-100">
        {(['due', 'upcoming', 'done'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`h-8 px-3 rounded-lg text-xs font-semibold border ${view === v ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-orange-50'}`}>
            {v === 'due' ? `Due today & overdue (${counts.due})` : v === 'upcoming' ? `Upcoming (${counts.upcoming})` : 'Done'}
          </button>
        ))}
        {isManager && <select value={who} onChange={(e) => setWho(e.target.value)} className="ml-auto h-8 rounded-lg border border-slate-300 px-2 text-xs" aria-label="Telecaller"><option value="">Everyone</option>{data.agents.map((a) => <option key={a.user_id} value={a.user_id}>{nameOf(a.user_id)}</option>)}</select>}
      </div>
      {list.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">{view === 'due' ? 'Nothing due.' : 'Nothing here.'}</p> : (
        <div className="divide-y divide-slate-100">
          {list.slice(0, 400).map((f) => {
            const c = contactOf.get(f.contact_id);
            const late = f.status === 'pending' && new Date(f.due_at) < now;
            return (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 hover:bg-orange-50/30">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{c?.name || c?.phone || 'Contact'} <span className="font-normal text-slate-500 text-xs">{c?.phone}{c ? ` · ${c.contact_type}` : ''}</span></div>
                  <div className="text-xs text-slate-500"><span className={late ? 'text-red-600 font-semibold' : ''}>{late ? 'Overdue · ' : ''}{fmtDateTime(f.due_at)}</span> · {nameOf(f.assigned_user_id)}{f.note ? ` · ${f.note}` : ''}{f.done_at && f.status !== 'pending' ? ` · ${f.status} ${fmtDate(f.done_at)}` : ''}</div>
                </div>
                {f.status === 'pending' && (
                  <div className="flex flex-wrap gap-1.5">
                    <button disabled={!ready || !c || c.status === 'Do not call'} onClick={() => c && void dial(c)} className="h-8 px-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-30"><Phone size={13} /> Call</button>
                    <button onClick={() => void snooze(f, 2)} className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">+2 h</button>
                    <button onClick={() => void snooze(f, 24)} className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">Tomorrow</button>
                    <button onClick={() => void mark(f, 'done')} className="h-8 px-2.5 rounded-lg border border-emerald-300 text-emerald-700 text-xs font-semibold inline-flex items-center gap-1 hover:bg-emerald-50"><Check size={13} /> Done</button>
                    <button onClick={() => void mark(f, 'cancelled')} className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 inline-flex items-center justify-center hover:bg-slate-50" title="Cancel"><X size={13} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="px-3 py-2 border-t border-slate-100 text-[11px] text-slate-500 inline-flex items-center gap-1"><Plus size={11} /> Schedule follow-ups from a contact or right after a call.</div>
    </div>
  );
}
