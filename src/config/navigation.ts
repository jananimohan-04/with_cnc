import {
  LayoutDashboard,
  TrendingUp,
  Users,
  FileText,
  Package,
  Cog,
  ClipboardList,
  Boxes,
  ShoppingCart,
  Calculator,
  BarChart3,
  Settings,
  Building2,
  BookOpen,
  Scale,
  Landmark,
  type LucideIcon,
} from 'lucide-react';
import type { ErpRole } from '@/contexts/AuthContext';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  page: string;
  /** Only shown to these roles (visibility only — the database enforces access). */
  roles?: ErpRole[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', icon: LayoutDashboard, page: 'dashboard' }],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Sales Pipeline', icon: TrendingUp, page: 'sales/pipeline' },
      { label: 'All Leads', icon: Users, page: 'sales/leads' },
    ],
  },
  {
    label: 'Engineering',
    items: [
      { label: 'Products and Drawings', icon: FileText, page: 'engineering/cnc-vault' },
    ],
  },
  {
    label: 'Production',
    items: [
      { label: 'Production', icon: Cog, page: 'production/planning' },
      { label: 'Scheduling', icon: ClipboardList, page: 'production/scheduling' },
      { label: 'Machine Log', icon: Cog, page: 'production/tracking' },
      { label: 'Finished Goods', icon: Package, page: 'production/finished-goods' },
    ],
  },
  {
    label: 'Logistics',
    items: [
      { label: 'Delivery Challan', icon: FileText, page: 'operations/delivery' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Invoices', icon: FileText, page: 'finance/invoices' },
      { label: 'Bank & Cash', icon: Landmark, page: 'finance/bank-entries' },
      { label: 'Project Costing', icon: Calculator, page: 'costing/job-costing' },
    ],
  },
  {
    label: 'Accounts',
    items: [
      { label: 'Ledger', icon: BookOpen, page: 'accounts/ledger' },
      { label: 'Trial Balance', icon: Scale, page: 'accounts/trial-balance' },
      { label: 'Profit & Loss', icon: BarChart3, page: 'accounts/profit-loss' },
      { label: 'Balance Sheet', icon: Landmark, page: 'accounts/balance-sheet' },
    ],
  },
  {
    label: 'Supply Chain',
    items: [
      { label: 'Inventory', icon: Boxes, page: 'inventory/stock' },
      { label: 'Purchase', icon: ShoppingCart, page: 'purchasing/orders' },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Reports', icon: BarChart3, page: 'reports/production' },
      { label: 'User Management', icon: Users, page: 'admin/users', roles: ['SUPER_ADMIN', 'COMPANY_ADMIN'] },
      { label: 'Company Management', icon: Building2, page: 'admin/companies', roles: ['SUPER_ADMIN'] },
      { label: 'Settings', icon: Settings, page: 'admin/settings' },
    ],
  },
];

export const pageTitles: Record<string, string> = {
  'dashboard': 'Executive Dashboard',
  'sales/pipeline': 'Sales Pipeline',
  'sales/leads': 'All Leads',
  'sales/customers': 'Customers',
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
  'reports/sales': 'Sales Reports',
  'reports/inventory': 'Inventory Reports',
  'reports/quality': 'Quality Reports',
  'reports/machine-utilization': 'Machine Utilization Reports',
  'reports/cost-analysis': 'Cost Analysis Reports',
  'accounts/ledger': 'Ledger',
  'accounts/trial-balance': 'Trial Balance',
  'accounts/profit-loss': 'Profit & Loss',
  'accounts/balance-sheet': 'Balance Sheet',
  'finance/invoices': 'Invoices',
  'finance/bank-entries': 'Bank & Cash',
  'admin/users': 'User Management',
  'admin/companies': 'Company Management',
  'admin/roles': 'Roles',
  'admin/permissions': 'Permissions',
  'admin/settings': 'Company Settings',
  'admin/audit-logs': 'Audit Logs',
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
