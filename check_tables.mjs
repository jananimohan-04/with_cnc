import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://poioxmtrlqbiurrpgehd.supabase.co', 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD');
async function run() {
  const { data: d2, error: e2 } = await supabase.from('cnc_inventory').select('*').limit(1);
  console.log('cnc_inventory:', d2, e2);
  const { data: d3, error: e3 } = await supabase.from('cnc_finished_goods').select('*').limit(1);
  console.log('cnc_finished_goods:', d3, e3);
  const { data: d4, error: e4 } = await supabase.from('cnc_delivery_challan').select('*').limit(1);
  console.log('cnc_delivery_challan:', d4, e4);
}
run();
