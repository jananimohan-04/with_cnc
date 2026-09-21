import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://poioxmtrlqbiurrpgehd.supabase.co', 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD');

async function run() {
  const { data: d1 } = await supabase.from('cnc_parts').select('*').limit(1);
  console.log('cnc_parts:', d1?.[0]);
  const { data: d2 } = await supabase.from('cnc_stock_movements').select('*').limit(1);
  console.log('cnc_stock_movements:', d2?.[0]);
}
run();
