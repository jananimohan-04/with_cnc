import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://poioxmtrlqbiurrpgehd.supabase.co';
const supabaseKey = 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('cncvault_documents').select('*').limit(1);
  if (error) console.error(error);
  else console.log('TABLE EXISTS:', data);
}
check();