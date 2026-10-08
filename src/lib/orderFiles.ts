// Drawings and other files attached to a product line of a sales order. Any file type is accepted; files go to the same
// private storage bucket the other pipeline attachments use, and only their paths are saved on the order's item.

import { supabase } from './supabase';

const BUCKET = 'inventory-images';

export async function uploadOrderFile(companyId: string, file: File): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'attachment';
  const path = `${companyId}/sales-orders/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error(`Unable to upload ${file.name}: ${error.message}`);
  return path;
}

/** Opens a stored file in a new tab through a short-lived signed link. */
export async function openStoredFile(path: string): Promise<void> {
  const tab = window.open('', '_blank');
  if (!tab) { alert('Allow pop-ups to open the attachment.'); return; }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) { tab.close(); alert(error?.message || 'Unable to open the attachment.'); return; }
  tab.location.href = data.signedUrl;
}

/** Stored file paths of one item (strings or {path|url, name} objects) as name + path. */
export function itemFilePaths(item: { filePaths?: unknown } | null | undefined): { name: string; path: string }[] {
  const out: { name: string; path: string }[] = [];
  const list = Array.isArray(item?.filePaths) ? (item!.filePaths as unknown[]) : [];
  for (const fp of list) {
    if (!fp) continue;
    if (typeof fp === 'string') out.push({ name: fp.split('/').pop() || fp, path: fp });
    else {
      const o = fp as { path?: string; url?: string; name?: string };
      const path = o.path || o.url || '';
      if (path) out.push({ name: o.name || path.split('/').pop() || path, path });
    }
  }
  return out;
}
