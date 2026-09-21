import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://poioxmtrlqbiurrpgehd.supabase.co';
const supabaseKey = 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('get_tables');
  if (error) {
     console.log("No rpc get_tables");
  }
}
check();
