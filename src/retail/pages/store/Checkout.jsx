/* Store checkout — mirrors legacy vCheckout/ckBody: 2 steps, B2B validation, placeOrder. */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, User, Phone, Mail, MapPin, FileText, 
  ArrowRight, ArrowLeft, CheckCircle2, ShoppingBag, ShieldCheck,
  PackageCheck, Truck, AlertCircle, Loader2, Receipt, Send, BadgePercent
} from 'lucide-react';
import { api, fmt, getCart, setCart } from '../../api';
import { Empty, Skeleton, toast } from '../../components/ui';
import { downloadQuotationPdf, downloadTaxInvoicePdf, discountAmountOf } from '../../utils/quotationInvoiceTemplates';
import { asList } from './Home';

export default function Checkout() {
  const nav = useNavigate();
  const [products, setProducts] = useState(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [po, setPo] = useState('');
  const [pin, setPin] = useState('');
  const [addr, setAddr] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [notes, setNotes] = useState('');
  const [dType, setDType] = useState('percent');   // optional discount: percent | amount
  const [dVal, setDVal] = useState('');
  const [quote, setQuote] = useState(null);        // the quotation already created / e-mailed from this checkout
  const [mailMsg, setMailMsg] = useState(null);    // { ok, text }

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

  const disc = discountAmountOf(sub, dType, dVal);
  const taxable = sub - disc;
  const gst = Math.round(taxable * 0.18 * 100) / 100;
  const grand = Math.round((taxable + gst) * 100) / 100;

  /* name, phone, e-mail and address are needed so the quotation / invoice can be e-mailed to the customer */
  const missingDetail = () => {
    const req = [
      [name, 'Customer name'], [mobile, 'Phone number'], [email, 'E-mail address'], [addr, 'Address'],
      [company, 'Company name'], [pin, 'PIN code'],
    ];
    for (const [v, l] of req) if (!String(v || '').trim()) return l + ' is required';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return 'Enter a valid e-mail address';
    return '';
  };

  const goStep = (n) => {
    if (n === 2) {
      const m = missingDetail();
      if (m) { toast(m, '⚠️'); return; }
    }
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const quoteItems = () => cart.map((c) => {
    const p = prodById(c.pid) || { name: c.pid, sku: c.pid, price: 0, uom: 'Pc' };
    return { pid: c.pid, name: p.name, sku: p.sku || c.pid, price: p.price || 0, qty: c.qty, uom: p.uom || 'Pc', hsn: p.hsn || '8466.93.90', brand: p.brand || '' };
  });
  const fullAddress = () => (addr ? `${addr}${city ? ', ' + city : ''}${state ? ', ' + state : ''}${pin ? ' - ' + pin : ''}` : '');
  const quotePayload = () => ({
    contact: name, companyName: company, mobile, email: email.trim(), address: fullAddress(), city, state, pin, poRef: po, techReq: notes,
    items: quoteItems(), discountType: dType, discountValue: Number(dVal) || 0,
  });

  /* the quotation is created once per set of details; changing a detail or the discount makes a fresh one */
  const makeQuote = async () => {
    const payload = quotePayload();
    const key = JSON.stringify(payload);
    if (quote && quote.key === key) return quote.id;
    const q = await api.post('/api/quotations', payload);
    setQuote({ id: q.id, key });
    return q.id;
  };

  /* generate the quotation and e-mail it to the customer (the invoice follows only after the customer confirms) */
  const sendQuotation = async () => {
    const m = missingDetail();
    if (m) { toast(m, '⚠️'); return; }
    setBusy(true); setMailMsg(null);
    try {
      const qid = await makeQuote();
      try {
        await api.post(`/api/quotations/${qid}/send-mail`, {});
        setMailMsg({ ok: true, text: `Quotation ${qid} was e-mailed to ${email.trim()}. When the customer presses "Confirm", the tax invoice and payment link are e-mailed automatically.` });
        toast('Quotation e-mailed to ' + email.trim(), '📧');
      } catch (e) {
        setMailMsg({ ok: false, text: `Quotation ${qid} was saved, but the e-mail could not be sent: ${e.message || e}` });
      }
    } catch (e) {
      toast(e.message || 'Could not create the quotation', '⚠️');
    }
    setBusy(false);
  };

  /* share the quotation on WhatsApp (opens WhatsApp with the message and the customer's Confirm link) */
  const shareQuotationWhatsApp = async () => {
    const m = missingDetail();
    if (m) { toast(m, '⚠️'); return; }
    setBusy(true);
    try {
      const qid = await makeQuote();
      const res = await api.post(`/api/quotations/${qid}/share`, { channel: 'whatsapp', kind: 'quotation' });
      window.open(res.whatsapp, '_blank', 'noopener');
      setMailMsg({ ok: true, text: `Quotation ${qid} is ready to send on WhatsApp. The invoice follows after the customer confirms.` });
    } catch (e) {
      toast(e.message || 'Could not prepare the WhatsApp message', '⚠️');
    }
    setBusy(false);
  };

  const finish = () => { setCart([]); nav('/store/quotes'); };

  const handleDownloadQuotation = async () => {
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
      items: quoteItems(),
      discountType: dType,
      discountValue: Number(dVal) || 0,
      taxableAmount: taxable,
      gstAmount: gst,
      total: grand
    };

    try {
      const res = await api.post('/api/quotations', { ...quoteData, items: quoteItems() });
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
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Checkout — Quotation</h1>
          <p className="text-xs text-slate-500 mt-1">Generate, e-mail or share the quotation. The invoice comes after the customer confirms.</p>
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
                  <User className="w-3.5 h-3.5 text-slate-400" /> Customer Name <span className="text-red-500">*</span>
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
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> Phone Number <span className="text-red-500">*</span>
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
                  <Mail className="w-3.5 h-3.5 text-slate-400" /> E-mail ID <span className="text-red-500">*</span> <span className="font-medium text-slate-400">(quotation &amp; invoice are sent here)</span>
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


              <div className="sm:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <label className="text-xs font-bold text-emerald-900 flex items-center gap-1.5 mb-2">
                  <BadgePercent className="w-4 h-4 text-emerald-600" /> Discount for this customer <span className="font-medium text-emerald-700">(optional — shown highlighted in the quotation, invoice and e-mail)</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-xl overflow-hidden border border-emerald-300">
                    <button type="button" onClick={() => setDType('percent')} className={`px-3 py-2 text-xs font-bold ${dType === 'percent' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-800'}`}>%</button>
                    <button type="button" onClick={() => setDType('amount')} className={`px-3 py-2 text-xs font-bold ${dType === 'amount' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-800'}`}>₹ Amount</button>
                  </div>
                  <input type="number" min="0" step="any" value={dVal} onChange={(e) => setDVal(e.target.value)}
                    placeholder={dType === 'percent' ? 'e.g. 5' : 'e.g. 500'}
                    className="w-36 px-3 py-2 text-sm bg-white border border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 rounded-xl outline-hidden" />
                  {disc > 0 && <span className="text-xs font-extrabold text-emerald-700">Customer saves {fmt(disc)}</span>}
                </div>
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

            {mailMsg && (
              <div className={`mb-4 rounded-xl border p-3 text-xs font-semibold ${mailMsg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                {mailMsg.ok ? '✅ ' : '⚠️ '}{mailMsg.text}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 pt-5 border-t border-slate-100 flex-wrap">
              <button
                type="button"
                disabled={busy}
                onClick={sendQuotation}
                className="inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all shadow-sm cursor-pointer"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {quote ? 'E-mail Quotation Again' : 'E-mail Quotation to Customer'}
              </button>
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
                          {c.qty} {p.uom || 'Pc'} × {fmt(p.price)}
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
                  {disc > 0 && (
                    <div className="flex justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1.5 text-emerald-800 font-extrabold">
                      <span>Discount{dType === 'percent' ? ` (${Number(dVal)}%)` : ''}</span>
                      <span className="font-mono">− {fmt(disc)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>GST (CGST + SGST 18%)</span>
                    <span className="font-bold text-slate-900 font-mono">{fmt(gst)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <BadgePercent className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[11px] text-slate-500">Discount</span>
                    <div className="inline-flex rounded-lg overflow-hidden border border-slate-200 ml-auto">
                      <button type="button" onClick={() => setDType('percent')} className={`px-2 py-1 text-[11px] font-bold ${dType === 'percent' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600'}`}>%</button>
                      <button type="button" onClick={() => setDType('amount')} className={`px-2 py-1 text-[11px] font-bold ${dType === 'amount' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600'}`}>₹</button>
                    </div>
                    <input type="number" min="0" step="any" value={dVal} onChange={(e) => setDVal(e.target.value)} placeholder="0"
                      className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-lg outline-hidden focus:border-emerald-500" />
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Freight / Logistics</span>
                    <span className="text-emerald-600 font-semibold">Standard Freight</span>
                  </div>
                  <div className="border-t border-slate-200 pt-3 flex justify-between items-baseline">
                    <span className="font-extrabold text-slate-900 text-sm">Estimated Total</span>
                    <span className="font-black text-blue-600 text-xl font-mono">{fmt(grand)}</span>
                  </div>
                </div>

                <div className="bg-blue-50/60 rounded-xl p-3 border border-blue-100 text-[11px] text-blue-900 leading-relaxed">
                  <p className="font-bold mb-0.5">① Quotation first</p>
                  Send the quotation to the customer. The <b>tax invoice and payment link</b> are sent only after the customer confirms it.
                </div>

                {mailMsg && (
                  <div className={`rounded-xl border p-3 text-xs font-semibold ${mailMsg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                    {mailMsg.ok ? '✅ ' : '⚠️ '}{mailMsg.text}
                    {mailMsg.ok && <button type="button" onClick={finish} className="block mt-2 font-extrabold underline cursor-pointer">Done — view my quotations →</button>}
                  </div>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={sendQuotation}
                  className="w-full flex items-center justify-center gap-2 py-3 px-5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-50 text-white font-black text-sm rounded-xl transition-all shadow-md hover:shadow-lg cursor-pointer"
                >
                  {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Working…</> : <><Send className="w-4 h-4" /> Generate & E-mail Quotation</>}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={shareQuotationWhatsApp}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs cursor-pointer"
                >
                  Share Quotation on WhatsApp
                </button>
                <button
                  type="button"
                  onClick={handleDownloadQuotation}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-blue-600" /> Download Quotation (PDF)
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
