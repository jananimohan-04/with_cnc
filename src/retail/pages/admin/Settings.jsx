/* Company store & invoice profile settings — GET + PUT /api/settings & /api/settings/invoice-profile.
   Supports full customization of Company branding, addresses, GSTIN/PAN/CIN, bank accounts,
   NPCI UPI payment QR code generation, and authorized digital signatures for quotations and invoices.
   Includes role-based access: Super Admin can configure any company; Company Admin configures their own. */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings as SettingsIcon, Save, Building2, Percent, 
  Hash, AlertTriangle, Megaphone, Loader2, CheckCircle2,
  FileText, Receipt, QrCode, Upload, Trash2, RefreshCw, 
  Eye, Landmark, Stamp, ShieldCheck, Mail, Phone, MapPin, 
  HelpCircle, ChevronDown, Check, ArrowRight
} from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Skeleton, toast, PageHero } from '../../components/ui';
import { 
  generateUpiQrCode, 
  downloadQuotationPdf, 
  downloadTaxInvoicePdf 
} from '../../utils/quotationInvoiceTemplates';

const DEFAULT_INVOICE_PROFILE = {
  companyName: 'ARGUS CNC TECHNOLOGIES PVT. LTD.',
  tagline: 'High-Precision CNC Machine Tools & Connected Factory Automation',
  logo: '',
  regAddress: 'Plot 18, Sector 10, MIDC Industrial Area, Bhosari',
  city: 'Pune',
  state: 'Maharashtra',
  stateCode: '27 (Maharashtra)',
  pin: '411026',
  country: 'India',
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
  quotationTerms: '1. Prices quoted are firm and valid for 30 calendar days.\n2. Payment: 100% against proforma invoice or agreed credit terms.\n3. GST charged extra as statutory regulations.\n4. Delivery: Ready stock within 48h; custom items 5-7 days.',
  invoiceTerms: '1. Declared that particulars in invoice are true and correct.\n2. Interest @ 18% p.a. charged on delayed payments beyond due date.\n3. Goods once sold cannot be returned without prior RMA.\n4. Disputes subject to exclusive jurisdiction of Pune, Maharashtra courts.'
};

export default function Settings({ defaultTab }) {
  const { me } = useAuth();
  const isSuperAdmin = me?.role === 'super_admin';

  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get('tab') || defaultTab;
  const queryCid = searchParams.get('companyId');

  // Navigation tab: 'store' | 'invoice'
  const [activeTab, setActiveTab] = useState(queryTab === 'invoice' ? 'invoice' : (defaultTab || 'store'));

  // Company selection (for super admin)
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(queryCid || me?.companyId || 'C-ARGUS');
  const [coName, setCoName] = useState('');

  useEffect(() => {
    if (queryTab === 'invoice' || queryTab === 'store') {
      setActiveTab(queryTab);
    }
  }, [queryTab]);

  useEffect(() => {
    if (queryCid && isSuperAdmin) {
      setSelectedCompanyId(queryCid);
    }
  }, [queryCid, isSuperAdmin]);

  const handleTabChange = (t) => {
    setActiveTab(t);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', t);
      return next;
    });
  };

  const handleCompanyChange = (cid) => {
    setSelectedCompanyId(cid);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('companyId', cid);
      return next;
    });
  };

  // Storefront settings state
  const [f, setF] = useState(null);
  const [busyStore, setBusyStore] = useState(false);
  const [errStore, setErrStore] = useState('');

  // Invoice profile state
  const [invProfile, setInvProfile] = useState(DEFAULT_INVOICE_PROFILE);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [busyInvoice, setBusyInvoice] = useState(false);
  const [errInvoice, setErrInvoice] = useState('');

  // Live QR tester state
  const [testAmount, setTestAmount] = useState('25000');
  const [qrPreviewUrl, setQrPreviewUrl] = useState('');

  // 1. Fetch companies list if super_admin
  useEffect(() => {
    if (isSuperAdmin) {
      api.get('/api/companies?limit=200')
        .then((res) => {
          const list = Array.isArray(res) ? res : (res?.rows || []);
          setCompanies(list);
          if (list.length > 0 && !selectedCompanyId) {
            setSelectedCompanyId(list[0].id);
          }
        })
        .catch((err) => {
          console.warn('Could not load companies list:', err);
        });
    }
  }, [isSuperAdmin]);

  // 2. Fetch Storefront settings
  useEffect(() => {
    let on = true;
    api.get('/api/settings')
      .then((s) => {
        if (!on) return;
        setF({
          storeName: s.storeName || '', 
          warehouse: s.warehouse || 'WH-Pune-01',
          taxPct: s.taxPct != null ? s.taxPct : 18, 
          orderPrefix: s.orderPrefix || 'ORD-',
          quotePrefix: s.quotePrefix || 'Q-', 
          lowStockThreshold: s.lowStockThreshold != null ? s.lowStockThreshold : 10,
          announcement: s.announcement || 'GST invoice on all orders • Bulk pricing on request'
        });
      })
      .catch((e) => { if (on) setErrStore(e.message); });

    const targetCid = isSuperAdmin ? selectedCompanyId : me?.companyId;
    if (targetCid) {
      api.get('/api/companies/' + targetCid)
        .then((c) => { if (on && c) { setCoName(c.name || ''); } })
        .catch(() => {});
    }
    return () => { on = false; };
  }, [me && me.companyId, selectedCompanyId, isSuperAdmin]);

  // 3. Fetch Invoice profile for current company
  useEffect(() => {
    let on = true;
    setLoadingProfile(true);
    setErrInvoice('');
    const targetCid = isSuperAdmin ? selectedCompanyId : me?.companyId;
    const url = targetCid 
      ? `/api/settings/invoice-profile?companyId=${encodeURIComponent(targetCid)}`
      : '/api/settings/invoice-profile';

    api.get(url)
      .then((res) => {
        if (!on) return;
        const profile = res?.data || res;
        if (profile && typeof profile === 'object') {
          setInvProfile({
            ...DEFAULT_INVOICE_PROFILE,
            ...profile,
            companyName: profile.companyName || profile.name || DEFAULT_INVOICE_PROFILE.companyName
          });
        }
      })
      .catch((err) => {
        if (!on) return;
        console.warn('Could not load invoice profile:', err);
        setErrInvoice(err.message || 'Failed to load profile');
      })
      .finally(() => {
        if (on) setLoadingProfile(false);
      });

    return () => { on = false; };
  }, [selectedCompanyId, me?.companyId, isSuperAdmin]);

  // 4. Update Live QR code preview (supports Dynamic Auto-QR or Custom Uploaded QR)
  useEffect(() => {
    let active = true;
    if (invProfile?.qrMode === 'custom') {
      setQrPreviewUrl(invProfile.customQrImage || '');
    } else if (invProfile?.upiId) {
      const amt = Number(testAmount) > 0 ? Number(testAmount) : 1000;
      generateUpiQrCode(
        invProfile.upiId, 
        invProfile.accName || invProfile.companyName || 'ARGUS CNC', 
        amt, 
        'PREVIEW-DEMO'
      ).then((url) => {
        if (active) setQrPreviewUrl(url || '');
      });
    } else {
      setQrPreviewUrl('');
    }
    return () => { active = false; };
  }, [invProfile?.qrMode, invProfile?.customQrImage, invProfile?.upiId, invProfile?.accName, invProfile?.companyName, testAmount]);

  // Helper handlers
  const S = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const P = (k) => (e) => setInvProfile((p) => ({ ...p, [k]: e.target.value }));

  // File upload to base64 DataURL (for Logo, Signature, and Custom QR Image)
  const handleFileUpload = (field) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast('File size must be under 2MB', '⚠️');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      setInvProfile((prev) => ({ ...prev, [field]: evt.target.result }));
      const label = field === 'logo' ? 'Logo' : (field === 'signatureImage' ? 'Digital Signature' : 'Custom QR Code');
      toast(`${label} loaded successfully`, '🖼️');
    };
    reader.readAsDataURL(file);
  };

  // Publish Storefront settings
  function publishStoreSettings() {
    setBusyStore(true);
    setErrStore('');
    api.put('/api/settings', {
      storeName: f.storeName || ((coName || (me && me.companyId) || '') + ' Industrial Store'),
      warehouse: f.warehouse || '', 
      taxPct: Number(f.taxPct || 0), 
      orderPrefix: f.orderPrefix || '',
      quotePrefix: f.quotePrefix || '', 
      lowStockThreshold: Number(f.lowStockThreshold || 0), 
      announcement: f.announcement || ''
    })
      .then(() => toast('Storefront settings updated and published', '⚙️'))
      .catch((e) => { setErrStore(e.message || 'Publish failed'); toast(e.message, '⚠️'); })
      .finally(() => setBusyStore(false));
  }

  // Save Invoice & Quotation Profile
  function saveInvoiceProfile() {
    setBusyInvoice(true);
    setErrInvoice('');
    const targetCid = isSuperAdmin ? selectedCompanyId : me?.companyId;

    api.put('/api/settings/invoice-profile', {
      ...invProfile,
      companyId: targetCid
    })
      .then(() => toast(`Invoice & Quotation profile saved for ${invProfile.companyName}!`, '🧾'))
      .catch((e) => { setErrInvoice(e.message || 'Save failed'); toast(e.message, '⚠️'); })
      .finally(() => setBusyInvoice(false));
  }

  // Instant Document Previews
  function handlePreviewQuotation() {
    const dummyItems = [
      { pid: 'DEMO-01', name: 'Precision CNC Ball Screw 25mm C5 Grade', hsn: '8466.93.90', qty: 2, uom: 'Set', price: 18500, brand: 'Hiwin' },
      { pid: 'DEMO-02', name: 'Carbide End Mill 4-Flute 12mm TiAlN', hsn: '8207.70.10', qty: 5, uom: 'Pc', price: 2400, brand: 'Sandvik' }
    ];
    downloadQuotationPdf({
      quoteNo: `QT-PREVIEW-${Date.now().toString().slice(-4)}`,
      company: invProfile,
      customer: {
        companyName: 'Bharat Forge & Heavy Engineering Ltd.',
        name: 'Rajesh Kulkarni (Purchase Manager)',
        phone: '+91 94220 11223',
        email: 'purchase@bharatforge-demo.com',
        address: 'Plot 45, Chakan Industrial Phase II',
        city: 'Pune',
        state: 'Maharashtra',
        pin: '401501'
      },
      items: dummyItems,
      notes: 'Sample preview demonstrating dynamic logo, address, UPI payment QR code, and digital signature.'
    });
  }

  function handlePreviewTaxInvoice() {
    const dummyItems = [
      { pid: 'DEMO-01', name: 'Precision CNC Ball Screw 25mm C5 Grade', hsn: '8466.93.90', qty: 2, uom: 'Set', price: 18500, brand: 'Hiwin' },
      { pid: 'DEMO-02', name: 'Carbide End Mill 4-Flute 12mm TiAlN', hsn: '8207.70.10', qty: 5, uom: 'Pc', price: 2400, brand: 'Sandvik' }
    ];
    downloadTaxInvoicePdf({
      invoiceNo: `INV/2026-27/PREV-${Date.now().toString().slice(-4)}`,
      company: invProfile,
      customer: {
        companyName: 'Bharat Forge & Heavy Engineering Ltd.',
        name: 'Rajesh Kulkarni (Accounts & Finance)',
        phone: '+91 94220 11223',
        email: 'accounts@bharatforge-demo.com',
        address: 'Plot 45, Chakan Industrial Phase II',
        city: 'Pune',
        state: 'Maharashtra',
        pin: '401501',
        gstin: '27AABCB9876K1Z9'
      },
      items: dummyItems,
      notes: 'Official GST Tax Invoice Preview with Rule 46 compliance and dynamic NPCI QR payment.'
    });
  }

  const titlePrefix = coName || (me && me.companyId) || 'Company';

  return (
    <div className="space-y-6 w-full">
      <PageHero
        title="Settings & Corporate Profile"
        subtitle={`Configure storefront operations, tax rates, commercial invoice profile, bank accounts, and payment QR codes.`}
        icon={SettingsIcon}
        badgeText={isSuperAdmin ? 'Super Admin System Config' : 'Company Admin Config'}
        badgeColor="rose"
        gradient="from-rose-500 via-pink-600 to-rose-700"
        actions={
          <div className="flex items-center gap-2">
            {activeTab === 'store' ? (
              <button 
                type="button" 
                disabled={busyStore || !f} 
                onClick={publishStoreSettings}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-rose-600/30 cursor-pointer"
              >
                {busyStore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {busyStore ? 'Publishing…' : 'Publish Store Settings'}
              </button>
            ) : (
              <button 
                type="button" 
                disabled={busyInvoice || loadingProfile} 
                onClick={saveInvoiceProfile}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-emerald-600/30 cursor-pointer"
              >
                {busyInvoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {busyInvoice ? 'Saving Profile…' : 'Save Invoice & Quote Profile'}
              </button>
            )}
          </div>
        }
      />

      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3">
        <button
          type="button"
          onClick={() => handleTabChange('store')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'store'
              ? 'bg-rose-50 text-rose-700 border border-rose-200 shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          Storefront &amp; Operations
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('invoice')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'invoice'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Invoice &amp; Quotation Profile (Logo, Bank, QR &amp; Signature)
          <span className="px-1.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-800 rounded-md font-mono">
            Rule 46 GST
          </span>
        </button>
      </div>

      {/* TAB 1: STOREFRONT & OPERATIONS */}
      {activeTab === 'store' && (
        <>
          {/* Quick Jump Banner to Invoice & Quotation Profile */}
          <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-amber-500/10 border border-emerald-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-base shadow-sm flex-shrink-0">
                🧾
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <span>Looking for Invoice &amp; Quotation Profile?</span>
                  <span className="px-1.5 py-0.5 text-[9px] bg-emerald-100 text-emerald-800 rounded font-mono font-bold">Rule 46 GST</span>
                </h4>
                <p className="text-xs text-slate-600">
                  Configure Company Letterhead Logo, Registered Address, Bank RTGS Details, Dynamic NPCI UPI QR code, and Authorized Digital Signatures.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleTabChange('invoice')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
            >
              <span>Open Invoice Profile</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {errStore && !f ? (
            <div className="bg-white rounded-2xl border border-red-200 p-8 text-center max-w-lg mx-auto">
              <p className="text-red-500 font-bold mb-1">Failed to load storefront settings</p>
              <p className="text-xs text-slate-500">{errStore}</p>
            </div>
          ) : !f ? (
            <Skeleton h={320} />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" /> Public Store Title
                  </label>
                  <input 
                    type="text" 
                    value={f.storeName} 
                    onChange={S('storeName')} 
                    placeholder={`${titlePrefix} Industrial Store`}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" /> Default Warehouse Node
                  </label>
                  <input 
                    type="text" 
                    value={f.warehouse} 
                    onChange={S('warehouse')} 
                    placeholder="WH-Pune-01"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-slate-400" /> Standard GST Tax Rate (%)
                  </label>
                  <input 
                    type="number" 
                    value={f.taxPct} 
                    onChange={S('taxPct')} 
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-slate-400" /> Order Number Prefix
                  </label>
                  <input 
                    type="text" 
                    value={f.orderPrefix} 
                    onChange={S('orderPrefix')} 
                    placeholder="ORD-"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-slate-400" /> Quotation Prefix
                  </label>
                  <input 
                    type="text" 
                    value={f.quotePrefix} 
                    onChange={S('quotePrefix')} 
                    placeholder="Q-"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all font-mono"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-slate-400" /> Low-Stock Trigger Threshold
                  </label>
                  <input 
                    type="number" 
                    value={f.lowStockThreshold} 
                    onChange={S('lowStockThreshold')} 
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
                  />
                  <span className="text-[11px] text-slate-400 block">
                    Items with stock at or below this count will trigger automated warning badges on the dashboard.
                  </span>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Megaphone className="w-3.5 h-3.5 text-slate-400" /> Storefront Announcement Banner
                  </label>
                  <input 
                    type="text" 
                    value={f.announcement} 
                    onChange={S('announcement')} 
                    placeholder="GST invoice on all orders • Bulk pricing on request"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
                  />
                </div>
              </div>

              {errStore && (
                <p className="text-xs text-red-600 font-semibold bg-red-50 p-3 rounded-xl border border-red-200">
                  ⚠️ {errStore}
                </p>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Changes take effect immediately across all storefront sessions.</span>
                <button 
                  type="button" 
                  disabled={busyStore} 
                  onClick={publishStoreSettings}
                  className="font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Save Storefront Changes
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: INVOICE & QUOTATION PROFILE */}
      {activeTab === 'invoice' && (
        <div className="space-y-6">
          {/* Super Admin Company Selector or Company Admin Locked Banner */}
          <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
                  {isSuperAdmin ? 'Super Admin Multi-Tenant Control' : 'Assigned Enterprise Profile'}
                </span>
              </div>
              <h3 className="text-base font-black tracking-tight text-white mt-1">
                {isSuperAdmin 
                  ? 'Select Enterprise to Configure Document Details' 
                  : `Configuring Details for ${invProfile.companyName || coName || 'Company'}`}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isSuperAdmin 
                  ? 'As Super Admin, you can switch between any registered company to set its quotation header, logo, bank wiring, QR code, and signature.'
                  : 'Your account is locked to your company tenant. Any changes made here reflect on all official quotations and tax invoices.'}
              </p>
            </div>

            {/* Super Admin Dropdown or Company Admin Badge */}
            {isSuperAdmin ? (
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-300 whitespace-nowrap">Company:</span>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  className="bg-slate-800 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-700 hover:border-slate-600 focus:border-emerald-500 outline-hidden transition-all cursor-pointer"
                >
                  {companies.length > 0 ? (
                    companies.map((co) => (
                      <option key={co.id} value={co.id}>
                        {co.name} ({co.id})
                      </option>
                    ))
                  ) : (
                    <option value={selectedCompanyId || 'C-ARGUS'}>
                      {invProfile.companyName || 'Argus CNC'} ({selectedCompanyId || 'C-ARGUS'})
                    </option>
                  )}
                </select>
              </div>
            ) : (
              <div className="px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center gap-2 text-xs font-bold text-emerald-400">
                <Building2 className="w-3.5 h-3.5" />
                <span>Tenant ID: <span className="font-mono text-white">{me?.companyId || 'C-ARGUS'}</span></span>
              </div>
            )}
          </div>

          {loadingProfile ? (
            <Skeleton h={380} />
          ) : (
            <div className="space-y-6">
              {/* SECTION A: BRANDING & IDENTITY */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Enterprise Brand &amp; Logo</h4>
                      <p className="text-xs text-slate-500">Official company name, marketing tagline, and high-res letterhead logo</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">Appears on Header</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-slate-700">Legal Company Name</label>
                    <input 
                      type="text" 
                      value={invProfile.companyName} 
                      onChange={P('companyName')} 
                      placeholder="e.g. ARGUS CNC TECHNOLOGIES PVT. LTD."
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all font-semibold"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-1">
                    <label className="text-xs font-bold text-slate-700">Corporate Tagline / Subtitle</label>
                    <input 
                      type="text" 
                      value={invProfile.tagline} 
                      onChange={P('tagline')} 
                      placeholder="e.g. High-Precision Machine Tools & Automation"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all"
                    />
                  </div>

                  {/* Logo Uploader & Preview */}
                  <div className="md:col-span-3 border border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50/50 flex flex-col sm:flex-row items-center gap-5">
                    <div className="w-36 h-20 bg-white border border-slate-200 rounded-xl flex items-center justify-center p-2 shadow-2xs overflow-hidden shrink-0">
                      {invProfile.logo ? (
                        <img src={invProfile.logo} alt="Company Logo Preview" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <span className="text-[11px] text-slate-400 font-semibold text-center">Default Logo (Argus CNC)</span>
                      )}
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <div className="text-xs font-bold text-slate-800">Company Letterhead Logo</div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Upload your PNG, JPG, or SVG company logo. For best print results, use a transparent horizontal logo at 300 DPI.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all cursor-pointer shadow-xs">
                          <Upload className="w-3.5 h-3.5" /> Upload New Logo
                          <input type="file" accept="image/*" onChange={handleFileUpload('logo')} className="hidden" />
                        </label>
                        {invProfile.logo && (
                          <button
                            type="button"
                            onClick={() => setInvProfile(p => ({ ...p, logo: '' }))}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" /> Reset to Default
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION B: REGISTERED ADDRESS & STATUTORY DETAILS */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Registered Address &amp; Statutory IDs</h4>
                      <p className="text-xs text-slate-500">Government compliance credentials (GSTIN, PAN, CIN, State Code)</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">Rule 46 Mandatory</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                    <label className="text-xs font-bold text-slate-700">Registered Office / Factory Address</label>
                    <input 
                      type="text" 
                      value={invProfile.regAddress} 
                      onChange={P('regAddress')} 
                      placeholder="Plot 18, Sector 10, MIDC Industrial Area, Bhosari"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">City</label>
                    <input 
                      type="text" 
                      value={invProfile.city} 
                      onChange={P('city')} 
                      placeholder="Pune"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">State</label>
                    <input 
                      type="text" 
                      value={invProfile.state} 
                      onChange={P('state')} 
                      placeholder="Maharashtra"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">State Code (GST)</label>
                    <input 
                      type="text" 
                      value={invProfile.stateCode} 
                      onChange={P('stateCode')} 
                      placeholder="27 (Maharashtra)"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">PIN Code</label>
                    <input 
                      type="text" 
                      value={invProfile.pin} 
                      onChange={P('pin')} 
                      placeholder="411026"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Corporate GSTIN</label>
                    <input 
                      type="text" 
                      value={invProfile.gstin} 
                      onChange={P('gstin')} 
                      placeholder="27AAACA1234A1Z5"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all font-mono font-bold text-slate-900"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">PAN Number</label>
                    <input 
                      type="text" 
                      value={invProfile.pan} 
                      onChange={P('pan')} 
                      placeholder="AAACA1234A"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">CIN (Corporate ID)</label>
                    <input 
                      type="text" 
                      value={invProfile.cin} 
                      onChange={P('cin')} 
                      placeholder="U29253PN2021PTC198765"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Official Billing Email</label>
                    <input 
                      type="email" 
                      value={invProfile.email} 
                      onChange={P('email')} 
                      placeholder="technologiesargus@gmail.com"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Official Phone Number</label>
                    <input 
                      type="text" 
                      value={invProfile.phone} 
                      onChange={P('phone')} 
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION C: BANK DETAILS & PAYMENT QR CODE */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Bank Wire Details &amp; Payment QR Code</h4>
                      <p className="text-xs text-slate-500">Bank accounts for NEFT/RTGS and QR code configuration for instant customer payments</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    {invProfile.qrMode === 'custom' ? '🖼️ Custom Uploaded QR' : '⚡ Dynamic Auto-Amount QR'}
                  </span>
                </div>

                {/* Sub-section 1: Bank Wire Accounts */}
                <div>
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                    Bank Account Details (Printed on Quotations &amp; Tax Invoices)
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Bank Name</label>
                      <input 
                        type="text" 
                        value={invProfile.bankName} 
                        onChange={P('bankName')} 
                        placeholder="HDFC Bank Ltd."
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Beneficiary Account Name</label>
                      <input 
                        type="text" 
                        value={invProfile.accName} 
                        onChange={P('accName')} 
                        placeholder="ARGUS CNC TECHNOLOGIES PVT LTD"
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all font-semibold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Bank Account Number</label>
                      <input 
                        type="text" 
                        value={invProfile.accNo} 
                        onChange={P('accNo')} 
                        placeholder="50200067891234"
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all font-mono font-bold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">IFSC Code</label>
                      <input 
                        type="text" 
                        value={invProfile.ifsc} 
                        onChange={P('ifsc')} 
                        placeholder="HDFC0001234"
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all font-mono font-bold"
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs font-bold text-slate-700">Branch Name &amp; City</label>
                      <input 
                        type="text" 
                        value={invProfile.branch} 
                        onChange={P('branch')} 
                        placeholder="MIDC Bhosari Branch, Pune"
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Sub-section 2: QR Code Selection & Setup */}
                <div className="pt-4 border-t border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-emerald-600" /> Payment QR Code Method
                      </h5>
                      <p className="text-[11px] text-slate-500">
                        Choose whether the QR code auto-generates the exact bill amount, or prints your uploaded merchant QR standee image.
                      </p>
                    </div>

                    {/* Mode Toggle Pills */}
                    <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200/80 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setInvProfile(p => ({ ...p, qrMode: 'dynamic' }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          invProfile.qrMode !== 'custom' 
                            ? 'bg-emerald-600 text-white shadow-xs' 
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        ⚡ Dynamic Auto-Amount QR
                      </button>
                      <button
                        type="button"
                        onClick={() => setInvProfile(p => ({ ...p, qrMode: 'custom' }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          invProfile.qrMode === 'custom' 
                            ? 'bg-emerald-600 text-white shadow-xs' 
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        🖼️ Upload Custom QR Image
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left 2 Cols: Form Content depending on QR Mode */}
                    {invProfile.qrMode !== 'custom' ? (
                      /* MODE A: DYNAMIC AUTO-AMOUNT QR */
                      <div className="lg:col-span-2 space-y-4">
                        <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                          <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>How Dynamic Auto-Amount QR Works:</span>
                          </div>
                          <p className="text-xs text-emerald-800 leading-relaxed">
                            By specifying your company's <b>UPI ID / VPA Handle</b>, the BI automatically generates a real-time NPCI QR code on every quotation and tax invoice with the <b>exact payable amount pre-filled</b> (e.g. ₹1,25,000). When customers scan with Google Pay, PhonePe, or Paytm, the exact amount is entered automatically without typing mistakes!
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-emerald-950 flex items-center gap-1">
                            <QrCode className="w-3.5 h-3.5 text-emerald-600" /> Payee UPI ID / VPA Handle
                          </label>
                          <input 
                            type="text" 
                            value={invProfile.upiId} 
                            onChange={P('upiId')} 
                            placeholder="e.g. arguscnc@hdfcbank or company@okicici"
                            className="w-full px-3.5 py-2.5 text-sm bg-emerald-50/30 hover:bg-white focus:bg-white border border-emerald-300 focus:border-emerald-500 rounded-xl outline-hidden transition-all font-mono font-bold text-emerald-950"
                          />
                          <p className="text-[11px] text-slate-500">
                            Enter the official UPI VPA linked to your current bank account (e.g. <span className="font-mono">name@hdfcbank</span>, <span className="font-mono">company@icici</span>).
                          </p>
                        </div>
                      </div>
                    ) : (
                      /* MODE B: CUSTOM QR IMAGE UPLOAD */
                      <div className="lg:col-span-2 space-y-4">
                        <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
                          <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>About Uploading Static QR Code Images:</span>
                          </div>
                          <p className="text-xs text-amber-900 leading-relaxed">
                            A static uploaded image file (PNG/JPG from your shop standee, Paytm soundbox, or GPay merchant sticker) has permanently fixed pixels. <b>It cannot alter its pixels dynamically to insert different bill amounts.</b> When customers scan it, their app will prompt them to type the payment amount manually.
                            <br /><br />
                            <span className="font-semibold">Want automatic amount generation?</span> Switch back to <b>⚡ Dynamic Auto-Amount QR</b> above!
                          </p>
                        </div>

                        {/* File Upload Box */}
                        <div className="border border-dashed border-slate-300 rounded-2xl p-4 bg-slate-50/80 flex flex-col sm:flex-row items-center gap-5">
                          <div className="w-28 h-28 bg-white border border-slate-200 rounded-xl flex items-center justify-center p-2 shadow-2xs overflow-hidden shrink-0">
                            {invProfile.customQrImage ? (
                              <img src={invProfile.customQrImage} alt="Custom QR Preview" className="max-h-full max-w-full object-contain" />
                            ) : (
                              <div className="text-center text-[10px] text-slate-400 font-semibold p-2">
                                <QrCode className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                                <span>No QR Uploaded</span>
                              </div>
                            )}
                          </div>
                          <div className="space-y-1.5 flex-1">
                            <div className="text-xs font-bold text-slate-800">Merchant Standee QR Image File (PNG / JPG)</div>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              Upload a crisp image of your pre-printed merchant QR code (e.g., from Google Pay Business, PhonePe, Paytm, or bank standee).
                            </p>
                            <div className="flex items-center gap-2 pt-1">
                              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all cursor-pointer shadow-xs">
                                <Upload className="w-3.5 h-3.5" /> Upload QR Image
                                <input type="file" accept="image/*" onChange={handleFileUpload('customQrImage')} className="hidden" />
                              </label>
                              {invProfile.customQrImage && (
                                <button
                                  type="button"
                                  onClick={() => setInvProfile(p => ({ ...p, customQrImage: '' }))}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-all cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-500" /> Remove Image
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Right Col: Live QR Verification Card */}
                    <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-3">
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                          <QrCode className="w-3.5 h-3.5 text-emerald-600" /> Live QR Preview
                        </span>
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-mono font-bold">
                          {invProfile.qrMode === 'custom' ? 'Custom Image' : 'NPCI UPI Auto'}
                        </span>
                      </div>

                      {qrPreviewUrl ? (
                        <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col items-center">
                          <img src={qrPreviewUrl} alt="Live QR Preview" className="w-32 h-32 object-contain" />
                          <div className="text-[10px] font-black text-slate-900 mt-1.5 font-mono">
                            {invProfile.qrMode === 'custom' 
                              ? 'CUSTOM MERCHANT QR' 
                              : `SCAN TO PAY ₹${Number(testAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                          </div>
                        </div>
                      ) : (
                        <div className="w-32 h-32 bg-slate-200/50 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs p-3 text-center">
                          {invProfile.qrMode === 'custom' 
                            ? 'Upload a QR image to see preview' 
                            : 'Enter valid UPI ID to generate live QR'}
                        </div>
                      )}

                      {invProfile.qrMode !== 'custom' ? (
                        <div className="w-full space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 block text-left">
                            Test Amount Simulator:
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-600">₹</span>
                            <input
                              type="number"
                              value={testAmount}
                              onChange={(e) => setTestAmount(e.target.value)}
                              placeholder="25000"
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-hidden font-mono font-bold"
                            />
                          </div>
                          <p className="text-[10px] text-slate-400 leading-tight pt-1">
                            On generated quotations/invoices, this QR code automatically encodes the exact grand total of each order.
                          </p>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 leading-tight">
                          This uploaded merchant QR image will be printed directly in the payment section of your quotations and tax invoices.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION D: DIGITAL SIGNATURE & AUTHORIZED SIGNATORY */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                      <Stamp className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Authorized Digital Signature</h4>
                      <p className="text-xs text-slate-500">Signatory credentials and high-resolution official signature image</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">Printed on Bottom Right</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="space-y-1.5 md:col-span-1">
                    <label className="text-xs font-bold text-slate-700">Authorized Signatory Name</label>
                    <input 
                      type="text" 
                      value={invProfile.signatoryName} 
                      onChange={P('signatoryName')} 
                      placeholder="e.g. Sanjay Deshmukh"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all font-semibold"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-slate-700">Signatory Designation / Department</label>
                    <input 
                      type="text" 
                      value={invProfile.signatoryDesignation} 
                      onChange={P('signatoryDesignation')} 
                      placeholder="e.g. Director of Industrial Operations &bull; Commercial Division"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all"
                    />
                  </div>

                  {/* Digital Signature Uploader & Preview */}
                  <div className="md:col-span-3 border border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50/50 flex flex-col sm:flex-row items-center gap-5">
                    <div className="w-44 h-24 bg-white border border-slate-200 rounded-xl flex items-center justify-center p-2 shadow-2xs overflow-hidden shrink-0">
                      {invProfile.signatureImage ? (
                        <img src={invProfile.signatureImage} alt="Digital Signature Preview" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <div className="text-center text-[11px] text-slate-400 font-semibold p-2">
                          <Stamp className="w-5 h-5 mx-auto mb-1 text-slate-300" />
                          <span>System Fallback Stamp</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <div className="text-xs font-bold text-slate-800">Digital Signature Image (PNG / JPG)</div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Upload a clean, high-resolution transparent PNG of the authorized signatory’s digital signature. If left empty, the document will print a verified electronic seal stamp.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition-all cursor-pointer shadow-xs">
                          <Upload className="w-3.5 h-3.5" /> Upload Signature Image
                          <input type="file" accept="image/*" onChange={handleFileUpload('signatureImage')} className="hidden" />
                        </label>
                        {invProfile.signatureImage && (
                          <button
                            type="button"
                            onClick={() => setInvProfile(p => ({ ...p, signatureImage: '' }))}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" /> Remove Signature
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION E: TERMS & CONDITIONS */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Commercial Terms &amp; Legal Declarations</h4>
                      <p className="text-xs text-slate-500">Default clauses printed on Proforma Quotations and Tax Invoices</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Commercial Quotation Terms (One per line)</label>
                    <textarea 
                      rows={5}
                      value={invProfile.quotationTerms} 
                      onChange={P('quotationTerms')} 
                      placeholder="1. Validity: 30 days&#10;2. Payment: Advance&#10;3. Warranty: 12 months"
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all font-mono leading-relaxed"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Tax Invoice Terms of Sale &amp; Jurisdiction</label>
                    <textarea 
                      rows={5}
                      value={invProfile.invoiceTerms} 
                      onChange={P('invoiceTerms')} 
                      placeholder="1. Rule 46 declaration&#10;2. Interest on delay @ 18% p.a.&#10;3. Jurisdiction: Pune Courts"
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl outline-hidden transition-all font-mono leading-relaxed"
                    />
                  </div>
                </div>
              </div>

              {/* ERROR ALERT */}
              {errInvoice && (
                <p className="text-xs text-red-600 font-semibold bg-red-50 p-3 rounded-xl border border-red-200">
                  ⚠️ {errInvoice}
                </p>
              )}

              {/* ACTION FOOTER */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePreviewQuotation}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-orange-600" /> Preview Sample Quotation
                  </button>
                  <button
                    type="button"
                    onClick={handlePreviewTaxInvoice}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-600" /> Preview Sample Tax Invoice
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyInvoice}
                    onClick={saveInvoiceProfile}
                    className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-sm shadow-emerald-600/30 transition-all cursor-pointer"
                  >
                    {busyInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {busyInvoice ? 'Saving Profile…' : 'Save Invoice & Quote Profile'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
