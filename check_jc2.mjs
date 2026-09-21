import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://poioxmtrlqbiurrpgehd.supabase.co', 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD');

async function check() {
  const { data, error } = await supabase.from('cnc_job_cards').select('*').limit(1);
  console.log(data?.[0]);
  
  // Also let's try to update a non-existent column to see the exact error
  const { error: err2 } = await supabase.from('cnc_job_cards').update({ planned_start: '2026-09-21T08:00' }).eq('id', 'JC-1');
  console.log(err2);
}
check();
