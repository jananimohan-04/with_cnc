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
}

async function buildBrandedDocument(input: BrandedDocumentInput) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
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
