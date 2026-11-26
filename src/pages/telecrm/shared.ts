// Tele CRM: shared types, data loading and small helpers for the pages in this folder.
// Rows come straight from the tele_* tables; the database limits them to the company (and, for a telecaller,
// to their own contacts / calls / follow-ups), so nothing here filters by company itself.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { missingTeleTable } from '@/lib/telecrm/api';
import type { TeleAgent } from '@/lib/telecrm/api';

export interface Contact {
  id: string; name: string; phone: string; phone_key: string; email: string; contact_type: string; status: string;
  assigned_user_id: string | null; next_followup_at: string | null; notes: string; created_at: string; updated_at: string;
}
export interface CallRow {
  id: string; direction: 'inbound' | 'outbound'; status: string; from_number: string; to_number: string; customer_number: string;
  contact_id: string | null; agent_user_id: string | null; started_at: string; answered_at: string | null; ended_at: string | null;
  duration_seconds: number; ring_seconds: number; transferred_to: string | null; error_text: string;
}
export interface Recording { id: string; call_id: string; duration_seconds: number; status: string; created_at: string; delete_after: string | null }
export interface Note { id: string; call_id: string | null; contact_id: string | null; author_id: string | null; body: string; outcome: string; created_at: string }
export interface Followup { id: string; contact_id: string; call_id: string | null; assigned_user_id: string | null; due_at: string; note: string; status: 'pending' | 'done' | 'cancelled'; done_at: string | null; created_at: string }
export interface Settings {
  id?: string; routing_mode: 'assigned_then_all' | 'ring_all' | 'round_robin'; ring_seconds: number; record_calls: boolean; announce_recording: boolean;
  announcement_text: string; retention_days: number; allow_download: boolean; missed_call_followup: boolean;
  /** migration 20261128000000; undefined until it is run */
  bridge_caller_id?: 'agent_mobile' | 'business';
}
export interface Rule { id: string; name: string; number_id: string | null; contact_type: string; agent_user_ids: string[]; priority: number; active: boolean }
export interface Person { id: string; name: string; email: string; role: string }

export const CONTACT_TYPES = ['Patient', 'Enquiry', 'Appointment', 'Customer', 'Other'];
export const CONTACT_STATUSES = ['New', 'In progress', 'Converted', 'Closed', 'Do not call'];
export const CALL_STATUSES = ['completed', 'missed', 'in-progress', 'ringing', 'busy', 'failed', 'cancelled', 'rejected', 'initiated'];
export const DEFAULT_SETTINGS: Settings = {
  routing_mode: 'assigned_then_all', ring_seconds: 25, record_calls: false, announce_recording: true,
  announcement_text: 'This call may be recorded for quality and training purposes.', retention_days: 90, allow_download: false, missed_call_followup: true,
};

export const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'in-progress': 'bg-sky-50 text-sky-700 border-sky-200',
  ringing: 'bg-amber-50 text-amber-700 border-amber-200',
  initiated: 'bg-slate-50 text-slate-600 border-slate-200',
  missed: 'bg-red-50 text-red-700 border-red-200',
  busy: 'bg-orange-50 text-orange-700 border-orange-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
  rejected: 'bg-slate-50 text-slate-500 border-slate-200',
};
export const statusLabel = (s: string, direction?: string) => (s === 'in-progress' ? 'Connected' : s === 'missed' && direction === 'outbound' ? 'No answer' : s === 'initiated' ? 'Initiating' : s.charAt(0).toUpperCase() + s.slice(1));
export const isAnswered = (c: CallRow) => !!c.answered_at || (c.status === 'completed' && c.duration_seconds > 0);

export const dayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fmtDateTime = (s: string | null) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '—');
export const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const errText = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));

export interface TeleData {
  contacts: Contact[]; calls: CallRow[]; recordings: Recording[]; notes: Note[]; followups: Followup[];
  agents: TeleAgent[]; people: Person[]; settings: Settings; rules: Rule[];
}
const EMPTY: TeleData = { contacts: [], calls: [], recordings: [], notes: [], followups: [], agents: [], people: [], settings: DEFAULT_SETTINGS, rules: [] };

/** Everything the Tele CRM pages show, for calls started in [from, to] (dates, inclusive; '' = open). */
export function useTeleData(from: string, to: string) {
  const [data, setData] = useState<TeleData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [setupNeeded, setSetupNeeded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      let cq = supabase.from('tele_calls').select('id,direction,status,from_number,to_number,customer_number,contact_id,agent_user_id,started_at,answered_at,ended_at,duration_seconds,ring_seconds,transferred_to,error_text').order('started_at', { ascending: false }).limit(5000);
      if (from) cq = cq.gte('started_at', new Date(`${from}T00:00:00`).toISOString());
      if (to) cq = cq.lte('started_at', new Date(`${to}T23:59:59.999`).toISOString());
      const [c, k, f, a, p, s, r] = await Promise.all([
        cq,
        supabase.from('tele_contacts').select('*').order('updated_at', { ascending: false }).limit(5000),
        supabase.from('tele_followups').select('*').order('due_at').limit(3000),
        supabase.from('tele_agents').select('*').order('created_at'),
        supabase.from('company_users').select('id, full_name, email, role, status').limit(1000),
        supabase.from('tele_settings').select('*').maybeSingle(),
        supabase.from('tele_routing_rules').select('*').order('priority'),
      ]);
      for (const x of [c, k, f, a, p, s, r]) if (x.error) throw x.error;
      const calls = (c.data ?? []) as CallRow[];
      const ids = calls.map((x) => x.id);
      // recordings / notes of the calls in view (in chunks: long id lists don't fit one request)
      const recs: Recording[] = []; const notes: Note[] = [];
      for (let i = 0; i < ids.length; i += 300) {
        const part = ids.slice(i, i + 300);
        const [rr, nn] = await Promise.all([
          supabase.from('tele_recordings').select('id,call_id,duration_seconds,status,created_at,delete_after').in('call_id', part),
          supabase.from('tele_call_notes').select('*').in('call_id', part),
        ]);
        if (rr.error) throw rr.error;
        if (nn.error) throw nn.error;
        recs.push(...((rr.data ?? []) as Recording[])); notes.push(...((nn.data ?? []) as Note[]));
      }
      const cn = await supabase.from('tele_call_notes').select('*').is('call_id', null).order('created_at', { ascending: false }).limit(1000);
      if (!cn.error) notes.push(...((cn.data ?? []) as Note[]));
      setData({
        calls, recordings: recs, notes,
        contacts: (k.data ?? []) as Contact[],
        followups: (f.data ?? []) as Followup[],
        agents: (a.data ?? []) as TeleAgent[],
        people: ((p.data ?? []) as { id: string; full_name: string | null; email: string; role: string; status: string }[])
          .filter((u) => u.status === 'Active').map((u) => ({ id: u.id, name: u.full_name || u.email, email: u.email, role: u.role })),
        settings: { ...DEFAULT_SETTINGS, ...((s.data ?? {}) as Partial<Settings>) },
        rules: (r.data ?? []) as Rule[],
      });
      setSetupNeeded(false);
    } catch (e) {
      const m = errText(e);
      if (missingTeleTable(m)) setSetupNeeded(true); else setError(m);
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  // live: a call starting / ending anywhere in the company refreshes the lists
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase.channel('tele-calls-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tele_calls' }, () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => { void load(); }, 1500);   // a burst of call events = one refresh
      })
      .subscribe();
    return () => { if (t) clearTimeout(t); void supabase.removeChannel(ch); };
  }, [load]);

  return { data, setData, loading, error, setupNeeded, reload: load };
}
