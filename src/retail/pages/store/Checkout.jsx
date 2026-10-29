/* Store checkout — mirrors legacy vCheckout/ckBody: 2 steps, B2B validation, placeOrder. */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, User, Phone, Mail, MapPin, FileText, 
  ArrowRight, ArrowLeft, CheckCircle2, ShoppingBag, ShieldCheck,
  PackageCheck, Truck, AlertCircle, Loader2, Receipt
} from 'lucide-react';
import { api, fmt, getCart, setCart } from '../../api';
import { Empty, Skeleton, toast } from '../../components/ui';
import { downloadQuotationPdf, downloadTaxInvoicePdf } from '../../utils/quotationInvoiceTemplates';
import { asList } from './Home';

export default function Checkout() {
  const nav = useNavigate();
  const [products, setProducts] = useState(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState('Sharma Auto Components Pvt Ltd');
  const [name, setName] = useState('Priya Sharma');
  const [mobile, setMobile] = useState('98765 43210');
  const [email, setEmail] = useState('purchase@sharmaauto.in');
  const [po, setPo] = useState('');
  const [pin, setPin] = useState('411026');
  const [addr, setAddr] = useState('Plot 44, MIDC Bhosari, Pune');
  const [city, setCity] = useState('Pune');
  const [state, setState] = useState('Maharashtra');
  const [notes, setNotes] = useState('');

  useEffect(() => { window.scrollTo(0, 0); }, []);
  useEffect(() => {
    api.get('/api/products').then((d) => setProducts(asList(d))).catch(() => setProducts([]));
  }, []);

  if (products === null) return <Skeleton h={280} />;
  const prodById = (id) => products.find((p) => p.id === id);
  const cart = getCart();

  if (!cart.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center max-w-lg mx-auto shadow-xs">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">Cart is empty</h3>
        <p className="text-slate-500 text-sm mb-6">You have no items in your indent cart to checkout.</p>
        <Link 
          to="/store/listing" 
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm"
        >
          Browse Industrial Catalog <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const sub = cart.reduce((a, c) => { 
    const p = prodById(c.pid); 
    return a + (p && p.price != null ? p.price * c.qty : 0); 
  }, 0);

  const goStep = (n) => {
    if (n === 2) {
      const req = [
        [company, 'Company name'], 
        [name, 'Contact person'], 
        [mobile, 'Mobile number'], 
        [pin, 'PIN code'], 
        [addr, 'Delivery address']
      ];
      for (const [v, l] of req) {
        if (!String(v || '').trim()) { 
          toast(l + ' is required', '⚠️'); 
          return; 
        }
      }
    }
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const placeOrder = async () => {
    setBusy(true);
    const payload = {
      customer: name, 
      contact: name, 
      companyName: company, 
      mobile, 
      address: addr || '—',
      city, 
      poRef: po, 
      items: cart.map((c) => ({ pid: c.pid, qty: c.qty }))
    };
    try {
      const o = await api.post('/api/orders', payload);
      setCart([]);
      toast('Order ' + o.id + ' submitted • stock reserved', '🏭');
      nav('/store/confirmation/' + o.id);
    } catch (e) {
      toast(e.message || 'Failed to place order', '⚠️');
      setBusy(false);
    }
  };

  const placeOrderAndGenerateInvoice = async () => {
    const req = [
      [company, 'Company name'], 
      [name, 'Contact person'], 
      [mobile, 'Mobile number'], 
      [pin, 'PIN code'], 
      [addr, 'Delivery address']
    ];
    for (const [v, l] of req) {
      if (!String(v || '').trim()) { 
        toast(l + ' is required to generate Tax Invoice', '⚠️'); 
        setStep(1);
        return; 
      }
    }

    setBusy(true);
    const quoteItems = cart.map((c) => {
      const p = prodById(c.pid) || { name: c.pid, sku: c.pid, price: 0, uom: 'Pc' };
      return {
        pid: c.pid,
        name: p.name,
        sku: p.sku || c.pid,
        price: p.price || 0,
        qty: c.qty,
        uom: p.uom || 'Pc',
        hsn: p.hsn || '8466.93.90',
        brand: p.brand || ''
      };
    });

    const payload = {
      customer: name, 
      contact: name, 
      companyName: company, 
      mobile, 
      address: addr ? `${addr}, ${city}, ${state} - ${pin}` : (addr || '—'),
      city, 
      poRef: po, 
      items: cart.map((c) => ({ pid: c.pid, qty: c.qty })),
      generateInvoice: true
    };

    try {
      const o = await api.post('/api/orders', payload);
      setCart([]);

      const invoiceData = {
        invoiceNo: o.invoiceNo,
        orderId: o.id,
        date: o.invoiceDate || new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        dueDate: o.invoiceDueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        poRef: po || '',
        customer: {
          name: name || o.customer,
          companyName: company || o.companyName,
          mobile: mobile || o.mobile,
          email: email || '',
          address: addr ? `${addr}, ${city}, ${state} - ${pin}` : (o.address || ''),
          city: city || 'Pune',
          state: state || 'Maharashtra',
          pin: pin || ''
        },
        items: quoteItems,
        notes: notes || '',
        taxableAmount: sub,
        gstAmount: Math.round(sub * 0.18),
        total: Math.round(sub * 1.18)
      };

      downloadTaxInvoicePdf(invoiceData);
      toast(`Tax Invoice ${o.invoiceNo} generated & Order #${o.id} confirmed!`, '🧾');
      nav('/store/confirmation/' + o.id);
    } catch (e) {
      toast(e.message || 'Failed to place order and generate invoice', '⚠️');
      setBusy(false);
    }
  };

  const handleDownloadQuotation = async () => {
    const quoteItems = cart.map((c) => {
      const p = prodById(c.pid) || { name: c.pid, sku: c.pid, price: 0, uom: 'Pc' };
      return {
        pid: c.pid,
        name: p.name,
        sku: p.sku || c.pid,
        price: p.price || 0,
        qty: c.qty,
        uom: p.uom || 'Pc',
        hsn: p.hsn || '8466'
      };
    });

    const quoteData = {
      customer: name || 'Valued Client',
      contact: name || 'Valued Client',
      companyName: company || 'Valued Enterprise',
      mobile: mobile || '',
      email: email || '',
      address: addr ? `${addr}, ${city}, ${state} - ${pin}` : '',
      city: city || 'Pune',
      state: state || 'Maharashtra',
      pin: pin || '',
      poRef: po || '',
      notes: notes || '',
      items: quoteItems,
      taxableAmount: sub,
      gstAmount: Math.round(sub * 0.18),
      total: Math.round(sub * 1.18)
    };

    try {
      const res = await api.post('/api/quotations', quoteData);
      if (res && res.id) {
        quoteData.quoteNo = res.id;
        quoteData.id = res.id;
      }
    } catch (e) {
      console.warn('Could not save quote to backend:', e);
    }

    downloadQuotationPdf(quoteData);
    toast('Official B2B Quotation PDF generated', '📄');
  };

  return (
    <div className="space-y-6 w-full">
      {/* Header & Back Link */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Checkout — Purchase Order</h1>
          <p className="text-xs text-slate-500 mt-1">Official B2B procurement requisition with inventory lock</p>
        </div>
        <Link 
          to="/store/cart" 
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Cart
        </Link>
      </div>

      {/* Stepper Header */}
      <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
        <button
          type="button"
          onClick={() => goStep(1)}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold transition-all border ${
            step === 1 
              ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>1. Company & Delivery</span>
        </button>
        <button
          type="button"
          onClick={() => goStep(2)}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold transition-all border ${
            step === 2 
              ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          <span>2. Review Indent</span>
        </button>
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs"
          >
            <div className="flex items-center gap-3 pb-5 mb-6 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Organization & Delivery Location</h2>
                <p className="text-xs text-slate-500">Provide procurement entity details for tax invoicing and logistics</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" /> Company Name <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={company} 
                  onChange={(e) => setCompany(e.target.value)} 
                  placeholder="e.g. Acme Precision Tools Pvt Ltd"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl outline-hidden transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" /> Contact Person <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="Authorized officer name"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl outline-hidden transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> Mobile Number <span className="text-red-500">*</span>
                </label>
                <input 
                  type="tel" 
                  value={mobile} 
                  onChange={(e) => setMobile(e.target.value)} 
                  placeholder="+91 98765 43210"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl outline-hidden transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" /> Official Email
                </label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="procurement@company.in"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl outline-hidden transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" /> PO Reference Number (Optional)
                </label>
                <input 
                  type="text" 
                  value={po} 
                  onChange={(e) => setPo(e.target.value)} 
                  placeholder="e.g. PO/ARGUS/26/108"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl outline-hidden transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> Postal PIN Code <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={pin} 
                  onChange={(e) => setPin(e.target.value)} 
                  placeholder="411026"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl outline-hidden transition-all"
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> Delivery Address / Plant Bay <span className="text-red-500">*</span>
                </label>
                <textarea 
                  rows={2} 
                  value={addr} 
                  onChange={(e) => setAddr(e.target.value)} 
                  placeholder="Plot number, industrial area, street, landmark"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl outline-hidden transition-all resize-y"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">City <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={city} 
                  onChange={(e) => setCity(e.target.value)} 
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl outline-hidden transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">State / Region <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  value={state} 
                  onChange={(e) => setState(e.target.value)} 
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl outline-hidden transition-all"
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Unloading / Security Instructions (Optional)</label>
                <input 
                  type="text" 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)} 
                  placeholder="e.g. Unloading Bay 2, call stores incharge before arrival"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl outline-hidden transition-all"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-5 border-t border-slate-100 flex-wrap">
              <button 
                type="button" 
                onClick={handleDownloadQuotation}
                className="inline-flex items-center gap-2 px-5 py-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold text-sm rounded-xl transition-all shadow-xs cursor-pointer"
              >
                <FileText className="w-4 h-4 text-blue-600" /> Download Quotation (PDF)
              </button>
              <button 
                type="button" 
                onClick={() => goStep(2)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm hover:shadow-md cursor-pointer ml-auto"
              >
                Review Line Items <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Line Items List */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Line Items Review ({cart.length})</h2>
                  <p className="text-xs text-slate-500">Verify quantities and items prior to submitting indent</p>
                </div>
                <button
                  type="button"
                  onClick={() => goStep(1)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                  Edit details
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {cart.map((c) => {
                  const p = prodById(c.pid) || { name: c.pid, sku: c.pid, price: 0 };
                  const itemTotal = p.price != null ? p.price * c.qty : null;
                  return (
                    <div key={c.pid} className="py-3.5 flex items-center gap-4">
                      <img 
                        src={(p.images || [])[0] || ''} 
                        onError={(e) => { e.currentTarget.src = `https://picsum.photos/seed/${p.sku || c.pid}/200/200`; }} 
                        className="w-14 h-14 rounded-xl object-cover border border-slate-200 bg-slate-50 flex-shrink-0" 
                        alt={p.name} 
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900 text-sm truncate">{p.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          SKU: <span className="font-mono text-slate-700">{p.sku || c.pid}</span> • {c.qty} {p.uom || 'Pc'} × {fmt(p.price)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-900 text-sm">{fmt(itemTotal)}</div>
                        <span className="text-[10px] text-slate-400 font-medium">Excl. GST</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Delivery Destination Summary */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60 mt-4 text-xs space-y-1">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" /> Dispatch Destination:
                </div>
                <div className="text-slate-600 font-semibold">{company} — Attn: {name} ({mobile})</div>
                <div className="text-slate-500">{addr}, {city}, {state} - {pin}</div>
                {po && <div className="text-blue-700 font-mono pt-1">PO Reference: {po}</div>}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => goStep(1)} 
                  className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl transition-all"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Information
                </button>
                <Link 
                  to="/store/cart" 
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 ml-auto"
                >
                  Modify Cart
                </Link>
              </div>
            </div>

            {/* Payable / Submit Card */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
                <h3 className="font-bold text-slate-900 text-sm pb-3 border-b border-slate-100 flex items-center justify-between">
                  <span>Requisition Summary</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                </h3>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Taxable Subtotal</span>
                    <span className="font-bold text-slate-900 font-mono">{fmt(sub)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>GST (CGST + SGST 18%)</span>
                    <span className="text-slate-500">Invoiced as per ERP</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Freight / Logistics</span>
                    <span className="text-emerald-600 font-semibold">Standard Freight</span>
                  </div>
                  <div className="border-t border-slate-200 pt-3 flex justify-between items-baseline">
                    <span className="font-extrabold text-slate-900 text-sm">Estimated Total</span>
                    <span className="font-black text-blue-600 text-xl font-mono">{fmt(sub)}</span>
                  </div>
                </div>

                <div className="bg-blue-50/60 rounded-xl p-3 border border-blue-100 text-[11px] text-blue-900 leading-relaxed">
                  <p className="font-bold mb-0.5">🏭 B2B Commercial Requisition</p>
                  Order status will be set to <b>Pending</b>. Inventory is instantaneously deducted in real-time.
                </div>

                <button 
                  type="button" 
                  disabled={busy} 
                  onClick={placeOrderAndGenerateInvoice}
                  className="w-full flex items-center justify-center gap-2 py-3 px-5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-50 text-white font-black text-sm rounded-xl transition-all shadow-md hover:shadow-lg cursor-pointer"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Generating Tax Invoice…
                    </>
                  ) : (
                    <>
                      <Receipt className="w-4 h-4 text-emerald-200" /> Confirm & Generate Tax Invoice (PDF)
                    </>
                  )}
                </button>

                <button 
                  type="button" 
                  disabled={busy} 
                  onClick={placeOrder}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs hover:shadow-md cursor-pointer"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Submitting Indent…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> Place Standard Indent Order ({fmt(sub)})
                    </>
                  )}
                </button>

                <button 
                  type="button" 
                  onClick={handleDownloadQuotation}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-blue-600" /> Download Proforma Quotation (PDF)
                </button>

                <p className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Re-validates stock & creates audit trail
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
