// Central multi-provider AI registry, local storage, and unified streaming/completion adapters.
// Supports OpenAI (ChatGPT), Google Gemini, Anthropic Claude, Groq, DeepSeek, Mistral, xAI, OpenRouter,
// and Custom OpenAI-compatible APIs. One linked API (or 'server' built-in) is marked Default at a time.

import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/retail/api';
import { isTauri } from '@/lib/desktop/isTauri';

export type ProviderKind =
  | 'openai'
  | 'gemini'
  | 'anthropic'
  | 'groq'
  | 'deepseek'
  | 'mistral'
  | 'xai'
  | 'openrouter'
  | 'custom';

export type ProviderProtocol = 'openai' | 'gemini' | 'anthropic';

export interface ProviderPreset {
  id: ProviderKind;
  name: string;
  shortName: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  keyPlaceholder: string;
  docsHint: string;
}

export const AI_PROVIDERS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'ChatGPT (OpenAI)',
    shortName: 'ChatGPT',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o4-mini'],
    keyPlaceholder: 'sk-proj-...',
    docsHint: 'platform.openai.com',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    shortName: 'Gemini',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'],
    keyPlaceholder: 'AIzaSy...',
    docsHint: 'aistudio.google.com',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    shortName: 'Claude',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
    keyPlaceholder: 'sk-ant-...',
    docsHint: 'console.anthropic.com',
  },
  {
    id: 'groq',
    name: 'Groq',
    shortName: 'Groq',
    protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    keyPlaceholder: 'gsk_...',
    docsHint: 'console.groq.com',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    shortName: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyPlaceholder: 'sk-...',
    docsHint: 'platform.deepseek.com',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    shortName: 'Mistral',
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    defaultModel: 'mistral-small-latest',
    models: ['mistral-small-latest', 'mistral-large-latest', 'codestral-latest'],
    keyPlaceholder: 'Mistral API key...',
    docsHint: 'console.mistral.ai',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    shortName: 'Grok',
    protocol: 'openai',
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    defaultModel: 'grok-3-mini',
    models: ['grok-3-mini', 'grok-3', 'grok-2-latest'],
    keyPlaceholder: 'xai-...',
    docsHint: 'console.x.ai',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    shortName: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openai/gpt-4o-mini',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct'],
    keyPlaceholder: 'sk-or-...',
    docsHint: 'openrouter.ai',
  },
  {
    id: 'custom',
    name: 'Custom API (OpenAI-Compatible)',
    shortName: 'Custom',
    protocol: 'openai',
    baseUrl: '',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'llama3.2', 'qwen2.5'],
    keyPlaceholder: 'API key (if required)...',
    docsHint: 'Any /v1/chat/completions URL',
  },
];

export interface LinkedAiProvider {
  id: string;
  provider: ProviderKind;
  label: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  createdAt: string;
}

export interface AiProviderConfig {
  providers: LinkedAiProvider[];
  /** 'server' uses the built-in server ChatGPT key; any other value matches a LinkedAiProvider.id. */
  defaultId: string;
}

const STORAGE_KEY = 'argus.ai.providers.v1';
const LEGACY_OPENAI_KEY = 'argus.coworker.openai_key';
export const SERVER_DEFAULT_ID = 'server';
export const AI_PROVIDERS_EVENT = 'argus:ai-providers-changed';
export const OPEN_AI_APIS_EVENT = 'argus:open-ai-apis';

export const presetFor = (kind: ProviderKind): ProviderPreset =>
  AI_PROVIDERS.find((p) => p.id === kind) ?? AI_PROVIDERS[0];

const uid = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function emitChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AI_PROVIDERS_EVENT));
  }
}

function syncLegacyKey(cfg: AiProviderConfig) {
  try {
    const active = cfg.defaultId !== SERVER_DEFAULT_ID
      ? cfg.providers.find((p) => p.id === cfg.defaultId)
      : null;
    if (active && active.provider === 'openai' && active.apiKey) {
      localStorage.setItem(LEGACY_OPENAI_KEY, active.apiKey);
    } else if (cfg.defaultId === SERVER_DEFAULT_ID) {
      const firstOpenAi = cfg.providers.find((p) => p.provider === 'openai' && p.apiKey);
      if (firstOpenAi) localStorage.setItem(LEGACY_OPENAI_KEY, firstOpenAi.apiKey);
      else localStorage.removeItem(LEGACY_OPENAI_KEY);
    }
  } catch { /* ignore */ }
}

function saveConfig(cfg: AiProviderConfig): AiProviderConfig {
  const validIds = new Set(cfg.providers.map((p) => p.id));
  const clean: AiProviderConfig = {
    providers: cfg.providers,
    defaultId: cfg.defaultId !== SERVER_DEFAULT_ID && validIds.has(cfg.defaultId) ? cfg.defaultId : SERVER_DEFAULT_ID,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch { /* ignore */ }
  syncLegacyKey(clean);
  emitChanged();
  return clean;
}

export function getAiConfig(): AiProviderConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiProviderConfig>;
      const list = Array.isArray(parsed.providers)
        ? parsed.providers.filter((p): p is LinkedAiProvider => Boolean(p && typeof p.id === 'string' && typeof p.provider === 'string' && typeof p.apiKey === 'string'))
        : [];
      const defaultId = typeof parsed.defaultId === 'string' && (parsed.defaultId === SERVER_DEFAULT_ID || list.some((p) => p.id === parsed.defaultId))
        ? parsed.defaultId
        : SERVER_DEFAULT_ID;
      return { providers: list, defaultId };
    }
    // Migrate legacy browser OpenAI key once if present
    const legacy = (localStorage.getItem(LEGACY_OPENAI_KEY) || '').trim();
    if (legacy) {
      const migrated: LinkedAiProvider = {
        id: 'legacy-openai',
        provider: 'openai',
        label: 'ChatGPT (OpenAI)',
        apiKey: legacy,
        model: 'gpt-4o-mini',
        createdAt: new Date().toISOString(),
      };
      const cfg: AiProviderConfig = { providers: [migrated], defaultId: migrated.id };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
      return cfg;
    }
  } catch { /* ignore */ }
  return { providers: [], defaultId: SERVER_DEFAULT_ID };
}

export function getActiveProvider(): LinkedAiProvider | null {
  const cfg = getAiConfig();
  if (cfg.defaultId === SERVER_DEFAULT_ID) return null;
  return cfg.providers.find((p) => p.id === cfg.defaultId) ?? null;
}

export function getActiveProviderLabel(): string {
  const active = getActiveProvider();
  if (!active) return 'Built-in ChatGPT';
  const preset = presetFor(active.provider);
  return active.label.trim() || preset.shortName;
}

export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 8) return '••••••••';
  return `${k.slice(0, 5)}••••${k.slice(-4)}`;
}

export function addLinkedProvider(
  input: { provider: ProviderKind; label?: string; apiKey: string; model?: string; baseUrl?: string },
  makeDefault = true,
): AiProviderConfig {
  const cfg = getAiConfig();
  const preset = presetFor(input.provider);
  const entry: LinkedAiProvider = {
    id: uid(),
    provider: input.provider,
    label: (input.label || '').trim() || preset.name,
    apiKey: input.apiKey.trim(),
    model: (input.model || '').trim() || preset.defaultModel,
    ...(input.baseUrl?.trim() ? { baseUrl: input.baseUrl.trim() } : {}),
    createdAt: new Date().toISOString(),
  };
  return saveConfig({
    providers: [entry, ...cfg.providers],
    defaultId: makeDefault ? entry.id : cfg.defaultId,
  });
}

export function updateLinkedProvider(id: string, patch: Partial<Omit<LinkedAiProvider, 'id' | 'createdAt'>>): AiProviderConfig {
  const cfg = getAiConfig();
  return saveConfig({
    ...cfg,
    providers: cfg.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  });
}

export function removeLinkedProvider(id: string): AiProviderConfig {
  const cfg = getAiConfig();
  const remaining = cfg.providers.filter((p) => p.id !== id);
  return saveConfig({
    providers: remaining,
    defaultId: cfg.defaultId === id ? SERVER_DEFAULT_ID : cfg.defaultId,
  });
}

export function setDefaultProvider(id: string): AiProviderConfig {
  const cfg = getAiConfig();
  return saveConfig({
    ...cfg,
    defaultId: id === SERVER_DEFAULT_ID || cfg.providers.some((p) => p.id === id) ? id : SERVER_DEFAULT_ID,
  });
}

export function upsertOpenAiProviderFromKey(key: string): void {
  const clean = key.trim();
  if (!clean) {
    const cfg = getAiConfig();
    const first = cfg.providers.find((p) => p.provider === 'openai');
    if (first) removeLinkedProvider(first.id);
    return;
  }
  const cfg = getAiConfig();
  const existing = cfg.providers.find((p) => p.provider === 'openai');
  if (existing) {
    saveConfig({
      providers: cfg.providers.map((p) => (p.id === existing.id ? { ...p, apiKey: clean } : p)),
      defaultId: existing.id,
    });
  } else {
    addLinkedProvider({ provider: 'openai', apiKey: clean }, true);
  }
}

/* ---------- Network adapters for OpenAI-compatible, Gemini, and Anthropic ---------- */

export interface AiChatMessage { role: 'user' | 'assistant'; text: string }
export interface AiRequestOpts { maxTokens?: number; temperature?: number; jsonMode?: boolean }

const WEB_ORIGIN = 'https://with-cnc.vercel.app';

async function netFetch(input: string, init?: RequestInit): Promise<Response> {
  if (isTauri()) {
    const { fetch: desktopFetch } = await import('@tauri-apps/plugin-http');
    return desktopFetch(input, init);
  }
  return window.fetch(input, init);
}

function resolveOpenAiEndpoint(provider: LinkedAiProvider): string {
  const preset = presetFor(provider.provider);
  const raw = (provider.baseUrl || preset.baseUrl).trim().replace(/\/+$/, '');
  if (!raw) throw new Error('Custom provider URL is missing.');
  if (/\/chat\/completions$/i.test(raw)) return raw;
  return `${raw}/chat/completions`;
}

function formatHttpError(label: string, status: number, bodyText: string): string {
  let msg = '';
  try {
    const j = JSON.parse(bodyText);
    msg = j?.error?.message || j?.message || (typeof j?.error === 'string' ? j.error : '');
  } catch { /* raw text */ }
  if (status === 401 || status === 403 || (status === 400 && /api.?key/i.test(msg || bodyText))) {
    return `${label} rejected the API key (${msg || `HTTP ${status}`}). Check your key in Link AI APIs.`;
  }
  if (status === 429) return `${label} rate/quota limit reached (${msg || 'HTTP 429'}). Try another linked API or wait a moment.`;
  return `${label} error (HTTP ${status}): ${msg || bodyText.slice(0, 140)}`;
}

async function* parseSseLines(body: ReadableStream<Uint8Array>, extract: (raw: string, parsed: unknown) => string): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const piece = extract(data, parsed);
        if (piece) yield piece;
      } catch { /* partial line */ }
    }
  }
}

async function* streamDirectProvider(
  provider: LinkedAiProvider,
  system: string,
  messages: AiChatMessage[],
  opts: AiRequestOpts,
): AsyncGenerator<string> {
  const preset = presetFor(provider.provider);
  const label = provider.label || preset.shortName;
  const maxTokens = opts.maxTokens ?? 1800;
  const temperature = opts.temperature ?? 0.3;

  if (preset.protocol === 'gemini') {
    const model = provider.model || preset.defaultModel;
    const base = (provider.baseUrl || preset.baseUrl).replace(/\/+$/, '');
    const endpoint = `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(opts.jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    };
    const res = await netFetch(endpoint, {
      method: 'POST',
      headers: { 'x-goog-api-key': provider.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) throw new Error(formatHttpError(label, res.status, await res.text().catch(() => '')));
    yield* parseSseLines(res.body, (_r, j) => {
      const g = j as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return (g?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    });
    return;
  }

  if (preset.protocol === 'anthropic') {
    const endpoint = (provider.baseUrl || preset.baseUrl).trim();
    const res = await netFetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.model || preset.defaultModel,
        max_tokens: maxTokens,
        temperature,
        system: opts.jsonMode ? `${system}\n\nRespond with a valid JSON object only.` : system,
        messages: messages.map((m) => ({ role: m.role, content: m.text })),
        stream: true,
      }),
    });
    if (!res.ok || !res.body) throw new Error(formatHttpError(label, res.status, await res.text().catch(() => '')));
    yield* parseSseLines(res.body, (_r, j) => {
      const a = j as { type?: string; delta?: { type?: string; text?: string } };
      if (a?.type === 'content_block_delta' && a?.delta?.type === 'text_delta') return String(a.delta.text || '');
      return '';
    });
    return;
  }

  // OpenAI-compatible protocol (OpenAI, Groq, DeepSeek, Mistral, xAI, OpenRouter, Custom)
  const endpoint = resolveOpenAiEndpoint(provider);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  if (provider.provider === 'openrouter' && typeof window !== 'undefined') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'Argus BI';
  }
  const makeBody = (useJsonFormat: boolean) => ({
    model: provider.model || preset.defaultModel,
    messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.text }))],
    temperature,
    max_tokens: maxTokens,
    stream: true,
    ...(useJsonFormat ? { response_format: { type: 'json_object' } } : {}),
  });
  let res = await netFetch(endpoint, { method: 'POST', headers, body: JSON.stringify(makeBody(Boolean(opts.jsonMode && provider.provider !== 'custom'))) });
  if (!res.ok && opts.jsonMode && res.status === 400) {
    res = await netFetch(endpoint, { method: 'POST', headers, body: JSON.stringify(makeBody(false)) });
  }
  if (!res.ok || !res.body) throw new Error(formatHttpError(label, res.status, await res.text().catch(() => '')));
  yield* parseSseLines(res.body, (_r, j) => {
    const o = j as { choices?: { delta?: { content?: string } }[] };
    return String(o?.choices?.[0]?.delta?.content ?? '');
  });
}

async function* streamViaServerProxy(
  provider: LinkedAiProvider,
  system: string,
  messages: AiChatMessage[],
  opts: AiRequestOpts,
): AsyncGenerator<string> {
  const { data } = await supabase.auth.getSession();
  const base = API_BASE || (isTauri() ? WEB_ORIGIN : '');
  const res = await netFetch(`${base}/api/adviser/proxy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      provider: provider.provider,
      apiKey: provider.apiKey,
      model: provider.model,
      baseUrl: provider.baseUrl || presetFor(provider.provider).baseUrl,
      system,
      messages,
      maxTokens: opts.maxTokens ?? 1800,
      temperature: opts.temperature ?? 0.3,
      jsonMode: !!opts.jsonMode,
    }),
  });
  if (!res.ok || !res.body || /text\/html/i.test(res.headers.get('content-type') || '')) {
    const j = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(j?.error || `Could not reach ${provider.label || provider.provider} (HTTP ${res.status}).`);
  }
  yield* parseSseLines(res.body, (_r, j) => {
    const p = j as { t?: string; error?: string };
    if (p?.error) throw new Error(String(p.error));
    return String(p?.t ?? '');
  });
}

/** Streams text pieces from a LinkedAiProvider; falls back to /api/adviser/proxy if browser CORS blocks direct access. */
export async function* streamProviderChat(
  provider: LinkedAiProvider,
  system: string,
  messages: AiChatMessage[],
  opts: AiRequestOpts = {},
): AsyncGenerator<string> {
  let yielded = false;
  try {
    for await (const piece of streamDirectProvider(provider, system, messages, opts)) {
      yielded = true;
      yield piece;
    }
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isNetworkOrCors = !yielded && /failed to fetch|networkerror|load failed|cors/i.test(msg);
    const url = provider.baseUrl || presetFor(provider.provider).baseUrl;
    if (!isNetworkOrCors || /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(url)) throw err;
  }
  yield* streamViaServerProxy(provider, system, messages, opts);
}

/** Collects full response text from a LinkedAiProvider. */
export async function completeProviderChat(
  provider: LinkedAiProvider,
  system: string,
  messages: AiChatMessage[],
  opts: AiRequestOpts = {},
): Promise<string> {
  let out = '';
  for await (const piece of streamProviderChat(provider, system, messages, opts)) {
    out += piece;
  }
  return out.trim();
}

/** Safely extracts a JSON object even when an LLM wraps JSON in markdown code fences or prose. */
export function parseAiJson<T = Record<string, unknown>>(raw: string): T | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Sends a minimal ping to verify the selected API key + model + endpoint work right now. */
export async function testProviderConnection(input: {
  provider: ProviderKind;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const preset = presetFor(input.provider);
  const probe: LinkedAiProvider = {
    id: 'test-probe',
    provider: input.provider,
    label: preset.shortName,
    apiKey: input.apiKey.trim(),
    model: (input.model || '').trim() || preset.defaultModel,
    ...(input.baseUrl?.trim() ? { baseUrl: input.baseUrl.trim() } : {}),
    createdAt: '',
  };
  try {
    const reply = await completeProviderChat(
      probe,
      'Reply with just OK.',
      [{ role: 'user', text: 'Reply with OK' }],
      { maxTokens: 32, temperature: 0 },
    );
    if (!reply) return { ok: false, error: 'Provider connected but returned an empty response.' };
    return { ok: true, reply };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Connection failed.' };
  }
}
