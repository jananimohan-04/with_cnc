import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Tv,
  FileText,
  ClipboardEdit,
  CreditCard,
  FileSpreadsheet,
  BarChart3,
  Building2,
  HelpCircle,
  ExternalLink,
  LogOut,
  MapPin,
} from 'lucide-react';

interface SidebarProps {
  collapsed?: boolean;
}

export const AttendanceSidebar: React.FC<SidebarProps> = ({ collapsed = false }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { label: 'Dashboard', path: '/attendance', icon: LayoutDashboard },
    { label: 'Employee Details', path: '/attendance/employees', icon: Users },
    { label: 'Leave & Permission', path: '/attendance/leaves', icon: CalendarCheck, badge: undefined },
    { label: 'Live Report', path: '/attendance/live-report', icon: Tv },
    { label: 'Attendance Report', path: '/attendance/attendance-report', icon: FileText },
    { label: 'Manual Entry', path: '/attendance/manual-entry', icon: ClipboardEdit },
    { label: 'Payment Entry', path: '/attendance/payment-entry', icon: CreditCard },
    { label: 'Payslip Preview', path: '/attendance/monthly-payslip', icon: FileSpreadsheet },
    { label: 'Salary Report', path: '/attendance/salary-report', icon: BarChart3 },
    { label: 'Company Profile', path: '/attendance/settings', icon: Building2 },
    { label: 'Support & Help', path: '/attendance/support', icon: HelpCircle },
  ];

  const handleLogout = () => {
    navigate('/dashboard');
  };

  return (
    <aside className={`att-sidebar attendance-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Brand Header */}
      <div className="att-sidebar-brand">
        <div className="att-brand-badge">
          <img
            src="/attendance-logo.jpg"
            alt="Argus Attendance Intelligence"
            className="w-full h-full object-contain p-0.5"
          />
        </div>
        {!collapsed && <div className="att-brand-divider" />}
        {!collapsed && (
          <div className="att-brand-text">
            <span className="att-brand-title">ATTENDANCE</span>
            <span className="att-brand-subtitle">INTELLIGENCE</span>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="att-sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isExactRoot = item.path === '/attendance';

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={isExactRoot}
              className={({ isActive }) => `att-nav-item ${isActive ? 'active' : ''}`}
              title={item.label}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.badge && (
                <span className="att-nav-count-badge">{item.badge}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer Area: Field Worker Module + Logout */}
      <div className="att-sidebar-footer">
        {!collapsed && (
          <button
            type="button"
            onClick={() => alert('Field Worker Mobile Module is an integrated mobile add-on.')}
            className="att-field-worker-card w-full text-left cursor-pointer"
          >
            <div className="att-fw-icon-box">
              <MapPin className="w-4 h-4 text-amber-500" />
            </div>
            <div className="att-fw-text">
              <span className="att-fw-title">Field Worker Mo...</span>
              <span className="att-fw-sub">Separate Module</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          </button>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="att-logout-btn"
          title="Return to Main ERP / Logout"
        >
          <LogOut className="w-4 h-4 flex-shrink-0 text-slate-400" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
};
