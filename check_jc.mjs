import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://poioxmtrlqbiurrpgehd.supabase.co', 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD');

async function check() {
  const { data } = await supabase.from('cnc_job_cards').select('*').limit(1);
  console.log('cnc_job_cards:', data?.[0] || 'Empty');
}
check();
