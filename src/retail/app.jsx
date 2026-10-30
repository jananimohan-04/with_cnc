/* Routes — identical hash paths to the legacy app (HashRouter preserves #/... URLs). */
import React, { Component, useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './styles/tokens.css';
import './styles/components.css';
import { AuthProvider, useAuth } from './auth';
import { CompanyProvider } from './companyContext';
import { Shell } from './layout';
import { ToastHost } from './components/ui';
import { api, getCart } from './api';
import Login from './pages/Login';
import Pending from './pages/Pending';
import SuperDashboard from './pages/super/Dashboard';
import Companies from './pages/super/Companies';
import CompanyNew from './pages/super/CompanyNew';
import CompanyDetail from './pages/super/CompanyDetail';
import SuperCatalog from './pages/super/Catalog';
import SuperCategories from './pages/super/Categories';
import SuperMedia from './pages/super/Media';
import SuperOrders from './pages/super/Orders';
import SuperQuotes from './pages/super/Quotes';
import SuperSettings from './pages/super/Settings';
import SuperAudit from './pages/super/Audit';
import MenuAccess from './pages/super/MenuAccess';
import AdminDashboard from './pages/admin/Dashboard';
import AdminProducts from './pages/admin/Products';
import AdminProductForm from './pages/admin/ProductForm';
import AdminMedia from './pages/admin/Media';
import AdminCategories from './pages/admin/Categories';
import AdminUsers from './pages/admin/Users';
import AdminOrders from './pages/admin/Orders';
import AdminOrderDetail from './pages/admin/OrderDetail';
import AdminQuotes from './pages/admin/Quotes';
import AdminSettings from './pages/admin/Settings';
import StoreHome from './pages/store/Home';
import StoreListing from './pages/store/Listing';
import StoreProduct from './pages/store/Product';
import StoreCart from './pages/store/Cart';
import StoreCheckout from './pages/store/Checkout';
import StoreConfirmation from './pages/store/Confirmation';
import StoreOrders from './pages/store/Orders';
import StoreOrderDetail from './pages/store/OrderDetail';
import StoreQuotes from './pages/store/Quotes';
import StoreInvoices from './pages/store/Invoices';
import StoreProfile from './pages/store/Profile';
import ContentWriter from './pages/content/ContentWriter';
import FinanceReview from './pages/finance/Finance';
import { ARGUS_LOGO_BASE64 } from './utils/logoBase64';

/* role-aware landing page — content/finance staff do not belong in the storefront */
const homeFor = (role) => ({
  super_admin: '/super/dashboard',
  company_admin: '/admin/dashboard',
  content_writer: '/content',
  finance: '/finance',
  sales_user: '/store/home'
}[role] || '/store/home');

const R = {
  super: ['super_admin'],
  admin: ['super_admin', 'company_admin'],
  content: ['super_admin', 'company_admin', 'content_writer'],
  finance: ['super_admin', 'company_admin', 'finance'],
  store: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner']
};

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#DAC8B8] text-[#2E1508]">
          <div className="bg-[#FAF6F1] border border-[#BAA794] rounded-2xl p-8 max-w-md w-full shadow-lg text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-xl font-bold mb-2">Display Notice</h2>
            <p className="text-xs text-[#735A47] mb-5 leading-relaxed">
              {this.state.error?.message || 'An unexpected error occurred while rendering this page.'}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              >
                Reload Page
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { this.setState({ hasError: false, error: null }); window.location.hash = '#/store/home'; window.location.reload(); }}
              >
                Go to Storefront
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* "/" → each role's own home (a Content Writer no longer lands in the storefront) */
function RoleRedirect() {
  const { me, ready } = useAuth();
  if (!ready) return null;
  return <Navigate to={me ? homeFor(me.role) : '/login'} replace />;
}

function Gate({ children, noSide, roles, perm }) {
  const { me, ready } = useAuth();
  const loc = useLocation();
  const [counts, setCounts] = useState({ cart: 0, cats: [], pendingOrders: '', openQuotes: '' });

  useEffect(() => {
    const cartN = (getCart() || []).reduce((a, c) => a + (c.qty || 0), 0);
    setCounts((p) => ({ ...p, cart: cartN }));
    if (!me) return;
    /* publishing roles care about their queue, not sales orders */
    if (me.role === 'content_writer' || me.role === 'finance') {
      api.get('/api/workflow?limit=1').then((w) => {
        const c = (w && w.counts) || {};
        const pending = (c.content_pending || 0) + (c.content_in_progress || 0) + (c.returned_for_correction || 0);
        const financeQ = (c.submitted_to_finance || 0) + (c.finance_review || 0);
        setCounts((p) => ({ ...p, pendingContent: pending || '', financeQueue: financeQ || '' }));
      }).catch(() => {});
      api.get('/api/categories').then((c) => setCounts((p) => ({ ...p, cats: c || [] }))).catch(() => {});
      return;
    }
    if (!me.companyId || me.role === 'super_admin') {
      api.get('/api/categories').then((c) => setCounts((p) => ({ ...p, cats: c || [] }))).catch(() => {});
      if (me.role === 'super_admin') return;
    }
    Promise.all([
      api.get('/api/orders').catch(() => []),
      api.get('/api/quotations').catch(() => []),
      api.get('/api/categories').catch(() => [])
    ]).then(([o, qq, c]) => {
      const cid = me.companyId;
      const oo = (o || []).filter((x) => x.companyId === cid);
      const q2 = (qq || []).filter((x) => x.companyId === cid);
      setCounts((p) => ({
        ...p,
        pendingOrders: oo.filter((x) => x.status === 'Pending').length || '',
        openQuotes: q2.filter((x) => x.status === 'Pending').length || '',
        cats: c || []
      }));
    }).catch(() => {});
  }, [me, loc.pathname]);

  if (!ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#DAC8B8] gap-4">
        <div className="bg-white/95 backdrop-blur-md px-8 py-5 rounded-2xl shadow-xl border border-white/60 flex items-center justify-center transition-all animate-pulse">
          <img 
            src={ARGUS_LOGO_BASE64 || "/assets/argus-logo.png"} 
            alt="ARGUS CNC" 
            className="h-10 sm:h-12 w-auto object-contain"
          />
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-[#664D3B]">
          <span className="w-2 h-2 rounded-full bg-[#EA580C] animate-ping" />
          <span>Loading workspace…</span>
        </div>
      </div>
    );
  }
  if (loc.pathname === '/login' || loc.pathname === '/retail/login') return <>{children}</>;
  if (!me) return <Navigate to="/store/home" replace />;
  if (me.role === 'pending' || me.role === 'disabled') return <Pending />;

  /* global disabled killswitch check */
  const globalDisabled = me.globalDisabledMenus || [];
  if (perm && globalDisabled.includes(perm)) {
    const superSafeguards = ['super_access', 'super_dashboard', 'super_settings', 'admin_settings', 'admin_invoice_profile', 'super_invoice_profile'];
    if (!(me.role === 'super_admin' && superSafeguards.includes(perm))) {
      return <Navigate to={homeFor(me.role)} replace />;
    }
  }

  /* dynamic permission check: if a specific page perm is specified */
  if (perm) {
    const effective = me.effectivePermissions;
    if (Array.isArray(effective)) {
      if (!effective.includes(perm) && me.role !== 'super_admin') {
        return <Navigate to={homeFor(me.role)} replace />;
      }
    } else if (roles && !roles.includes(me.role) && !(roles.includes('sales_user') && (me.role?.startsWith('sales_') || me.salesTier))) {
      return <Navigate to={homeFor(me.role)} replace />;
    }
  } else {
    /* route-level authorization: a role never lands on a screen it may not act on */
    const isAllowed = !roles || roles.includes(me.role) || (roles.includes('sales_user') && (me.role?.startsWith('sales_') || me.salesTier));
    if (!isAllowed) return <Navigate to={homeFor(me.role)} replace />;
  }

  return <Shell counts={counts} noSide={noSide}>{children}</Shell>;
}

export function RetailApp() {
  return (
    <AuthProvider>
      <CompanyProvider>
        <div className="retail-app w-full min-h-screen">
          <ToastHost />
          <ErrorBoundary>
            <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/retail/login" element={<Login />} />
          <Route path="/pending" element={<Gate noSide><Pending /></Gate>} />
          <Route path="/super/dashboard" element={<Gate perm="super_dashboard" roles={R.super}><SuperDashboard /></Gate>} />
          <Route path="/super/companies" element={<Gate perm="super_companies" roles={R.super}><Companies /></Gate>} />
          <Route path="/super/companies/new" element={<Gate perm="super_companies" roles={R.super}><CompanyNew /></Gate>} />
          <Route path="/super/companies/:id/edit" element={<Gate perm="super_companies" roles={R.super}><CompanyNew edit /></Gate>} />
          <Route path="/super/companies/:id" element={<Gate perm="super_companies" roles={R.super}><CompanyDetail /></Gate>} />
          <Route path="/super/admins" element={<Gate perm="super_companies" roles={R.super}><Companies tab="admins" /></Gate>} />
          <Route path="/super/users" element={<Gate perm="super_companies" roles={R.super}><Companies tab="users" /></Gate>} />
          <Route path="/super/roles" element={<Gate perm="super_companies" roles={R.super}><Companies tab="roles" /></Gate>} />
          <Route path="/super/catalog" element={<Gate perm="super_catalog" roles={R.super}><SuperCatalog /></Gate>} />
          <Route path="/super/categories" element={<Gate perm="super_categories" roles={R.super}><SuperCategories /></Gate>} />
          <Route path="/super/media" element={<Gate perm="super_media" roles={R.super}><SuperMedia /></Gate>} />
          <Route path="/super/orders" element={<Gate perm="super_orders" roles={R.super}><SuperOrders /></Gate>} />
          <Route path="/super/orders/:id" element={<Gate perm="super_orders" roles={R.super}><AdminOrderDetail back="/super/orders" /></Gate>} />
          <Route path="/super/quotes" element={<Gate perm="super_quotes" roles={R.super}><SuperQuotes /></Gate>} />
          <Route path="/super/access" element={<Gate perm="super_access" roles={R.super}><MenuAccess /></Gate>} />
          <Route path="/super/settings" element={<Gate perm="super_settings" roles={R.super}><SuperSettings /></Gate>} />
          <Route path="/super/audit" element={<Gate perm="super_audit" roles={R.super}><SuperAudit /></Gate>} />
          <Route path="/admin/dashboard" element={<Gate perm="admin_dashboard" roles={R.admin}><AdminDashboard /></Gate>} />
          <Route path="/admin/products" element={<Gate perm="admin_products" roles={R.admin}><AdminProducts /></Gate>} />
          <Route path="/admin/products/new" element={<Gate perm="admin_products" roles={R.admin}><AdminProductForm /></Gate>} />
          <Route path="/admin/products/edit/:id" element={<Gate perm="admin_products" roles={R.admin}><AdminProductForm edit /></Gate>} />
          <Route path="/admin/media" element={<Gate perm="admin_media" roles={R.admin}><AdminMedia /></Gate>} />
          <Route path="/admin/categories" element={<Gate perm="admin_categories" roles={R.admin}><AdminCategories /></Gate>} />
          <Route path="/admin/users" element={<Gate perm="admin_users" roles={R.admin}><AdminUsers /></Gate>} />
          <Route path="/admin/orders" element={<Gate perm="admin_orders" roles={R.admin}><AdminOrders /></Gate>} />
          <Route path="/admin/orders/:id" element={<Gate perm="admin_orders" roles={R.admin}><AdminOrderDetail back="/admin/orders" /></Gate>} />
          <Route path="/admin/quotes" element={<Gate perm="admin_quotes" roles={R.admin}><AdminQuotes /></Gate>} />
          <Route path="/admin/settings" element={<Gate perm="admin_settings" roles={R.admin}><AdminSettings /></Gate>} />
          <Route path="/admin/invoice-profile" element={<Gate perm="admin_settings" roles={R.admin}><AdminSettings defaultTab="invoice" /></Gate>} />
          <Route path="/super/invoice-profile" element={<Gate perm="admin_settings" roles={R.super}><AdminSettings defaultTab="invoice" /></Gate>} />
          <Route path="/content" element={<Gate perm="content_writer" roles={R.content}><ContentWriter /></Gate>} />
          <Route path="/content/:id" element={<Gate perm="content_writer" roles={R.content}><ContentWriter /></Gate>} />
          <Route path="/finance" element={<Gate perm="finance_review" roles={R.finance}><FinanceReview /></Gate>} />
          <Route path="/finance/:id" element={<Gate perm="finance_review" roles={R.finance}><FinanceReview /></Gate>} />
          <Route path="/store/home" element={<Gate perm="store_home" roles={R.store}><StoreHome /></Gate>} />
          <Route path="/store/listing" element={<Gate perm="store_listing" roles={R.store}><StoreListing /></Gate>} />
          <Route path="/store/product/:id" element={<Gate perm="store_listing" roles={R.store}><StoreProduct /></Gate>} />
          <Route path="/store/cart" element={<Gate perm="store_cart" roles={R.store}><StoreCart /></Gate>} />
          <Route path="/store/checkout" element={<Gate perm="store_cart" roles={R.store}><StoreCheckout /></Gate>} />
          <Route path="/store/confirmation/:id" element={<Gate perm="store_orders" roles={R.store}><StoreConfirmation /></Gate>} />
          <Route path="/store/orders" element={<Gate perm="store_orders" roles={R.store}><StoreOrders /></Gate>} />
          <Route path="/store/orders/:id" element={<Gate perm="store_orders" roles={R.store}><StoreOrderDetail /></Gate>} />
          <Route path="/store/invoices" element={<Gate perm="store_invoices" roles={R.store}><StoreInvoices /></Gate>} />
          <Route path="/admin/invoices" element={<Gate perm="store_invoices" roles={R.admin}><StoreInvoices /></Gate>} />
          <Route path="/store/quotes" element={<Gate perm="store_quotes" roles={R.store}><StoreQuotes /></Gate>} />
          <Route path="/store/profile" element={<Gate perm="store_profile" roles={R.store}><StoreProfile /></Gate>} />
          <Route path="/" element={<RoleRedirect />} />
          
          {/* Retail navigation aliases */}
          <Route path="/retail/admin/products" element={<Gate perm="admin_products" roles={R.admin}><AdminProducts /></Gate>} />
          <Route path="/retail/admin/media" element={<Gate perm="admin_media" roles={R.admin}><AdminMedia /></Gate>} />
          <Route path="/retail/admin/categories" element={<Gate perm="admin_categories" roles={R.admin}><AdminCategories /></Gate>} />
          <Route path="/retail/admin/orders" element={<Gate perm="admin_orders" roles={R.admin}><AdminOrders /></Gate>} />
          <Route path="/retail/admin/quotes" element={<Gate perm="admin_quotes" roles={R.admin}><AdminQuotes /></Gate>} />
          <Route path="/retail/admin/settings" element={<Gate perm="admin_settings" roles={R.admin}><AdminSettings /></Gate>} />
          <Route path="/retail/admin/users" element={<Gate perm="admin_users" roles={R.admin}><AdminUsers /></Gate>} />
          <Route path="/retail/admin/dashboard" element={<Gate perm="admin_dashboard" roles={R.admin}><AdminDashboard /></Gate>} />
          <Route path="/retail/super/catalog" element={<Gate perm="super_catalog" roles={R.super}><SuperCatalog /></Gate>} />
          <Route path="/retail/super/companies" element={<Gate perm="super_companies" roles={R.super}><Companies /></Gate>} />
          <Route path="/retail/super/access" element={<Gate perm="super_access" roles={R.super}><MenuAccess /></Gate>} />
          <Route path="*" element={<Gate><StoreHome /></Gate>} />
        </Routes>
        </ErrorBoundary>
      </div>
      </CompanyProvider>
    </AuthProvider>
  );
}

export default RetailApp;
