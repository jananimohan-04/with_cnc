import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://poioxmtrlqbiurrpgehd.supabase.co', 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD');
async function run() {
  const { data, error } = await supabase.from('finished_goods').insert({ asdf: 1 });
  console.log('Error info for finished_goods:', error);
}
run();
