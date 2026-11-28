import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  CalendarClock,
  Check,
  ChevronsUpDown,
  Contact,
  GitBranch,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Plug,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider";
import { initials, hueFor } from "../../lib/format";
import { ROLE_LABELS } from "../../lib/types";
import { can, PERMISSIONS } from "../../lib/permissions";

export function Avatar({
  name,
  email,
  size = "md",
}: {
  name?: string | null;
  email?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const sizes = {
    xs: "size-6 text-[10px]",
    sm: "size-7.5 text-[11px]",
    md: "size-9 text-xs",
    lg: "size-11 text-sm font-extrabold",
  } as const;
  const hue = hueFor(email || name || "unknown");
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-2xs ring-1 ring-black/5 select-none ${sizes[size]}`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 65% 50%), hsl(${(hue + 30) % 360} 70% 40%))`,
      }}
      aria-hidden
    >
      {initials(name, email)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Company switcher                                                            */
/* -------------------------------------------------------------------------- */

export function CompanySwitcher() {
  const { companies, currentCompany, selectCompany, role } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!currentCompany) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-xl border border-line bg-surface/90 hover:bg-slate-50 px-3 py-1.5 text-left transition-all hover:border-line-strong shadow-2xs cursor-pointer"
      >
        <Avatar name={currentCompany.name} email={currentCompany.slug} size="xs" />
        <span className="min-w-0 max-w-[130px] sm:max-w-[180px]">
          <span className="block truncate text-xs font-bold text-ink">{currentCompany.name}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-brand-600">
            {role ? ROLE_LABELS[role] : ""}
          </span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-ink-3" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-scale-in absolute right-0 sm:left-0 sm:right-auto top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-line/90 bg-surface shadow-pop"
        >
          <div className="border-b border-line/80 px-3.5 py-2.5 bg-slate-50/70">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3">
              Your Workspaces
            </p>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1.5 scroll-thin">
            {companies.map((company) => {
              const active = company.id === currentCompany.id;
              return (
                <li key={company.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      selectCompany(company.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition cursor-pointer ${
                      active
                        ? "bg-brand-50/80 font-bold text-brand-700"
                        : "text-ink hover:bg-slate-50"
                    }`}
                  >
                    <Avatar name={company.name} email={company.slug} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{company.name}</span>
                    <span className="text-[10px] uppercase font-semibold text-ink-3">
                      {ROLE_LABELS[company.role]}
                    </span>
                    {active && <Check className="size-3.5 text-brand-600 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <a
            href="/dashboard"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 border-t border-line/80 px-3.5 py-2.5 text-xs font-bold text-brand-600 hover:bg-brand-50/50 transition cursor-pointer"
          >
            <Plus className="size-3.5" aria-hidden />
            Back to Business Intelligence
          </a>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sidebar                                                                     */
/* -------------------------------------------------------------------------- */

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const { profile, user, role, signOut } = useAuth();
  const navigate = useNavigate();

  const items: NavItem[] = [
    { to: "/crm", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/crm/leads", label: "Leads", icon: Contact },
    { to: "/crm/pipeline", label: "Pipeline", icon: GitBranch },
    { to: "/crm/follow-ups", label: "Follow-ups", icon: CalendarClock },
    { to: "/crm/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/crm/team", label: "Team", icon: ShieldCheck },
    { to: "/crm/integrations", label: "Integrations", icon: Plug },
    { to: "/crm/notifications", label: "Notifications", icon: Bell },
    { to: "/crm/settings", label: "Settings", icon: Settings },
  ];

  // A viewer has no integration permissions at all — hide the entry rather
  // than show a page the role cannot read. (The route still guards itself.)
  const visible = items.filter(
    (item) => item.to !== "/crm/integrations" || can(role, PERMISSIONS.INTEGRATION_READ),
  );

  const name = profile?.full_name || user?.email || "Account";

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onMobileClose}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden transition-opacity"
        />
      ) : null}

      <aside
        className={[
          "crm-sidebar fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line bg-surface transition-[width,transform] duration-250 ease-in-out",
          collapsed ? "lg:w-[76px]" : "lg:w-64",
          "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
        aria-label="Main navigation"
      >
        {/* Brand header */}
        <div className={`flex h-16 shrink-0 items-center gap-3 border-b border-line/80 ${collapsed && !mobileOpen ? "lg:px-4" : "px-5"}`}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-700 via-brand-600 to-indigo-500 text-sm font-black text-white shadow-md shadow-brand-500/25">
            <Sparkles className="size-4.5" />
          </div>
          {(!collapsed || mobileOpen) && (
            <div className="min-w-0">
              <span className="font-display text-base font-extrabold tracking-tight text-ink block leading-none">
                Argus Leads
              </span>
              <span className="text-[10px] font-bold text-brand-600 tracking-wider uppercase block mt-1">
                CRM Suite
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="Close navigation"
            className="ml-auto rounded-lg p-1.5 text-ink-3 hover:bg-slate-100 lg:hidden cursor-pointer"
          >
            <PanelLeft className="size-4" aria-hidden />
          </button>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 scroll-thin space-y-1">
          <ul className="space-y-1">
            {visible.map((item) => {
              const Icon = item.icon;
              const label = (!collapsed || mobileOpen) && (
                <span className="truncate">{item.label}</span>
              );
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onMobileClose}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      [
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-150",
                        isActive
                          ? "bg-gradient-to-r from-brand-50 to-indigo-50/50 text-brand-700 shadow-2xs"
                          : "text-ink-2 hover:bg-slate-50 hover:text-ink",
                        collapsed && !mobileOpen ? "lg:justify-center lg:px-0" : "",
                      ].join(" ")
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-brand-600" />
                        )}
                        <Icon
                          className={`size-4.5 shrink-0 transition-colors ${
                            isActive ? "text-brand-600" : "text-ink-3 group-hover:text-ink"
                          }`}
                          aria-hidden
                        />
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Back to the rest of BI */}
        <div className={`shrink-0 ${collapsed && !mobileOpen ? "lg:px-3" : "px-3"} pb-3`}>
          <a
            href="/dashboard"
            title="Back to Business Intelligence"
            className={`flex items-center gap-2.5 rounded-xl bg-brand-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-brand-700 ${collapsed && !mobileOpen ? "lg:justify-center lg:px-0" : ""}`}
          >
            <ArrowLeft className="size-4 shrink-0" aria-hidden />
            {(!collapsed || mobileOpen) && <span className="truncate">Back to BI</span>}
          </a>
        </div>

        {/* User profile & sidebar toggle */}
        <div className={`shrink-0 border-t border-line/80 ${collapsed && !mobileOpen ? "lg:px-3" : "px-4"} py-3.5 bg-slate-50/40`}>
          <div className={`flex items-center gap-3 ${collapsed && !mobileOpen ? "lg:justify-center" : ""}`}>
            <Avatar name={profile?.full_name} email={user?.email} size="sm" />
            {(!collapsed || mobileOpen) && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-ink leading-tight">{name}</p>
                <p className="truncate text-[10px] text-ink-3 font-medium">{user?.email}</p>
              </div>
            )}
            {(!collapsed || mobileOpen) && (
              <button
                type="button"
                onClick={() => void signOut().then(() => navigate("/"))}
                aria-label="Sign out"
                title="Sign out"
                className="rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
              >
                <LogOut className="size-4" aria-hidden />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            className="mt-3 hidden w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface py-1.5 text-xs font-semibold text-ink-3 transition hover:border-line-strong hover:text-ink shadow-2xs lg:flex cursor-pointer"
          >
            <PanelLeft className={`size-3.5 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} aria-hidden />
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Topbar                                                                      */
/* -------------------------------------------------------------------------- */

export function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="glass-header sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 px-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenMobile}
        aria-label="Open navigation"
        className="rounded-xl p-2 text-ink-2 hover:bg-slate-100 transition lg:hidden cursor-pointer"
      >
        <PanelLeft className="size-5" aria-hidden />
      </button>

      {/* Global Quick Search Shortcut */}
      <button
        type="button"
        onClick={() => navigate("/crm/leads")}
        className="hidden items-center gap-2.5 rounded-xl border border-line bg-slate-50/80 px-3.5 py-1.5 text-xs font-medium text-ink-3 transition hover:bg-white hover:border-line-strong hover:text-ink shadow-2xs sm:flex cursor-pointer"
      >
        <Search className="size-3.5" aria-hidden />
        Search leads & contacts…
        <kbd className="ml-3 rounded-md border border-line bg-white px-1.5 py-0.5 font-mono text-[10px] text-ink-2 font-bold shadow-2xs">/</kbd>
      </button>

      {/* Right controls */}
      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/crm/notifications")}
          aria-label="Notifications"
          title="Notifications"
          className="relative rounded-xl p-2 text-ink-3 hover:bg-slate-100 hover:text-ink transition cursor-pointer"
        >
          <Bell className="size-4.5" />
        </button>

        <CompanySwitcher />

        <button
          type="button"
          onClick={() => navigate("/crm/settings")}
          aria-label="Your profile"
          title="Profile settings"
          className="rounded-xl transition ring-2 ring-transparent hover:ring-brand-500/20 cursor-pointer"
        >
          <Avatar name={profile?.full_name} email={user?.email} size="sm" />
        </button>
      </div>
    </header>
  );
}
