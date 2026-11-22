import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import companyLogo from '../assets/company-logo.jpg';

// Every attendance page lives under /attendance/... inside BI.
const BASE = '/attendance';
const toRoute = (p) => BASE + p;
import { 
  LayoutDashboard, 
  ScanFace, 
  Fingerprint, 
  CalendarCheck,
  Banknote,
  CalendarDays,
  CreditCard, 
  Settings as SettingsIcon, 
  ShieldCheck, 
  LogOut, 
  Menu, 
  X,
  ChevronRight,
  Bell,
  MapPin,
  FileSpreadsheet,
  ScrollText,
  Building2
} from 'lucide-react';

export const AppLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, organization, logout } = useAuth();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isEmployee = user?.role === 'employee';
  const userPermissions = user?.permissions || (isEmployee ? ['/admin', '/kiosk', '/attendance-reports', '/leave-apply', '/advance-money', '/payment-entry', '/payroll', '/monthly-payslip'] : null);

  // Notification state
  const [notifications, setNotifications] = useState([]);
  const [showNotifTray, setShowNotifTray] = useState(false);
  const notifRef = useRef(null);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data || []);
    } catch (e) {
      // silent
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 8000);
    const onFocus = () => fetchNotifications();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Close tray when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifTray(false);
      }
    };
    if (showNotifTray) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifTray]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) {}
  };

  const handleMarkSingleRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (e) {}
  };

  const rawNavItems = [
    {
      name: isEmployee ? 'Employee Dashboard' : 'Admin Dashboard',
      path: isEmployee ? '/portal' : '/admin',
      altPaths: ['/admin', '/portal', '/dashboard', ''],
      icon: LayoutDashboard,
      id: '/admin'
    },
    {
      name: 'Attendance Capture',
      path: '/kiosk',
      icon: ScanFace,
      id: '/kiosk'
    },
    {
      name: 'Attendance Reports',
      path: '/attendance-reports',
      icon: FileSpreadsheet,
      id: '/attendance-reports'
    },
    {
      name: 'Employee Directory',
      path: '/enrollment',
      icon: Fingerprint,
      id: '/enrollment'
    },
    {
      name: 'Manual Entry',
      path: '/manual-entry',
      icon: CalendarCheck,
      id: '/manual-entry'
    },
    {
      name: 'Leave Apply',
      path: '/leave-apply',
      icon: CalendarDays,
      id: '/leave-apply'
    },
    {
      name: 'Payment Entry',
      path: '/payment-entry',
      altPaths: ['/payroll'],
      icon: CreditCard,
      id: '/payment-entry'
    },
    {
      name: 'Monthly Payslip',
      path: '/monthly-payslip',
      icon: ScrollText,
      id: '/monthly-payslip'
    },
    {
      name: 'Live Map & Geofence',
      path: '/geofence',
      icon: MapPin,
      id: '/geofence'
    },
    {
      name: 'Settings',
      path: '/settings',
      icon: SettingsIcon,
      id: '/settings'
    }
  ];

  // Filter tabs: admins see everything, employees see only permitted tabs
  const navItems = rawNavItems.filter(item => {
    if (!isEmployee) return true;
    if (!userPermissions) return false;
    return userPermissions.includes(item.id) || userPermissions.includes(item.path);
  });

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="h-screen min-h-dvh bg-[#f8fbff] flex flex-col md:flex-row text-slate-800 font-sans overflow-hidden">
      {/* Desktop Left Sidebar - Fixed in place */}
      <aside className="attendance-sidebar hidden md:flex flex-col w-64 bg-white border-r border-slate-200 shrink-0 z-30 h-full overflow-y-auto">
        {/* Brand Header */}
        <div className="h-16 border-b border-slate-100 flex items-center px-5 gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center p-1 shadow-2xs shrink-0 overflow-hidden">
            <img src={companyLogo} alt="Company Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="text-xs font-black tracking-wider text-slate-900 uppercase">
              ARGUS
            </div>
            <div className="text-[10px] tracking-tight text-blue-600 font-bold -mt-0.5 uppercase">
              AI ATTENDANCE SUITE
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === toRoute(item.path) || (item.altPaths && item.altPaths.some((p) => toRoute(p) === location.pathname));
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                to={toRoute(item.path)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-bold border-l-4 border-blue-600 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-bold">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer / Org Details */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
            Current Tenant
          </div>
          <div className="flex items-center gap-2.5">
            {organization?.logo_url ? (
              <img
                src={organization.logo_url}
                alt="Logo"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                className="w-8 h-8 rounded-lg object-contain bg-white border border-slate-200 p-0.5 shrink-0 shadow-2xs"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-800 truncate">
                {organization?.name || 'Argus Technologies'}
              </div>
              <div className="text-[10px] text-slate-500 font-mono truncate">
                ID: {organization?.slug || 'ARGUS-MAIN'}
              </div>
            </div>
          </div>
          <a
            href="/dashboard"
            className="mt-2.5 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all"
          >
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Return to BI</span>
          </a>
        </div>
      </aside>

      {/* Main Content Area - Scrollable */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto">
        {/* Top Header Bar - Sticky */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 md:px-8 shrink-0 sticky top-0 z-20">
          {/* Mobile Menu Button & Brand */}
          <div className="flex items-center gap-2.5 md:hidden">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-white border border-slate-200 flex items-center justify-center p-0.5 shadow-2xs shrink-0 overflow-hidden">
                <img src={companyLogo} alt="Company Logo" className="w-full h-full object-contain" />
              </div>
              <span className="text-xs font-black tracking-wide">ARGUS AI</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            {organization?.logo_url ? (
              <img
                src={organization.logo_url}
                alt="Logo"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                className="w-6 h-6 rounded-md object-contain bg-white border border-slate-200 p-0.5"
              />
            ) : null}
            <div className="text-xs font-semibold text-slate-600">
              {organization?.name || 'Argus Technologies'}
            </div>
          </div>

          {/* Right User & Role Info Header */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Notification Bell with Tray */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setShowNotifTray(!showNotifTray)}
                className={`relative p-2 rounded-xl transition-all cursor-pointer ${
                  showNotifTray ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-emerald-500 text-white font-mono text-[9px] font-bold shadow-xs animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Tray (Responsive Width) */}
              {showNotifTray && (
                <div className="fixed sm:absolute right-2 sm:right-0 top-16 sm:top-auto sm:mt-2 w-[calc(100vw-1rem)] sm:w-96 max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95">
                  <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-800">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-mono text-[10px] font-bold">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length > 0 ? (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleMarkSingleRead(n.id)}
                          className={`p-3.5 text-xs transition-colors cursor-pointer flex items-start gap-3 ${
                            !n.is_read ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center mt-0.5 ${
                            n.type === 'SALARY_CREDITED' 
                              ? 'bg-emerald-100 text-emerald-700' 
                              : n.type === 'ADVANCE_STATUS' 
                              ? 'bg-amber-100 text-amber-700' 
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {n.type === 'SALARY_CREDITED' ? (
                              <CreditCard className="w-4 h-4 text-emerald-600" />
                            ) : n.type === 'ADVANCE_STATUS' ? (
                              <Banknote className="w-4 h-4 text-amber-600" />
                            ) : (
                              <Bell className="w-4 h-4 text-blue-600" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-slate-900 truncate">{n.title}</span>
                              {!n.is_read && (
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                              {n.message}
                            </p>
                            {n.amount && (
                              <div className="mt-1 font-mono font-bold text-emerald-700 text-xs">
                                ₹{Number(n.amount).toLocaleString('en-IN')}.00
                              </div>
                            )}
                            <div className="text-[9px] font-mono text-slate-400 mt-1">
                              {n.created_at ? new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-8 px-4 text-center text-slate-400">
                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
                        <div className="text-xs font-semibold text-slate-600">No notifications yet</div>
                        <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs mx-auto">
                          You'll receive alerts here when your salary is credited or advance requests are updated.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Admin Role Badge (Responsive) */}
            <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md text-[10px] sm:text-[11px] font-bold text-slate-700 uppercase tracking-wider shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="hidden sm:inline">{user?.role === 'org_admin' ? 'ADMIN ROLE' : 'EMPLOYEE'}</span>
              <span className="sm:hidden">{user?.role === 'org_admin' ? 'ADMIN' : 'STAFF'}</span>
            </div>

            {/* Profile Avatar & Name */}
            <div className="flex items-center gap-2 pl-1.5 sm:pl-2 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-slate-900 leading-tight">
                  {user?.name || user?.email?.split('@')[0] || 'Administrator'}
                </div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  {user?.role === 'org_admin' || user?.role === 'super_admin' ? 'Chief Executive Officer' : 'Staff Member'}
                </div>
              </div>

              {/* Avatar Photo */}
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full ring-2 ring-blue-500/20 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs overflow-hidden shrink-0">
                {(user?.name || user?.email || 'AD').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
              </div>

              <button
                onClick={handleLogout}
                title="Sign Out"
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Mobile Off-Canvas Sliding Navigation Drawer with Backdrop Overlay */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden animate-in fade-in duration-200">
            {/* Backdrop Tap-Outside Overlay */}
            <div 
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileSidebarOpen(false)}
            />

            {/* Drawer Panel */}
            <div className="fixed inset-y-0 left-0 max-w-xs w-full bg-white shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-left duration-250">
              <div className="h-16 border-b border-slate-100 flex items-center justify-between px-4 gap-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center p-1 shadow-2xs shrink-0 overflow-hidden">
                    <img src={companyLogo} alt="Company Logo" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <div className="text-xs font-black tracking-wider text-slate-900 uppercase">
                      ARGUS
                    </div>
                    <div className="text-[10px] tracking-tight text-blue-600 font-bold -mt-0.5 uppercase">
                      AI ATTENDANCE SUITE
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                  const isActive = location.pathname === toRoute(item.path) || (item.altPaths && item.altPaths.some((p) => toRoute(p) === location.pathname));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      to={toRoute(item.path)}
                      onClick={() => setMobileSidebarOpen(false)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-bold border-l-4 border-blue-600 shadow-xs'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                        <span>{item.name}</span>
                      </div>
                      {item.badge && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-bold">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>

              <div className="p-4 border-t border-slate-100 bg-slate-50/70 shrink-0">

                <div className="flex items-center gap-2.5">
                  {organization?.logo_url ? (
                    <img
                      src={organization.logo_url}
                      alt="Logo"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      className="w-8 h-8 rounded-lg object-contain bg-white border border-slate-200 p-0.5 shrink-0 shadow-2xs"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-800 truncate">
                      {organization?.name || 'Argus Technologies'}
                    </div>
                  </div>
                </div>
                <a
                  href="/dashboard"
                  className="mt-2.5 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all"
                >
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Return to BI</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Main Body */}
        <div role="main" className="attendance-v2-main flex-1 overflow-x-hidden p-3 sm:p-6 lg:p-8 bg-[#f8fbff] bg-blueprint">
          {children}
        </div>
      </div>
    </div>
  );
};
