/* CNCFORGE Industrial Store — local backend (Express + JSON file DB).
   Runs frontend + API together: http://localhost:4000
   Inventory source of truth: db.products[].stock + atomic deduct in POST /api/orders.
   Swap JSON layer for Supabase (tables + RLS + Storage) later — API shape stays.
   Exposes {app, db, save, seed} when required (migration script); listens only when run directly. */
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const SB = require('./supabase.cjs'); // Google OAuth bridge; secret key never leaves the server

const PORT = process.env.PORT || 4000;
const ROOT = path.join(__dirname, '..');           // serves index.html / css / js
const DB_FILE = path.join(__dirname, 'db.json');
const UP_DIR = process.env.VERCEL ? path.join(require('os').tmpdir(), 'uploads') : path.join(__dirname, 'uploads');
try { if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true }); } catch (e) {}

/* ---------- industrial dev seed (controlled replacement for old consumer demo catalog) ---------- */
function seed() {
  return {
    categories: [
      { id: 'cnc-machines', name: 'CNC Machines', icon: '🏭', desc: 'Turning, milling & machining centers' },
      { id: 'cutting-tools', name: 'Cutting Tools', icon: '🔩', desc: 'Inserts, end mills, drills & taps' },
      { id: 'spares', name: 'Machine Spare Parts', icon: '⚙️', desc: 'Bearings, ball screws & hydraulics' },
      { id: 'workholding', name: 'Workholding & Accessories', icon: '🗜️', desc: 'Chucks, collets & fixtures' },
      { id: 'electrical', name: 'Control & Electrical', icon: '🎛️', desc: 'Servo, drives & sensors' },
      { id: 'raw-materials', name: 'Raw Materials', icon: '🧱', desc: 'Bars, rods, sheets & plastics' },
      { id: 'consumables', name: 'Industrial Consumables', icon: '🛢️', desc: 'Coolants, lubricants & abrasives' },
      { id: 'measuring', name: 'Measuring & Inspection', icon: '📏', desc: 'Calipers, micrometers & gauges' },
      { id: 'safety', name: 'Safety & Maintenance', icon: '🦺', desc: 'PPE, filters & maintenance kits' }
    ],
    companies: [
      { id: 'C-ARGUS', name: 'Argus', logo: '🏭', city: 'Pune', status: 'active', plan: 'Scale', orders: 0, revenue: 0, products: 5, users: 4, email: 'argushexadoc2021@gmail.com', industry: 'CNC Manufacturing' }
    ],
    users: [
      { id: 'U-super-janani', name: 'Janani Mohan', role: 'super_admin', companyId: null, email: 'jananimohan44@gmail.com', active: true },
      { id: 'U-argus', name: 'argus', role: 'company_admin', companyId: 'C-ARGUS', email: 'argushexadoc2021@gmail.com', active: true },
      { id: 'U-tech-argus', name: 'Technologies Argus', role: 'super_admin', companyId: null, email: 'technologiesargus@gmail.com', active: true },
      { id: 'U-prod-argus', name: 'Production Argus', role: 'sales_user', companyId: 'C-ARGUS', email: 'productionargus@gmail.com', active: true },
      { id: 'U-janani-1604', name: 'janani', role: 'sales_user', companyId: 'C-ARGUS', email: 'jananimohan1604@gmail.com', mobile: '', active: true }
    ],
    products: [
      { id: 'P-MVCLL5E3UF', sku: 'ARG-PRECISION-8891', companyId: 'C-ARGUS', name: 'High Precision CNC Milling Bit 10mm', brand: 'ArgusCNC', price: 1850, uom: 'Pc', moq: 1, stock: 45, category: 'cutting-tools', visible: true, featured: true, sold: 0, created: '2026-10-16', desc: 'High precision 10mm carbide milling bit for industrial CNC machining.', specs: { 'Diameter': '10mm', 'Material': 'Solid Carbide' }, images: [], video: '' },
      { id: 'P-MVCIQHM6IG', sku: 'ARG-PRECISION-9901', companyId: 'C-ARGUS', name: 'High Precision CNC Milling Bit 6mm', brand: 'ArgusCNC', price: 1450, uom: 'Pc', moq: 1, stock: 60, category: 'cutting-tools', visible: true, featured: false, sold: 0, created: '2026-10-16', desc: 'High precision 6mm carbide milling bit for industrial CNC machining.', specs: { 'Diameter': '6mm', 'Material': 'Solid Carbide' }, images: [], video: '' },
      { id: 'P-MVCI09EQA7', sku: 'ARG-TEST-002', companyId: 'C-ARGUS', name: 'Precision Collet Chuck Updated', brand: 'ArgusCNC', price: 3200, uom: 'Pc', moq: 1, stock: 25, category: 'workholding', visible: true, featured: false, sold: 0, created: '2026-10-16', desc: 'Precision industrial collet chuck.', specs: {}, images: [], video: '' },
      { id: 'P-MVCHP97CXZ', sku: 'ARG-TEST-001', companyId: 'C-ARGUS', name: 'Precision Test Carbide End Mill 10mm', brand: 'ArgusCNC', price: 1600, uom: 'Pc', moq: 1, stock: 30, category: 'cutting-tools', visible: true, featured: false, sold: 0, created: '2026-10-16', desc: 'Precision test carbide end mill.', specs: {}, images: [], video: '' },
      { id: 'P-MVCEPL6DHG', sku: 'ARG-CH20-01', companyId: 'C-ARGUS', name: 'Argus High-Precision Collet CH-20', brand: 'ArgusCNC', price: 2400, uom: 'Pc', moq: 1, stock: 50, category: 'workholding', visible: true, featured: true, sold: 0, created: '2026-10-16', desc: 'High-precision collet CH-20.', specs: {}, images: [], video: '' }
    ],
    orders: [],
    quotations: [],
    product_media: [],
    settings: { 'C-ARGUS': { storeName: 'Argus Industrial Store', taxPct: 18, deliveryFee: 0, freeAbove: 0, orderPrefix: 'ORD-', announcement: 'GST invoice on all orders • Precision tooling by Argus' } }
  };
}

/* ---------------- Menu Catalog & Dynamic Access Control ---------------- */
const MENU_CATALOG = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Executive dashboard and high-level KPIs',
    items: [
      { id: 'super_dashboard', label: 'Platform Dashboard', path: '/super/dashboard', icon: 'LayoutDashboard', defaultRoles: ['super_admin'] },
      { id: 'admin_dashboard', label: 'Company Dashboard', path: '/admin/dashboard', icon: 'LayoutDashboard', defaultRoles: ['company_admin'] }
    ]
  },
  {
    id: 'organizations',
    label: 'Organizations',
    description: 'Companies, multi-tenant workspaces, and admins',
    items: [
      { id: 'super_companies', label: 'Company Hub', path: '/super/companies', icon: 'Building2', defaultRoles: ['super_admin'] }
    ]
  },
  {
    id: 'global_catalog',
    label: 'Global Catalog',
    description: 'Global master SKUs, universal categories, and media',
    items: [
      { id: 'super_catalog', label: 'Master Catalog', path: '/super/catalog', icon: 'Boxes', defaultRoles: ['super_admin'] },
      { id: 'super_categories', label: 'Categories', path: '/super/categories', icon: 'FolderTree', defaultRoles: ['super_admin'] },
      { id: 'super_media', label: 'Product Media', path: '/super/media', icon: 'ImageIcon', defaultRoles: ['super_admin'] }
    ]
  },
  {
    id: 'operations',
    label: 'Operations',
    description: 'Tenant inventory, category mapping, sales reps, and store settings',
    items: [
      { id: 'admin_products', label: 'Stock Library', path: '/admin/products', icon: 'Boxes', defaultRoles: ['company_admin'] },
      { id: 'admin_media', label: 'Product Media', path: '/admin/media', icon: 'ImageIcon', defaultRoles: ['company_admin'] },
      { id: 'admin_categories', label: 'Custom Categories', path: '/admin/categories', icon: 'FolderTree', defaultRoles: ['company_admin'] },
      { id: 'admin_users', label: 'Business Development Executive', path: '/admin/users', icon: 'User', defaultRoles: ['company_admin'] },
      { id: 'admin_invoice_profile', label: 'Invoice & QR Profile', path: '/admin/settings?tab=invoice', icon: 'Receipt', defaultRoles: ['company_admin'] },
      { id: 'admin_settings', label: 'Store Settings', path: '/admin/settings', icon: 'Settings', defaultRoles: ['company_admin'] }
    ]
  },
  {
    id: 'commerce',
    label: 'Commerce',
    description: 'Customer orders, platform-wide fulfillment, and RFQ quotations',
    items: [
      { id: 'super_orders', label: 'Platform Orders', path: '/super/orders', icon: 'Receipt', defaultRoles: ['super_admin'] },
      { id: 'super_quotes', label: 'RFQ Quotations', path: '/super/quotes', icon: 'FileText', defaultRoles: ['super_admin'] },
      { id: 'admin_orders', label: 'Customer Orders', path: '/admin/orders', icon: 'Receipt', defaultRoles: ['company_admin'] },
      { id: 'admin_quotes', label: 'RFQ Inquiries', path: '/admin/quotes', icon: 'FileText', defaultRoles: ['company_admin'] }
    ]
  },
  {
    id: 'governance',
    label: 'Governance',
    description: 'Menu access permissions, global settings, and audit logs',
    items: [
      { id: 'super_access', label: 'Menu Access Management', path: '/super/access', icon: 'ShieldCheck', defaultRoles: ['super_admin'] },
      { id: 'super_invoice_profile', label: 'Company Invoice & QR Profiles', path: '/admin/settings?tab=invoice', icon: 'Receipt', defaultRoles: ['super_admin'] },
      { id: 'super_settings', label: 'Global Settings', path: '/super/settings', icon: 'Settings', defaultRoles: ['super_admin'] },
      { id: 'super_audit', label: 'Audit Logs', path: '/super/audit', icon: 'ShieldCheck', defaultRoles: ['super_admin'] }
    ]
  },
  {
    id: 'publishing',
    label: 'Publishing',
    description: 'Copywriting queue and finance pricing approval',
    items: [
      { id: 'content_writer', label: 'Content Writer', path: '/content', icon: 'PenLine', defaultRoles: ['super_admin', 'company_admin', 'content_writer'] },
      { id: 'finance_review', label: 'Finance Review', path: '/finance', icon: 'IndianRupee', defaultRoles: ['super_admin', 'company_admin', 'finance'] }
    ]
  },
  {
    id: 'storefront',
    label: 'Storefront',
    description: 'Retail catalog browsing, order placement, and customer account',
    items: [
      { id: 'store_home', label: 'Store Home / Live', path: '/store/home', icon: 'Store', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] },
      { id: 'store_listing', label: 'All Products', path: '/store/listing', icon: 'Boxes', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] },
      { id: 'store_cart', label: 'My Cart', path: '/store/cart', icon: 'ShoppingCart', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] },
      { id: 'store_quotes', label: 'My Quotations', path: '/store/quotes', icon: 'FileText', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] },
      { id: 'store_orders', label: 'My Orders', path: '/store/orders', icon: 'Package', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] },
      { id: 'store_invoices', label: 'Invoice History', path: '/store/invoices', icon: 'Receipt', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] },
      { id: 'store_profile', label: 'My Profile', path: '/store/profile', icon: 'User', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] }
    ]
  },
  {
    id: 'browse_categories',
    label: 'Browse Categories',
    description: 'Category navigation and storefront product filters',
    items: [
      { id: 'cat_cnc_machines', label: 'CNC Machines', path: '/store/listing?cat=cnc-machines', icon: 'Boxes', emoji: '🏭', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] },
      { id: 'cat_cutting_tools', label: 'Cutting Tools', path: '/store/listing?cat=cutting-tools', icon: 'Boxes', emoji: '🔩', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] },
      { id: 'cat_spares', label: 'Machine Spare Parts', path: '/store/listing?cat=spares', icon: 'Boxes', emoji: '⚙️', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] },
      { id: 'cat_workholding', label: 'Workholding & Accessories', path: '/store/listing?cat=workholding', icon: 'Boxes', emoji: '🗜️', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] },
      { id: 'cat_electrical', label: 'Control & Electrical', path: '/store/listing?cat=electrical', icon: 'Boxes', emoji: '🎛️', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] },
      { id: 'cat_raw_materials', label: 'Raw Materials', path: '/store/listing?cat=raw-materials', icon: 'Boxes', emoji: '🧱', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] },
      { id: 'cat_consumables', label: 'Industrial Consumables', path: '/store/listing?cat=consumables', icon: 'Boxes', emoji: '🛢️', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] },
      { id: 'cat_measuring', label: 'Measuring & Inspection', path: '/store/listing?cat=measuring', icon: 'Boxes', emoji: '📏', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] },
      { id: 'cat_safety', label: 'Safety & Maintenance', path: '/store/listing?cat=safety', icon: 'Boxes', emoji: '🦺', defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'] }
    ]
  }
];

function defaultPermissionsForRole(roleId) {
  const perms = [];
  for (const cat of MENU_CATALOG) {
    for (const item of cat.items) {
      if (item.defaultRoles.includes(roleId) || (roleId && roleId.startsWith('sales_') && item.defaultRoles.includes('sales_user'))) {
        perms.push(item.id);
      }
    }
  }
  return perms;
}

function defaultRoles() {
  return [
    { id: 'sales_regional_partner', name: 'Regional Partner', category: 'sales_partner', markupPct: 10, requireTerms: true, terms: 'By registering as an ARGUS CNC Regional Partner, you agree to uphold our brand pricing guidelines, maintain active territory coverage, and adhere to our confidentiality and customer service standards. All orders are subject to regional quota allocations.', description: 'Authorized regional distribution partner with territory rights and 10% markup tier.', isSystem: true, active: true, menuPermissions: defaultPermissionsForRole('sales_regional_partner') },
    { id: 'sales_channel_partner', name: 'Channel Partner', category: 'sales_partner', markupPct: 15, requireTerms: true, terms: 'By registering as an ARGUS CNC Channel Partner, you agree to our resale terms, minimum advertised price (MAP) policies, and prompt payment settlements. Commercial warranty and return terms apply.', description: 'Certified industrial channel sales partner with 15% markup tier.', isSystem: true, active: true, menuPermissions: defaultPermissionsForRole('sales_channel_partner') },
    { id: 'sales_referral_partner', name: 'Referral Partner', category: 'sales_partner', markupPct: 5, requireTerms: true, terms: 'By registering as an ARGUS CNC Referral Partner, you agree that referrals must be bona fide commercial inquiries. Commission entitlements are calculated on the 5% tier basis upon order delivery.', description: 'Registered commercial referral agent with 5% markup tier.', isSystem: true, active: true, menuPermissions: defaultPermissionsForRole('sales_referral_partner') },
    { id: 'sales_user', name: 'Direct Sales User', category: 'sales_partner', markupPct: 0, requireTerms: true, terms: 'Standard direct sales representative agreement: confidential catalog pricing, customer order processing, and quotation terms apply.', description: 'Standard sales representative with base retail catalog pricing (0% markup).', isSystem: true, active: true, menuPermissions: defaultPermissionsForRole('sales_user') },
    { id: 'company_admin', name: 'Company Admin', category: 'internal', markupPct: 0, requireTerms: false, terms: '', description: 'Full company administration: manages catalog, inventory, users, and orders.', isSystem: true, active: true, menuPermissions: defaultPermissionsForRole('company_admin') },
    { id: 'content_writer', name: 'Content Writer', category: 'internal', markupPct: 0, requireTerms: false, terms: '', description: 'Prepares product marketing copy, technical specifications, and media.', isSystem: true, active: true, menuPermissions: defaultPermissionsForRole('content_writer') },
    { id: 'finance', name: 'Finance / Accounts', category: 'internal', markupPct: 0, requireTerms: false, terms: '', description: 'Sets selling price, review margins, and publishes products live.', isSystem: true, active: true, menuPermissions: defaultPermissionsForRole('finance') },
    { id: 'super_admin', name: 'Super Admin', category: 'internal', markupPct: 0, requireTerms: false, terms: '', description: 'Platform super administrator with cross-company governance.', isSystem: true, active: true, menuPermissions: defaultPermissionsForRole('super_admin') }
  ];
}

const PARTNER_ROLE_IDS = ['sales_user', 'sales_partner', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'];
const CATEGORY_PERM_IDS = [
  'cat_cnc_machines', 'cat_cutting_tools', 'cat_spares', 'cat_workholding',
  'cat_electrical', 'cat_raw_materials', 'cat_consumables', 'cat_measuring', 'cat_safety'
];

function ensureRolePermissions() {
  if (!Array.isArray(db.roles)) db.roles = defaultRoles();
  db.roles.forEach(r => {
    if (!Array.isArray(r.menuPermissions) || r.menuPermissions.length === 0) {
      r.menuPermissions = defaultPermissionsForRole(r.id);
    }
    // Auto-migrate new category permissions to roles that have store_listing
    if (r.menuPermissions.includes('store_listing')) {
      CATEGORY_PERM_IDS.forEach(cId => {
        if (!r.menuPermissions.includes(cId)) r.menuPermissions.push(cId);
      });
    }
    if (r.id === 'super_admin' && !r.menuPermissions.includes('super_access')) {
      r.menuPermissions.push('super_access');
    }
    if (r.id === 'company_admin') {
      if (!r.menuPermissions.includes('admin_invoice_profile')) r.menuPermissions.push('admin_invoice_profile');
      if (!r.menuPermissions.includes('admin_settings')) r.menuPermissions.push('admin_settings');
    }
    if (r.id === 'super_admin') {
      r.menuPermissions = r.menuPermissions.filter(p => p !== 'admin_invoice_profile' && p !== 'admin_settings');
      if (!r.menuPermissions.includes('super_invoice_profile')) r.menuPermissions.push('super_invoice_profile');
      if (!r.menuPermissions.includes('super_settings')) r.menuPermissions.push('super_settings');
    }
  });

  // Keep partner role permissions in sync across all sales partner sub-tiers
  const canonicalPartner = db.roles.find(r => r.id === 'sales_user') || db.roles.find(r => PARTNER_ROLE_IDS.includes(r.id));
  if (canonicalPartner && Array.isArray(canonicalPartner.menuPermissions)) {
    db.roles.forEach(r => {
      if (PARTNER_ROLE_IDS.includes(r.id) || (r.id && r.id.startsWith('sales_')) || r.category === 'sales_partner') {
        r.menuPermissions = [...canonicalPartner.menuPermissions];
      }
    });
  }

  if (Array.isArray(db.users)) {
    const superEmails = (SB.superEmails || ['jananimohan44@gmail.com', 'technologiesargus@gmail.com']).map(e => e.toLowerCase());
    db.users.forEach(u => {
      if (u.role === 'super_admin' && u.email) {
        const em = String(u.email).toLowerCase();
        if (!superEmails.includes(em)) superEmails.push(em);
        if (SB.superEmails && !SB.superEmails.includes(em)) SB.superEmails.push(em);
      }
      if (u.email && superEmails.includes(String(u.email).toLowerCase())) {
        u.role = 'super_admin';
        u.companyId = null;
      }
      if (!u.menuOverrides || typeof u.menuOverrides !== 'object') {
        u.menuOverrides = {};
      }
    });
  }
}

function getEffectivePermissionsForUser(uOrCtx) {
  if (!uOrCtx) return [];
  const email = (uOrCtx.email || '').toLowerCase();
  const u = email ? (db.users || []).find(x => (x.email || '').toLowerCase() === email) : (uOrCtx.id ? (db.users || []).find(x => x.id === uOrCtx.id) : null);
  const roleId = (u && u.role) || uOrCtx.role || 'sales_user';
  
  const isPartner = PARTNER_ROLE_IDS.includes(roleId) || (typeof roleId === 'string' && roleId.startsWith('sales_'));
  let roleObj = (db.roles || []).find(r => r.id === roleId);
  if ((!roleObj || !Array.isArray(roleObj.menuPermissions) || roleObj.menuPermissions.length === 0) && isPartner) {
    roleObj = (db.roles || []).find(r => r.id === 'sales_user') || (db.roles || []).find(r => PARTNER_ROLE_IDS.includes(r.id));
  }

  // 1. Base role permissions
  const rolePerms = new Set(roleObj && Array.isArray(roleObj.menuPermissions) && roleObj.menuPermissions.length > 0
    ? roleObj.menuPermissions
    : defaultPermissionsForRole(roleId));

  // 2. User-specific overrides ('allow' | 'deny' | 'inherit')
  const overrides = (u && u.menuOverrides) || (uOrCtx && uOrCtx.menuOverrides) || {};
  const effective = new Set(rolePerms);

  for (const [pageId, state] of Object.entries(overrides)) {
    if (state === 'allow') {
      effective.add(pageId);
    } else if (state === 'deny') {
      // Super admin critical safeguard: can never deny super_access or super_dashboard
      if (roleId === 'super_admin' && (pageId === 'super_access' || pageId === 'super_dashboard')) {
        continue;
      }
      effective.delete(pageId);
    }
  }

  // 3. Global Disabled Menus - HIGHEST PRECEDENCE (Global Disabled > User Overrides > Role Defaults)
  const globalDisabled = Array.isArray(db.globalDisabledMenus) ? db.globalDisabledMenus : [];
  for (const pageId of globalDisabled) {
    // Critical safeguard: never disable super_access or administrative settings for super_admin
    const superSafeguards = ['super_access', 'super_dashboard', 'super_settings', 'admin_settings', 'admin_invoice_profile', 'super_invoice_profile'];
    if (roleId === 'super_admin' && superSafeguards.includes(pageId)) {
      continue;
    }
    effective.delete(pageId);
  }

  // 4. Absolute system safety: Super Admin role ALWAYS has core administrative pages
  if (roleId === 'super_admin') {
    effective.add('super_access');
    effective.add('super_dashboard');
    effective.add('super_settings');
    effective.add('super_invoice_profile');
    effective.delete('admin_invoice_profile');
    effective.delete('admin_settings');
  }

  return Array.from(effective);
}

let db;
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
catch { db = seed(); try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch(e){} }
if (!Array.isArray(db.quotations)) { db.quotations = []; }
if (!Array.isArray(db.roles)) { db.roles = defaultRoles(); }
if (!Array.isArray(db.globalDisabledMenus)) { db.globalDisabledMenus = []; }
ensureRolePermissions();

let lastSyncTime = 0;
let pendingSave = null;
let syncPromise = null;

async function syncFromStorage(force = false) {
  if (!SB.enabled || !SB.admin) return;
  if (!force && (Date.now() - lastSyncTime < 2500)) return;
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    try {
      const { data, error } = await SB.admin.storage.from('retail-data').download('db.json');
      if (data && !error) {
        const text = await data.text();
        const remoteDb = JSON.parse(text);
        if (remoteDb && Array.isArray(remoteDb.products)) {
          Object.assign(db, remoteDb);
          ensureRolePermissions();
          lastSyncTime = Date.now();
        }
      }
    } catch (err) {
      console.warn('Sync from Supabase storage warning:', err.message);
    } finally {
      syncPromise = null;
    }
  })();
  return syncPromise;
}

const save = () => {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch(e){}
  if (SB.enabled && SB.admin) {
    const content = JSON.stringify(db, null, 2);
    pendingSave = SB.admin.storage.from('retail-data').upload('db.json', content, {
      contentType: 'application/json',
      upsert: true
    }).then(() => {
      lastSyncTime = Date.now();
    }).catch(err => {
      console.warn('Failed to persist db to Supabase storage:', err.message);
    });
  }
};

/* versioned migrations (backend/migrations/): additive only, never drop tables */
const { runMigrations } = require('./migrate.cjs');
const MIGRATED = runMigrations(db, save);
if (MIGRATED.length) console.log('Migrations applied:', MIGRATED.join(', '));

/* audit log for important administrative actions (no secrets) */
function audit(req, action, entity, entityId, companyId, summary) {
  db.audit_logs.unshift({ id: 'A-' + Date.now() + Math.floor(Math.random() * 90 + 10), ts: new Date().toISOString(), actor: req.ctx.name, role: req.ctx.role, action, entity, entityId: entityId || '', companyId: companyId || '', summary: summary || '' });
  if (db.audit_logs.length > 500) db.audit_logs.length = 500;
  save();
}
/* server-side pagination helper (?page&limit, defaults 1/50, max 200) */
function pageOf(list, req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const total = list.length;
  return { rows: list.slice((page - 1) * limit, page * limit), total, page, limit };
}
const companyById = id => db.companies.find(x => x.id === id);
const usersOf = cid => db.users.filter(u => u.companyId === cid);
const productsOf = cid => db.products.filter(p => p.companyId === cid);
const ordersOf = cid => db.orders.filter(o => o.companyId === cid);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Express 5 leaves req.body undefined when a request has no body (every GET); handlers read req.body.companyId, so give them an object.
app.use((req, _res, next) => { if (req.body === undefined) req.body = {}; next(); });
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Middleware: keep db synchronized across Vercel serverless instances and ensure saves complete
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api') && req.path !== '/api/health' && req.path !== '/api/config') {
    const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
    await syncFromStorage(isMutation);
  }
  const origJson = res.json.bind(res);
  const origSend = res.send.bind(res);
  res.json = async function(body) {
    if (pendingSave) {
      try { await pendingSave; } catch(e){}
      pendingSave = null;
    }
    return origJson(body);
  };
  res.send = async function(body) {
    if (pendingSave) {
      try { await pendingSave; } catch(e){}
      pendingSave = null;
    }
    return origSend(body);
  };
  next();
});

/* auth context: Google (Supabase Auth) Bearer token verified server-side;
   falls back to demo headers only when no token is supplied (offline demo) */
app.use(async (req, _res, next) => {
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ') && SB.enabled) {
    try {
      const u = await SB.authUserFromToken(h.slice(7).trim());
      if (u && u.email) {
        const email = String(u.email).toLowerCase();
        let person = (db.users || []).find(x => (x.email || '').toLowerCase() === email);
        const isSuper = SB.isSuperEmail ? SB.isSuperEmail(email) : (email === SB.superEmail);
        if (!person && isSuper) { // first-login bootstrap for the Super Admin
          person = { id: 'U-' + Date.now(), name: (u.user_metadata && u.user_metadata.full_name) || (email === 'technologiesargus@gmail.com' ? 'ARGUS TECHNOLOGIES' : 'Janani Mohan'), role: 'super_admin', companyId: null, email, active: true, createdAt: new Date().toISOString().slice(0, 10) };
          db.users.unshift(person); save();
        }
        if (person && isSuper && (person.role !== 'super_admin' || !person.active)) {
          person.role = 'super_admin';
          person.companyId = null;
          person.active = true;
          save();
        }
        const display = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || (person && person.name) || email;
        if (person && person.active === false) { req.ctx = { role: 'disabled', companyId: person.companyId, name: display, email, google: true, id: person.id }; return next(); }
        if (person) { req.ctx = { role: person.role, companyId: person.companyId, name: display, email, google: true, id: person.id }; return next(); }
        req.ctx = { role: 'pending', companyId: null, name: display, email, google: true }; return next(); // Google OK, no ERP account yet
      }
    } catch (e) {
      console.warn('Bearer auth error in server middleware:', e.message);
      /* fall through to demo headers */
    }
  }
  const userEmail = (req.headers['x-user-email'] || '').trim().toLowerCase();
  const userId = req.headers['x-user-id'] || '';
  let foundUser = null;
  if (userEmail) {
    foundUser = (db.users || []).find(x => (x.email || '').toLowerCase() === userEmail);
  }
  if (!foundUser && userId) {
    foundUser = (db.users || []).find(x => x.id === userId);
  }

  const isSuper = userEmail && (SB.isSuperEmail ? SB.isSuperEmail(userEmail) : (userEmail === SB.superEmail));
  const role = isSuper ? 'super_admin' : (foundUser ? foundUser.role : (req.headers['x-role'] || 'sales_user'));
  const companyId = isSuper ? null : (foundUser ? (foundUser.role === 'super_admin' ? null : foundUser.companyId) : (req.headers['x-company-id'] || 'C-ARGUS'));
  const name = foundUser ? foundUser.name : (req.headers['x-user-name'] || (isSuper ? (userEmail === 'technologiesargus@gmail.com' ? 'ARGUS TECHNOLOGIES' : 'Janani Mohan') : 'Argus User'));

  req.ctx = { 
    role, 
    companyId, 
    name,
    email: userEmail || (foundUser ? foundUser.email : ''),
    id: foundUser ? foundUser.id : userId
  };
  next();
});
/* pending/disabled Google users may only reach health, config and /api/me */
app.use((req, res, next) => {
  if ((req.ctx.role === 'pending' || req.ctx.role === 'disabled') && req.path.startsWith('/api/') && !['/api/health', '/api/config', '/api/me'].includes(req.path)) {
    return res.status(403).json({ error: req.ctx.role === 'pending' ? 'Account pending approval by your administrator' : 'Account deactivated' });
  }
  next();
});
/* company isolation: non-super users locked to their own company */
function scopeCompany(req, res, next) {
  if (req.ctx.role === 'super_admin') {
    req.companyId = req.query.companyId || req.body.companyId || 'C-ARGUS';
    return next();
  }
  const q = req.query.companyId || req.body.companyId;
  if (q && q !== req.ctx.companyId) return res.status(403).json({ error: 'Cross-company access denied' });
  req.companyId = req.ctx.companyId;
  next();
}
const ok = (res, data) => res.json({ data });
const isAdmin = req => req.ctx.role === 'company_admin' || req.ctx.role === 'super_admin';
/* --- publishing workflow roles: content_writer prepares, finance approves --- */
const isContentWriter = req => isAdmin(req) || req.ctx.role === 'content_writer';
const isFinance = req => isAdmin(req) || req.ctx.role === 'finance';
const isWorkflowStaff = req => isContentWriter(req) || isFinance(req);

const isSalesUser = req => {
  const r = (req.ctx && req.ctx.role) || '';
  if (r === 'sales_user' || r.startsWith('sales_')) return true;
  const roleObj = (db.roles || []).find(x => x.id === r);
  return !!(roleObj && roleObj.category === 'sales_partner');
};

function applyRolePricing(p, roleId) {
  if (!p || p.price == null) return p;
  const r = (db.roles || []).find(x => x.id === roleId);
  const markupPct = (r && typeof r.markupPct === 'number') ? r.markupPct : 0;
  if (markupPct > 0) {
    const adjustedPrice = Math.round(Number(p.price) * (1 + markupPct / 100));
    return {
      ...p,
      price: adjustedPrice,
      basePrice: p.price,
      appliedMarkupPct: markupPct,
      partnerTier: (r && r.name) || roleId
    };
  }
  return { ...p, basePrice: p.price, appliedMarkupPct: 0, partnerTier: (r && r.name) || null };
}

function attachTierBreakdown(p) {
  if (!p || p.price == null) return p;
  const roles = db.roles || [];
  const regRole = roles.find(r => r.id === 'sales_regional_partner');
  const chanRole = roles.find(r => r.id === 'sales_channel_partner');
  const refRole = roles.find(r => r.id === 'sales_referral_partner');

  const regPct = (regRole && typeof regRole.markupPct === 'number') ? regRole.markupPct : 10;
  const chanPct = (chanRole && typeof chanRole.markupPct === 'number') ? chanRole.markupPct : 15;
  const refPct = (refRole && typeof refRole.markupPct === 'number') ? refRole.markupPct : 5;

  return {
    ...p,
    basePrice: p.price,
    tierPricing: {
      base: p.price,
      regional: Math.round(Number(p.price) * (1 + regPct / 100)),
      channel: Math.round(Number(p.price) * (1 + chanPct / 100)),
      referral: Math.round(Number(p.price) * (1 + refPct / 100)),
      percentages: {
        regional: regPct,
        channel: chanPct,
        referral: refPct
      }
    }
  };
}

function attachProductMedia(p) {
  if (!p) return p;
  const media = (db.product_media || []).filter(m => m.productId === p.id && m.visible !== false)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return { ...p, media };
}

/* --- product publishing workflow (ERP → Content Writer → Finance → Sales) --- */
const WF = {
  PENDING: 'content_pending',
  IN_PROGRESS: 'content_in_progress',
  SUBMITTED: 'submitted_to_finance',
  REVIEW: 'finance_review',
  RETURNED: 'returned_for_correction',
  PRICED: 'pricing_saved',
  PUBLISHED: 'published'
};
const WF_STAGES = [WF.PENDING, WF.IN_PROGRESS, WF.SUBMITTED, WF.REVIEW, WF.RETURNED, WF.PRICED, WF.PUBLISHED];
const WF_LABELS = {
  content_pending: 'Needs Content',
  content_in_progress: 'In Progress',
  submitted_to_finance: 'Waiting for Finance',
  finance_review: 'Waiting for Finance',
  returned_for_correction: 'Needs Correction',
  pricing_saved: 'Waiting for Finance',
  published: 'Published'
};
/* legacy aliases seen in existing data → canonical stage. Anything unrecognised
   falls back to PENDING so a product can never become un-actionable for every role. */
const WF_STAGE_ALIASES = {
  content_ready: WF.PENDING, pending_content: WF.PENDING, new: WF.PENDING, received: WF.PENDING,
  content: WF.IN_PROGRESS, in_progress: WF.IN_PROGRESS,
  submitted: WF.SUBMITTED, review: WF.REVIEW,
  pricing: WF.PRICED, priced: WF.PRICED,
  approved: WF.PUBLISHED, live: WF.PUBLISHED
};
const normalizeStage = s => (!s ? null : (WF_STAGES.includes(s) ? s : (WF_STAGE_ALIASES[s] || WF.PENDING)));
/* stages where content may still be edited by a Content Writer */
const WF_CONTENT_EDITABLE = [WF.PENDING, WF.IN_PROGRESS, WF.RETURNED];
/* legacy / admin-created products carry no workflow_stage and default based on visibility */
const stageOf = p => normalizeStage(p && (p.workflow_stage || (p.visible ? WF.PUBLISHED : WF.PENDING)));
const isPublishedProduct = p => stageOf(p) === WF.PUBLISHED;
/* the single rule that keeps unpublished workflow products out of the Sales catalog */
const salesVisible = p => p.visible !== false && !p.archived && isPublishedProduct(p);
const wfCounts = list => WF_STAGES.reduce((a, s) => (a[s] = list.filter(p => stageOf(p) === s).length, a), {});
/* append an auditable history entry; `to` of null keeps the current stage */
function pushWorkflow(p, req, action, to, note) {
  const from = p.workflow_stage || null;
  p.workflow_stage = to || from;
  p.workflow_updated_at = new Date().toISOString();
  if (!Array.isArray(p.workflow_history)) p.workflow_history = [];
  p.workflow_history.push({
    id: 'W' + (p.workflow_history.length + 1) + Date.now().toString(36).toUpperCase(),
    action,
    from,
    to: p.workflow_stage,
    stage: WF_LABELS[p.workflow_stage] || p.workflow_stage,
    by: req.ctx.name || '',
    byRole: req.ctx.role,
    companyId: p.companyId,
    ts: new Date().toISOString(),
    note: note ? String(note).slice(0, 1000) : ''
  });
  if (p.workflow_history.length > 120) p.workflow_history.splice(0, p.workflow_history.length - 120);
  return p;
}
/* resolve a workflow product with company isolation + workflow membership checks */
function wfFind(req, res) {
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) { res.status(404).json({ error: 'Product not found' }); return null; }
  const co = req.companyId || req.ctx.companyId;
  if (req.ctx.role !== 'super_admin' && p.companyId !== co) { res.status(403).json({ error: 'Cross-company access denied' }); return null; }
  if (!p.workflow_stage) {
    p.workflow_stage = stageOf(p) || WF.PENDING;
    save();
  }
  return p;
}
const wfGuard = (req, res, roles) => {
  if (!roles(req)) { res.status(403).json({ error: 'Your role is not permitted to perform this action' }); return false; }
  return true;
};
const wfReject = (res, code, error, extra) => res.status(code).json({ error, ...(extra || {}) });
/* collision-free ids (random 4-digit ids used to clash and overwrite each other) */
function uid(prefix, list) {
  let id;
  do { id = prefix + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase(); } while (list.some(x => x.id === id));
  return id;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/api/config', (_req, res) => res.json({ data: SB.publicConfig() }));
app.get('/api/me', (req, res) => {
  const u = req.ctx.email ? db.users.find(x => (x.email || '').toLowerCase() === req.ctx.email) : null;
  const roleId = (u && u.role) || req.ctx.role;
  const roleObj = (db.roles || []).find(r => r.id === roleId);
  const effectivePermissions = getEffectivePermissionsForUser(u || req.ctx);
  res.json({
    data: {
      id: (u && u.id) || 'U-GUEST',
      role: roleId,
      companyId: roleId === 'super_admin' ? (u ? u.companyId : null) : ((u && u.companyId) || req.ctx.companyId),
      name: (u && u.name) || req.ctx.name,
      email: req.ctx.email || '',
      mobile: (u && u.mobile) || '',
      google: !!req.ctx.google,
      salesTier: (roleObj && roleObj.category === 'sales_partner') ? roleObj.name : null,
      markupPct: (roleObj && typeof roleObj.markupPct === 'number') ? roleObj.markupPct : 0,
      termsAccepted: (u && u.termsAccepted) || false,
      effectivePermissions,
      menuOverrides: (u && u.menuOverrides) || {},
      globalDisabledMenus: db.globalDisabledMenus || []
    }
  });
});
app.patch('/api/me', (req, res) => {
  const u = req.ctx.email ? db.users.find(x => (x.email || '').toLowerCase() === req.ctx.email) : null;
  if (!u) return res.status(400).json({ error: 'Sign in with Google to edit your profile' });
  if (req.body.name != null) { const n = String(req.body.name).trim(); if (!n) return res.status(400).json({ error: 'name required' }); u.name = n; }
  if (req.body.mobile != null) u.mobile = String(req.body.mobile).trim();
  save();
  ok(res, u);
});

/* companies (super_admin) — searchable, filterable, paginated */
app.get('/api/companies', (req, res) => {
  const effective = getEffectivePermissionsForUser(req.ctx);
  if (!effective.includes('super_companies') && req.ctx.role !== 'super_admin') {
    return res.status(403).json({ error: 'Permission denied: Company Hub access required', code: 'PERMISSION_DENIED' });
  }
  let list = [...db.companies];
  if (req.query.q) { const q = req.query.q.toLowerCase(); list = list.filter(c => (c.name + ' ' + (c.code || '') + ' ' + (c.city || '') + ' ' + (c.industry || '') + ' ' + (c.email || '')).toLowerCase().includes(q)); }
  if (req.query.status && req.query.status !== 'all') list = list.filter(c => (c.storeStatus || c.status) === req.query.status);
  if (req.query.industry && req.query.industry !== 'all') list = list.filter(c => c.industry === req.query.industry);
  if (req.query.city && req.query.city !== 'all') list = list.filter(c => c.city === req.query.city);
  list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const withCounts = l => l.map(c => ({ ...c, admin: (usersOf(c.id).find(u => u.role === 'company_admin') || {}).name || '', userCount: usersOf(c.id).length, productCount: productsOf(c.id).length, orderCount: ordersOf(c.id).length }));
  if (req.query.page || req.query.limit) { const pg = pageOf(list, req); pg.rows = withCounts(pg.rows); return ok(res, pg); }
  ok(res, withCounts(list));
});
app.get('/api/companies/:id', (req, res) => {
  if (req.ctx.role !== 'super_admin' && req.ctx.companyId !== req.params.id) return res.status(403).json({ error: 'denied' });
  const c = companyById(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const ps = productsOf(c.id), os = ordersOf(c.id), us = usersOf(c.id);
  const qs = db.quotations.filter(q => q.companyId === c.id);
  ok(res, { ...c, admin: us.find(u => u.role === 'company_admin') || null, userCount: us.length, productCount: ps.length, visibleCount: ps.filter(p => p.visible && !p.archived).length, categoryCount: new Set(ps.map(p => p.category)).size, orderCount: os.length, pendingOrders: os.filter(o => o.status === 'Pending').length, revenue: os.reduce((a, o) => a + o.total, 0), quoteCount: qs.length, openQuotes: qs.filter(q => q.status === 'Pending').length });
});
app.post('/api/companies', (req, res) => {
  if (req.ctx.role !== 'super_admin') return res.status(403).json({ error: 'super_admin only' });
  const { name, code, city, industry, email, phone, address, state, pin, description, adminName, adminEmail, plan } = req.body;
  if (!name || !city) return res.status(400).json({ error: 'name and city required' });
  const finalCode = (code || ('C-' + name.slice(0, 1).toUpperCase() + Math.floor(Math.random() * 90 + 10))).trim();
  if (db.companies.some(x => x.id === finalCode || x.code === finalCode)) return res.status(400).json({ error: 'company code already exists' });
  const cleanAdmin = String(adminEmail || '').toLowerCase().trim();
  if (adminName && !cleanAdmin) return res.status(400).json({ error: 'admin email required to provision Company Admin' });
  if (cleanAdmin && db.users.some(u => (u.email || '').toLowerCase().trim() === cleanAdmin)) return res.status(400).json({ error: 'admin email already registered' });
  const today = new Date().toISOString().slice(0, 10);
  const c = { id: finalCode, code: finalCode, name, logo: '🏭', industry: industry || 'CNC Manufacturing', email: email || '', phone: phone || '', address: address || '', city, state: state || '', pin: pin || '', description: description || '', status: 'active', storeStatus: 'active', plan: plan || 'Starter', orders: 0, revenue: 0, products: 0, users: 1, createdAt: today, updatedAt: today };
  db.companies.unshift(c);
  // an admin email alone is enough — before, no admin was created unless a name was typed too
  if (cleanAdmin) db.users.unshift({ id: uid('U-', db.users), name: (adminName || cleanAdmin.split('@')[0]).trim(), role: 'company_admin', companyId: finalCode, email: cleanAdmin, active: true, createdAt: today });
  save();
  audit(req, 'company.create', 'company', finalCode, finalCode, `Created ${name} (${finalCode})`);
  ok(res, c);
});
app.put('/api/companies/:id', (req, res) => {
  if (req.ctx.role !== 'super_admin') return res.status(403).json({ error: 'super_admin only' });
  const c = companyById(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const allow = ['name', 'logo', 'industry', 'email', 'phone', 'address', 'city', 'state', 'pin', 'description', 'plan', 'storeStatus', 'status'];
  for (const k of allow) if (req.body[k] !== undefined) c[k] = req.body[k];
  if (c.storeStatus === 'suspended' || c.storeStatus === 'inactive') c.status = 'suspended'; else c.status = 'active';
  c.updatedAt = new Date().toISOString().slice(0, 10);
  save();
  audit(req, 'company.update', 'company', c.id, c.id, `Updated ${c.name}: ${Object.keys(req.body).join(', ')}`);
  ok(res, c);
});
app.patch('/api/companies/:id', (req, res) => {
  if (req.ctx.role !== 'super_admin') return res.status(403).json({ error: 'super_admin only' });
  const c = db.companies.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const allow = ['name', 'logo', 'industry', 'email', 'phone', 'address', 'city', 'state', 'pin', 'description', 'plan', 'storeStatus', 'status'];
  for (const k of allow) if (req.body[k] !== undefined) c[k] = req.body[k];
  if (c.storeStatus === 'suspended' || c.storeStatus === 'inactive') c.status = 'suspended'; else c.status = 'active';
  c.updatedAt = new Date().toISOString().slice(0, 10);
  save();
  audit(req, 'company.update', 'company', c.id, c.id, `Updated ${c.name}: ${Object.keys(req.body).join(', ')}`);
  ok(res, c);
});

/* ---------------- Roles Management & Partner Tiers ---------------- */
app.get('/api/roles', (req, res) => {
  ok(res, db.roles || []);
});

app.post('/api/roles', scopeCompany, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  const { name, category, markupPct, requireTerms, terms, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Role name required' });
  const cleanName = name.trim();
  const id = 'role_' + cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if ((db.roles || []).some(r => r.id === id || r.name.toLowerCase() === cleanName.toLowerCase())) {
    return res.status(400).json({ error: 'Role with this name already exists' });
  }
  const newRole = {
    id,
    name: cleanName,
    category: category || 'sales_partner',
    markupPct: markupPct != null ? Math.max(0, Number(markupPct)) : 0,
    requireTerms: !!requireTerms,
    terms: terms || '',
    description: description || '',
    isSystem: false,
    active: true,
    createdAt: new Date().toISOString()
  };
  db.roles.push(newRole);
  save();
  audit(req, 'role.create', 'role', id, req.companyId, `Created role ${cleanName} (${newRole.markupPct}%)`);
  ok(res, newRole);
});

app.patch('/api/roles/:id', scopeCompany, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  const r = (db.roles || []).find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Role not found' });
  if (req.body.name && req.body.name.trim()) r.name = req.body.name.trim();
  if (req.body.category) r.category = req.body.category;
  if (req.body.markupPct != null) r.markupPct = Math.max(0, Number(req.body.markupPct));
  if (req.body.requireTerms != null) r.requireTerms = !!req.body.requireTerms;
  if (req.body.terms != null) r.terms = req.body.terms;
  if (req.body.description != null) r.description = req.body.description;
  if (req.body.active != null) r.active = !!req.body.active;
  save();
  audit(req, 'role.update', 'role', r.id, req.companyId, `Updated role ${r.name}: markup ${r.markupPct}%`);
  ok(res, r);
});

app.delete('/api/roles/:id', scopeCompany, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  const idx = (db.roles || []).findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Role not found' });
  if (db.roles[idx].isSystem) return res.status(400).json({ error: 'Cannot delete core system role' });
  if ((db.users || []).some(u => u.role === req.params.id)) {
    return res.status(400).json({ error: 'Cannot delete role because users are currently assigned to it' });
  }
  const deleted = db.roles.splice(idx, 1)[0];
  save();
  audit(req, 'role.delete', 'role', deleted.id, req.companyId, `Deleted role ${deleted.name}`);
  ok(res, { ok: true, deleted: deleted.id });
});

/* ---------------- Dynamic Menu Permissions API ---------------- */

// 1. Get full menu catalog
app.get('/api/permissions/catalog', (req, res) => {
  ok(res, MENU_CATALOG);
});

// 2. Get all roles with configured permissions (consolidated, no duplicates)
app.get('/api/permissions/roles', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  ensureRolePermissions();

  const canonicalPartner = (db.roles || []).find(r => r.id === 'sales_user') || (db.roles || []).find(r => PARTNER_ROLE_IDS.includes(r.id));
  const partnerPerms = canonicalPartner?.menuPermissions || defaultPermissionsForRole('sales_user');
  const totalPartnerUsers = (db.users || []).filter(u => PARTNER_ROLE_IDS.includes(u.role) || (u.role && u.role.startsWith('sales_'))).length;

  const result = [];
  let partnerAdded = false;

  (db.roles || []).forEach(r => {
    const isPartner = PARTNER_ROLE_IDS.includes(r.id) || (r.category === 'sales_partner' && r.isSystem);
    if (isPartner) {
      if (!partnerAdded) {
        result.push({
          id: 'sales_user',
          name: 'Sales Partner',
          category: 'sales_partner',
          isSystem: true,
          markupPct: 0,
          menuPermissions: partnerPerms,
          userCount: totalPartnerUsers,
          description: 'Role permissions template for all Sales Partners (Regional, Channel, Referral, and Direct Sales).'
        });
        partnerAdded = true;
      }
    } else {
      result.push({
        id: r.id,
        name: r.name,
        category: r.category,
        isSystem: !!r.isSystem,
        markupPct: r.markupPct,
        menuPermissions: r.menuPermissions || defaultPermissionsForRole(r.id),
        userCount: (db.users || []).filter(u => u.role === r.id).length,
        description: r.description
      });
    }
  });

  ok(res, result);
});

// 3. Update role default menu permissions
app.patch('/api/permissions/roles/:id', (req, res) => {
  if (req.ctx.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Super Admin can configure role menu permissions' });
  }
  ensureRolePermissions();

  const isPartnerTarget = PARTNER_ROLE_IDS.includes(req.params.id) || req.params.id.startsWith('sales_');

  const { menuPermissions } = req.body;
  if (!Array.isArray(menuPermissions)) {
    return res.status(400).json({ error: 'menuPermissions must be an array of page IDs' });
  }

  // Precedence safeguard: super_admin role must ALWAYS retain super_access
  const finalPerms = [...new Set(menuPermissions)];
  if (req.params.id === 'super_admin' && !finalPerms.includes('super_access')) {
    finalPerms.push('super_access');
  }

  const now = new Date().toISOString();

  if (isPartnerTarget) {
    (db.roles || []).forEach(r => {
      if (PARTNER_ROLE_IDS.includes(r.id) || (r.id && r.id.startsWith('sales_')) || r.category === 'sales_partner') {
        r.menuPermissions = [...finalPerms];
        r.updatedAt = now;
      }
    });
    save();
    audit(req, 'permissions.role_update', 'role', 'sales_user', req.companyId,
      `Updated role permissions for "Sales Partner" (applied to all partner roles): ${finalPerms.length} pages enabled`);

    return ok(res, {
      role: 'sales_user',
      name: 'Sales Partner',
      menuPermissions: finalPerms,
      updatedAt: now
    });
  }

  const role = (db.roles || []).find(r => r.id === req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found' });

  const prevCount = (role.menuPermissions || []).length;
  role.menuPermissions = finalPerms;
  role.updatedAt = now;
  save();

  audit(req, 'permissions.role_update', 'role', role.id, req.companyId,
    `Updated role permissions for "${role.name}": ${finalPerms.length} pages enabled (was ${prevCount})`);

  ok(res, {
    role: role.id,
    name: role.name,
    menuPermissions: role.menuPermissions,
    updatedAt: role.updatedAt
  });
});

// 4. Get specific user permissions & overrides
app.get('/api/permissions/users/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  ensureRolePermissions();
  const u = (db.users || []).find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });

  const roleObj = (db.roles || []).find(r => r.id === u.role);
  const roleDefaults = roleObj && Array.isArray(roleObj.menuPermissions)
    ? roleObj.menuPermissions
    : defaultPermissionsForRole(u.role);

  const effective = getEffectivePermissionsForUser(u);

  ok(res, {
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      roleName: roleObj ? roleObj.name : u.role,
      companyId: u.companyId,
      companyName: (companyById(u.companyId) || {}).name || (u.companyId ? u.companyId : '— platform —')
    },
    roleDefaults,
    menuOverrides: u.menuOverrides || {},
    effectivePermissions: effective
  });
});

// 5. Update user-specific overrides ('allow' | 'deny')
app.patch('/api/permissions/users/:id', (req, res) => {
  if (req.ctx.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Super Admin can configure user permission overrides' });
  }
  ensureRolePermissions();
  const u = (db.users || []).find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });

  const { menuOverrides } = req.body;
  if (!menuOverrides || typeof menuOverrides !== 'object') {
    return res.status(400).json({ error: 'menuOverrides must be an object of { [pageId]: "allow" | "deny" }' });
  }

  // Sanitize: only 'allow' and 'deny' values kept; protect super_admin from denying super_access
  const cleanOverrides = {};
  for (const [k, v] of Object.entries(menuOverrides)) {
    if (v === 'allow' || v === 'deny') {
      if (u.role === 'super_admin' && (k === 'super_access' || k === 'super_dashboard') && v === 'deny') {
        continue; // lockout protection
      }
      cleanOverrides[k] = v;
    }
  }

  u.menuOverrides = cleanOverrides;
  u.updatedAt = new Date().toISOString();
  save();

  const effective = getEffectivePermissionsForUser(u);
  audit(req, 'permissions.user_update', 'user', u.id, u.companyId,
    `Updated permission overrides for user "${u.name}" (${u.email}): ${Object.keys(cleanOverrides).length} overrides active`);

  ok(res, {
    user: u.id,
    menuOverrides: u.menuOverrides,
    effectivePermissions: effective
  });
});

// 6. Reset user overrides back to role defaults (Inherit All)
app.post('/api/permissions/users/:id/reset', (req, res) => {
  if (req.ctx.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Super Admin can reset user permission overrides' });
  }
  ensureRolePermissions();
  const u = (db.users || []).find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });

  const prevCount = Object.keys(u.menuOverrides || {}).length;
  u.menuOverrides = {};
  u.updatedAt = new Date().toISOString();
  save();

  const effective = getEffectivePermissionsForUser(u);
  audit(req, 'permissions.user_reset', 'user', u.id, u.companyId,
    `Reset permission overrides for user "${u.name}" (${u.email}) back to role defaults (cleared ${prevCount} overrides)`);

  ok(res, {
    user: u.id,
    menuOverrides: {},
    effectivePermissions: effective
  });
});

// 7. Permission audit logs
app.get('/api/permissions/audit', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  const logs = (db.audit_logs || []).filter(a => a.action && a.action.startsWith('permissions.'));
  ok(res, logs);
});

// 8. Global Disabled Menus (Kill-Switch)
app.get('/api/permissions/global-disabled', (req, res) => {
  ok(res, { ok: true, disabled: Array.isArray(db.globalDisabledMenus) ? db.globalDisabledMenus : [] });
});

app.post('/api/permissions/global-disabled', (req, res) => {
  if (req.ctx.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only Super Admin can configure global menu status' });
  }
  const { disabled } = req.body;
  if (!Array.isArray(disabled)) {
    return res.status(400).json({ error: 'disabled must be an array of page IDs' });
  }
  // Safeguard: Never allow super_access to be globally disabled
  const cleanDisabled = disabled.filter(id => id !== 'super_access');
  const prevCount = (db.globalDisabledMenus || []).length;
  db.globalDisabledMenus = cleanDisabled;
  save();

  audit(req, 'permissions.global_disabled_update', 'system', 'global_menus', req.companyId,
    `Updated globally disabled menus: ${cleanDisabled.length} menus disabled globally (was ${prevCount})`);

  ok(res, {
    ok: true,
    disabled: db.globalDisabledMenus
  });
});

/* users — super_admin manages across companies; company_admin only own company */
const ROLES = ['super_admin', 'company_admin', 'content_writer', 'finance', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'];
app.get('/api/users', scopeCompany, (req, res) => {
  const cid = req.ctx.role === 'super_admin' ? (req.query.companyId || null) : req.companyId;
  let list = db.users.filter(u => !cid || u.companyId === cid || (req.ctx.role === 'super_admin' && !cid && !req.query.companyId));
  if (req.query.q) { const q = req.query.q.toLowerCase(); list = list.filter(u => (u.name + ' ' + u.email).toLowerCase().includes(q)); }
  if (req.query.role && req.query.role !== 'all') list = list.filter(u => u.role === req.query.role);
  if (req.query.active && req.query.active !== 'all') list = list.filter(u => String(!!u.active) === req.query.active);
  const withCo = l => l.map(u => {
    const rObj = (db.roles || []).find(r => r.id === u.role);
    return {
      ...u,
      roleName: (rObj && rObj.name) || (u.role === 'company_admin' ? 'Company Admin' : u.role === 'super_admin' ? 'Super Admin' : u.role),
      markupPct: (rObj && typeof rObj.markupPct === 'number') ? rObj.markupPct : 0,
      companyName: (companyById(u.companyId) || {}).name || (u.companyId ? u.companyId : '— platform —')
    };
  });
  if (req.query.page || req.query.limit) { const pg = pageOf(list, req); pg.rows = withCo(pg.rows); return ok(res, pg); }
  ok(res, withCo(list));
});
app.post('/api/users', scopeCompany, (req, res) => {
  if (!['company_admin', 'super_admin'].includes(req.ctx.role)) return res.status(403).json({ error: 'admin only' });
  const { name, email, role, mobile, termsAccepted } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  const cleanEmail = email.toLowerCase().trim();
  const knownRoles = (db.roles || []).map(r => r.id);
  const targetRole = role || 'sales_user';
  if (role && !knownRoles.includes(role) && !ROLES.includes(role)) return res.status(400).json({ error: 'invalid role' });
  if (db.users.some(u => (u.email || '').toLowerCase().trim() === cleanEmail)) return res.status(400).json({ error: 'email already registered' });
  
  const roleObj = (db.roles || []).find(r => r.id === targetRole);
  if (roleObj && roleObj.requireTerms && !termsAccepted) {
    return res.status(400).json({ error: 'Sales Terms and Conditions must be accepted for ' + roleObj.name });
  }

  if (targetRole === 'super_admin' && req.ctx.role !== 'super_admin') return res.status(403).json({ error: 'only Super Admin can assign super_admin role' });
  const targetCompany = req.ctx.role === 'super_admin' ? (targetRole === 'super_admin' ? null : req.body.companyId) : (req.companyId || req.ctx.companyId || req.body.companyId);
  if (targetRole !== 'super_admin' && !targetCompany) return res.status(400).json({ error: 'companyId required' });
  if (targetCompany && !companyById(targetCompany)) return res.status(400).json({ error: 'unknown company' });
  const u = {
    id: 'U-' + Date.now(),
    name: name.trim(),
    email: cleanEmail,
    mobile: mobile || '',
    role: targetRole,
    companyId: targetCompany,
    termsAccepted: !!termsAccepted,
    termsAcceptedAt: termsAccepted ? new Date().toISOString() : null,
    termsVersion: '1.0',
    active: true,
    createdAt: new Date().toISOString().slice(0, 10)
  };
  if (targetRole === 'super_admin' && SB.superEmails && !SB.superEmails.includes(cleanEmail)) {
    SB.superEmails.push(cleanEmail);
  }
  db.users.unshift(u); save();
  audit(req, 'user.create', 'user', u.id, targetCompany, `Created ${name} (${targetRole})`);
  ok(res, u);
});
app.post('/api/users/sync-local', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  const users = Array.isArray(req.body.users) ? req.body.users : [];
  let added = 0;
  for (const u of users) {
    if (!u.email || !u.name) continue;
    const em = u.email.toLowerCase().trim();
    if (!db.users.some(x => (x.email || '').toLowerCase().trim() === em)) {
      db.users.unshift({
        id: u.id || ('U-' + Date.now() + Math.floor(Math.random() * 100)),
        name: u.name.trim(),
        email: em,
        mobile: u.mobile || '',
        role: u.role === 'company_admin' ? 'company_admin' : 'sales_user', // never super_admin via sync
        companyId: req.ctx.role === 'super_admin' ? (u.companyId || 'C-ARGUS') : req.ctx.companyId,
        active: u.active !== false,
        createdAt: u.createdAt || new Date().toISOString().slice(0, 10)
      });
      added++;
    }
  }
  if (added > 0) save();
  ok(res, { synced: added, total: db.users.length });
});
app.patch('/api/users/:id', scopeCompany, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  const u = db.users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'not found' });
  if (req.ctx.role !== 'super_admin' && u.companyId !== req.companyId) return res.status(403).json({ error: 'denied' });
  const knownRoles = (db.roles || []).map(r => r.id);
  if (req.body.role && !knownRoles.includes(req.body.role) && !ROLES.includes(req.body.role)) return res.status(400).json({ error: 'invalid role' });
  if (req.body.role === 'super_admin' && req.ctx.role !== 'super_admin') return res.status(403).json({ error: 'only Super Admin can assign super_admin role' });
  if (req.ctx.role !== 'super_admin') delete req.body.companyId; // company fixed for non-super
  delete req.body.id; delete req.body.email; // identity is fixed
  Object.assign(u, req.body); save();
  audit(req, 'user.update', 'user', u.id, u.companyId, `Updated ${u.name}: ${Object.keys(req.body).join(', ')}`);
  ok(res, u);
});
app.delete('/api/users/:id', scopeCompany, (req, res) => {
  if (req.ctx.role !== 'super_admin') return res.status(403).json({ error: 'super_admin only' });
  const u = db.users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'not found' });
  if (u.role === 'super_admin') {
    const totalSuper = db.users.filter(x => x.role === 'super_admin').length;
    if (totalSuper <= 1) return res.status(400).json({ error: 'Cannot remove the last remaining Super Admin' });
    if (req.ctx.id && req.ctx.id === u.id) return res.status(400).json({ error: 'Cannot remove your own logged-in Super Admin account' });
    if (req.ctx.email && (u.email || '').toLowerCase() === req.ctx.email.toLowerCase()) return res.status(400).json({ error: 'Cannot remove your own logged-in Super Admin account' });
  }
  db.users = db.users.filter(x => x.id !== req.params.id);
  save();
  audit(req, 'user.delete', 'user', u.id, u.companyId, `Deleted user ${u.name} (${u.role})`);
  ok(res, { deleted: true });
});

/* categories — global (super) + company-specific; assignments link global cats to companies */
const catsForCompany = cid => {
  const assigned = new Set((db.category_assignments || []).filter(a => a.companyId === cid).map(a => a.categoryId));
  return db.categories.filter(c => (c.scope === 'global' && (c.companyId === null || assigned.has(c.id) || !c.companyId)) || (c.scope === 'company' && c.companyId === cid));
};
app.get('/api/categories', (req, res) => {
  let list = [...db.categories];
  if (req.query.scope && req.query.scope !== 'all') list = list.filter(c => c.scope === req.query.scope);
  if (req.query.companyId) list = list.filter(c => c.scope === 'company' && c.companyId === req.query.companyId);
  if (req.query.active && req.query.active !== 'all') list = list.filter(c => String(!!c.active) === req.query.active);
  list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const withCounts = l => l.map(c => ({ ...c, productCount: db.products.filter(p => p.category === c.id && (!req.query.forCompany || p.companyId === req.query.forCompany)).length, assignedTo: (db.category_assignments || []).filter(a => a.categoryId === c.id).map(a => a.companyId) }));
  if (req.query.page || req.query.limit) { const pg = pageOf(list, req); pg.rows = withCounts(pg.rows); return ok(res, pg); }
  ok(res, withCounts(list));
});
app.get('/api/categories/company/:cid', (req, res) => {
  if (req.ctx.role !== 'super_admin' && req.ctx.companyId !== req.params.cid) return res.status(403).json({ error: 'denied' });
  ok(res, catsForCompany(req.params.cid).filter(c => c.active !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
});
app.post('/api/categories', (req, res) => {
  if (req.ctx.role === 'sales_user') return res.status(403).json({ error: 'admin only' });
  const { name, icon, desc, image, scope, companyId, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (db.categories.some(c => c.id === id)) return res.status(400).json({ error: 'category already exists' });
  const sc = req.ctx.role === 'super_admin' ? (scope || 'global') : 'company';
  const co = sc === 'company' ? (req.ctx.role === 'super_admin' ? (companyId || null) : req.ctx.companyId) : null;
  if (sc === 'company' && !co) return res.status(400).json({ error: 'companyId required for company category' });
  const c = { id, name, icon: icon || '🏭', desc: desc || '', image: image || '', scope: sc, companyId: co, sortOrder: sortOrder != null ? sortOrder : db.categories.length, active: true };
  db.categories.push(c); save();
  audit(req, 'category.create', 'category', id, co, `Created category ${name} (${sc})`);
  ok(res, c);
});
app.put('/api/categories/:id', (req, res) => {
  if (req.ctx.role === 'sales_user') return res.status(403).json({ error: 'admin only' });
  const c = db.categories.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  if (req.ctx.role !== 'super_admin' && !(c.scope === 'company' && c.companyId === req.ctx.companyId)) return res.status(403).json({ error: 'denied' });
  if (req.body.active === false && c.active !== false && !req.query.force) {
    const n = db.products.filter(p => p.category === c.id && !p.archived).length;
    if (n) return res.status(400).json({ error: `category has ${n} live product(s); confirm to avoid orphaning (retry with ?force=1)` });
  }
  for (const k of ['name', 'icon', 'desc', 'image', 'sortOrder', 'active']) if (req.body[k] !== undefined) c[k] = req.body[k];
  save();
  audit(req, 'category.update', 'category', c.id, c.companyId, `Updated category ${c.name}`);
  ok(res, c);
});
app.post('/api/categories/:id/assign', (req, res) => {
  if (req.ctx.role !== 'super_admin') return res.status(403).json({ error: 'super_admin only' });
  const c = db.categories.find(x => x.id === req.params.id);
  if (!c || c.scope !== 'global') return res.status(400).json({ error: 'only global categories can be assigned' });
  const { companyId } = req.body;
  if (!companyById(companyId)) return res.status(400).json({ error: 'unknown company' });
  db.category_assignments = db.category_assignments || [];
  if (!db.category_assignments.some(a => a.categoryId === c.id && a.companyId === companyId)) db.category_assignments.push({ categoryId: c.id, companyId });
  save();
  audit(req, 'category.assign', 'category', c.id, companyId, `Assigned ${c.name} to ${companyId}`);
  ok(res, { assigned: true });
});
app.delete('/api/categories/:id/assign', (req, res) => {
  if (req.ctx.role !== 'super_admin') return res.status(403).json({ error: 'super_admin only' });
  db.category_assignments = (db.category_assignments || []).filter(a => !(a.categoryId === req.params.id && a.companyId === req.query.companyId));
  save();
  audit(req, 'category.unassign', 'category', req.params.id, req.query.companyId, 'Unassigned category');
  ok(res, { assigned: false });
});

/* products — industrial model: sku/brand/mpn/uom/moq/leadTime/warehouse; price null = quotation-only */
const prodText = p => [p.name, p.short, p.desc, p.sku, p.brand, p.mpn, p.category].filter(Boolean).join(' ').toLowerCase();
app.get('/api/products', (req, res) => {
  let list = [...db.products];
  const cid = req.ctx.role === 'super_admin' ? req.query.companyId : (req.companyId || req.ctx.companyId);
  if (req.query.companyId) {
    if (req.ctx.role !== 'super_admin' && req.query.companyId !== req.ctx.companyId) return res.status(403).json({ error: 'denied' });
    list = list.filter(p => p.companyId === req.query.companyId);
  } else if (req.ctx.role !== 'super_admin' && cid) list = list.filter(p => p.companyId === cid);
  if (req.query.visible) list = list.filter(p => String(p.visible) === req.query.visible);
  if (req.query.cat && req.query.cat !== 'all') list = list.filter(p => p.category === req.query.cat);
  if (req.query.brand && req.query.brand !== 'all') list = list.filter(p => p.brand === req.query.brand);
  if (req.query.q) { const q = req.query.q.toLowerCase(); list = list.filter(p => prodText(p).includes(q)); }
  if (req.query.archived && req.query.archived !== 'all') list = list.filter(p => String(!!p.archived) === req.query.archived);
  if (isSalesUser(req)) {
    list = list.filter(salesVisible).map(p => attachProductMedia(applyRolePricing(p, req.ctx.role)));
  } else {
    list = list.map(p => attachProductMedia(attachTierBreakdown(p)));
  }
  if (req.query.page || req.query.limit) return ok(res, pageOf(list, req));
  ok(res, list);
});
app.get('/api/products/:id', (req, res) => {
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  if (req.ctx.role !== 'super_admin' && p.companyId !== req.ctx.companyId) return res.status(403).json({ error: 'denied' });
  /* Salespeople may only open published listings — a direct ID hit never leaks a draft */
  if (isSalesUser(req) && !salesVisible(p)) return res.status(404).json({ error: 'not found' });
  /* attach visible media (images, PDFs, video, YouTube) so the detail page can render it */
  const media = (db.product_media || []).filter(m => m.productId === p.id && m.visible !== false)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const productWithPrice = isSalesUser(req) ? applyRolePricing(p, req.ctx.role) : attachTierBreakdown(p);
  ok(res, { ...productWithPrice, media });
});
app.post('/api/products', scopeCompany, (req, res) => {
  if (req.ctx.role === 'sales_user') return res.status(403).json({ error: 'admin only' });
  if (req.body.price === '') req.body.price = null;
  if (req.body.price != null) req.body.price = Number(req.body.price);
  if (req.body.stock != null && req.body.stock !== '') req.body.stock = Number(req.body.stock);
  const { name, price, stock, sku } = req.body;
  const co = req.companyId || req.body.companyId;
  if (!co) return res.status(400).json({ error: 'companyId required' });
  if (!companyById(co)) return res.status(400).json({ error: 'unknown company' });
  if (!name || !sku) return res.status(400).json({ error: 'name and SKU required' });
  if (price != null && !(price > 0)) return res.status(400).json({ error: 'price must be > 0 or empty (quotation-only)' });
  if (stock == null || stock === '' || !(stock >= 0)) return res.status(400).json({ error: 'stock >= 0 required' });
  if (db.products.some(p => p.sku === sku && p.companyId === co)) return res.status(400).json({ error: `SKU "${sku}" already exists in this company - use a different SKU or edit the existing product` });
  if (req.body.category && !db.categories.some(c => c.id === req.body.category)) return res.status(400).json({ error: 'unknown category' });
  delete req.body.id;
  const p = { id: uid('P-', db.products), sold: 0, featured: false, visible: true, active: true, archived: false, uom: 'Pc', moq: 1, created: new Date().toISOString().slice(0, 10), ...req.body, companyId: co };
  db.products.unshift(p); save();
  audit(req, 'product.create', 'product', p.id, co, `Created SKU ${sku} in ${co}`);
  ok(res, p);
});
app.put('/api/products/:id', scopeCompany, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  if (req.body.price === '') req.body.price = null;
  if (req.body.price != null) req.body.price = Number(req.body.price);
  if (req.body.stock != null) { req.body.stock = Number(req.body.stock); if (!(req.body.stock >= 0)) return res.status(400).json({ error: 'stock >= 0 required' }); }
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  if (req.ctx.role !== 'super_admin' && p.companyId !== req.companyId) return res.status(403).json({ error: 'denied' });
  if (req.body.price != null && !(req.body.price > 0)) return res.status(400).json({ error: 'price must be > 0 or empty (quotation-only)' });
  if (req.body.sku && req.body.sku !== p.sku && db.products.some(x => x.sku === req.body.sku && x.companyId === p.companyId)) return res.status(400).json({ error: 'SKU already exists in this company' });
  if (req.body.category && !db.categories.some(c => c.id === req.body.category)) return res.status(400).json({ error: 'unknown category' });
  delete req.body.companyId; // products stay with their company
  delete req.body.id;
  Object.assign(p, req.body); save();
  audit(req, 'product.update', 'product', p.id, p.companyId, `Updated ${p.sku || p.id}`);
  ok(res, p);
});
app.delete('/api/products/:id', scopeCompany, (req, res) => {
  if (req.ctx.role === 'sales_user') return res.status(403).json({ error: 'admin only' });
  const idx = db.products.findIndex(x => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  const p = db.products[idx];
  if (req.ctx.role !== 'super_admin' && p.companyId !== req.companyId) return res.status(403).json({ error: 'denied' });
  db.products.splice(idx, 1);
  save();
  audit(req, 'product.delete', 'product', p.id, p.companyId, `Deleted SKU ${p.sku || p.id}`);
  ok(res, { deleted: true });
});
app.post('/api/products/sync-local', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  const products = Array.isArray(req.body.products) ? req.body.products : [];
  let added = 0;
  for (const p of products) {
    if (!p.sku || !p.name) continue;
    const co = req.ctx.role === 'super_admin' ? (p.companyId || 'C-ARGUS') : req.ctx.companyId;
    if (!companyById(co)) continue;
    if (!db.products.some(x => x.sku === p.sku && x.companyId === co)) {
      db.products.unshift({
        id: p.id && !db.products.some(x => x.id === p.id) ? p.id : uid('P-', db.products),
        sold: 0,
        featured: !!p.featured,
        visible: p.visible !== false,
        active: true,
        archived: false,
        uom: p.uom || 'Pc',
        moq: p.moq || 1,
        created: p.created || new Date().toISOString().slice(0, 10),
        name: p.name,
        sku: p.sku,
        brand: p.brand || '',
        mpn: p.mpn || '',
        short: p.short || '',
        price: p.price != null ? Number(p.price) : null,
        stock: Number(p.stock || 0),
        category: p.category || 'cutting-tools',
        companyId: co,
        desc: p.desc || p.name,
        specs: p.specs || {},
        images: Array.isArray(p.images) ? p.images.filter(u => u && !String(u).startsWith('blob:')) : [],
        video: p.video || ''
      });
      added++;
    }
  }
  if (added > 0) save();
  ok(res, { synced: added, total: db.products.length });
});
app.patch('/api/products/:id/visibility', scopeCompany, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  if (req.ctx.role !== 'super_admin' && p.companyId !== req.companyId) return res.status(403).json({ error: 'denied' });
  p.visible = !!req.body.visible; save();
  audit(req, 'product.visibility', 'product', p.id, p.companyId, `Visibility → ${p.visible}`);
  ok(res, p);
});
app.patch('/api/products/:id/archive', scopeCompany, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  if (req.ctx.role !== 'super_admin' && p.companyId !== req.companyId) return res.status(403).json({ error: 'denied' });
  p.archived = req.body.archived !== false;
  if (p.archived) p.visible = false;
  save();
  audit(req, 'product.archive', 'product', p.id, p.companyId, `Archived=${p.archived}`);
  ok(res, p);
});
/* global catalog (super_admin): every company's products in one view, company stays attached */
app.get('/api/catalog', (req, res) => {
  if (req.ctx.role !== 'super_admin') return res.status(403).json({ error: 'super_admin only' });
  let list = [...db.products];
  if (req.query.companyId && req.query.companyId !== 'all') list = list.filter(p => p.companyId === req.query.companyId);
  if (req.query.cat && req.query.cat !== 'all') list = list.filter(p => p.category === req.query.cat);
  if (req.query.brand && req.query.brand !== 'all') list = list.filter(p => p.brand === req.query.brand);
  if (req.query.visible && req.query.visible !== 'all') list = list.filter(p => String(!!p.visible) === req.query.visible);
  if (req.query.avail === 'in') list = list.filter(p => p.stock > 0 && p.price != null && !p.archived);
  if (req.query.avail === 'rfq') list = list.filter(p => p.price == null || p.stock <= 0);
  if (req.query.archived && req.query.archived !== 'all') list = list.filter(p => String(!!p.archived) === req.query.archived);
  if (req.query.q) { const q = req.query.q.toLowerCase(); list = list.filter(p => prodText(p).includes(q)); }
  list.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const withCo = l => l.map(p => attachProductMedia({ ...p, companyName: (companyById(p.companyId) || {}).name || p.companyId }));
  if (req.query.page || req.query.limit) { const pg = pageOf(list, req); pg.rows = withCo(pg.rows); return ok(res, pg); }
  ok(res, withCo(list));
});

/* uploads → Supabase Storage (public `retail-media` bucket) when configured; local disk only for offline dev.
   Vercel caps request bodies at 4.5 MB and wipes its tmp dir, so the browser uploads straight to Storage
   with a signed URL from /api/uploads/sign; the server never handles the file bytes. */
const MEDIA_TYPES = /^(image|video)\//;
const DOC_TYPES = /^application\/pdf$/i;
/* images, videos and PDF brochures/spec sheets may be uploaded */
const isAllowedUpload = t => MEDIA_TYPES.test(t || '') || DOC_TYPES.test(t || '');
const UPLOAD_KINDS = 'images, videos and PDF documents';
/* image | video | document (PDF) | youtube (metadata-only link) */
const YT_HOSTS = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]{5,}/i;
const isYouTubeUrl = u => YT_HOSTS.test(String(u || '').trim());
function resolveMediaType(type, url) {
  const t = String(type || '').toLowerCase();
  if (t === 'image' || t === 'video' || t === 'document' || t === 'pdf') return t === 'pdf' ? 'document' : t;
  if (t === 'youtube' || t === 'video_link') return isYouTubeUrl(url) ? 'youtube' : null;
  if (t) return null;
  const u = String(url || '');
  if (/\.pdf($|\?)/i.test(u)) return 'document';
  if (MEDIA_TYPES.test('image/png') && /\.(jpe?g|png|gif|webp|avif|svg)($|\?)/i.test(u)) return 'image';
  if (/\.(mp4|webm|mov|m4v)($|\?)/i.test(u)) return 'video';
  if (isYouTubeUrl(u)) return 'youtube';
  return null;
}
const safeName = n => String(n || 'file').replace(/[^a-zA-Z0-9.]+/g, '_').slice(-80);
const mediaPath = (req, name) => `${req.ctx.companyId || 'platform'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(name)}`;
app.post('/api/uploads/sign', async (req, res) => {
  if (!isWorkflowStaff(req)) return res.status(403).json({ error: 'Your role is not permitted to upload media' });
  if (!SB.enabled) return res.status(501).json({ error: 'Supabase Storage not configured', fallback: true });
  const files = Array.isArray(req.body.files) ? req.body.files.slice(0, 10) : [];
  if (!files.length) return res.status(400).json({ error: 'files[] required' });
  for (const f of files) {
    if (!isAllowedUpload(f.type || '')) return res.status(400).json({ error: `${f.name}: only ${UPLOAD_KINDS} can be uploaded` });
    if (!(f.size > 0) || f.size > SB.MEDIA_MAX_BYTES) return res.status(400).json({ error: `${f.name}: file must be under ${SB.MEDIA_MAX_BYTES / 1024 / 1024} MB` });
  }
  try {
    await SB.ensureMediaBucket();
    const out = [];
    for (const f of files) {
      const p = mediaPath(req, f.name);
      const { data, error } = await SB.admin.storage.from(SB.MEDIA_BUCKET).createSignedUploadUrl(p);
      if (error) throw error;
      out.push({ name: f.name, path: p, signedUrl: data.signedUrl, publicUrl: SB.mediaPublicUrl(p) });
    }
    ok(res, out);
  } catch (e) { res.status(502).json({ error: 'Storage error: ' + e.message }); }
});
const upload = SB.enabled
  ? multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
  : multer({ storage: multer.diskStorage({ destination: UP_DIR, filename: (_r, f, cb) => cb(null, Date.now() + '-' + safeName(f.originalname)) }), limits: { fileSize: 50 * 1024 * 1024 } });
/* multipart fallback (small files / clients without signed-URL support) */
app.post('/api/uploads', (req, res, next) => isWorkflowStaff(req) ? next() : res.status(403).json({ error: 'Your role is not permitted to upload media' }), upload.array('files', 10), async (req, res) => {
  const files = req.files || [];
  if (files.some(f => !isAllowedUpload(f.mimetype))) return res.status(400).json({ error: `only ${UPLOAD_KINDS} can be uploaded` });
  if (!SB.enabled) return ok(res, files.map(f => '/uploads/' + f.filename));
  try {
    await SB.ensureMediaBucket();
    const urls = [];
    for (const f of files) {
      const p = mediaPath(req, f.originalname);
      const { error } = await SB.admin.storage.from(SB.MEDIA_BUCKET).upload(p, f.buffer, { contentType: f.mimetype, upsert: false });
      if (error) throw error;
      urls.push(SB.mediaPublicUrl(p));
    }
    ok(res, urls);
  } catch (e) { res.status(502).json({ error: 'Storage error: ' + e.message }); }
});
app.use('/uploads', express.static(UP_DIR));
/* best-effort removal of a file we stored; never blocks the request */
function removeStoredMedia(url) {
  const p = SB.enabled && SB.mediaPathFromUrl(url);
  if (p) SB.admin.storage.from(SB.MEDIA_BUCKET).remove([p]).catch(() => {});
}

/* orders — server computes totals, validates + deducts stock atomically.
   Quotation-only (price null) products are rejected: submit an RFQ instead. */
const FLOW = ['Pending', 'Confirmed', 'Processing', 'Ready for Dispatch', 'Shipped', 'Delivered'];
app.get('/api/orders', scopeCompany, (req, res) => {
  const cid = req.ctx.role === 'super_admin' ? (req.query.companyId && req.query.companyId !== 'all' ? req.query.companyId : null) : req.companyId;
  let list = db.orders.filter(o => !cid || o.companyId === cid);
  if (req.query.status && req.query.status !== 'all') list = list.filter(o => o.status === req.query.status);
  if (req.query.q) { const q = req.query.q.toLowerCase(); list = list.filter(o => (o.id + o.customer + (o.companyName || '') + o.mobile + (o.poRef || '')).toLowerCase().includes(q)); }
  const withCo = l => l.map(o => ({ ...o, companyName2: (companyById(o.companyId) || {}).name || o.companyId }));
  if (req.query.page || req.query.limit) { const pg = pageOf(list, req); pg.rows = withCo(pg.rows); return ok(res, pg); }
  ok(res, withCo(list));
});
app.get('/api/orders/:id', scopeCompany, (req, res) => {
  const o = db.orders.find(x => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'not found' });
  if (req.ctx.role !== 'super_admin' && o.companyId !== req.companyId) return res.status(403).json({ error: 'denied' });
  ok(res, o);
});
app.post('/api/orders', scopeCompany, (req, res) => {
  const { customer, contact, companyName, mobile, address, city, poRef, items, generateInvoice } = req.body;
  if (!customer || !mobile || !address || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'customer, mobile, address, items[] required' });
  const cid = req.companyId;
  let total = 0; const lines = [];
  for (const it of items) { // revalidate stock + price server-side, never trust client
    const p = db.products.find(x => x.id === it.pid && x.companyId === cid);
    if (!p) return res.status(400).json({ error: 'unknown product ' + it.pid });
    if (!p.visible) return res.status(400).json({ error: p.name + ' is not visible in the store' });
    if (p.price == null) return res.status(400).json({ error: p.name + ' is quotation-only — submit a quotation request instead' });
    if (!(it.qty > 0) || it.qty > p.stock) return res.status(400).json({ error: p.name + ' (' + (p.sku || p.id) + '): only ' + p.stock + ' ' + (p.uom || 'pcs') + ' in stock' });
    const finalPrice = isSalesUser(req) ? (applyRolePricing(p, req.ctx.role).price) : p.price;
    total += finalPrice * it.qty;
    lines.push({
      pid: p.id,
      qty: it.qty,
      price: finalPrice,
      name: p.name,
      sku: p.sku || p.id,
      uom: p.uom || 'Pc',
      hsn: p.hsn || '8466.93.90',
      brand: p.brand || ''
    });
  }

  let invoiceNo = null;
  let invoiceDate = null;
  let invoiceDueDate = null;
  if (generateInvoice) {
    const year = new Date().getFullYear();
    const nextNum = Math.floor(1000 + Math.random() * 9000);
    invoiceNo = `INV/${year}-${String(year + 1).slice(2)}/${nextNum}`;
    invoiceDate = new Date().toISOString().slice(0, 10);
    invoiceDueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  const id = uid('ORD-', db.orders);
  const status = invoiceNo ? 'Confirmed' : 'Pending';
  const history = [['Pending', new Date().toLocaleString()]];
  if (invoiceNo) {
    history.push(['Confirmed', new Date().toLocaleString()]);
  }

  const order = {
    id,
    companyId: cid,
    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
    salesUser: req.ctx.name,
    partnerRole: req.ctx.role,
    customer,
    contact: contact || customer,
    companyName: companyName || '',
    mobile,
    city: city || '',
    address,
    poRef: poRef || '',
    total,
    status,
    invoiceNo: invoiceNo || undefined,
    invoiceDate: invoiceDate || undefined,
    invoiceDueDate: invoiceDueDate || undefined,
    items: lines,
    history
  };

  for (const l of lines) { const p = db.products.find(x => x.id === l.pid); p.stock -= l.qty; p.sold = (p.sold || 0) + l.qty; } // single atomic write
  db.orders.unshift(order); save();
  if (typeof triggerErpOrderDeduction === 'function') {
    triggerErpOrderDeduction(order, lines);
  }
  if (invoiceNo) {
    audit(req, 'order.create_with_invoice', 'order', order.id, order.companyId, `Created order with Tax Invoice ${invoiceNo}`);
  }
  ok(res, order);
});

app.post('/api/orders/:id/raise-invoice', scopeCompany, (req, res) => {
  const o = db.orders.find(x => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  if (req.ctx.role !== 'super_admin' && o.companyId !== req.companyId) return res.status(403).json({ error: 'denied' });

  if (o.invoiceNo) {
    return ok(res, { success: true, order: o, invoiceNo: o.invoiceNo, invoiceDate: o.invoiceDate });
  }

  const year = new Date().getFullYear();
  const nextNum = Math.floor(1000 + Math.random() * 9000);
  const invoiceNo = `INV/${year}-${String(year + 1).slice(2)}/${nextNum}`;
  const invoiceDate = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  o.invoiceNo = invoiceNo;
  o.invoiceDate = invoiceDate;
  o.invoiceDueDate = dueDate;
  if (o.status === 'Pending') {
    o.status = 'Confirmed';
    o.history.push(['Confirmed', new Date().toLocaleString()]);
  }
  save();
  audit(req, 'order.raise_invoice', 'order', o.id, o.companyId, `Generated Tax Invoice ${invoiceNo}`);

  ok(res, {
    success: true,
    order: o,
    invoiceNo,
    invoiceDate,
    invoiceDueDate: dueDate
  });
});

app.get('/api/invoices', scopeCompany, (req, res) => {
  const cid = req.ctx.role === 'super_admin' ? (req.query.companyId && req.query.companyId !== 'all' ? req.query.companyId : null) : req.companyId;

  // Gather orders with invoiceNo
  const invoicedOrders = (db.orders || []).filter(o => o.invoiceNo && (!cid || o.companyId === cid));

  const invoices = invoicedOrders.map(o => {
    const items = (o.items || []).map(it => {
      const p = (db.products || []).find(x => x.id === it.pid) || {};
      return {
        pid: it.pid,
        qty: it.qty,
        price: it.price,
        name: it.name || p.name || it.pid,
        sku: it.sku || p.sku || it.pid,
        uom: it.uom || p.uom || 'Pc',
        hsn: it.hsn || p.hsn || '8466.93.90',
        brand: it.brand || p.brand || ''
      };
    });
    const subtotal = items.reduce((acc, it) => acc + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
    const gstAmount = Math.round(subtotal * 0.18);
    const total = o.total || Math.round(subtotal * 1.18);

    return {
      id: o.invoiceNo,
      invoiceNo: o.invoiceNo,
      orderId: o.id,
      companyId: o.companyId,
      companyName2: (companyById(o.companyId) || {}).name || o.companyId,
      date: o.invoiceDate || (o.date ? o.date.slice(0, 10) : new Date().toISOString().slice(0, 10)),
      dueDate: o.invoiceDueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      customer: o.customer,
      contact: o.contact || o.customer,
      companyName: o.companyName || '',
      mobile: o.mobile,
      address: o.address,
      city: o.city || '',
      poRef: o.poRef || '',
      status: o.status === 'Cancelled' ? 'Cancelled' : 'Issued',
      subtotal,
      taxableAmount: subtotal,
      gstAmount,
      total,
      items
    };
  });

  // Also include any quotations that were invoiced but not yet linked to an order in invoices list
  const invoicedQuotes = (db.quotations || []).filter(q => q.invoiceNo && (!cid || q.companyId === cid));
  for (const q of invoicedQuotes) {
    if (!invoices.some(inv => inv.invoiceNo === q.invoiceNo || (q.orderId && inv.orderId === q.orderId))) {
      const items = (q.items || []).map(it => {
        const p = (db.products || []).find(x => x.id === it.pid) || {};
        return {
          pid: it.pid,
          qty: it.qty || 1,
          price: it.price != null ? it.price : (q.quotePrice || 0),
          name: it.name || p.name || it.pid,
          sku: it.sku || p.sku || it.pid,
          uom: it.uom || p.uom || 'Pc',
          hsn: it.hsn || p.hsn || '8466.93.90',
          brand: it.brand || p.brand || ''
        };
      });
      const subtotal = items.reduce((acc, it) => acc + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
      const gstAmount = Math.round(subtotal * 0.18);
      const total = Math.round(subtotal * 1.18);
      invoices.push({
        id: q.invoiceNo,
        invoiceNo: q.invoiceNo,
        orderId: q.orderId || '—',
        quotationId: q.id,
        companyId: q.companyId,
        companyName2: (companyById(q.companyId) || {}).name || q.companyId,
        date: q.invoiceDate || (q.date ? q.date.slice(0, 10) : new Date().toISOString().slice(0, 10)),
        dueDate: q.invoiceDueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        customer: q.contact || q.requestedBy || 'Industrial Client',
        contact: q.contact || q.requestedBy || '',
        companyName: q.companyName || '',
        mobile: q.mobile || '',
        address: q.address || '—',
        city: q.city || '',
        poRef: q.poRef || '',
        status: 'Issued',
        subtotal,
        taxableAmount: subtotal,
        gstAmount,
        total,
        items
      });
    }
  }

  // Search filter
  let list = invoices;
  if (req.query.q) {
    const q = req.query.q.toLowerCase();
    list = list.filter(inv =>
      (inv.invoiceNo + (inv.orderId || '') + (inv.customer || '') + (inv.companyName || '') + (inv.mobile || '') + (inv.poRef || '')).toLowerCase().includes(q)
    );
  }

  // Sort newest first
  list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.invoiceNo || '').localeCompare(a.invoiceNo || ''));

  if (req.query.page || req.query.limit) {
    return ok(res, pageOf(list, req));
  }
  ok(res, list);
});

app.patch('/api/orders/:id/status', scopeCompany, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'admin only' });
  const o = db.orders.find(x => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'not found' });
  if (req.ctx.role !== 'super_admin' && o.companyId !== req.companyId) return res.status(403).json({ error: 'denied' });
  const next = req.body.status;
  if (next !== 'Cancelled' && !FLOW.includes(next)) return res.status(400).json({ error: 'invalid status ' + next });
  if (o.status === 'Cancelled' || o.status === 'Delivered') return res.status(400).json({ error: o.status + ' is final' });
  if (next === 'Cancelled' || FLOW.indexOf(next) >= FLOW.indexOf(o.status)) {
    o.status = next; o.history.push([next, new Date().toLocaleString()]);
    if (next === 'Cancelled') for (const l of o.items) { const p = db.products.find(x => x.id === l.pid); if (p) p.stock += l.qty; } // restock policy
    save();
    audit(req, 'order.status', 'order', o.id, o.companyId, `Status → ${next}`);
    return ok(res, o);
  }
  return res.status(400).json({ error: 'invalid transition ' + o.status + ' → ' + next });
});

/* quotations (RFQ) — maps to the ERP Quotations module; supports single & multi-item quotations */
const QFLOW = ['Pending', 'Quoted', 'Accepted', 'Rejected', 'Cancelled'];
app.get('/api/quotations', scopeCompany, (req, res) => {
  const cid = req.ctx.role === 'super_admin' ? (req.query.companyId && req.query.companyId !== 'all' ? req.query.companyId : null) : req.companyId;
  let list = db.quotations.filter(q => !cid || q.companyId === cid);
  if (req.ctx.role === 'sales_user' && req.query.mine === '1') list = list.filter(q => q.requestedBy === req.ctx.name);
  if (req.query.status && req.query.status !== 'all') list = list.filter(q => q.status === req.query.status);
  const withNames = l => l.map(q => {
    const p = db.products.find(x => x.id === q.pid) || {};
    const firstItem = (Array.isArray(q.items) && q.items[0]) ? q.items[0] : null;
    return {
      ...q,
      productName: p.name || (firstItem ? firstItem.name : q.pid) || 'Commercial Indent',
      sku: p.sku || (firstItem ? firstItem.sku : ''),
      companyName2: (companyById(q.companyId) || {}).name || q.companyId
    };
  });
  if (req.query.page || req.query.limit) { const pg = pageOf(list, req); pg.rows = withNames(pg.rows); return ok(res, pg); }
  ok(res, withNames(list));
});

app.post('/api/quotations', scopeCompany, (req, res) => {
  const { pid, qty, techReq, deliveryReq, companyName, contact, mobile, email, address, city, state, pin, poRef, items } = req.body;
  const cid = req.companyId;

  // Handle multi-item quotation (from Cart / Checkout)
  if (Array.isArray(items) && items.length > 0) {
    const enrichedItems = [];
    let subtotal = 0;
    for (const it of items) {
      const p = db.products.find(x => x.id === it.pid) || {};
      const itPrice = it.price != null ? Number(it.price) : (p.price != null ? Number(p.price) : 0);
      const itQty = Number(it.qty) || 1;
      enrichedItems.push({
        pid: it.pid,
        qty: itQty,
        price: itPrice,
        name: it.name || p.name || it.pid,
        sku: it.sku || p.sku || '',
        uom: it.uom || p.uom || 'Pc',
        brand: it.brand || p.brand || '',
        desc: it.desc || p.desc || ''
      });
      subtotal += itPrice * itQty;
    }

    const q = {
      id: uid('Q-', db.quotations),
      companyId: cid,
      date: new Date().toISOString().slice(0, 16).replace('T', ' '),
      requestedBy: req.ctx.name || contact || companyName || 'Client',
      pid: enrichedItems[0]?.pid || '',
      qty: enrichedItems.reduce((a, b) => a + b.qty, 0),
      items: enrichedItems,
      subtotal,
      quotePrice: subtotal,
      total: Math.round(subtotal * 1.18),
      techReq: techReq || '',
      deliveryReq: deliveryReq || '',
      companyName: companyName || '',
      contact: contact || '',
      mobile: mobile || '',
      email: email || '',
      address: address || '',
      city: city || '',
      state: state || '',
      pin: pin || '',
      poRef: poRef || '',
      status: 'Pending',
      adminNote: ''
    };
    db.quotations.unshift(q);
    save();
    audit(req, 'quote.create', 'quotation', q.id, q.companyId, `Created cart quotation with ${enrichedItems.length} items`);
    return ok(res, q);
  }

  // Single SKU quotation (legacy RFQ modal)
  const p = db.products.find(x => x.id === pid && x.companyId === req.companyId);
  if (!p) return res.status(400).json({ error: 'unknown product' });
  if (!(qty > 0)) return res.status(400).json({ error: 'quantity required' });
  const q = {
    id: uid('Q-', db.quotations),
    companyId: req.companyId,
    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
    requestedBy: req.ctx.name,
    pid,
    qty,
    items: [{
      pid: p.id,
      qty: Number(qty),
      price: p.price != null ? Number(p.price) : 0,
      name: p.name,
      sku: p.sku || '',
      uom: p.uom || 'Pc'
    }],
    techReq: techReq || '',
    deliveryReq: deliveryReq || '',
    companyName: companyName || '',
    contact: contact || '',
    mobile: mobile || '',
    email: email || '',
    address: address || '',
    city: city || '',
    state: state || '',
    pin: pin || '',
    poRef: poRef || '',
    status: 'Pending',
    quotePrice: p.price != null ? Number(p.price) : null,
    adminNote: ''
  };
  db.quotations.unshift(q);
  save();
  audit(req, 'quote.create', 'quotation', q.id, q.companyId, `Created RFQ for ${p.name}`);
  ok(res, q);
});

app.patch('/api/quotations/:id', scopeCompany, (req, res) => {
  const q = db.quotations.find(x => x.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'not found' });
  if (req.ctx.role !== 'super_admin' && q.companyId !== req.companyId) return res.status(403).json({ error: 'denied' });
  const { status, quotePrice, adminNote } = req.body;
  if (status && !QFLOW.includes(status)) return res.status(400).json({ error: 'invalid status' });
  if (status) q.status = status;
  if (quotePrice != null) q.quotePrice = quotePrice;
  if (adminNote != null) q.adminNote = adminNote;
  save();
  audit(req, 'quote.respond', 'quotation', q.id, q.companyId, `RFQ → ${q.status}${q.quotePrice != null ? ' @ ' + q.quotePrice : ''}`);
  ok(res, q);
});

/* Convert confirmed quotation into a Tax Invoice & Order */
app.post('/api/quotations/:id/raise-invoice', scopeCompany, (req, res) => {
  const q = db.quotations.find(x => x.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Quotation not found' });
  if (req.ctx.role !== 'super_admin' && q.companyId !== req.companyId) return res.status(403).json({ error: 'denied' });

  const year = new Date().getFullYear();
  const nextNum = Math.floor(1000 + Math.random() * 9000);
  const invoiceNo = q.invoiceNo || `INV/${year}-${String(year + 1).slice(2)}/${nextNum}`;
  const invoiceDate = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let orderItems = [];
  if (Array.isArray(q.items) && q.items.length) {
    orderItems = q.items.map(it => ({
      pid: it.pid,
      qty: it.qty,
      price: it.price != null ? it.price : (q.quotePrice || 0),
      name: it.name,
      sku: it.sku,
      uom: it.uom
    }));
  } else if (q.pid) {
    const p = db.products.find(x => x.id === q.pid) || {};
    orderItems = [{
      pid: q.pid,
      qty: q.qty || 1,
      price: q.quotePrice != null ? q.quotePrice : (p.price || 0),
      name: p.name || q.pid,
      sku: p.sku || q.pid,
      uom: p.uom || 'Pc'
    }];
  }

  // Deduct inventory stock if not yet deducted
  if (!q.invoiced) {
    for (const it of orderItems) {
      const p = db.products.find(x => x.id === it.pid);
      if (p && p.stock >= it.qty) {
        p.stock -= it.qty;
        p.sold = (p.sold || 0) + it.qty;
      }
    }
  }

  const subtotal = orderItems.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  const tax = subtotal * 0.18;
  const grandTotal = subtotal + tax;

  let orderId = q.orderId;
  if (!orderId) {
    orderId = uid('ORD-', db.orders);
    const newOrder = {
      id: orderId,
      companyId: q.companyId,
      date: new Date().toISOString().slice(0, 16).replace('T', ' '),
      salesUser: req.ctx.name,
      partnerRole: req.ctx.role,
      customer: q.contact || q.requestedBy || q.companyName || 'Industrial Client',
      contact: q.contact || q.requestedBy || '',
      companyName: q.companyName || '',
      mobile: q.mobile || '',
      city: q.city || '',
      address: q.address || '—',
      poRef: q.poRef || '',
      total: Math.round(grandTotal),
      status: 'Confirmed',
      invoiceNo,
      items: orderItems,
      history: [
        ['Pending', new Date().toLocaleString()],
        ['Confirmed', new Date().toLocaleString()]
      ]
    };
    db.orders.unshift(newOrder);
  } else {
    const existingOrder = db.orders.find(o => o.id === orderId);
    if (existingOrder) {
      existingOrder.invoiceNo = invoiceNo;
      existingOrder.status = 'Confirmed';
      existingOrder.history.push(['Confirmed', new Date().toLocaleString()]);
    }
  }

  q.status = 'Accepted';
  q.invoiced = true;
  q.invoiceNo = invoiceNo;
  q.invoiceDate = invoiceDate;
  q.invoiceDueDate = dueDate;
  q.orderId = orderId;
  q.adminNote = (q.adminNote ? (q.adminNote + ' • ') : '') + 'Tax Invoice Raised: ' + invoiceNo;

  save();
  audit(req, 'quote.raise_invoice', 'quotation', q.id, q.companyId, `Raised Tax Invoice ${invoiceNo} for Order ${orderId}`);

  ok(res, {
    success: true,
    quotation: q,
    invoiceNo,
    invoiceDate,
    dueDate,
    orderId,
    total: grandTotal,
    items: orderItems
  });
});

/* stats — every metric computed from live DB rows */
app.get('/api/stats/platform', (req, res) => {
  if (req.ctx.role !== 'super_admin') return res.status(403).json({ error: 'super_admin only' });
  const byStatus = s => db.orders.filter(o => o.status === s).length;
  const byQ = s => db.quotations.filter(q => q.status === s).length;
  const catDist = db.categories.filter(c => c.scope === 'global').map(c => ({ id: c.id, name: c.name, icon: c.icon, products: db.products.filter(p => p.category === c.id && !p.archived).length }));
  const act = {};
  for (const o of db.orders) { const d = String(o.date).slice(0, 10); act[d] = (act[d] || 0) + 1; }
  const growth = {};
  for (const c of db.companies) { const m = String(c.createdAt || '').slice(0, 7); if (m) growth[m] = (growth[m] || 0) + 1; }
  ok(res, {
    companies: db.companies.length,
    activeCompanies: db.companies.filter(c => (c.storeStatus || c.status) === 'active').length,
    suspendedCompanies: db.companies.filter(c => (c.storeStatus || c.status) !== 'active').length,
    admins: db.users.filter(u => u.role === 'company_admin').length,
    salesUsers: db.users.filter(u => u.role === 'sales_user').length,
    products: db.products.filter(p => !p.archived).length,
    visibleProducts: db.products.filter(p => p.visible && !p.archived).length,
    categories: db.categories.filter(c => c.scope === 'global').length,
    orders: db.orders.length,
    pendingOrders: byStatus('Pending'),
    quotes: db.quotations.length,
    openQuotes: byQ('Pending'),
    gmv: db.orders.reduce((a, o) => a + o.total, 0),
    orderStatus: ['Pending', 'Confirmed', 'Processing', 'Ready for Dispatch', 'Shipped', 'Delivered', 'Cancelled'].map(s => ({ status: s, count: byStatus(s) })),
    quoteStatus: ['Pending', 'Quoted', 'Accepted', 'Rejected', 'Cancelled'].map(s => ({ status: s, count: byQ(s) })),
    categoryDist: catDist,
    orderActivity: Object.entries(act).sort().slice(-14).map(([date, count]) => ({ date, count })),
    companyGrowth: Object.entries(growth).sort().map(([month, count]) => ({ month, count })),
    byCompany: db.companies.map(c => ({ id: c.id, code: c.code || c.id, name: c.name, logo: c.logo, city: c.city, industry: c.industry, status: c.storeStatus || c.status, users: usersOf(c.id).length, products: productsOf(c.id).filter(p => !p.archived).length, orders: ordersOf(c.id).length, pending: ordersOf(c.id).filter(o => o.status === 'Pending').length, revenue: ordersOf(c.id).reduce((a, o) => a + o.total, 0) }))
  });
});
app.get('/api/stats/company', scopeCompany, (req, res) => {
  const cid = req.companyId;
  const ps = db.products.filter(p => p.companyId === cid), os = db.orders.filter(o => o.companyId === cid);
  const qs = db.quotations.filter(q => q.companyId === cid);
  ok(res, { products: ps.length, visible: ps.filter(p => p.visible).length, lowStock: ps.filter(p => p.stock <= 10).length, quotationOnly: ps.filter(p => p.price == null).length, orders: os.length, pending: os.filter(o => o.status === 'Pending').length, delivered: os.filter(o => o.status === 'Delivered').length, revenue: os.reduce((a, o) => a + o.total, 0), openQuotes: qs.filter(q => q.status === 'Pending').length });
});
function defaultInvoiceProfile(cid) {
  const co = (db.companies || []).find(c => c.id === cid) || {};
  return {
    companyName: co.name || 'ARGUS CNC TECHNOLOGIES PVT. LTD.',
    tagline: co.description || 'High-Precision CNC Machine Tools & Connected Factory Automation',
    logo: (co.logo && (co.logo.startsWith('data:') || co.logo.startsWith('http') || co.logo.startsWith('/'))) ? co.logo : '',
    regAddress: co.address || 'Plot 18, Sector 10, MIDC Industrial Area, Bhosari',
    city: co.city || 'Pune',
    state: co.state || 'Maharashtra',
    stateCode: '27 (Maharashtra)',
    pin: co.pin || '411026',
    country: 'India',
    gstin: co.gstin || '27AAACA1234A1Z5',
    pan: co.pan || 'AAACA1234A',
    cin: co.cin || 'U29253PN2021PTC198765',
    email: co.email || 'technologiesargus@gmail.com',
    phone: co.phone || '+91 98765 43210',
    bankName: 'HDFC Bank Ltd.',
    accName: (co.name ? co.name.toUpperCase() : 'ARGUS CNC TECHNOLOGIES') + ' PVT LTD',
    accNo: '50200067891234',
    ifsc: 'HDFC0001234',
    branch: (co.city || 'Bhosari') + ' Industrial Branch',
    upiId: 'arguscnc@hdfcbank',
    qrMode: 'dynamic',
    customQrImage: '',
    signatureImage: '',
    signatoryName: 'Authorized Signatory',
    signatoryDesignation: 'Commercial & Accounts Department',
    quotationTerms: '1. Prices quoted are firm and valid for 30 days.\n2. Payment: 100% against proforma invoice or agreed credit terms.\n3. GST extra as applicable.\n4. Delivery: Ready stock within 48h; custom tooling 5-7 days.',
    invoiceTerms: '1. Declared that particulars are true and correct.\n2. Interest @ 18% p.a. on delayed payments beyond due date.\n3. Goods once sold cannot be returned without RMA.\n4. Disputes subject to Pune, Maharashtra jurisdiction.'
  };
}

app.get('/api/settings', scopeCompany, (req, res) => {
  const cid = req.companyId;
  const current = (db.settings && db.settings[cid]) || {};
  if (!current.invoiceProfile) {
    current.invoiceProfile = defaultInvoiceProfile(cid);
  }
  ok(res, current);
});

app.put('/api/settings', scopeCompany, (req, res) => {
  if (req.ctx.role === 'sales_user') return res.status(403).json({ error: 'admin only' });
  const { companyId: _c, ...vals } = req.body;
  db.settings = db.settings || {};
  db.settings[req.companyId] = { ...(db.settings[req.companyId] || {}), ...vals }; save();
  audit(req, 'settings.company', 'settings', req.companyId, req.companyId, `Updated store settings: ${Object.keys(req.body).join(', ')}`);
  ok(res, db.settings[req.companyId]);
});

app.get('/api/settings/invoice-profile', scopeCompany, (req, res) => {
  const cid = req.companyId || 'C-ARGUS';
  db.settings = db.settings || {};
  db.settings[cid] = db.settings[cid] || {};
  const profile = db.settings[cid].invoiceProfile || defaultInvoiceProfile(cid);
  ok(res, profile);
});

app.put('/api/settings/invoice-profile', scopeCompany, (req, res) => {
  if (req.ctx.role === 'sales_user') return res.status(403).json({ error: 'admin only' });
  const cid = req.companyId || req.body.companyId || 'C-ARGUS';
  db.settings = db.settings || {};
  db.settings[cid] = db.settings[cid] || {};
  const current = db.settings[cid].invoiceProfile || defaultInvoiceProfile(cid);
  const updated = { ...current, ...req.body };
  db.settings[cid].invoiceProfile = updated;

  // Also sync primary company attributes to db.companies
  const co = (db.companies || []).find(c => c.id === cid);
  if (co) {
    if (updated.companyName) co.name = updated.companyName;
    if (updated.logo && (updated.logo.startsWith('data:image') || updated.logo.startsWith('http') || updated.logo.startsWith('/'))) co.logo = updated.logo;
    if (updated.city) co.city = updated.city;
    if (updated.regAddress) co.address = updated.regAddress;
    if (updated.phone) co.phone = updated.phone;
    if (updated.email) co.email = updated.email;
    if (updated.gstin) co.gstin = updated.gstin;
    if (updated.pan) co.pan = updated.pan;
    if (updated.cin) co.cin = updated.cin;
    if (updated.state) co.state = updated.state;
    if (updated.pin) co.pin = updated.pin;
    co.updatedAt = new Date().toISOString();
  }

  save();
  audit(req, 'settings.invoice_profile', 'invoiceProfile', cid, cid, `Updated invoice & quotation profile for company ${cid}`);
  ok(res, updated);
});

/* product media metadata (binaries stay on disk/Storage; company-scoped) */
function mediaVisible(m, req) {
  if (req.ctx.role === 'super_admin') return true;
  return m.companyId === (req.companyId || req.ctx.companyId);
}
app.get('/api/media', scopeCompany, (req, res) => {
  let list = [...(db.product_media || [])].filter(m => mediaVisible(m, req));
  if (req.query.companyId && req.ctx.role === 'super_admin') list = list.filter(m => m.companyId === req.query.companyId);
  if (req.query.productId) list = list.filter(m => m.productId === req.query.productId);
  if (req.query.type && req.query.type !== 'all') list = list.filter(m => m.type === req.query.type);
  list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const withNames = l => l.map(m => ({ ...m, productName: (db.products.find(p => p.id === m.productId) || {}).name || m.productId, companyName: (companyById(m.companyId) || {}).name || m.companyId }));
  if (req.query.page || req.query.limit) { const pg = pageOf(list, req); pg.rows = withNames(pg.rows); return ok(res, pg); }
  ok(res, withNames(list));
});
app.post('/api/media', scopeCompany, (req, res) => {
  if (!isWorkflowStaff(req)) return res.status(403).json({ error: 'Your role is not permitted to manage media' });
  const { productId, type, url, primary, visible, title, alt, description, desc } = req.body;
  const co = req.companyId || req.body.companyId;
  if (!productId || !url) return res.status(400).json({ error: 'productId and url required' });
  const p = db.products.find(x => x.id === productId && x.companyId === co);
  if (!p) return res.status(400).json({ error: 'unknown product in this company' });
  const t = resolveMediaType(type, url);
  if (!t) return res.status(400).json({ error: `unsupported media type "${type}" — use image, video, document or youtube` });
  if (t === 'youtube' && !isYouTubeUrl(url)) return res.status(400).json({ error: 'Enter a valid YouTube link (youtube.com/watch?v=… or youtu.be/…)' });
  const siblings = db.product_media.filter(m => m.productId === productId);
  const descVal = description !== undefined ? description : (desc !== undefined ? desc : (alt || ''));
  const m = {
    id: uid('M-', db.product_media),
    companyId: co,
    productId,
    sku: p.sku || '',
    type: t,
    url: String(url).slice(0, 2000),
    title: title ? String(title).slice(0, 200) : '',
    alt: alt ? String(alt).slice(0, 300) : (descVal ? String(descVal).slice(0, 300) : ''),
    description: descVal ? String(descVal).slice(0, 1000) : '',
    primary: (t === 'image' || t === 'video') && primary !== false && siblings.filter(s => s.type === t).length === 0,
    visible: visible !== false,
    sortOrder: siblings.length,
    createdAt: new Date().toISOString().slice(0, 10)
  };
  if (m.primary) siblings.forEach(s => { if (s.type === t) s.primary = false; });
  db.product_media.push(m);
  if (t === 'image' && !(p.images || []).includes(m.url)) p.images = [...(p.images || []), m.url];
  if (t === 'video' && !p.video) p.video = m.url;
  if (t === 'youtube' && !p.youtube) p.youtube = m.url;
  save();
  audit(req, 'media.upload', 'media', m.id, co, `Uploaded ${t} for ${p.sku || productId}`);
  ok(res, m);
});
app.patch('/api/media/:id', scopeCompany, (req, res) => {
  if (!isWorkflowStaff(req)) return res.status(403).json({ error: 'Your role is not permitted to manage media' });
  const m = (db.product_media || []).find(x => x.id === req.params.id);
  if (!m || !mediaVisible(m, req)) return res.status(404).json({ error: 'not found' });
  if (req.body.primary === true) (db.product_media || []).filter(s => s.productId === m.productId && s.type === m.type).forEach(s => { s.primary = false; });
  for (const k of ['primary', 'visible', 'sortOrder', 'url', 'title', 'alt', 'description']) if (req.body[k] !== undefined) m[k] = req.body[k];
  if (req.body.desc !== undefined && req.body.description === undefined) m.description = req.body.desc;
  if (m.description && !m.alt) m.alt = String(m.description).slice(0, 300);
  if (m.primary && m.type === 'image') { const p = db.products.find(x => x.id === m.productId); if (p) p.images = [m.url, ...(p.images || []).filter(u => u !== m.url)]; }
  save();
  audit(req, 'media.update', 'media', m.id, m.companyId, `Updated media ${m.id}`);
  ok(res, m);
});
app.delete('/api/media/:id', scopeCompany, (req, res) => {
  if (!isWorkflowStaff(req)) return res.status(403).json({ error: 'Your role is not permitted to manage media' });
  const m = (db.product_media || []).find(x => x.id === req.params.id);
  if (!m || !mediaVisible(m, req)) return res.status(404).json({ error: 'not found' });
  db.product_media = db.product_media.filter(x => x.id !== m.id);
  const p = db.products.find(x => x.id === m.productId);
  if (p) {
    if (m.type === 'image') p.images = (p.images || []).filter(u => u !== m.url);
    if (m.type === 'video' && p.video === m.url) p.video = '';
    if (m.type === 'youtube' && p.youtube === m.url) {
      const next = (db.product_media || []).find(x => x.productId === m.productId && x.type === 'youtube' && x.url !== m.url);
      p.youtube = next ? next.url : '';
    }
  }
  save();
  if (!db.products.some(x => (x.images || []).includes(m.url) || x.video === m.url)) removeStoredMedia(m.url);
  audit(req, 'media.delete', 'media', m.id, m.companyId, `Deleted ${m.type} of ${m.sku || m.productId}`);
  ok(res, { deleted: true });
});

/* audit trail (super: all/filterable; admin: own company) */
app.get('/api/audit', scopeCompany, (req, res) => {
  const effective = getEffectivePermissionsForUser(req.ctx);
  if (!effective.includes('super_audit') && req.ctx.role !== 'super_admin') {
    return res.status(403).json({ error: 'Permission denied: Audit Logs access required', code: 'PERMISSION_DENIED' });
  }
  let list = [...(db.audit_logs || [])];
  if (req.ctx.role !== 'super_admin') list = list.filter(a => a.companyId === req.companyId);
  else if (req.query.companyId && req.query.companyId !== 'all') list = list.filter(a => a.companyId === req.query.companyId);
  if (req.query.action && req.query.action !== 'all') list = list.filter(a => a.action === req.query.action);
  if (req.query.q) { const q = req.query.q.toLowerCase(); list = list.filter(a => (a.actor + ' ' + a.summary + ' ' + a.entityId).toLowerCase().includes(q)); }
  list.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  if (req.query.page || req.query.limit) return ok(res, pageOf(list, req));
  ok(res, list.slice(0, 100));
});

/* global store settings (super) vs company overrides */
app.get('/api/settings/global', (req, res) => {
  const effective = getEffectivePermissionsForUser(req.ctx);
  if (!effective.includes('super_settings') && req.ctx.role !== 'super_admin') {
    return res.status(403).json({ error: 'Permission denied: Global Settings access required', code: 'PERMISSION_DENIED' });
  }
  ok(res, db.global_settings || {});
});
app.put('/api/settings/global', (req, res) => {
  const effective = getEffectivePermissionsForUser(req.ctx);
  if (!effective.includes('super_settings') && req.ctx.role !== 'super_admin') {
    return res.status(403).json({ error: 'Permission denied: Global Settings access required', code: 'PERMISSION_DENIED' });
  }
  db.global_settings = { ...(db.global_settings || {}), ...req.body, updatedAt: new Date().toISOString().slice(0, 10) };
  save();
  audit(req, 'settings.global', 'settings', 'global', '', `Updated global settings: ${Object.keys(req.body).join(', ')}`);
  ok(res, db.global_settings);
});

/* ==========================================================================
   PRODUCT PUBLISHING WORKFLOW  (ERP → Content Writer → Finance → Sales)
   ERP INVENTORY PRODUCT RECEIVED → PENDING CONTENT → CONTENT IN PROGRESS →
   SUBMITTED TO FINANCE → FINANCE REVIEW → RETURNED FOR CORRECTION →
   PRICING SAVED → PUBLISHED TO SALES
   ========================================================================== */
function sanitizeSpecs(raw) {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) { const e = new Error('specs must be an object of label/value pairs'); e.status = 400; throw e; }
  const out = {};
  for (const k of Object.keys(raw).slice(0, 120)) {
    const label = String(k).trim().slice(0, 80);
    if (!label) continue;
    const v = raw[k];
    out[label] = v == null ? '' : String(v).slice(0, 800);
  }
  return out;
}
const wfMediaStats = id => {
  const ms = (db.product_media || []).filter(m => m.productId === id);
  return {
    total: ms.length,
    images: ms.filter(m => m.type === 'image').length,
    documents: ms.filter(m => m.type === 'document').length,
    videos: ms.filter(m => m.type === 'video').length,
    youtube: ms.filter(m => m.type === 'youtube').length
  };
};
const wfCategoryName = id => ((db.categories || []).find(c => c.id === id) || {}).name || '';
const wfContentReady = p => !!(p.desc && String(p.desc).trim());
function wfPermissions(p, req) {
  const stage = stageOf(p);
  const inContent = WF_CONTENT_EDITABLE.includes(stage);
  const financeAble = [WF.SUBMITTED, WF.REVIEW, WF.PRICED].includes(stage);
  return {
    canEditContent: isContentWriter(req) && inContent,
    canStartContent: isContentWriter(req) && inContent,
    canSubmit: isContentWriter(req) && inContent,
    canStartReview: isFinance(req) && stage === WF.SUBMITTED,
    canPrice: isFinance(req) && financeAble,
    canApprove: isFinance(req) && financeAble,
    canReturn: isFinance(req) && (financeAble || stage === WF.PUBLISHED),
    canUnpublish: isFinance(req) && stage === WF.PUBLISHED,
    isPublished: stage === WF.PUBLISHED
  };
}
const wfDecorate = p => ({
  ...p,
  stageLabel: WF_LABELS[stageOf(p)] || stageOf(p) || '—',
  categoryName: wfCategoryName(p.category),
  companyName: (companyById(p.companyId) || {}).name || p.companyId,
  mediaStats: wfMediaStats(p.id),
  contentReady: wfContentReady(p),
  priceSet: p.price != null
});

/* queue: products waiting on Content Writer or Finance */
app.get('/api/workflow', scopeCompany, (req, res) => {
  if (!wfGuard(req, res, isWorkflowStaff)) return;
  const co = req.companyId || req.ctx.companyId;
  const scoped = db.products.filter(p => (req.ctx.role === 'super_admin'
    ? (!req.query.companyId || req.query.companyId === 'all' || p.companyId === req.query.companyId)
    : p.companyId === co));
  const counts = wfCounts(scoped);
  let list = scoped;
  if (req.query.stage && req.query.stage !== 'all') {
    const want = String(req.query.stage).split(',').map(s => s.trim()).filter(Boolean);
    list = list.filter(p => want.includes(stageOf(p)));
  }
  if (req.query.erp === '1') list = list.filter(p => p.erp_synced);
  if (req.query.cat && req.query.cat !== 'all') list = list.filter(p => p.category === req.query.cat);
  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    list = list.filter(p => prodText(p).includes(q));
  }
  list.sort((a, b) => String(b.workflow_updated_at || b.created || '').localeCompare(String(a.workflow_updated_at || a.created || '')));
  const pg = pageOf(list, req);
  pg.rows = pg.rows.map(wfDecorate);
  pg.counts = counts;
  pg.stages = WF_STAGES.map(s => ({ id: s, label: WF_LABELS[s], count: counts[s] }));
  pg.can = { content: isContentWriter(req), finance: isFinance(req), company: co };
  ok(res, pg);
});

/* single product: full content, media, history and what this user may do next */
app.get('/api/workflow/:id', scopeCompany, (req, res) => {
  if (!wfGuard(req, res, isWorkflowStaff)) return;
  const p = wfFind(req, res); if (!p) return;
  const media = (db.product_media || []).filter(m => m.productId === p.id)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  ok(res, {
    ...wfDecorate(p),
    media,
    workflow_history: [...(p.workflow_history || [])].reverse(),
    permissions: wfPermissions(p, req)
  });
});

/* Content Writer: claim a received product for editing */
app.post('/api/workflow/:id/start-content', scopeCompany, (req, res) => {
  if (!wfGuard(req, res, isContentWriter)) return;
  const p = wfFind(req, res); if (!p) return;
  const st = stageOf(p);
  if (![WF.PENDING, WF.RETURNED].includes(st)) {
    return wfReject(res, 409, `This product is already at "${WF_LABELS[st] || st}"`, { stage: st });
  }
  pushWorkflow(p, req, 'content.start', WF.IN_PROGRESS, req.body.note);
  save();
  audit(req, 'workflow.content_start', 'product', p.id, p.companyId, `Content started for ${p.sku || p.id}`);
  ok(res, wfDecorate(p));
});

/* Content Writer: save sales copy + technical specifications (does NOT publish) */
app.put('/api/workflow/:id/content', scopeCompany, (req, res) => {
  if (!wfGuard(req, res, isContentWriter)) return;
  const p = wfFind(req, res); if (!p) return;
  const st = stageOf(p);
  if (!WF_CONTENT_EDITABLE.includes(st)) {
    return wfReject(res, 409, `Content is locked while the product is at "${WF_LABELS[st] || st}"`, { stage: st });
  }
  if (req.body.desc != null) {
    const desc = String(req.body.desc).trim();
    if (desc.length > 20000) return wfReject(res, 400, 'Description is too long (max 20000 characters)');
    p.desc = desc;
  }
  if (req.body.short != null) {
    const short = String(req.body.short).trim();
    if (short.length > 400) return wfReject(res, 400, 'Short description is too long (max 400 characters)');
    p.short = short;
  }
  if (req.body.specs !== undefined) {
    try { p.specs = sanitizeSpecs(req.body.specs); }
    catch (e) { return wfReject(res, e.status || 400, e.message); }
  }
  p.content_by = req.ctx.name || '';
  p.content_updated_at = new Date().toISOString();
  const stage = st === WF.PENDING || st === WF.RETURNED ? WF.IN_PROGRESS : st;
  pushWorkflow(p, req, 'content.save', stage, req.body.note);
  save();
  audit(req, 'workflow.content_save', 'product', p.id, p.companyId, `Saved content for ${p.sku || p.id}`);
  ok(res, wfDecorate(p));
});

/* Content Writer: hand off to Finance (never makes the product visible) */
app.post('/api/workflow/:id/submit', scopeCompany, (req, res) => {
  if (!wfGuard(req, res, isContentWriter)) return;
  const p = wfFind(req, res); if (!p) return;
  const st = stageOf(p);
  if (!WF_CONTENT_EDITABLE.includes(st)) {
    return wfReject(res, 409, `Already submitted — the product is at "${WF_LABELS[st] || st}"`, { stage: st });
  }
  if (!p.desc || !String(p.desc).trim()) {
    p.desc = p.name || '';
  }
  pushWorkflow(p, req, 'content.submit', WF.SUBMITTED, req.body.note);
  p.submitted_by = req.ctx.name || '';
  p.submitted_at = new Date().toISOString();
  p.visible = false; // submission alone must never expose the listing
  save();
  audit(req, 'workflow.submit_finance', 'product', p.id, p.companyId, `Submitted ${p.sku || p.id} to Finance`);
  ok(res, wfDecorate(p));
});

/* Finance: open the item for review (moves it out of the waiting queue) */
app.post('/api/workflow/:id/start-review', scopeCompany, (req, res) => {
  if (!wfGuard(req, res, isFinance)) return;
  const p = wfFind(req, res); if (!p) return;
  const st = stageOf(p);
  if (st === WF.REVIEW) return wfReject(res, 409, 'This product is already under Finance review', { stage: st });
  if (st !== WF.SUBMITTED) {
    return wfReject(res, 409, `Only products submitted by Content Writer can be reviewed — this one is at "${WF_LABELS[st] || st}"`, { stage: st });
  }
  pushWorkflow(p, req, 'finance.start_review', WF.REVIEW, req.body.note);
  p.finance_by = req.ctx.name || '';
  save();
  audit(req, 'workflow.finance_review', 'product', p.id, p.companyId, `Finance review started for ${p.sku || p.id}`);
  ok(res, wfDecorate(p));
});

/* Finance: save a price draft — the product stays hidden from Sales */
app.put('/api/workflow/:id/pricing', scopeCompany, (req, res) => {
  if (!wfGuard(req, res, isFinance)) return;
  const p = wfFind(req, res); if (!p) return;
  const st = stageOf(p);
  if (st === WF.PUBLISHED) {
    return wfReject(res, 409, 'Product is already published — return it for correction before changing the price', { stage: st });
  }
  if (![WF.SUBMITTED, WF.REVIEW, WF.PRICED].includes(st)) {
    return wfReject(res, 409, `Pricing cannot be saved while the product is at "${WF_LABELS[st] || st}"`, { stage: st });
  }
  if (req.body.price !== undefined) {
    let price = req.body.price;
    if (price === '' || price === null) price = null;
    else {
      price = Number(price);
      if (!Number.isFinite(price) || price <= 0) return wfReject(res, 400, 'Selling price must be a number greater than 0 (leave empty for quotation-only)');
    }
    p.price = price;
  }
  if (req.body.note != null) p.pricing_note = String(req.body.note).slice(0, 1000);
  p.priced_by = req.ctx.name || '';
  p.priced_at = new Date().toISOString();
  const alreadyPriced = st === WF.PRICED;
  pushWorkflow(p, req, 'pricing.save_draft', alreadyPriced ? null : WF.PRICED, req.body.note);
  p.visible = false; // a saved draft is never publicly visible
  save();
  audit(req, 'workflow.pricing_save', 'product', p.id, p.companyId, `Pricing saved for ${p.sku || p.id} (${p.price == null ? 'quotation-only' : p.price})`);
  ok(res, wfDecorate(p));
});

/* Finance: approve pricing and publish to the Salesperson catalog */
app.post('/api/workflow/:id/approve', scopeCompany, (req, res) => {
  if (!wfGuard(req, res, isFinance)) return;
  const p = wfFind(req, res); if (!p) return;
  const st = stageOf(p);
  if (st === WF.PUBLISHED) {
    return wfReject(res, 409, 'This product has already been approved and published', { stage: st });
  }
  if (![WF.SUBMITTED, WF.REVIEW, WF.PRICED].includes(st)) {
    return wfReject(res, 409, `Only submitted or priced products can be published — this one is at "${WF_LABELS[st] || st}"`, { stage: st });
  }
  if (p.price == null && req.body.allow_rfq !== true) {
    return wfReject(res, 400, 'A selling price is required before publishing. Set a price, or confirm quotation-only listing with allow_rfq: true.',
      { needsPrice: true });
  }
  pushWorkflow(p, req, 'finance.approve', WF.PUBLISHED, req.body.note);
  p.approved_by = req.ctx.name || '';
  p.approved_at = new Date().toISOString();
  p.published_at = p.approved_at;
  p.visible = true;   // ← the moment the listing becomes visible to Salespeople
  p.active = true;
  p.archived = false;
  save();
  audit(req, 'workflow.publish', 'product', p.id, p.companyId, `Approved and published ${p.sku || p.id} to Sales (price: ${p.price == null ? 'quotation-only' : p.price})`);
  ok(res, wfDecorate(p));
});

/* Finance: send back to Content Writer with review comments (also unpublishes) */
app.post('/api/workflow/:id/return', scopeCompany, (req, res) => {
  if (!wfGuard(req, res, isFinance)) return;
  const p = wfFind(req, res); if (!p) return;
  const st = stageOf(p);
  if (![WF.SUBMITTED, WF.REVIEW, WF.PRICED, WF.PUBLISHED].includes(st)) {
    return wfReject(res, 409, `This product is at "${WF_LABELS[st] || st}" and has not been submitted to Finance yet`, { stage: st });
  }
  const comment = req.body.comment != null ? String(req.body.comment).trim() : '';
  if (comment.length < 3) return wfReject(res, 400, 'A review comment is required so the Content Writer knows what to fix');
  pushWorkflow(p, req, 'finance.return', WF.RETURNED, comment);
  p.return_comment = comment.slice(0, 1000);
  p.returned_by = req.ctx.name || '';
  p.returned_at = new Date().toISOString();
  p.visible = false; // returned products must never stay visible
  save();
  audit(req, 'workflow.return_correction', 'product', p.id, p.companyId, `Returned ${p.sku || p.id} for correction: ${comment.slice(0, 120)}`);
  ok(res, wfDecorate(p));
});

/* ==========================================================================
   ERP INVENTORY ↔ RETAIL STORE SERVER-TO-SERVER INTEGRATION
   Endpoints for secure product synchronization, status checks & stock consistency
   ========================================================================== */

const ERP_INTEGRATION_KEY = process.env.ERP_INTEGRATION_KEY || 'erp_sec_c4f8d9b1a03e7f22589e6d4c';
const ERP_API_BASE_URL = process.env.ERP_API_BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://arguscnc.com' : 'http://localhost:5173');

// Idempotency cache (key -> { data, ts })
const erpIdempotencyCache = new Map();
function getIdempotent(key) {
  if (!key) return null;
  const entry = erpIdempotencyCache.get(key);
  if (entry && (Date.now() - entry.ts < 1000 * 60 * 30)) return entry.data;
  return null;
}
function setIdempotent(key, data) {
  if (!key) return;
  erpIdempotencyCache.set(key, { data, ts: Date.now() });
  if (erpIdempotencyCache.size > 2000) {
    const oldest = Array.from(erpIdempotencyCache.keys()).slice(0, 500);
    oldest.forEach(k => erpIdempotencyCache.delete(k));
  }
}

// Server-to-server auth middleware for ERP
function verifyErpServerAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const apiKeyHeader = req.headers['x-erp-api-key'] || req.headers['x-api-key'] || '';
  let token = apiKeyHeader;
  if (!token && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (!token || token !== ERP_INTEGRATION_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing ERP integration key' });
  }

  // Company verification
  const co = req.headers['x-company-id'] || req.body.companyId;
  if (!co) {
    return res.status(400).json({ error: 'Company ID required (via x-company-id header or body)' });
  }
  const company = companyById(co);
  if (!company) {
    return res.status(404).json({ error: `Company "${co}" not found in Retail Store` });
  }
  req.erpCompany = company;
  next();
}

// Map ERP category or name to valid Retail Store category ID
function resolveStoreCategory(catInput, catNameInput) {
  const norm = str => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cats = db.categories || [];
  if (catInput) {
    const direct = cats.find(c => c.id === catInput || norm(c.id) === norm(catInput));
    if (direct) return direct.id;
  }
  if (catNameInput) {
    const byName = cats.find(c => norm(c.name) === norm(catNameInput));
    if (byName) return byName.id;
    const n = norm(catNameInput);
    if (n.includes('tool') || n.includes('mill') || n.includes('drill') || n.includes('insert')) return 'cutting-tools';
    if (n.includes('raw') || n.includes('material') || n.includes('metal') || n.includes('steel') || n.includes('aluminum')) return 'raw-materials';
    if (n.includes('spare') || n.includes('bearing') || n.includes('part') || n.includes('component')) return 'spares';
    if (n.includes('hold') || n.includes('chuck') || n.includes('collet') || n.includes('vise')) return 'workholding';
    if (n.includes('machine') || n.includes('cnc')) return 'cnc-machines';
    if (n.includes('measur') || n.includes('gauge') || n.includes('caliper')) return 'measuring';
    if (n.includes('elect') || n.includes('sensor') || n.includes('servo')) return 'electrical';
    if (n.includes('safe') || n.includes('ppe')) return 'safety';
    if (n.includes('consum') || n.includes('oil') || n.includes('coolant')) return 'consumables';
  }
  return cats[0]?.id || 'cutting-tools';
}

// Single ERP Product Synchronizer with explicit field ownership
function syncSingleErpProduct(item, companyId) {
  const {
    erp_item_id,
    sku,
    name,
    brand,
    mpn,
    category,
    category_name,
    uom,
    stock,
    warehouse,
    specification,
    specs,
    status,
    is_retail_warehouse,
    is_retail,
    image_url,
    rate
  } = item;

  const rawSku = item.sku || item.code || item.item_code || item.itemCode || item.part_number || item.part_no || item.product || item.erp_item_id || item.id || '';
  let cleanSku = String(rawSku).trim();
  if (!cleanSku) {
    const namePart = (item.name || item.item_name || 'ITEM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'ITEM';
    cleanSku = `SKU-${namePart}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  const rawName = item.name || item.item_name || item.itemName || item.title || item.description || cleanSku || 'ERP Product';
  const cleanName = String(rawName).trim();
  const stockQty = Math.max(0, Number(stock ?? 0));
  const finalErpId = erp_item_id || item.id || '';
  const isActive = (status || 'Active').toLowerCase() === 'active';

  // Explicit sync from ERP: treat as Retail item unless explicitly marked non-retail or inactive
  const isRetail = (is_retail_warehouse !== false) && (is_retail !== false);
  const effectiveWarehouse = (warehouse && warehouse !== 'Other Warehouse') ? warehouse : 'Retail Store Warehouse';

  // Find existing product by ERP ID or (SKU + Company)
  let p = db.products.find(x => x.companyId === companyId && (
    (finalErpId && x.erp_item_id === finalErpId) ||
    x.sku.toLowerCase() === cleanSku.toLowerCase()
  ));

  // Case 1: Inactive item
  if (!isActive) {
    if (p) {
      p.visible = false;
      p.active = false;
      p.stock = stockQty;
      p.warehouse = effectiveWarehouse;
      p.erp_synced = true;
      p.erp_last_synced_at = new Date().toISOString();
      return { action: 'deactivated', product: p };
    }
    return { action: 'ignored', message: 'Inactive item not added to Retail Store' };
  }

  // Case 2: In retail warehouse and Active
  const catId = resolveStoreCategory(category, category_name);

  if (p) {
    // UPDATE existing product with strict field ownership:
    // Update ONLY ERP-owned fields
    p.erp_item_id = finalErpId || p.erp_item_id || '';
    p.sku = cleanSku;
    p.name = cleanName;
    p.stock = stockQty; // ERP is source of truth for stock!
    p.warehouse = effectiveWarehouse;
    p.uom = uom || p.uom || 'Pc';
    p.active = true;
    p.archived = false;
    p.erp_synced = true;
    p.erp_last_synced_at = new Date().toISOString();

    // Technical specifications from ERP merged in
    if (specs && typeof specs === 'object') {
      p.specs = { ...(p.specs || {}), ...specs };
    }
    if (brand && !p.brand) p.brand = brand;
    if (mpn && !p.mpn) p.mpn = mpn;

    // PRESERVE Content Writer & Finance owned fields:
    // If desc or short were empty, provide fallback from ERP specification
    const initialSpec = specification || item.description || '';
    if (!p.desc && initialSpec) p.desc = initialSpec;
    if (!p.short && initialSpec) p.short = initialSpec;
    // p.price, p.images, p.video, p.visible, p.featured, p.sold are NOT overwritten!

    return { action: 'updated', product: p };
  }

  // CREATE new product in Retail Store
  const newId = uid('P-', db.products);
  const initialSpec = specification || item.description || cleanName;
  const initialPrice = (rate != null && Number(rate) > 0) ? Number(rate) :
    (item.price != null && Number(item.price) > 0 ? Number(item.price) : null);
  const newProduct = {
    id: newId,
    name: cleanName,
    sku: cleanSku,
    brand: brand || 'ArgusCNC',
    mpn: mpn || '',
    short: initialSpec,
    desc: initialSpec,
    price: initialPrice, // null = Quotation-only RFQ until Finance sets it
    uom: uom || 'Pc',
    stock: stockQty,
    moq: 1,
    leadTime: 'Ex-stock',
    warehouse: effectiveWarehouse,
    category: catId,
    visible: false, // initial draft state for Content Writer & Finance review!
    active: true,
    archived: false,
    featured: false,
    specs: specs && typeof specs === 'object' ? specs : (specification ? { 'Specification': specification } : {}),
    images: (image_url && typeof image_url === 'string') ? [image_url] : [],
    video: '',
    companyId: companyId,
    erp_synced: true,
    erp_item_id: erp_item_id || '',
    erp_last_synced_at: new Date().toISOString(),
    workflow_stage: 'content_pending',
    created: new Date().toISOString().slice(0, 10),
    sold: 0
  };

  db.products.unshift(newProduct);
  return { action: 'created', product: newProduct };
}

// Trigger ERP stock deduction when a sales order contains ERP-synced items
async function triggerErpOrderDeduction(order, lines) {
  const erpLines = [];
  for (const l of lines) {
    const p = db.products.find(x => x.id === l.pid);
    if (p && (p.erp_synced || p.erp_item_id)) {
      erpLines.push({
        pid: p.id,
        erp_item_id: p.erp_item_id || p.id,
        sku: p.sku,
        qty: l.qty,
        price: l.price
      });
    }
  }
  if (!erpLines.length) return;

  order.erp_sync_status = 'pending_deduction';
  order.erp_deducted = false;
  order.erp_items = erpLines;

  const erpBase = ERP_API_BASE_URL;
  const erpKey = ERP_INTEGRATION_KEY;

  try {
    const resp = await fetch(`${erpBase}/api/retail-sync/order-deduct`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-erp-api-key': erpKey,
        'x-company-id': order.companyId,
        'x-idempotency-key': `erp-deduct-${order.id}`
      },
      body: JSON.stringify({
        order_id: order.id,
        idempotency_key: `erp-deduct-${order.id}`,
        company_id: order.companyId,
        customer: order.customer,
        items: erpLines
      })
    });
    if (resp.ok) {
      const data = await resp.json();
      order.erp_deducted = true;
      order.erp_sync_status = 'deducted';
      order.erp_deducted_at = new Date().toISOString();
      order.erp_movement_refs = data.movements || [];
      delete order.erp_deduction_error;
      save();
    } else {
      const txt = await resp.text();
      order.erp_deducted = false;
      order.erp_sync_status = 'deduction_failed';
      order.erp_deduction_error = txt;
      save();
    }
  } catch (err) {
    order.erp_deducted = false;
    order.erp_sync_status = 'deduction_failed';
    order.erp_deduction_error = err.message;
    save();
  }
}

// 1. Handshake & Health Endpoint
app.get('/api/integrations/erp/status', verifyErpServerAuth, (req, res) => {
  const co = req.erpCompany;
  const prods = (db.products || []).filter(p => p.companyId === co.id);
  const synced = prods.filter(p => p.erp_synced);
  const visible = prods.filter(p => p.visible && !p.archived);
  const wfProducts = prods.filter(p => p.workflow_stage);
  const pendingContent = wfProducts.filter(p => [WF.PENDING, WF.IN_PROGRESS, WF.RETURNED].includes(stageOf(p)));
  const pendingFinance = wfProducts.filter(p => [WF.SUBMITTED, WF.REVIEW, WF.PRICED].includes(stageOf(p)));
  const publishedWf = wfProducts.filter(p => stageOf(p) === WF.PUBLISHED);

  ok(res, {
    status: 'connected',
    time: new Date().toISOString(),
    store: {
      name: co.name,
      code: co.code || co.id,
      companyId: co.id,
      storeStatus: co.storeStatus || co.status || 'active'
    },
    metrics: {
      totalProducts: prods.length,
      erpSyncedProducts: synced.length,
      visibleProducts: visible.length,
      pendingContentReview: pendingContent.length,
      pendingFinanceReview: pendingFinance.length,
      publishedProducts: publishedWf.length,
      workflowProducts: wfProducts.length
    }
  });
});

// 2. Synchronize Single Product
app.post('/api/integrations/erp/sync-product', verifyErpServerAuth, (req, res) => {
  const co = req.erpCompany.id;
  const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotency_key;

  if (idempotencyKey) {
    const cached = getIdempotent(idempotencyKey);
    if (cached) return ok(res, { ...cached, replayed: true });
  }

  try {
    const result = syncSingleErpProduct(req.body, co);
    save();
    const actionDesc = result.action === 'created' ? `Created SKU ${result.product?.sku} from ERP` :
      result.action === 'updated' ? `Updated SKU ${result.product?.sku} from ERP (stock: ${result.product?.stock})` :
      result.action === 'deactivated' ? `Deactivated SKU ${result.product?.sku} (moved away / inactive in ERP)` :
      `Ignored non-retail item ${req.body.sku}`;

    audit(req, `erp.sync_${result.action}`, 'product', result.product?.id || req.body.sku, co, actionDesc);

    const responsePayload = {
      ok: true,
      action: result.action,
      product: result.product || null,
      message: result.message || undefined
    };

    if (idempotencyKey) setIdempotent(idempotencyKey, responsePayload);
    ok(res, responsePayload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Batch Product Synchronization
app.post('/api/integrations/erp/sync-batch', verifyErpServerAuth, (req, res) => {
  const co = req.erpCompany.id;
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotency_key;

  if (idempotencyKey) {
    const cached = getIdempotent(idempotencyKey);
    if (cached) return ok(res, cached);
  }

  const results = { total: items.length, created: 0, updated: 0, deactivated: 0, ignored: 0, errors: [] };

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      const res = syncSingleErpProduct(it, co);
      if (res.action === 'created') results.created++;
      else if (res.action === 'updated') results.updated++;
      else if (res.action === 'deactivated') results.deactivated++;
      else if (res.action === 'ignored') results.ignored++;
    } catch (e) {
      results.errors.push({ index: i, sku: it.sku || null, error: e.message });
    }
  }

  if (results.created > 0 || results.updated > 0 || results.deactivated > 0) {
    save();
  }

  audit(req, 'erp.sync_batch', 'product_batch', `batch-${Date.now()}`, co, `Batch sync: ${results.created} created, ${results.updated} updated, ${results.deactivated} deactivated, ${results.errors.length} errors`);

  const responsePayload = { ok: true, ...results };
  if (idempotencyKey) setIdempotent(idempotencyKey, responsePayload);
  ok(res, responsePayload);
});

// 4. Reconcile Failed Order Deductions
app.post('/api/integrations/erp/reconcile-orders', verifyErpServerAuth, async (req, res) => {
  const co = req.erpCompany.id;
  const pendingOrders = (db.orders || []).filter(o => o.companyId === co && o.erp_sync_status === 'deduction_failed');

  let reconciled = 0;
  let stillFailed = 0;

  for (const o of pendingOrders) {
    try {
      await triggerErpOrderDeduction(o, o.items || []);
      if (o.erp_deducted) reconciled++;
      else stillFailed++;
    } catch (e) {
      stillFailed++;
    }
  }

  ok(res, { ok: true, pendingTotal: pendingOrders.length, reconciled, stillFailed });
});

/* serve frontend (same origin → no CORS issues) */
const CLIENT_DIST = path.join(ROOT, 'client', 'dist');
const WEBROOT = fs.existsSync(CLIENT_DIST) ? CLIENT_DIST : ROOT;
app.use(express.static(WEBROOT));
app.use('/uploads', express.static(UP_DIR));
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
  res.sendFile(path.join(WEBROOT, 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`CNCFORGE Industrial Store: frontend + API on http://localhost:${PORT}`));
}
module.exports = { app, db, save, seed, DB_FILE };
