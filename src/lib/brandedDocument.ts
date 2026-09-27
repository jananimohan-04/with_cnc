import { formatDate } from '@/lib/format';

export interface BrandedDocumentInput {
  companyName: string;
  title: string;
  documentNo: string;
  date: string | null | undefined;
  details: [string, string | number | null | undefined][];
  columns: string[];
  rows: (string | number)[][];
  totals?: [string, string][];
  /** Right-hand info block rendered next to `details` (premium layout only). */
  details2?: [string, string | number | null | undefined][];
  /** Remarks / notes section (premium layout only). */
  remarks?: string | null | undefined;
  /** Signature labels rendered as a footer row (premium layout only). */
  signatures?: string[];
  /** Premium industrial styling (navy + orange, header/footer, signatures). Omit for the classic look. */
  premium?: boolean;
}

async function buildBrandedDocument(input: BrandedDocumentInput) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  if (input.premium) {
    return buildPremiumDocument(doc, autoTable, input, pageWidth);
  }
  let y = 15;

  try {
    const response = await fetch('/arguscnc-logo.jpg');
    if (response.ok) {
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      doc.addImage(dataUrl, 'JPEG', 14, 12, 42, 18);
    }
  } catch {
    // The company name and document remain printable when the optional logo is unavailable.
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(input.companyName || 'ARGUS CNC', 62, 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(input.title, 62, 27);
  doc.text(`Document No: ${input.documentNo || '—'}`, 62, 33);
  doc.text(`Date: ${formatDate(input.date) || '—'}`, pageWidth - 14, 33, { align: 'right' });
  doc.setDrawColor(220, 226, 235);
  doc.line(14, 38, pageWidth - 14, 38);

  autoTable(doc, {
    startY: 43,
    body: input.details.map(([label, value]) => [label, String(value ?? '—')]),
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 } },
    margin: { left: 14, right: 14 },
  });
  const afterDetails = (doc as any).lastAutoTable?.finalY ?? 60;
  autoTable(doc, {
    startY: afterDetails + 5,
    head: [input.columns],
    body: input.rows,
    theme: 'grid',
    headStyles: { fillColor: [31, 52, 77], textColor: 255, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2.5 },
    margin: { left: 14, right: 14 },
  });

  let bottom = (doc as any).lastAutoTable?.finalY ?? afterDetails + 10;
  for (const [label, value] of input.totals ?? []) {
    bottom += 7;
    doc.setFont('helvetica', label === 'Total' ? 'bold' : 'normal');
    doc.text(label, pageWidth - 68, bottom);
    doc.text(value, pageWidth - 14, bottom, { align: 'right' });
  }
  return doc;
}

async function buildPremiumDocument(
  doc: any,
  autoTable: any,
  input: BrandedDocumentInput,
  pageWidth: number,
) {
  const NAVY: [number, number, number] = [30, 58, 95];
  const ORANGE: [number, number, number] = [234, 88, 12];
  const GREY: [number, number, number] = [100, 116, 139];
  const LIGHT: [number, number, number] = [248, 250, 252];
  const ML = 14;
  const MR = 14;
  const contentW = pageWidth - ML - MR;
  const val = (v: string | number | null | undefined) => String(v ?? '').trim() || '—';

  // Header band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 36, 'F');
  try {
    const response = await fetch('/arguscnc-logo.jpg');
    if (response.ok) {
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      doc.addImage(dataUrl, 'JPEG', ML, 8, 40, 17);
    }
  } catch {
    // Header text below keeps the document printable without the logo.
  }
  const tx = 60;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(input.companyName || 'ARGUS CNC', tx, 15);
  doc.setTextColor(251, 146, 60);
  doc.setFontSize(12);
  doc.text(String(input.title || '').toUpperCase(), tx, 23);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Document No: ${input.documentNo || '—'}`, tx, 29.5);
  doc.text(`Date: ${formatDate(input.date) || '—'}`, pageWidth - MR, 29.5, { align: 'right' });

  let y = 42;
  // Info blocks side by side
  const colW = (contentW - 6) / 2;
  const infoOpts = {
    theme: 'plain' as const,
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold' as const, textColor: GREY, cellWidth: 34 } },
  };
  autoTable(doc, {
    startY: y,
    body: input.details.map(([label, value]) => [label, val(value)]),
    tableWidth: colW,
    margin: { left: ML },
    ...infoOpts,
  });
  const leftEnd = (doc as any).lastAutoTable?.finalY ?? y;
  if (input.details2?.length) {
    autoTable(doc, {
      startY: y,
      body: input.details2.map(([label, value]) => [label, val(value)]),
      tableWidth: colW,
      margin: { left: ML + colW + 6 },
      ...infoOpts,
    });
  }
  const rightEnd = (doc as any).lastAutoTable?.finalY ?? y;
  y = Math.max(leftEnd, rightEnd) + 4;

  // Items table (autoTable paginates automatically)
  autoTable(doc, {
    startY: y,
    head: [input.columns],
    body: input.rows,
    theme: 'grid',
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: LIGHT },
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 20, halign: 'center' },
    },
    margin: { left: ML, right: MR },
  });
  y = (doc as any).lastAutoTable?.finalY ?? y + 10;

  const ensureSpace = (needed: number) => {
    if (y + needed > 258) {
      doc.addPage();
      y = 20;
    }
  };

  // Delivery summary box
  if (input.totals?.length) {
    ensureSpace(30);
    const boxW = 82;
    autoTable(doc, {
      startY: y + 2,
      head: [['DELIVERY SUMMARY', '']],
      body: input.totals.map(([label, value]) => [label, value]),
      tableWidth: boxW,
      margin: { left: pageWidth - MR - boxW },
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9, fontStyle: 'bold', halign: 'center' },
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: {
        0: { textColor: GREY },
        1: { halign: 'right', fontStyle: 'bold', textColor: NAVY },
      },
    });
    y = (doc as any).lastAutoTable?.finalY ?? y + 20;
  }

  // Declaration
  ensureSpace(24);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text('Declaration:', ML, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  const declLines: string[] = doc.splitTextToSize('Goods mentioned above have been delivered in good condition.', contentW);
  doc.text(declLines, ML, y);
  y += declLines.length * 5 + 6;

  // Signatures
  ensureSpace(56);
  const sigW = (contentW - 12) / 3;
  doc.setFontSize(9);
  (input.signatures?.length ? input.signatures : ['Prepared By', 'Checked By', 'Received By']).forEach((label, i) => {
    const x = ML + i * (sigW + 6);
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.4);
    doc.line(x, y + 12, x + sigW, y + 12);
    doc.setTextColor(...GREY);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x, y + 18);
  });
  y += 30;
  const sigW2 = (contentW - 6) / 2;
  const sigRow2: Array<[string, number]> = [
    ['Customer Signature', ML],
    [`For ${input.companyName || 'the Company'} — Authorized Signatory`, ML + sigW2 + 6],
  ];
  sigRow2.forEach(([label, x]) => {
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.4);
    doc.line(x, y + 12, x + sigW2, y + 12);
    doc.setTextColor(...GREY);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x, y + 18);
  });

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(`Generated by ${input.companyName || 'Argus ERP'}`, ML, 288);
    doc.text(`Page ${i} of ${pages}`, pageWidth - MR, 288, { align: 'right' });
  }
  return doc;
}

export async function downloadBrandedDocument(input: BrandedDocumentInput) {
  const doc = await buildBrandedDocument(input);
  doc.save(`${input.documentNo || input.title.replace(/\s+/g, '_')}.pdf`);
}

export async function viewBrandedDocument(input: BrandedDocumentInput) {
  const tab = window.open('', '_blank');
  if (!tab) throw new Error('Allow pop-ups to preview the PDF.');
  try {
    const doc = await buildBrandedDocument(input);
    const url = URL.createObjectURL(doc.output('blob'));
    tab.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab.close();
    throw error;
  }
}

// -------------------------------------------------------------------------------------
// Product costing / final pricing document (multi-section premium A4).
// Same navy/orange theme and logo handling as the premium builder above.
// Amounts arrive pre-formatted as strings (core PDF fonts lack the ₹ glyph).
// -------------------------------------------------------------------------------------

export interface CostingDocumentInput {
  companyName: string;
  documentNo: string;
  date: string | null | undefined;
  infoLeft: [string, string][];
  infoRight: [string, string][];
  /** Single quotation detail row: [no, customer, product, qty, unit price, discount, tax, total]. */
  quotationRow: string[];
  materials: { code: string; name: string; qty: string; unit: string; rate: string; total: string }[];
  ops: { op: string; machine: string; mHours: string; mRate: string; mCost: string; operator: string; lHours: string; lRate: string; lCost: string }[];
  processes: { seq: string; process: string; machine: string; cycle: string; setup: string; rate: string; comp: string; cost: string }[];
  summary: [string, string][];
  approval: [string, string][];
  signatures?: string[];
}

async function loadLogo(doc: any, x: number, y: number, w: number, h: number) {
  try {
    const response = await fetch('/arguscnc-logo.jpg');
    if (!response.ok) return;
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    doc.addImage(dataUrl, 'JPEG', x, y, w, h);
  } catch {
    // Document stays printable without the logo.
  }
}

async function buildCostingDocument(input: CostingDocumentInput) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const NAVY: [number, number, number] = [30, 58, 95];
  const GREY: [number, number, number] = [100, 116, 139];
  const LIGHT: [number, number, number] = [248, 250, 252];
  const INK: [number, number, number] = [30, 41, 59];
  const ML = 14;
  const MR = 14;
  const contentW = pageWidth - ML - MR;
  const val = (v: string | number | null | undefined) => String(v ?? '').trim() || '—';

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageWidth, 36, 'F');
  await loadLogo(doc, ML, 8, 40, 17);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(input.companyName || 'ARGUS CNC', 60, 15);
  doc.setTextColor(251, 146, 60);
  doc.setFontSize(12);
  doc.text('PRODUCT COSTING / FINAL PRICING', 60, 23);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Document No: ${input.documentNo || '—'}`, 60, 29.5);
  doc.text(`Date: ${input.date ? formatDate(input.date) : '—'}`, pageWidth - MR, 29.5, { align: 'right' });

  let y = 42;
  const colW = (contentW - 6) / 2;
  const infoOpts = {
    theme: 'plain' as const,
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold' as const, textColor: GREY, cellWidth: 34 } },
  };
  autoTable(doc, {
    startY: y, body: input.infoLeft.map(([l, v]) => [l, val(v)]),
    tableWidth: colW, margin: { left: ML }, ...infoOpts,
  });
  const leftEnd = (doc as any).lastAutoTable?.finalY ?? y;
  autoTable(doc, {
    startY: y, body: input.infoRight.map(([l, v]) => [l, val(v)]),
    tableWidth: colW, margin: { left: ML + colW + 6 }, ...infoOpts,
  });
  y = Math.max(leftEnd, (doc as any).lastAutoTable?.finalY ?? y) + 4;

  const ensureSpace = (needed: number) => {
    if (y + needed > 258) {
      doc.addPage();
      y = 20;
    }
  };
  const section = (title: string, head: string[], body: string[][], columnStyles?: Record<number, any>) => {
    ensureSpace(30);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text(title, ML, y);
    y += 2;
    autoTable(doc, {
      startY: y, head: [head], body,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: LIGHT },
      styles: { fontSize: 8, cellPadding: 2, textColor: INK },
      columnStyles,
      margin: { left: ML, right: MR },
    });
    y = (doc as any).lastAutoTable?.finalY ?? y + 10;
  };
  const R = { halign: 'right' as const };
  const C = { halign: 'center' as const };

  section('1. Quotation Details', ['Quotation No', 'Customer', 'Product', 'Qty', 'Unit Price', 'Discount', 'Tax', 'Quoted Total'],
    [input.quotationRow.map(val)], { 0: C, 3: R, 4: R, 5: R, 6: R, 7: R });
  section('2. Material Cost',
    ['Code', 'Material', 'Req. Qty', 'Unit', 'Unit Cost', 'Total'],
    input.materials.map(m => [m.code, m.name, m.qty, m.unit, m.rate, m.total]),
    { 2: R, 4: R, 5: R });
  section('3. Machine & Labour Cost',
    ['Operation', 'Machine', 'Mc Hrs', 'Mc Rate', 'Mc Cost', 'Operator', 'Lab Hrs', 'Lab Rate', 'Lab Cost'],
    input.ops.map(o => [o.op, o.machine, o.mHours, o.mRate, o.mCost, o.operator, o.lHours, o.lRate, o.lCost]),
    { 2: R, 3: R, 4: R, 6: R, 7: R, 8: R });
  section('4. Process Costing',
    ['Seq', 'Process', 'Machine', 'Cycle', 'Setup', 'Cost/Hour', 'Comp. Cost', 'Process Cost'],
    input.processes.map(p => [p.seq, p.process, p.machine, p.cycle, p.setup, p.rate, p.comp, p.cost]),
    { 0: C, 3: R, 4: R, 5: R, 6: R, 7: R });
  section('5. Final Price Summary', ['Component', 'Amount'],
    input.summary.map(([l, v]) => [l, v]), { 1: R });

  if (input.approval.length) {
    section('6. Approval Details', ['Field', 'Value'],
      input.approval.map(([l, v]) => [l, val(v)]), {});
  }

  ensureSpace(56);
  const sigW = (contentW - 12) / 3;
  doc.setFontSize(9);
  (input.signatures?.length ? input.signatures : ['Prepared By', 'Checked By', 'Approved By']).forEach((label, i) => {
    const x = ML + i * (sigW + 6);
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.4);
    doc.line(x, y + 12, x + sigW, y + 12);
    doc.setTextColor(...GREY);
    doc.setFont('helvetica', 'normal');
    doc.text(`${label} / Date / Signature`, x, y + 18);
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(`Generated by ${input.companyName || 'Argus ERP'}`, ML, 288);
    doc.text(`Page ${i} of ${pages}`, pageWidth - MR, 288, { align: 'right' });
  }
  return doc;
}

export async function downloadCostingDocument(input: CostingDocumentInput) {
  const doc = await buildCostingDocument(input);
  doc.save(`${input.documentNo || 'costing'}.pdf`);
}

export async function viewCostingDocument(input: CostingDocumentInput) {
  const tab = window.open('', '_blank');
  if (!tab) throw new Error('Allow pop-ups to preview the PDF.');
  try {
    const doc = await buildCostingDocument(input);
    const url = URL.createObjectURL(doc.output('blob'));
    tab.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab.close();
    throw error;
  }
}
