/* Menu Catalog — authoritative navigation definition & color theme system for ARGUS CNC ERP */
import {
  LayoutDashboard, Building2, Boxes, FolderTree, Image as ImageIcon,
  Receipt, FileText, Settings, ShieldCheck, Store, Home, ShoppingCart,
  Package, User, PenLine, IndianRupee, KeyRound, QrCode
} from 'lucide-react';

export const ICON_MAP = {
  LayoutDashboard,
  Building2,
  Boxes,
  FolderTree,
  ImageIcon,
  Receipt,
  FileText,
  Settings,
  ShieldCheck,
  Store,
  Home,
  ShoppingCart,
  Package,
  User,
  PenLine,
  IndianRupee,
  KeyRound,
  QrCode
};

export const MENU_CATALOG = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Executive dashboard and high-level KPIs',
    color: 'amber',
    dotClass: 'bg-[#8B5A2B] shadow-[#8B5A2B]/50',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
    items: [
      {
        id: 'super_dashboard',
        label: 'Platform Dashboard',
        path: '/super/dashboard',
        icon: 'LayoutDashboard',
        defaultRoles: ['super_admin'],
        theme: {
          name: 'coffee',
          gradient: 'from-[#160A03] via-[#2A1408] to-[#4A2510]',
          activeLink: 'bg-gradient-to-r from-[#160A03] to-[#2A1408] text-amber-100 font-bold border-[#4A2510]/50 shadow-xs shadow-[#160A03]/50',
          activeIcon: 'text-amber-300',
          indicator: 'bg-[#542B14]',
          badge: 'bg-[#2A1408] text-white',
          glow: 'shadow-[#160A03]/50'
        }
      },
      {
        id: 'admin_dashboard',
        label: 'Company Dashboard',
        path: '/admin/dashboard',
        icon: 'LayoutDashboard',
        defaultRoles: ['company_admin'],
        theme: {
          name: 'coffee',
          gradient: 'from-[#331C0E] via-[#4D2D1B] to-[#75472E]',
          activeLink: 'bg-gradient-to-r from-[#331C0E] to-[#4D2D1B] text-amber-100 font-bold border-[#75472E]/50 shadow-xs shadow-[#331C0E]/40',
          activeIcon: 'text-amber-300',
          indicator: 'bg-[#75472E]',
          badge: 'bg-[#4D2D1B] text-white',
          glow: 'shadow-[#331C0E]/40'
        }
      }
    ]
  },
  {
    id: 'organizations',
    label: 'Organizations',
    description: 'Companies, multi-tenant workspaces, and admins',
    color: 'amber',
    dotClass: 'bg-[#A0522D] shadow-[#A0522D]/50',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
    items: [
      {
        id: 'super_companies',
        label: 'Company Hub',
        path: '/super/companies',
        icon: 'Building2',
        defaultRoles: ['super_admin'],
        theme: {
          name: 'coffee',
          gradient: 'from-[#361F14] via-[#52301C] to-[#7F4B2E]',
          activeLink: 'bg-gradient-to-r from-[#361F14] to-[#52301C] text-amber-100 font-bold border-[#7F4B2E]/50 shadow-xs shadow-[#361F14]/40',
          activeIcon: 'text-amber-300',
          indicator: 'bg-[#7F4B2E]',
          badge: 'bg-[#52301C] text-white',
          glow: 'shadow-[#361F14]/40'
        }
      }
    ]
  },
  {
    id: 'global_catalog',
    label: 'Global Catalog',
    description: 'Global master SKUs, universal categories, and media',
    color: 'amber',
    dotClass: 'bg-amber-500 shadow-amber-500/50',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    items: [
      {
        id: 'super_catalog',
        label: 'Master Catalog',
        path: '/super/catalog',
        icon: 'Boxes',
        defaultRoles: ['super_admin'],
        theme: {
          name: 'amber',
          gradient: 'from-amber-500 via-orange-500 to-yellow-500',
          activeLink: 'bg-amber-50/90 text-amber-900 font-bold border-amber-200/80 shadow-xs shadow-amber-100',
          activeIcon: 'text-amber-600',
          indicator: 'bg-amber-500',
          badge: 'bg-amber-600 text-white',
          glow: 'shadow-amber-500/20'
        }
      },
      {
        id: 'super_categories',
        label: 'Categories',
        path: '/super/categories',
        icon: 'FolderTree',
        defaultRoles: ['super_admin'],
        theme: {
          name: 'yellow',
          gradient: 'from-yellow-500 via-amber-500 to-orange-500',
          activeLink: 'bg-yellow-50/90 text-yellow-900 font-bold border-yellow-200/80 shadow-xs shadow-yellow-100',
          activeIcon: 'text-yellow-600',
          indicator: 'bg-yellow-500',
          badge: 'bg-yellow-600 text-white',
          glow: 'shadow-yellow-500/20'
        }
      },
      {
        id: 'super_media',
        label: 'Product Media',
        path: '/super/media',
        icon: 'ImageIcon',
        defaultRoles: ['super_admin'],
        theme: {
          name: 'orange',
          gradient: 'from-orange-400 via-amber-500 to-red-400',
          activeLink: 'bg-orange-50/90 text-orange-900 font-bold border-orange-200/80 shadow-xs shadow-orange-100',
          activeIcon: 'text-orange-600',
          indicator: 'bg-orange-500',
          badge: 'bg-orange-600 text-white',
          glow: 'shadow-orange-500/20'
        }
      }
    ]
  },
  {
    id: 'operations',
    label: 'Operations',
    description: 'Tenant inventory, category mapping, sales reps, and store settings',
    color: 'emerald',
    dotClass: 'bg-emerald-500 shadow-emerald-500/50',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    items: [
      {
        id: 'admin_products',
        label: 'Stock Library',
        path: '/admin/products',
        icon: 'Boxes',
        defaultRoles: ['company_admin'],
        theme: {
          name: 'emerald',
          gradient: 'from-emerald-500 via-teal-600 to-green-600',
          activeLink: 'bg-emerald-50/90 text-emerald-800 font-bold border-emerald-200/80 shadow-xs shadow-emerald-100',
          activeIcon: 'text-emerald-600',
          indicator: 'bg-emerald-500',
          badge: 'bg-emerald-600 text-white',
          glow: 'shadow-emerald-500/20'
        }
      },
      {
        id: 'admin_media',
        label: 'Product Media',
        path: '/admin/media',
        icon: 'ImageIcon',
        defaultRoles: ['company_admin'],
        theme: {
          name: 'teal',
          gradient: 'from-teal-500 via-emerald-500 to-cyan-500',
          activeLink: 'bg-teal-50/90 text-teal-800 font-bold border-teal-200/80 shadow-xs shadow-teal-100',
          activeIcon: 'text-teal-600',
          indicator: 'bg-teal-500',
          badge: 'bg-teal-600 text-white',
          glow: 'shadow-teal-500/20'
        }
      },
      {
        id: 'admin_categories',
        label: 'Custom Categories',
        path: '/admin/categories',
        icon: 'FolderTree',
        defaultRoles: ['company_admin'],
        theme: {
          name: 'green',
          gradient: 'from-green-500 via-emerald-600 to-teal-600',
          activeLink: 'bg-green-50/90 text-green-800 font-bold border-green-200/80 shadow-xs shadow-green-100',
          activeIcon: 'text-green-600',
          indicator: 'bg-green-500',
          badge: 'bg-green-600 text-white',
          glow: 'shadow-green-500/20'
        }
      },
      {
        id: 'admin_users',
        label: 'Business Development Executive',
        path: '/retail/admin/users',
        icon: 'User',
        defaultRoles: ['company_admin'],
        theme: {
          name: 'coffee',
          gradient: 'from-[#3E2415] via-[#5D3720] to-[#8A5232]',
          activeLink: 'bg-gradient-to-r from-[#3E2415] to-[#5D3720] text-amber-100 font-bold border-[#8A5232]/50 shadow-xs shadow-[#3E2415]/40',
          activeIcon: 'text-amber-300',
          indicator: 'bg-[#8A5232]',
          badge: 'bg-[#5D3720] text-white',
          glow: 'shadow-[#3E2415]/40'
        }
      },
      {
        id: 'admin_invoice_profile',
        label: 'Invoice & QR Profile',
        path: '/retail/admin/settings?tab=invoice',
        icon: 'Receipt',
        defaultRoles: ['company_admin'],
        theme: {
          name: 'amber',
          gradient: 'from-amber-600 via-orange-600 to-amber-700',
          activeLink: 'bg-amber-50/90 text-amber-800 font-bold border-amber-300/80 shadow-xs shadow-amber-100',
          activeIcon: 'text-amber-600',
          indicator: 'bg-amber-600',
          badge: 'bg-amber-700 text-white',
          glow: 'shadow-amber-500/20'
        }
      },
      {
        id: 'admin_settings',
        label: 'Store Settings',
        path: '/retail/admin/settings',
        icon: 'Settings',
        defaultRoles: ['company_admin'],
        theme: {
          name: 'slate',
          gradient: 'from-slate-600 via-teal-700 to-emerald-700',
          activeLink: 'bg-slate-100/90 text-slate-800 font-bold border-slate-300/80 shadow-xs',
          activeIcon: 'text-slate-600',
          indicator: 'bg-slate-600',
          badge: 'bg-slate-700 text-white',
          glow: 'shadow-slate-500/20'
        }
      }
    ]
  },
  {
    id: 'commerce',
    label: 'Commerce',
    description: 'Customer orders, platform-wide fulfillment, and RFQ quotations',
    color: 'purple',
    dotClass: 'bg-purple-500 shadow-purple-500/50',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
    items: [
      {
        id: 'super_orders',
        label: 'Platform Orders',
        path: '/super/orders',
        icon: 'Receipt',
        defaultRoles: ['super_admin'],
        theme: {
          name: 'purple',
          gradient: 'from-purple-600 via-violet-600 to-indigo-600',
          activeLink: 'bg-purple-50/90 text-purple-800 font-bold border-purple-200/80 shadow-xs shadow-purple-100',
          activeIcon: 'text-purple-600',
          indicator: 'bg-purple-600',
          badge: 'bg-purple-600 text-white',
          glow: 'shadow-purple-500/20'
        }
      },
      {
        id: 'super_quotes',
        label: 'RFQ Quotations',
        path: '/super/quotes',
        icon: 'FileText',
        defaultRoles: ['super_admin'],
        theme: {
          name: 'violet',
          gradient: 'from-violet-600 via-purple-600 to-pink-600',
          activeLink: 'bg-violet-50/90 text-violet-800 font-bold border-violet-200/80 shadow-xs shadow-violet-100',
          activeIcon: 'text-violet-600',
          indicator: 'bg-violet-600',
          badge: 'bg-violet-600 text-white',
          glow: 'shadow-violet-500/20'
        }
      },
      {
        id: 'admin_orders',
        label: 'Customer Orders',
        path: '/admin/orders',
        icon: 'Receipt',
        badgeKey: 'pendingOrders',
        defaultRoles: ['company_admin'],
        theme: {
          name: 'purple',
          gradient: 'from-purple-500 via-indigo-600 to-violet-600',
          activeLink: 'bg-purple-50/90 text-purple-800 font-bold border-purple-200/80 shadow-xs shadow-purple-100',
          activeIcon: 'text-purple-600',
          indicator: 'bg-purple-500',
          badge: 'bg-purple-600 text-white',
          glow: 'shadow-purple-500/20'
        }
      },
      {
        id: 'admin_quotes',
        label: 'RFQ Inquiries',
        path: '/admin/quotes',
        icon: 'FileText',
        badgeKey: 'openQuotes',
        defaultRoles: ['company_admin'],
        theme: {
          name: 'coffee',
          gradient: 'from-[#331C0E] via-[#4D2D1B] to-[#75472E]',
          activeLink: 'bg-gradient-to-r from-[#331C0E] to-[#4D2D1B] text-amber-100 font-bold border-[#75472E]/50 shadow-xs shadow-[#331C0E]/40',
          activeIcon: 'text-amber-300',
          indicator: 'bg-[#75472E]',
          badge: 'bg-[#4D2D1B] text-white',
          glow: 'shadow-[#331C0E]/40'
        }
      }
    ]
  },
  {
    id: 'governance',
    label: 'Governance',
    description: 'Menu access permissions, global settings, and audit logs',
    color: 'rose',
    dotClass: 'bg-rose-500 shadow-rose-500/50',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    items: [
      {
        id: 'super_access',
        label: 'Menu Access Control',
        path: '/super/access',
        icon: 'KeyRound',
        defaultRoles: ['super_admin'],
        theme: {
          name: 'rose',
          gradient: 'from-rose-500 via-red-600 to-pink-600',
          activeLink: 'bg-rose-50/90 text-rose-800 font-bold border-rose-200/80 shadow-xs shadow-rose-100',
          activeIcon: 'text-rose-600',
          indicator: 'bg-rose-500',
          badge: 'bg-rose-600 text-white',
          glow: 'shadow-rose-500/20'
        }
      },
      {
        id: 'super_invoice_profile',
        label: 'Invoice & QR Profiles',
        path: '/retail/admin/settings?tab=invoice',
        icon: 'Receipt',
        defaultRoles: ['super_admin'],
        theme: {
          name: 'amber',
          gradient: 'from-amber-600 via-orange-600 to-amber-700',
          activeLink: 'bg-amber-50/90 text-amber-800 font-bold border-amber-300/80 shadow-xs shadow-amber-100',
          activeIcon: 'text-amber-600',
          indicator: 'bg-amber-600',
          badge: 'bg-amber-700 text-white',
          glow: 'shadow-amber-500/20'
        }
      },
      {
        id: 'super_settings',
        label: 'Global Settings',
        path: '/super/settings',
        icon: 'Settings',
        defaultRoles: ['super_admin'],
        theme: {
          name: 'slate',
          gradient: 'from-slate-700 via-rose-700 to-pink-700',
          activeLink: 'bg-rose-50/70 text-rose-900 font-bold border-rose-200/80 shadow-xs',
          activeIcon: 'text-rose-600',
          indicator: 'bg-rose-500',
          badge: 'bg-rose-700 text-white',
          glow: 'shadow-rose-500/20'
        }
      },
      {
        id: 'super_audit',
        label: 'Audit Logs',
        path: '/super/audit',
        icon: 'ShieldCheck',
        defaultRoles: ['super_admin'],
        theme: {
          name: 'red',
          gradient: 'from-red-600 via-rose-600 to-amber-600',
          activeLink: 'bg-red-50/90 text-red-800 font-bold border-red-200/80 shadow-xs shadow-red-100',
          activeIcon: 'text-red-600',
          indicator: 'bg-red-600',
          badge: 'bg-red-600 text-white',
          glow: 'shadow-red-500/20'
        }
      }
    ]
  },
  {
    id: 'publishing',
    label: 'Publishing',
    description: 'Copywriting queue and finance pricing approval',
    color: 'fuchsia',
    dotClass: 'bg-fuchsia-500 shadow-fuchsia-500/50',
    badgeClass: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200',
    items: [
      {
        id: 'content_writer',
        label: 'Content Writer',
        path: '/content',
        icon: 'PenLine',
        badgeKey: 'pendingContent',
        defaultRoles: ['super_admin', 'company_admin', 'content_writer'],
        theme: {
          name: 'fuchsia',
          gradient: 'from-fuchsia-500 via-pink-600 to-purple-600',
          activeLink: 'bg-fuchsia-50/90 text-fuchsia-800 font-bold border-fuchsia-200/80 shadow-xs shadow-fuchsia-100',
          activeIcon: 'text-fuchsia-600',
          indicator: 'bg-fuchsia-500',
          badge: 'bg-fuchsia-600 text-white',
          glow: 'shadow-fuchsia-500/20'
        }
      },
      {
        id: 'finance_review',
        label: 'Finance Review',
        path: '/finance',
        icon: 'IndianRupee',
        badgeKey: 'financeQueue',
        defaultRoles: ['super_admin', 'company_admin', 'finance'],
        theme: {
          name: 'teal',
          gradient: 'from-teal-500 via-emerald-600 to-cyan-600',
          activeLink: 'bg-teal-50/90 text-teal-800 font-bold border-teal-200/80 shadow-xs shadow-teal-100',
          activeIcon: 'text-teal-600',
          indicator: 'bg-teal-500',
          badge: 'bg-teal-600 text-white',
          glow: 'shadow-teal-500/20'
        }
      }
    ]
  },
  {
    id: 'storefront',
    label: 'Storefront',
    description: 'Retail catalog browsing, order placement, and customer account',
    color: 'orange',
    dotClass: 'bg-orange-500 shadow-orange-500/50',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
    items: [
      {
        id: 'store_home',
        label: 'Store Home / Live',
        path: '/store/home',
        icon: 'Store',
        defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'orange',
          gradient: 'from-orange-500 via-amber-500 to-red-500',
          activeLink: 'bg-orange-50/90 text-orange-800 font-bold border-orange-200/80 shadow-xs shadow-orange-100',
          activeIcon: 'text-orange-600',
          indicator: 'bg-orange-500',
          badge: 'bg-orange-600 text-white',
          glow: 'shadow-orange-500/20'
        }
      },
      {
        id: 'store_listing',
        label: 'All Products',
        path: '/store/listing',
        icon: 'Boxes',
        defaultRoles: ['sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'amber',
          gradient: 'from-amber-500 via-orange-500 to-yellow-600',
          activeLink: 'bg-amber-50/90 text-amber-900 font-bold border-amber-200/80 shadow-xs shadow-amber-100',
          activeIcon: 'text-amber-600',
          indicator: 'bg-amber-500',
          badge: 'bg-amber-600 text-white',
          glow: 'shadow-amber-500/20'
        }
      },
      {
        id: 'store_cart',
        label: 'My Cart',
        path: '/store/cart',
        icon: 'ShoppingCart',
        badgeKey: 'cart',
        defaultRoles: ['sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'orange',
          gradient: 'from-orange-600 via-red-500 to-pink-500',
          activeLink: 'bg-orange-50/90 text-orange-900 font-bold border-orange-200/80 shadow-xs shadow-orange-100',
          activeIcon: 'text-orange-600',
          indicator: 'bg-orange-600',
          badge: 'bg-orange-600 text-white',
          glow: 'shadow-orange-500/20'
        }
      },
      {
        id: 'store_quotes',
        label: 'My Quotations',
        path: '/store/quotes',
        icon: 'FileText',
        badgeKey: 'openQuotes',
        defaultRoles: ['sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'amber',
          gradient: 'from-amber-500 via-yellow-500 to-orange-600',
          activeLink: 'bg-amber-50/90 text-amber-800 font-bold border-amber-200/80 shadow-xs shadow-amber-100',
          activeIcon: 'text-amber-600',
          indicator: 'bg-amber-500',
          badge: 'bg-amber-600 text-white',
          glow: 'shadow-amber-500/20'
        }
      },
      {
        id: 'store_orders',
        label: 'My Orders',
        path: '/store/orders',
        icon: 'Package',
        defaultRoles: ['sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'orange',
          gradient: 'from-orange-600 via-amber-600 to-yellow-600',
          activeLink: 'bg-orange-50/90 text-orange-800 font-bold border-orange-200/80 shadow-xs shadow-orange-100',
          activeIcon: 'text-orange-600',
          indicator: 'bg-orange-600',
          badge: 'bg-orange-600 text-white',
          glow: 'shadow-orange-500/20'
        }
      },
      {
        id: 'store_invoices',
        label: 'Invoice History',
        path: '/store/invoices',
        icon: 'Receipt',
        defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'emerald',
          gradient: 'from-emerald-600 via-teal-600 to-cyan-600',
          activeLink: 'bg-emerald-50/90 text-emerald-900 font-bold border-emerald-200/80 shadow-xs shadow-emerald-100',
          activeIcon: 'text-emerald-600',
          indicator: 'bg-emerald-600',
          badge: 'bg-emerald-600 text-white',
          glow: 'shadow-emerald-500/20'
        }
      },
      {
        id: 'store_profile',
        label: 'My Profile',
        path: '/store/profile',
        icon: 'User',
        defaultRoles: ['sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'amber',
          gradient: 'from-amber-600 via-orange-600 to-yellow-600',
          activeLink: 'bg-amber-50/90 text-amber-900 font-bold border-amber-200/80 shadow-xs shadow-amber-100',
          activeIcon: 'text-amber-600',
          indicator: 'bg-amber-600',
          badge: 'bg-amber-600 text-white',
          glow: 'shadow-amber-500/20'
        }
      }
    ]
  },
  {
    id: 'browse_categories',
    label: 'Browse Categories',
    description: 'Category navigation and storefront product filters',
    color: 'emerald',
    dotClass: 'bg-emerald-500 shadow-emerald-500/50',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    items: [
      {
        id: 'cat_cnc_machines',
        categorySlug: 'cnc-machines',
        label: 'CNC Machines',
        path: '/store/listing?cat=cnc-machines',
        icon: 'Boxes',
        emoji: '🏭',
        defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'emerald',
          gradient: 'from-emerald-600 via-teal-600 to-cyan-600',
          activeLink: 'bg-emerald-50/90 text-emerald-800 font-bold border-emerald-200/80 shadow-xs shadow-emerald-100',
          activeIcon: 'text-emerald-600',
          indicator: 'bg-emerald-600',
          badge: 'bg-emerald-600 text-white',
          glow: 'shadow-emerald-500/20'
        }
      },
      {
        id: 'cat_cutting_tools',
        categorySlug: 'cutting-tools',
        label: 'Cutting Tools',
        path: '/store/listing?cat=cutting-tools',
        icon: 'Boxes',
        emoji: '🔩',
        defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'coffee',
          gradient: 'from-[#3A2216] via-[#5A3523] to-[#875034]',
          activeLink: 'bg-gradient-to-r from-[#3A2216] to-[#5A3523] text-amber-100 font-bold border-[#875034]/50 shadow-xs shadow-[#3A2216]/40',
          activeIcon: 'text-amber-300',
          indicator: 'bg-[#875034]',
          badge: 'bg-[#5A3523] text-white',
          glow: 'shadow-[#3A2216]/40'
        }
      },
      {
        id: 'cat_spares',
        categorySlug: 'spares',
        label: 'Machine Spare Parts',
        path: '/store/listing?cat=spares',
        icon: 'Boxes',
        emoji: '⚙️',
        defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'slate',
          gradient: 'from-slate-600 via-zinc-600 to-stone-600',
          activeLink: 'bg-slate-100 text-slate-900 font-bold border-slate-300 shadow-xs',
          activeIcon: 'text-slate-700',
          indicator: 'bg-slate-600',
          badge: 'bg-slate-700 text-white',
          glow: 'shadow-slate-500/20'
        }
      },
      {
        id: 'cat_workholding',
        categorySlug: 'workholding',
        label: 'Workholding & Accessories',
        path: '/store/listing?cat=workholding',
        icon: 'Boxes',
        emoji: '🗜️',
        defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'amber',
          gradient: 'from-amber-600 via-yellow-600 to-orange-600',
          activeLink: 'bg-amber-50/90 text-amber-900 font-bold border-amber-200/80 shadow-xs shadow-amber-100',
          activeIcon: 'text-amber-600',
          indicator: 'bg-amber-600',
          badge: 'bg-amber-600 text-white',
          glow: 'shadow-amber-500/20'
        }
      },
      {
        id: 'cat_electrical',
        categorySlug: 'electrical',
        label: 'Control & Electrical',
        path: '/store/listing?cat=electrical',
        icon: 'Boxes',
        emoji: '🎛️',
        defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'purple',
          gradient: 'from-purple-600 via-indigo-600 to-violet-600',
          activeLink: 'bg-purple-50/90 text-purple-900 font-bold border-purple-200/80 shadow-xs shadow-purple-100',
          activeIcon: 'text-purple-600',
          indicator: 'bg-purple-600',
          badge: 'bg-purple-600 text-white',
          glow: 'shadow-purple-500/20'
        }
      },
      {
        id: 'cat_raw_materials',
        categorySlug: 'raw-materials',
        label: 'Raw Materials',
        path: '/store/listing?cat=raw-materials',
        icon: 'Boxes',
        emoji: '🧱',
        defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'rose',
          gradient: 'from-rose-600 via-pink-600 to-red-600',
          activeLink: 'bg-rose-50/90 text-rose-900 font-bold border-rose-200/80 shadow-xs shadow-rose-100',
          activeIcon: 'text-rose-600',
          indicator: 'bg-rose-600',
          badge: 'bg-rose-600 text-white',
          glow: 'shadow-rose-500/20'
        }
      },
      {
        id: 'cat_consumables',
        categorySlug: 'consumables',
        label: 'Industrial Consumables',
        path: '/store/listing?cat=consumables',
        icon: 'Boxes',
        emoji: '🛢️',
        defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'coffee',
          gradient: 'from-[#321C11] via-[#4F2C1B] to-[#784429]',
          activeLink: 'bg-gradient-to-r from-[#321C11] to-[#4F2C1B] text-amber-100 font-bold border-[#784429]/50 shadow-xs shadow-[#321C11]/40',
          activeIcon: 'text-amber-300',
          indicator: 'bg-[#784429]',
          badge: 'bg-[#4F2C1B] text-white',
          glow: 'shadow-[#321C11]/40'
        }
      },
      {
        id: 'cat_measuring',
        categorySlug: 'measuring',
        label: 'Measuring & Inspection',
        path: '/store/listing?cat=measuring',
        icon: 'Boxes',
        emoji: '📏',
        defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'teal',
          gradient: 'from-teal-600 via-emerald-600 to-green-600',
          activeLink: 'bg-teal-50/90 text-teal-900 font-bold border-teal-200/80 shadow-xs shadow-teal-100',
          activeIcon: 'text-teal-600',
          indicator: 'bg-teal-600',
          badge: 'bg-teal-600 text-white',
          glow: 'shadow-teal-500/20'
        }
      },
      {
        id: 'cat_safety',
        categorySlug: 'safety',
        label: 'Safety & Maintenance',
        path: '/store/listing?cat=safety',
        icon: 'Boxes',
        emoji: '🦺',
        defaultRoles: ['super_admin', 'company_admin', 'sales_user', 'sales_regional_partner', 'sales_channel_partner', 'sales_referral_partner'],
        theme: {
          name: 'orange',
          gradient: 'from-orange-600 via-amber-600 to-yellow-600',
          activeLink: 'bg-orange-50/90 text-orange-900 font-bold border-orange-200/80 shadow-xs shadow-orange-100',
          activeIcon: 'text-orange-600',
          indicator: 'bg-orange-600',
          badge: 'bg-orange-600 text-white',
          glow: 'shadow-orange-500/20'
        }
      }
    ]
  }
];

export function getAllPageIds() {
  const ids = [];
  for (const cat of MENU_CATALOG) {
    for (const item of cat.items) {
      ids.push(item.id);
    }
  }
  return ids;
}

export function getPageById(pageId) {
  for (const cat of MENU_CATALOG) {
    for (const item of cat.items) {
      if (item.id === pageId) return item;
    }
  }
  return null;
}

export function getPageByPath(pathname) {
  for (const cat of MENU_CATALOG) {
    for (const item of cat.items) {
      if (item.path === pathname || (item.path !== '/' && pathname.startsWith(item.path))) {
        return item;
      }
    }
  }
  return null;
}

export function getCategoryById(catId) {
  return MENU_CATALOG.find(c => c.id === catId) || null;
}
