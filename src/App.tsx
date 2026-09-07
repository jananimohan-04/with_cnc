import { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { LoginScreen } from './components/LoginScreen';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { Dashboard } from './pages/Dashboard';

import {
  PartsPage,
  DrawingsPage,
  BOMPage,
  RoutingPage,
  WorkInstructionsPage,
  RevisionsPage
} from './pages/engineering/EngineeringPages';

import {
  ProductionPlanningPage,
  WorkOrdersPage,
  JobCardsPage,
  MachineSchedulingPage,
  CNCOperationsPage,
  ShopFloorPage,
  ProductionTrackingPage,
  FinishedGoodsPage
} from './pages/production/ProductionPages';

import {
  EnquiriesPage,
  CustomersPage,
  QuotationsPage,
  SalesOrdersPage,
  DeliveriesPage
} from './pages/sales/SalesPages';

import {
  RawMaterialsPage, ComponentsPage, StockOverviewPage, StockMovementsPage, WarehousesPage, MaterialRequestsPage, LowStockPage
} from './pages/inventory/InventoryPages';

import {
  SuppliersPage, PurchaseRequisitionsPage, PurchaseOrdersPage, GoodsReceiptPage, SupplierPerformancePage
} from './pages/purchasing/PurchasingPages';

import {
  InspectionPlansPage, IncomingInspectionPage, InProcessInspectionPage, FinalInspectionPage, NCRPage, CorrectiveActionsPage
} from './pages/quality/QualityPages';

import {
  MachinesPage, PreventiveMaintenancePage, BreakdownMaintenancePage, MaintenanceHistoryPage, MachineDowntimePage
} from './pages/maintenance/MaintenancePages';

import {
  MaterialCostPage, MachineCostPage, LabourCostPage, ToolingCostPage, OverheadCostPage, JobCostingPage, QuoteCostingPage
} from './pages/costing/CostingPages';

import {
  ProductionReportsPage, SalesReportsPage, InventoryReportsPage, QualityReportsPage, MachineUtilizationReportsPage, CostAnalysisReportsPage
} from './pages/reports/ReportsPages';

import {
  UsersPage, RolesPage, PermissionsPage, SettingsPage, AuditLogsPage
} from './pages/admin/AdminPages';

// Placeholder Component for unbuilt pages
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-full bg-slate-50">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">{title}</h2>
        <p className="text-slate-500">This module is currently under development.</p>
      </div>
    </div>
  );
}

function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Remove leading slash for matching with Lovable's navigation config
  const currentPage = location.pathname.substring(1) || 'dashboard';

  const handleNavigate = (page: string) => {
    navigate(`/${page}`);
  };

  const handleLogout = () => {
    // In a real app, this would clear tokens. For now, just reload to go to login.
    window.location.href = '/';
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        currentPage={currentPage}
        onNavigate={handleNavigate}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar 
          currentPage={currentPage}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
        <main className="flex-1 overflow-y-auto scrollbar-dark">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard onNavigate={handleNavigate} />} />
            
            {/* Sales */}
            <Route path="/sales/enquiries" element={<EnquiriesPage />} />
            <Route path="/sales/customers" element={<CustomersPage />} />
            <Route path="/sales/quotations" element={<QuotationsPage />} />
            <Route path="/sales/orders" element={<SalesOrdersPage />} />
            <Route path="/sales/deliveries" element={<DeliveriesPage />} />
            
            {/* Engineering */}
            <Route path="/engineering/parts" element={<PartsPage />} />
            <Route path="/engineering/drawings" element={<DrawingsPage />} />
            <Route path="/engineering/bom" element={<BOMPage />} />
            <Route path="/engineering/routing" element={<RoutingPage />} />
            <Route path="/engineering/work-instructions" element={<WorkInstructionsPage />} />
            <Route path="/engineering/revisions" element={<RevisionsPage />} />

            {/* Production */}
            <Route path="/production/planning" element={<ProductionPlanningPage />} />
            <Route path="/production/work-orders" element={<WorkOrdersPage />} />
            <Route path="/production/job-cards" element={<JobCardsPage />} />
            <Route path="/production/scheduling" element={<MachineSchedulingPage />} />
            <Route path="/production/cnc-operations" element={<CNCOperationsPage />} />
            <Route path="/production/shop-floor" element={<ShopFloorPage />} />
            <Route path="/production/tracking" element={<ProductionTrackingPage />} />
            <Route path="/production/finished-goods" element={<FinishedGoodsPage />} />

            {/* Inventory */}
            <Route path="/inventory/raw-materials" element={<RawMaterialsPage />} />
            <Route path="/inventory/components" element={<ComponentsPage />} />
            <Route path="/inventory/stock" element={<StockOverviewPage />} />
            <Route path="/inventory/movements" element={<StockMovementsPage />} />
            <Route path="/inventory/requests" element={<MaterialRequestsPage />} />
            <Route path="/inventory/warehouse" element={<WarehousesPage />} />
            <Route path="/inventory/alerts" element={<LowStockPage />} />

            {/* Purchasing */}
            <Route path="/purchasing/suppliers" element={<SuppliersPage />} />
            <Route path="/purchasing/requisitions" element={<PurchaseRequisitionsPage />} />
            <Route path="/purchasing/orders" element={<PurchaseOrdersPage />} />
            <Route path="/purchasing/goods-receipt" element={<GoodsReceiptPage />} />
            <Route path="/purchasing/supplier-performance" element={<SupplierPerformancePage />} />

            {/* Quality */}
            <Route path="/quality/inspection-plans" element={<InspectionPlansPage />} />
            <Route path="/quality/incoming" element={<IncomingInspectionPage />} />
            <Route path="/quality/in-process" element={<InProcessInspectionPage />} />
            <Route path="/quality/final" element={<FinalInspectionPage />} />
            <Route path="/quality/ncr" element={<NCRPage />} />
            <Route path="/quality/corrective-actions" element={<CorrectiveActionsPage />} />

            {/* Maintenance */}
            <Route path="/maintenance/machines" element={<MachinesPage />} />
            <Route path="/maintenance/preventive" element={<PreventiveMaintenancePage />} />
            <Route path="/maintenance/breakdown" element={<BreakdownMaintenancePage />} />
            <Route path="/maintenance/history" element={<MaintenanceHistoryPage />} />
            <Route path="/maintenance/downtime" element={<MachineDowntimePage />} />

            {/* Costing */}
            <Route path="/costing/material" element={<MaterialCostPage />} />
            <Route path="/costing/machine" element={<MachineCostPage />} />
            <Route path="/costing/labour" element={<LabourCostPage />} />
            <Route path="/costing/tooling" element={<ToolingCostPage />} />
            <Route path="/costing/overhead" element={<OverheadCostPage />} />
            <Route path="/costing/job-costing" element={<JobCostingPage />} />
            <Route path="/costing/quote-costing" element={<QuoteCostingPage />} />

            {/* Reports */}
            <Route path="/reports/production" element={<ProductionReportsPage />} />
            <Route path="/reports/sales" element={<SalesReportsPage />} />
            <Route path="/reports/inventory" element={<InventoryReportsPage />} />
            <Route path="/reports/quality" element={<QualityReportsPage />} />
            <Route path="/reports/machine-utilization" element={<MachineUtilizationReportsPage />} />
            <Route path="/reports/cost-analysis" element={<CostAnalysisReportsPage />} />

            {/* Administration */}
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/roles" element={<RolesPage />} />
            <Route path="/admin/permissions" element={<PermissionsPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
            <Route path="/admin/audit-logs" element={<AuditLogsPage />} />

            {/* Fallback */}
            <Route path="*" element={<PlaceholderPage title="Page Not Found" />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  if (!isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <BrowserRouter>
      <MainLayout />
    </BrowserRouter>
  );
}

export default App;
