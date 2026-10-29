/* Professional B2B Commercial Quotation & Tax Invoice Template Generator
   Produces print-ready, high-resolution A4 documents with embedded ARGUS CNC logo,
   legal GST compliance (CGST/SGST/IGST breakdown), HSN codes, and bank wire details. */

import QRCode from 'qrcode';
import { ARGUS_LOGO_BASE64 } from './logoBase64';

export async function generateUpiQrCode(upiId, payeeName, amount, docNo) {
  if (!upiId) return null;
  const cleanUpi = String(upiId).trim();
  if (!cleanUpi) return null;
  const numAmount = Number(amount || 0).toFixed(2);
  const upiUri = `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent((payeeName || 'ARGUS CNC').trim())}&am=${numAmount}&cu=INR&tn=${encodeURIComponent((docNo || 'Payment').trim())}`;
  try {
    return await QRCode.toDataURL(upiUri, {
      width: 160,
      margin: 1,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });
  } catch (err) {
    console.warn('QR code generation failed:', err);
    return null;
  }
}

export async function fetchCompanyInvoiceProfile(companyId) {
  try {
    const url = companyId ? `/api/settings/invoice-profile?companyId=${encodeURIComponent(companyId)}` : '/api/settings/invoice-profile';
    const res = await fetch(url, { credentials: 'include' });
    if (res.ok) {
      const json = await res.json();
      const data = json?.data || json;
      if (data && (data.companyName || data.name)) {
        return data;
      }
    }
  } catch (e) {
    // network or auth error, fallback to default
  }
  return null;
}

export function numberToWordsIndian(num) {
  num = Math.round(Number(num) || 0);
  if (num === 0) return 'Zero Rupees Only';

  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n) {
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit ? ' ' + a[digit] : ' ');
  }

  let words = '';
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = Math.floor(num / 100);
  const rem = num % 100;

  if (crore > 0) words += inWords(crore) + 'Crore ';
  if (lakh > 0) words += inWords(lakh) + 'Lakh ';
  if (thousand > 0) words += inWords(thousand) + 'Thousand ';
  if (hundred > 0) words += inWords(hundred) + 'Hundred ';
  if (rem > 0) words += (words !== '' ? 'and ' : '') + inWords(rem);

  return 'Indian Rupees ' + words.trim() + ' Only';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTermsList(termsStr, defaultTerms) {
  if (!termsStr || !String(termsStr).trim()) {
    return defaultTerms.map(t => `<li>${t}</li>`).join('');
  }
  const items = String(termsStr)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.replace(/^[-*•\d.]+\s*/, ''));
  if (items.length === 0) {
    return defaultTerms.map(t => `<li>${t}</li>`).join('');
  }
  return items.map(t => `<li>${escapeHtml(t)}</li>`).join('');
}

const DEFAULT_COMPANY = {
  name: 'ARGUS CNC TECHNOLOGIES PVT. LTD.',
  companyName: 'ARGUS CNC TECHNOLOGIES PVT. LTD.',
  tagline: 'High-Precision CNC Machine Tools & Connected Factory Automation',
  regAddress: 'Plot 18, Sector 10, MIDC Industrial Area, Bhosari, Pune, Maharashtra - 411026',
  city: 'Pune',
  state: 'Maharashtra',
  stateCode: '27 (Maharashtra)',
  pin: '411026',
  gstin: '27AAACA1234A1Z5',
  pan: 'AAACA1234A',
  cin: 'U29253PN2021PTC198765',
  email: 'technologiesargus@gmail.com',
  phone: '+91 98765 43210',
  bankName: 'HDFC Bank Ltd.',
  accName: 'ARGUS CNC TECHNOLOGIES PVT LTD',
  accNo: '50200067891234',
  ifsc: 'HDFC0001234',
  branch: 'MIDC Bhosari Branch, Pune',
  upiId: 'arguscnc@hdfcbank',
  qrMode: 'dynamic',
  customQrImage: '',
  signatureImage: '',
  signatoryName: 'Sanjay Deshmukh',
  signatoryDesignation: 'Director of Industrial Operations',
  quotationTerms: '',
  invoiceTerms: ''
};

/* -------------------------------------------------------------
   1. COMMERCIAL PROFORMA QUOTATION TEMPLATE
   ------------------------------------------------------------- */
export async function generateQuotationHtml({
  quoteNo,
  date,
  validUntil,
  company = {},
  customer = {},
  items = [],
  notes = ''
}) {
  let co = { ...DEFAULT_COMPANY, ...company };
  if (!company || Object.keys(company).length === 0 || !company.gstin) {
    const remote = await fetchCompanyInvoiceProfile(company?.companyId || company?.id);
    if (remote) {
      co = {
        ...DEFAULT_COMPANY,
        ...remote,
        name: remote.companyName || remote.name || DEFAULT_COMPANY.name,
        companyName: remote.companyName || remote.name || DEFAULT_COMPANY.companyName,
        ...company
      };
    }
  }
  co.name = co.name || co.companyName || DEFAULT_COMPANY.name;
  co.companyName = co.companyName || co.name || DEFAULT_COMPANY.companyName;
  const logoSrc = co.logo || ARGUS_LOGO_BASE64;

  const qDate = date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const qExpiry = validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const qNumber = quoteNo || `QT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

  let subtotal = 0;
  const rowsHtml = items.map((it, idx) => {
    const qty = Number(it.qty) || 1;
    const rate = Number(it.price) || 0;
    const amount = qty * rate;
    subtotal += amount;
    const hsn = it.hsn || it.hsnCode || '8466.93.90';

    return `
      <tr>
        <td style="text-align:center;font-weight:600">${idx + 1}</td>
        <td>
          <div style="font-weight:700;color:#1A0A03;font-size:12px">${escapeHtml(it.name || 'Industrial Component')}</div>
          <div style="font-size:10.5px;color:#64748B;font-family:monospace">SKU: ${escapeHtml(it.sku || it.pid || 'N/A')}${it.brand ? ` &bull; Brand: ${escapeHtml(it.brand)}` : ''}</div>
          ${it.desc ? `<div style="font-size:10px;color:#475569;margin-top:2px">${escapeHtml(it.desc)}</div>` : ''}
        </td>
        <td style="text-align:center;font-family:monospace;font-size:11px">${escapeHtml(hsn)}</td>
        <td style="text-align:center;font-weight:700">${qty}</td>
        <td style="text-align:center;font-size:11px">${escapeHtml(it.uom || 'Pc')}</td>
        <td style="text-align:right;font-family:monospace;font-weight:600">₹${rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="text-align:right;font-family:monospace;font-weight:700;color:#1A0A03">₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `;
  }).join('');

  const cgst = subtotal * 0.09;
  const sgst = subtotal * 0.09;
  const total = subtotal + cgst + sgst;
  const words = numberToWordsIndian(total);

  let qrDataUrl = null;
  let qrCaption = `Scan & Pay ₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (co.qrMode === 'custom' && co.customQrImage) {
    qrDataUrl = co.customQrImage;
    qrCaption = 'Scan to Pay (UPI Merchant)';
  } else if (co.upiId) {
    qrDataUrl = await generateUpiQrCode(co.upiId, co.accName || co.name, total, qNumber);
  }

  const defaultQuotationTerms = [
    '<b>Validity:</b> Prices quoted are firm and valid for 30 calendar days from the quotation date.',
    '<b>Payment Terms:</b> 100% against Proforma Invoice or as per mutually agreed B2B vendor credit terms.',
    '<b>Taxes:</b> Goods & Services Tax (GST) is charged extra as specified above as per statutory government regulations.',
    '<b>Delivery / Dispatch:</b> Ready stock items dispatched within 48 hours; custom items dispatched within 5-7 working days upon receipt of confirmed Purchase Order.',
    '<b>Warranty:</b> Standard 12-month manufacturer warranty against manufacturing defects.'
  ];
  const termsHtml = renderTermsList(co.quotationTerms, defaultQuotationTerms);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Proforma Quotation — ${escapeHtml(qNumber)}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm 10mm 10mm 10mm; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1E293B; background: #F8FAFC; line-height: 1.35; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print-bar { position: sticky; top: 0; z-index: 999; background: #2E1508; color: #FFFFFF; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .no-print-bar button { background: #E5A93C; color: #1A0A03; border: none; padding: 7px 16px; border-radius: 6px; font-weight: 700; font-size: 12px; cursor: pointer; }
    @media print { .no-print-bar { display: none !important; } body { background: #FFF; } }
    .sheet { max-width: 820px; margin: 16px auto; background: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 8px; padding: 24px 28px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2E1508; padding-bottom: 14px; margin-bottom: 14px; }
    .brand-col { max-width: 480px; }
    .logo-img { height: 46px; object-fit: contain; margin-bottom: 4px; display: block; }
    .co-name { font-size: 14px; font-weight: 900; color: #2E1508; letter-spacing: -0.2px; text-transform: uppercase; }
    .co-tag { font-size: 10px; color: #64748B; font-weight: 600; margin-bottom: 3px; }
    .co-addr { font-size: 9.5px; color: #475569; line-height: 1.3; }
    .doc-col { text-align: right; }
    .doc-type { font-size: 16px; font-weight: 900; color: #8F2A0E; letter-spacing: 0.5px; text-transform: uppercase; }
    .meta-table { font-size: 10px; margin-top: 4px; margin-left: auto; border-collapse: collapse; }
    .meta-table td { padding: 2px 6px; }
    .meta-table .lbl { color: #64748B; font-weight: 600; text-align: right; }
    .meta-table .val { font-weight: 700; color: #0F172A; text-align: left; }
    .client-box { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; background: #FAF6F1; border: 1px solid #DECDBE; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; }
    .box-title { font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #8F2A0E; letter-spacing: 0.5px; margin-bottom: 4px; }
    .client-name { font-size: 12.5px; font-weight: 800; color: #1A0A03; }
    .client-detail { font-size: 10px; color: #475569; margin-top: 2px; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px; }
    .items-table th { background: #2E1508; color: #FFFFFF; padding: 6px 8px; font-weight: 700; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.3px; border: 1px solid #2E1508; }
    .items-table td { padding: 6px 8px; border: 1px solid #E2E8F0; vertical-align: top; }
    .items-table tr:nth-child(even) td { background: #F8FAFC; }
    .calc-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; margin-bottom: 12px; }
    .words-box { background: #F1F5F9; border: 1px dashed #CBD5E1; border-radius: 6px; padding: 8px 12px; font-size: 10px; }
    .totals-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    .totals-table td { padding: 3px 6px; }
    .totals-table .t-lbl { color: #475569; }
    .totals-table .t-val { text-align: right; font-weight: 700; font-family: monospace; }
    .grand-total { border-top: 2px solid #2E1508; border-bottom: 2px solid #2E1508; }
    .grand-total td { padding: 6px 6px; font-size: 12px; font-weight: 900; color: #2E1508; }
    .terms-box { border: 1px solid #E2E8F0; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; font-size: 9.5px; background: #FFF; }
    .terms-list { list-style: decimal inside; color: #475569; margin-top: 4px; line-height: 1.4; }
    .footer-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; padding-top: 8px; border-top: 1px solid #E2E8F0; }
    .bank-box { font-size: 9.5px; color: #334155; line-height: 1.35; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 8px 12px; }
    .sig-col { text-align: right; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-end; }
    .sig-stamp { width: 120px; height: 50px; border: 1px dashed #CBD5E1; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #94A3B8; font-size: 9px; margin-bottom: 4px; font-style: italic; }
    .sig-label { font-size: 10px; font-weight: 700; color: #2E1508; }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div style="font-weight:700">📄 Official Proforma Quotation &bull; ${escapeHtml(qNumber)}</div>
    <div style="display:flex;gap:8px">
      <button onclick="window.print()">🖨️ Print / Save as PDF</button>
      <button style="background:transparent;color:#FFF;border:1px solid #8F6A52" onclick="window.close()">Close</button>
    </div>
  </div>

  <div class="sheet">
    <div class="header">
      <div class="brand-col">
        <img src="${logoSrc}" class="logo-img" alt="${escapeHtml(co.name)} Logo" />
        <div class="co-name">${escapeHtml(co.name)}</div>
        <div class="co-tag">${escapeHtml(co.tagline)}</div>
        <div class="co-addr">
          ${escapeHtml(co.regAddress)}${co.city ? `, ${escapeHtml(co.city)}` : ''}${co.pin ? ` - ${escapeHtml(co.pin)}` : ''}<br />
          <b>GSTIN:</b> ${escapeHtml(co.gstin)} &bull; <b>PAN:</b> ${escapeHtml(co.pan)} &bull; <b>State:</b> ${escapeHtml(co.stateCode)}<br />
          <b>Email:</b> ${escapeHtml(co.email)} &bull; <b>Phone:</b> ${escapeHtml(co.phone)}
        </div>
      </div>
      <div class="doc-col">
        <div class="doc-type">PROFORMA QUOTATION</div>
        <table class="meta-table">
          <tr><td class="lbl">Quotation No:</td><td class="val" style="color:#8F2A0E">${escapeHtml(qNumber)}</td></tr>
          <tr><td class="lbl">Date:</td><td class="val">${escapeHtml(qDate)}</td></tr>
          <tr><td class="lbl">Valid Until:</td><td class="val">${escapeHtml(qExpiry)}</td></tr>
          <tr><td class="lbl">Payment Terms:</td><td class="val">Advance / Net 30</td></tr>
        </table>
      </div>
    </div>

    <div class="client-box">
      <div>
        <div class="box-title">Buyer / Customer Details</div>
        <div class="client-name">${escapeHtml(customer.companyName || customer.company || 'Direct Industrial Client')}</div>
        <div class="client-detail">
          <b>Attn:</b> ${escapeHtml(customer.name || customer.contact || 'Purchase Department')}<br />
          <b>Phone:</b> ${escapeHtml(customer.mobile || customer.phone || '—')}<br />
          <b>Email:</b> ${escapeHtml(customer.email || '—')}
        </div>
      </div>
      <div>
        <div class="box-title">Delivery & Dispatch Location</div>
        <div class="client-detail">
          ${escapeHtml(customer.address || customer.addr || 'Ex-Works / Standard Dispatch')}<br />
          ${customer.city ? `${escapeHtml(customer.city)}, ` : ''}${customer.state ? `${escapeHtml(customer.state)} ` : ''}${customer.pin ? `- ${escapeHtml(customer.pin)}` : ''}<br />
          ${customer.poRef || customer.po ? `<b>Customer PO Ref:</b> <span style="font-family:monospace;color:#8F2A0E">${escapeHtml(customer.poRef || customer.po)}</span>` : ''}
        </div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th>Description of Components / Tooling</th>
          <th style="width:85px;text-align:center">HSN/SAC</th>
          <th style="width:45px;text-align:center">Qty</th>
          <th style="width:45px;text-align:center">UOM</th>
          <th style="width:95px;text-align:right">Rate (₹)</th>
          <th style="width:110px;text-align:right">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="calc-grid">
      <div class="words-box">
        <div style="font-weight:700;color:#475569;margin-bottom:2px">Amount Chargeable in Words:</div>
        <div style="font-weight:800;color:#0F172A">${words}</div>
        ${notes ? `<div style="margin-top:6px;color:#334155;border-top:1px solid #CBD5E1;padding-top:4px"><b>Special Notes:</b> ${escapeHtml(notes)}</div>` : ''}
      </div>
      <div>
        <table class="totals-table">
          <tr><td class="t-lbl">Subtotal (Taxable Value)</td><td class="t-val">₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
          <tr><td class="t-lbl">CGST (9.0%)</td><td class="t-val">₹${cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
          <tr><td class="t-lbl">SGST (9.0%)</td><td class="t-val">₹${sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
          <tr class="grand-total"><td class="t-lbl" style="font-weight:800">Grand Total (Incl. GST)</td><td class="t-val" style="font-size:13px;color:#8F2A0E">₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
        </table>
      </div>
    </div>

    <div class="terms-box">
      <div class="box-title">Commercial Terms & Conditions</div>
      <ol class="terms-list">
        ${termsHtml}
      </ol>
    </div>

    <div class="footer-grid">
      <div class="bank-box" style="display:flex; justify-content:space-between; align-items:center; gap:14px;">
        <div style="flex:1">
          <div style="font-weight:800;color:#2E1508;margin-bottom:2px">Bank Account for Wire Transfer (NEFT / RTGS / IMPS)</div>
          <b>Bank Name:</b> ${escapeHtml(co.bankName)}<br />
          <b>Account Name:</b> ${escapeHtml(co.accName)}<br />
          <b>A/C Number:</b> <span style="font-family:monospace;font-weight:700">${escapeHtml(co.accNo)}</span><br />
          <b>IFSC Code:</b> <span style="font-family:monospace;font-weight:700">${escapeHtml(co.ifsc)}</span> &bull; <b>Branch:</b> ${escapeHtml(co.branch)}<br />
          <b>UPI ID:</b> <span style="font-family:monospace;font-weight:700">${escapeHtml(co.upiId)}</span>
        </div>
        ${qrDataUrl ? `
        <div style="text-align:center; flex-shrink:0; background:#FFFFFF; padding:6px 8px; border-radius:6px; border:1px solid #DECDBE; box-shadow:0 1px 3px rgba(0,0,0,0.05)">
          <img src="${qrDataUrl}" style="width:84px; height:84px; display:block;" alt="UPI Payment QR Code" />
          <div style="font-size:8px; font-weight:800; color:#8F2A0E; margin-top:2px; letter-spacing:0.3px; text-transform:uppercase">
            ${escapeHtml(qrCaption)}
          </div>
        </div>` : ''}
      </div>
      <div class="sig-col">
        ${co.signatureImage ? `
        <div style="min-height:50px; display:flex; align-items:flex-end; justify-content:flex-end; margin-bottom:4px;">
          <img src="${co.signatureImage}" style="max-height:48px; max-width:140px; object-fit:contain; display:block;" alt="Authorized Digital Signature" />
        </div>` : `
        <div class="sig-stamp">Digital Stamp Verified</div>`}
        <div class="sig-label">For ${escapeHtml(co.name)}</div>
        <div style="font-size:9px;color:#64748B">${escapeHtml(co.signatoryName || 'Authorized Signatory')}${co.signatoryDesignation ? ` &bull; ${escapeHtml(co.signatoryDesignation)}` : ' &bull; Sales Engineering'}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/* -------------------------------------------------------------
   2. LEGAL GST TAX INVOICE TEMPLATE
   ------------------------------------------------------------- */
export async function generateTaxInvoiceHtml({
  invoiceNo,
  quoteNo,
  orderId,
  date,
  dueDate,
  poRef,
  company = {},
  customer = {},
  items = [],
  notes = ''
}) {
  let co = { ...DEFAULT_COMPANY, ...company };
  if (!company || Object.keys(company).length === 0 || !company.gstin) {
    const remote = await fetchCompanyInvoiceProfile(company?.companyId || company?.id);
    if (remote) {
      co = {
        ...DEFAULT_COMPANY,
        ...remote,
        name: remote.companyName || remote.name || DEFAULT_COMPANY.name,
        companyName: remote.companyName || remote.name || DEFAULT_COMPANY.companyName,
        ...company
      };
    }
  }
  co.name = co.name || co.companyName || DEFAULT_COMPANY.name;
  co.companyName = co.companyName || co.name || DEFAULT_COMPANY.companyName;
  const logoSrc = co.logo || ARGUS_LOGO_BASE64;

  const invDate = date || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const invDue = dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const invNumber = invoiceNo || `INV/${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(2)}/${Math.floor(1000 + Math.random() * 9000)}`;

  let subtotal = 0;
  const rowsHtml = items.map((it, idx) => {
    const qty = Number(it.qty) || 1;
    const rate = Number(it.price) || 0;
    const amount = qty * rate;
    subtotal += amount;
    const hsn = it.hsn || it.hsnCode || '8466.93.90';
    const itCgst = amount * 0.09;
    const itSgst = amount * 0.09;
    const itTotal = amount + itCgst + itSgst;

    return `
      <tr>
        <td style="text-align:center;font-weight:600">${idx + 1}</td>
        <td>
          <div style="font-weight:700;color:#0F172A;font-size:12px">${escapeHtml(it.name || 'Industrial Component')}</div>
          <div style="font-size:10.5px;color:#64748B;font-family:monospace">SKU: ${escapeHtml(it.sku || it.pid || 'N/A')}${it.brand ? ` &bull; Brand: ${escapeHtml(it.brand)}` : ''}</div>
          ${it.desc ? `<div style="font-size:10px;color:#475569;margin-top:2px">${escapeHtml(it.desc)}</div>` : ''}
        </td>
        <td style="text-align:center;font-family:monospace;font-size:11px">${escapeHtml(hsn)}</td>
        <td style="text-align:center;font-weight:700">${qty}</td>
        <td style="text-align:center;font-size:11px">${escapeHtml(it.uom || 'Pc')}</td>
        <td style="text-align:right;font-family:monospace">₹${rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="text-align:right;font-family:monospace;font-weight:600">₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="text-align:right;font-family:monospace;font-size:10px">₹${itCgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="text-align:right;font-family:monospace;font-size:10px">₹${itSgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="text-align:right;font-family:monospace;font-weight:700;color:#0F172A">₹${itTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `;
  }).join('');

  const cgst = subtotal * 0.09;
  const sgst = subtotal * 0.09;
  const total = subtotal + cgst + sgst;
  const words = numberToWordsIndian(total);

  let qrDataUrl = null;
  let qrCaption = `Scan & Pay ₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (co.qrMode === 'custom' && co.customQrImage) {
    qrDataUrl = co.customQrImage;
    qrCaption = 'Scan to Pay (UPI Merchant)';
  } else if (co.upiId) {
    qrDataUrl = await generateUpiQrCode(co.upiId, co.accName || co.name, total, invNumber);
  }

  const defaultInvoiceTerms = [
    'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
    'Interest @ 18% per annum will be charged on delayed payments beyond the due date.',
    'Goods once sold will not be accepted back without prior written material return authorization (RMA).',
    'All disputes are subject to exclusive jurisdiction of Pune, Maharashtra courts only.'
  ];
  const termsHtml = renderTermsList(co.invoiceTerms, defaultInvoiceTerms);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Tax Invoice — ${escapeHtml(invNumber)}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm 10mm 10mm 10mm; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0F172A; background: #F8FAFC; line-height: 1.35; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print-bar { position: sticky; top: 0; z-index: 999; background: #0F172A; color: #FFFFFF; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .no-print-bar button { background: #38BDF8; color: #0F172A; border: none; padding: 7px 16px; border-radius: 6px; font-weight: 700; font-size: 12px; cursor: pointer; }
    @media print { .no-print-bar { display: none !important; } body { background: #FFF; } }
    .sheet { max-width: 820px; margin: 16px auto; background: #FFFFFF; border: 1.5px solid #0F172A; border-radius: 8px; padding: 22px 26px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    .top-badge { display: flex; justify-content: space-between; align-items: center; background: #0F172A; color: #FFF; padding: 5px 12px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0F172A; padding-bottom: 12px; margin-bottom: 12px; }
    .brand-col { max-width: 480px; }
    .logo-img { height: 46px; object-fit: contain; margin-bottom: 4px; display: block; }
    .co-name { font-size: 14px; font-weight: 900; color: #0F172A; letter-spacing: -0.2px; text-transform: uppercase; }
    .co-tag { font-size: 10px; color: #64748B; font-weight: 600; margin-bottom: 2px; }
    .co-addr { font-size: 9.5px; color: #334155; line-height: 1.3; }
    .doc-col { text-align: right; }
    .doc-type { font-size: 18px; font-weight: 900; color: #0369A1; letter-spacing: 0.5px; text-transform: uppercase; }
    .meta-table { font-size: 10px; margin-top: 4px; margin-left: auto; border-collapse: collapse; }
    .meta-table td { padding: 2px 6px; }
    .meta-table .lbl { color: #64748B; font-weight: 600; text-align: right; }
    .meta-table .val { font-weight: 700; color: #0F172A; text-align: left; }
    .parties-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border: 1px solid #CBD5E1; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; background: #F8FAFC; }
    .party-title { font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #0369A1; letter-spacing: 0.5px; margin-bottom: 4px; border-bottom: 1px dashed #CBD5E1; padding-bottom: 2px; }
    .party-name { font-size: 12px; font-weight: 800; color: #0F172A; }
    .party-detail { font-size: 9.5px; color: #475569; margin-top: 2px; line-height: 1.35; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
    .items-table th { background: #0F172A; color: #FFFFFF; padding: 6px 6px; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; border: 1px solid #0F172A; }
    .items-table td { padding: 5px 6px; border: 1px solid #CBD5E1; vertical-align: middle; }
    .items-table tr:nth-child(even) td { background: #F8FAFC; }
    .calc-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; margin-bottom: 12px; }
    .words-box { background: #F1F5F9; border: 1px dashed #CBD5E1; border-radius: 6px; padding: 8px 12px; font-size: 10px; }
    .totals-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    .totals-table td { padding: 3px 6px; }
    .totals-table .t-lbl { color: #475569; }
    .totals-table .t-val { text-align: right; font-weight: 700; font-family: monospace; }
    .grand-total { border-top: 2px solid #0F172A; border-bottom: 2px solid #0F172A; }
    .grand-total td { padding: 6px 6px; font-size: 12px; font-weight: 900; color: #0F172A; }
    .terms-box { border: 1px solid #CBD5E1; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 9px; background: #FFF; }
    .terms-list { list-style: decimal inside; color: #475569; margin-top: 3px; line-height: 1.35; }
    .footer-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; padding-top: 8px; border-top: 1px solid #CBD5E1; }
    .bank-box { font-size: 9.5px; color: #334155; line-height: 1.35; background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 6px; padding: 8px 12px; }
    .sig-col { text-align: right; display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-end; }
    .sig-stamp { width: 120px; height: 50px; border: 1px dashed #0369A1; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #0369A1; font-size: 9px; margin-bottom: 4px; font-weight: 700; }
    .sig-label { font-size: 10px; font-weight: 700; color: #0F172A; }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div style="font-weight:700">🧾 Official GST Tax Invoice &bull; ${escapeHtml(invNumber)}</div>
    <div style="display:flex;gap:8px">
      <button onclick="window.print()">🖨️ Print / Save as PDF</button>
      <button style="background:transparent;color:#FFF;border:1px solid #64748B" onclick="window.close()">Close</button>
    </div>
  </div>

  <div class="sheet">
    <div class="top-badge">
      <span>Rule 46 of CGST Rules, 2017 &bull; Commercial Tax Invoice</span>
      <span>Original for Recipient</span>
    </div>

    <div class="header">
      <div class="brand-col">
        <img src="${logoSrc}" class="logo-img" alt="${escapeHtml(co.name)} Logo" />
        <div class="co-name">${escapeHtml(co.name)}</div>
        <div class="co-tag">${escapeHtml(co.tagline)}</div>
        <div class="co-addr">
          ${escapeHtml(co.regAddress)}${co.city ? `, ${escapeHtml(co.city)}` : ''}${co.pin ? ` - ${escapeHtml(co.pin)}` : ''}<br />
          <b>GSTIN:</b> ${escapeHtml(co.gstin)} &bull; <b>PAN:</b> ${escapeHtml(co.pan)} &bull; <b>State Code:</b> ${escapeHtml(co.stateCode)}<br />
          <b>CIN:</b> ${escapeHtml(co.cin || 'U29253PN2021PTC198765')} &bull; <b>Email:</b> ${escapeHtml(co.email)} &bull; <b>Phone:</b> ${escapeHtml(co.phone)}
        </div>
      </div>
      <div class="doc-col">
        <div class="doc-type">TAX INVOICE</div>
        <table class="meta-table">
          <tr><td class="lbl">Invoice No:</td><td class="val" style="color:#0369A1">${escapeHtml(invNumber)}</td></tr>
          <tr><td class="lbl">Invoice Date:</td><td class="val">${escapeHtml(invDate)}</td></tr>
          <tr><td class="lbl">Payment Due Date:</td><td class="val">${escapeHtml(invDue)}</td></tr>
          ${orderId ? `<tr><td class="lbl">Order Ref No:</td><td class="val" style="font-family:monospace">${escapeHtml(orderId)}</td></tr>` : ''}
          ${quoteNo ? `<tr><td class="lbl">Quotation Ref:</td><td class="val" style="font-family:monospace">${escapeHtml(quoteNo)}</td></tr>` : ''}
          ${poRef ? `<tr><td class="lbl">Customer PO:</td><td class="val" style="font-family:monospace">${escapeHtml(poRef)}</td></tr>` : ''}
          <tr><td class="lbl">Reverse Charge:</td><td class="val">No</td></tr>
        </table>
      </div>
    </div>

    <div class="parties-grid">
      <div>
        <div class="party-title">Bill To (Buyer)</div>
        <div class="party-name">${escapeHtml(customer.companyName || customer.company || 'Direct Industrial Buyer')}</div>
        <div class="party-detail">
          <b>Attn:</b> ${escapeHtml(customer.name || customer.contact || 'Finance & Accounts')}<br />
          <b>Address:</b> ${escapeHtml(customer.address || customer.addr || 'Plant Office')}<br />
          <b>City / State:</b> ${customer.city ? `${escapeHtml(customer.city)}, ` : ''}${customer.state ? `${escapeHtml(customer.state)} ` : ''}${customer.pin ? `- ${escapeHtml(customer.pin)}` : ''}<br />
          <b>Phone:</b> ${escapeHtml(customer.mobile || customer.phone || '—')} &bull; <b>Email:</b> ${escapeHtml(customer.email || '—')}<br />
          <b>GSTIN / UIN:</b> ${customer.gstin ? escapeHtml(customer.gstin) : '<span style="color:#64748B">Unregistered / Consumer</span>'}
        </div>
      </div>
      <div>
        <div class="party-title">Ship To (Consignee)</div>
        <div class="party-name">${escapeHtml(customer.companyName || customer.company || 'Consignee Delivery Location')}</div>
        <div class="party-detail">
          <b>Delivery Plant Bay:</b> ${escapeHtml(customer.address || customer.addr || 'Ex-Works / Standard Dispatch')}<br />
          <b>City / State:</b> ${customer.city ? `${escapeHtml(customer.city)}, ` : ''}${customer.state ? `${escapeHtml(customer.state)} ` : ''}${customer.pin ? `- ${escapeHtml(customer.pin)}` : ''}<br />
          <b>Place of Supply:</b> ${escapeHtml(customer.state || 'Maharashtra')} (Code: ${customer.stateCode || '27'})<br />
          <b>Transport Mode:</b> Road Logistics / Surface Cargo
        </div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width:24px">#</th>
          <th>Description of Goods / Technical Items</th>
          <th style="width:75px;text-align:center">HSN/SAC</th>
          <th style="width:38px;text-align:center">Qty</th>
          <th style="width:38px;text-align:center">UOM</th>
          <th style="width:75px;text-align:right">Rate (₹)</th>
          <th style="width:80px;text-align:right">Taxable (₹)</th>
          <th style="width:65px;text-align:right">CGST (9%)</th>
          <th style="width:65px;text-align:right">SGST (9%)</th>
          <th style="width:90px;text-align:right">Total (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="calc-grid">
      <div class="words-box">
        <div style="font-weight:700;color:#475569;margin-bottom:2px">Invoice Value in Words:</div>
        <div style="font-weight:800;color:#0F172A">${words}</div>
        ${notes ? `<div style="margin-top:6px;color:#334155;border-top:1px solid #CBD5E1;padding-top:4px"><b>Dispatch & Billing Notes:</b> ${escapeHtml(notes)}</div>` : ''}
      </div>
      <div>
        <table class="totals-table">
          <tr><td class="t-lbl">Total Taxable Value</td><td class="t-val">₹${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
          <tr><td class="t-lbl">Central GST (CGST @ 9%)</td><td class="t-val">₹${cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
          <tr><td class="t-lbl">State GST (SGST @ 9%)</td><td class="t-val">₹${sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
          <tr class="grand-total"><td class="t-lbl" style="font-weight:800">Net Invoice Amount Payable</td><td class="t-val" style="font-size:13px;color:#0369A1">₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
        </table>
      </div>
    </div>

    <div class="terms-box">
      <div class="party-title">Terms of Sale & Legal Declaration</div>
      <ol class="terms-list">
        ${termsHtml}
      </ol>
    </div>

    <div class="footer-grid">
      <div class="bank-box" style="display:flex; justify-content:space-between; align-items:center; gap:14px;">
        <div style="flex:1">
          <div style="font-weight:800;color:#0369A1;margin-bottom:2px">Electronic Remittance Details (RTGS / NEFT / IMPS)</div>
          <b>Beneficiary Name:</b> ${escapeHtml(co.accName)}<br />
          <b>Bank Name:</b> ${escapeHtml(co.bankName)}<br />
          <b>A/C Number:</b> <span style="font-family:monospace;font-weight:700">${escapeHtml(co.accNo)}</span><br />
          <b>IFSC Code:</b> <span style="font-family:monospace;font-weight:700">${escapeHtml(co.ifsc)}</span> &bull; <b>Branch:</b> ${escapeHtml(co.branch)}<br />
          <b>UPI VPA:</b> <span style="font-family:monospace;font-weight:700">${escapeHtml(co.upiId)}</span>
        </div>
        ${qrDataUrl ? `
        <div style="text-align:center; flex-shrink:0; background:#FFFFFF; padding:6px 8px; border-radius:6px; border:1px solid #BAE6FD; box-shadow:0 1px 3px rgba(0,0,0,0.05)">
          <img src="${qrDataUrl}" style="width:84px; height:84px; display:block;" alt="UPI Payment QR Code" />
          <div style="font-size:8px; font-weight:800; color:#0369A1; margin-top:2px; letter-spacing:0.3px; text-transform:uppercase">
            ${escapeHtml(qrCaption)}
          </div>
        </div>` : ''}
      </div>
      <div class="sig-col">
        ${co.signatureImage ? `
        <div style="min-height:50px; display:flex; align-items:flex-end; justify-content:flex-end; margin-bottom:4px;">
          <img src="${co.signatureImage}" style="max-height:48px; max-width:140px; object-fit:contain; display:block;" alt="Authorized Digital Signature" />
        </div>` : `
        <div class="sig-stamp">DIGITALLY SIGNED &amp; SEALED</div>`}
        <div class="sig-label">For ${escapeHtml(co.name)}</div>
        <div style="font-size:9px;color:#64748B">${escapeHtml(co.signatoryName || 'Authorized Signatory')}${co.signatoryDesignation ? ` &bull; ${escapeHtml(co.signatoryDesignation)}` : ' &bull; Accounts Department'}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function downloadQuotationPdf(data) {
  const html = await generateQuotationHtml(data);
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow popups to open and print the quotation PDF.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch (e) {
      console.warn('Print trigger warning:', e);
    }
  }, 400);
}

export async function downloadTaxInvoicePdf(data) {
  const html = await generateTaxInvoiceHtml(data);
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow popups to open and print the tax invoice PDF.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch (e) {
      console.warn('Print trigger warning:', e);
    }
  }, 400);
}
