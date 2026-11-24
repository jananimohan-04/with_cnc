import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import companyLogo from '../assets/company-logo.jpg';
import { ScanFace, LogOut, Building2, UserCircle, LayoutDashboard, Calendar, ShieldCheck, Menu, X } from 'lucide-react';

export const Navbar = () => {
  const { user, organization, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setMobileMenuOpen(false);
    navigate("/");
  };

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <Link to="/attendance" onClick={closeMenu} className="flex items-center space-x-2.5 sm:space-x-3 group">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-1 shadow-sm group-hover:scale-105 transition-transform overflow-hidden shrink-0">
            <img src={companyLogo} alt="Company Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <span className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              ARGUS <span className="text-blue-600 font-semibold text-xs sm:text-sm px-1.5 py-0.5 bg-blue-50 rounded border border-blue-200">AI</span>
            </span>
            <span className="text-[10px] sm:text-xs text-slate-500 block -mt-1 truncate max-w-[150px] sm:max-w-none">Face Attendance</span>
          </div>
        </Link>

        {/* Center / Navigation Links (Desktop) */}
        <div className="hidden md:flex items-center space-x-1">
          <Link
            to="/attendance/kiosk"
            className="px-3.5 py-2 text-sm font-medium text-slate-700 hover:text-blue-600 hover:bg-blue-50/50 rounded-lg transition-colors flex items-center gap-2"
          >
            <ScanFace className="w-4 h-4 text-blue-600" />
            Kiosk Terminal
          </Link>

          {user && (user.role === 'org_admin' || user.role === 'super_admin') && (
            <Link
              to="/attendance/admin"
              className="px-3.5 py-2 text-sm font-medium text-slate-700 hover:text-blue-600 hover:bg-blue-50/50 rounded-lg transition-colors flex items-center gap-2"
            >
              <LayoutDashboard className="w-4 h-4 text-blue-600" />
              Admin Dashboard
            </Link>
          )}

          {user && (
            <Link
              to="/attendance/portal"
              className="px-3.5 py-2 text-sm font-medium text-slate-700 hover:text-blue-600 hover:bg-blue-50/50 rounded-lg transition-colors flex items-center gap-2"
            >
              <Calendar className="w-4 h-4 text-blue-600" />
              My Attendance
            </Link>
          )}

          <a
            href="/dashboard"
            className="px-3.5 py-2 text-sm font-medium text-slate-700 hover:text-blue-600 hover:bg-blue-50/50 rounded-lg transition-colors flex items-center gap-2"
          >
            <Building2 className="w-4 h-4 text-blue-600" />
            Return to BI
          </a>
        </div>

        {/* Right side Org Badge, User Info & Hamburger Toggle */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {organization && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
              {organization.logo_url ? (
                <img
                  src={organization.logo_url}
                  alt="Logo"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  className="w-4 h-4 rounded-full object-cover shrink-0"
                />
              ) : (
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span className="max-w-[120px] lg:max-w-[180px] truncate">{organization.name}</span>
            </div>
          )}

          {user ? (
            <div className="hidden sm:flex items-center space-x-2">
              <div className="text-right">
                <div className="text-xs font-semibold text-slate-900 leading-tight truncate max-w-[130px]">{user.name}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider capitalize">
                  {user.role === 'org_admin' ? 'Org Admin' : 'Employee'}
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Logout"
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center space-x-2">
              <Link
                to="/"
                className="px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/"
                className="px-3.5 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm rounded-lg transition-colors"
              >
                Register Org
              </Link>
            </div>
          )}

          {/* Mobile Hamburger Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white/95 backdrop-blur-md px-4 pt-3 pb-5 space-y-3 animate-in slide-in-from-top-2 duration-200 shadow-lg">
          {organization && (
            <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
              <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="truncate">{organization.name}</span>
            </div>
          )}

          {user && (
            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-900">{user.name}</div>
                <div className="text-[11px] text-blue-700 capitalize font-medium">{user.role === 'org_admin' ? 'Organization Admin' : 'Employee'}</div>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs text-red-600 hover:text-red-700 font-semibold px-2.5 py-1 rounded-lg border border-red-200 bg-white shadow-sm flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                Logout
              </button>
            </div>
          )}

          <div className="space-y-1 pt-1">
            <Link
              to="/attendance/kiosk"
              onClick={closeMenu}
              className="flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-colors"
            >
              <ScanFace className="w-5 h-5 text-blue-600" />
              Attendance Kiosk Terminal
            </Link>

            {user && (user.role === 'org_admin' || user.role === 'super_admin') && (
              <Link
                to="/attendance/admin"
                onClick={closeMenu}
                className="flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-colors"
              >
                <LayoutDashboard className="w-5 h-5 text-blue-600" />
                Admin Dashboard
              </Link>
            )}

            {user && (
              <Link
                to="/attendance/portal"
                onClick={closeMenu}
                className="flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-colors"
              >
                <Calendar className="w-5 h-5 text-blue-600" />
                My Attendance History
              </Link>
            )}

            {!user && (
              <div className="pt-2 grid grid-cols-2 gap-2">
                <Link
                  to="/"
                  onClick={closeMenu}
                  className="py-2.5 text-center text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/"
                  onClick={closeMenu}
                  className="py-2.5 text-center text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm rounded-xl transition-colors"
                >
                  Register Org
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};