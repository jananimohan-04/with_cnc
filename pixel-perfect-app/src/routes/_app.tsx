import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  FileText,
  Building2,
  Box,
  Upload,
  Users,
  Shield,
  Activity,
  Bell,
  Settings,
  LogOut,
  Cog,
  Search,
  Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const Route = createFileRoute("/_app")({
  component: AppShell,
});

function AppShell() {
  const { session, isLoading, role, profile } = useAuth();
  const { can, isSuperAdmin, isCompanyAdmin } = usePermissions();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !session) {
      navigate({ to: "/login", replace: true });
    }
  }, [isLoading, session, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  if (isLoading || !session) {
    return null; // Will redirect or show root loader
  }

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard", show: true },
    { label: "Documents", icon: FileText, path: "/documents", show: can("view") },
    { label: "Parties", icon: Building2, path: "/parties", show: can("manage_parties") || can("view") },
    { label: "Parts & Drawings", icon: Box, path: "/parts", show: can("manage_documents") || can("view") },
    { label: "Users", icon: Users, path: "/users", show: can("manage_users") },
    { label: "Roles & Permissions", icon: Shield, path: "/roles", show: can("manage_roles") },
    { label: "Audit Logs", icon: Activity, path: "/audit-logs", show: can("view_audit") },
    { label: "Notifications", icon: Bell, path: "/notifications", show: true },
    { label: "Settings", icon: Settings, path: "/settings", show: can("manage_settings") || true },
  ];

  const filteredNavItems = navItems.filter((item) => item.show);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-[#293033] text-slate-300 shadow-md border-b border-[#333d48]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo and Primary Nav */}
            <div className="flex items-center gap-8">
              {/* Logo removed as it duplicates the ERP shell branding */}
              
              <nav className="hidden md:flex items-center gap-1">
                {filteredNavItems.map((item) => (
                  <Link
                    key={item.label}
                    to={item.path}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-[#333d48] hover:text-white transition-colors [&.active]:bg-[#ff6600] [&.active]:text-white"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>

            {/* Removed Right side actions as they duplicate the main ERP shell */}
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 w-full mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
