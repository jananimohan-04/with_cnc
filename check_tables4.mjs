import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://poioxmtrlqbiurrpgehd.supabase.co', 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD');

async function run() {
  // Query information_schema using REST if possible, but PostgREST restricts it.
  // We can just try a bunch of common prefixes.
  const tables = ['cnc_inventory', 'cnc_stock', 'cnc_stock_movements', 'cnc_raw_materials', 'cnc_items', 'cnc_parts'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('id').limit(1);
    if (!error) console.log('Exists:', t);
  }
}
run();
