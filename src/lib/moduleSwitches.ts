// "Full off": a module switched off for everyone in a company (Access Management). The database keeps the list;
// the app removes those modules from the menu, pages, pipeline columns and KPI tiles of every user of that company.
import { supabase } from './supabase';

/** The modules that can never be switched off: they are how the others are switched back on. */
export const NEVER_OFF: readonly string[] = ['dashboard', 'admin-access', 'settings'];

/** The modules that are fully off for a company (the signed-in user's own company when none is named). Empty if the database script is not applied. */
export async function fetchDisabledModules(companyId?: string | null): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc('erp_get_disabled_modules', (companyId ? { p_company_id: companyId } : {}) as never);
    if (error) console.warn('erp_get_disabled_modules failed (is the Full off SQL applied?):', error.message);
    if (error || !Array.isArray(data)) return [];
    return (data as unknown[]).filter((k): k is string => typeof k === 'string');
  } catch { return []; }
}

/** Switches a module fully off or on again. Returns the new list, or an error message. */
export async function setModuleOff(module: string, off: boolean, companyId?: string | null): Promise<{ modules: string[] } | { error: string }> {
  try {
    const { data, error } = await supabase.rpc('erp_set_module_off', { p_module: module, p_off: off, ...(companyId ? { p_company_id: companyId } : {}) } as never);
    if (error) return { error: error.message };
    return { modules: Array.isArray(data) ? (data as unknown[]).filter((k): k is string => typeof k === 'string') : [] };
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}
