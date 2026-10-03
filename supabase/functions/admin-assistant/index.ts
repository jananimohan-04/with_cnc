// Admin data assistant: an AI model answers questions using ONLY read-only queries against the caller's own data.
//
// Security model
//  * The caller's JWT is forwarded to the database, so Row Level Security decides which rows are visible
//    (a Company Admin sees their company only). The service-role key is never used here.
//  * Only Super Admins and Company Admins are served (checked via erp_current_user()).
//  * Only the tables in ALLOWED_TABLES can be read, and only through the read-only query tool.
//
// Secrets (Supabase -> Edge Functions -> Secrets):
//   GEMINI_API_KEY     free tier (Google AI Studio). Used when set.
//   ANTHROPIC_API_KEY  paid (Claude). Used only when GEMINI_API_KEY is not set.
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ALLOWED_TABLES, MAX_ROWS, SYSTEM_PROMPT, TOOL_DEFS, isAllowedTable, runQuery, visibleColumns, type QuerySpec, type Row } from './tools.ts';

const CLAUDE_MODEL = 'claude-sonnet-5-5';
// Google retires old free models for new accounts, so try a few current ones in order. Set the GEMINI_MODEL secret
// to force a specific model.
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
const MAX_STEPS = 8;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const GAVE_UP = "I couldn't finish that within the allowed number of steps. Try a more specific question.";

type Hist = { role: 'user' | 'assistant'; text: string }[];
type RunTool = (name: string, input: Record<string, unknown>) => Promise<unknown>;
const toolJson = (r: unknown) => JSON.stringify(r).slice(0, 24000);

// ---------------------------------------------------------------- Gemini (free tier)
async function runGemini(apiKey: string, history: Hist, runTool: RunTool): Promise<Response> {
  const contents: { role: string; parts: unknown[] }[] = history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] }));
  const tools = [{ functionDeclarations: TOOL_DEFS.map(t => ({ name: t.name, description: t.description, parameters: t.input_schema })) }];
  let used = 0;
  const forced = Deno.env.get('GEMINI_MODEL');
  const models = forced ? [forced] : GEMINI_MODELS;
  for (let step = 0; step < MAX_STEPS; step++) {
    let res: Response | null = null;
    let lastNotFound = '';
    for (const model of models) {
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents, tools, generationConfig: { maxOutputTokens: 1500, temperature: 0.1 } }),
          signal: AbortSignal.timeout(50000),
        });
      } catch (e) { return json({ error: `Could not reach the AI service: ${(e as Error).message}` }, 502); }
      if (res.status === 404) { lastNotFound = model; res = null; continue; }
      break;
    }
    if (!res) return json({ error: `None of the Gemini models are available to this key (last tried ${lastNotFound}). Set the GEMINI_MODEL secret to a model listed in Google AI Studio.` }, 502);
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      const msg = res.status === 429 ? 'The free AI limit was reached for now (Gemini free tier). Try again in a minute, or tomorrow if the daily limit is used.'
        : (res.status === 400 && /API key/i.test(t)) || res.status === 401 || res.status === 403 ? 'The Gemini API key was rejected or has no access. Check GEMINI_API_KEY.'
        : `AI service error (HTTP ${res.status}) ${t.slice(0, 160)}`;
      return json({ error: msg }, 502);
    }
    const out = await res.json();
    used += out.usageMetadata?.totalTokenCount ?? 0;
    const content = out.candidates?.[0]?.content;
    const parts: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] = content?.parts ?? [];
    const calls = parts.filter(p => p.functionCall);
    if (!content || calls.length === 0) {
      const text = parts.map(p => p.text ?? '').join('').trim();
      return json({ ok: true, answer: text || (out.promptFeedback?.blockReason ? 'That question was blocked by the AI service.' : "I couldn't produce an answer."), tokens: used });
    }
    contents.push({ role: 'model', parts });
    const responses = [];
    for (const c of calls) {
      const result = await runTool(c.functionCall!.name, c.functionCall!.args ?? {});
      // Large results are shortened by row, never cut mid-JSON.
      let r = result;
      if (toolJson(result).length >= 24000) r = { ok: false, error: 'Result too large. Narrow the query (filters, group_by or a smaller limit).' };
      responses.push({ functionResponse: { name: c.functionCall!.name, response: { result: r } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return json({ ok: true, answer: GAVE_UP, tokens: used });
}

// ---------------------------------------------------------------- Claude (paid)
async function runClaude(apiKey: string, history: Hist, runTool: RunTool): Promise<Response> {
  const messages: { role: 'user' | 'assistant'; content: unknown }[] = history.map(m => ({ role: m.role, content: m.text }));
  let used = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1500, system: SYSTEM_PROMPT, tools: TOOL_DEFS, messages }),
        signal: AbortSignal.timeout(50000),
      });
    } catch (e) { return json({ error: `Could not reach the AI service: ${(e as Error).message}` }, 502); }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return json({ error: res.status === 401 ? 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.' : `AI service error (HTTP ${res.status}) ${t.slice(0, 160)}` }, 502);
    }
    const out = await res.json();
    used += (out.usage?.input_tokens ?? 0) + (out.usage?.output_tokens ?? 0);
    messages.push({ role: 'assistant', content: out.content });
    const calls = (out.content as { type: string; id?: string; name?: string; input?: Record<string, unknown> }[]).filter(b => b.type === 'tool_use');
    if (out.stop_reason !== 'tool_use' || calls.length === 0) {
      const text = (out.content as { type: string; text?: string }[]).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return json({ ok: true, answer: text || "I couldn't produce an answer.", tokens: used });
    }
    const results = [];
    for (const c of calls) results.push({ type: 'tool_result', tool_use_id: c.id, content: toolJson(await runTool(c.name!, c.input ?? {})) });
    messages.push({ role: 'user', content: results });
  }
  return json({ ok: true, answer: GAVE_UP, tokens: used });
}

// ---------------------------------------------------------------- request handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const gemini = Deno.env.get('GEMINI_API_KEY');
  const claude = Deno.env.get('ANTHROPIC_API_KEY');
  if (!gemini && !claude) return json({ error: 'No AI key is set. Add the GEMINI_API_KEY secret (free) in Supabase Edge Functions > Secrets.' }, 500);

  const auth = req.headers.get('Authorization') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });

  // Admins only (the database function reads the caller's own record).
  const me = await db.rpc('erp_current_user');
  const role = (me.data as { role?: string } | null)?.role;
  if (me.error || !role || !['SUPER_ADMIN', 'COMPANY_ADMIN'].includes(role)) return json({ error: 'The assistant is only available to administrators.' }, 403);

  let history: Hist = [];
  try {
    const body = await req.json();
    history = (Array.isArray(body?.messages) ? body.messages : [])
      .filter((m: { role?: string; text?: unknown }) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
      .slice(-12).map((m: { role: 'user' | 'assistant'; text: string }) => ({ role: m.role, text: m.text.slice(0, 4000) }));
  } catch { return json({ error: 'Invalid request' }, 400); }
  if (!history.length || history[history.length - 1].role !== 'user') return json({ error: 'Send a question.' }, 400);

  // ---- read-only tool execution ----
  const cache = new Map<string, { rows: Row[]; truncated: boolean }>();
  const load = async (table: string) => {
    if (cache.has(table)) return cache.get(table)!;
    const rows: Row[] = [];
    let truncated = false;
    for (let from = 0; from < MAX_ROWS; from += 1000) {
      const r = await db.from(table).select('*').range(from, from + 999);
      if (r.error) throw new Error(r.error.message);
      rows.push(...(r.data as Row[]));
      if ((r.data as Row[]).length < 1000) break;
      if (from + 1000 >= MAX_ROWS) truncated = true;
    }
    const v = { rows, truncated };
    cache.set(table, v);
    return v;
  };

  const runTool: RunTool = async (name, input) => {
    try {
      if (name === 'list_tables') {
        const tables = input.table ? [String(input.table)] : [...ALLOWED_TABLES];
        const out: Record<string, unknown> = {};
        for (const t of tables) {
          if (!isAllowedTable(t)) { out[t] = 'not available'; continue; }
          const { rows } = await load(t);
          out[t] = rows.length === 0 ? { rows: 0, columns: [] } : { rows: rows.length, columns: Object.fromEntries(visibleColumns(rows).map(c => [c, String(rows.find(r => r[c] !== null && r[c] !== undefined && r[c] !== '')?.[c] ?? '').slice(0, 40)])) };
        }
        return out;
      }
      if (name === 'query_table') {
        const spec = input as unknown as QuerySpec;
        if (!isAllowedTable(spec.table)) return { ok: false, error: `Table "${spec.table}" is not available` };
        const { rows, truncated } = await load(spec.table);
        return runQuery(rows, spec, truncated);
      }
      return { ok: false, error: `Unknown tool ${name}` };
    } catch (e) {
      return { ok: false, error: `Database error: ${(e as Error).message}` };
    }
  };

  return gemini ? await runGemini(gemini, history, runTool) : await runClaude(claude!, history, runTool);
});
