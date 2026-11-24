import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AttendanceLayout } from './components/layout/AttendanceLayout';

// Module Pages
import { DashboardPage } from './pages/DashboardPage';
import { KioskTerminalPage } from './pages/KioskTerminalPage';
import { EmployeeDirectoryPage } from './pages/EmployeeDirectoryPage';
import { LiveReportPage } from './pages/LiveReportPage';
import { AttendanceReportPage } from './pages/AttendanceReportPage';
import { ManualEntryPage } from './pages/ManualEntryPage';
import { PaymentEntryPage } from './pages/PaymentEntryPage';
import { AdvanceManagementPage } from './pages/AdvanceManagementPage';
import { BalanceReportPage } from './pages/BalanceReportPage';
import { MonthlyPayslipPage } from './pages/MonthlyPayslipPage';
import { SalaryReportPage } from './pages/SalaryReportPage';
import { LeaveManagementPage } from './pages/LeaveManagementPage';
import { ShiftSettingsPage } from './pages/ShiftSettingsPage';

const BASE = '/attendance';

export const AIAttendanceRoot: React.FC = () => {
  const { company } = useAuth();
  const companyId = company?.id || '';
  const companyName = company?.company_name || 'ARGUS CNC';

  const wrapInLayout = (Component: React.ComponentType<{ companyId: string }>) => (
    <AttendanceLayout companyName={companyName}>
      <Component companyId={companyId} />
    </AttendanceLayout>
  );

  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-slate-400 font-mono">Loading Attendance...</div>}>
      <Routes>
        {/* Fullscreen Kiosk Mode Terminal */}
        <Route path={`${BASE}/kiosk`} element={<KioskTerminalPage companyId={companyId} />} />
        <Route path="/kiosk" element={<KioskTerminalPage companyId={companyId} />} />

        {/* Dashboard */}
        <Route path={BASE} element={wrapInLayout(DashboardPage)} />
        <Route path={`${BASE}/dashboard`} element={wrapInLayout(DashboardPage)} />
        <Route path={`${BASE}/admin`} element={wrapInLayout(DashboardPage)} />
        <Route path={`${BASE}/portal`} element={wrapInLayout(DashboardPage)} />

        {/* Core Operations */}
        <Route path={`${BASE}/employees`} element={wrapInLayout(EmployeeDirectoryPage)} />
        <Route path={`${BASE}/employee-details`} element={wrapInLayout(EmployeeDirectoryPage)} />
        <Route path={`${BASE}/enroll`} element={wrapInLayout(EmployeeDirectoryPage)} />
        <Route path={`${BASE}/enrollment`} element={wrapInLayout(EmployeeDirectoryPage)} />
        <Route path={`${BASE}/live-report`} element={wrapInLayout(LiveReportPage)} />

        {/* Timesheets & Logs */}
        <Route path={`${BASE}/reports`} element={wrapInLayout(AttendanceReportPage)} />
        <Route path={`${BASE}/attendance-report`} element={wrapInLayout(AttendanceReportPage)} />
        <Route path={`${BASE}/attendance-reports`} element={wrapInLayout(AttendanceReportPage)} />
        <Route path={`${BASE}/manual-entry`} element={wrapInLayout(ManualEntryPage)} />
        <Route path={`${BASE}/manual`} element={wrapInLayout(ManualEntryPage)} />

        {/* Financial & Payroll */}
        <Route path={`${BASE}/payment-entry`} element={wrapInLayout(PaymentEntryPage)} />
        <Route path={`${BASE}/payments`} element={wrapInLayout(PaymentEntryPage)} />
        <Route path={`${BASE}/advance-management`} element={wrapInLayout(AdvanceManagementPage)} />
        <Route path={`${BASE}/advance-money`} element={wrapInLayout(AdvanceManagementPage)} />
        <Route path={`${BASE}/advance-summary`} element={wrapInLayout(AdvanceManagementPage)} />
        <Route path={`${BASE}/balance-report`} element={wrapInLayout(BalanceReportPage)} />
        <Route path={`${BASE}/monthly-payslip`} element={wrapInLayout(MonthlyPayslipPage)} />
        <Route path={`${BASE}/payslip`} element={wrapInLayout(MonthlyPayslipPage)} />
        <Route path={`${BASE}/salary-report`} element={wrapInLayout(SalaryReportPage)} />
        <Route path={`${BASE}/payroll-report`} element={wrapInLayout(SalaryReportPage)} />

        {/* Leaves & Permissions */}
        <Route path={`${BASE}/leaves`} element={wrapInLayout(LeaveManagementPage)} />
        <Route path={`${BASE}/leave-apply`} element={wrapInLayout(LeaveManagementPage)} />
        <Route path={`${BASE}/leave-permission`} element={wrapInLayout(LeaveManagementPage)} />

        {/* Shift Policies & Geofencing */}
        <Route path={`${BASE}/settings`} element={wrapInLayout(ShiftSettingsPage)} />
        <Route path={`${BASE}/company-profile`} element={wrapInLayout(ShiftSettingsPage)} />
        <Route path={`${BASE}/support`} element={wrapInLayout(ShiftSettingsPage)} />
        <Route path={`${BASE}/geofence`} element={wrapInLayout(ShiftSettingsPage)} />
        <Route path={`${BASE}/branches`} element={wrapInLayout(ShiftSettingsPage)} />

        {/* Fallback to Attendance Dashboard */}
        <Route path="*" element={<Navigate to={BASE} replace />} />
      </Routes>
    </Suspense>
  );
};
