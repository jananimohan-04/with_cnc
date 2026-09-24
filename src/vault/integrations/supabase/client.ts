// Re-export the main ERP's Supabase client so that the vault uses the exact same
// authenticated session. No separate client, no separate storage.
export { supabase } from '@/lib/supabase';
