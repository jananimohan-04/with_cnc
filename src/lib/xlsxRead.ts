// Minimal .xlsx reader: first worksheet -> tab-separated text, ready for parseStatement().
// An .xlsx file is a zip of XML parts; the browser's DecompressionStream inflates them, so no library is needed.
// Dates (numbers with a date format) come out as dd-mm-yyyy [hh:mm] and numbers as plain digits, which also
// recovers long cheque / UTR numbers that Excel only *displays* as 4.00E+11.

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface ZipEntry { name: string; method: number; compSize: number; offset: number }

function listZip(b: Uint8Array): ZipEntry[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This is not a valid .xlsx file.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const compSize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    out.push({ name: dec.decode(b.subarray(p + 46, p + 46 + nameLen)), method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function readEntry(b: Uint8Array, e: ZipEntry): Promise<string> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
  const raw = b.subarray(start, start + e.compSize);
  const data = e.method === 0 ? raw : e.method === 8 ? await inflateRaw(raw) : null;
  if (!data) throw new Error('This .xlsx file uses an unsupported compression. Save it as CSV instead.');
  return new TextDecoder().decode(data);
}

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const pad = (n: number) => String(n).padStart(2, '0');

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** Excel serial day number -> "dd-mm-yyyy" (+ " hh:mm" when it has a time of day). */
export function excelSerialToText(serial: number): string {
  const ms = Math.round(serial * 86400000);
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  const date = `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
  const hasTime = Math.abs(serial - Math.floor(serial)) > 1e-9;
  return hasTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date;
}

const numText = (raw: string): string => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(6)));
};

export async function xlsxToTsv(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error('This is an old Excel (.xls) file. Open it in Excel and Save As .xlsx or CSV.');
  const entries = listZip(bytes);
  const get = async (name: string) => { const e = entries.find(x => x.name.toLowerCase() === name.toLowerCase()); return e ? readEntry(bytes, e) : null; };

  // first worksheet, in workbook order
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await get('xl/workbook.xml'), rels = await get('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const rid = xml(wb).getElementsByTagName('sheet')[0]?.getAttribute('r:id');
    const rel = Array.from(xml(rels).getElementsByTagName('Relationship')).find(r => r.getAttribute('Id') === rid);
    const target = rel?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.?\//, '')}`;
  }
  const sheetXml = await get(sheetPath);
  if (!sheetXml) throw new Error('No worksheet found in this .xlsx file.');

  const sst = await get('xl/sharedStrings.xml');
  const shared: string[] = sst
    ? Array.from(xml(sst).getElementsByTagName('si')).map(si => Array.from(si.getElementsByTagName('t')).map(t => t.textContent ?? '').join(''))
    : [];

  // which cell styles are dates
  const dateStyle = new Set<number>();
  const styles = await get('xl/styles.xml');
  if (styles) {
    const sd = xml(styles);
    const custom = new Map<number, string>();
    Array.from(sd.getElementsByTagName('numFmt')).forEach(n => custom.set(Number(n.getAttribute('numFmtId')), n.getAttribute('formatCode') ?? ''));
    const isDateFmt = (id: number) => BUILTIN_DATE_FMTS.has(id) ||
      (custom.has(id) && /[dmyh]/i.test(custom.get(id)!.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^(general|0|#)/i.test(custom.get(id)!));
    const xfs = sd.getElementsByTagName('cellXfs')[0];
    Array.from(xfs?.getElementsByTagName('xf') ?? []).forEach((xf, i) => { if (isDateFmt(Number(xf.getAttribute('numFmtId')))) dateStyle.add(i); });
  }

  const lines: string[] = [];
  for (const row of Array.from(xml(sheetXml).getElementsByTagName('row'))) {
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const t = c.getAttribute('t');
      const vEl = c.getElementsByTagName('v')[0];
      let text = '';
      if (t === 'inlineStr') text = Array.from(c.getElementsByTagName('t')).map(x => x.textContent ?? '').join('');
      else if (vEl) {
        const raw = vEl.textContent ?? '';
        if (t === 's') text = shared[Number(raw)] ?? '';
        else if (t === 'str' || t === 'e') text = raw;
        else if (t === 'b') text = raw === '1' ? 'TRUE' : 'FALSE';
        else text = dateStyle.has(Number(c.getAttribute('s'))) && Number.isFinite(Number(raw)) ? excelSerialToText(Number(raw)) : numText(raw);
      }
      cells[colIndex(c.getAttribute('r') ?? '')] = text.replace(/[\t\r\n]+/g, ' ').trim();
    }
    const filled = Array.from(cells, x => x ?? '');
    if (filled.some(x => x !== '')) lines.push(filled.join('\t'));
  }
  return lines.join('\n');
}
