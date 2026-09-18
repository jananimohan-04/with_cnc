import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://poioxmtrlqbiurrpgehd.supabase.co', 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD');
async function check() {
  const { data, error } = await supabase.from('cnc_bom').select('project_name').limit(1);
  if (error) console.log('ERROR:', error);
  else console.log('DATA:', data);
}
check();