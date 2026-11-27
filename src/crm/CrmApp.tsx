import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { AuthProvider } from "./providers/AuthProvider";
import { ToastProvider } from "./providers/ToastProvider";
import "./crm.css";
import { RequirePermission } from "./components/guards";
import { PageLoader } from "./components/ui/primitives";
import { PERMISSIONS } from "./lib/permissions";


const Dashboard = lazy(() => import("./pages/Dashboard"));
const Leads = lazy(() => import("./pages/Leads"));
const LeadDetail = lazy(() => import("./pages/LeadDetail"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const FollowUps = lazy(() => import("./pages/FollowUps"));
const Team = lazy(() => import("./pages/Team"));
const Integrations = lazy(() => import("./pages/Integrations"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const Notifications = lazy(() => import("./pages/Notifications"));
const ImportLeads = lazy(() => import("./pages/ImportLeads"));
const NotFound = lazy(() => import("./pages/NotFound"));

function RoutePending() {
  return <PageLoader label="Loading page" />;
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RoutePending />}>{children}</Suspense>;
}

/**
 * Leads CRM inside BI (/crm/*): the original Argus Leads screens, with BI sign-in and companies.
 * Rendered by BI's App for every /crm path, outside BI's own layout (like the Retail Store).
 */
export function CrmApp() {
  return (
    <ToastProvider>
    <AuthProvider>
    <div className="crm-root min-h-screen bg-canvas text-ink">
    <Routes>
      {/* ------------------------------------------------------------- signed in */}
      <Route element={<AppShell />}>
        <Route
          index
          element={
            <Lazy>
              <Dashboard />
            </Lazy>
          }
        />
        <Route
          path="leads"
          element={
            <Lazy>
              <RequirePermission anyOf={[PERMISSIONS.LEAD_READ]}>
                <Leads />
              </RequirePermission>
            </Lazy>
          }
        />
        <Route
          path="leads/import"
          element={
            <Lazy>
              <RequirePermission anyOf={[PERMISSIONS.LEAD_IMPORT]}>
                <ImportLeads />
              </RequirePermission>
            </Lazy>
          }
        />
        <Route
          path="leads/:leadId"
          element={
            <Lazy>
              <RequirePermission anyOf={[PERMISSIONS.LEAD_READ]}>
                <LeadDetail />
              </RequirePermission>
            </Lazy>
          }
        />
        <Route
          path="pipeline"
          element={
            <Lazy>
              <RequirePermission anyOf={[PERMISSIONS.LEAD_READ]}>
                <Pipeline />
              </RequirePermission>
            </Lazy>
          }
        />
        <Route
          path="follow-ups"
          element={
            <Lazy>
              <RequirePermission anyOf={[PERMISSIONS.FOLLOW_UP_READ]}>
                <FollowUps />
              </RequirePermission>
            </Lazy>
          }
        />
        <Route
          path="team"
          element={
            <Lazy>
              <RequirePermission anyOf={[PERMISSIONS.TEAM_READ]}>
                <Team />
              </RequirePermission>
            </Lazy>
          }
        />
        <Route
          path="integrations"
          element={
            <Lazy>
              <RequirePermission anyOf={[PERMISSIONS.INTEGRATION_READ]}>
                <Integrations />
              </RequirePermission>
            </Lazy>
          }
        />
        <Route
          path="analytics"
          element={
            <Lazy>
              <RequirePermission anyOf={[PERMISSIONS.ANALYTICS_READ]}>
                <Analytics />
              </RequirePermission>
            </Lazy>
          }
        />
        <Route
          path="notifications"
          element={
            <Lazy>
              <Notifications />
            </Lazy>
          }
        />
        <Route
          path="settings"
          element={
            <Lazy>
              <Settings />
            </Lazy>
          }
        />
        <Route
          path="*"
          element={
            <Lazy>
              <NotFound />
            </Lazy>
          }
        />
      </Route>
    </Routes>
    </div>
    </AuthProvider>
    </ToastProvider>
  );
}
