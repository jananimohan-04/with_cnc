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
      { label: 'Enquiries', icon: FileText, page: 'sales/enquiries' },
      { label: 'Customers', icon: Users, page: 'sales/customers' },
      { label: 'Quotations', icon: TrendingUp, page: 'sales/quotations' },
      { label: 'Sales Orders', icon: ClipboardList, page: 'sales/orders' },
      { label: 'Delivery Tracking', icon: Package, page: 'sales/deliveries' },
    ],
  },
  {
    label: 'Engineering',
    items: [
      { label: 'Part Master', icon: Boxes, page: 'engineering/parts' },
      { label: 'CAD / Drawings', icon: FileText, page: 'engineering/drawings' },
      { label: 'BOM', icon: ClipboardList, page: 'engineering/bom' },
      { label: 'Routing', icon: Cog, page: 'engineering/routing' },
      { label: 'Work Instructions', icon: FileText, page: 'engineering/work-instructions' },
      { label: 'Revision Control', icon: ShieldCheck, page: 'engineering/revisions' },
    ],
  },
  {
    label: 'Production',
    items: [
      { label: 'Production Planning', icon: ClipboardList, page: 'production/planning' },
      { label: 'Work Orders', icon: ClipboardList, page: 'production/work-orders' },
      { label: 'Job Cards', icon: Cog, page: 'production/job-cards' },
      { label: 'Machine Scheduling', icon: BarChart3, page: 'production/scheduling' },
      { label: 'CNC Operations', icon: Cog, page: 'production/cnc-operations' },
      { label: 'Shop Floor', icon: Settings, page: 'production/shop-floor' },
      { label: 'Production Tracking', icon: TrendingUp, page: 'production/tracking' },
      { label: 'Finished Goods', icon: Package, page: 'production/finished-goods' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Raw Materials', icon: Boxes, page: 'inventory/raw-materials' },
      { label: 'Components', icon: Package, page: 'inventory/components' },
      { label: 'Stock', icon: ClipboardList, page: 'inventory/stock' },
      { label: 'Stock Movements', icon: TrendingUp, page: 'inventory/movements' },
      { label: 'Material Requests', icon: FileText, page: 'inventory/requests' },
      { label: 'Warehouse', icon: Settings, page: 'inventory/warehouse' },
      { label: 'Low Stock Alerts', icon: ShieldCheck, page: 'inventory/alerts' },
    ],
  },
  {
    label: 'Purchasing',
    items: [
      { label: 'Suppliers', icon: Users, page: 'purchasing/suppliers' },
      { label: 'Purchase Requisitions', icon: FileText, page: 'purchasing/requisitions' },
      { label: 'Purchase Orders', icon: ClipboardList, page: 'purchasing/orders' },
      { label: 'Goods Receipt', icon: Package, page: 'purchasing/goods-receipt' },
      { label: 'Supplier Performance', icon: BarChart3, page: 'purchasing/supplier-performance' },
    ],
  },
  {
    label: 'Quality',
    items: [
      { label: 'Inspection Plans', icon: FileText, page: 'quality/inspection-plans' },
      { label: 'Incoming Inspection', icon: ShieldCheck, page: 'quality/incoming' },
      { label: 'In-Process Inspection', icon: ShieldCheck, page: 'quality/in-process' },
      { label: 'Final Inspection', icon: ShieldCheck, page: 'quality/final' },
      { label: 'Rejection / NCR', icon: FileText, page: 'quality/ncr' },
      { label: 'Corrective Actions', icon: ClipboardList, page: 'quality/corrective-actions' },
    ],
  },
  {
    label: 'Maintenance',
    items: [
      { label: 'Machines', icon: Cog, page: 'maintenance/machines' },
      { label: 'Preventive Maintenance', icon: Wrench, page: 'maintenance/preventive' },
      { label: 'Breakdown Maintenance', icon: Wrench, page: 'maintenance/breakdown' },
      { label: 'Maintenance History', icon: ClipboardList, page: 'maintenance/history' },
      { label: 'Machine Downtime', icon: BarChart3, page: 'maintenance/downtime' },
    ],
  },
  {
    label: 'Costing',
    items: [
      { label: 'Material Cost', icon: Calculator, page: 'costing/material' },
      { label: 'Machine Cost', icon: Calculator, page: 'costing/machine' },
      { label: 'Labour Cost', icon: Calculator, page: 'costing/labour' },
      { label: 'Tooling Cost', icon: Calculator, page: 'costing/tooling' },
      { label: 'Overhead', icon: Calculator, page: 'costing/overhead' },
      { label: 'Job Costing', icon: Calculator, page: 'costing/job-costing' },
      { label: 'Quotation Costing', icon: Calculator, page: 'costing/quote-costing' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Production Reports', icon: BarChart3, page: 'reports/production' },
      { label: 'Sales Reports', icon: BarChart3, page: 'reports/sales' },
      { label: 'Inventory Reports', icon: BarChart3, page: 'reports/inventory' },
      { label: 'Quality Reports', icon: BarChart3, page: 'reports/quality' },
      { label: 'Machine Utilization', icon: BarChart3, page: 'reports/machine-utilization' },
      { label: 'Cost Analysis', icon: BarChart3, page: 'reports/cost-analysis' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users', icon: Users, page: 'admin/users' },
      { label: 'Roles', icon: Settings, page: 'admin/roles' },
      { label: 'Permissions', icon: ShieldCheck, page: 'admin/permissions' },
      { label: 'Company Settings', icon: Settings, page: 'admin/settings' },
      { label: 'Audit Logs', icon: FileText, page: 'admin/audit-logs' },
    ],
  },
];

export const pageTitles: Record<string, string> = {
  'dashboard': 'Executive Dashboard',
  'sales/enquiries': 'Sales Enquiries',
  'sales/customers': 'Customers',
  'sales/quotations': 'Quotations',
  'sales/orders': 'Sales Orders',
  'sales/deliveries': 'Delivery Tracking',
  'engineering/parts': 'Part Master',
  'engineering/drawings': 'CAD / Drawing Management',
  'engineering/bom': 'Bill of Materials',
  'engineering/routing': 'Process Routing',
  'engineering/work-instructions': 'Work Instructions',
  'engineering/revisions': 'Revision Control',
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
