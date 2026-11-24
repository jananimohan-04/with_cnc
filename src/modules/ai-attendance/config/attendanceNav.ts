import {
  LayoutDashboard,
  Users,
  Radio,
  FileSpreadsheet,
  Edit3,
  CreditCard,
  HandCoins,
  Scale,
  Receipt,
  BarChart3,
  Camera,
  CalendarDays,
  Settings,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: any;
  badge?: string;
  category: 'core' | 'reports' | 'finance' | 'admin';
}

export const ATTENDANCE_NAV_ITEMS: NavItem[] = [
  // Core Operational
  { label: 'Dashboard', path: '/attendance', icon: LayoutDashboard, category: 'core' },
  { label: 'AI Kiosk Terminal', path: '/attendance/kiosk', icon: Camera, category: 'core', badge: 'Live' },
  { label: 'Employee Details', path: '/attendance/employees', icon: Users, category: 'core' },
  { label: 'Live Punch Report', path: '/attendance/live-report', icon: Radio, category: 'core' },

  // Reports & Audits
  { label: 'Attendance Reports', path: '/attendance/reports', icon: FileSpreadsheet, category: 'reports' },
  { label: 'Manual Entry', path: '/attendance/manual-entry', icon: Edit3, category: 'reports' },
  { label: 'Leaves & Permission', path: '/attendance/leaves', icon: CalendarDays, category: 'reports' },

  // Payroll & Finance
  { label: 'Payment Entry', path: '/attendance/payment-entry', icon: CreditCard, category: 'finance' },
  { label: 'Advance Management', path: '/attendance/advance-management', icon: HandCoins, category: 'finance' },
  { label: 'Balance Report', path: '/attendance/balance-report', icon: Scale, category: 'finance' },
  { label: 'Monthly Payslip', path: '/attendance/monthly-payslip', icon: Receipt, category: 'finance' },
  { label: 'Salary Report', path: '/attendance/salary-report', icon: BarChart3, category: 'finance' },

  // Administration
  { label: 'Shift & Geofence', path: '/attendance/settings', icon: Settings, category: 'admin' },
];
