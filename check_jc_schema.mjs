import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://poioxmtrlqbiurrpgehd.supabase.co', 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD');

async function check() {
  const { error } = await supabase.from('cnc_job_cards').insert([{ id: 'dummy', does_not_exist: 1 }]);
  console.log(error);
}
check();
