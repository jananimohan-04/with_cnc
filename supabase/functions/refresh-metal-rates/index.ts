// Refreshes public.market_rates from Metals.Dev (INR per kg) — at most once every MIN_AGE_HOURS,
// no matter how many users or tabs call it, so the free plan's 100 requests/month is never a limit.
//
// Secret (Supabase → Edge Functions → Secrets):  METALS_DEV_KEY
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to every Edge Function automatically.
// Callers must be signed in (Supabase verifies the JWT before this code runs).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MIN_AGE_HOURS = 6;
const METALS = ['aluminum', 'copper', 'lead', 'nickel', 'zinc', 'silver', 'gold', 'platinum', 'palladium'] as const;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const apiKey = Deno.env.get('METALS_DEV_KEY');
  if (!apiKey) return json({ ok: false, error: 'METALS_DEV_KEY secret is not set' }, 500);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Fresh enough? Then do nothing (this is what protects the monthly request limit).
  const { data: existing, error: readErr } = await db.from('market_rates').select('metal, fetched_at');
  if (readErr) return json({ ok: false, error: `Could not read rates: ${readErr.message}` }, 500);
  const have = new Set((existing ?? []).map((r) => r.metal));
  const newest = Math.max(0, ...(existing ?? []).map((r) => Date.parse(r.fetched_at)));
  const complete = METALS.every((m) => have.has(m));
  if (complete && Date.now() - newest < MIN_AGE_HOURS * 3600_000) return json({ ok: true, refreshed: false, reason: 'fresh' });

  let res: Response;
  try {
    res = await fetch(`https://api.metals.dev/v1/latest?api_key=${encodeURIComponent(apiKey)}&currency=INR&unit=kg`, { signal: AbortSignal.timeout(15000) });
  } catch (e) {
    return json({ ok: false, error: `Metals.Dev unreachable: ${(e as Error).message}` }, 502);
  }
  if (!res.ok) return json({ ok: false, error: `Metals.Dev returned HTTP ${res.status}` }, 502);

  const body = await res.json().catch(() => null);
  // Never store prices in the wrong currency or unit.
  if (!body || body.status !== 'success' || body.currency !== 'INR' || body.unit !== 'kg' || !body.metals) {
    return json({ ok: false, error: 'Unexpected response from Metals.Dev (not success / INR / kg)' }, 502);
  }

  const quotedAt = body.timestamps?.metal ? new Date(body.timestamps.metal).toISOString() : null;
  const rows = METALS.flatMap((metal) => {
    const v = Number(body.metals[metal]);
    return Number.isFinite(v) && v > 0 ? [{ metal, inr_per_kg: v, source: 'metals.dev', quoted_at: quotedAt, fetched_at: new Date().toISOString() }] : [];
  });
  if (rows.length === 0) return json({ ok: false, error: 'No valid metal prices in the response' }, 502);

  const { error: upErr } = await db.from('market_rates').upsert(rows, { onConflict: 'metal' });
  if (upErr) return json({ ok: false, error: `Could not store rates: ${upErr.message}` }, 500);
  return json({ ok: true, refreshed: true, metals: rows.map((r) => r.metal) });
});
