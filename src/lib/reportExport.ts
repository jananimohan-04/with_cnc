// Shared report export helpers (CSV download + printable HTML window).

function download(filename: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Downloads rows as CSV (UTF-8 with BOM so Excel shows ₹ and Indian names correctly). */
export function exportCsv(filename: string, rows: unknown[][]) {
  const text = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  download(filename.endsWith('.csv') ? filename : `${filename}.csv`, '﻿' + text, 'text/csv;charset=utf-8');
}

export const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Opens a clean print window with the given report body (already-escaped HTML). */
export function printHtml(title: string, bodyHtml: string) {
  const w = window.open('', '_blank', 'width=1000,height=800');
  if (!w) {
    alert('Allow pop-ups for this site to print the report.');
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #0f172a; margin: 28px; font-size: 12px; }
  .brand { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #f25a0a; padding-bottom: 10px; margin-bottom: 16px; }
  .brand img { height: 42px; }
  h1 { font-size: 20px; margin: 0; }
  .meta { color: #475569; font-size: 12px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th, td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; }
  th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.group td { font-weight: 700; background: #f8fafc; }
  tr.total td { font-weight: 800; border-top: 2px solid #0f172a; background: #fff7ed; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .note { color: #64748b; font-size: 11px; margin-top: 10px; }
  .warn { color: #b91c1c; font-weight: 700; }
  .ok { color: #15803d; font-weight: 700; }
  @page { size: A4 landscape; margin: 12mm; }
</style></head><body>${bodyHtml}
<script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };</script>
</body></html>`);
  w.document.close();
}
