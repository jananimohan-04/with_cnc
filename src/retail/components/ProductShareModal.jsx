import { useState, useEffect } from 'react';
import {
  FileDown,
  Mail,
  MessageSquare,
  Copy,
  ExternalLink,
  FileText,
  Check,
  Paperclip,
  Download,
  Share2
} from 'lucide-react';
import { Modal, toast } from './ui';
import {
  getProductMedia,
  exportProductsPdf,
  formatProductsEmail,
  formatProductsWhatsApp,
  downloadAttachment,
  downloadAllProductAttachments,
  generateEmlEmail,
  shareWithNativeFiles
} from '../utils/productShare';

export default function ProductShareModal({
  products = [],
  initialTab = 'pdf',
  companyInfo = {},
  onClose
}) {
  const companyName = companyInfo.name || companyInfo.companyName || 'ARGUS CNC';
  const companyEmail = companyInfo.email || 'technologiesargus@gmail.com';

  const [tab, setTab] = useState(initialTab);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const initialEmail = formatProductsEmail(products, companyName);
  const initialWhatsApp = formatProductsWhatsApp(products, companyName);

  const totalImages = products.reduce((acc, p) => acc + getProductMedia(p).images.length, 0);
  const totalDocs = products.reduce((acc, p) => acc + getProductMedia(p).docs.length, 0);
  const totalYt = products.reduce((acc, p) => acc + getProductMedia(p).youtube.length, 0);

  const [subject, setSubject] = useState(initialEmail.subject);
  const [emailBody, setEmailBody] = useState(initialEmail.body);
  const [whatsAppText, setWhatsAppText] = useState(initialWhatsApp);

  useEffect(() => {
    const eData = formatProductsEmail(products, companyName);
    const wData = formatProductsWhatsApp(products, companyName);
    setSubject(eData.subject);
    setEmailBody(eData.body);
    setWhatsAppText(wData);
  }, [products, companyName]);

  const handleCopyText = (text, typeLabel) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      toast(`${typeLabel} copied to clipboard!`, '📋');
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      toast('Failed to copy to clipboard', '⚠️');
    });
  };

  const handleLaunchWhatsApp = () => {
    if (!whatsAppText) return;
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    let url = '';
    if (cleanPhone) {
      url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(whatsAppText)}`;
    } else {
      url = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsAppText)}`;
    }
    window.open(url, '_blank');
  };

  /* Native OS Share with real file attachments (images + PDF documents) */
  const handleNativeShare = async () => {
    setBusy(true);
    toast('Preparing files for native app share…', '📤');
    try {
      const ok = await shareWithNativeFiles({
        title: subject,
        text: tab === 'whatsapp' ? whatsAppText : emailBody,
        products
      });
      if (ok) {
        toast('Shared via system app!', '🚀');
      } else {
        toast('Native file sharing not supported on this browser — use buttons below', 'ℹ️');
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('Native share failed:', e);
        toast('Native share failed', '⚠️');
      }
    } finally {
      setBusy(false);
    }
  };

  /* Download all photos & documents directly */
  const handleDownloadAllAttachments = async () => {
    setBusy(true);
    toast('Downloading all attached documents & photos…', '📎');
    try {
      const count = await downloadAllProductAttachments(products);
      toast(`Downloaded ${count} file(s)!`, '✅');
    } catch (e) {
      console.warn('Download attachments failed:', e);
      toast('Failed to download some attachments', '⚠️');
    } finally {
      setBusy(false);
    }
  };

  /* Generate RFC 822 MIME .eml email with real attached documents & images */
  const handleGenerateEmlDraft = async () => {
    setBusy(true);
    toast('Creating email draft with attached documents & photos…', '✉️');
    try {
      await generateEmlEmail({
        to: email,
        subject,
        body: emailBody,
        products
      });
      toast('Email draft opened! Check your mail app with attachments.', '📬');
    } catch (e) {
      console.warn('Failed to generate .eml email:', e);
      toast('Failed to generate email draft', '⚠️');
    } finally {
      setBusy(false);
    }
  };

  const handleLaunchEmail = (provider = 'gmail') => {
    const to = (email || '').trim();
    if (provider === 'gmail') {
      // Automatically download attachments so user can drag & drop them directly into Gmail
      downloadAllProductAttachments(products).catch(() => {});
      const gUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
      window.open(gUrl, '_blank');
      toast('Opening Gmail! Attachments downloaded ready to attach.', '📧');
      return;
    }
    if (provider === 'outlook') {
      downloadAllProductAttachments(products).catch(() => {});
      const outUrl = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
      window.open(outUrl, '_blank');
      toast('Opening Outlook! Attachments downloaded ready to attach.', '📧');
      return;
    }

    // Default mailto: keep body under 1200 characters so Windows OS ShellExecute never drops it
    let safeBody = emailBody;
    const maxLen = 1200;
    if (safeBody.length > maxLen) {
      safeBody = safeBody.slice(0, maxLen) + '\n\n[... Full technical specifications & PDF catalog attached ...]\n\nBest regards,\n' + companyName;
    }
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(safeBody)}`;

    // Anchor click reliably prompts the OS app chooser (Mail / Outlook / Chrome)
    const link = document.createElement('a');
    link.href = mailto;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try { document.body.removeChild(link); } catch {}
    }, 400);
    toast('Prompting your email client…', '✉️');
  };

  const handleExportPdfNow = () => {
    if (!products || !products.length) {
      toast('No products selected for PDF export', '⚠️');
      return;
    }
    exportProductsPdf(products, { name: companyName, email: companyEmail });
    toast(`Generating catalog PDF for ${products.length} SKU(s)…`, '📄');
  };

  return (
    <Modal
      title={`Share & Export Products (${products.length} SKU${products.length > 1 ? 's' : ''})`}
      wide
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* TAB BUTTONS */}
        <div className="flex border-b border-[#BAA794] gap-2">
          <button
            type="button"
            onClick={() => setTab('pdf')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              tab === 'pdf'
                ? 'border-[#2E1508] text-[#2E1508] bg-[#F2E5D8]/50'
                : 'border-transparent text-[#6B503E] hover:text-[#1A0A03]'
            }`}
          >
            <FileDown className="w-4 h-4 text-rose-700" />
            PDF Catalog Booklet ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('whatsapp')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              tab === 'whatsapp'
                ? 'border-emerald-700 text-emerald-800 bg-emerald-50/50'
                : 'border-transparent text-[#6B503E] hover:text-[#1A0A03]'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            Share via WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setTab('email')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              tab === 'email'
                ? 'border-sky-700 text-sky-800 bg-sky-50/50'
                : 'border-transparent text-[#6B503E] hover:text-[#1A0A03]'
            }`}
          >
            <Mail className="w-4 h-4 text-sky-600" />
            Share via Email
          </button>
        </div>

        {/* TAB 1: PDF EXPORT */}
        {tab === 'pdf' && (
          <div className="space-y-3.5">
            <div className="p-3.5 rounded-xl bg-[#F2E5D8] border border-[#BAA794] text-xs text-[#2E1508] leading-relaxed">
              <div className="font-bold text-sm mb-1 text-[#1A0A03]">
                Ready to Generate High-Res Catalog PDF
              </div>
              <p>
                Generates a clean, professional print-ready A4 datasheet containing high-resolution product photos, pricing, MOQ, stock availability, full technical specifications, and download links for attached documents.
              </p>
            </div>

            {/* Product cards with all media grouped directly under each product */}
            <div className="max-h-[380px] overflow-y-auto space-y-3 p-2.5 rounded-xl bg-white border border-[#BAA794]">
              <div className="text-[11px] font-bold text-[#6B503E] uppercase tracking-wider px-1">
                Selected Products ({products.length})
              </div>
              {products.map((p) => {
                const media = getProductMedia(p);
                return (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-[#FAF6F1] border border-[#DECDBE] text-xs space-y-2.5 shadow-2xs"
                  >
                    {/* Top Product Header Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={media.images[0] || ''}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover border border-[#DECDBE] flex-shrink-0 bg-white"
                          onError={(e) => {
                            e.currentTarget.src = `https://picsum.photos/seed/${p.sku || p.id}/120/120`;
                          }}
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-[#2E1508] text-sm truncate">{p.name || 'Industrial SKU'}</div>
                          <div className="text-[11px] text-[#6B503E] mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>SKU: <b className="font-mono text-[#8F2A0E]">{p.sku || p.id}</b></span>
                            {p.brand && <span>• Brand: <b>{p.brand}</b></span>}
                            {p.category && <span>• <b>{p.category}</b></span>}
                          </div>
                          <div className="text-xs font-bold text-[#2E1508] mt-0.5">
                            {p.price != null && p.price !== ''
                              ? `${Number(p.price).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })} / ${p.uom || 'Pc'}`
                              : 'Quotation On Request (RFQ)'}
                          </div>
                        </div>
                      </div>

                      {/* Header badges */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {media.docs.length > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                            {media.docs.length} PDF{media.docs.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {media.youtube.length > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                            ▶ Video
                          </span>
                        )}
                        {media.images.length > 1 && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#E4D5C7] text-[#2E1508]">
                            {media.images.length} photos
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ALL UNDER THE PRODUCT: Images, YouTube Link, Documents */}

                    {/* 1. All Product Images Strip */}
                    {media.images.length > 0 && (
                      <div className="pt-2 border-t border-[#DECDBE]/80">
                        <div className="text-[10.5px] font-bold text-[#6B503E] uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                          <span>🖼️ Product Images ({media.images.length})</span>
                          <span className="text-[10px] font-normal text-slate-500 lowercase">(click to view)</span>
                        </div>
                        <div className="flex items-center gap-2 overflow-x-auto pb-1">
                          {media.images.map((imgUrl, i) => (
                            <a
                              key={i}
                              href={imgUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="relative group rounded-lg overflow-hidden border border-[#DECDBE] hover:border-[#8F2A0E] flex-shrink-0 transition-all bg-white"
                              title={`Open Photo ${i + 1} in new tab`}
                            >
                              <img
                                src={imgUrl}
                                alt={`Photo ${i + 1}`}
                                className="w-13 h-13 object-cover group-hover:scale-105 transition-transform"
                              />
                              <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[8px] text-center py-0.5 font-bold">
                                #{i + 1}
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 2. YouTube Demonstration Link */}
                    {media.youtube.length > 0 && (
                      <div className="pt-2 border-t border-[#DECDBE]/80">
                        <div className="text-[10.5px] font-bold text-[#6B503E] uppercase tracking-wide mb-1 flex items-center gap-1">
                          <span className="text-red-600 font-black">▶</span>
                          <span>YouTube Video Demonstration ({media.youtube.length})</span>
                        </div>
                        <div className="space-y-1.5">
                          {media.youtube.map((yt, i) => (
                            <a
                              key={yt.id || i}
                              href={yt.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between p-2 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100/80 transition-colors text-xs text-red-950 group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-5 h-5 rounded bg-red-600 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">
                                  ▶
                                </span>
                                <div className="min-w-0 truncate">
                                  <div className="font-bold text-red-900 truncate">
                                    {yt.title || `${p.name} Demonstration`}
                                  </div>
                                  <div className="text-[10px] text-red-700 font-mono truncate">
                                    {yt.url}
                                  </div>
                                </div>
                              </div>
                              <span className="text-[11px] font-bold text-red-700 flex items-center gap-1 flex-shrink-0 ml-2 group-hover:underline">
                                Watch Demo <ExternalLink className="w-3 h-3 ml-0.5" />
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. Attached PDF Documents & Drawings */}
                    {media.docs.length > 0 && (
                      <div className="pt-2 border-t border-[#DECDBE]/80">
                        <div className="text-[10.5px] font-bold text-[#6B503E] uppercase tracking-wide mb-1 flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-rose-700 flex-shrink-0" />
                          <span>Attached Documents & Technical Drawings ({media.docs.length})</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {media.docs.map((doc, i) => (
                            <a
                              key={doc.id || i}
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between p-2 rounded-lg bg-white border border-[#DECDBE] hover:bg-[#F2E5D8] transition-colors text-xs text-[#2E1508] group"
                            >
                              <span className="truncate font-semibold flex items-center gap-1.5 min-w-0">
                                <FileText className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                                <span className="truncate">{doc.title}</span>
                              </span>
                              <span className="text-[10.5px] font-bold text-rose-800 flex items-center gap-1 flex-shrink-0 ml-1.5">
                                PDF <ExternalLink className="w-3 h-3 text-[#78350F]" />
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost btn-sm"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleExportPdfNow}
                className="btn btn-primary btn-sm bg-[#2E1508] hover:bg-[#432311] text-white border-none shadow-sm flex items-center gap-2 cursor-pointer px-4 py-2 font-bold"
              >
                <FileDown className="w-4 h-4" />
                Open & Download Catalog PDF
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: WHATSAPP SHARE */}
        {tab === 'whatsapp' && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-[#2E1508] block mb-1">
                  Recipient Mobile / WhatsApp Number (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 919876543210 (with country code)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-[#BAA794] bg-white text-[#1A0A03]"
                />
              </div>
              <div className="text-[11px] text-[#6B503E] pt-3">
                If phone is omitted, WhatsApp will prompt you to pick a contact or chat.
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-[#2E1508]">
                  WhatsApp Message Preview & Text
                </label>
                <span className="text-[11px] text-[#6B503E]">
                  Formatted with WhatsApp *bold*, bullets, image URLs, and PDF links
                </span>
              </div>
              <textarea
                rows={10}
                value={whatsAppText}
                onChange={(e) => setWhatsAppText(e.target.value)}
                className="w-full text-xs font-mono p-3 rounded-xl border border-[#BAA794] bg-white text-[#1A0A03] leading-relaxed resize-y"
              />
            </div>

            {/* Attached media counter banner */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex-wrap gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                <span>
                  <b>Media available:</b> {totalImages} photo(s) • {totalDocs} document(s)
                  {totalYt > 0 && <span className="text-emerald-800"> • {totalYt} YouTube link(s)</span>}
                </span>
              </div>
              <span className="text-[11px] text-emerald-800 font-medium">
                Click Share with Attached Files to send files via system WhatsApp
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#BAA794]">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportPdfNow}
                  className="btn btn-ghost btn-sm text-[#2E1508] border border-[#BAA794] flex items-center gap-1.5"
                  title="Download the PDF booklet to attach in WhatsApp"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  PDF Booklet
                </button>
                <button
                  type="button"
                  onClick={handleDownloadAllAttachments}
                  disabled={busy}
                  className="btn btn-ghost btn-sm text-[#2E1508] border border-[#BAA794] flex items-center gap-1.5"
                  title="Download all product photos and documents to attach in WhatsApp"
                >
                  <Paperclip className="w-3.5 h-3.5 text-[#8F2A0E]" />
                  Download Files
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleNativeShare}
                  disabled={busy}
                  className="btn btn-sm bg-slate-800 hover:bg-slate-900 text-white border-none shadow-xs flex items-center gap-1.5 cursor-pointer font-bold px-3 py-2"
                  title="Share message with photos and documents via System App (WhatsApp, Mail, etc.)"
                >
                  <Share2 className="w-4 h-4" />
                  Share with Attached Files
                </button>
                <button
                  type="button"
                  onClick={() => handleCopyText(whatsAppText, 'WhatsApp text')}
                  className="btn btn-ghost btn-sm text-[#2E1508] border border-[#BAA794] flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy Text'}
                </button>
                <button
                  type="button"
                  onClick={handleLaunchWhatsApp}
                  className="btn btn-primary btn-sm bg-emerald-700 hover:bg-emerald-800 text-white border-none shadow-sm flex items-center gap-2 cursor-pointer font-bold px-4 py-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Open WhatsApp
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: EMAIL SHARE */}
        {tab === 'email' && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-[#2E1508] block mb-1">
                  Recipient Email (optional)
                </label>
                <input
                  type="email"
                  placeholder="client@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-[#BAA794] bg-white text-[#1A0A03]"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#2E1508] block mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-[#BAA794] bg-white text-[#1A0A03]"
                />
              </div>
            </div>

            {/* Attachments status info banner */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-sky-50 border border-sky-200 text-xs text-sky-950 flex-wrap gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-4 h-4 text-sky-700 flex-shrink-0" />
                <span>
                  <b>Attachments:</b> {totalImages} attached photo(s) • {totalDocs} attached PDF(s)
                  {totalYt > 0 && <span className="text-slate-600"> • {totalYt} YouTube link(s)</span>}
                </span>
              </div>
              <span className="text-[11px] text-sky-800 font-medium">
                Draft Email (.eml) attaches files directly!
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-[#2E1508]">
                  Email Body Content
                </label>
                <span className="text-[11px] text-[#6B503E]">
                  Includes technical specs, image links, and downloadable PDF links
                </span>
              </div>
              <textarea
                rows={9}
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="w-full text-xs font-mono p-3 rounded-xl border border-[#BAA794] bg-white text-[#1A0A03] leading-relaxed resize-y"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#BAA794]">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportPdfNow}
                  className="btn btn-ghost btn-sm text-[#2E1508] border border-[#BAA794] flex items-center gap-1.5"
                  title="Download the PDF datasheet to attach to your email"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  PDF Booklet
                </button>
                <button
                  type="button"
                  onClick={handleDownloadAllAttachments}
                  disabled={busy}
                  className="btn btn-ghost btn-sm text-[#2E1508] border border-[#BAA794] flex items-center gap-1.5"
                  title="Download all attached photos and PDF documents"
                >
                  <Paperclip className="w-3.5 h-3.5 text-[#8F2A0E]" />
                  Download Attached Files
                </button>
                <button
                  type="button"
                  onClick={() => handleCopyText(`Subject: ${subject}\n\n${emailBody}`, 'Email text')}
                  className="btn btn-ghost btn-sm text-[#2E1508] border border-[#BAA794] flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy Text'}
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleGenerateEmlDraft}
                  disabled={busy}
                  className="btn btn-sm bg-[#2E1508] hover:bg-[#432311] text-white border-none shadow-xs flex items-center gap-1.5 cursor-pointer font-bold px-3.5 py-2"
                  title="Creates an RFC 822 email file with photos and documents already attached. Opens directly in Outlook, Windows Mail, Thunderbird, Apple Mail, etc."
                >
                  <Mail className="w-4 h-4 text-amber-400" />
                  Draft Email (.eml with Attachments)
                </button>
                <button
                  type="button"
                  onClick={handleNativeShare}
                  disabled={busy}
                  className="btn btn-sm bg-slate-800 hover:bg-slate-900 text-white border-none shadow-xs flex items-center gap-1.5 cursor-pointer font-bold px-3 py-2"
                  title="Open system share dialog to pick Mail or Outlook with files attached"
                >
                  <Share2 className="w-4 h-4" />
                  System Mail App
                </button>
                <button
                  type="button"
                  onClick={() => handleLaunchEmail('gmail')}
                  className="btn btn-sm bg-rose-700 hover:bg-rose-800 text-white border-none shadow-xs flex items-center gap-1.5 cursor-pointer font-bold px-3 py-2"
                  title="Directly redirect into Gmail webmail (downloads attachments ready to attach)"
                >
                  <Mail className="w-4 h-4" />
                  Open in Gmail
                </button>
                <button
                  type="button"
                  onClick={() => handleLaunchEmail('default')}
                  className="btn btn-sm bg-sky-800 hover:bg-sky-900 text-white border-none shadow-xs flex items-center gap-1.5 cursor-pointer font-bold px-3 py-2"
                  title="Open Default Desktop Mail App (mailto: protocol)"
                >
                  <ExternalLink className="w-4 h-4" />
                  mailto:
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
