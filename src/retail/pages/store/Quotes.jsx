/* Store quotes — mirrors legacy vMyQuotes: RFQs with quoted prices + admin notes + Tax Invoice generation. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  FileText, ShoppingBag, Clock, ChevronRight, CheckCircle2, 
  HelpCircle, AlertCircle, ArrowRight, Receipt, Download, Loader2, Check
} from 'lucide-react';
import { api, fmt } from '../../api';
import { Empty, Skeleton, statusBadge, PageHero, toast } from '../../components/ui';
import { downloadQuotationPdf, downloadTaxInvoicePdf } from '../../utils/quotationInvoiceTemplates';
import { asList } from './Home';

export default function Quotes() {
  const [quotes, setQuotes] = useState(null);
  const [products, setProducts] = useState([]);
  const [raisingId, setRaisingId] = useState(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    api.get('/api/quotations').then((d) => setQuotes(asList(d))).catch(() => setQuotes([]));
    api.get('/api/products').then((d) => setProducts(asList(d))).catch(() => {});
  }, []);

  if (quotes === null) return <Skeleton h={280} />;
  const prodById = (pid) => products.find((p) => p.id === pid) || { name: pid, sku: pid, images: [] };

  const prepareQuoteData = (q) => {
    let items = [];
    if (Array.isArray(q.items) && q.items.length > 0) {
      items = q.items.map(it => {
        const p = prodById(it.pid);
        return {
          pid: it.pid,
          name: it.name || p.name || it.pid,
          sku: it.sku || p.sku || it.pid,
          price: it.price != null ? it.price : (p.price || 0),
          qty: it.qty || 1,
          uom: it.uom || p.uom || 'Pc',
          hsn: it.hsn || p.hsn || '8466'
        };
      });
    } else {
      const p = prodById(q.pid);
      const unitPrice = q.quotePrice != null ? q.quotePrice : (p.price || 0);
      items = [{
        pid: q.pid,
        name: p.name,
        sku: p.sku || q.pid,
        price: unitPrice,
        qty: q.qty || 1,
        uom: p.uom || 'Pc',
        hsn: p.hsn || '8466'
      }];
    }

    const taxable = q.taxableAmount || items.reduce((acc, it) => acc + (it.price * it.qty), 0);
    const gst = q.gstAmount || Math.round(taxable * 0.18);
    const total = q.total || (taxable + gst);

    return {
      quoteNo: q.id,
      companyId: q.companyId || undefined,
      date: q.date || new Date().toISOString().slice(0, 10),
      validUntil: q.validUntil,
      customer: q.customer || q.contact || 'Valued Client',
      companyName: q.companyName || 'Valued Enterprise',
      mobile: q.mobile || '',
      email: q.email || '',
      address: q.address || '',
      city: q.city || '',
      state: q.state || 'Maharashtra',
      pin: q.pin || '',
      poRef: q.poRef || '',
      notes: q.techReq || q.notes || q.adminNote || '',
      items,
      taxableAmount: taxable,
      gstAmount: gst,
      total
    };
  };

  const prepareInvoiceData = (q) => {
    const quoteData = prepareQuoteData(q);
    return {
      ...quoteData,
      invoiceNo: q.invoiceNo || `INV/2026-27/${q.id.replace(/\D/g, '').slice(-4) || '1001'}`,
      date: q.invoiceDate || new Date().toISOString().slice(0, 10),
      dueDate: q.invoiceDueDate || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
      orderId: q.orderId || q.id,
      paymentStatus: 'Pending (Net 15)',
      paymentMethod: 'Bank Wire / RTGS'
    };
  };

  const handleRaiseInvoice = async (q) => {
    try {
      setRaisingId(q.id);
      const res = await api.post(`/api/quotations/${q.id}/raise-invoice`);
      const invNo = res.invoiceNo || `INV/2026-27/${q.id.replace(/\D/g, '').slice(-4) || '1001'}`;
      const updated = {
        ...q,
        status: 'Accepted',
        invoiced: true,
        invoiceNo: invNo,
        invoiceDate: res.invoiceDate || new Date().toISOString().slice(0, 10),
        orderId: res.orderId
      };
      setQuotes((prev) => prev.map((item) => (item.id === q.id ? updated : item)));
      toast(`Tax Invoice ${invNo} raised & confirmed!`, '🧾');
      downloadTaxInvoicePdf(prepareInvoiceData(updated));
    } catch (err) {
      toast(err.message || 'Failed to raise invoice', '⚠️');
    } finally {
      setRaisingId(null);
    }
  };

  return (
    <div className="space-y-6 w-full">
      <PageHero
        title={`Quotation Pipeline (${quotes.length})`}
        subtitle="Manage official commercial quotations, review approved pricing, and raise legal GST Tax Invoices."
        icon={FileText}
        badgeText="Quotation & Invoicing"
        badgeColor="orange"
        gradient="from-orange-500 via-amber-500 to-red-500"
        actions={
          <Link 
            to="/store/listing" 
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-orange-600/30 cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5" /> Browse Catalog
          </Link>
        }
      />

      {quotes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center max-w-md mx-auto shadow-xs">
          <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">No quotation requests yet</h3>
          <p className="text-slate-500 text-xs mb-5">
            You haven't requested any custom pricing or bulk quotation indents yet.
          </p>
          <Link 
            to="/store/listing" 
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
          >
            Explore Catalog <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {quotes.map((q) => {
            const hasMultipleItems = Array.isArray(q.items) && q.items.length > 0;
            const p = prodById(q.pid || (hasMultipleItems ? q.items[0].pid : ''));
            const isInvoiced = q.invoiced || !!q.invoiceNo || q.status === 'Accepted';
            const quoteData = prepareQuoteData(q);

            return (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs hover:shadow-xs transition-all space-y-4"
              >
                <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
                  <img 
                    src={(p.images || [])[0] || ''} 
                    onError={(e) => { e.currentTarget.src = `https://picsum.photos/seed/${q.id}/100/100`; }} 
                    className="w-16 h-16 rounded-xl object-cover border border-slate-200 bg-slate-50 flex-shrink-0" 
                    alt={p.name || q.id} 
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-900 text-sm font-mono">{q.id}</span>
                      <span className="text-slate-300">•</span>
                      <span className="font-bold text-slate-800 text-sm">
                        {hasMultipleItems ? `${q.items.length} Commercial Indent Items` : p.name}
                      </span>
                      {isInvoiced && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <Check className="w-3 h-3" /> Invoiced: {q.invoiceNo || 'INV-Generated'}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                      {q.companyName && (
                        <>
                          <span className="font-bold text-slate-700">{q.companyName}</span>
                          <span>•</span>
                        </>
                      )}
                      <span>Date: <span className="font-mono text-slate-700">{q.date}</span></span>
                      <span>•</span>
                      <span>Est. Total: <b className="font-mono text-blue-700">{fmt(quoteData.total)}</b></span>
                    </div>

                    {hasMultipleItems ? (
                      <div className="mt-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
                        <div className="font-bold text-slate-700">Line Items in Quotation:</div>
                        <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
                          {q.items.slice(0, 3).map((it, idx) => (
                            <li key={idx}>
                              <span className="font-medium text-slate-800">{it.name || it.pid}</span> ({it.qty} {it.uom || 'Pc'})
                            </li>
                          ))}
                          {q.items.length > 3 && (
                            <li className="text-slate-400 italic">+ {q.items.length - 3} more line items</li>
                          )}
                        </ul>
                      </div>
                    ) : (
                      q.techReq && (
                        <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 mt-2">
                          <span className="font-bold text-slate-700">Technical Requirement:</span> {q.techReq}
                        </p>
                      )
                    )}
                  </div>

                  <div className="text-right flex flex-col items-end gap-1.5 min-w-[130px]">
                    <div>{statusBadge(q.status)}</div>
                    {quoteData.taxableAmount > 0 ? (
                      <div className="mt-1">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Estimated Total</span>
                        <span className="font-black text-slate-900 text-sm font-mono">{fmt(quoteData.total)}</span>
                        <span className="text-[10px] text-slate-400 block">Incl. 18% GST</span>
                      </div>
                    ) : (
                      <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                        Awaiting Quote
                      </span>
                    )}
                  </div>
                </div>

                {q.adminNote && (
                  <div className="pt-2 border-t border-slate-100 text-xs text-blue-900 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100/60">
                    <span className="font-bold">🏭 Supplier Note:</span> {q.adminNote}
                  </div>
                )}

                {/* Quotation & Invoice Action Toolbar */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs text-slate-500">
                    {isInvoiced ? (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Confirmed Order & Tax Invoice Generated
                      </span>
                    ) : (
                      <span>Quotation ready for confirmation & legal invoice raising</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Always allow downloading official quotation PDF */}
                    <button
                      type="button"
                      onClick={() => {
                        downloadQuotationPdf(quoteData);
                        toast('Commercial Quotation PDF opened', '📄');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-xs rounded-lg transition-all shadow-2xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600" /> Quotation (PDF)
                    </button>

                    {/* If already invoiced, provide Tax Invoice Download */}
                    {isInvoiced ? (
                      <button
                        type="button"
                        onClick={() => {
                          downloadTaxInvoicePdf(prepareInvoiceData(q));
                          toast('GST Tax Invoice PDF opened', '🧾');
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-all shadow-2xs cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5" /> Tax Invoice (PDF)
                      </button>
                    ) : (
                      /* If not yet invoiced, allow Confirm & Raise Tax Invoice */
                      <button
                        type="button"
                        disabled={raisingId === q.id}
                        onClick={() => handleRaiseInvoice(q)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-all shadow-xs hover:shadow-md cursor-pointer"
                      >
                        {raisingId === q.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Raising Invoice…
                          </>
                        ) : (
                          <>
                            <Receipt className="w-3.5 h-3.5" /> Confirm & Raise Invoice
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
