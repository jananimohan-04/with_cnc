import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://poioxmtrlqbiurrpgehd.supabase.co', 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD');
async function check() {
  const { data, error } = await supabase.rpc('get_functions');
  console.log(error ? error.message : data);
}
check();
