import {
  LayoutDashboard,
  TrendingUp,
  Users,
  FileText,
  Cog,
  ClipboardList,
  Boxes,
  ShoppingCart,
  Factory,
  Calculator,
  BarChart3,
  Settings,
  Building2,
  BookOpen,
  Scale,
  Landmark,
  Wallet,
  LifeBuoy,
  Archive,
  Store,
  Package,
  FolderTree,
  Receipt,
  ShieldCheck,
  Tag,
  MapPin,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ErpRole } from '@/contexts/AuthContext';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  page: string;
  /** Tailwind text color for the icon (unique per item, visible on dark navy). */
  iconClass?: string;
  /** Only shown to these roles (visibility only — the database enforces access). */
  roles?: ErpRole[];
  /** Permission module owning this entry (sidebar hides it without view access). */
  module?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

// The menu follows the same groups and module names as Access Management (src/config/permissions.ts).
export const navSections: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, page: 'dashboard', iconClass: 'text-sky-400', module: 'dashboard' },
      { label: 'Reports', icon: BarChart3, page: 'reports/production', iconClass: 'text-red-400', module: 'reports' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Sales Pipelines', icon: TrendingUp, page: 'sales/in-house', iconClass: 'text-emerald-400', module: 'sales-pipeline' },
      { label: 'Site Visit Sales', icon: MapPin, page: 'sales/site-visits', iconClass: 'text-sky-400', module: 'sales-pipeline' },
      { label: 'Partner & Online Sales', icon: ShoppingCart, page: 'sales/partner-orders', iconClass: 'text-indigo-400', module: 'sales-pipeline' },
    ],
  },
  {
    label: 'Production',
    items: [
      { label: 'Production', icon: Cog, page: 'production/planning', iconClass: 'text-orange-400', module: 'production' },
      { label: 'Scheduling', icon: ClipboardList, page: 'production/scheduling', iconClass: 'text-violet-400', module: 'scheduling' },
      { label: 'Machine Log', icon: Cog, page: 'production/tracking', iconClass: 'text-teal-300', module: 'machine-log' },
      { label: 'Process Master', icon: Factory, page: 'production/process-master', iconClass: 'text-rose-400', module: 'process-master' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Commercial Invoices', icon: Receipt, page: 'finance/invoices', iconClass: 'text-teal-400', module: 'invoices' },
      { label: 'Bank Entry', icon: Landmark, page: 'finance/bank-entry', iconClass: 'text-lime-400', module: 'bank-entry' },
      { label: 'Petty Cash', icon: Wallet, page: 'finance/petty-cash', iconClass: 'text-amber-400', module: 'petty-cash' },
      { label: 'Ledger', icon: BookOpen, page: 'accounts/ledger', iconClass: 'text-amber-300', module: 'ledger' },
      { label: 'Trial Balance', icon: Scale, page: 'accounts/trial-balance', iconClass: 'text-purple-300', module: 'ledger' },
      { label: 'Profit & Loss', icon: BarChart3, page: 'accounts/profit-loss', iconClass: 'text-blue-400', module: 'ledger' },
      { label: 'Balance Sheet', icon: Landmark, page: 'accounts/balance-sheet', iconClass: 'text-slate-300', module: 'ledger' },
      { label: 'Opening Balances', icon: Archive, page: 'accounts/opening-balances', iconClass: 'text-rose-300', module: 'opening-balances' },
      { label: 'Project Costing', icon: Calculator, page: 'costing/job-costing', iconClass: 'text-fuchsia-400', module: 'project-costing' },
    ],
  },
  {
    label: 'Inventory & Purchasing',
    items: [
      { label: 'Inventory', icon: Boxes, page: 'inventory/stock', iconClass: 'text-orange-300', module: 'inventory' },
      { label: 'Store Categories', icon: FolderTree, page: 'admin/categories', iconClass: 'text-cyan-400', module: 'inventory' },
      { label: 'Purchase', icon: ShoppingCart, page: 'purchasing/orders', iconClass: 'text-pink-400', module: 'purchase-orders' },
      { label: 'Products and Drawings', icon: FileText, page: 'engineering/cnc-vault', iconClass: 'text-amber-400', module: 'engineering' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'User Management', icon: Users, page: 'admin/users', roles: ['SUPER_ADMIN', 'COMPANY_ADMIN'], iconClass: 'text-cyan-400', module: 'admin-users' },
      { label: 'Access Management', icon: Users, page: 'admin/access', roles: ['SUPER_ADMIN', 'COMPANY_ADMIN'], iconClass: 'text-emerald-400', module: 'admin-access' },
      { label: 'Company Management', icon: Building2, page: 'admin/companies', roles: ['SUPER_ADMIN'], iconClass: 'text-indigo-400', module: 'admin-companies' },
      { label: 'Settings', icon: Settings, page: 'admin/settings', iconClass: 'text-gray-400', module: 'settings' },
      { label: 'Technical Support', icon: LifeBuoy, page: 'support/technical', iconClass: 'text-cyan-400', module: 'support' },
      { label: 'On-site Support', icon: Wrench, page: 'support/onsite', iconClass: 'text-emerald-400', module: 'support' },
      { label: 'Digital Storefront', icon: Store, page: 'store/home', iconClass: 'text-orange-400' },
    ],
  },
];

export const pageTitles: Record<string, string> = {
  'dashboard': 'Executive Dashboard',
  'sales/pipeline': 'In-house Sales Pipeline',
  'sales/in-house': 'In-house Sales Pipeline',
  'sales/site-visits': 'Site Visit Sales',
  'sales/partner-orders': 'Partner & Online Sales',
  'sales/leads': 'All Company Library',
  'sales/customers': 'Companies',
  'sales/quotations': 'Quotations',
  'sales/orders': 'Sales Orders',
  'operations/delivery': 'Delivery Challan',
  'engineering/bom': 'Bill of Materials',
  'engineering/work-instructions': 'Work Instructions',
  'engineering/cnc-vault': 'Products and Drawings',
  'production/planning': 'Production Planning',
  'production/work-orders': 'Work Orders',
  'production/job-cards': 'Job Cards',
  'production/scheduling': 'Machine Scheduling',
  'production/cnc-operations': 'CNC Operations',
  'production/shop-floor': 'Shop Floor Live',
  'production/tracking': 'Production Tracking',
  'production/process-master': 'Process Master',
  'production/finished-goods': 'Finished Goods',
  'inventory/raw-materials': 'Raw Materials',
  'inventory/components': 'Components',
  'inventory/stock': 'Stock Overview',
  'inventory/movements': 'Stock Movements',
  'inventory/requests': 'Material Requests',
  'inventory/warehouse': 'Warehouse',
  'inventory/alerts': 'Low Stock Alerts',
  'purchasing/suppliers': 'Suppliers',
  'purchasing/requisitions': 'Purchase Requisitions',
  'purchasing/orders': 'Purchase Orders',
  'purchasing/goods-receipt': 'Goods Receipt',
  'purchasing/supplier-performance': 'Supplier Performance',
  'quality/inspection-plans': 'Inspection Plans',
  'quality/incoming': 'Incoming Inspection',
  'quality/in-process': 'In-Process Inspection',
  'quality/final': 'Final Inspection',
  'quality/ncr': 'Rejection / NCR',
  'quality/corrective-actions': 'Corrective Actions',
  'maintenance/machines': 'Machine Master',
  'maintenance/preventive': 'Preventive Maintenance',
  'maintenance/breakdown': 'Breakdown Maintenance',
  'maintenance/history': 'Maintenance History',
  'maintenance/downtime': 'Machine Downtime',
  'costing/material': 'Material Cost',
  'costing/machine': 'Machine Cost',
  'costing/labour': 'Labour Cost',
  'costing/tooling': 'Tooling Cost',
  'costing/overhead': 'Overhead Cost',
  'costing/job-costing': 'Project Costing',
  'costing/quote-costing': 'Quotation Costing',
  'reports/production': 'Production Reports',
  'reports/order-tracking': 'Order Quantity Tracking',
  'reports/sales': 'Sales Reports',
  'reports/inventory': 'Inventory Reports',
  'reports/quality': 'Quality Reports',
  'reports/machine-utilization': 'Machine Utilization Reports',
  'reports/cost-analysis': 'Cost Analysis Reports',
  'quotation/metal-calculator': 'Metal Calculator',
  'quotation/create': 'Create Quotation',
  'quotation/client-library': 'Client Library',
  'quotation/product-library': 'Product Library',
  'quotation/terms-library': 'Terms Library',
  'quotation/library': 'Quotation Library',
  'quotation/company-profile': 'Company Profile',
  'accounts/ledger': 'Ledger',
  'accounts/trial-balance': 'Trial Balance',
  'accounts/profit-loss': 'Profit & Loss',
  'accounts/balance-sheet': 'Balance Sheet',
  'finance/invoices': 'Commercial Invoices',
  'finance/bank-entries': 'Bank & Cash',
  'finance/bank-entry': 'Bank Entry',
  'finance/petty-cash': 'Petty Cash Entry',
  'finance/ledger-dashboard': 'Ledger Dashboard',
  'accounts/opening-balances': 'Opening Balances',
  'admin/users': 'User Management',
  'admin/companies': 'Company Management',
  'admin/roles': 'Roles',
  'admin/permissions': 'Permissions',
  'admin/settings': 'Company Settings',
  'admin/audit-logs': 'Audit Logs',
  'support/center': 'Support Center',
  'support/technical': 'Technical Support',
  'support/onsite': 'On-site Support',
  'store/home': 'Digital Storefront',
  'store/listing': 'Product Catalog',
  'store/cart': 'Shopping Cart',
  'store/orders': 'My Orders',
  'store/quotes': 'My Quotations',
  'store/invoices': 'Store Invoices',
  'admin/products': 'Stock Library',
  'admin/media': 'Product Media',
  'admin/categories': 'Store Categories',
  'admin/orders': 'Customer Orders',
  'admin/quotes': 'RFQ Inquiries',
  'admin/settings-retail': 'Store Settings',
  'super/catalog': 'Master Catalog',
  'super/companies': 'Retail Company Hub',
  'super/access': 'Menu Access Control',
};

export function getBreadcrumbs(page: string): { label: string; page?: string }[] {
  const title = pageTitles[page] || page;
  if (page === 'dashboard') return [{ label: 'Dashboard' }];
  const parts = page.split('/');
  const module = parts[0];
  const moduleLabel = navSections.find((s) =>
    s.items.some((i) => i.page.startsWith(module + '/'))
  )?.label || module;
  return [
    { label: 'Dashboard', page: 'dashboard' },
    { label: moduleLabel },
    { label: title },
  ];
}
