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
  ShieldCheck,
  Wrench,
  Calculator,
  BarChart3,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  page: string;
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
      { label: 'Part and Drawings', icon: FileText, page: 'engineering/cnc-vault' },
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
      { label: 'Delivery Tracking', icon: Package, page: 'operations/delivery' },
      { label: 'Delivery Challan', icon: FileText, page: 'operations/challan' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Invoices', icon: FileText, page: 'finance/invoices' },
      { label: 'Bank Entries', icon: FileText, page: 'finance/bank-entries' },
      { label: 'Ledger', icon: FileText, page: 'finance/ledger' },
      { label: 'Costing', icon: Calculator, page: 'costing/material' },
      { label: 'Accounts', icon: FileText, page: 'finance/accounts' },
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
      { label: 'Masters', icon: Settings, page: 'admin/users' },
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
  'operations/delivery': 'Delivery Tracking',
  'engineering/bom': 'Bill of Materials',
  'engineering/work-instructions': 'Work Instructions',
  'engineering/cnc-vault': 'Part and Drawings',
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
  'costing/job-costing': 'Job Costing',
  'costing/quote-costing': 'Quotation Costing',
  'reports/production': 'Production Reports',
  'reports/sales': 'Sales Reports',
  'reports/inventory': 'Inventory Reports',
  'reports/quality': 'Quality Reports',
  'reports/machine-utilization': 'Machine Utilization Reports',
  'reports/cost-analysis': 'Cost Analysis Reports',
  'admin/users': 'User Management',
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
