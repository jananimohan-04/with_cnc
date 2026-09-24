import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from './hooks/use-auth';
import { usePermissions } from './hooks/use-permissions';
import { Link } from './router-adapter';
import {
  LayoutDashboard,
  FileText,
  Building2,
  Box,
  Settings,
} from 'lucide-react';

import { Route as DashboardPage } from './pages/_app.dashboard';
import { Route as DocumentsPage } from './pages/_app.documents.index';
import { Route as DocumentDetailPage } from './pages/_app.documents.$documentId';
import { Route as PartiesPage } from './pages/_app.parties';
import { Route as PartsPage } from './pages/_app.parts';
import { Route as SettingsPage } from './pages/_app.settings';
import { Route as UploadPage } from './pages/_app.upload';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
    },
  },
});

function VaultHeader() {
  const { can } = usePermissions();
  const location = useLocation();

  // Only show Part & Drawings relevant tabs — Users, Roles, Audit Logs
  // are managed from the main ERP's Admin section (same users system).
  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard", show: true },
    { label: "Documents", icon: FileText, path: "/documents", show: can("view") },
    { label: "Parties", icon: Building2, path: "/parties", show: can("manage_parties") || can("view") },
    { label: "Parts & Drawings", icon: Box, path: "/parts", show: can("manage_documents") || can("view") },
    { label: "Settings", icon: Settings, path: "/settings", show: can("manage_settings") || true },
  ];

  const filteredNavItems = navItems.filter((item) => item.show);

  return (
    <header className="sticky top-0 z-40 bg-[#293033] text-slate-300 shadow-md border-b border-[#333d48]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <nav className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-thin">
            {filteredNavItems.map((item) => {
              const fullPath = `/engineering/cnc-vault${item.path}`;
              const isMatch = location.pathname === fullPath || 
                (item.path === '/dashboard' && (location.pathname === '/engineering/cnc-vault' || location.pathname === '/engineering/cnc-vault/')) ||
                (item.path !== '/dashboard' && location.pathname.startsWith(fullPath));

              return (
                <Link
                  key={item.label}
                  to={item.path}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                    isMatch
                      ? 'bg-[#ff6600] text-white shadow-sm'
                      : 'text-slate-300 hover:bg-[#333d48] hover:text-white'
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}

function VaultContent() {
  return (
    <div className="flex flex-col min-h-full bg-slate-50">
      <VaultHeader />
      <main className="flex-1 w-full mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <Routes>
          <Route index element={<DashboardPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="documents/:documentId" element={<DocumentDetailPage />} />
          <Route path="parties" element={<PartiesPage />} />
          <Route path="parts" element={<PartsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </main>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export function CNCVaultPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <VaultContent />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default CNCVaultPage;
