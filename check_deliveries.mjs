import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.+)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/);

if (urlMatch && keyMatch) {
  const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());
  
  async function check() {
    let { data, error } = await supabase.rpc('hello'); // just to fail
    let { error: e2 } = await supabase.from('cnc_deliveries').select('foo_bar_not_exists').limit(1);
    console.log(e2);
  }
  check();
}
