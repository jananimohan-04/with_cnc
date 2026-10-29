/* Product sharing & PDF export utilities
   Handles single or multi-product sharing via:
   1. WhatsApp (rich markdown with direct image previews and PDF download links)
   2. Email (formatted plain text / mailto link with specs, pricing, and document links)
   3. PDF (high-resolution print-ready industrial catalog datasheet with embedded images, specs table, and clickable PDF document download chips)
*/

export function getProductMedia(p) {
  if (!p) return { images: [], docs: [], videos: [], youtube: [] };

  const rawImages = Array.isArray(p.images) ? [...p.images] : [];
  const mediaList = Array.isArray(p.media) ? p.media : [];

  const docs = [];
  const videos = [];
  const youtube = [];

  // 1. Check direct product fields
  if (p.youtube && typeof p.youtube === 'string' && p.youtube.trim()) {
    youtube.push({
      id: 'yt-direct',
      title: p.name ? `${p.name} - Video Demo` : 'Product Video Demo',
      url: p.youtube.trim()
    });
  }

  if (p.video && typeof p.video === 'string' && p.video.trim()) {
    videos.push({
      id: 'vid-direct',
      title: p.name ? `${p.name} - Video` : 'Product Video',
      url: p.video.trim()
    });
  }

  // 2. Iterate mediaList
  mediaList.forEach(m => {
    if (!m || !m.url) return;
    const url = String(m.url).trim();
    if (!url) return;
    const type = String(m.type || '').toLowerCase();
    const isYt = type === 'youtube' || /youtube\.com|youtu\.be/i.test(url);
    const isDoc = type === 'document' || type === 'pdf' || /\.pdf($|\?)/i.test(url);
    const isImg = type === 'image' || /\.(jpe?g|png|gif|webp|avif|svg)($|\?)/i.test(url);

    if (isYt) {
      if (!youtube.some(y => y.url === url)) {
        youtube.push({
          id: m.id || url,
          title: m.title || (p.name ? `${p.name} - YouTube Demo` : 'YouTube Video Demo'),
          url
        });
      }
    } else if (isDoc) {
      if (!docs.some(d => d.url === url)) {
        docs.push({
          id: m.id || url,
          title: m.title || m.name || url.split('/').pop().replace(/\.pdf$/i, '') || 'Technical Datasheet',
          url,
          description: m.description || ''
        });
      }
    } else if (isImg) {
      if (!rawImages.includes(url)) rawImages.push(url);
    } else {
      if (!videos.some(v => v.url === url)) {
        videos.push({
          id: m.id || url,
          title: m.title || 'Product Video',
          url
        });
      }
    }
  });

  // 3. Check p.documents or p.files
  if (Array.isArray(p.documents)) {
    p.documents.forEach(d => {
      const u = typeof d === 'string' ? d.trim() : (d && d.url ? String(d.url).trim() : '');
      if (u && !docs.some(x => x.url === u)) {
        docs.push({
          id: (typeof d === 'object' && d.id) || u,
          title: (typeof d === 'object' && (d.title || d.name)) || u.split('/').pop().replace(/\.pdf$/i, '') || 'Document',
          url: u,
          description: (typeof d === 'object' && d.description) || ''
        });
      }
    });
  }

  return {
    images: rawImages.filter(Boolean),
    docs,
    videos,
    youtube
  };
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

export function formatProductsWhatsApp(products, companyName = 'ARGUS CNC') {
  if (!products || !products.length) return '';
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const count = products.length;

  let msg = `*${companyName} — Industrial Product Catalog*\n`;
  msg += `_Selected SKUs (${count}) • Generated: ${dateStr}_\n`;
  msg += `─────────────────────────\n\n`;

  products.forEach((p, idx) => {
    const { images, docs, youtube } = getProductMedia(p);
    msg += `*${idx + 1}. ${p.name || 'Industrial Product'}*\n`;
    msg += `• *SKU:* \`${p.sku || p.id || 'N/A'}\`\n`;
    if (p.brand) msg += `• *Brand:* ${p.brand}\n`;
    if (p.mpn) msg += `• *MPN:* ${p.mpn}\n`;
    if (p.category) msg += `• *Category:* ${p.category}\n`;

    // Price
    if (p.price != null && p.price !== '') {
      const formattedPrice = Number(p.price).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
      msg += `• *Price:* ${formattedPrice}${p.uom ? ' / ' + p.uom : ' / Pc'}\n`;
    } else {
      msg += `• *Price:* Quotation on Request (RFQ)\n`;
    }

    // Stock & MOQ
    if (p.stock != null) {
      msg += `• *Availability:* ${p.stock > 0 ? `${p.stock} in stock` : 'Made to Order / Lead Time'}\n`;
    }
    if (p.moq) msg += `• *MOQ:* ${p.moq} ${p.uom || 'units'}\n`;

    // Specs
    if (p.specs && typeof p.specs === 'object') {
      const specEntries = Object.entries(p.specs).filter(([k, v]) => v != null && v !== '');
      if (specEntries.length) {
        msg += `• *Key Specs:*\n`;
        specEntries.slice(0, 4).forEach(([k, v]) => {
          msg += `   - ${k}: ${v}\n`;
        });
      }
    }

    // YouTube link as a link
    if (youtube.length) {
      msg += `• *YouTube Video Link:*\n`;
      youtube.forEach((y) => {
        msg += `   ▶️ ${y.title || 'Watch Demo'}: ${y.url}\n`;
      });
    }

    // Photo as an attached image
    if (images.length) {
      msg += `• *Attached Product Image(s) (${images.length}):*\n`;
      images.forEach((img, i) => {
        const fn = img.split('/').pop().split('?')[0] || `photo-${i + 1}.png`;
        msg += `   🖼️ [Attached Image] ${fn}\n`;
      });
    }

    // Document as an attached document
    if (docs.length) {
      msg += `• *Attached Document(s) & Datasheet(s) (${docs.length}):*\n`;
      docs.forEach(d => {
        const fn = d.title.endsWith('.pdf') ? d.title : `${d.title}.pdf`;
        msg += `   📄 [Attached Document] ${fn}\n`;
      });
    }

    msg += `\n`;
  });

  msg += `─────────────────────────\n`;
  msg += `For official quotes, technical consultations, or volume orders, please reply directly to this message or contact us.\n`;
  msg += `*${companyName}*`;

  return msg;
}

export function formatProductsEmail(products, companyName = 'ARGUS CNC') {
  if (!products || !products.length) return { subject: '', body: '' };

  const count = products.length;
  const skuList = products.map(p => p.sku || p.name).slice(0, 3).join(', ') + (count > 3 ? ` +${count - 3} more` : '');
  const subject = `Industrial Product Catalog & Datasheets (${count} SKU${count > 1 ? 's' : ''}: ${skuList}) - ${companyName}`;

  let body = `Dear Customer,\n\nPlease find the technical specifications, pricing, attached documents, and photo(s) for the selected industrial product(s) from ${companyName}:\n\n`;
  body += `============================================================\n`;

  products.forEach((p, idx) => {
    const { images, docs, youtube } = getProductMedia(p);
    body += `[${idx + 1}] ${p.name || 'Industrial SKU'}\n`;
    body += `SKU: ${p.sku || p.id || 'N/A'}\n`;
    if (p.brand) body += `Brand: ${p.brand}\n`;
    if (p.mpn) body += `MPN: ${p.mpn}\n`;
    if (p.category) body += `Category: ${p.category}\n`;

    if (p.price != null && p.price !== '') {
      const formattedPrice = Number(p.price).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
      body += `Price: ${formattedPrice} / ${p.uom || 'Pc'}\n`;
    } else {
      body += `Price: Quotation on Request (RFQ)\n`;
    }

    if (p.stock != null) body += `Stock: ${p.stock} ${p.uom || 'units'}\n`;
    if (p.moq) body += `Minimum Order Quantity (MOQ): ${p.moq}\n`;
    if (p.desc) body += `Description: ${p.desc}\n`;

    if (p.specs && typeof p.specs === 'object') {
      const specEntries = Object.entries(p.specs).filter(([k, v]) => v != null && v !== '');
      if (specEntries.length) {
        body += `Technical Specifications:\n`;
        specEntries.forEach(([k, v]) => {
          body += `  - ${k}: ${v}\n`;
        });
      }
    }

    // YouTube Video Link as a link
    if (youtube.length) {
      body += `YouTube Video Link:\n`;
      youtube.forEach((y) => {
        body += `  • [YouTube Link] ${y.title || 'Watch Video Demo'}: ${y.url}\n`;
      });
    }

    // Photo as an attached image
    if (images.length) {
      body += `Attached Product Image(s) (${images.length}):\n`;
      images.forEach((img, i) => {
        const fn = img.split('/').pop().split('?')[0] || `photo-${i + 1}.png`;
        body += `  • [Attached Image] ${fn} (attached to email)\n`;
      });
    }

    // Document as an attached document
    if (docs.length) {
      body += `Attached Document(s) & Datasheet(s) (${docs.length}):\n`;
      docs.forEach(d => {
        const fn = d.title.endsWith('.pdf') ? d.title : `${d.title}.pdf`;
        body += `  • [Attached Document] ${fn} (attached PDF)\n`;
      });
    }

    body += `\n------------------------------------------------------------\n\n`;
  });

  body += `If you require CAD files, custom machining tolerances, or a formal GST quotation, please feel free to reach out.\n\nBest regards,\n${companyName} Sales & Engineering Team\n`;

  return { subject, body };
}

export function generateCatalogHtml(products, companyInfo = {}) {
  const companyName = companyInfo.name || 'ARGUS CNC';
  const companyEmail = companyInfo.email || 'technologiesargus@gmail.com';
  const companyPhone = companyInfo.phone || '+91 98765 43210';
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const productCardsHtml = products.map((p, idx) => {
    const { images, docs, youtube } = getProductMedia(p);
    const mainImg = images[0] || 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80';
    const subImages = images.slice(1, 7);

    let priceHtml = '';
    if (p.price != null && p.price !== '') {
      const formattedPrice = Number(p.price).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
      priceHtml = `<div class="price-box"><span class="price-val">${formattedPrice}</span> <span class="price-uom">/ ${escapeHtml(p.uom || 'Pc')}</span></div>`;
    } else {
      priceHtml = `<div class="rfq-badge">Quotation On Request (RFQ)</div>`;
    }

    let specsHtml = '';
    if (p.specs && typeof p.specs === 'object') {
      const entries = Object.entries(p.specs).filter(([k, v]) => v != null && v !== '');
      if (entries.length) {
        const rows = entries.map(([k, v]) => `
          <tr>
            <td class="spec-k">${escapeHtml(k)}</td>
            <td class="spec-v">${escapeHtml(String(v))}</td>
          </tr>
        `).join('');
        specsHtml = `
          <div class="specs-section">
            <div class="section-title">Technical Specifications</div>
            <table class="specs-table"><tbody>${rows}</tbody></table>
          </div>
        `;
      }
    }

    let ytHtml = '';
    if (youtube.length) {
      const ytChips = youtube.map(y => `
        <a class="yt-chip" href="${escapeHtml(y.url)}" target="_blank" rel="noopener noreferrer">
          <svg class="yt-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          <span class="yt-title">${escapeHtml(y.title || 'Product Video Demo')}</span>
          <span class="yt-link">Watch on YouTube &rarr;</span>
        </a>
      `).join('');
      ytHtml = `
        <div class="yt-section">
          <div class="section-title">Video Demonstration</div>
          <div class="yt-grid">${ytChips}</div>
        </div>
      `;
    }

    let docsHtml = '';
    if (docs.length) {
      const docChips = docs.map(d => `
        <a class="doc-chip" href="${escapeHtml(d.url)}" target="_blank" rel="noopener noreferrer">
          <svg class="pdf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          <span class="doc-title">${escapeHtml(d.title)}</span>
          <span class="doc-download">Download PDF &rarr;</span>
        </a>
      `).join('');
      docsHtml = `
        <div class="docs-section">
          <div class="section-title">Attached Technical Documents & Datasheets</div>
          <div class="doc-grid">${docChips}</div>
        </div>
      `;
    }

    let subImagesHtml = '';
    if (subImages.length) {
      subImagesHtml = `<div class="thumb-strip">${subImages.map(img => `<img src="${escapeHtml(img)}" class="sub-thumb" alt="Product view" />`).join('')}</div>`;
    }

    return `
      <div class="product-card">
        <div class="card-header">
          <div class="badge-idx">#${idx + 1}</div>
          <div class="header-main">
            <h2 class="prod-title">${escapeHtml(p.name || 'Industrial SKU')}</h2>
            <div class="meta-tags">
              <span class="tag tag-sku">SKU: <b>${escapeHtml(p.sku || p.id || 'N/A')}</b></span>
              ${p.brand ? `<span class="tag tag-brand">Brand: <b>${escapeHtml(p.brand)}</b></span>` : ''}
              ${p.mpn ? `<span class="tag tag-mpn">MPN: <b>${escapeHtml(p.mpn)}</b></span>` : ''}
              ${p.category ? `<span class="tag tag-cat">${escapeHtml(p.category)}</span>` : ''}
            </div>
          </div>
          <div class="header-pricing">
            ${priceHtml}
          </div>
        </div>

        <div class="card-body">
          <div class="gallery-col">
            <div class="main-img-box">
              <img src="${escapeHtml(mainImg)}" class="main-img" alt="${escapeHtml(p.name || 'Product Image')}" />
            </div>
            ${subImagesHtml}
          </div>

          <div class="info-col">
            ${p.desc ? `<div class="desc-box">${escapeHtml(p.desc)}</div>` : (p.short ? `<div class="desc-box">${escapeHtml(p.short)}</div>` : '')}

            <div class="quick-meta-grid">
              <div class="quick-meta-item">
                <span class="qm-label">Stock Status</span>
                <span class="qm-value ${p.stock > 0 ? 'stock-in' : 'stock-rfq'}">${p.stock > 0 ? `${p.stock} ${escapeHtml(p.uom || 'Units')} Available` : 'Made to Order / RFQ'}</span>
              </div>
              <div class="quick-meta-item">
                <span class="qm-label">Unit of Measure</span>
                <span class="qm-value">${escapeHtml(p.uom || 'Piece (Pc)')}</span>
              </div>
              ${p.moq ? `
                <div class="quick-meta-item">
                  <span class="qm-label">Min. Order Qty</span>
                  <span class="qm-value">${p.moq} ${escapeHtml(p.uom || 'units')}</span>
                </div>
              ` : ''}
              ${p.leadTime ? `
                <div class="quick-meta-item">
                  <span class="qm-label">Lead Time</span>
                  <span class="qm-value">${escapeHtml(p.leadTime)}</span>
                </div>
              ` : ''}
            </div>

            ${specsHtml}
            ${ytHtml}
            ${docsHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(companyName)} — Industrial Product Catalog</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 12mm 12mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1A0A03;
      background-color: #FFFFFF;
      line-height: 1.4;
      font-size: 11pt;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Print action bar - hidden when printing */
    .no-print-bar {
      position: sticky;
      top: 0;
      z-index: 999;
      background: #2E1508;
      color: #FFFFFF;
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .no-print-bar button {
      background: #E5A93C;
      color: #1A0A03;
      border: none;
      padding: 8px 18px;
      font-weight: 700;
      font-size: 13px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .no-print-bar button:hover {
      background: #F3B74F;
    }
    @media print {
      .no-print-bar { display: none !important; }
      body { background: #FFFFFF; }
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 16px 20px;
    }

    /* Catalog Header */
    .catalog-header {
      border-bottom: 3px solid #2E1508;
      padding-bottom: 14px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .co-title {
      font-size: 22pt;
      font-weight: 900;
      color: #2E1508;
      letter-spacing: -0.5px;
      line-height: 1.1;
    }
    .co-sub {
      font-size: 9pt;
      color: #5C3D2E;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-top: 4px;
    }
    .doc-meta {
      text-align: right;
      font-size: 9pt;
      color: #555;
    }
    .doc-meta b {
      color: #1A0A03;
    }

    /* Product Card */
    .product-card {
      border: 1px solid #BAA794;
      border-radius: 8px;
      background: #FFFFFF;
      margin-bottom: 24px;
      page-break-inside: avoid;
      break-inside: avoid;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(46,21,8,0.06);
    }
    .card-header {
      background: #F7EFE7;
      border-bottom: 1px solid #BAA794;
      padding: 10px 14px;
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .badge-idx {
      background: #2E1508;
      color: #FFFFFF;
      font-weight: 800;
      font-size: 9pt;
      padding: 4px 8px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .header-main {
      flex: 1;
      min-width: 0;
    }
    .prod-title {
      font-size: 13pt;
      font-weight: 800;
      color: #2E1508;
      margin-bottom: 3px;
    }
    .meta-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tag {
      font-size: 8pt;
      padding: 2px 6px;
      border-radius: 3px;
      background: #EDE1D3;
      border: 1px solid #D4C2B0;
      color: #2E1508;
    }
    .tag-sku b { color: #8F2A0E; }
    .header-pricing {
      text-align: right;
      flex-shrink: 0;
    }
    .price-box {
      font-size: 13pt;
      font-weight: 800;
      color: #1A0A03;
    }
    .price-uom {
      font-size: 8.5pt;
      color: #666;
      font-weight: 500;
    }
    .rfq-badge {
      background: #EFE4D6;
      color: #78350F;
      border: 1px solid #D4C2B0;
      font-size: 8pt;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    /* Card Layout */
    .card-body {
      display: flex;
      padding: 14px;
      gap: 16px;
    }
    .gallery-col {
      width: 220px;
      flex-shrink: 0;
    }
    .main-img-box {
      width: 100%;
      height: 180px;
      border: 1px solid #E2D5C8;
      border-radius: 6px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #FAFAF8;
    }
    .main-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .thumb-strip {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .sub-thumb {
      width: 48px;
      height: 48px;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid #E2D5C8;
    }
    .info-col {
      flex: 1;
      min-width: 0;
    }
    .desc-box {
      font-size: 9pt;
      color: #333;
      margin-bottom: 10px;
      line-height: 1.45;
    }

    /* Quick Meta Grid */
    .quick-meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px 12px;
      background: #FAF6F1;
      border: 1px solid #EAE0D5;
      padding: 8px 10px;
      border-radius: 5px;
      margin-bottom: 12px;
    }
    .quick-meta-item {
      display: flex;
      flex-direction: column;
    }
    .qm-label {
      font-size: 7.5pt;
      color: #777;
      text-transform: uppercase;
      font-weight: 700;
    }
    .qm-value {
      font-size: 8.5pt;
      font-weight: 700;
      color: #1A0A03;
    }
    .stock-in { color: #065F46; }
    .stock-rfq { color: #92400E; }

    /* Specs Section */
    .section-title {
      font-size: 8.5pt;
      font-weight: 800;
      color: #2E1508;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
      border-bottom: 1px solid #EAE0D5;
      padding-bottom: 3px;
    }
    .specs-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin-bottom: 12px;
    }
    .specs-table td {
      padding: 3px 6px;
      border-bottom: 1px dotted #E2D5C8;
    }
    .spec-k {
      color: #5C3D2E;
      font-weight: 700;
      width: 40%;
    }
    .spec-v {
      color: #1A0A03;
    }

    /* Video Demonstration Section */
    .yt-section {
      margin-top: 10px;
      margin-bottom: 6px;
    }
    .yt-grid {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .yt-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #FEF2F2;
      border: 1px solid #FECACA;
      padding: 5px 10px;
      border-radius: 4px;
      color: #991B1B;
      text-decoration: none;
      font-size: 8pt;
      font-weight: 600;
    }
    .yt-chip:hover {
      background: #FEE2E2;
    }
    .yt-icon {
      width: 16px;
      height: 16px;
      color: #DC2626;
      flex-shrink: 0;
    }
    .yt-title {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .yt-link {
      color: #DC2626;
      font-size: 7.5pt;
      font-weight: 700;
      flex-shrink: 0;
    }

    /* Attached PDF Documents & Datasheets */
    .docs-section {
      margin-top: 10px;
    }
    .doc-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .doc-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #F4EBE2;
      border: 1px solid #BAA794;
      padding: 4px 8px;
      border-radius: 4px;
      color: #2E1508;
      text-decoration: none;
      font-size: 8pt;
      font-weight: 600;
    }
    .doc-chip:hover {
      background: #DECDBE;
    }
    .pdf-icon {
      width: 14px;
      height: 14px;
      stroke: #B91C1C;
    }
    .doc-download {
      color: #B91C1C;
      font-size: 7.5pt;
      font-weight: 700;
    }

    /* Catalog Footer */
    .catalog-footer {
      border-top: 1px solid #BAA794;
      padding-top: 10px;
      margin-top: 24px;
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      color: #777;
    }
  </style>
</head>
<body>
  <div class="no-print-bar">
    <div>
      <strong>ARGUS Industrial Catalog Viewer</strong> &mdash; ${products.length} Selected SKU${products.length > 1 ? 's' : ''} Ready to Export
    </div>
    <div style="display: flex; gap: 10px;">
      <button onclick="window.print()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        Save as PDF / Print
      </button>
      <button onclick="window.close()" style="background: #3E2415; color: #FFF;">
        Close
      </button>
    </div>
  </div>

  <div class="container">
    <div class="catalog-header">
      <div>
        <div class="co-title">${escapeHtml(companyName)}</div>
        <div class="co-sub">Industrial Machining & Component Catalog</div>
      </div>
      <div class="doc-meta">
        <div>Date: <b>${dateStr}</b></div>
        <div>Total Items: <b>${products.length} SKU${products.length > 1 ? 's' : ''}</b></div>
        <div>Contact: <b>${escapeHtml(companyEmail)}</b></div>
      </div>
    </div>

    ${productCardsHtml}

    <div class="catalog-footer">
      <div>Generated for client technical evaluation by ${escapeHtml(companyName)}.</div>
      <div>Email: ${escapeHtml(companyEmail)} | Phone: ${escapeHtml(companyPhone)}</div>
    </div>
  </div>
</body>
</html>`;
}

export function exportProductsPdf(products, companyInfo = {}) {
  const html = generateCatalogHtml(products, companyInfo);
  const printWin = window.open('', '_blank');
  if (!printWin) {
    alert('Please allow popups to open and print the product catalog PDF.');
    return;
  }
  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();

  // Give external images a brief moment to render before triggering print
  setTimeout(() => {
    try {
      printWin.focus();
      printWin.print();
    } catch (e) {
      console.warn('Print trigger warning:', e);
    }
  }, 400);
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/* Download an individual file (image or PDF document) */
export async function downloadAttachment(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || url.split('/').pop().split('?')[0] || 'attachment';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch {}
    }, 400);
  } catch (e) {
    console.warn('Blob download fallback to window.open:', e);
    window.open(url, '_blank');
  }
}

/* Download all attached photos and PDF documents for selected products */
export async function downloadAllProductAttachments(products) {
  let count = 0;
  for (const p of products) {
    const { images, docs } = getProductMedia(p);

    // Download photos
    for (let i = 0; i < images.length; i++) {
      const url = images[i];
      const ext = url.split('.').pop().split('?')[0] || 'png';
      const name = `${(p.sku || p.name || 'product').replace(/[^a-zA-Z0-9_-]/g, '_')}_photo_${i + 1}.${ext}`;
      await downloadAttachment(url, name);
      count++;
      await new Promise(r => setTimeout(r, 200));
    }

    // Download documents
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const name = `${(doc.title || 'document').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\.pdf$/i, '')}.pdf`;
      await downloadAttachment(doc.url, name);
      count++;
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return count;
}

/* Generate and open standard RFC 822 MIME .eml email with REAL file attachments (images + documents) */
export async function generateEmlEmail({ to, subject, body, products }) {
  const boundary = '----=_Part_ARGUS_' + Date.now();
  const parts = [];

  // Headers
  parts.push(`To: ${(to || '').trim()}`);
  parts.push(`Subject: ${subject || 'Industrial Product Catalog & Datasheets'}`);
  parts.push(`X-Unsent: 1`);
  parts.push(`MIME-Version: 1.0`);
  parts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  parts.push(``);

  // Body Part (Text with YouTube link)
  parts.push(`--${boundary}`);
  parts.push(`Content-Type: text/plain; charset=utf-8`);
  parts.push(`Content-Transfer-Encoding: 8bit`);
  parts.push(``);
  parts.push(body || '');
  parts.push(``);

  // Fetch and embed images & PDF documents as real MIME attachments
  for (const p of products) {
    const { images, docs } = getProductMedia(p);

    // Attach Photos
    for (let i = 0; i < images.length; i++) {
      try {
        const imgUrl = images[i];
        const res = await fetch(imgUrl);
        const buf = await res.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        const ext = imgUrl.split('.').pop().split('?')[0] || 'png';
        const mime = ext.toLowerCase() === 'jpg' || ext.toLowerCase() === 'jpeg' ? 'image/jpeg' : 'image/png';
        const fn = `${(p.sku || p.name || 'product').replace(/[^a-zA-Z0-9_-]/g, '_')}_photo_${i + 1}.${ext}`;

        parts.push(`--${boundary}`);
        parts.push(`Content-Type: ${mime}; name="${fn}"`);
        parts.push(`Content-Disposition: attachment; filename="${fn}"`);
        parts.push(`Content-Transfer-Encoding: base64`);
        parts.push(``);
        parts.push(b64);
        parts.push(``);
      } catch (e) {
        console.warn('Failed to embed image attachment into EML:', e);
      }
    }

    // Attach PDF Documents
    for (let i = 0; i < docs.length; i++) {
      try {
        const doc = docs[i];
        const res = await fetch(doc.url);
        const buf = await res.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        const fn = `${(doc.title || 'datasheet').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\.pdf$/i, '')}.pdf`;

        parts.push(`--${boundary}`);
        parts.push(`Content-Type: application/pdf; name="${fn}"`);
        parts.push(`Content-Disposition: attachment; filename="${fn}"`);
        parts.push(`Content-Transfer-Encoding: base64`);
        parts.push(``);
        parts.push(b64);
        parts.push(``);
      } catch (e) {
        console.warn('Failed to embed document attachment into EML:', e);
      }
    }
  }

  parts.push(`--${boundary}--`);

  const emlContent = parts.join('\r\n');
  const blob = new Blob([emlContent], { type: 'message/rfc822' });
  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `${(subject || 'Product_Catalog').slice(0, 30).replace(/[^a-zA-Z0-9_-]/g, '_')}.eml`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {}
  }, 400);

  return true;
}

/* Native OS Share tray with real File objects (when supported by browser/device) */
export async function shareWithNativeFiles({ title, text, products }) {
  const files = [];
  for (const p of products) {
    const { images, docs } = getProductMedia(p);
    for (let i = 0; i < images.length; i++) {
      try {
        const imgUrl = images[i];
        const res = await fetch(imgUrl);
        const blob = await res.blob();
        const ext = imgUrl.split('.').pop().split('?')[0] || 'png';
        const fn = `${(p.sku || p.name || 'product').replace(/[^a-zA-Z0-9_-]/g, '_')}_photo_${i + 1}.${ext}`;
        files.push(new File([blob], fn, { type: blob.type || 'image/png' }));
      } catch (e) {
        console.warn('Fetch image file failed:', e);
      }
    }
    for (let i = 0; i < docs.length; i++) {
      try {
        const doc = docs[i];
        const res = await fetch(doc.url);
        const blob = await res.blob();
        const fn = `${(doc.title || 'datasheet').replace(/[^a-zA-Z0-9_-]/g, '_').replace(/\.pdf$/i, '')}.pdf`;
        files.push(new File([blob], fn, { type: 'application/pdf' }));
      } catch (e) {
        console.warn('Fetch document file failed:', e);
      }
    }
  }

  if (navigator.canShare && files.length > 0 && navigator.canShare({ files })) {
    await navigator.share({
      title,
      text,
      files
    });
    return true;
  }

  if (navigator.share) {
    await navigator.share({ title, text });
    return true;
  }

  return false;
}

