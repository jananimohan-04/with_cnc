// Tele CRM: calls to our own server (server/telecrm/routes.cjs). Provider secrets never reach the browser;
// the browser only gets short-lived phone tokens and 5-minute private recording links.

import { supabase } from '@/lib/supabase';
import { API_BASE, universalFetch } from '@/retail/api';

export interface TeleAgent {
  id: string; user_id: string; role: 'telecaller' | 'supervisor';
  can_call_out: boolean; can_receive: boolean; can_listen: boolean; can_download: boolean;
  presence: 'available' | 'away'; active: boolean; last_assigned_at: string | null;
  /** bridge calling (migration 20261127000000): the agent's own mobile, verified by the provider */
  mobile_e164?: string; mobile_status?: 'none' | 'pending' | 'verified'; mobile_verified_at?: string | null; call_via?: 'mobile' | 'browser';
}
export interface TeleNumber { id: string; e164: string; label: string; is_default: boolean; active: boolean }
export interface TeleStatus {
  ok: boolean; configured: boolean; browserCalling: boolean; bridgeCalling?: boolean; provider: string;
  missing: string[]; supported: string[]; webhookBase: string;
  numbers: TeleNumber[];
  me: { id: string; isManager: boolean; agent: TeleAgent | null };
  setupNeeded?: boolean; error?: string;
}

export class TeleError extends Error {
  setupNeeded: boolean;
  needMobile: boolean;
  constructor(msg: string, setupNeeded = false, needMobile = false) { super(msg); this.setupNeeded = setupNeeded; this.needMobile = needMobile; }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  let res: Response;
  try {
    res = await universalFetch(`${API_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch { throw new TeleError('The server could not be reached. Check the internet connection.'); }
  if (/text\/html/i.test(res.headers.get('content-type') || '')) throw new TeleError('Tele CRM is not available on this server yet.');
  const j = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || j.ok === false) throw new TeleError(String(j.error || `The request failed (${res.status}).`), !!j.setupNeeded, !!j.needMobile);
  return j as T;
}

export const teleApi = {
  status: () => call<TeleStatus>('GET', '/api/telecrm/status'),
  token: () => call<{ token: string; identity: string; provider: string; expiresIn: number; edge?: string; canCallOut: boolean; canReceive: boolean }>('POST', '/api/telecrm/token', {}),
  connectNumber: (e164: string, label: string, isDefault: boolean) => call<{ e164: string }>('POST', '/api/telecrm/numbers', { e164, label, isDefault }),
  disconnectNumber: (id: string) => call('DELETE', `/api/telecrm/numbers/${id}`),
  transfer: (callId: string, toUserId: string) => call('POST', `/api/telecrm/calls/${callId}/transfer`, { toUserId }),
  /** Bridge call: the provider rings my verified mobile first, then the customer. */
  bridge: (to: string, contactId?: string) => call<{ callId: string }>('POST', '/api/telecrm/calls/bridge', { to, ...(contactId ? { contactId } : {}) }),
  hangup: (callId: string) => call('POST', `/api/telecrm/calls/${callId}/hangup`, {}),
  connectMobile: (mobile: string) => call<{ e164: string; verified: boolean; code: string }>('POST', '/api/telecrm/agent/mobile', { mobile }),
  checkMobile: () => call<{ e164: string; verified: boolean }>('POST', '/api/telecrm/agent/mobile/check', {}),
  disconnectMobile: () => call('DELETE', '/api/telecrm/agent/mobile'),
  /** A private link that works for 5 minutes (playing / downloading is permission-checked and logged on the server). */
  recordingLink: async (id: string, download = false) => {
    const r = await call<{ url: string }>('POST', `/api/telecrm/recordings/${id}/link`, { download });
    return `${API_BASE}${r.url}`;
  },
  deleteRecording: (id: string) => call('DELETE', `/api/telecrm/recordings/${id}`),
};

/** Last 10 digits: how a caller is matched to a contact. */
export const phoneKey = (raw: string) => String(raw || '').replace(/\D/g, '').slice(-10);

/** +91 for plain 10-digit Indian mobiles; numbers with a country code stay as they are. '' when not a phone number. */
export function toE164(raw: string): string {
  let s = String(raw || '').trim().replace(/[\s\-().]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) return /^\+\d{8,15}$/.test(s) ? s : '';
  const d = s.replace(/\D/g, '');
  if (d.length === 10 && /^[6-9]/.test(d)) return '+91' + d;
  if (d.length === 11 && d.startsWith('0')) return '+91' + d.slice(1);
  if (d.length === 12 && d.startsWith('91')) return '+' + d;
  return d.length >= 8 && d.length <= 15 ? '+' + d : '';
}

export const fmtDuration = (sec: number) => {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

export const missingTeleTable = (msg: string) => /tele_\w+.*(does not exist|schema cache)|PGRST205|42P01/i.test(msg);
