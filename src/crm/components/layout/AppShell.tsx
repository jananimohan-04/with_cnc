import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider";
import { Sidebar, Topbar } from "./Shell";
import { EmptyState, PageLoader } from "../ui/primitives";
import { Building2 } from "lucide-react";

const SIDEBAR_KEY = "argus.sidebar_collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Authenticated application chrome.
 *
 * Order of checks matters: configuration first (an unset .env file should be
 * reported as such rather than as "signed out"), then session, then company
 * membership. Each failure renders an actionable screen instead of a blank
 * page or a spinner that never resolves.
 */
export function AppShell() {
  const { status, needsCompany, noAccess, setupNeeded, configProblem, refreshing } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore: private mode */
    }
  }, [collapsed]);

  // The "/" shortcut focuses the leads search, matching the hint in the topbar.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (configProblem) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <EmptyState
          icon={<Building2 className="size-6" />}
          title="Frontend is not configured"
          description={configProblem}
        />
      </div>
    );
  }

  if (status === "loading" || refreshing) {
    return <PageLoader label="Loading your workspace" />;
  }

  if (status === "signedOut") {
    return <Navigate to="/" replace state={{ from: location.pathname + location.search }} />;
  }

  if (needsCompany || noAccess) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6">
        <EmptyState
          icon={<Building2 className="size-6" />}
          title={needsCompany ? "Choose a company first" : setupNeeded ? "Leads CRM is not set up yet" : "No access to the Leads CRM"}
          description={needsCompany
            ? "Pick a company in the BI top bar, then open the Leads CRM again."
            : setupNeeded
              ? "Please ask your administrator to run the SQL file 20261202000000_leads_crm.sql, then refresh this page."
              : "Ask your Company Admin to give you Leads CRM in BI Access Management."}
        />
        <a href="/dashboard" className="text-sm font-semibold text-brand-600 hover:underline">Back to BI</a>
      </div>
    );
  }

  return (
    <div className="flex min-h-full">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div
        className={[
          "flex min-w-0 flex-1 flex-col transition-[margin] duration-250 ease-in-out",
          collapsed ? "lg:ml-[76px]" : "lg:ml-64",
        ].join(" ")}
      >
        <Topbar onOpenMobile={() => setMobileOpen(true)} />
        <main id="main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * Auth gate for routes rendered *outside* the shell (e.g. the redirect target
 * after an OAuth handshake), so a visitor never lands on an unauthenticated
 * page and then gets bounced without explanation.
 */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const { status, configProblem } = useAuth();
  const location = useLocation();

  if (configProblem) return <Navigate to="/" replace />;
  if (status === "loading") return <PageLoader />;
  if (status === "signedOut") {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Redirects an already-signed-in visitor away from the auth pages. */
export function RedirectIfSignedIn({ children }: { children: React.ReactNode }) {
  const { status, companies, configProblem } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "signedIn" && !configProblem) {
      navigate(companies.length > 0 ? "/" : "/onboarding", { replace: true });
    }
  }, [status, companies.length, configProblem, navigate]);

  if (status === "loading") return <PageLoader />;
  return <>{children}</>;
}
