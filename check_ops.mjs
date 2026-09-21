import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://poioxmtrlqbiurrpgehd.supabase.co', 'sb_publishable_4eaPHUDkrAorDrlWn3G2Sw_2T79KVhD');

async function check() {
  const tables = ['cnc_operators', 'cnc_employees', 'cnc_staff'];
  for (const t of tables) {
    const { error } = await supabase.from(t).select('id').limit(1);
    if (!error) console.log('Exists:', t);
    else console.log('Does not exist:', t, error.message);
  }
}
check();
