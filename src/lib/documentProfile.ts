// The issuing company's details for the invoice and delivery challan PDFs: the profile saved under Settings > Invoice Profile /
// Delivery Challan Profile. The database resolves "which company" from the signed-in user, so a document never prints
// another company's logo. Remembered for a few seconds so a document with several pages / copies asks only once.
import { normaliseStore, sellerFromStore, type QuoteSeller } from './companyProfile';

const cache = new Map<string, { at: number; seller: QuoteSeller | null }>();
const TTL_MS = 15000;

/** Forget the remembered profiles (called after a profile is saved, so the next PDF uses the new details at once). */
export function clearDocumentSellerCache(): void { cache.clear(); }

/** The saved profile of this company for invoices or challans, or null when nothing has been filled in (the plain letterhead is used). */
export async function fetchDocumentSeller(kind: 'invoice' | 'dc'): Promise<QuoteSeller | null> {
  const hit = cache.get(kind);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.seller;
  let seller: QuoteSeller | null = null;
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data, error } = await supabase.rpc('erp_get_company_profile', { p_kind: kind } as never);
    if (!error && data && typeof data === 'object') seller = sellerFromStore(normaliseStore(data, { orgName: '', email: '' }));
  } catch { /* the plain letterhead is used */ }
  cache.set(kind, { at: Date.now(), seller });
  return seller;
}
