import { supabase } from '@/lib/supabase';

/**
 * Next document numbers in sequence (JC-1007, JC-1008 ...) from the highest number already saved for this company
 * (row-level security limits the query to the signed-in company). Replaces random numbers, which could repeat.
 * If the lookup fails it falls back to random numbers so saving is never blocked.
 */
export async function nextDocNos(table: string, column: string, prefix: string, count = 1, pad = 4): Promise<string[]> {
  let start = 0;
  try {
    const { data, error } = await supabase.from(table).select(column).like(column, `${prefix}%`).order(column, { ascending: false }).limit(1);
    if (!error && data && data.length) {
      const m = /(\d+)\s*$/.exec(String((data[0] as any)[column] ?? ''));
      if (m) start = Number(m[1]);
    }
  } catch { /* fall back below */ }
  if (!start) {
    const base = 1000 + Math.floor(Math.random() * 8000);
    return Array.from({ length: count }, (_, i) => `${prefix}${String(base + i).padStart(pad, '0')}`);
  }
  return Array.from({ length: count }, (_, i) => `${prefix}${String(start + 1 + i).padStart(pad, '0')}`);
}
