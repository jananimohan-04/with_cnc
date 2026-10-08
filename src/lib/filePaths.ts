// Stored-file helpers that need no network.

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
