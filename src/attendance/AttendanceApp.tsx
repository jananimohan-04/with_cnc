import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { useAuth as useBiAuth } from '@/contexts/AuthContext';
import './v2/index.css';
import { AuthProvider, useAuth } from './v2/context/AuthContext';
import { AppLayout } from './v2/components/AppLayout';
import { KioskMode } from './v2/pages/KioskMode';
import { AdminDashboard } from './v2/pages/AdminDashboard';
import { EnrollmentPage } from './v2/pages/EnrollmentPage';
import { PublicTerminal } from './v2/pages/PublicTerminal';
import { AttendanceReports } from './v2/pages/AttendanceReports';

// The remaining pages load on demand.
const EmployeePortal = lazy(() => import('./v2/pages/EmployeePortal').then((m) => ({ default: m.EmployeePortal })));
const ManualEntry = lazy(() => import('./v2/pages/ManualEntry').then((m) => ({ default: m.ManualEntry })));
const AdvanceMoney = lazy(() => import('./v2/pages/AdvanceMoney').then((m) => ({ default: m.AdvanceMoney })));
const LeaveApply = lazy(() => import('./v2/pages/LeaveApply').then((m) => ({ default: m.LeaveApply })));
const PaymentEntry = lazy(() => import('./v2/pages/PaymentEntry').then((m) => ({ default: m.PaymentEntry })));
const PayrollReport = lazy(() => import('./v2/pages/PayrollReport').then((m) => ({ default: m.PayrollReport })));
const MonthlyPayslip = lazy(() => import('./v2/pages/MonthlyPayslip').then((m) => ({ default: m.MonthlyPayslip })));
const OrgSettings = lazy(() => import('./v2/pages/OrgSettings').then((m) => ({ default: m.OrgSettings })));
const LiveMapGeofence = lazy(() => import('./v2/pages/LiveMapGeofence').then((m) => ({ default: m.LiveMapGeofence })));

const BASE = '/attendance';
// Pages an employee may open when the company has not set their own list (same list as the original suite).
const DEFAULT_EMPLOYEE_PERMISSIONS = ['/admin', '/kiosk', '/attendance-reports', '/leave-apply', '/payment-entry', '/payroll', '/monthly-payslip'];

const PageLoading = () => (
  <div className="p-8 text-center text-slate-500 font-mono">Loading...</div>
);

const ProtectedRoute = ({ children, requiredPath = null }: { children: React.ReactNode; requiredPath?: string | null }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-500 font-mono">Verifying credentials...</div>;
  if (!user) {
    return <Navigate to="/" replace />;
  }
  if (user.role === 'org_admin' || user.role === 'super_admin') {
    return <>{children}</>;
  }
  // Employee permissions check
  if (requiredPath) {
    const perms: string[] = user.permissions || DEFAULT_EMPLOYEE_PERMISSIONS;
    const hasPerm = perms.includes(requiredPath) || (requiredPath === '/admin' && (perms.includes('/admin') || perms.includes('/portal')));
    if (!hasPerm) {
      const fallback = perms.find((p) => p !== requiredPath) || '/portal';
      return <Navigate to={BASE + fallback} replace />;
    }
  }
  return <>{children}</>;
};

const DashboardRouter = () => {
  const { user } = useAuth();
  if (user?.role === 'employee') {
    return <EmployeePortal />;
  }
  return <AdminDashboard />;
};

/** A page inside the attendance shell (sidebar + top bar), guarded like the original suite. */
const Shell = ({ requiredPath, children }: { requiredPath?: string; children: React.ReactNode }) => {
  const content = (
    <AppLayout>
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </AppLayout>
  );
  return requiredPath ? <ProtectedRoute requiredPath={requiredPath}>{content}</ProtectedRoute> : content;
};

function AttendanceDisabled({ companyName }: { companyName: string }) {
  return (
    <div className="attendance-v2 min-h-screen flex items-center justify-center bg-[#f8fbff] bg-blueprint p-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center mx-auto mb-4 font-bold">
          <Camera className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">AI Attendance is Disabled</h2>
        <p className="mt-2 text-xs text-slate-600">
          Biometric Facial Recognition Attendance is not enabled for {companyName}. Please contact your administrator.
        </p>
        <div className="mt-5">
          <button
            onClick={() => window.location.assign('/dashboard')}
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
          >
            Return to BI Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

export function AttendanceApp() {
  const { company, attendanceEnabled, isSuperAdmin } = useBiAuth();
  const companyName = company?.company_name || 'this company';

  // Platform switch (Company Management): a Super Admin can always open the suite.
  if (!attendanceEnabled && !isSuperAdmin) {
    return <AttendanceDisabled companyName={companyName} />;
  }

  return (
    <AuthProvider>
      <div className="attendance-v2 min-h-screen">
        <Routes>
          {/* Standalone terminal screen (no sidebar) */}
          <Route path={`${BASE}/terminal`} element={<PublicTerminal />} />

          <Route path={`${BASE}/kiosk`} element={<Shell><KioskMode /></Shell>} />

          <Route path={BASE} element={<Shell requiredPath="/admin"><DashboardRouter /></Shell>} />
          <Route path={`${BASE}/admin`} element={<Shell requiredPath="/admin"><DashboardRouter /></Shell>} />
          <Route path={`${BASE}/dashboard`} element={<Shell requiredPath="/admin"><DashboardRouter /></Shell>} />
          <Route path={`${BASE}/portal`} element={<Shell requiredPath="/admin"><EmployeePortal /></Shell>} />

          <Route path={`${BASE}/attendance-reports`} element={<Shell requiredPath="/attendance-reports"><AttendanceReports /></Shell>} />
          <Route path={`${BASE}/enrollment`} element={<Shell requiredPath="/enrollment"><EnrollmentPage /></Shell>} />
          <Route path={`${BASE}/manual-entry`} element={<Shell requiredPath="/manual-entry"><ManualEntry /></Shell>} />
          <Route path={`${BASE}/advance-money`} element={<Shell requiredPath="/advance-money"><AdvanceMoney /></Shell>} />
          <Route path={`${BASE}/leave-apply`} element={<Shell requiredPath="/leave-apply"><LeaveApply /></Shell>} />
          <Route path={`${BASE}/payment-entry`} element={<Shell requiredPath="/payment-entry"><PaymentEntry /></Shell>} />
          {/* as in the original suite, /payroll opens Payment Entry; the full payroll report has its own address */}
          <Route path={`${BASE}/payroll`} element={<Shell requiredPath="/payment-entry"><PaymentEntry /></Shell>} />
          <Route path={`${BASE}/payroll-report`} element={<Shell requiredPath="/payroll"><PayrollReport /></Shell>} />
          <Route path={`${BASE}/monthly-payslip`} element={<Shell requiredPath="/monthly-payslip"><MonthlyPayslip /></Shell>} />
          <Route path={`${BASE}/settings`} element={<Shell requiredPath="/settings"><OrgSettings /></Shell>} />
          <Route path={`${BASE}/geofence`} element={<Shell requiredPath="/geofence"><LiveMapGeofence /></Shell>} />

          {/* addresses of the earlier attendance screens keep working */}
          <Route path={`${BASE}/reports`} element={<Navigate to={`${BASE}/attendance-reports`} replace />} />
          <Route path={`${BASE}/enroll`} element={<Navigate to={`${BASE}/enrollment`} replace />} />
          <Route path={`${BASE}/manual`} element={<Navigate to={`${BASE}/manual-entry`} replace />} />
          <Route path={`${BASE}/leaves`} element={<Navigate to={`${BASE}/leave-apply`} replace />} />
          <Route path={`${BASE}/payments`} element={<Navigate to={`${BASE}/payment-entry`} replace />} />
          <Route path={`${BASE}/payslip`} element={<Navigate to={`${BASE}/monthly-payslip`} replace />} />
          <Route path="/kiosk" element={<Navigate to={`${BASE}/kiosk`} replace />} />

          <Route path="*" element={<Navigate to={`${BASE}/dashboard`} replace />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}
