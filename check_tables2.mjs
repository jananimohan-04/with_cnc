import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://poioxmtrlqbiurrpgehd.supabase.co', 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD');
async function run() {
  const { data: d1, error: e1 } = await supabase.from('finished_goods').select('*').limit(1);
  console.log('finished_goods:', d1, e1);
  const { data: d2, error: e2 } = await supabase.from('cnc_deliveries').select('*').limit(1);
  console.log('cnc_deliveries:', d2, e2);
  const { data: d3, error: e3 } = await supabase.from('inventory').select('*').limit(1);
  console.log('inventory:', d3, e3);
  const { data: d4, error: e4 } = await supabase.from('cnc_stock').select('*').limit(1);
  console.log('cnc_stock:', d4, e4);
}
run();
