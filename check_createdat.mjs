import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://poioxmtrlqbiurrpgehd.supabase.co', 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD');

async function check() {
  const { data, error } = await supabase.from('cnc_job_cards').update({ created_at: new Date().toISOString() }).eq('id', 'JC-1');
  console.log('Update created_at result:', error || 'Success');
}
check();
