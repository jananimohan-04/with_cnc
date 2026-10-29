/* Store Invoices — Dedicated Invoice History page: financial KPIs, search, and Rule 46 GST Tax Invoice PDF downloads. */
import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Receipt, Search, Calendar, Building2, ChevronRight, 
  FileText, ShoppingBag, Download, ArrowUpRight, CheckCircle2,
  FileSpreadsheet, ShieldCheck, IndianRupee, Layers, ExternalLink
} from 'lucide-react';
import { api, fmt } from '../../api';
import { Empty, Skeleton, PageHero, toast } from '../../components/ui';
import { downloadTaxInvoicePdf } from '../../utils/quotationInvoiceTemplates';

export default function Invoices() {
  const [invoices, setInvoices] = useState(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { 
    window.scrollTo(0, 0); 
  }, []);

  const loadInvoices = () => {
    api.get('/api/invoices')
      .then((data) => {
        const list = Array.isArray(data) ? data : (data?.rows || []);
        setInvoices(list);
      })
      .catch(() => setInvoices([]));
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const filtered = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        (inv.invoiceNo || '').toLowerCase().includes(s) ||
        (inv.orderId || '').toLowerCase().includes(s) ||
        (inv.poRef || '').toLowerCase().includes(s) ||
        (inv.customer || '').toLowerCase().includes(s) ||
        (inv.companyName || '').toLowerCase().includes(s) ||
        (inv.mobile || '').toLowerCase().includes(s)
      );
    });
  }, [invoices, q, statusFilter]);

  const stats = useMemo(() => {
    if (!invoices || !invoices.length) {
      return { totalRevenue: 0, totalTaxable: 0, totalGst: 0, count: 0 };
    }
    const totalRevenue = invoices.reduce((a, b) => a + (Number(b.total) || 0), 0);
    const totalTaxable = invoices.reduce((a, b) => a + (Number(b.taxableAmount) || 0), 0);
    const totalGst = invoices.reduce((a, b) => a + (Number(b.gstAmount) || 0), 0);
    return {
      totalRevenue,
      totalTaxable,
      totalGst,
      count: invoices.length
    };
  }, [invoices]);

  const handleDownload = (inv) => {
    try {
      const items = (inv.items || []).map((it) => ({
        pid: it.pid,
        name: it.name || it.pid,
        sku: it.sku || it.pid,
        price: it.price || 0,
        qty: it.qty || 1,
        uom: it.uom || 'Pc',
        hsn: it.hsn || '8466.93.90',
        brand: it.brand || ''
      }));

      const subtotal = inv.taxableAmount || items.reduce((a, b) => a + (Number(b.price) || 0) * (Number(b.qty) || 1), 0);

      downloadTaxInvoicePdf({
        invoiceNo: inv.invoiceNo,
        orderId: inv.orderId,
        companyId: inv.companyId || undefined,
        date: inv.date,
        dueDate: inv.dueDate,
        poRef: inv.poRef || '',
        customer: {
          name: inv.customer,
          companyName: inv.companyName || inv.customer,
          mobile: inv.mobile || '',
          address: inv.address || '—',
          city: inv.city || ''
        },
        items,
        taxableAmount: subtotal,
        gstAmount: inv.gstAmount || Math.round(subtotal * 0.18),
        total: inv.total || Math.round(subtotal * 1.18)
      });
      toast(`Tax Invoice ${inv.invoiceNo} opened for download`, '🧾');
    } catch (e) {
      toast('Failed to download invoice PDF', '⚠️');
    }
  };

  if (invoices === null) return <Skeleton h={280} />;

  return (
    <div className="space-y-6 w-full">
      <PageHero
        title={`Tax Invoice History (${invoices.length})`}
        subtitle="Official Rule 46 GST tax invoices, corporate credit records, and print-ready PDF downloads."
        icon={Receipt}
        badgeText="Rule 46 GST Compliance"
        badgeColor="emerald"
        gradient="from-emerald-600 via-teal-600 to-cyan-600"
        actions={
          <div className="flex items-center gap-2">
            <Link 
              to="/store/orders" 
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> View Purchase Orders
            </Link>
            <Link 
              to="/store/listing" 
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl transition-all shadow-sm shadow-emerald-500/30 cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5" /> Order from Catalog
            </Link>
          </div>
        }
      />

      {/* Financial KPIs Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Invoiced</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
            {fmt(stats.totalRevenue)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-500" /> Inclusive of 18% GST
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Invoices Issued</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
            {stats.count}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Official B2B tax documents
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Taxable Value</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
            {fmt(stats.totalTaxable)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Net industrial component value
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">GST Tax (18%)</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
            {fmt(stats.totalGst)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            CGST (9%) + SGST (9%) Breakdown
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input 
            type="text"
            placeholder="Search by invoice #, order ID, company, PO ref..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2">
          {q && (
            <button 
              type="button" 
              onClick={() => setQ('')} 
              className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1"
            >
              Clear Search
            </button>
          )}
          <span className="text-xs font-bold text-slate-400 ml-auto sm:ml-0">
            Showing {filtered.length} of {invoices.length} invoices
          </span>
        </div>
      </div>

      {/* Invoices Listing */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center max-w-md mx-auto shadow-xs">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Receipt className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">
            {invoices.length === 0 ? 'No invoices generated yet' : 'No matching invoices'}
          </h3>
          <p className="text-slate-500 text-xs mb-5">
            {invoices.length === 0 
              ? 'When orders are placed with Tax Invoice generation or raised by sales, they will appear here.' 
              : 'Try adjusting your search criteria.'}
          </p>
          <Link 
            to="/store/listing" 
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
          >
            Browse Industrial Catalog <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((inv) => {
            const itemCount = (inv.items || []).reduce((a, b) => a + (Number(b.qty) || 1), 0);
            return (
              <motion.div
                key={inv.invoiceNo}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-slate-200/90 hover:border-emerald-300 p-5 sm:p-6 transition-all shadow-xs hover:shadow-md"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-slate-900 text-sm tracking-tight">
                          {inv.invoiceNo}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {inv.status || 'Issued'}
                        </span>
                        {inv.poRef && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 font-mono">
                            PO: {inv.poRef}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          Invoice Date: <b className="text-slate-700">{inv.date}</b>
                        </span>
                        <span>•</span>
                        <span>
                          Due Date: <b className="text-slate-700">{inv.dueDate}</b>
                        </span>
                        {inv.orderId && inv.orderId !== '—' && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              Order Ref: 
                              <Link 
                                to={`/store/orders/${inv.orderId}`} 
                                className="font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-0.5"
                              >
                                #{inv.orderId}
                                <ArrowUpRight className="w-3 h-3" />
                              </Link>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Financial Total & Download Action */}
                  <div className="flex items-center justify-between md:justify-end gap-4">
                    <div className="text-left md:text-right">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Amount</div>
                      <div className="text-lg font-black text-slate-900 font-mono">
                        {fmt(inv.total)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Taxable: {fmt(inv.taxableAmount)} + GST: {fmt(inv.gstAmount)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownload(inv)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold text-xs rounded-xl transition-all shadow-sm hover:shadow cursor-pointer shrink-0"
                    >
                      <Download className="w-4 h-4 text-emerald-200" /> Download Tax Invoice (PDF)
                    </button>
                  </div>
                </div>

                {/* Recipient Organization & Items Preview */}
                <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" /> Billed To Organization
                    </div>
                    <div className="font-bold text-slate-900">{inv.companyName || inv.customer}</div>
                    <div className="text-slate-600">{inv.contact || inv.customer} • {inv.mobile || 'No phone'}</div>
                    <div className="text-slate-400 text-[11px] truncate">{inv.address}</div>
                  </div>

                  <div className="md:col-span-2 space-y-1">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Invoice Line Items ({itemCount} units across {(inv.items || []).length} SKU{inv.items?.length !== 1 ? 's' : ''})
                    </div>
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      {(inv.items || []).slice(0, 4).map((it, idx) => (
                        <span 
                          key={idx} 
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200/80 rounded-lg text-[11px] text-slate-700 font-medium"
                        >
                          <b className="text-emerald-700 font-mono">{it.qty}x</b> {it.name || it.pid}
                          <span className="text-slate-400 font-mono">({fmt(it.price)})</span>
                        </span>
                      ))}
                      {(inv.items || []).length > 4 && (
                        <span className="inline-flex items-center px-2 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-600">
                          +{(inv.items.length - 4)} more
                        </span>
                      )}
                    </div>
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
