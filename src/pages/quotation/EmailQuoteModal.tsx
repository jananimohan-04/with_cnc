import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Check, 
  Download, 
  ExternalLink, 
  Mail, 
  MailCheck, 
  Palette, 
  Paperclip, 
  Plus, 
  Send, 
  Trash2, 
  X,
  Building,
  FileText,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { calcLine, calcTotals } from '@/lib/quotationCalc';
import { buildQuotePdf, downloadQuotePdf, getQuotePdfFilename, type PdfThemeId, type QuoteDoc } from '@/lib/quotationDocument';
import type { QuoteSeller } from '@/lib/companyProfile';
import { desktopToast } from '@/lib/desktop/toast';
import { formatINR } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/retail/api';

interface EmailQuoteModalProps {
  open: boolean;
  onClose: () => void;
  doc: QuoteDoc;
  seller?: QuoteSeller;
  theme: PdfThemeId | string;
  templateId: string;
  onOpenThemeModal?: () => void;
  onConfirmSend?: () => Promise<void> | void;
}

const dmy = (iso: string) => (iso ? iso.split('-').reverse().join('-') : new Date().toLocaleDateString('en-IN'));

function buildDefaultEmailMessage(doc: QuoteDoc, seller?: QuoteSeller): string {
  const activeLines = doc.lines.filter(l => calcLine(l).active);
  const totals = calcTotals(doc.lines, doc.tax);
  const orgDisplayName = seller?.name?.trim() || doc.sellerName?.trim() || 'Argus Technologies';
  const orgPhone = (seller?.phones || []).map(p => p.trim()).find(Boolean) || '';
  const orgEmail = (seller?.emails || []).map(p => p.trim()).find(Boolean) || '';
  const primaryClient = doc.clients[0]?.name?.trim() || 'Valued Client';

  let itemsSummary = '';
  if (activeLines.length > 0) {
    activeLines.slice(0, 6).forEach((l, idx) => {
      const name = l.description.trim() || `Product ${idx + 1}`;
      const qty = l.qty.trim() || '1';
      itemsSummary += `  • ${name} (Qty: ${qty}${l.unit ? ` ${l.unit}` : ''})\n`;
    });
    if (activeLines.length > 6) {
      itemsSummary += `  • ... and ${activeLines.length - 6} more item(s)\n`;
    }
  } else {
    itemsSummary = '  • Metal fabrication and machining components.\n';
  }

  const grandTotalFormatted = formatINR(totals.total, { decimals: 'always' });

  return [
    `Dear ${primaryClient},`,
    '',
    `Please find attached our official quotation #${doc.quoteNo || 'DRAFT'} dated ${dmy(doc.date)} for your kind review.`,
    '',
    'Items Summary:',
    itemsSummary.trimEnd(),
    '',
    `Total Amount (including applicable taxes): ${grandTotalFormatted}`,
    doc.terms ? `Payment & Delivery Terms: ${doc.terms}` : '',
    '',
    'Kindly review the attached PDF document for comprehensive itemized pricing and terms.',
    'Please feel free to reply directly to this email or reach us if you have any questions or require revisions.',
    '',
    'Best regards,',
    orgDisplayName,
    orgPhone ? `Contact: ${orgPhone}` : '',
    orgEmail ? `Email: ${orgEmail}` : '',
  ].filter(line => line !== undefined).join('\n');
}

export function EmailQuoteModal({
  open,
  onClose,
  doc,
  seller,
  theme,
  templateId,
  onOpenThemeModal,
  onConfirmSend,
}: EmailQuoteModalProps) {
  // Aggregate initial client recipient emails
  const initialRecipients = useMemo(() => {
    const list: { id: string; email: string; label: string; dept?: string; checked: boolean }[] = [];
    const seen = new Set<string>();

    (doc.clients || []).forEach(cl => {
      const clientName = cl.name?.trim() || 'Client';
      
      // Main client email(s)
      if (cl.email) {
        cl.email.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean).forEach(em => {
          const clean = em.toLowerCase();
          if (clean.includes('@') && !seen.has(clean)) {
            seen.add(clean);
            list.push({
              id: `rec-${clean}`,
              email: em,
              label: clientName,
              dept: 'Primary',
              checked: true,
            });
          }
        });
      }

      // Additional contact emails
      if (Array.isArray(cl.contacts)) {
        cl.contacts.forEach(cnt => {
          if (cnt.email) {
            cnt.email.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean).forEach(em => {
              const clean = em.toLowerCase();
              if (clean.includes('@') && !seen.has(clean)) {
                seen.add(clean);
                list.push({
                  id: `rec-${clean}`,
                  email: em,
                  label: cnt.person || clientName,
                  dept: 'Contact',
                  checked: true,
                });
              }
            });
          }
        });
      }
    });

    return list;
  }, [doc.clients]);

  const [recipients, setRecipients] = useState(initialRecipients);
  const [customTo, setCustomTo] = useState('');
  const [cc, setCc] = useState(() => (seller?.emails && seller.emails[0]) || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [withWorkings, setWithWorkings] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfErr, setPdfErr] = useState<string | null>(null);

  const pdfDocRef = useRef<Awaited<ReturnType<typeof buildQuotePdf>> | null>(null);
  const pdfBlobRef = useRef<Blob | null>(null);

  const orgDisplayName = seller?.name?.trim() || doc.sellerName?.trim() || 'Argus Technologies';
  const primaryClient = doc.clients[0]?.name?.trim() || 'Valued Client';
  const filename = getQuotePdfFilename(doc, withWorkings);

  // Sync state when modal opens
  useEffect(() => {
    if (!open) return;
    setRecipients(initialRecipients);
    setCustomTo('');
    setCc((seller?.emails && seller.emails[0]) || '');
    setSubject(`Quotation #${doc.quoteNo || 'DRAFT'} from ${orgDisplayName}`);
    setMessage(buildDefaultEmailMessage(doc, seller));
    setErrorMsg(null);
  }, [open, doc, seller, orgDisplayName, initialRecipients]);

  // Live PDF preview builder
  useEffect(() => {
    if (!open) {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
      setPdfErr(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    setPdfLoading(true);
    setPdfErr(null);

    void (async () => {
      try {
        const pdfDoc = await buildQuotePdf(
          doc,
          withWorkings,
          (theme as PdfThemeId) || 'orange',
          seller,
          templateId || 'template-1',
        );
        if (cancelled) return;
        pdfDocRef.current = pdfDoc;
        const blob = pdfDoc.output('blob');
        pdfBlobRef.current = blob;
        createdUrl = URL.createObjectURL(blob);
        setPdfUrl(createdUrl);
      } catch (e: any) {
        console.error('Failed to build PDF preview for email:', e);
        if (!cancelled) setPdfErr(e?.message || 'Unable to build PDF preview');
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, doc, withWorkings, theme, templateId, seller]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleToggleRecipient = (id: string) => {
    setRecipients(prev => prev.map(r => (r.id === id ? { ...r, checked: !r.checked } : r)));
  };

  const handleSelectAll = () => {
    setRecipients(prev => prev.map(r => ({ ...r, checked: true })));
  };

  const handleDeselectAll = () => {
    setRecipients(prev => prev.map(r => ({ ...r, checked: false })));
  };

  const handleAddCustomTo = () => {
    const val = customTo.trim();
    if (!val) return;
    const parts = val.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    const added: typeof recipients = [];
    parts.forEach(p => {
      if (p.includes('@')) {
        added.push({
          id: `custom-${Date.now()}-${Math.random()}`,
          email: p,
          label: 'Custom Recipient',
          dept: 'Added',
          checked: true,
        });
      }
    });
    if (added.length > 0) {
      setRecipients(prev => [...prev, ...added]);
      setCustomTo('');
    }
  };

  const handleOpenPdfTab = () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    }
  };

  const handleDownloadPdf = () => {
    if (pdfBlobRef.current) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(pdfBlobRef.current);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Helper to get all selected recipient email addresses
  const getSelectedEmails = (): string[] => {
    return recipients.filter(r => r.checked && r.email.includes('@')).map(r => r.email.trim());
  };

  // Fallback 1: Open in default mail client (mailto)
  const handleOpenMailApp = () => {
    const toList = getSelectedEmails();
    if (toList.length === 0) {
      setErrorMsg('Please select or add at least one recipient email address.');
      return;
    }
    handleDownloadPdf();
    const mailtoUrl = `mailto:${encodeURIComponent(toList.join(','))}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.location.href = mailtoUrl;
    desktopToast('success', 'Mail client opened', 'Quotation PDF has been downloaded for attachment.');
    if (onConfirmSend) void onConfirmSend();
    onClose();
  };

  // Fallback 2: Open in Gmail Web Compose
  const handleOpenGmail = () => {
    const toList = getSelectedEmails();
    if (toList.length === 0) {
      setErrorMsg('Please select or add at least one recipient email address.');
      return;
    }
    handleDownloadPdf();
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toList.join(','))}&cc=${encodeURIComponent(cc)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.open(gmailUrl, '_blank');
    desktopToast('success', 'Gmail opened', 'Quotation PDF downloaded so you can drag and drop it into Gmail.');
    if (onConfirmSend) void onConfirmSend();
    onClose();
  };

  // Fallback 3: Open in Outlook Web Compose
  const handleOpenOutlook = () => {
    const toList = getSelectedEmails();
    if (toList.length === 0) {
      setErrorMsg('Please select or add at least one recipient email address.');
      return;
    }
    handleDownloadPdf();
    const outlookUrl = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(toList.join(','))}&cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.open(outlookUrl, '_blank');
    desktopToast('success', 'Outlook opened', 'Quotation PDF downloaded so you can attach it to Outlook.');
    if (onConfirmSend) void onConfirmSend();
    onClose();
  };

  // Main Send handler
  const handleSendEmail = async () => {
    setErrorMsg(null);
    const toList = getSelectedEmails();
    if (toList.length === 0) {
      setErrorMsg('Please select or add at least one valid Customer Email address (TO).');
      return;
    }

    setSending(true);
    try {
      // Obtain PDF as base64
      let pdfBase64 = '';
      if (pdfDocRef.current) {
        pdfBase64 = pdfDocRef.current.output('datauristring');
      } else {
        const freshDoc = await buildQuotePdf(
          doc,
          withWorkings,
          (theme as PdfThemeId) || 'orange',
          seller,
          templateId || 'template-1',
        );
        pdfBase64 = freshDoc.output('datauristring');
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || '';

      const res = await fetch(`${API_BASE}/api/quote/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          orgName: orgDisplayName,
          companyName: orgDisplayName,
          to: toList,
          cc: cc ? [cc] : [],
          subject,
          message,
          pdfBase64,
          pdfFilename: filename,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.ok) {
        desktopToast('success', 'Quotation Emailed', `Sent successfully to ${toList.length} recipient${toList.length > 1 ? 's' : ''}!`);
        if (onConfirmSend) await onConfirmSend();
        onClose();
        return;
      }

      // If server has no mail integration configured, give intuitive guidance and seamless webmail triggers
      if (data.needConnect || res.status === 404 || res.status === 502) {
        setErrorMsg(
          data.error ||
          'Server email service is not configured yet. You can launch Gmail, Outlook, or your local mail app with one click below.'
        );
        return;
      }

      setErrorMsg(data.error || 'Failed to dispatch email. Please check your recipient addresses and try again.');
    } catch (err: any) {
      console.error('Email send error:', err);
      setErrorMsg(err?.message || 'Server connection error. Use the webmail buttons below to send directly.');
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-5xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100">
              <MailCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Email Quotation</h3>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-700">
                  #{doc.quoteNo || 'DRAFT'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Review quotation details and preview the attached PDF before sending to {primaryClient}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Left form, Right PDF Preview */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 bg-slate-50/50">
          {/* Left: Email Details Form (5 cols on LG) */}
          <div className="lg:col-span-5 space-y-3.5 flex flex-col justify-between">
            <div className="space-y-3.5">
              {/* TO Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <span>To (Customer Recipients) <span className="text-rose-500">*</span></span>
                  </label>
                  <div className="flex items-center gap-2 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-blue-600 hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="text-slate-500 hover:underline cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                {/* Recipients Checklist */}
                <div className="space-y-1.5 max-h-36 overflow-y-auto p-1.5 rounded-xl bg-white border border-slate-200">
                  {recipients.length === 0 ? (
                    <div className="p-2.5 text-center text-xs text-slate-400">
                      No saved emails found for {primaryClient}. Add a recipient below.
                    </div>
                  ) : (
                    recipients.map(r => (
                      <label
                        key={r.id}
                        className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-all text-xs ${
                          r.checked
                            ? 'bg-blue-50/60 border-blue-200 text-slate-900'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={r.checked}
                            onChange={() => handleToggleRecipient(r.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <span className="font-semibold truncate">{r.email}</span>
                        </div>
                        {r.dept && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 shrink-0">
                            {r.label}
                          </span>
                        )}
                      </label>
                    ))
                  )}
                </div>

                {/* Add Custom Recipient Input */}
                <div className="flex gap-1.5 pt-0.5">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={customTo}
                      onChange={e => setCustomTo(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomTo();
                        }
                      }}
                      placeholder="+ Add extra email (e.g. manager@client.com)"
                      className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs font-medium text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs"
                    />
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                      <Plus size={14} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCustomTo}
                    className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* CC Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>CC (Your Organisation)</span>
                  <span className="text-[10px] text-slate-400">Auto copy</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={cc}
                    onChange={e => setCc(e.target.value)}
                    placeholder="organisation@example.com"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs font-medium text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs"
                  />
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                    <Building size={14} />
                  </div>
                </div>
              </div>

              {/* Subject Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Subject</label>
                <div className="relative">
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Quotation from Argus Technologies"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs font-medium text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs"
                  />
                  <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                    <FileText size={14} />
                  </div>
                </div>
              </div>

              {/* Message Body */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Message Body</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs resize-none leading-relaxed"
                  placeholder="Enter message for the customer..."
                />
              </div>

              {/* Attached File Indicator */}
              <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-2xl flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
                      <Paperclip size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate" title={filename}>
                        {filename}
                      </div>
                      <div className="text-[10px] text-blue-600 font-medium">
                        Official PDF Document Attached
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleOpenPdfTab}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                      title="Open PDF in new tab"
                    >
                      <ExternalLink size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                      title="Download PDF"
                    >
                      <Download size={15} />
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer pt-1 border-t border-blue-100">
                  <input
                    type="checkbox"
                    checked={withWorkings}
                    onChange={e => setWithWorkings(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Include Detailed Workings (BOM, Machining, Bought-Out Hardware)</span>
                </label>
              </div>

              {/* Error Notice */}
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-500" />
                  <div className="flex-1">{errorMsg}</div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Live PDF Preview (7 cols on LG) */}
          <div className="lg:col-span-7 flex flex-col h-full min-h-[400px] lg:min-h-[500px] bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden shadow-inner">
            <div className="px-3.5 py-2 bg-slate-200/80 border-b border-slate-300 flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <Mail size={14} className="text-blue-600" /> Live PDF Preview
              </span>
              <div className="flex items-center gap-2">
                {onOpenThemeModal && (
                  <button
                    type="button"
                    onClick={onOpenThemeModal}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-xs transition-all cursor-pointer"
                  >
                    <Palette size={12} /> Select Theme
                  </button>
                )}
                <span className="text-[10px] font-normal text-slate-500">A4 Portrait</span>
              </div>
            </div>

            <div className="flex-1 relative bg-slate-500">
              {pdfLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/20 backdrop-blur-xs text-white text-xs gap-2">
                  <Loader2 size={24} className="animate-spin text-white" />
                  <span>Generating quotation PDF preview...</span>
                </div>
              ) : pdfUrl ? (
                <iframe
                  src={`${pdfUrl}#navpanes=0&view=Fit`}
                  className="w-full h-full border-0"
                  title="Quotation PDF Document"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-xs text-slate-300">
                  {pdfErr || 'Could not load PDF preview'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-400">
            Delivered securely with quotation PDF attached.
          </div>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>

            {/* Quick Webmail / Mail Client options */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={handleOpenGmail}
                title="Compose in Gmail (downloads PDF to attach)"
                className="px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:text-blue-700 hover:bg-white rounded-lg transition-all cursor-pointer"
              >
                Gmail
              </button>
              <button
                type="button"
                onClick={handleOpenOutlook}
                title="Compose in Outlook (downloads PDF to attach)"
                className="px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:text-blue-700 hover:bg-white rounded-lg transition-all cursor-pointer"
              >
                Outlook
              </button>
              <button
                type="button"
                onClick={handleOpenMailApp}
                title="Open in default mail client (mailto:)"
                className="px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:text-blue-700 hover:bg-white rounded-lg transition-all cursor-pointer"
              >
                Mail App
              </button>
            </div>

            {/* Primary Direct Send Button */}
            <button
              type="button"
              onClick={handleSendEmail}
              disabled={sending}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-xl shadow-sm transition-all cursor-pointer"
            >
              {sending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Sending Email...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>Send Email</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
