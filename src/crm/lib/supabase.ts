// Inside BI the Leads CRM uses BI's own database connection and sign-in.
import { supabase as bi } from "@/lib/supabase";

export const supabase = bi;
export const supabaseConfigured = true;
export const supabaseConfigProblem: string | null = null;
