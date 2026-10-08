// Drawings and other files attached to a product line of a sales order. Any file type is accepted; files go to the same
// private storage bucket the other pipeline attachments use, and only their paths are saved on the order's item.

import { supabase } from './supabase';

const BUCKET = 'inventory-images';

export const uploadOrderFile = (companyId: string, file: File) => uploadStoredFile(companyId, 'sales-orders', file);

/** Uploads any file to the company's folder `folder` and returns its storage path. */
export async function uploadStoredFile(companyId: string, folder: string, file: File): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'attachment';
  const path = `${companyId}/${folder}/${crypto.randomUUID()}-${safeName}`;
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

/** Downloads a stored file under its own name (short-lived signed link). */
export async function downloadStoredFile(path: string, name: string): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300, { download: name || true });
  if (error || !data?.signedUrl) { alert(error?.message || 'Unable to download the file.'); return; }
  const a = document.createElement('a');
  a.href = data.signedUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

export { itemFilePaths } from './filePaths';
