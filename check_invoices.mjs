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
    let { error } = await supabase.from('cnc_invoices').select('*').limit(1);
    console.log("Invoices:", error ? error.message : "Exists");
    
    let { error: e2 } = await supabase.from('cnc_billing').select('*').limit(1);
    console.log("Billing:", e2 ? e2.message : "Exists");

    let { error: e3 } = await supabase.from('cnc_sales_invoices').select('*').limit(1);
    console.log("Sales Invoices:", e3 ? e3.message : "Exists");
  }
  check();
}
