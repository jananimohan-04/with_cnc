import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://poioxmtrlqbiurrpgehd.supabase.co', 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD');

async function check() {
  const { data } = await supabase.from('cnc_work_orders').select('customer').limit(5);
  console.log('Work order customers:', data);
}
check();
