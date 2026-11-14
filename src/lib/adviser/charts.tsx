// Graphs and PDF reports from the Adviser chat. The AI adds chart blocks at the END of its answer:
//   [[CHART {"title":"...","type":"bar|line|pie","labels":["Jun","Jul"],"series":[{"name":"Billed","values":[120000,98000]}],"unit":"₹"}]]
//   [[PDF {"title":"Sales report"}]]
// The chat shows the text before the first "[[" (and reads only that aloud), draws the charts, and can save everything as a PDF.

import { jsPDF } from 'jspdf';

export interface ChartSpec {
  title: string;
  type: 'bar' | 'line' | 'pie';
  labels: string[];
  series: { name: string; values: number[] }[];
  unit?: string;
}
export interface EmailBlock { to: string; cc: string; subject: string; body: string }
export interface Blocks { visible: string; charts: ChartSpec[]; pdf: { title: string } | null; emails: EmailBlock[] }

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

/** Splits an answer into the readable text and its chart / PDF blocks (blocks still streaming are simply not shown yet). */
export function parseBlocks(text: string): Blocks {
  const cut = text.indexOf('[[');
  const visible = (cut >= 0 ? text.slice(0, cut) : text).trim();
  const charts: ChartSpec[] = [];
  let pdf: Blocks['pdf'] = null;
  const emails: EmailBlock[] = [];
  const re = /\[\[\s*(CHART|PDF|EMAIL)\s*(\{[\s\S]*?\})\s*\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    try {
      const j = JSON.parse(m[2]);
      if (m[1] === 'PDF') { pdf = { title: String(j.title || 'Report') }; continue; }
      if (m[1] === 'EMAIL') { emails.push({ to: String(j.to ?? ''), cc: String(j.cc ?? ''), subject: String(j.subject ?? ''), body: String(j.body ?? '') }); continue; }
      const labels = Array.isArray(j.labels) ? j.labels.map(String).slice(0, 24) : [];
      const series = (Array.isArray(j.series) ? j.series : []).slice(0, 6).map((s: { name?: unknown; values?: unknown[] }) => ({
        name: String(s?.name ?? ''),
        values: (Array.isArray(s?.values) ? s.values : []).slice(0, labels.length).map((v) => Number(v) || 0),
      })).filter((s: { values: number[] }) => s.values.length);
      if (!labels.length || !series.length) continue;
      const type = j.type === 'line' || j.type === 'pie' ? j.type : 'bar';
      charts.push({ title: String(j.title || 'Chart'), type, labels, series, unit: j.unit ? String(j.unit) : undefined });
    } catch { /* a broken block is skipped */ }
  }
  return { visible, charts, pdf, emails };
}

/** The part of a streaming answer that may be read aloud (never the chart data). */
export const speakablePart = (text: string) => { const i = text.indexOf('[['); return i >= 0 ? text.slice(0, i) : text; };

const short = (n: number, unit?: string) => {
  const a = Math.abs(n);
  const s = a >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : a >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n * 10) / 10}`;
  return unit === '₹' ? `₹${s}` : unit ? `${s} ${unit}` : s;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** The chart as an SVG string (used for the screen and, drawn to an image, for the PDF). */
export function chartSvg(c: ChartSpec, W = 560, H = 300): string {
  const font = `font-family="Segoe UI, Noto Sans Tamil, Arial, sans-serif"`;
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${W / 2}" y="20" text-anchor="middle" font-size="14" font-weight="700" fill="#0f172a" ${font}>${esc(c.title)}</text>`];
  if (c.type === 'pie') {
    const vals = c.series[0].values.map((v) => Math.max(0, v));
    const total = vals.reduce((a, v) => a + v, 0) || 1;
    const cx = 150, cy = H / 2 + 12, r = Math.min(110, H / 2 - 30);
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
      out.push(vals.length === 1 || v === total
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${COLORS[i % COLORS.length]}"/>`
        : `<path d="M${cx},${cy} L${p(a0)} A${r},${r} 0 ${large} 1 ${p(a1)} Z" fill="${COLORS[i % COLORS.length]}" stroke="#fff" stroke-width="2"/>`);
      a0 = a1;
    });
    c.labels.forEach((l, i) => {
      const y = 50 + i * 20;
      if (y > H - 10) return;
      out.push(`<rect x="300" y="${y - 10}" width="12" height="12" rx="2" fill="${COLORS[i % COLORS.length]}"/>`,
        `<text x="318" y="${y}" font-size="11" fill="#334155" ${font}>${esc(l)}: ${esc(short(vals[i] ?? 0, c.unit))} (${Math.round(((vals[i] ?? 0) / total) * 100)}%)</text>`);
    });
  } else {
    const L = 58, R = 12, T = 34, B = 54;
    const pw = W - L - R, ph = H - T - B;
    const all = c.series.flatMap((s) => s.values);
    const max = Math.max(1, ...all), min = Math.min(0, ...all);
    const y = (v: number) => T + ph - ((v - min) / (max - min || 1)) * ph;
    for (let g = 0; g <= 4; g++) {
      const v = min + ((max - min) * g) / 4;
      out.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#e2e8f0"/>`,
        `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#64748b" ${font}>${esc(short(v, c.unit))}</text>`);
    }
    const n = c.labels.length, slot = pw / n;
    c.labels.forEach((l, i) => out.push(`<text x="${L + slot * i + slot / 2}" y="${T + ph + 16}" text-anchor="middle" font-size="10" fill="#334155" ${font}>${esc(l.length > 12 ? `${l.slice(0, 11)}…` : l)}</text>`));
    if (c.type === 'bar') {
      const k = c.series.length, bw = Math.max(4, (slot * 0.7) / k);
      c.series.forEach((s, si) => s.values.forEach((v, i) => {
        const x = L + slot * i + (slot - bw * k) / 2 + bw * si;
        out.push(`<rect x="${x}" y="${Math.min(y(v), y(0))}" width="${bw - 1}" height="${Math.abs(y(0) - y(v))}" rx="2" fill="${COLORS[si % COLORS.length]}"/>`);
        if (k === 1 && n <= 12) out.push(`<text x="${x + bw / 2}" y="${y(v) - 4}" text-anchor="middle" font-size="9" fill="#0f172a" ${font}>${esc(short(v, c.unit))}</text>`);
      }));
    } else {
      c.series.forEach((s, si) => {
        const pts = s.values.map((v, i) => `${L + slot * i + slot / 2},${y(v)}`).join(' ');
        out.push(`<polyline points="${pts}" fill="none" stroke="${COLORS[si % COLORS.length]}" stroke-width="2.5"/>`);
        s.values.forEach((v, i) => out.push(`<circle cx="${L + slot * i + slot / 2}" cy="${y(v)}" r="3.5" fill="${COLORS[si % COLORS.length]}"/>`));
      });
    }
    // legend
    c.series.forEach((s, si) => out.push(`<rect x="${L + si * 130}" y="${H - 18}" width="12" height="12" rx="2" fill="${COLORS[si % COLORS.length]}"/>`,
      `<text x="${L + si * 130 + 16}" y="${H - 8}" font-size="11" fill="#334155" ${font}>${esc(s.name || `Series ${si + 1}`)}</text>`));
  }
  out.push('</svg>');
  return out.join('');
}

export function ChartView({ chart }: { chart: ChartSpec }) {
  return <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white" dangerouslySetInnerHTML={{ __html: chartSvg(chart).replace('<svg ', '<svg style="width:100%;height:auto;display:block" ') }} />;
}

function svgToPng(svg: string, W: number, H: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = W * 2; cv.height = H * 2;
      const ctx = cv.getContext('2d')!;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, W, H);
      resolve(cv.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Text drawn on a canvas (so Tamil and every other script prints correctly), as image slices that fit the page. */
function textImages(text: string, widthPx: number): { url: string; h: number }[] {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d')!;
  const font = '15px "Segoe UI", "Noto Sans Tamil", "Latha", Arial, sans-serif';
  ctx.font = font;
  const lines: string[] = [];
  for (const para of text.split(/\n/)) {
    if (!para.trim()) { lines.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > widthPx && line) { lines.push(line); line = word; } else line = test;
    }
    lines.push(line);
  }
  const LH = 22, perSlice = 40, out: { url: string; h: number }[] = [];
  for (let i = 0; i < lines.length; i += perSlice) {
    const part = lines.slice(i, i + perSlice);
    cv.width = widthPx * 2; cv.height = part.length * LH * 2;
    const c = cv.getContext('2d')!;
    c.scale(2, 2);
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, widthPx, part.length * LH);
    c.fillStyle = '#1e293b'; c.font = font; c.textBaseline = 'top';
    part.forEach((l, k) => c.fillText(l, 0, k * LH + 3));
    out.push({ url: cv.toDataURL('image/jpeg', 0.9), h: part.length * LH });
  }
  return out;
}

/** Saves the answer and its charts as a PDF file. */
export async function saveReportPdf(title: string, text: string, charts: ChartSpec[], company = '') {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const PW = 210, M = 14, CW = PW - M * 2;
  let y = M;
  doc.setFillColor(17, 28, 51); doc.rect(0, 0, PW, 24, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(title.replace(/[^\x20-\x7E]/g, '').trim() || 'Report', M, 11);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`${company ? `${company.replace(/[^\x20-\x7E]/g, '')} · ` : ''}Argus Business Intelligence · ${new Date().toLocaleString('en-IN')}`, M, 18);
  y = 32;
  const room = (h: number) => { if (y + h > 285) { doc.addPage(); y = M; } };
  const pxW = 680;   // canvas width for text (mm -> px ratio = pxW / CW)
  for (const t of text.trim() ? textImages(text.trim(), pxW) : []) {
    const h = (t.h / pxW) * CW;
    room(h);
    doc.addImage(t.url, 'JPEG', M, y, CW, h);
    y += h + 2;
  }
  for (const c of charts) {
    const W = 680, H = 340;
    const png = await svgToPng(chartSvg(c, W, H), W, H);
    const h = (H / W) * CW;
    room(h + 4);
    y += 4;
    doc.setDrawColor(226, 232, 240); doc.roundedRect(M - 1, y - 1, CW + 2, h + 2, 2, 2);
    doc.addImage(png, 'JPEG', M, y, CW, h);
    y += h + 4;
  }
  doc.save(`${(title || 'Report').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Report'}.pdf`);
}
