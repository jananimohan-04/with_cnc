/* ======================================================================================
 * AI Attendance v1 REST surface  (mounted at /api/attendance/v1)
 *
 * The pages in src/attendance/v2 call the same paths and payloads as the original
 * attendance product; this module answers them with the same JSON shapes, messages and
 * calculations (late / half-day / overtime, advances, payroll, reports).
 *
 * Differences from the original server:
 *  - Identity: the BI sign-in token (Authorization: Bearer ...). organization = the BI company
 *    (organization_id = company id, slug = company code). SUPER_ADMIN / COMPANY_ADMIN act as the
 *    organisation admin; USER acts as an employee (matched by e-mail / user link to an attendance employee).
 *  - Faces: the browser sends face vectors (face_embedding / face_embeddings); no images.
 *  - Data: the bi_attendance_* tables (see migration 20261122000000_attendance_v1.sql). Until that
 *    migration is applied, a collection whose table / column is missing is kept in the server data file.
 * Errors are { detail: "<message>" } like the original.
 * ====================================================================================== */
'use strict';
const crypto = require('crypto');
const express = require('express');

// ------------------------------------------------------------------ small helpers
class HttpError extends Error { constructor(status, detail) { super(detail); this.status = status; this.detail = detail; } }
const fail = (status, detail) => { throw new HttpError(status, detail); };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const hex = (n) => crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n).toUpperCase();
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const pad = (n, w = 2) => String(n).padStart(w, '0');
const lower = (s) => String(s || '').trim().toLowerCase();
const round = (x, n = 0) => { const v = Number(x) || 0; const r = Number(Math.round(Number(Math.abs(v) + 'e' + n)) + 'e-' + n); return v < 0 ? -r : r; };
const num = (v, d = 0) => { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) ? d : n; };
/* Python float repr: 8.0 -> "8.0", 8.25 -> "8.25" */
const pyf = (x) => { const v = Number(x) || 0; return Number.isInteger(v) ? v.toFixed(1) : String(v); };
const money2 = (x) => (Number(x) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (x) => (Number(x) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON3 = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const strCmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortBy = (list, key, desc = false) => list.sort((a, b) => { const r = strCmp(String(a[key] == null ? '' : a[key]), String(b[key] == null ? '' : b[key])); return desc ? -r : r; });

// India Standard Time (UTC+5:30), like the original server
const IST_MS = 330 * 60000;
function ist(d = new Date()) {
  const t = new Date(d.getTime() + IST_MS);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), H: t.getUTCHours(), M: t.getUTCMinutes(), S: t.getUTCSeconds() };
}
const istDate = (d = new Date()) => { const p = ist(d); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; };
const time12 = (H, M, S) => `${pad(H % 12 || 12)}:${pad(M)}${S === undefined ? '' : ':' + pad(S)} ${H < 12 ? 'AM' : 'PM'}`;
const istTime12 = (d = new Date()) => { const p = ist(d); return time12(p.H, p.M, p.S); };
const utcStamp = (d = new Date()) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14); // %Y%m%d%H%M%S
const fmtUtcStamp = (d = new Date()) => `${d.toISOString().slice(0, 10)} ${time12(d.getUTCHours(), d.getUTCMinutes())}`; // %Y-%m-%d %I:%M %p (UTC)

/* datetime.fromisoformat equivalent -> epoch ms (naive values are read as UTC so differences stay correct) */
function parseIso(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2})(?:\.(\d+))?)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(s.trim());
  if (!m) return null;
  const tz = m[5] ? (m[5] === 'Z' ? 'Z' : m[5].length === 5 ? m[5].slice(0, 3) + ':' + m[5].slice(3) : m[5]) : 'Z';
  const t = Date.parse(`${m[1]}T${m[2] || '00:00'}:${m[3] || '00'}.${(m[4] || '0').slice(0, 3).padEnd(3, '0')}${tz}`);
  return Number.isFinite(t) ? t : null;
}
/* "%I:%M %p" of an ISO string in its own offset (as Python prints an aware datetime) */
function wallTime12(s) {
  const m = /T(\d{2}):(\d{2})/.exec(String(s));
  return m ? time12(+m[1], +m[2]) : String(s);
}

// ------------------------------------------------------------------ face vectors (same matching as the BI attendance handler)
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) { const x = Number(a[i]) || 0, y = Number(b[i]) || 0; dot += x * y; na += x * x; nb += y * y; }
  if (na < 1e-6 || nb < 1e-6) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function consensusVector(list) {
  const len = list[0].length;
  const out = new Array(len).fill(0);
  for (const v of list) for (let i = 0; i < len; i++) out[i] += Number(v[i]) || 0;
  let n = 0;
  for (let i = 0; i < len; i++) { out[i] /= list.length; n += out[i] * out[i]; }
  n = Math.sqrt(n);
  if (n > 1e-6) for (let i = 0; i < len; i++) out[i] /= n;
  return out;
}
const isVector = (v) => Array.isArray(v) && v.length >= 64 && v.length <= 4096 && v.every((x) => typeof x === 'number' && Number.isFinite(x));
const IMAGE_ONLY = 'Face images are no longer accepted. Please update the page so the face vector is worked out on this device and try again.';
/* 1:N match: best similarity per employee, minimum threshold, winner-take-all margin (BI handler values) */
function findBestMatch(live, employees, threshold, margin = 0.06) {
  const cands = [];
  for (const emp of employees) {
    const embs = Array.isArray(emp.face_embeddings) ? emp.face_embeddings : [];
    if (!embs.length) continue;
    let best = -1;
    for (const e of embs) { const s = cosineSimilarity(live, e); if (s > best) best = s; }
    if (best > 0.40) cands.push({ emp, sim: best });
  }
  if (!cands.length) return { emp: null, confidence: 0 };
  cands.sort((a, b) => b.sim - a.sim);
  const best = cands[0];
  const confidence = Math.round(best.sim * 10000) / 10000;
  if (best.sim < threshold) return { emp: null, confidence };
  if (cands.length >= 2 && best.sim - cands[1].sim < margin) return { emp: null, confidence, ambiguous: true };
  return { emp: best.emp, confidence };
}
function liveVectorFrom(body) {
  const b = body || {};
  if (b.face_embedding === undefined || b.face_embedding === null) {
    if (b.image_sample) fail(400, IMAGE_ONLY);
    fail(400, 'No face vector received. Please allow camera access and position your face inside the reticle.');
  }
  if (!isVector(b.face_embedding)) fail(400, 'No face clearly detected. Please look directly into the camera with good lighting.');
  return b.face_embedding;
}

// ------------------------------------------------------------------ status / hours rules (ported 1:1)
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000.0, rad = Math.PI / 180;
  const p1 = lat1 * rad, p2 = lat2 * rad, dp = (lat2 - lat1) * rad, dl = (lon2 - lon1) * rad;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)), 1);
}
function punchesTotalHours(punches) {
  if (!punches || !punches.length) return 0;
  let total = 0, lastIn = null;
  for (const p of punches) {
    const action = String(p.action || '').toUpperCase();
    const t = parseIso(p.timestamp);
    if (t === null) continue;
    if (action === 'CHECK_IN') lastIn = t;
    else if (action === 'CHECK_OUT' && lastIn !== null) { const diff = (t - lastIn) / 1000; if (diff > 0) total += diff; lastIn = null; }
  }
  const hours = total / 3600;
  if (total > 0 && hours < 0.01) return 0.01;
  return round(hours, 2);
}
function reconcileStatus(record, workHours, emp, nowMs = Date.now()) {
  const cfg = workHours || {};
  let halfDay = num(cfg.half_day_hours, 0) || 4.5;
  const empType = String((emp && emp.employment_type) || record.employment_type || 'FULL_TIME').toUpperCase();
  let target;
  if (empType === 'PART_TIME') { target = num((emp && emp.target_daily_hours) || record.target_daily_hours, 0) || 4.0; halfDay = round(target * 0.5, 2); }
  else target = 7.5;
  const totalHours = num(record.total_hours, 0);
  const isIn = !!record.is_currently_in;
  const punchCount = parseInt(record.punch_count, 10) || (record.punches || []).length;
  const now = ist(new Date(nowMs));
  const today = `${now.y}-${pad(now.mo)}-${pad(now.d)}`;
  const isPast = !!(record.date && record.date < today);
  let endH = 18, endM = 0;
  const se = String((emp && emp.shift_end) || cfg.end_time || '18:00').split(':');
  if (se.length >= 2 && !Number.isNaN(parseInt(se[0], 10)) && !Number.isNaN(parseInt(se[1], 10))) { endH = parseInt(se[0], 10); endM = parseInt(se[1], 10); }
  const pastEnd = now.H * 60 + now.M >= endH * 60 + endM;
  const concluded = isPast || (punchCount >= 4 && !isIn) || (!isIn && pastEnd);
  const exStatus = record.status || 'PRESENT';
  const exShift = record.shift_status || 'ON-TIME';
  const wasLate = exStatus === 'LATE' || String(exShift).toUpperCase().includes('LATE');
  let breakStatus;
  if (isIn) breakStatus = 'WORKING';
  else if (concluded) breakStatus = 'SHIFT_ENDED';
  else if (punchCount === 2) breakStatus = 'ON_LUNCH_BREAK';
  else if (punchCount > 0) breakStatus = 'ON_BREAK';
  else breakStatus = 'NOT_STARTED';
  const keep = () => [wasLate ? 'LATE' : 'PRESENT', wasLate ? 'LATE' : (exShift !== 'FLEXIBLE' ? 'ON-TIME' : 'FLEXIBLE')];
  let status, shift;
  if (isIn || !concluded) [status, shift] = keep();
  else if (totalHours >= target) [status, shift] = keep();
  else if (totalHours >= halfDay) { status = 'HALF_DAY'; shift = wasLate ? 'LATE & HALF-DAY' : 'HALF-DAY'; }
  else if (totalHours > 0) { status = 'HALF_DAY'; shift = `HALF-DAY (${pyf(totalHours)}h)`; }
  else { status = 'ABSENT'; shift = 'ABSENT'; }
  return { status, shift_status: shift, break_status: breakStatus, is_concluded: concluded, total_hours: totalHours };
}
function entryDistance(r, { baseLat, baseLon, radius, officeName, overwrite }) {
  let dist = null;
  if (r.distance_meters !== null && r.distance_meters !== undefined) { const d = Number(r.distance_meters); dist = Number.isFinite(d) ? round(d, 1) : null; }
  else if (r.latitude != null && r.longitude != null && baseLat != null && baseLon != null) {
    const d = haversine(Number(r.latitude), Number(r.longitude), Number(baseLat), Number(baseLon));
    if (Number.isFinite(d)) { dist = d; r.distance_meters = d; }
  }
  if (!overwrite && r.entry_distance) return;
  if (r.verification_mode === 'MANUAL_OVERRIDE') { r.entry_distance = '0m (HQ Authorized)'; r.distance_meters = 0.0; }
  else if (dist !== null) r.entry_distance = dist <= radius ? `${Math.trunc(dist)}m (Within ${officeName})` : `${Math.trunc(dist)}m (Off-Site)`;
  else if (r.site_visit_verified || r.client_site_name) { r.entry_distance = `0m (${r.client_site_name || 'Client Site'})`; r.distance_meters = 0.0; }
  else if (r.kiosk_id || r.verification_mode === 'FACE_KIOSK') { r.entry_distance = `0m (${officeName} Kiosk)`; r.distance_meters = 0.0; }
  else { r.entry_distance = `0m (Within ${officeName})`; r.distance_meters = 0.0; }
}

function numberToIndianWords(n) {
  if (n === null || n === undefined) return 'Zero Rupees Only';
  const val = round(Number(n), 2);
  if (val < 0) return `Minus ${numberToIndianWords(-val)}`;
  let rupees = Math.trunc(val);
  const paise = Math.trunc(Math.round((val - rupees) * 100));
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x) => (x < 20 ? units[x] : tens[Math.trunc(x / 10)] + (x % 10 > 0 ? ' ' + units[x % 10] : ''));
  const three = (x) => { let r = ''; const h = Math.trunc(x / 100), rem = x % 100; if (h > 0) { r += units[h] + ' Hundred'; if (rem > 0) r += ' and '; } if (rem > 0) r += two(rem); return r; };
  const parts = [];
  const crores = Math.trunc(rupees / 10000000); rupees %= 10000000; if (crores > 0) parts.push(three(crores) + ' Crore');
  const lakhs = Math.trunc(rupees / 100000); rupees %= 100000; if (lakhs > 0) parts.push(two(lakhs) + ' Lakh');
  const thousands = Math.trunc(rupees / 1000); rupees %= 1000; if (thousands > 0) parts.push(two(thousands) + ' Thousand');
  if (rupees > 0) parts.push(three(rupees));
  let result = `${parts.length ? parts.join(' ').trim() : 'Zero'} Rupees`;
  if (paise > 0) result += ` and ${two(paise)} Paise`;
  return result + ' Only';
}

// ------------------------------------------------------------------ CSV / XLSX writers (no extra library)
function csvOf(columns, rows) {
  const cell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [columns.map(cell).join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zipStored(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), data = Buffer.from(f.data, 'utf8'), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    parts.push(local, name, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((a, p) => a + p.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cenSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}
// eslint-disable-next-line no-control-regex
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
function colName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
/* sheets: [{ name, columns: [..], rows: [[..]] }] -> real .xlsx (stored ZIP) */
function xlsxOf(sheets) {
  const sheetXml = (s) => {
    const all = [s.columns, ...s.rows];
    const widths = s.columns.map((_, c) => Math.min(60, Math.max(8, ...all.map((r) => String(r[c] == null ? '' : r[c]).length + 2))));
    const rowsXml = all.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      const ref = `${colName(ci)}${ri + 1}`;
      if (v === null || v === undefined || v === '') return '';
      if (ri > 0 && typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rowsXml}</sheetData></worksheet>`;
  };
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  return zipStored([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: styles },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ]);
}

// ------------------------------------------------------------------ row <-> document mapping
const EMP_COLS = ['employee_code', 'first_name', 'last_name', 'email', 'phone', 'department', 'designation', 'employment_type', 'shift_type', 'shift_start', 'shift_end', 'hourly_rate', 'face_embeddings', 'is_active', 'created_at'];
const EMP_SKIP = new Set([...EMP_COLS, 'id', 'organization_id', 'consent_given', 'consent_timestamp', 'user_id', 'updated_at', 'has_biometric', 'samples_count', 'enrolled_samples_count', 'avatar_url']);
function empToRow(doc, cid) {
  const embs = Array.isArray(doc.face_embeddings) ? doc.face_embeddings : [];
  const row = {
    id: doc.id, company_id: cid, user_id: isUuid(doc.user_id) ? doc.user_id : null,
    employee_code: String(doc.employee_code || ''), first_name: String(doc.first_name || ''), last_name: String(doc.last_name || ''),
    email: doc.email || null, phone: doc.phone || null,
    department: doc.department || 'General', designation: doc.designation || 'Staff',
    employment_type: doc.employment_type || 'FULL_TIME', shift_type: doc.shift_type || 'FIXED',
    shift_start: doc.shift_start || null, shift_end: doc.shift_end || null,
    hourly_rate: num(doc.hourly_rate, 250), face_embeddings: embs,
    enrolled_samples_count: num(doc.enrolled_samples_count, embs.length ? Math.max(1, embs.length - 1) : 0),
    biometric_consent: !!doc.consent_given, consent_timestamp: doc.consent_timestamp || null,
    is_active: doc.is_active !== false, avatar_url: doc.avatar_url || null,
    updated_at: new Date().toISOString(),
  };
  if (doc.created_at) row.created_at = doc.created_at;
  const profile = {};
  for (const [k, v] of Object.entries(doc)) if (!EMP_SKIP.has(k) && v !== undefined) profile[k] = v;
  row.profile = profile;
  return row;
}
function empFromRow(row) {
  const doc = { ...(row.profile || {}) };
  doc.id = row.id;
  doc.organization_id = row.company_id;
  for (const c of EMP_COLS) doc[c] = row[c];
  doc.hourly_rate = num(row.hourly_rate, 250);
  doc.last_name = row.last_name || '';
  doc.face_embeddings = Array.isArray(row.face_embeddings) ? row.face_embeddings : [];
  doc.consent_given = !!row.biometric_consent;
  doc.consent_timestamp = row.consent_timestamp || null;
  doc.user_id = row.user_id || null;
  doc.updated_at = row.updated_at || doc.updated_at;
  if (row.avatar_url) doc.avatar_url = row.avatar_url;
  return doc;
}
const MODE_TO_COL = { FACE_KIOSK: 'KIOSK', FIELD_CLIENT_SITE: 'FIELD_GPS', MANUAL_OVERRIDE: 'MANUAL' };
const COL_TO_MODE = { KIOSK: 'FACE_KIOSK', FACE_AI: 'FACE_KIOSK', FIELD_GPS: 'FIELD_CLIENT_SITE', MANUAL: 'MANUAL_OVERRIDE' };
const tsOrNull = (s) => (parseIso(s) === null ? null : new Date(parseIso(s)).toISOString());
const numOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
function attToRow(doc, cid) {
  const extra = {};
  for (const [k, v] of Object.entries(doc)) if (!['id', 'organization_id', 'employee_id', 'date', 'punches'].includes(k) && v !== undefined) extra[k] = v;
  return {
    id: doc.id, company_id: cid, employee_id: doc.employee_id, log_date: doc.date,
    check_in_time: doc.check_in_time || null, check_out_time: doc.check_out_time || null,
    first_punch_in: tsOrNull(doc.check_in), last_punch_out: tsOrNull(doc.check_out),
    total_hours: Math.min(999.99, Math.max(0, num(doc.total_hours, 0))),
    status: doc.status || 'PRESENT', shift_status: doc.shift_status || 'ON-TIME',
    is_currently_in: !!doc.is_currently_in, confidence_score: Math.min(9.9999, num(doc.confidence_score, 0)),
    liveness_verified: doc.liveness_verified !== false, punch_mode: MODE_TO_COL[doc.verification_mode] || 'FACE_AI',
    punches: Array.isArray(doc.punches) ? doc.punches : [],
    latitude: numOrNull(doc.latitude), longitude: numOrNull(doc.longitude),
    geofence_status: doc.geofence_status || null, kiosk_id: doc.kiosk_id || null, remarks: doc.notes || null,
    updated_at: new Date().toISOString(), extra,
  };
}
function attFromRow(row) {
  const ex = row.extra || {};
  const doc = { ...ex };
  Object.assign(doc, {
    id: row.id, organization_id: row.company_id, employee_id: row.employee_id, date: String(row.log_date || '').slice(0, 10),
    check_in_time: row.check_in_time || null, check_out_time: row.check_out_time || null,
    total_hours: num(row.total_hours, 0), status: row.status, shift_status: row.shift_status,
    is_currently_in: !!row.is_currently_in, confidence_score: num(row.confidence_score, 0), liveness_verified: row.liveness_verified !== false,
    punches: Array.isArray(row.punches) ? row.punches : [],
    latitude: numOrNull(row.latitude), longitude: numOrNull(row.longitude), geofence_status: row.geofence_status || ex.geofence_status || null,
    kiosk_id: row.kiosk_id || null,
  });
  if (doc.check_in === undefined) doc.check_in = row.first_punch_in || null;
  if (doc.check_out === undefined) doc.check_out = row.last_punch_out || null;
  if (!doc.verification_mode) doc.verification_mode = COL_TO_MODE[row.punch_mode] || 'FACE_KIOSK';
  if (doc.notes === undefined && row.remarks) doc.notes = row.remarks;
  if (doc.created_at === undefined) doc.created_at = row.created_at;
  return doc;
}
function leaveToRow(doc, cid) {
  const extra = {};
  for (const [k, v] of Object.entries(doc)) if (!['id', 'organization_id', 'employee_id', 'reason', 'status', 'approved_by', 'created_at'].includes(k) && v !== undefined) extra[k] = v;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(doc.from_date)) ? doc.from_date : istDate();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(doc.to_date)) ? doc.to_date : from;
  const span = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const row = {
    id: doc.id, company_id: cid, employee_id: doc.employee_id, leave_type: doc.category || 'Leave',
    start_date: from, end_date: to < from ? from : to, days: Math.min(999, doc.duration_mode === 'FULL' || !doc.duration_mode ? span : span * 0.5),
    reason: doc.reason || '', status: doc.status || 'Pending Review', approved_by: doc.approved_by || null,
    updated_at: new Date().toISOString(), extra,
  };
  if (doc.created_at) row.created_at = doc.created_at;
  return row;
}
function leaveFromRow(row) {
  const ex = row.extra || {};
  const doc = { ...ex, id: row.id, organization_id: row.company_id, employee_id: row.employee_id, reason: row.reason, status: row.status, approved_by: row.approved_by, created_at: ex.created_at || row.created_at };
  if (!doc.category) doc.category = row.leave_type;
  if (!doc.dates) doc.dates = `${row.start_date} to ${row.end_date}`;
  if (doc.days === undefined) doc.days = num(row.days, 1) >= 1 ? 'Full Shift' : 'Half Day';
  return doc;
}
const genericToRow = (doc, cid) => {
  const d = { ...doc }; delete d.organization_id;
  return { id: doc.id, company_id: cid, employee_id: doc.employee_id == null ? null : String(doc.employee_id), created_at: doc.created_at || new Date().toISOString(), updated_at: new Date().toISOString(), doc: d };
};
const genericFromRow = (row) => ({ ...(row.doc || {}), id: row.id, organization_id: row.company_id });

const COLLECTIONS = {
  employees: { table: 'bi_attendance_employees', probe: 'id, profile', uuidId: true, toRow: empToRow, fromRow: empFromRow },
  attendance: { table: 'bi_attendance_records', probe: 'id, extra', uuidId: true, uuidEmp: true, dateCol: 'log_date', toRow: attToRow, fromRow: attFromRow },
  leaves: { table: 'bi_attendance_leaves', probe: 'id, extra', uuidId: true, uuidEmp: true, toRow: leaveToRow, fromRow: leaveFromRow },
};
for (const [name, table] of Object.entries({
  manual_overrides: 'bi_attendance_overrides', advances: 'bi_attendance_advances', financial_entries: 'bi_attendance_financial_entries',
  notifications: 'bi_attendance_notifications', client_sites: 'bi_attendance_client_sites', salary_payouts: 'bi_attendance_payouts',
  attendance_events: 'bi_attendance_events',
})) COLLECTIONS[name] = { table, probe: 'id, doc', uuidId: false, toRow: genericToRow, fromRow: genericFromRow };

const MISSING_CODES = new Set(['42P01', 'PGRST205', '42703', 'PGRST204', 'PGRST200']);
const isMissing = (e) => !!e && (MISSING_CODES.has(e.code) || /does not exist|could not find the|schema cache/i.test(String(e.message || '')));
const SETTINGS_COLS = 'id, company_id, work_start_time, work_end_time, late_grace_minutes, half_day_hours, full_day_hours, geofence_enabled, geofence_latitude, geofence_longitude, geofence_radius_meters, similarity_threshold, org_profile';

// ------------------------------------------------------------------ storage (database first, server data file until the migration is applied)
function makeStore({ SB, db, save }) {
  if (!db.attendance_v1 || typeof db.attendance_v1 !== 'object' || Array.isArray(db.attendance_v1)) db.attendance_v1 = {};
  const probes = new Map();
  const localCols = new Set();
  const remoteOn = () => !!(SB && SB.enabled && SB.admin);
  const bucket = (col) => { if (!Array.isArray(db.attendance_v1[col])) db.attendance_v1[col] = []; return db.attendance_v1[col]; };
  const dbErr = (e) => { const err = new Error(e.message || 'database error'); err.code = e.code; return err; };

  async function isLocal(col) {
    if (!remoteOn()) return true;
    if (localCols.has(col)) return true;
    if (!probes.has(col)) {
      const table = col === '__settings' ? 'bi_attendance_settings' : COLLECTIONS[col].table;
      const probe = col === '__settings' ? 'id, org_profile, logo_url' : COLLECTIONS[col].probe;
      probes.set(col, Promise.resolve(SB.admin.from(table).select(probe).limit(1)).then(({ error }) => {
        if (error && isMissing(error)) {
          console.warn(`[Attendance v1] ${table} is not ready (${error.message}); keeping "${col}" in the server data file until the attendance migration is applied.`);
          localCols.add(col);
        } else if (error) probes.delete(col);
      }).catch(() => { probes.delete(col); }));
    }
    await probes.get(col);
    return localCols.has(col);
  }
  const matches = (doc, f) => {
    if (f.employee_id !== undefined && String(doc.employee_id) !== String(f.employee_id)) return false;
    if (f.date !== undefined && doc.date !== f.date) return false;
    if (f.date_in && !f.date_in.includes(doc.date)) return false;
    if (f.date_gte && !(doc.date && doc.date >= f.date_gte)) return false;
    if (f.date_lte && !(doc.date && doc.date <= f.date_lte)) return false;
    return true;
  };
  async function list(col, cid, f = {}) {
    const def = COLLECTIONS[col];
    if (await isLocal(col)) return bucket(col).filter((d) => d.organization_id === cid && matches(d, f)).map(clone);
    if (f.employee_id !== undefined && def.uuidEmp && !isUuid(String(f.employee_id))) return [];
    const out = [];
    for (let from = 0; ; from += 1000) {
      let q = SB.admin.from(def.table).select('*').eq('company_id', cid);
      if (f.employee_id !== undefined) q = q.eq('employee_id', String(f.employee_id));
      if (def.dateCol) {
        if (f.date !== undefined) q = q.eq(def.dateCol, f.date);
        if (f.date_in) q = q.in(def.dateCol, f.date_in);
        if (f.date_gte) q = q.gte(def.dateCol, f.date_gte);
        if (f.date_lte) q = q.lte(def.dateCol, f.date_lte);
      }
      const { data, error } = await q.order('id', { ascending: true }).range(from, from + 999);
      if (error) throw dbErr(error);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out.map(def.fromRow).filter((d) => matches(d, def.dateCol ? {} : f));
  }
  async function get(col, cid, id) {
    const def = COLLECTIONS[col];
    if (id === undefined || id === null) return null;
    if (await isLocal(col)) { const d = bucket(col).find((x) => x.organization_id === cid && x.id === id); return d ? clone(d) : null; }
    if (def.uuidId && !isUuid(String(id))) return null;
    const { data, error } = await SB.admin.from(def.table).select('*').eq('company_id', cid).eq('id', String(id)).maybeSingle();
    if (error) throw dbErr(error);
    return data ? def.fromRow(data) : null;
  }
  async function insert(col, cid, doc) {
    const def = COLLECTIONS[col];
    const d = { ...doc, organization_id: cid };
    if (!d.id || (def.uuidId && !isUuid(d.id))) d.id = def.uuidId ? crypto.randomUUID() : (d.id || crypto.randomUUID());
    if (await isLocal(col)) { bucket(col).push(clone(d)); save(); return clone(d); }
    const { data, error } = await SB.admin.from(def.table).insert(def.toRow(d, cid)).select('*').single();
    if (error) throw dbErr(error);
    return def.fromRow(data);
  }
  async function update(col, cid, id, patch) {
    const def = COLLECTIONS[col];
    const cur = await get(col, cid, id);
    if (!cur) return null;
    const merged = { ...cur, ...patch, id: cur.id, organization_id: cid };
    if (await isLocal(col)) {
      const list = bucket(col); const i = list.findIndex((x) => x.organization_id === cid && x.id === cur.id);
      if (i >= 0) list[i] = clone(merged); save(); return clone(merged);
    }
    const { data, error } = await SB.admin.from(def.table).update(def.toRow(merged, cid)).eq('company_id', cid).eq('id', String(cur.id)).select('*').single();
    if (error) throw dbErr(error);
    return def.fromRow(data);
  }
  async function remove(col, cid, id) {
    const def = COLLECTIONS[col];
    if (await isLocal(col)) { const list = bucket(col); const n = list.length; db.attendance_v1[col] = list.filter((x) => !(x.organization_id === cid && x.id === id)); if (n !== db.attendance_v1[col].length) save(); return; }
    if (def.uuidId && !isUuid(String(id))) return;
    const { error } = await SB.admin.from(def.table).delete().eq('company_id', cid).eq('id', String(id));
    if (error) throw dbErr(error);
  }
  async function removeForEmployee(col, cid, empId) {
    const def = COLLECTIONS[col];
    if (await isLocal(col)) { const list = bucket(col); db.attendance_v1[col] = list.filter((x) => !(x.organization_id === cid && String(x.employee_id) === String(empId))); if (list.length !== db.attendance_v1[col].length) save(); return; }
    if (def.uuidEmp && !isUuid(String(empId))) return;
    const { error } = await SB.admin.from(def.table).delete().eq('company_id', cid).eq('employee_id', String(empId));
    if (error) throw dbErr(error);
  }
  // per-company settings row (bi_attendance_settings)
  async function getSettings(cid, withLogo = false) {
    if (await isLocal('__settings')) { const s = bucket('__settings').find((x) => x.company_id === cid); return s ? clone(s) : null; }
    const { data, error } = await SB.admin.from('bi_attendance_settings').select(withLogo ? SETTINGS_COLS + ', logo_url' : SETTINGS_COLS).eq('company_id', cid).maybeSingle();
    if (error) throw dbErr(error);
    return data || null;
  }
  async function saveSettings(cid, patch) {
    const cur = (await getSettings(cid)) || {};
    const row = {
      company_id: cid,
      work_start_time: cur.work_start_time || '09:00', work_end_time: cur.work_end_time || '18:00',
      late_grace_minutes: cur.late_grace_minutes ?? 15, half_day_hours: cur.half_day_hours ?? 4.5,
      geofence_enabled: !!cur.geofence_enabled, geofence_latitude: cur.geofence_latitude ?? null, geofence_longitude: cur.geofence_longitude ?? null,
      geofence_radius_meters: cur.geofence_radius_meters ?? 150, org_profile: cur.org_profile || {},
      ...patch, updated_at: new Date().toISOString(),
    };
    if (await isLocal('__settings')) {
      const list = bucket('__settings'); const i = list.findIndex((x) => x.company_id === cid);
      if (i >= 0) list[i] = { ...list[i], ...row }; else list.push({ id: crypto.randomUUID(), ...row });
      save(); return;
    }
    const { error } = await SB.admin.from('bi_attendance_settings').upsert(row, { onConflict: 'company_id' });
    if (error) throw dbErr(error);
  }
  async function audit(ctx, action, resource, targetId, details) {
    const entry = { company_id: ctx.orgId, action, actor_email: ctx.email, employee_id: resource === 'Employee' && isUuid(targetId) ? targetId : null,
      details: { ...(details || {}), actor_id: ctx.sub, actor_name: ctx.name, actor_role: ctx.role, target_resource: resource, target_id: targetId || null } };
    try {
      if (remoteOn()) { const { error } = await SB.admin.from('bi_attendance_audit_logs').insert(entry); if (!error) return; }
    } catch (_e) { /* fall through */ }
    if (!Array.isArray(db.attendance_audit_logs)) db.attendance_audit_logs = [];
    db.attendance_audit_logs.unshift({ id: crypto.randomUUID(), ...entry, created_at: new Date().toISOString() });
    if (db.attendance_audit_logs.length > 500) db.attendance_audit_logs.length = 500;
    save();
  }
  async function auditList(cid) {
    if (remoteOn()) {
      const { data, error } = await SB.admin.from('bi_attendance_audit_logs').select('*').eq('company_id', cid).order('created_at', { ascending: false }).limit(100);
      if (!error) return data || [];
    }
    return (db.attendance_audit_logs || []).filter((a) => a.company_id === cid).slice(0, 100);
  }
  return { list, get, insert, update, remove, removeForEmployee, getSettings, saveSettings, audit, auditList, isLocal, localCols };
}

// ------------------------------------------------------------------ module
module.exports = function mountAttendanceV1({ app, SB, db, save }) {
  const store = makeStore({ SB, db, save });
  const router = express.Router();

  const ADMIN_PERMS = ['/admin', '/kiosk', '/enrollment', '/manual-entry', '/advance-money', '/leave-apply', '/payroll', '/settings'];
  const EMP_PERMS = ['/admin', '/kiosk', '/leave-apply', '/advance-money', '/payroll'];
  const NEW_EMP_PERMS = ['/admin', '/kiosk', '/attendance-reports', '/leave-apply', '/payment-entry', '/payroll', '/monthly-payslip', '/geofence'];

  // ---------------- identity: the BI sign-in
  async function loadCompany(id) {
    let r = await SB.admin.from('companies').select('id, company_name, code, status, industry, email, phone, address, city, state, created_at').eq('id', id).maybeSingle();
    if (r.error) r = await SB.admin.from('companies').select('id, company_name, code, status').eq('id', id).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    return r.data || null;
  }
  async function authenticate(req, { queryToken = false } = {}) {
    if (req._attCtx) return req._attCtx;
    if (!SB || !SB.enabled || !SB.admin) fail(503, 'The attendance service is not connected to the database right now. Please try again later.');
    const h = String(req.headers.authorization || '');
    let token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!token && queryToken && typeof req.query.token === 'string') token = req.query.token.trim();
    if (!token) fail(401, 'Authentication token missing.');
    const user = await SB.authUserFromToken(token);
    if (!user || !user.email) fail(401, 'Session has expired. Please log in again.');
    const email = lower(user.email);
    const { data: rows, error } = await SB.admin.from('company_users').select('id, email, full_name, role, status, company_id').eq('email', email).limit(5);
    if (error) throw new Error(error.message);
    const bi = (rows || []).find((r) => r.status === 'Active') || (rows || [])[0];
    if (!bi) fail(403, 'Your account is not registered with any organisation. Please ask your administrator to add you.');
    if (bi.status !== 'Active') fail(403, 'Account is deactivated. Please contact administrator.');
    const biRole = String(bi.role || 'USER').toUpperCase();
    const isSuper = biRole === 'SUPER_ADMIN';
    const isAdmin = isSuper || biRole === 'COMPANY_ADMIN';
    let companyId = bi.company_id;
    const want = req.headers['x-company-id'];
    if (isSuper && isUuid(want)) companyId = want;   // the Super Admin may work in another company
    if (!companyId) fail(403, 'Organization context required for this operation.');
    const company = await loadCompany(companyId);
    if (!company) fail(404, 'Organization not found');
    if (!isSuper && company.status && company.status !== 'Active') fail(403, 'Your organisation is not active. Please contact administrator.');
    const meta = user.user_metadata || {};
    req._attCtx = {
      sub: bi.id, authUserId: user.id, email, name: bi.full_name || meta.full_name || meta.name || email,
      biRole, isSuper, isAdmin, role: isAdmin ? 'org_admin' : 'employee', orgId: companyId, company, token,
    };
    return req._attCtx;
  }
  const requireAdmin = (ctx) => { if (!ctx.isAdmin) fail(403, 'Admin privileges required.'); return ctx; };

  async function getOrg(ctx, withLogo = false) {
    const s = (await store.getSettings(ctx.orgId, withLogo)) || {};
    const p = s.org_profile || {};
    const c = ctx.company;
    const name = p.name || c.company_name || 'Organisation';
    const org = {
      id: c.id, name, slug: c.code || c.id, gstin: p.gstin || null, contact_email: c.email || null,
      industry: p.industry || c.industry || null, phone: p.phone || c.phone || null, website: p.website || null,
      address: p.address || [c.address, c.city, c.state].filter(Boolean).join(', ') || null,
      work_hours: {
        start_time: s.work_start_time || '09:00', end_time: s.work_end_time || '18:00',
        late_grace_minutes: s.late_grace_minutes == null ? 15 : num(s.late_grace_minutes, 15),
        half_day_hours: s.half_day_hours == null ? 4.5 : num(s.half_day_hours, 4.5),
      },
      geofence: {
        is_enabled: !!s.geofence_enabled,
        latitude: s.geofence_latitude == null ? 13.0827 : num(s.geofence_latitude, 13.0827),
        longitude: s.geofence_longitude == null ? 80.2707 : num(s.geofence_longitude, 80.2707),
        radius_meters: s.geofence_radius_meters == null ? 150 : num(s.geofence_radius_meters, 150),
        strict_enforcement: !!p.strict_enforcement,
        office_name: p.office_name || 'Headquarters',
      },
      is_active: (c.status || 'Active') === 'Active',
      created_at: c.created_at || null,
      similarity_threshold: num(s.similarity_threshold, 0) || 0.78,
    };
    if (withLogo) org.logo_url = s.logo_url || p.logo_url || null;
    return org;
  }
  const empName = (e) => `${(e && e.first_name) || ''} ${(e && e.last_name) || ''}`.trim();
  const initials = (e, fb = 'EM') => (((e.first_name || '').slice(0, 1)) + ((e.last_name || '').slice(0, 1))).toUpperCase() || fb;
  const masked = (e, withCount = true) => { const c = { ...e }; const n = (c.face_embeddings || []).length; c.has_biometric = n > 0; if (withCount) c.samples_count = n; c.face_embeddings = null; return c; };
  async function myEmployee(ctx, emps) {
    const all = emps || await store.list('employees', ctx.orgId);
    return all.find((e) => e.user_id && e.user_id === ctx.sub)
      || all.find((e) => lower(e.email) === ctx.email && e.is_active !== false)
      || all.find((e) => lower(e.email) === ctx.email) || null;
  }
  function userOut(ctx, org, emp) {
    const u = {
      id: ctx.sub, organization_id: ctx.orgId, name: ctx.name, email: ctx.email, role: ctx.role,
      employee_id: emp ? emp.id : null, is_active: true, permissions: null,
    };
    if (emp) {
      u.name = empName(emp) || u.name;
      u.employee_code = emp.employee_code; u.department = emp.department;
      if (Array.isArray(emp.permissions) && emp.permissions.length) u.permissions = emp.permissions;
    }
    if (!u.permissions) u.permissions = ctx.isAdmin ? ADMIN_PERMS : EMP_PERMS;
    return u;
  }

  // ---------------- route wrapper
  const wrap = (fn) => async (req, res) => {
    try {
      const out = await fn(req, res);
      if (out !== undefined && !res.headersSent) res.json(out);
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ detail: e.detail });
      console.error('[Attendance v1]', req.method, req.originalUrl.split('?')[0], e);
      if (!res.headersSent) res.status(500).json({ detail: 'An internal server error occurred. Please contact administrator or check server logs.' });
    }
  };
  const need = (b, fields) => {
    const miss = fields.filter((f) => b[f] === undefined || b[f] === null || (typeof b[f] === 'string' && f !== 'reason' && b[f] === ''));
    if (miss.length) fail(422, miss.map((f) => `${f}: Field required`).join('; '));
  };
  const optNum = (b, f) => {
    if (b[f] === undefined || b[f] === null || b[f] === '') return null;
    const n = Number(b[f]);
    if (!Number.isFinite(n)) fail(422, `${f}: Input should be a valid number`);
    return n;
  };
  const optStr = (b, f) => (b[f] === undefined || b[f] === null ? null : String(b[f]));

  // =================================================================== HEALTH / AUTH
  router.get('/health', wrap(async () => ({ status: 'healthy' })));
  router.get('/auth/health', wrap(async () => ({ status: 'healthy' })));

  router.get('/auth/me', wrap(async (req) => {
    const ctx = await authenticate(req);
    const org = await getOrg(ctx, true);
    const emp = await myEmployee(ctx);
    return { user: userOut(ctx, org, emp), organization: org };
  }));

  router.post('/auth/face-login', wrap(async (req) => {
    const ctx = await authenticate(req);
    const b = req.body || {};
    if (b.face_embedding === undefined && !b.image_sample) fail(400, 'No camera image provided. Please allow camera access and position your face inside the reticle.');
    const live = liveVectorFrom(b);
    const org = await getOrg(ctx, true);
    const emps = (await store.list('employees', ctx.orgId)).filter((e) => e.is_active !== false && (e.face_embeddings || []).length > 0);
    if (!emps.length) fail(404, 'No registered biometric facial profiles found in the system. Please enroll your face first.');
    const { emp } = findBestMatch(live, emps, org.similarity_threshold);
    const mine = await myEmployee(ctx);
    if (!emp || (!ctx.isAdmin && (!mine || mine.id !== emp.id))) fail(401, 'Face not recognized. Please ensure you are enrolled by your organisation administrator.');
    const { confidence } = findBestMatch(live, [emp], 0);
    await store.audit(ctx, 'FACE_BIOMETRIC_LOGIN', 'Authentication', ctx.sub, { confidence, employee_code: emp.employee_code });
    const same = lower(emp.email) === ctx.email;
    const user = userOut(same ? ctx : { ...ctx, role: 'employee', isAdmin: false, name: empName(emp), email: lower(emp.email) }, org, emp);
    if (!same) user.id = emp.user_id || emp.id;
    return { access_token: ctx.token, token_type: 'bearer', user, organization: org };
  }));

  // =================================================================== EMPLOYEES
  router.get('/employees/me', wrap(async (req) => {
    const ctx = await authenticate(req);
    const emps = await store.list('employees', ctx.orgId);
    const emp = emps.find((e) => e.user_id && e.user_id === ctx.sub && e.is_active !== false) || emps.find((e) => lower(e.email) === ctx.email && e.is_active !== false);
    if (!emp) fail(404, 'Employee profile not found.');
    return masked(emp);
  }));

  router.get('/employees', wrap(async (req) => {
    const ctx = await authenticate(req);
    const all = await store.list('employees', ctx.orgId);
    if (!ctx.isAdmin) {
      const emp = all.find((e) => e.user_id && e.user_id === ctx.sub && e.is_active !== false) || all.find((e) => lower(e.email) === ctx.email && e.is_active !== false);
      return emp ? [masked(emp)] : [];
    }
    let list = all.filter((e) => e.is_active !== false);
    if (req.query.department) list = list.filter((e) => e.department === req.query.department);
    sortBy(list, 'first_name');
    if (req.query.search) {
      const s = lower(req.query.search);
      list = list.filter((e) => lower(e.first_name).includes(s) || lower(e.last_name).includes(s) || lower(e.employee_code).includes(s) || lower(e.department).includes(s));
    }
    return list.map((e) => masked(e));
  }));

  function embeddingsFrom(b, { required }) {
    let list = b.face_embeddings;
    if ((list === undefined || list === null) && Array.isArray(b.samples) && b.samples.length && Array.isArray(b.samples[0])) list = b.samples;
    if (list === undefined || list === null) {
      if (Array.isArray(b.samples) && b.samples.some((s) => typeof s === 'string')) fail(400, IMAGE_ONLY);
      if (required) fail(400, 'Please provide at least 1-3 camera sample frames.');
      return null;
    }
    if (!Array.isArray(list)) fail(422, 'face_embeddings: Input should be a valid list');
    if (list.length && isVector(list)) list = [list];   // a single vector was sent
    if (list.length < 1) fail(400, 'Please provide at least 1-3 camera sample frames.');
    const good = list.filter(isVector);
    const dim = good.length ? good[0].length : 0;
    const valid = good.filter((v) => v.length === dim).slice(0, 20);
    if (!valid.length) fail(400, 'No clear faces detected in the provided samples. Ensure good lighting and look directly into the camera.');
    return valid;
  }
  const enrollFields = (embs, ip) => ({
    consent_given: true, consent_timestamp: new Date().toISOString(), consent_ip: ip || '127.0.0.1',
    face_embeddings: [...embs, consensusVector(embs)], enrolled_samples_count: embs.length,
  });
  async function linkUserId(cid, email) {
    if (!email) return null;
    try {
      const { data } = await SB.admin.from('company_users').select('id').eq('email', email).eq('company_id', cid).limit(1);
      return data && data[0] ? data[0].id : null;
    } catch (_e) { return null; }
  }

  router.post('/employees', wrap(async (req, res) => {
    const ctx = requireAdmin(await authenticate(req));
    const b = req.body || {};
    need(b, ['first_name']);
    const cid = ctx.orgId;
    const all = await store.list('employees', cid);
    let code = String(b.employee_code || '').trim();
    if (!code) code = `ARG-${all.length + 101}`;
    let first = String(b.first_name || '').trim();
    let last = String(b.last_name || '').trim();
    if (first.includes(' ') && !last) { const i = first.indexOf(' '); last = first.slice(i + 1).trim(); first = first.slice(0, i).trim(); }
    const purge = async (e) => {
      for (const col of ['attendance', 'attendance_events', 'leaves', 'advances', 'manual_overrides', 'salary_payouts', 'financial_entries']) await store.removeForEmployee(col, cid, e.id);
      await store.remove('employees', cid, e.id);
    };
    const existing = all.find((e) => e.employee_code === code);
    if (existing) {
      if (existing.is_active === false) await purge(existing);
      else fail(400, `Employee code '${code}' already exists in your organization.`);
    }
    const email = b.email && String(b.email).trim() ? String(b.email).trim().toLowerCase() : null;
    if (email) {
      const ex = all.find((e) => lower(e.email) === email && e.id !== (existing && existing.id));
      if (ex) {
        if (ex.is_active === false) await purge(ex);
        else fail(400, `An employee with email '${email}' already exists in your organization.`);
      }
    }
    const embs = embeddingsFrom(b, { required: false });
    if (embs && b.consent_given === false) fail(400, 'Biometric consent is mandatory before capturing facial recognition embeddings.');
    const n = (f, d) => { const v = optNum(b, f); return v === null ? d : v; };
    const daily = n('daily_wage_rate', 600.0);
    const doc = {
      employee_code: code, first_name: first, last_name: last, email,
      department: b.department || 'Operations', designation: String(b.designation || '').trim() || b.department || 'Production',
      phone: optStr(b, 'phone'), hourly_rate: n('hourly_rate', 250.0), daily_wage_rate: daily,
      half_day_salary: n('half_day_salary', round(daily / 2, 2)),
      aadhar_number: optStr(b, 'aadhar_number'), emergency_contact: optStr(b, 'emergency_contact'), joining_date: optStr(b, 'joining_date'),
      account_holder_name: optStr(b, 'account_holder_name'), upi_number: optStr(b, 'upi_number'), bank_name: optStr(b, 'bank_name'),
      account_number: optStr(b, 'account_number'), ifsc_code: optStr(b, 'ifsc_code'),
      shift_hours: b.shift_hours || '08:00', employment_type: b.employment_type || 'FULL_TIME', shift_type: b.shift_type || 'FIXED',
      target_daily_hours: n('target_daily_hours', b.employment_type === 'PART_TIME' ? 4.0 : 8.5),
      assigned_shift: b.assigned_shift || 'General Shift (09:00 AM – 05:30 PM • 8.5h)',
      shift_start: b.shift_start || '09:00', shift_end: b.shift_end || '17:30',
      base_salary: n('base_salary', 40000.0), statutory_deductions: n('statutory_deductions', 3000.0),
      permissions: Array.isArray(b.permissions) ? b.permissions : NEW_EMP_PERMS,
      consent_given: false, consent_timestamp: null, consent_ip: null, face_embeddings: [], is_active: true,
      created_at: new Date().toISOString(), user_id: await linkUserId(cid, email),
    };
    if (embs) Object.assign(doc, enrollFields(embs, b.client_ip));
    let saved;
    try { saved = await store.insert('employees', cid, doc); }
    catch (e) { if (e.code === '23505') fail(400, `Employee code '${code}' already exists in your organization.`); throw e; }
    await store.audit(ctx, 'CREATE_EMPLOYEE', 'Employee', saved.id, { name: `${b.first_name} ${b.last_name || ''}`.trim(), code: b.employee_code || code });
    if (embs) await store.audit(ctx, 'ENROLL_BIOMETRIC', 'Employee', saved.id, { valid_samples_captured: embs.length, consent_recorded: true, vectors_stored: embs.length + 1 });
    const out = masked(saved);
    if (!embs) out.face_embeddings = [];
    res.status(201).json(out);
  }));

  router.post('/employees/:id/enroll-face', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const b = req.body || {};
    const emp = await store.get('employees', ctx.orgId, req.params.id);
    if (!emp) fail(404, 'Employee not found in your organization.');
    if (!b.consent_given) fail(400, 'Biometric consent is mandatory before capturing facial recognition embeddings.');
    const embs = embeddingsFrom(b, { required: true });
    await store.update('employees', ctx.orgId, emp.id, enrollFields(embs, b.client_ip));
    await store.audit(ctx, 'ENROLL_BIOMETRIC', 'Employee', emp.id, { valid_samples_captured: embs.length, consent_recorded: true, vectors_stored: embs.length + 1 });
    return { status: 'success', message: `Successfully enrolled face with ${embs.length} high-quality samples. Vectors stored safely.`, valid_samples: embs.length };
  }));

  router.delete('/employees/:id', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const cid = ctx.orgId;
    const emp = await store.get('employees', cid, req.params.id);
    if (!emp) fail(404, 'Employee not found');
    for (const col of ['attendance', 'attendance_events', 'advances', 'manual_overrides', 'leaves', 'salary_payouts', 'financial_entries']) await store.removeForEmployee(col, cid, emp.id);
    if (emp.employee_code) {
      for (const ev of await store.list('attendance_events', cid)) if (ev.employee_code === emp.employee_code) await store.remove('attendance_events', cid, ev.id);
    }
    await store.remove('employees', cid, emp.id);
    await store.audit(ctx, 'DELETE_EMPLOYEE', 'Employee', emp.id, { email: emp.email, code: emp.employee_code, name: `${emp.first_name} ${emp.last_name}` });
    return { status: 'success', message: 'Employee and all associated records permanently removed from database.' };
  }));

  router.put('/employees/:id', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const cid = ctx.orgId;
    const b = req.body || {};
    const emp = await store.get('employees', cid, req.params.id);
    if (!emp) fail(404, 'Employee not found');
    const up = {};
    if (b.employee_code && b.employee_code !== emp.employee_code) {
      const all = await store.list('employees', cid);
      if (all.some((e) => e.employee_code === b.employee_code && e.id !== emp.id)) fail(400, `Employee code '${b.employee_code}' already belongs to another employee.`);
      up.employee_code = String(b.employee_code);
    }
    for (const f of ['first_name', 'last_name', 'department', 'designation', 'phone', 'employment_type', 'shift_type', 'aadhar_number', 'emergency_contact', 'joining_date', 'account_holder_name', 'upi_number', 'bank_name', 'account_number', 'ifsc_code', 'shift_hours', 'assigned_shift', 'shift_start', 'shift_end']) {
      if (b[f] !== undefined && b[f] !== null) up[f] = String(b[f]).trim();
    }
    if (b.email !== undefined && b.email !== null) { const e = String(b.email).trim().toLowerCase(); up.email = e || null; }
    for (const f of ['target_daily_hours', 'daily_wage_rate', 'half_day_salary', 'base_salary', 'hourly_rate', 'statutory_deductions']) { const v = optNum(b, f); if (v !== null) up[f] = v; }
    if (Array.isArray(b.permissions)) up.permissions = b.permissions;
    const embs = embeddingsFrom(b, { required: false });
    if (embs) Object.assign(up, enrollFields(embs, b.client_ip));
    if (!Object.keys(up).length) return masked(emp, false);
    up.updated_at = new Date().toISOString();
    if (up.email !== undefined && up.email !== emp.email) up.user_id = await linkUserId(cid, up.email);
    const saved = await store.update('employees', cid, emp.id, up);
    // keep the names stored on other records in step
    const fullName = empName(saved);
    const nameChanged = 'first_name' in up || 'last_name' in up;
    const cascade = async (col, map, extraMatch) => {
      const patch = {};
      if (nameChanged && map.name) patch[map.name] = fullName;
      if ('employee_code' in up && map.code) patch[map.code] = saved.employee_code;
      if ('department' in up && map.dept) patch[map.dept] = saved.department;
      if (nameChanged && map.avatar) patch.avatar = initials(saved);
      if (!Object.keys(patch).length) return;
      const rows = (await store.list(col, cid)).filter((r) => String(r.employee_id) === String(emp.id) || (extraMatch && extraMatch(r)));
      for (const r of rows) await store.update(col, cid, r.id, patch);
    };
    await cascade('attendance_events', { name: 'employee_name', code: 'employee_code', dept: 'department', avatar: true }, (r) => emp.employee_code && r.employee_code === emp.employee_code);
    await cascade('manual_overrides', { name: 'employee_name', code: 'employee_code', dept: 'department' });
    await cascade('advances', { name: 'name', code: 'emp_code', dept: 'dept' });
    await cascade('leaves', { name: 'name', code: 'emp_code' });
    const auditUp = { ...up }; if (auditUp.face_embeddings) auditUp.face_embeddings = `${embs.length} samples`;
    await store.audit(ctx, 'UPDATE_EMPLOYEE', 'Employee', emp.id, auditUp);
    return masked(saved, false);
  }));

  // =================================================================== ATTENDANCE CAPTURE
  router.post('/attendance/kiosk-punch', wrap(async (req) => {
    const ctx = await authenticate(req);
    const b = req.body || {};
    const org = await getOrg(ctx);
    const target = String(b.organization_slug_or_id || '').trim();
    if (target && !['AUTO', 'ALL'].includes(target.toUpperCase()) && target !== org.id && target !== org.slug) fail(404, `Organization '${target}' not found.`);
    const live = liveVectorFrom(b);
    const lat = numOrNull(b.latitude), lon = numOrNull(b.longitude), acc = numOrNull(b.accuracy);
    const emps = (await store.list('employees', ctx.orgId)).filter((e) => e.is_active !== false);
    if (!emps.length) fail(404, `No registered employees found in ${org.name || 'this organization'}.`);
    const { emp, confidence } = findBestMatch(live, emps, org.similarity_threshold);
    if (!emp) fail(404, `Face not recognized in ${org.name}. Please ensure you are enrolled.`);
    const cid = ctx.orgId;
    const now = new Date();
    const p = ist(now);
    const today = istDate(now), time = istTime12(now), nowIso = now.toISOString();
    const existing = (await store.list('attendance', cid, { employee_id: emp.id, date: today }))[0] || null;
    const reqType = String(b.punch_type || 'AUTO').toUpperCase();
    const punchAction = ['CHECK_IN', 'CHECK_OUT'].includes(reqType) ? reqType : (!existing ? 'CHECK_IN' : (existing.is_currently_in ? 'CHECK_OUT' : 'CHECK_IN'));
    const empType = String(emp.employment_type || 'FULL_TIME').toUpperCase();
    const shiftType = String(emp.shift_type || 'FIXED').toUpperCase();
    const assigned = lower(emp.assigned_shift);
    const flexible = shiftType === 'FLEXIBLE' || empType === 'DAILY_WAGE' || assigned.includes('flexible') || assigned.includes('coolie');
    let recStatus, shiftStatus;
    if (flexible) { recStatus = 'PRESENT'; shiftStatus = 'FLEXIBLE'; }
    else if (!existing) {
      const ws = String(emp.shift_start || org.work_hours.start_time || '09:00').split(':');
      const startMins = (parseInt(ws[0], 10) || 0) * 60 + (parseInt(ws[1], 10) || 0) + num(org.work_hours.late_grace_minutes, 15);
      if (p.H * 60 + p.M > startMins) { recStatus = 'LATE'; shiftStatus = 'LATE'; } else { recStatus = 'PRESENT'; shiftStatus = 'ON-TIME'; }
    } else { recStatus = existing.status || 'PRESENT'; shiftStatus = existing.shift_status || 'ON-TIME'; }

    const gf = org.geofence;
    let geoStatus = 'DISABLED', dist = null;
    if (gf && gf.is_enabled) {
      const radius = gf.radius_meters == null ? 150 : gf.radius_meters;
      if (lat !== null && lon !== null && gf.latitude != null && gf.longitude != null) {
        dist = haversine(lat, lon, gf.latitude, gf.longitude);
        if (dist <= radius) geoStatus = 'INSIDE';
        else {
          geoStatus = 'OUTSIDE';
          if (gf.strict_enforcement) fail(403, `Geofence Enforcement: Punch rejected. You are ${Math.trunc(dist)}m away from the designated perimeter (allowed radius: ${radius}m).`);
        }
      } else {
        geoStatus = 'NO_GPS';
        if (gf.strict_enforcement) fail(403, 'Geofence Enforcement: Location access is required to verify on-site attendance. Please enable device GPS.');
      }
    }
    const punches = existing ? [...(existing.punches || [])] : [];
    const n = punches.length + 1;
    punches.push({ punch_number: n, action: punchAction, time, timestamp: nowIso, latitude: lat, longitude: lon, accuracy: acc, geofence_status: geoStatus, distance_meters: dist });
    const totalHours = punchesTotalHours(punches);
    const isIn = punchAction === 'CHECK_IN';
    if (empType === 'PART_TIME') {
      const tgt = num(emp.target_daily_hours, 0) || 4.0;
      if (totalHours >= tgt && recStatus !== 'LATE') shiftStatus = 'ON-TIME';
    }
    let rec;
    if (!existing) {
      rec = await store.insert('attendance', cid, {
        employee_id: emp.id, employee_code: emp.employee_code, employee_name: `${emp.first_name} ${emp.last_name}`, department: emp.department || 'General',
        employment_type: empType, shift_type: shiftType, date: today, check_in: nowIso, check_in_time: time,
        check_out: punchAction === 'CHECK_OUT' ? nowIso : null, check_out_time: punchAction === 'CHECK_OUT' ? time : null,
        total_hours: totalHours, is_currently_in: isIn, punch_count: n, punches, last_punch_time: time, last_punch_action: punchAction,
        break_status: isIn ? 'WORKING' : 'NOT_STARTED', status: recStatus, shift_status: shiftStatus, verification_mode: 'FACE_KIOSK',
        confidence_score: confidence, liveness_verified: true, kiosk_id: b.kiosk_id === undefined ? 'default-kiosk' : b.kiosk_id,
        latitude: lat, longitude: lon, accuracy: acc, geofence_status: geoStatus, distance_meters: dist, created_at: nowIso,
      });
    } else {
      const upd = { is_currently_in: isIn, punch_count: n, punches, last_punch_time: time, last_punch_action: punchAction, total_hours: totalHours, confidence_score: Math.max(confidence, num(existing.confidence_score, 0)) };
      if (punchAction === 'CHECK_OUT') { upd.check_out = nowIso; upd.check_out_time = time; }
      if (lat !== null) { upd.latitude = lat; upd.longitude = lon; upd.geofence_status = geoStatus; upd.distance_meters = dist; }
      const r = reconcileStatus({ ...existing, ...upd }, org.work_hours, emp, now.getTime());
      upd.status = r.status; upd.shift_status = r.shift_status; upd.break_status = r.break_status;
      rec = await store.update('attendance', cid, existing.id, upd);
    }
    const officeName = (gf && gf.office_name) || org.name || 'Office';
    let entry;
    if (dist !== null) entry = (geoStatus === 'INSIDE' || dist <= (gf ? gf.radius_meters : 150)) ? `${Math.trunc(dist)}m (Within ${officeName})` : `${Math.trunc(dist)}m (Off-Site)`;
    else entry = `0m (${officeName} Kiosk)`;
    await store.insert('attendance_events', cid, {
      id: `EVT-${utcStamp(now)}${pad(now.getUTCMilliseconds(), 3)}${hex(4)}`, employee_id: emp.id, employee_name: empName(emp), employee_code: emp.employee_code,
      employment_type: empType, shift_type: shiftType, department: emp.department || 'Operations', time, date: today, timestamp: nowIso,
      operation: `PUNCH #${n} [${punchAction.replace('CHECK_', '')}]`, action: punchAction, punch_number: n, is_in: isIn, avatar: initials(emp),
      latitude: lat, longitude: lon, geofence_status: geoStatus, distance_meters: dist, entry_distance: entry, created_at: nowIso,
    });
    return {
      status: 'success', action: punchAction, punch_number: n, punch_count: n, is_currently_in: isIn,
      employee_name: `${emp.first_name} ${emp.last_name}`, employee_code: emp.employee_code, employment_type: empType, shift_type: shiftType,
      department: emp.department || 'General', organization_id: org.id, organization_name: org.name || 'Argus Enterprise',
      timestamp: time, date: today, attendance_status: rec.status || 'PRESENT', shift_status: rec.shift_status || shiftStatus,
      confidence: round(confidence * 100, 1), total_hours: rec.total_hours == null ? 0 : rec.total_hours,
      geofence_status: geoStatus, distance_meters: dist, entry_distance: entry,
    };
  }));

  router.post('/attendance/field-punch', wrap(async (req) => {
    const ctx = await authenticate(req);
    const b = req.body || {};
    need(b, ['client_site_id', 'latitude', 'longitude']);
    const lat = optNum(b, 'latitude'), lon = optNum(b, 'longitude'), acc = optNum(b, 'accuracy');
    const cid = ctx.orgId;
    const emp = await myEmployee(ctx);
    if (!emp) fail(404, 'Employee profile not found.');
    const site = await store.get('client_sites', cid, String(b.client_site_id));
    if (!site || site.is_active === false) fail(404, 'Client project site not found or deactivated.');
    if (b.face_embedding === undefined && b.image_sample) fail(400, IMAGE_ONLY);
    if (!isVector(b.face_embedding)) fail(400, 'No face detected in capture.');
    const org = await getOrg(ctx);
    const { emp: matched, confidence } = findBestMatch(b.face_embedding, [emp], org.similarity_threshold);
    if (!matched) fail(401, 'Facial biometric mismatch. You can only punch your own site visit.');
    const distance = haversine(lat, lon, num(site.latitude), num(site.longitude));
    const radius = site.radius_meters == null ? 150 : num(site.radius_meters, 150);
    const onSite = distance <= radius;
    const geoStatus = onSite ? 'VERIFIED_ON_SITE' : 'SITE_PERIMETER_VIOLATION';
    const now = new Date();
    const today = istDate(now), time = istTime12(now), nowIso = now.toISOString();
    const notes = b.notes === undefined ? null : b.notes;
    const existing = (await store.list('attendance', cid, { employee_id: emp.id, date: today }))[0] || null;
    const punchAction = !existing ? 'CHECK_IN' : (existing.is_currently_in ? 'CHECK_OUT' : 'CHECK_IN');
    const punches = existing ? [...(existing.punches || [])] : [];
    const n = punches.length + 1;
    punches.push({ punch_number: n, action: punchAction, time, timestamp: nowIso, latitude: lat, longitude: lon, accuracy: acc, geofence_status: geoStatus, distance_meters: distance, client_site_id: site.id, client_site_name: site.site_name, site_visit_verified: onSite, notes });
    const totalHours = punchesTotalHours(punches);
    const isIn = punchAction === 'CHECK_IN';
    let rec;
    if (!existing) {
      rec = await store.insert('attendance', cid, {
        employee_id: emp.id, employee_code: emp.employee_code, employee_name: `${emp.first_name} ${emp.last_name}`, department: emp.department || 'Field Operations',
        employment_type: emp.employment_type || 'FIELD_WORKER', shift_type: emp.shift_type || 'FLEXIBLE', date: today, check_in: nowIso, check_in_time: time,
        check_out: punchAction === 'CHECK_OUT' ? nowIso : null, check_out_time: punchAction === 'CHECK_OUT' ? time : null,
        total_hours: totalHours, is_currently_in: isIn, punch_count: n, punches, last_punch_time: time, last_punch_action: punchAction,
        status: 'PRESENT', shift_status: onSite ? 'ON-SITE' : 'OUTSIDE-SITE', verification_mode: 'FIELD_CLIENT_SITE', confidence_score: confidence,
        liveness_verified: true, client_site_id: site.id, client_site_name: site.site_name, site_visit_verified: onSite,
        break_status: isIn ? 'WORKING' : 'NOT_STARTED', latitude: lat, longitude: lon, accuracy: acc, geofence_status: geoStatus, distance_meters: distance, notes, created_at: nowIso,
      });
    } else {
      const upd = { is_currently_in: isIn, punch_count: n, punches, last_punch_time: time, last_punch_action: punchAction, total_hours: totalHours,
        client_site_id: site.id, client_site_name: site.site_name, site_visit_verified: onSite, latitude: lat, longitude: lon, geofence_status: geoStatus, distance_meters: distance, notes: notes || existing.notes || null };
      if (punchAction === 'CHECK_OUT') { upd.check_out = nowIso; upd.check_out_time = time; }
      const r = reconcileStatus({ ...existing, ...upd }, org.work_hours, emp, now.getTime());
      upd.status = r.status; upd.shift_status = r.shift_status; upd.break_status = r.break_status;
      rec = await store.update('attendance', cid, existing.id, upd);
    }
    await store.insert('attendance_events', cid, {
      id: `EVT-${utcStamp(now)}${pad(now.getUTCMilliseconds(), 3)}${hex(4)}`, employee_id: emp.id, employee_name: empName(emp), employee_code: emp.employee_code,
      employment_type: emp.employment_type || 'FIELD_WORKER', department: emp.department || 'Field Operations', time, date: today, timestamp: nowIso,
      operation: `FIELD PUNCH #${n} [${punchAction.replace('CHECK_', '')}]: ${site.site_name}`, action: punchAction, punch_number: n, is_in: isIn, avatar: initials(emp, 'FW'),
      latitude: lat, longitude: lon, client_site_id: site.id, client_site_name: site.site_name, site_visit_verified: onSite, geofence_status: geoStatus, distance_meters: distance, created_at: nowIso,
    });
    return {
      status: 'success', action: punchAction, punch_number: n, punch_count: n, is_currently_in: isIn, site_name: site.site_name, client_name: site.client_name,
      site_visit_verified: onSite, geofence_status: geoStatus, distance_meters: distance, allowed_radius: radius,
      honesty_status: onSite ? 'HONEST ON-SITE VISIT' : `VIOLATION: ${Math.trunc(distance)}m AWAY FROM SITE`,
      employee_name: empName(emp), timestamp: time, date: today, total_hours: rec.total_hours == null ? 0 : rec.total_hours,
    };
  }));

  router.get('/attendance/kiosk-stream', wrap(async (req) => {
    const ctx = await authenticate(req);
    const org = await getOrg(ctx);
    const target = String(req.query.organization_slug_or_id || req.query.organization_id || '').trim();
    if (target && !['AUTO', 'ALL'].includes(target.toUpperCase()) && target !== org.id && target !== org.slug) return [];
    const cid = ctx.orgId;
    const today = istDate();
    const active = (await store.list('employees', cid)).filter((e) => e.is_active !== false);
    const byId = new Map(active.map((e) => [e.id, e]));
    const byCode = new Map(active.filter((e) => e.employee_code).map((e) => [e.employee_code, e]));
    let events = sortBy((await store.list('attendance_events', cid)).filter((e) => e.date === today), 'timestamp', true).slice(0, 20);
    events = events.filter((e) => byId.has(e.employee_id) || byCode.has(e.employee_code));
    const gf = org.geofence;
    const radius = gf.radius_meters == null ? 200 : gf.radius_meters;
    const officeName = gf.office_name || org.name || 'Headquarters';
    for (const ev of events) {
      const emp = byId.get(ev.employee_id) || byCode.get(ev.employee_code);
      if (emp) { ev.employee_name = empName(emp); ev.employee_code = emp.employee_code || ev.employee_code; ev.department = emp.department || ev.department; ev.avatar = initials(emp); }
      if (!ev.entry_distance) {
        let dist = ev.distance_meters;
        if (dist == null && ev.latitude != null && ev.longitude != null) { dist = haversine(Number(ev.latitude), Number(ev.longitude), gf.latitude, gf.longitude); ev.distance_meters = dist; }
        if (dist != null) ev.entry_distance = dist <= radius ? `${Math.trunc(dist)}m (Within ${officeName})` : `${Math.trunc(dist)}m (Off-Site)`;
        else { ev.entry_distance = `0m (${officeName} Kiosk)`; ev.distance_meters = 0.0; }
      }
    }
    if (!events.length) {
      const recs = sortBy(await store.list('attendance', cid, { date: today }), 'check_in', true).slice(0, 20).filter((r) => byId.has(r.employee_id));
      const out = [];
      for (const r of recs) {
        const emp = byId.get(r.employee_id) || byCode.get(r.employee_code);
        let name, code, dept, av;
        if (emp) { name = empName(emp); code = emp.employee_code || r.employee_code; dept = emp.department || r.department; av = initials(emp); }
        else { name = r.employee_name || 'Employee'; code = r.employee_code || 'EMP'; dept = r.department || 'Operations'; const np = name.split(/\s+/); av = ((np[0] || '').slice(0, 1) + (np[1] || '').slice(0, 1)).toUpperCase() || 'EM'; }
        let rd = r.distance_meters, re = r.entry_distance;
        if (!re) { if (rd != null) re = rd <= radius ? `${Math.trunc(rd)}m (Within ${officeName})` : `${Math.trunc(rd)}m (Off-Site)`; else { re = `0m (${officeName} Kiosk)`; rd = 0.0; } }
        if (r.check_out_time) out.push({ id: `${r.id}-out`, employee_name: name, employee_code: code, department: dept, time: r.check_out_time, date: r.date, timestamp: r.check_out || r.date, operation: 'SHIFT END [OUT]', is_in: false, avatar: av, entry_distance: re, distance_meters: rd });
        if (r.check_in_time) out.push({ id: `${r.id}-in`, employee_name: name, employee_code: code, department: dept, time: r.check_in_time, date: r.date, timestamp: r.check_in || r.date, operation: 'SHIFT START [IN]', is_in: true, avatar: av, entry_distance: re, distance_meters: rd });
      }
      return sortBy(out, 'timestamp', true).slice(0, 10);
    }
    return events.slice(0, 10);
  }));

  router.get('/attendance/today', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const cid = ctx.orgId;
    const org = await getOrg(ctx);
    const istToday = istDate(), utcToday = new Date().toISOString().slice(0, 10);
    const date = req.query.date || null, clientDate = req.query.client_date || null;
    const dates = [...new Set([date, clientDate, istToday, utcToday].filter(Boolean))];
    const primary = date || clientDate || istToday;
    const emps = await store.list('employees', cid);
    const byId = new Map(emps.map((e) => [e.id, e]));
    const byCode = new Map(emps.filter((e) => e.employee_code).map((e) => [e.employee_code, e]));
    const total = emps.filter((e) => e.is_active !== false).length;
    const raw = sortBy(await store.list('attendance', cid, { date_in: dates }), 'check_in', true);
    const gf = org.geofence;
    const opts = { baseLat: gf.latitude, baseLon: gf.longitude, radius: gf.radius_meters == null ? 200 : gf.radius_meters, officeName: gf.office_name || org.name || 'Headquarters', overwrite: true };
    const records = raw.map((r) => {
      const emp = byId.get(r.employee_id) || byCode.get(r.employee_code) || null;
      if (emp) { const fn = empName(emp); if (fn) r.employee_name = fn; r.employee_code = emp.employee_code || r.employee_code; r.department = emp.department || r.department; }
      const rc = reconcileStatus(r, org.work_hours, emp);
      r.status = rc.status; r.shift_status = rc.shift_status; r.break_status = rc.break_status;
      entryDistance(r, opts);
      return r;
    });
    const present = records.filter((r) => ['PRESENT', 'LATE'].includes(r.status)).length;
    const half = records.filter((r) => r.status === 'HALF_DAY').length;
    const late = records.filter((r) => r.status === 'LATE' || String(r.shift_status || '').includes('LATE')).length;
    return {
      date: primary,
      summary: { total_employees: total, present, half_day: half, late, absent: Math.max(0, total - (present + half)), on_time_rate: present > 0 ? round(((present - late) / Math.max(1, present)) * 100, 1) : 0 },
      records,
    };
  }));

  router.get('/attendance/map-punches', wrap(async (req) => {
    const ctx = await authenticate(req);
    const cid = ctx.orgId;
    const org = await getOrg(ctx);
    const today = istDate();
    const gf = org.geofence;
    const emps = (await store.list('employees', cid)).filter((e) => e.is_active !== false);
    const byId = new Map(emps.map((e) => [e.id, e]));
    let recs = sortBy(await store.list('attendance', cid, { date: today }), 'check_in', true);
    const mine = ctx.isAdmin ? null : await myEmployee(ctx, emps);
    if (!ctx.isAdmin) recs = mine ? recs.filter((r) => r.employee_id === mine.id) : [];
    const events = sortBy((await store.list('attendance_events', cid)).filter((e) => e.date === today), 'timestamp', true);
    const sites = sortBy((await store.list('client_sites', cid)).filter((s) => s.is_active !== false), 'created_at', true);
    const items = recs.map((r, idx) => {
      const emp = byId.get(r.employee_id) || {};
      let lat = r.latitude, lon = r.longitude;
      if (lat == null || lon == null) { const ev = events.find((e) => e.employee_code === r.employee_code); if (ev && ev.latitude != null) { lat = ev.latitude; lon = ev.longitude; } }
      const name = empName(emp) || r.employee_name || 'Employee';
      const av = initials(emp, '') || name.slice(0, 2).toUpperCase();
      let st = r.geofence_status, dist = r.distance_meters;
      if (lat == null || lon == null) {
        const angle = (idx * 45) * (Math.PI / 180), off = 0.0003 * ((idx % 3) + 1);
        lat = gf.latitude + off * Math.cos(angle); lon = gf.longitude + off * Math.sin(angle); st = 'INSIDE'; dist = round(off * 111000, 1);
      }
      if (!st || st === 'DISABLED') st = r.status === 'PRESENT' ? 'INSIDE' : 'OUTSIDE';
      return {
        id: r.id, employee_id: r.employee_id, employee_name: name, employee_code: r.employee_code || emp.employee_code || '—',
        department: emp.department || r.department || 'Operations', designation: emp.designation || 'Staff', employment_type: emp.employment_type || 'FULL_TIME',
        client_site_id: r.client_site_id || null, client_site_name: r.client_site_name || null, site_visit_verified: r.site_visit_verified === undefined ? null : r.site_visit_verified,
        avatar: av, latitude: lat, longitude: lon, check_in_time: r.check_in_time || r.check_in || null, check_out_time: r.check_out_time || r.check_out || null,
        shift_status: r.shift_status || 'ON-TIME', geofence_status: st, distance_meters: dist === undefined ? null : dist, timestamp: r.check_in || r.date,
      };
    });
    return {
      date: today, geofence: gf, client_sites: sites, punches: items, total_punches: items.length,
      inside_count: items.filter((m) => ['INSIDE', 'VERIFIED_ON_SITE'].includes(m.geofence_status)).length,
      violation_count: items.filter((m) => ['OUTSIDE', 'SITE_PERIMETER_VIOLATION'].includes(m.geofence_status)).length,
    };
  }));

  router.get('/attendance/history', wrap(async (req) => {
    const ctx = await authenticate(req);
    const cid = ctx.orgId;
    const org = await getOrg(ctx);
    const q = req.query;
    const emps = await store.list('employees', cid);
    const f = {};
    if (!ctx.isAdmin) {   // an employee sees only their own days
      const me = await myEmployee(ctx, emps);
      if (!me) return [];
      if (q.employee_id && q.employee_id !== me.id) return [];
      f.employee_id = me.id;
    } else if (q.employee_id) f.employee_id = q.employee_id;
    if (q.start_date) f.date_gte = q.start_date;
    if (q.end_date) f.date_lte = q.end_date;
    let raw = sortBy(await store.list('attendance', cid, f), 'date', true);
    if (q.status && q.status !== 'ALL') raw = raw.filter((r) => r.status === q.status);
    const limit = parseInt(q.limit, 10);
    raw = raw.slice(0, limit > 0 ? limit : 10000);
    const byId = new Map(emps.map((e) => [e.id, e]));
    const byCode = new Map(emps.filter((e) => e.employee_code).map((e) => [e.employee_code, e]));
    const opts = { baseLat: null, baseLon: null, radius: 150, officeName: org.name || 'Argus HQ', overwrite: false };
    let records = raw.map((r) => {
      const emp = byId.get(r.employee_id) || byCode.get(r.employee_code);
      if (emp) {
        const fn = empName(emp); if (fn) r.employee_name = fn;
        r.employee_code = emp.employee_code || r.employee_code; r.department = emp.department || r.department;
        if (!r.shift) r.shift = emp.assigned_shift || 'General Shift';
      }
      entryDistance(r, opts);
      if (!r.total_hours && r.check_in && r.check_out) {
        const a = parseIso(r.check_in), b = parseIso(r.check_out);
        if (a !== null && b !== null) r.total_hours = round(Math.max(0, (b - a) / 1000) / 3600, 2);
      }
      if (!r.shift_status) r.shift_status = r.status === 'HALF_DAY' ? 'HALF-DAY' : r.status === 'LATE' ? 'LATE' : (r.status === 'PRESENT' || r.check_in) ? 'ON-TIME' : '—';
      return r;
    });
    if (q.department && q.department !== 'All Departments') {
      const d = lower(q.department);
      const ids = new Set(emps.filter((e) => lower(e.department) === d).map((e) => e.id));
      records = records.filter((r) => lower(r.department) === d || ids.has(r.employee_id));
    }
    return records;
  }));

  router.get('/attendance/my-history', wrap(async (req) => {
    const ctx = await authenticate(req);
    const emp = await myEmployee(ctx);
    if (!emp) return [];
    const recs = sortBy(await store.list('attendance', ctx.orgId, { employee_id: emp.id }), 'date', true).slice(0, 60);
    for (const r of recs) { r.employee_name = empName(emp); r.employee_code = emp.employee_code || r.employee_code; r.department = emp.department || r.department; }
    return recs;
  }));

  // =================================================================== MANUAL OVERRIDES
  const fmt12h = (s) => { const p = String(s).split(':'); const h = parseInt(p[0], 10), m = parseInt(p[1], 10); if (Number.isNaN(h) || Number.isNaN(m)) return String(s); return `${pad(h % 12 || 12)}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
  router.post('/attendance/manual', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const b = req.body || {};
    need(b, ['employee_id', 'log_date', 'reason']);
    const cid = ctx.orgId;
    const emp = await store.get('employees', cid, String(b.employee_id));
    if (!emp) fail(404, 'Employee not found in your organization.');
    const overrideId = `OVR-${hex(6)}`;
    const name = empName(emp);
    const salaryMode = String(b.mode || '').trim().toLowerCase() === 'salary';
    let manualSal = null;
    if (salaryMode && b.manual_salary !== undefined && b.manual_salary !== null && b.manual_salary !== '') { const v = Number(b.manual_salary); manualSal = Number.isFinite(v) ? round(v, 2) : null; }
    let effHours, display;
    if (salaryMode && manualSal !== null) {
      const rate = num(emp.hourly_rate, 0) || 250.0;
      effHours = rate > 0 ? round(manualSal / rate, 2) : 8.0;
      display = `₹${money2(manualSal)}`;
    } else {
      const h = optNum(b, 'hours');
      effHours = h === null ? 8.0 : h;
      display = `${pyf(effHours)} hrs`;
    }
    const inVal = b.punch_in || b.shift_start || emp.shift_start || '09:00';
    const outVal = b.punch_out || b.shift_end || emp.shift_end || '18:00';
    const in12 = fmt12h(inVal), out12 = fmt12h(outVal);
    const st = ['Permission', 'Improper', 'Others'].includes(b.status) ? b.status : 'Permission';
    const shiftLabel = b.shift === undefined ? 'General Shift' : (b.shift || `Shift (${in12} – ${out12})`);
    const now = new Date();
    const record = {
      id: overrideId, employee_id: emp.id, employee_name: name, employee_code: emp.employee_code || 'EMP', department: emp.department || 'Operations',
      date: b.log_date, mode: salaryMode ? 'Salary' : 'Hours', manual_salary: manualSal, punch_in: in12, punch_out: out12,
      check_in_time: in12, check_out_time: out12, shift_start: inVal, shift_end: outVal, hours: display, total_hours: effHours, shift: shiftLabel,
      status: st, override_status: st, reason: b.reason,
      authorized_by: `${ctx.name || 'Admin'}\n${pad(now.getUTCDate())} ${MON3[now.getUTCMonth()]} ${time12(now.getUTCHours(), now.getUTCMinutes())}`,
      status_type: st === 'Permission' ? 'permission' : st === 'Improper' ? 'improper' : 'others', created_at: now.toISOString(),
    };
    const saved = await store.insert('manual_overrides', cid, record);
    const attPatch = {
      status: 'PRESENT', override_status: st, check_in: `${b.log_date}T${inVal}:00`, check_out: `${b.log_date}T${outVal}:00`,
      check_in_time: in12, check_out_time: out12, shift: shiftLabel, shift_start: inVal, shift_end: outVal, total_hours: effHours,
      mode: salaryMode ? 'Salary' : 'Hours', manual_salary: manualSal, verification_mode: 'MANUAL_OVERRIDE',
    };
    const existing = (await store.list('attendance', cid, { employee_id: emp.id, date: b.log_date }))[0];
    if (existing) await store.update('attendance', cid, existing.id, attPatch);
    else await store.insert('attendance', cid, { employee_id: emp.id, employee_code: emp.employee_code || 'EMP', employee_name: name, department: emp.department || 'Operations', date: b.log_date, ...attPatch, confidence_score: 1.0, liveness_verified: true, created_at: now.toISOString() });
    const empUp = {};
    if (b.shift_start) empUp.shift_start = b.shift_start;
    if (b.shift_end) empUp.shift_end = b.shift_end;
    if (b.shift) empUp.assigned_shift = b.shift; else if (b.shift === undefined) empUp.assigned_shift = 'General Shift';
    if (Object.keys(empUp).length) await store.update('employees', cid, emp.id, empUp);
    await store.audit(ctx, 'MANUAL_ATTENDANCE_OVERRIDE', 'Attendance', overrideId, { employee_id: emp.id, date: b.log_date, status: st, reason: b.reason });
    return saved;
  }));

  router.get('/attendance/manual', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const emps = (await store.list('employees', ctx.orgId)).filter((e) => e.is_active !== false);
    const byId = new Map(emps.map((e) => [e.id, e]));
    const recs = sortBy(await store.list('manual_overrides', ctx.orgId), 'created_at', true).slice(0, 100);
    for (const r of recs) { const e = byId.get(r.employee_id); if (e) { r.employee_name = empName(e); r.employee_code = e.employee_code || r.employee_code; r.department = e.department || r.department; } }
    return recs;
  }));

  // =================================================================== ADVANCES
  router.get('/advances', wrap(async (req) => {
    const ctx = await authenticate(req);
    const cid = ctx.orgId;
    const emps = await store.list('employees', cid);
    const byId = new Map(emps.map((e) => [e.id, e]));
    let advs = sortBy(await store.list('advances', cid), 'created_at', true);
    if (!ctx.isAdmin) { const me = await myEmployee(ctx, emps); advs = me ? advs.filter((a) => a.employee_id === me.id) : []; }
    advs = advs.slice(0, 200);
    const p = ist();
    const curCycle = `${MONTHS[p.mo - 1]} ${p.y}`;
    const cycle = req.query.cycle;
    const out = [];
    for (const a of advs) {
      if (!a.cycle) a.cycle = curCycle;
      const pending = a.approval_type === 'pending' || lower(a.approval).includes('pending');
      if (cycle && !['all', ''].includes(cycle.toLowerCase())) {
        if (ctx.isAdmin) { if (!(a.cycle === cycle || pending)) continue; }
        else if (!(a.cycle === cycle || pending || a.approval_type === 'active')) continue;
      }
      const e = byId.get(a.employee_id);
      if (e) { const fn = empName(e); if (fn) a.name = fn; a.emp_code = e.employee_code || a.emp_code; a.dept = e.department || a.dept; a.email = e.email || a.email; }
      out.push(a);
    }
    return out;
  }));

  router.post('/advances', wrap(async (req) => {
    const ctx = await authenticate(req);
    const b = req.body || {};
    need(b, ['total_advance']);
    const amount = optNum(b, 'total_advance');
    const cid = ctx.orgId;
    const emps = await store.list('employees', cid);
    let emp = null;
    if (ctx.isAdmin && b.employee_id) emp = emps.find((e) => e.id === String(b.employee_id)) || null;
    if (!emp) emp = await myEmployee(ctx, emps);
    if (!emp) fail(404, 'Employee record not found.');
    const name = empName(emp) || emp.name || 'Employee';
    const now = new Date();
    const date = b.date || now.toISOString().slice(0, 10);
    const cycle = b.cycle || date.slice(0, 7);
    const amt = round(amount, 2);
    const active = ctx.isAdmin;
    const record = {
      id: `ADV-${hex(6)}`, employee_id: emp.id, name, emp_code: emp.employee_code || 'EMP', dept: emp.department || 'General', email: emp.email || ctx.email || '',
      total_advance: amt, next_deduction: amt, balance: amt, approval: active ? 'Approved & Active' : 'Pending Approval', approval_type: active ? 'active' : 'pending',
      cycle, date, bank: b.bank || '', payment_type: b.payment_type || 'Cash', receipt: b.receipt === undefined ? null : b.receipt, receipt_filename: b.receipt_filename === undefined ? null : b.receipt_filename,
      cycle_impact: active ? `Will deduct ₹${money0(amt)} in monthly payslip` : 'Awaiting Supervisor Approval',
      reason: b.reason || (active ? 'Authorized Salary Advance' : 'Employee Advance Request'), created_at: now.toISOString(),
    };
    const saved = await store.insert('advances', cid, record);
    if (active) {
      await store.insert('financial_entries', cid, {
        id: `PAY-ADV-${hex(6)}`, employee_id: emp.id, employee_name: name, employee_code: emp.employee_code || 'EMP', department: emp.department || 'General',
        amount: amt, date, cycle, bank: String(b.bank || '').trim(), payment_type: String(b.payment_type || 'Cash').trim(), reason: 'Salary Advance', type: 'ADVANCE',
        receipt: record.receipt, receipt_filename: record.receipt_filename, created_by: ctx.name || 'Admin', created_at: now.toISOString(), timestamp: fmtUtcStamp(now),
      });
    }
    return saved;
  }));

  router.patch('/advances/:id/status', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const b = req.body || {};
    need(b, ['status']);
    const cid = ctx.orgId;
    const adv = await store.get('advances', cid, req.params.id);
    if (!adv) fail(404, 'Advance record not found.');
    const st = String(b.status).toUpperCase();
    const admin = ctx.name || 'Admin';
    const nowIso = new Date().toISOString();
    let up;
    if (st === 'APPROVED') up = { approval: 'Approved & Active', approval_type: 'active', cycle_impact: `Will deduct ₹${money0(adv.next_deduction || 0)} on cycle cut`, approved_by: admin, approved_at: nowIso };
    else if (st === 'REJECTED') up = { approval: 'Rejected', approval_type: 'rejected', cycle_impact: 'Request Rejected (No Deduction)', rejected_by: admin, rejected_at: nowIso };
    else fail(400, 'Status must be APPROVED or REJECTED.');
    const saved = await store.update('advances', cid, adv.id, up);
    const label = st === 'APPROVED' ? 'Approved & Active' : 'Rejected';
    await store.insert('notifications', cid, {
      id: `NOTIF-${hex(8)}`, employee_id: adv.employee_id, employee_email: adv.email || null, type: 'ADVANCE_STATUS', title: `Advance Request ${label}`,
      message: `Your salary advance request of ₹${money2(adv.total_advance || 0)} has been ${label.toLowerCase()} by ${admin}.`,
      amount: adv.total_advance || 0, status: st, is_read: false, created_at: nowIso,
    });
    return saved;
  }));

  // =================================================================== LEAVES
  const CAT_NAMES = { PL: 'Paid Leave (PL)', CL: 'Casual Leave (CL)', SL: 'Sick Leave (SL)', LOP: 'Unpaid LOP' };
  router.get('/leaves', wrap(async (req) => {
    const ctx = await authenticate(req);
    const cid = ctx.orgId;
    const emps = (await store.list('employees', cid)).filter((e) => e.is_active !== false);
    const byId = new Map(emps.map((e) => [e.id, e]));
    let leaves = sortBy(await store.list('leaves', cid), 'created_at', true);
    if (!ctx.isAdmin) { const me = await myEmployee(ctx); leaves = me ? leaves.filter((l) => l.employee_id === me.id) : []; }
    const out = [];
    for (const l of leaves.slice(0, 100)) { const e = byId.get(l.employee_id); if (e) { l.name = empName(e); l.emp_code = e.employee_code || l.emp_code; out.push(l); } }
    return out;
  }));

  router.post('/leaves', wrap(async (req) => {
    const ctx = await authenticate(req);
    const b = req.body || {};
    need(b, ['category', 'from_date', 'to_date', 'reason']);
    const cid = ctx.orgId;
    let emp = null;
    if (b.employee_id && ctx.isAdmin) emp = await store.get('employees', cid, String(b.employee_id));
    if (!emp) emp = await myEmployee(ctx);
    if (!emp) fail(404, 'Employee record not found.');
    const mode = b.duration_mode || 'FULL';
    const record = {
      id: crypto.randomUUID(), employee_id: emp.id, name: empName(emp), emp_code: emp.employee_code || 'EMP',
      category: CAT_NAMES[b.category] || 'Paid Leave (PL)', category_code: b.category, dates: `${b.from_date} to ${b.to_date}`,
      days: mode === 'FULL' ? 'Full Shift' : 'Half Day', reason: b.reason, status: 'Pending Review', approved_by: 'Pending Approval', status_type: 'pending',
      payroll_effect: b.category === 'LOP' ? '-₹1,333 Ded. (Pending)' : 'Salary Protected', created_at: new Date().toISOString(),
      from_date: b.from_date, to_date: b.to_date, duration_mode: mode, contact_phone: b.contact_phone === undefined ? null : b.contact_phone,
    };
    return store.insert('leaves', cid, record);
  }));

  router.patch('/leaves/:id/status', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const b = req.body || {};
    need(b, ['status']);
    const cid = ctx.orgId;
    const leave = await store.get('leaves', cid, req.params.id);
    if (!leave) fail(404, 'Leave record not found.');
    const st = String(b.status).toUpperCase();
    const admin = ctx.name || 'Admin';
    const nowIso = new Date().toISOString();
    let up;
    if (st === 'APPROVED') up = { status: 'Approved', status_type: 'success', approved_by: admin, approved_at: nowIso, payroll_effect: leave.category_code === 'LOP' ? '-₹1,333 Ded. (Approved)' : 'Salary Protected' };
    else if (st === 'REJECTED') up = { status: 'Rejected', status_type: 'danger', approved_by: `Rejected by ${admin}`, rejected_at: nowIso, payroll_effect: 'No Impact (Rejected)' };
    else fail(400, 'Status must be APPROVED or REJECTED.');
    return store.update('leaves', cid, leave.id, up);
  }));

  // =================================================================== NOTIFICATIONS
  async function overdueReminders(cid, empId) {
    const now = new Date();
    const p = ist(now);
    const today = istDate(now);
    const curMins = p.H * 60 + p.M;
    const f = { date: today };
    if (empId) f.employee_id = empId;
    const active = (await store.list('attendance', cid, f)).filter((a) => a.is_currently_in === true);
    if (!active.length) return [];
    const emps = await store.list('employees', cid);
    const notifs = await store.list('notifications', cid);
    const created = [];
    for (const att of active) {
      const emp = emps.find((e) => e.id === att.employee_id);
      if (!emp) continue;
      const et = String(emp.employment_type || 'FULL_TIME').toUpperCase(), stp = String(emp.shift_type || 'FIXED').toUpperCase();
      const flexible = stp === 'FLEXIBLE' || et === 'DAILY_WAGE' || lower(emp.assigned_shift).includes('flexible');
      let overdue = false, info = '';
      if (flexible) {
        const t = parseIso(att.check_in);
        if (t !== null) { const el = (now.getTime() - t) / 3600000; if (el >= 8.5) { overdue = true; info = `${pyf(round(el, 1))} hrs logged`; } }
      } else {
        const se = emp.shift_end || '17:30';
        const parts = String(se).split(':').map((x) => parseInt(x, 10));
        if (parts.length === 2 && parts.every((x) => !Number.isNaN(x)) && curMins >= parts[0] * 60 + parts[1] + 10) { overdue = true; info = `shift ended at ${se}`; }
      }
      if (!overdue) continue;
      if (notifs.some((n) => n.employee_id === att.employee_id && n.type === 'PUNCH_OUT_REMINDER' && n.date === today)) continue;
      const n = await store.insert('notifications', cid, {
        id: `NOTIF-${hex(8)}`, employee_id: att.employee_id, employee_email: emp.email || null, type: 'PUNCH_OUT_REMINDER', title: 'Punch-Out Reminder: Shift Overdue',
        message: `Hello ${emp.first_name || 'Employee'}, your ${info}. You are still clocked in from ${att.check_in_time || 'earlier today'}. Please punch out before leaving!`,
        action_required: true, date: today, is_read: false, created_at: now.toISOString(),
      });
      notifs.push(n); created.push(n);
    }
    return created;
  }
  router.get('/notifications', wrap(async (req) => {
    const ctx = await authenticate(req);
    const cid = ctx.orgId;
    const me = ctx.isAdmin ? null : await myEmployee(ctx);
    await overdueReminders(cid, me ? me.id : null);
    const all = sortBy(await store.list('notifications', cid), 'created_at', true).slice(0, 100);
    if (ctx.isAdmin) return all;
    return all.filter((n) => (me && n.employee_id === me.id) || (ctx.email && n.employee_email === ctx.email) || (!n.employee_id && !n.employee_email));
  }));
  router.post('/notifications/check-overdue-punches', wrap(async (req) => {
    const ctx = await authenticate(req);
    const me = ctx.isAdmin ? null : await myEmployee(ctx);
    const r = await overdueReminders(ctx.orgId, me ? me.id : null);
    return { status: 'success', reminders_created: r.length, reminders: r };
  }));
  router.patch('/notifications/mark-all-read', wrap(async (req) => {
    const ctx = await authenticate(req);
    const me = await myEmployee(ctx);
    for (const n of (await store.list('notifications', ctx.orgId)).filter((x) => !x.is_read)) {
      if (n.employee_email === ctx.email || (me && n.employee_id === me.id)) await store.update('notifications', ctx.orgId, n.id, { is_read: true });
    }
    return { status: 'ok' };
  }));
  router.patch('/notifications/:id/read', wrap(async (req) => {
    const ctx = await authenticate(req);
    const n = await store.get('notifications', ctx.orgId, req.params.id);
    if (n) {
      const me = ctx.isAdmin ? null : await myEmployee(ctx);
      const mine = ctx.isAdmin || (me && n.employee_id === me.id) || n.employee_email === ctx.email || (!n.employee_id && !n.employee_email);
      if (mine) await store.update('notifications', ctx.orgId, n.id, { is_read: true, read_at: new Date().toISOString() });
    }
    return { status: 'ok' };
  }));

  router.post('/notifications/disburse-salary', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const b = req.body || {};
    need(b, ['employee_id', 'cycle', 'amount']);
    const cid = ctx.orgId;
    const emp = await store.get('employees', cid, String(b.employee_id));
    if (!emp) fail(404, 'Employee not found.');
    const nb = (f) => optNum(b, f);
    const name = empName(emp);
    const net = nb('net_salary') !== null ? nb('net_salary') : nb('amount');
    const words = b.net_pay_words || numberToIndianWords(net);
    const base = nb('base_salary') || num(emp.base_salary, 40000.0);
    const stat = nb('statutory_deductions') || num(emp.statutory_deductions, 3000.0);
    const totEarn = nb('total_earnings') !== null ? nb('total_earnings') : base + (nb('overtime_pay') || 0) + (nb('performance_bonus') || 0) + (nb('allowance') || 0);
    const totDed = nb('total_deductions') !== null ? nb('total_deductions') : (nb('advance_deduction') || 0) + stat + (nb('other_deductions') || 0);
    const now = new Date();
    const payout = {
      id: `PAY-${utcStamp(now)}-${emp.employee_code || 'EMP'}-${hex(4)}`, employee_id: emp.id, employee_name: name, employee_code: emp.employee_code || null, cycle: b.cycle,
      base_salary: base, basic_salary: base, overtime_pay: nb('overtime_pay') || 0.0, bonus: nb('performance_bonus') || 0.0, allowance: nb('allowance') || 0.0,
      incentive: nb('incentive') || nb('performance_bonus') || 0.0, others_earnings: nb('others_earnings') || nb('overtime_pay') || 0.0,
      advance_deduction: nb('advance_deduction') || nb('advance_repayment') || 0.0, advance_repayment: nb('advance_repayment') || nb('advance_deduction') || 0.0,
      statutory_deductions: stat, paid_salary: nb('paid_salary') || nb('statutory_deductions') || num(emp.statutory_deductions, 3000.0), other_deductions: nb('other_deductions') || 0.0,
      total_earnings: totEarn, total_deductions: totDed, net_salary: net, net_pay: net, net_pay_words: words,
      employment_type: b.employment_type || emp.employment_type || 'FULL_TIME', calculation_basis: b.calculation_basis === undefined ? null : b.calculation_basis,
      logged_hours: nb('logged_hours'), hourly_rate: nb('hourly_rate') || num(emp.hourly_rate, 250.0), hours_salary: nb('hours_salary') || nb('hourly_rate') || num(emp.hourly_rate, 250.0),
      day_salary: nb('day_salary') || num(emp.daily_wage_rate, 600.0), half_day_salary: nb('half_day_salary') || num(emp.half_day_salary, 300.0),
      days_present: nb('days_present') || 0, half_days: nb('half_days') || 0, leave_days: nb('leave_days') || 0, working_days: nb('working_days') || nb('days_present') || 0,
      status: 'PAID', disbursed_by: ctx.name || 'Payroll Administrator', disbursed_at: now.toISOString(), created_at: now.toISOString(),
    };
    const saved = await store.insert('salary_payouts', cid, payout);
    const advDed = nb('advance_deduction');
    if (advDed && advDed > 0) {
      const adv = sortBy((await store.list('advances', cid, { employee_id: emp.id })).filter((a) => a.approval_type === 'active'), 'created_at')[0];
      if (adv) {
        const nbal = Math.max(0, num(adv.balance, 0) - advDed);
        const up = { balance: nbal };
        if (nbal <= 0) { up.approval = 'Completed & Paid Off'; up.approval_type = 'completed'; }
        await store.update('advances', cid, adv.id, up);
      }
    }
    const notif = await store.insert('notifications', cid, {
      id: `NOTIF-${hex(8)}`, employee_id: emp.id, employee_email: emp.email || null, type: 'SALARY_CREDITED', title: `Salary Credited for ${b.cycle}`,
      message: `Dear ${emp.first_name || 'Employee'}, your net salary of ₹${money2(net)} for ${b.cycle} has been processed and credited to your account.`,
      amount: net, cycle: b.cycle, payout_id: saved.id, is_read: false, created_at: now.toISOString(),
    });
    return { status: 'success', message: `Salary for ${name} credited successfully.`, payout: saved, notification: notif };
  }));

  // =================================================================== FINANCIAL ENTRIES
  function entryType(reason, explicit) {
    if (explicit && ['BONUS', 'DEDUCTION', 'REIMBURSEMENT', 'ADVANCE', 'REPAYMENT'].includes(String(explicit).toUpperCase())) return String(explicit).toUpperCase();
    const r = String(reason || '').trim();
    if (['Salary Advance', 'Advance'].includes(r)) return 'ADVANCE';
    if (['Incentive', 'Bonus'].includes(r)) return 'BONUS';
    if (['Allowance', 'Reimbursement'].includes(r)) return 'REIMBURSEMENT';
    if (r === 'Salary') return 'SALARY';
    if (['Advance Repayment', 'Repayment'].includes(r)) return 'REPAYMENT';
    if (['Other Deductions', 'Deduction'].includes(r)) return 'DEDUCTION';
    if (r === 'Other Earnings') return 'BONUS';
    return 'OTHER';
  }
  router.post('/financial-entries', wrap(async (req, res) => {
    const ctx = requireAdmin(await authenticate(req));
    const b = req.body || {};
    need(b, ['employee_id', 'amount', 'reason']);
    const amount = optNum(b, 'amount');
    const cid = ctx.orgId;
    const emps = await store.list('employees', cid);
    const emp = emps.find((e) => e.id === String(b.employee_id)) || emps.find((e) => e.employee_code === String(b.employee_id));
    if (!emp) fail(404, 'Employee not found in your organization.');
    const now = new Date();
    const date = b.date ? String(b.date).trim() : now.toISOString().slice(0, 10);
    const cycle = b.cycle ? String(b.cycle).trim() : date.slice(0, 7);
    const name = empName(emp) || emp.name || 'Employee';
    const record = {
      id: `PAY-${hex(6)}`, employee_id: emp.id, employee_name: name, employee_code: emp.employee_code || 'EMP', department: emp.department || 'Operations',
      amount: round(amount, 2), date, cycle, bank: String(b.bank || '').trim(), payment_type: String(b.payment_type || 'UPI').trim(),
      reason: String(b.reason || 'Salary').trim(), type: entryType(b.reason, b.type), receipt: b.receipt === undefined ? null : b.receipt,
      receipt_filename: b.receipt_filename === undefined ? null : b.receipt_filename, created_by: ctx.name || 'Admin', created_at: now.toISOString(), timestamp: fmtUtcStamp(now),
    };
    const saved = await store.insert('financial_entries', cid, record);
    if (['Salary Advance', 'Advance'].includes(record.reason) || record.type === 'ADVANCE') {
      if (!(await store.get('advances', cid, saved.id))) {
        await store.insert('advances', cid, {
          id: saved.id, employee_id: emp.id, name, emp_code: emp.employee_code || 'EMP', dept: emp.department || 'Operations', email: emp.email || '',
          total_advance: record.amount, next_deduction: record.amount, balance: record.amount, approval: 'Approved & Active', approval_type: 'active',
          cycle, date, bank: record.bank, payment_type: record.payment_type, receipt: record.receipt, receipt_filename: record.receipt_filename,
          cycle_impact: `Will deduct ₹${money0(record.amount)} in monthly payslip`, reason: 'Salary Advance', created_at: now.toISOString(),
        });
      }
    }
    if (record.reason === 'Advance Repayment' || record.payment_type === 'Repayment') {
      const advs = sortBy((await store.list('advances', cid, { employee_id: emp.id })).filter((a) => a.approval_type === 'active'), 'created_at');
      let rem = record.amount;
      for (const a of advs) {
        const bal = num(a.balance, 0);
        if (bal > 0 && rem > 0) {
          const d = Math.min(bal, rem); const nbal = round(bal - d, 2); rem = round(rem - d, 2);
          const up = { balance: nbal };
          if (nbal <= 0) Object.assign(up, { approval_type: 'completed', approval: 'Completed & Paid Off', status: 'Completed' });
          await store.update('advances', cid, a.id, up);
        }
      }
    }
    res.status(201).json(saved);
  }));

  router.get('/financial-entries/balance-summary', wrap(async (req) => {
    const ctx = await authenticate(req);
    const cid = ctx.orgId;
    let entries = await store.list('financial_entries', cid);
    let advances = await store.list('advances', cid);
    let emps = await store.list('employees', cid);
    if (!ctx.isAdmin) {   // an employee sees only their own figures
      const me = await myEmployee(ctx, emps);
      const id = me ? me.id : '__none__';
      entries = entries.filter((e) => e.employee_id === id); advances = advances.filter((a) => a.employee_id === id); emps = emps.filter((e) => e.id === id);
    }
    const isRepay = (e) => e.reason === 'Advance Repayment' || e.payment_type === 'Repayment';
    const balances = [];
    for (const emp of emps) {
      const ea = advances.filter((a) => a.employee_id === emp.id), ee = entries.filter((e) => e.employee_id === emp.id);
      const bal = ea.filter((a) => a.approval_type === 'active').reduce((s, a) => s + num(a.balance, 0), 0);
      const recv = ea.reduce((s, a) => s + (num(a.total_advance, 0) || num(a.amount, 0)), 0);
      const repaid = ee.filter(isRepay).reduce((s, e) => s + num(e.amount, 0), 0);
      const paid = ee.reduce((s, e) => s + num(e.amount, 0), 0);
      if (bal > 0 || recv > 0 || paid > 0) balances.push({ employee_id: emp.id, employee_name: empName(emp) || emp.name || 'Employee', employee_code: emp.employee_code || 'EMP', department: emp.department || 'Operations',
        active_advance_balance: round(bal, 2), total_advances_received: round(recv, 2), total_advance_repaid: round(repaid, 2), total_payments_logged: round(paid, 2) });
    }
    return {
      total_payments_logged: round(entries.reduce((s, e) => s + num(e.amount, 0), 0), 2),
      total_advances_disbursed: round(advances.reduce((s, a) => s + (num(a.total_advance, 0) || num(a.amount, 0) || num(a.advance_amount, 0)), 0), 2),
      total_advance_repaid: round(entries.filter(isRepay).reduce((s, e) => s + num(e.amount, 0), 0), 2),
      outstanding_advance_balance: round(advances.filter((a) => a.approval_type === 'active').reduce((s, a) => s + num(a.balance, 0), 0), 2),
      employee_balances: balances,
    };
  }));

  router.get('/financial-entries', wrap(async (req) => {
    const ctx = await authenticate(req);
    const cid = ctx.orgId;
    const q = req.query;
    let entries = await store.list('financial_entries', cid);
    if (!ctx.isAdmin) { const me = await myEmployee(ctx); if (!me) return []; entries = entries.filter((e) => e.employee_id === me.id); }
    else if (q.employee_id && q.employee_id !== 'All') entries = entries.filter((e) => e.employee_id === q.employee_id);
    if (q.cycle) entries = entries.filter((e) => e.cycle === String(q.cycle).trim());
    if (q.start_date) entries = entries.filter((e) => e.date && e.date >= q.start_date);
    if (q.end_date) entries = entries.filter((e) => e.date && e.date <= q.end_date);
    if (q.bank && q.bank !== 'All') entries = entries.filter((e) => e.bank === String(q.bank).trim());
    if (q.payment_type && q.payment_type !== 'All') entries = entries.filter((e) => e.payment_type === String(q.payment_type).trim());
    if (q.reason && q.reason !== 'All') entries = entries.filter((e) => e.reason === String(q.reason).trim());
    if (q.type && q.type !== 'All') entries = entries.filter((e) => e.type === String(q.type).trim().toUpperCase());
    sortBy(entries, 'created_at', true);
    if (q.search && String(q.search).trim()) {
      const s = lower(q.search);
      entries = entries.filter((e) => [e.employee_name, e.employee_code, e.bank, e.payment_type, e.reason].some((v) => lower(v).includes(s)) || String(e.amount || '').includes(s) || String(e.date || '').includes(s));
    }
    return entries;
  }));

  router.put('/financial-entries/:id', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const b = req.body || {};
    const cid = ctx.orgId;
    const entry = await store.get('financial_entries', cid, req.params.id);
    if (!entry) fail(404, 'Payment entry not found.');
    const up = {};
    const amt = optNum(b, 'amount');
    if (amt !== null) up.amount = round(amt, 2);
    if (b.reason != null) { up.reason = String(b.reason).trim(); up.type = entryType(b.reason); }
    if (b.date != null) { up.date = String(b.date).trim(); up.cycle = up.date.slice(0, 7); }
    if (b.bank != null) up.bank = String(b.bank).trim();
    if (b.payment_type != null) up.payment_type = String(b.payment_type).trim();
    if (b.receipt != null) up.receipt = b.receipt;
    if (b.receipt_filename != null) up.receipt_filename = b.receipt_filename;
    if (!Object.keys(up).length) return entry;
    return store.update('financial_entries', cid, entry.id, up);
  }));

  router.delete('/financial-entries/:id', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const entry = await store.get('financial_entries', ctx.orgId, req.params.id);
    if (!entry) fail(404, 'Payment entry not found.');
    await store.remove('financial_entries', ctx.orgId, entry.id);
    return { status: 'success', message: `Payment entry ${entry.id} deleted.` };
  }));

  // =================================================================== PAYROLL
  function recordHours(r) {
    const th = Number(r.total_hours);
    if (r.total_hours != null && Number.isFinite(th) && th > 0) return round(th, 2);
    const punches = r.punches || [];
    if (punches.length) {
      const d = r.date || '2026-09-01';
      const norm = punches.map((p) => {
        let a = String(p.action || p.punch_type || p.type || '').toUpperCase();
        if (['IN', 'CHECKIN', 'CHECK_IN'].includes(a)) a = 'CHECK_IN'; else if (['OUT', 'CHECKOUT', 'CHECK_OUT'].includes(a)) a = 'CHECK_OUT';
        let ts = p.timestamp || p.time;
        if (ts && String(ts).length <= 8 && String(ts).includes(':')) ts = `${d}T${ts}+05:30`;
        return { action: a, timestamp: ts ? String(ts) : null };
      });
      const h = punchesTotalHours(norm);
      if (h > 0) return round(h, 2);
    }
    const a = parseIso(r.check_in), b = parseIso(r.check_out);
    if (a !== null && b !== null) { const h = (b - a) / 3600000; if (h > 0) return round(h, 2); }
    return 0.0;
  }
  const currentCycle = () => { const p = ist(); return `${p.y}-${pad(p.mo)}`; };
  async function payrollBundle(cid, { empId, start, end } = {}) {
    const f = empId ? { employee_id: empId } : {};
    const [records, fin, advs, payouts] = await Promise.all([
      store.list('attendance', cid, { ...f, date_gte: start, date_lte: end }),
      store.list('financial_entries', cid, f), store.list('advances', cid, f), store.list('salary_payouts', cid, f),
    ]);
    return { records, fin, advs, payouts };
  }
  function cycleRange(cycle) {
    const m = /^(\d+)-(\d+)/.exec(String(cycle || ''));
    let y, mo;
    if (m && +m[2] >= 1 && +m[2] <= 12) { y = +m[1]; mo = +m[2]; } else { const p = ist(); y = p.y; mo = p.mo; cycle = `${y}-${pad(mo)}`; }
    const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return { cycle, y, mo, days, start: `${pad(y, 4)}-${pad(mo)}-01`, end: `${pad(y, 4)}-${pad(mo)}-${pad(days)}` };
  }
  function computePayroll(emp, cycleIn, bundle) {
    const { cycle, y, mo, days, start, end } = cycleRange(cycleIn);
    const empId = emp.id;
    const empType = String(emp.employment_type || 'FULL_TIME').toUpperCase();
    const recs = bundle.records.filter((r) => r.employee_id === empId && r.date && r.date >= start && r.date <= end);
    const present = recs.filter((r) => ['PRESENT', 'LATE'].includes(r.status)).length;
    const half = recs.filter((r) => r.status === 'HALF_DAY').length;
    const paidLeaves = recs.filter((r) => r.status === 'LEAVE').length;
    const effPresent = present + 0.5 * half;
    const manualRecs = recs.filter((r) => r.mode === 'Salary' || (r.manual_salary != null && num(r.manual_salary, 0) > 0));
    const hourlyRecs = recs.filter((r) => !manualRecs.includes(r));
    const hoursPunch = round(hourlyRecs.reduce((s, r) => s + recordHours(r), 0), 2);
    const manualSal = round(manualRecs.reduce((s, r) => s + num(r.manual_salary, 0), 0), 2);
    const totalLogged = round(hoursPunch + manualRecs.reduce((s, r) => s + recordHours(r), 0), 2);
    const working = present + half;
    const std = 26;
    const leaveDays = Math.max(0, Math.trunc(std - working));
    const autoOt = totalLogged > 0 && effPresent > 0 ? Math.max(0, round(totalLogged - effPresent * 8.0, 1)) : 0.0;
    const hourly = emp.hourly_rate != null ? num(emp.hourly_rate, 250) : 250.0;
    const daily = emp.daily_wage_rate != null ? num(emp.daily_wage_rate) : round(hourly * 8.0, 2);
    const halfSal = emp.half_day_salary != null ? num(emp.half_day_salary) : round(daily / 2.0, 2);
    const base = emp.base_salary != null ? num(emp.base_salary) : 40000.0;
    const statutory = emp.statutory_deductions != null ? num(emp.statutory_deductions) : 3000.0;
    const plural = manualRecs.length > 1 ? 's' : '';
    let earned = round(hoursPunch * hourly + manualSal, 2);
    let basis;
    if (manualSal > 0 && hoursPunch > 0) basis = `${hoursPunch.toFixed(1)} hrs logged (@₹${hourly.toFixed(2)}/hr) + ₹${money2(manualSal)} manual day salary`;
    else if (manualSal > 0) basis = `₹${money2(manualSal)} (from ${manualRecs.length} manual day salary override${plural})`;
    else basis = `${totalLogged.toFixed(1)} hrs logged × ₹${hourly.toFixed(2)}/hr (Punch-Hours Basis)`;
    let lop = 0.0;
    if (empType === 'DAILY_WAGE') {
      const sp = hourlyRecs.filter((r) => ['PRESENT', 'LATE'].includes(r.status)).length;
      const sh = hourlyRecs.filter((r) => r.status === 'HALF_DAY').length;
      earned = round(round(sp * daily + sh * halfSal, 2) + manualSal, 2);
      basis = `${sp} Full Days (@₹${pyf(daily)}) + ${sh} Half-Days (@₹${pyf(halfSal)})` + (manualSal > 0 ? ` + ₹${money2(manualSal)} manual salary` : '');
    } else if (empType === 'PART_TIME') {
      earned = round(hoursPunch * hourly + manualSal, 2);
      basis = manualSal > 0 ? `${hoursPunch.toFixed(1)} hrs logged × ₹${hourly.toFixed(2)}/hr + ₹${money2(manualSal)} manual salary` : `${totalLogged.toFixed(1)} hrs logged × ₹${hourly.toFixed(2)}/hr (Hourly Part-Time Basis)`;
    } else if (empType === 'FIELD_WORKER') {
      if (totalLogged > 0 || manualSal > 0) {
        earned = round(hoursPunch * hourly + manualSal, 2);
        basis = `${hoursPunch.toFixed(1)} hrs logged × ₹${hourly.toFixed(2)}/hr` + (manualSal > 0 ? ` + ₹${money2(manualSal)} manual salary` : '');
      } else { earned = base; basis = `Field Worker Base Pay: ₹${money2(base)}`; }
    } else if (!(hoursPunch > 0 || manualSal > 0)) {
      const perDay = round(base / std, 2);
      const absents = recs.filter((r) => r.status === 'ABSENT').length;
      lop = round(absents + half * 0.5, 1);
      earned = Math.max(0, round(base - round(lop * perDay, 2), 2));
      basis = lop > 0 ? `Fixed Monthly ₹${money2(base)} (26 days base; -${pyf(lop)} absent/half-day LOP @ ₹${pyf(perDay)}/day)` : `Fixed Monthly ₹${money2(base)} (Awaiting cycle punches)`;
    }
    const otPay = round(autoOt * hourly * 1.5, 2);
    const fin = bundle.fin.filter((e) => e.employee_id === empId && e.cycle === cycle);
    const sum = (pred) => fin.filter(pred).reduce((s, e) => s + num(e.amount, 0), 0);
    const mSalary = sum((e) => e.reason === 'Salary');
    const mBonus = sum((e) => ['Incentive', 'Bonus'].includes(e.reason) || e.type === 'BONUS');
    const mAllow = sum((e) => e.reason === 'Allowance' || e.type === 'REIMBURSEMENT');
    const mOther = sum((e) => e.reason === 'Other Earnings');
    const mOtherDed = sum((e) => (['Other Deductions', 'Deduction'].includes(e.reason) || e.type === 'DEDUCTION') && !['Advance Repayment', 'Salary Advance'].includes(e.reason) && e.payment_type !== 'Repayment' && !['ADVANCE', 'REPAYMENT'].includes(e.type));
    earned = round(earned + mSalary, 2);
    const incentive = round(mBonus + (effPresent >= 20 ? 2500.0 : 0.0), 2);
    const allowance = round(mAllow, 2);
    const others = round(otPay + mOther, 2);
    const totalEarn = round(earned + allowance + incentive + others, 2);
    const activeBal = bundle.advs.filter((a) => a.employee_id === empId && a.approval_type === 'active').reduce((s, a) => s + (num(a.balance, 0) > 0 ? num(a.balance, 0) : 0), 0);
    const monthCycle = `${MONTHS[mo - 1]} ${y}`;
    const payout = bundle.payouts.find((p) => p.employee_id === empId && ([cycle, monthCycle].includes(p.cycle) || String(p.cycle || '').includes(cycle))) || null;
    let advRepay, payStatus;
    if (activeBal > 0) {
      const avail = totalEarn > 0 ? Math.max(0, totalEarn - statutory) : activeBal;
      advRepay = totalEarn > 0 ? round(Math.min(activeBal, avail), 2) : round(activeBal, 2);
      payStatus = 'PENDING';
    } else if (payout) { advRepay = num(payout.advance_repayment, 0) || num(payout.advance_deduction, 0); payStatus = payout.status || 'PAID'; }
    else { advRepay = 0.0; payStatus = 'PENDING'; }
    const paidSalary = totalEarn > 0 ? Math.min(statutory, totalEarn) : 0.0;
    const otherDed = round(mOtherDed, 2);
    const totalDed = round(paidSalary + advRepay + otherDed, 2);
    const net = Math.max(0, round(totalEarn - totalDed, 2));
    const full = empName(emp) || 'Employee';
    const hInt = Math.trunc(totalLogged), mInt = Math.trunc(Math.round((totalLogged - hInt) * 60));
    const breakdown = [...recs].sort((a, b) => strCmp(a.date || '', b.date || '') || strCmp(String(a.check_in || ''), String(b.check_in || ''))).map((r) => {
      const dn = r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? DAYS[new Date(r.date + 'T00:00:00Z').getUTCDay()] : '';
      const hrs = recordHours(r);
      const mode = r.mode || 'Hours';
      const ms = r.manual_salary != null ? num(r.manual_salary, 0) : 0.0;
      const st = r.status || 'PRESENT';
      let label, earnedDay;
      if (mode === 'Salary' || ms > 0) { label = 'Manual Day Wage'; earnedDay = ms; }
      else if (empType === 'DAILY_WAGE') { if (st === 'HALF_DAY') { label = `₹${halfSal.toFixed(2)} (Half-Day)`; earnedDay = halfSal; } else { label = `₹${daily.toFixed(2)} (Full Day)`; earnedDay = daily; } }
      else { label = `₹${hourly.toFixed(2)}/hr`; earnedDay = round(hrs * hourly, 2); }
      let ci = r.check_in_time; if (!ci && r.check_in) ci = String(r.check_in).includes('T') ? wallTime12(r.check_in) : String(r.check_in);
      let co = r.check_out_time; if (!co && r.check_out) co = String(r.check_out).includes('T') ? wallTime12(r.check_out) : String(r.check_out);
      const shift = r.shift || (r.shift_start && r.shift_end ? `${r.shift_start} - ${r.shift_end}` : 'Regular Shift');
      return { id: r.id, date: r.date || '', day_name: dn, shift, check_in_time: ci || '—', check_out_time: co || '—', hours: hrs, status: st, mode, rate_label: label, daily_earned: round(earnedDay, 2), verification_mode: r.verification_mode || 'FACE_KIOSK' };
    });
    return {
      employee_id: empId, employee_name: full, employee_code: emp.employee_code || 'EMP', department: emp.department || 'Operations',
      designation: emp.designation || emp.department || 'Production', phone: emp.phone || '—', aadhar_number: emp.aadhar_number || emp.employee_code || '—',
      employment_type: empType, cycle, cycle_display: monthCycle, total_days_of_month: days, total_working_days: std, working_days: working,
      days_present: present, half_days: half, paid_leaves: paidLeaves, leave_days: leaveDays, lop_days: lop,
      total_logged_hours: round(totalLogged, 1), total_working_hours_formatted: `${pad(hInt)}:${pad(mInt)}`, overtime_hours: autoOt,
      hourly_rate: hourly, hours_salary: hourly, day_salary: daily, half_day_salary: halfSal,
      base_salary: earned, basic_salary: earned, allowance, incentive, others_earnings: others, total_earnings: totalEarn,
      paid_salary: paidSalary, advance_repayment: advRepay, other_deductions: otherDed, total_deductions: totalDed,
      net_pay: net, net_pay_words: numberToIndianWords(net), calculation_basis: basis, daily_breakdown: breakdown,
      financial_entries: fin, payment_entries: fin, payout_status: payStatus, payout_id: payout ? payout.id : null, disbursed_at: payout ? payout.disbursed_at || null : null,
      banking: { account_holder_name: emp.account_holder_name || full, bank_name: emp.bank_name || '—', account_number: emp.account_number || '—', ifsc_code: emp.ifsc_code || '—', upi_number: emp.upi_number || '—' },
    };
  }
  async function companyRegister(cid, cycleIn) {
    const r = cycleRange(cycleIn);
    const emps = (await store.list('employees', cid)).filter((e) => e.is_active !== false);
    const bundle = await payrollBundle(cid, { start: r.start, end: r.end });
    return { emps, bundle, cycle: cycleIn || currentCycle() };
  }

  router.get('/payroll/compute/:id', wrap(async (req) => {
    const ctx = await authenticate(req);
    const cid = ctx.orgId;
    let emp;
    if (!ctx.isAdmin) { const me = await myEmployee(ctx); if (!me || me.id !== req.params.id) fail(403, 'Unauthorized access to payroll profile.'); emp = me; }
    else emp = await store.get('employees', cid, req.params.id);
    if (!emp) fail(404, 'Employee record not found.');
    const cycle = req.query.cycle || currentCycle();
    const r = cycleRange(cycle);
    return computePayroll(emp, cycle, await payrollBundle(cid, { empId: emp.id, start: r.start, end: r.end }));
  }));

  router.get('/payroll/register', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const { emps, bundle, cycle } = await companyRegister(ctx.orgId, req.query.cycle);
    return emps.map((e) => computePayroll(e, cycle, bundle));
  }));

  router.get('/payroll/bank-advice', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const { emps, bundle, cycle } = await companyRegister(ctx.orgId, req.query.cycle);
    return emps.map((e) => {
      const c = computePayroll(e, cycle, bundle); const b = c.banking;
      return { employee_code: c.employee_code, employee_name: c.employee_name, account_holder_name: b.account_holder_name || c.employee_name, bank_name: b.bank_name || '—',
        account_number: b.account_number || '—', ifsc_code: b.ifsc_code || '—', upi_number: b.upi_number || '—', net_payable: c.net_pay, cycle, status: c.payout_status };
    });
  }));

  const disburse = wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const cid = ctx.orgId;
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const qCycle = req.query.cycle || null;
    const target = b.cycle || qCycle || new Date().toISOString().slice(0, 7);
    let ids = Array.isArray(b.employee_ids) ? b.employee_ids : null;
    if (!ids && req.query.employee_ids) ids = [].concat(req.query.employee_ids);
    let emps = (await store.list('employees', cid)).filter((e) => e.is_active !== false);
    if (ids && ids.length) emps = emps.filter((e) => ids.includes(e.id) || ids.includes(e.employee_code));
    const r = cycleRange(target);
    const bundle = await payrollBundle(cid, { start: r.start, end: r.end });
    const admin = ctx.name || 'Payroll Administrator';
    const disbursed = [], skipped = [];
    for (const emp of emps) {
      const c = computePayroll(emp, target, bundle);
      if (c.payout_status === 'PAID') { skipped.push(c.employee_code); continue; }
      const now = new Date();
      const payoutId = `PAY-${utcStamp(now)}-${c.employee_code}`;
      const rec = {
        id: payoutId, employee_id: emp.id, employee_name: c.employee_name, employee_code: c.employee_code, cycle: c.cycle_display || qCycle, cycle_code: qCycle,
        base_salary: c.basic_salary, overtime_pay: c.others_earnings, bonus: c.incentive, allowance: c.allowance, incentive: c.incentive, others_earnings: c.others_earnings,
        advance_deduction: c.advance_repayment, advance_repayment: c.advance_repayment, statutory_deductions: c.paid_salary, paid_salary: c.paid_salary,
        other_deductions: c.other_deductions, total_earnings: c.total_earnings, total_deductions: c.total_deductions, net_salary: c.net_pay, net_pay: c.net_pay,
        net_pay_words: c.net_pay_words, employment_type: c.employment_type, calculation_basis: c.calculation_basis, logged_hours: c.total_logged_hours,
        hourly_rate: c.hours_salary, hours_salary: c.hours_salary, day_salary: c.day_salary, half_day_salary: c.half_day_salary, working_days: c.working_days,
        days_present: c.days_present, half_days: c.half_days, leave_days: c.leave_days, daily_breakdown: c.daily_breakdown || [],
        status: 'PAID', disbursed_by: admin, disbursed_at: now.toISOString(), created_at: now.toISOString(),
      };
      const existing = bundle.payouts.find((p) => p.employee_id === emp.id && ([c.cycle_display, target].includes(p.cycle) || String(p.cycle || '').includes(target)));
      let saved;
      if (existing) { const { id: _drop, ...rest } = rec; saved = await store.update('salary_payouts', cid, existing.id, rest); Object.assign(existing, saved); }
      else {
        try { saved = await store.insert('salary_payouts', cid, rec); }
        catch (e) { if (e.code !== '23505') throw e; saved = await store.insert('salary_payouts', cid, { ...rec, id: `${payoutId}-${hex(4)}` }); }
        bundle.payouts.push(saved);
      }
      if (c.advance_repayment > 0) {
        let rem = num(c.advance_repayment);
        const advs = sortBy(bundle.advs.filter((a) => a.employee_id === emp.id && a.approval_type === 'active'), 'created_at');
        for (const a of advs) {
          const bal = num(a.balance, 0);
          if (bal > 0 && rem > 0) {
            const d = Math.min(bal, rem); const nb = round(bal - d, 2); rem = round(rem - d, 2);
            const up = { balance: nb };
            if (nb <= 0) Object.assign(up, { approval: 'Completed & Paid Off', approval_type: 'completed' });
            Object.assign(a, await store.update('advances', cid, a.id, up));
          }
        }
        const fe = await store.insert('financial_entries', cid, {
          id: `PAY-REP-${hex(6)}`, employee_id: emp.id, employee_name: c.employee_name, employee_code: c.employee_code, department: c.department || 'Operations',
          amount: c.advance_repayment, type: 'REPAYMENT', reason: 'Advance Repayment', payment_type: 'Salary Deduction', bank: 'Payroll Deduction',
          cycle: c.cycle_display || qCycle, date: now.toISOString().slice(0, 10), created_by: admin, created_at: now.toISOString(), timestamp: fmtUtcStamp(now),
        });
        bundle.fin.push(fe);
      }
      const disp = c.cycle_display || qCycle;
      await store.insert('notifications', cid, {
        id: `NOTIF-${hex(8)}`, employee_id: emp.id, employee_email: emp.email || null, type: 'SALARY_CREDITED', title: `Salary Credited for ${disp}`,
        message: `Dear ${c.employee_name}, your net salary of ₹${money2(c.net_pay)} for ${disp} has been disbursed to your bank account.`,
        amount: c.net_pay, cycle: disp, payout_id: saved.id, is_read: false, created_at: now.toISOString(),
      });
      disbursed.push(c.employee_code);
    }
    return { status: 'success', cycle: target, disbursed_count: disbursed.length, disbursed_employees: disbursed, skipped_count: skipped.length, skipped_employees: skipped,
      message: `Successfully processed payroll disbursement for ${disbursed.length} employees.` };
  });
  router.post('/payroll/disburse', disburse);
  router.post('/payroll/batch-disburse', disburse);

  // =================================================================== REPORT FILES (opened in a new tab: token may come as ?token=)
  const sendFile = (res, buf, type, name) => {
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', `attachment; filename=${name}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  };
  const ATT_COLS = ['Date', 'Employee Code', 'Employee Name', 'Department', 'Check In', 'Check Out', 'Hours Worked', 'Status', 'Verification'];
  async function attendanceRows(req) {
    const ctx = requireAdmin(await authenticate(req, { queryToken: true }));
    const q = req.query;
    const f = {};
    if (q.start_date && q.end_date) { f.date_gte = q.start_date; f.date_lte = q.end_date; } else if (q.start_date) f.date_gte = q.start_date;
    const raw = sortBy(await store.list('attendance', ctx.orgId, f), 'date', true);
    const byId = new Map((await store.list('employees', ctx.orgId)).filter((e) => e.is_active !== false).map((e) => [e.id, e]));
    const rows = [];
    for (const r of raw) {
      const e = byId.get(r.employee_id);
      if (!e) continue;
      const dept = e.department || r.department;
      if (q.department && dept !== q.department && r.department !== q.department) continue;
      rows.push({ Date: r.date, 'Employee Code': e.employee_code || r.employee_code, 'Employee Name': empName(e), Department: dept,
        'Check In': r.check_in ? String(r.check_in).slice(0, 19) : 'N/A', 'Check Out': r.check_out ? String(r.check_out).slice(0, 19) : 'N/A',
        'Hours Worked': num(r.total_hours, 0), Status: r.status || 'PRESENT', Verification: r.verification_mode || 'FACE_KIOSK' });
    }
    return rows;
  }
  const floatCsv = (rows, cols) => rows.map((r) => { const o = { ...r }; for (const c of cols) if (typeof o[c] === 'number') o[c] = pyf(o[c]); return o; });
  router.get('/reports/export-csv', wrap(async (req, res) => {
    const rows = await attendanceRows(req);
    sendFile(res, Buffer.from(csvOf(ATT_COLS, floatCsv(rows, ['Hours Worked'])), 'utf8'), 'text/csv; charset=utf-8', 'argus_attendance_report.csv');
  }));
  router.get('/reports/export-excel', wrap(async (req, res) => {
    const rows = await attendanceRows(req);
    sendFile(res, xlsxOf([{ name: 'Attendance', columns: ATT_COLS, rows: rows.map((r) => ATT_COLS.map((c) => r[c])) }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'argus_attendance_report.xlsx');
  }));
  const PAY_COLS = ['Employee Code', 'Employee Name', 'Department', 'Designation', 'Employment Type', 'Cycle', 'Working Days', 'Days Present', 'Half Days', 'Leave Days', 'Logged Hours', 'Overtime Hours', 'Basic Salary', 'Allowance', 'Incentive', 'Others Earnings', 'Total Earnings', 'Paid Salary (PF/Taxes)', 'Advance Repayment', 'Other Deductions', 'Total Deductions', 'Net Pay (INR)', 'Net Pay In Words', 'Payout Status'];
  const PAY_FLOATS = ['Logged Hours', 'Overtime Hours', 'Basic Salary', 'Allowance', 'Incentive', 'Others Earnings', 'Total Earnings', 'Paid Salary (PF/Taxes)', 'Advance Repayment', 'Other Deductions', 'Total Deductions', 'Net Pay (INR)'];
  const BANK_COLS = ['Employee Code', 'Employee Name', 'Account Holder Name', 'Bank Name', 'Account Number', 'IFSC Code', 'UPI Number', 'Net Payable (INR)', 'Cycle', 'Payout Status'];
  async function payrollRows(req) {
    const ctx = requireAdmin(await authenticate(req, { queryToken: true }));
    const cycle = req.query.cycle || currentCycle();
    const { emps, bundle } = await companyRegister(ctx.orgId, cycle);
    const reg = [], bank = [];
    for (const e of emps) {
      const c = computePayroll(e, cycle, bundle); const b = c.banking; const cyc = c.cycle_display || cycle;
      reg.push({ 'Employee Code': c.employee_code, 'Employee Name': c.employee_name, Department: c.department, Designation: c.designation, 'Employment Type': c.employment_type, Cycle: cyc,
        'Working Days': c.working_days, 'Days Present': c.days_present, 'Half Days': c.half_days, 'Leave Days': c.leave_days, 'Logged Hours': c.total_logged_hours, 'Overtime Hours': c.overtime_hours,
        'Basic Salary': c.basic_salary, Allowance: c.allowance, Incentive: c.incentive, 'Others Earnings': c.others_earnings, 'Total Earnings': c.total_earnings,
        'Paid Salary (PF/Taxes)': c.paid_salary, 'Advance Repayment': c.advance_repayment, 'Other Deductions': c.other_deductions, 'Total Deductions': c.total_deductions,
        'Net Pay (INR)': c.net_pay, 'Net Pay In Words': c.net_pay_words, 'Payout Status': c.payout_status });
      bank.push({ 'Employee Code': c.employee_code, 'Employee Name': c.employee_name, 'Account Holder Name': b.account_holder_name || c.employee_name, 'Bank Name': b.bank_name || '—',
        'Account Number': b.account_number || '—', 'IFSC Code': b.ifsc_code || '—', 'UPI Number': b.upi_number || '—', 'Net Payable (INR)': c.net_pay, Cycle: cyc, 'Payout Status': c.payout_status });
    }
    return { cycle, reg, bank };
  }
  const safeName = (s) => String(s).replace(/[^\w.-]/g, '_');
  router.get('/reports/export-payroll-csv', wrap(async (req, res) => {
    const { cycle, reg } = await payrollRows(req);
    sendFile(res, Buffer.from(csvOf(PAY_COLS, floatCsv(reg, PAY_FLOATS)), 'utf8'), 'text/csv; charset=utf-8', `argus_payroll_${safeName(cycle)}.csv`);
  }));
  router.get('/reports/export-payroll-excel', wrap(async (req, res) => {
    const { cycle, reg, bank } = await payrollRows(req);
    sendFile(res, xlsxOf([
      { name: 'Payroll Register', columns: PAY_COLS, rows: reg.map((r) => PAY_COLS.map((c) => r[c])) },
      { name: 'Bank NEFT Advice', columns: BANK_COLS, rows: bank.map((r) => BANK_COLS.map((c) => r[c])) },
    ]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `argus_payroll_${safeName(cycle)}.xlsx`);
  }));

  // =================================================================== ORGANIZATION
  router.get('/organizations/public/list', wrap(async (req) => {
    // only the signed-in person's own organisation is listed (companies stay private to each other)
    let ctx = null;
    try { ctx = await authenticate(req); } catch (_e) { return []; }
    const org = await getOrg(ctx);
    return [{ id: org.id, name: org.name, slug: org.slug }];
  }));
  router.get('/organizations/my-org', wrap(async (req) => getOrg(requireAdmin(await authenticate(req)), true)));
  router.get('/organizations/my-org/logo', wrap(async (req) => {
    const org = await getOrg(requireAdmin(await authenticate(req)), true);
    return { status: 'success', logo_url: org.logo_url };
  }));
  router.post('/organizations/my-org/logo', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const b = req.body || {};
    const logo = b.logo || b.logo_url;
    if (!logo) fail(400, 'Logo data or image URL is required.');
    if (typeof logo !== 'string' || logo.length > 3 * 1024 * 1024) fail(400, 'The logo is too large. Please use an image under 2 MB.');
    await store.saveSettings(ctx.orgId, { logo_url: logo });
    await store.audit(ctx, 'UPLOAD_ORG_LOGO', 'Organization', ctx.orgId, { has_logo: true });
    return { status: 'success', logo_url: logo, message: 'Organization logo uploaded and saved successfully.' };
  }));
  router.delete('/organizations/my-org/logo', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    await store.saveSettings(ctx.orgId, { logo_url: null });
    await store.audit(ctx, 'REMOVE_ORG_LOGO', 'Organization', ctx.orgId, { has_logo: false });
    return { status: 'success', message: 'Organization logo removed successfully.' };
  }));
  function geofencePatch(g, profile) {
    const patch = {};
    if (!g || typeof g !== 'object') return patch;
    if ('is_enabled' in g) patch.geofence_enabled = !!g.is_enabled;
    if ('latitude' in g) patch.geofence_latitude = numOrNull(g.latitude);
    if ('longitude' in g) patch.geofence_longitude = numOrNull(g.longitude);
    if ('radius_meters' in g) patch.geofence_radius_meters = Math.trunc(num(g.radius_meters, 150));
    if ('strict_enforcement' in g) profile.strict_enforcement = !!g.strict_enforcement;
    if ('office_name' in g) profile.office_name = g.office_name ? String(g.office_name).trim() : 'Headquarters';
    return patch;
  }
  router.put('/organizations/my-org/settings', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const b = req.body || {};
    const cur = (await store.getSettings(ctx.orgId)) || {};
    const profile = { ...(cur.org_profile || {}) };
    const upd = {};
    const patch = {};
    for (const f of ['name', 'work_hours', 'gstin', 'industry', 'phone', 'website', 'address', 'logo_url', 'geofence']) if (f in b) upd[f] = b[f];
    for (const f of ['name', 'gstin', 'industry', 'phone', 'website', 'address']) if (f in upd) profile[f] = upd[f];
    if ('logo_url' in upd) patch.logo_url = upd.logo_url || null;
    const wh = upd.work_hours;
    if (wh && typeof wh === 'object') {
      if (wh.start_time) patch.work_start_time = String(wh.start_time);
      if (wh.end_time) patch.work_end_time = String(wh.end_time);
      if (wh.late_grace_minutes != null) patch.late_grace_minutes = Math.trunc(num(wh.late_grace_minutes, 15));
      if (wh.half_day_hours != null) patch.half_day_hours = num(wh.half_day_hours, 4.5);
    }
    Object.assign(patch, geofencePatch(upd.geofence, profile));
    patch.org_profile = profile;
    await store.saveSettings(ctx.orgId, patch);
    const auditUp = { ...upd }; if (auditUp.logo_url) auditUp.logo_url = '(image)';
    await store.audit(ctx, 'UPDATE_ORG_SETTINGS', 'Organization', ctx.orgId, auditUp);
    return { status: 'success', message: 'Organization settings updated successfully.' };
  }));
  router.get('/organizations/my-org/geofence', wrap(async (req) => (await getOrg(requireAdmin(await authenticate(req)))).geofence));
  router.put('/organizations/my-org/geofence', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const b = req.body || {};
    const g = {
      is_enabled: !!(b.is_enabled === undefined ? false : b.is_enabled), latitude: num(b.latitude === undefined ? 13.0827 : b.latitude, 13.0827),
      longitude: num(b.longitude === undefined ? 80.2707 : b.longitude, 80.2707), radius_meters: Math.trunc(num(b.radius_meters === undefined ? 150 : b.radius_meters, 150)),
      strict_enforcement: !!b.strict_enforcement, office_name: String(b.office_name || 'Headquarters').trim(),
    };
    const cur = (await store.getSettings(ctx.orgId)) || {};
    const profile = { ...(cur.org_profile || {}) };
    const patch = geofencePatch(g, profile);
    patch.org_profile = profile;
    await store.saveSettings(ctx.orgId, patch);
    await store.audit(ctx, 'UPDATE_GEOFENCE_CONFIG', 'Organization', ctx.orgId, g);
    return { status: 'success', geofence: g, message: 'Geofence perimeter updated successfully.' };
  }));
  router.get('/organizations/audit-logs', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    return (await store.auditList(ctx.orgId)).map((a) => ({ id: a.id, organization_id: a.company_id, action: a.action, actor_name: (a.details || {}).actor_name || a.actor_email,
      actor_role: (a.details || {}).actor_role || null, target_resource: (a.details || {}).target_resource || null, target_id: (a.details || {}).target_id || a.employee_id || null, details: a.details || {}, timestamp: a.created_at }));
  }));
  router.get('/organizations/client-sites', wrap(async (req) => {
    const ctx = await authenticate(req);
    return sortBy((await store.list('client_sites', ctx.orgId)).filter((s) => s.is_active !== false), 'created_at', true);
  }));
  router.post('/organizations/client-sites', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const b = req.body || {};
    need(b, ['site_name', 'client_name', 'address', 'latitude', 'longitude']);
    const lat = optNum(b, 'latitude'), lon = optNum(b, 'longitude');
    const site = {
      id: crypto.randomUUID(), site_name: String(b.site_name).trim(), client_name: String(b.client_name).trim(), address: String(b.address).trim(),
      latitude: lat, longitude: lon, radius_meters: Math.trunc(num(b.radius_meters, 0) || 150),
      contact_person: b.contact_person === undefined ? null : b.contact_person, contact_phone: b.contact_phone === undefined ? null : b.contact_phone,
      is_active: true, created_at: new Date().toISOString(),
    };
    return store.insert('client_sites', ctx.orgId, site);
  }));
  router.delete('/organizations/client-sites/:id', wrap(async (req) => {
    const ctx = requireAdmin(await authenticate(req));
    const site = await store.get('client_sites', ctx.orgId, req.params.id);
    if (site) await store.update('client_sites', ctx.orgId, site.id, { is_active: false });
    return { status: 'success', message: 'Client site removed successfully.' };
  }));

  router.use((req, res) => res.status(404).json({ detail: 'Not Found' }));
  app.use('/api/attendance/v1', router);
  console.log('[Attendance v1] Mounted on /api/attendance/v1/*');
};

// exposed for tests
module.exports._internals = { reconcileStatus, punchesTotalHours, numberToIndianWords, findBestMatch, xlsxOf, csvOf, parseIso };
