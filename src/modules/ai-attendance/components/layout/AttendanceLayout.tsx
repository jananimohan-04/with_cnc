import React, { useState, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { AttendanceHeader } from './AttendanceHeader';
import { AttendanceSidebar } from './AttendanceSidebar';
import { FloatingAiDock } from './FloatingAiDock';
import '../../styles/exactAttendance.css';

interface LayoutProps {
  companyName: string;
  children: React.ReactNode;
}

export const AttendanceLayout: React.FC<LayoutProps> = ({ companyName, children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const isDashboard =
    location.pathname === '/attendance' ||
    location.pathname === '/attendance/' ||
    location.pathname === '/attendance/dashboard' ||
    location.pathname === '/attendance/admin' ||
    location.pathname === '/attendance/portal';

  useLayoutEffect(() => {
    document.documentElement.classList.add('ai-attendance-active');
    document.body.classList.add('ai-attendance-active');
    return () => {
      document.documentElement.classList.remove('ai-attendance-active');
      document.body.classList.remove('ai-attendance-active');
    };
  }, []);

  return (
    <div className={`attendance-module-shell ${isDashboard ? 'att-shell-dashboard' : 'att-shell-split-2080'}`}>
      {/* Fixed Full-Height Navy Sidebar (top: 0 to 100vh) */}
      <AttendanceSidebar collapsed={collapsed} />

      {/* Main Content Wrapper positioned to the right of the sidebar */}
      <div className={`att-main-wrapper ${collapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Top White Navbar */}
        <AttendanceHeader
          companyName={companyName}
          onToggleSidebar={() => setCollapsed((prev) => !prev)}
        />

        {/* Dynamic Page Content */}
        <main className={`att-main-content ${isDashboard ? 'att-view-dashboard' : 'att-view-split-2080'}`}>
          {children}
        </main>

        {/* Footer */}
        <footer className="att-footer">
          <div>
            &copy; 2026 Argus Attendance Intelligence v2.0.0
          </div>
          <div className="flex items-center gap-2">
            <span>Powered by</span>
            <span className="att-footer-brand">ARGUS CNC™</span>
          </div>
        </footer>
      </div>

      {/* Floating 3-Assistant Bottom Dock */}
      <FloatingAiDock />
    </div>
  );
};
