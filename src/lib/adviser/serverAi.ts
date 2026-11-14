// The Adviser's AI connection through our own server (the AI key stays on the server).
// Answers stream back as small pieces so they can be spoken while they are still being written.

import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/retail/api';
import { isTauri } from '@/lib/desktop/isTauri';

export class ServerAiError extends Error {
  /** true = the server route is not there / not set up / down: the caller may try another way to answer. */
  unreachable: boolean;
  constructor(message: string, unreachable: boolean) { super(message); this.unreachable = unreachable; }
}

// The desktop app's own pages are not the website, so there the AI is reached at the website itself, through the desktop's
// network helper (allowed for this address in src-tauri/capabilities/default.json; no browser cross-site limits).
const WEB_ORIGIN = 'https://with-cnc.vercel.app';
const url = (path: string) => `${API_BASE || (isTauri() ? WEB_ORIGIN : '')}/api/adviser/${path}`;
async function fetch(input: string, init?: RequestInit): Promise<Response> {
  if (isTauri()) {
    const { fetch: desktopFetch } = await import('@tauri-apps/plugin-http');
    return desktopFetch(input, init);
  }
  return window.fetch(input, init);
}
/** POST to one of our own server routes (works on the website and in the desktop app). Throws with the server's message. */
export async function serverPost<T = Record<string, unknown>>(path: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE || (isTauri() ? WEB_ORIGIN : '')}${path}`, { method: 'POST', headers: await headers(), body: JSON.stringify(body) });
  } catch { throw new Error('The server could not be reached. Check the internet connection.'); }
  if (/text\/html/i.test(res.headers.get('content-type') || '')) throw new Error('This feature is not available on this server yet.');
  const j = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || (j as { ok?: boolean }).ok === false) {
    const err = new Error(String((j as { error?: string }).error || `The request failed (${res.status}).`)) as Error & { needConnect?: boolean };
    err.needConnect = !!(j as { needConnect?: boolean }).needConnect;
    throw err;
  }
  return j as T;
}

const headers = async () => {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'content-type': 'application/json' };
};

export interface ChatPiece { role: 'user' | 'assistant'; text: string }

/** Streams ChatGPT's answer as text pieces. Throws ServerAiError (unreachable = try something else). */
export async function* serverChat(system: string, messages: ChatPiece[], opts: { maxTokens?: number; temperature?: number } = {}): AsyncGenerator<string> {
  let res: Response;
  try {
    res = await fetch(url('chat'), { method: 'POST', headers: await headers(), body: JSON.stringify({ system, messages, ...opts }) });
  } catch { throw new ServerAiError('The AI server could not be reached.', true); }
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({} as { error?: string }));
    throw new ServerAiError(j?.error || `AI is not available (HTTP ${res.status}).`, res.status === 404 || res.status === 503 || res.status >= 500 || res.status === 401);
  }
  // a web page instead of an answer (the route is not there, so the app's own page came back): try another way
  if (/text\/html/i.test(res.headers.get('content-type') || '')) throw new ServerAiError('The AI route is not available here.', true);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      let j: { t?: string; error?: string };
      try { j = JSON.parse(line.slice(5)); } catch { continue; }
      if (j.error) throw new ServerAiError(j.error, false);
      if (j.t) yield j.t;
    }
  }
}

let voiceDownUntil = 0;
/** ChatGPT's text-to-speech (mp3), or null when it is not available (then another voice is used). */
export async function serverSpeech(text: string, lang: 'ta' | 'en' | 'tanglish'): Promise<Blob | null> {
  if (Date.now() < voiceDownUntil) return null;
  try {
    const res = await fetch(url('tts'), { method: 'POST', headers: await headers(), body: JSON.stringify({ text, lang }) });
    if (!res.ok) { if (res.status === 404 || res.status === 503 || res.status === 401) voiceDownUntil = Date.now() + 120_000; return null; }
    const b = await res.blob();
    return b.size > 200 ? b : null;
  } catch { voiceDownUntil = Date.now() + 60_000; return null; }
}

/** Is the server's ChatGPT set up? (false when OPENAI_API_KEY is missing or the route is not deployed) */
export async function serverAiReady(): Promise<boolean> {
  try {
    const res = await fetch(url('status'), { headers: await headers() });
    if (!res.ok) return false;
    const j = await res.json();
    return !!j?.configured;
  } catch { return false; }
}
