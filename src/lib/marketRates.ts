import type { PriceUnit } from './metalCalc';

// Live metal rates (INR per kg) come from the market_rates table, filled by the
// refresh-metal-rates Edge Function. Only metals a feed actually quotes are listed here;
// steel, stainless, brass etc. stay manual.

export type LiveMetal = 'aluminum' | 'copper' | 'lead' | 'nickel' | 'zinc';

/** calculator material id -> metal in the feed */
export const LIVE_METAL_OF: Record<string, LiveMetal> = {
  aluminium: 'aluminum', copper: 'copper', lead: 'lead', nickel: 'nickel', zinc: 'zinc',
};

export interface MarketRate { metal: LiveMetal; inrPerKg: number; fetchedAt: string; quotedAt: string | null }

/** A rate older than this is shown as out of date and not applied automatically. */
export const STALE_AFTER_HOURS = 36;

const PER_KG_TO_UNIT: Record<PriceUnit, number> = { kg: 1, g: 1 / 1000, tonne: 1000, lb: 1 / 2.2046226218 };

/** INR per kg -> INR per <unit>, as a plain 2-decimal string for the price field. */
export function rateInUnit(inrPerKg: number, unit: PriceUnit): string {
  const v = inrPerKg * PER_KG_TO_UNIT[unit];
  return String(Number(v.toFixed(v >= 1 ? 2 : 4)));
}

/** Out of date = we have not managed to refresh it for a long time (the feed failed). Markets that are closed
 *  at the weekend keep their last quote, which is still our latest successful fetch. */
export function isStale(r: Pick<MarketRate, 'fetchedAt'>, now = Date.now()): boolean {
  const t = Date.parse(r.fetchedAt);
  return !Number.isFinite(t) || now - t > STALE_AFTER_HOURS * 3600_000;
}

/** Worth asking the server for a refresh (it still decides, and never calls the provider more than every 6 h). */
export function needsRefresh(r: Pick<MarketRate, 'fetchedAt'> | undefined, now = Date.now(), maxHours = 12): boolean {
  if (!r) return true;
  const t = Date.parse(r.fetchedAt);
  return !Number.isFinite(t) || now - t > maxHours * 3600_000;
}

export function ageLabel(iso: string | null, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return 'time unknown';
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Rows from the market_rates table -> typed rates; ignores anything malformed. */
export function parseRates(rows: unknown): Partial<Record<LiveMetal, MarketRate>> {
  const out: Partial<Record<LiveMetal, MarketRate>> = {};
  if (!Array.isArray(rows)) return out;
  for (const r of rows as Record<string, unknown>[]) {
    const metal = String(r.metal) as LiveMetal;
    const v = Number(r.inr_per_kg);
    if (!['aluminum', 'copper', 'lead', 'nickel', 'zinc'].includes(metal) || !Number.isFinite(v) || v <= 0) continue;
    out[metal] = { metal, inrPerKg: v, fetchedAt: String(r.fetched_at ?? ''), quotedAt: r.quoted_at ? String(r.quoted_at) : null };
  }
  return out;
}
