const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const tables = ['cnc_warehouses', 'cnc_warehouse_zones', 'cnc_warehouse_locations'];
  for (const t of tables) {
     const { error } = await supabase.from(t).select('id').limit(1);
     if (error && error.code === '42P01') console.log('Missing: ' + t);
     else if (error) console.log('Error: ' + t + ' - ' + error.message);
     else console.log('Exists: ' + t);
  }
}
check();
