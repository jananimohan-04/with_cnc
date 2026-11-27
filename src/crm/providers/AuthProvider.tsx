import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useAuth as useBiAuth } from "@/contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { setCrmSession } from "../lib/api";
import { clearPeople } from "../backend/core";
import type { CompanyWithRole, Profile, Role } from "../lib/types";

// Inside BI the Leads CRM has no sign-in of its own: the person is BI's signed-in user, the company is the one
// selected in BI, and the CRM role comes from the database (crm_role: BI admins are owners; others get the role set
// on the CRM Team page, or "salesperson" when BI Access Management gives them Leads CRM).

export type AuthStatus = "loading" | "signedOut" | "signedIn";

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: { id: string; email: string | null } | null;
  profile: Profile | null;
  companies: CompanyWithRole[];
  companyId: string | null;
  currentCompany: CompanyWithRole | null;
  role: Role | null;
  configProblem: string | null;
  needsCompany: boolean;
  /** signed in to BI, but no Leads CRM access in this company */
  noAccess: boolean;
  refreshing: boolean;

  refreshCompanies: () => Promise<CompanyWithRole[]>;
  selectCompany: (id: string) => void;
  updateProfile: (patch: { full_name?: string; avatar_url?: string | null }) => Promise<void>;

  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const managedInBi = async () => {
  throw new Error("Sign-in is managed by BI.");
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const bi = useBiAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const companyId = bi.company?.id ?? null;

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadRole = useCallback(async () => {
    if (!companyId || !session) { setRole(null); setCrmSession({ companyId: null, role: null }); setRoleLoaded(!!session || bi.status !== "loading"); return; }
    setRoleLoaded(false);
    const { data, error } = await supabase.rpc("crm_role", { p_company_id: companyId });
    const r = !error && data ? (data as Role) : null;
    setRole(r);
    setCrmSession({ companyId, role: r });
    clearPeople(companyId);
    setRoleLoaded(true);
  }, [companyId, session, bi.status]);

  useEffect(() => { void loadRole(); }, [loadRole]);

  const currentCompany = useMemo<CompanyWithRole | null>(() => {
    if (!bi.company || !role) return null;
    const c = bi.company as unknown as { id: string; company_name: string; code?: string | null; industry?: string | null; phone?: string | null; status?: string | null; created_at?: string | null };
    const now = new Date().toISOString();
    return {
      id: c.id, name: c.company_name, slug: (c.code || c.company_name || "company").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      owner_id: "", industry: c.industry ?? null, website: null, phone: c.phone ?? null, address: null,
      timezone: "Asia/Kolkata", currency: "INR", logo_url: null, is_active: (c.status ?? "Active") === "Active",
      created_at: c.created_at ?? now, updated_at: now, role,
    };
  }, [bi.company, role]);

  const profile = useMemo<Profile | null>(() => {
    if (!session) return null;
    const p = bi.profile as unknown as { full_name?: string | null; email?: string | null } | null;
    return {
      id: session.user.id,
      email: p?.email ?? session.user.email ?? null,
      full_name: p?.full_name ?? (session.user.user_metadata?.full_name as string | undefined) ?? null,
      avatar_url: (session.user.user_metadata?.avatar_url as string | undefined) ?? null,
    };
  }, [session, bi.profile]);

  const status: AuthStatus = bi.status === "loading" || (session === null && bi.status === "authorized") ? "loading"
    : bi.status === "authorized" ? "signedIn" : "signedOut";

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session,
    user: session?.user ? { id: session.user.id, email: session.user.email ?? null } : null,
    profile,
    companies: currentCompany ? [currentCompany] : [],
    companyId: currentCompany ? companyId : null,
    currentCompany,
    role,
    configProblem: null,
    needsCompany: status === "signedIn" && !companyId,
    noAccess: status === "signedIn" && !!companyId && roleLoaded && !role,
    refreshing: status === "signedIn" && !!companyId && !roleLoaded,
    refreshCompanies: async () => { await loadRole(); return currentCompany ? [currentCompany] : []; },
    selectCompany: () => { /* the company is chosen in BI's top bar */ },
    updateProfile: managedInBi,
    signIn: managedInBi,
    signUp: async () => { await managedInBi(); return { needsConfirmation: false }; },
    signOut: async () => { await bi.signOut(); },
    sendPasswordReset: managedInBi,
  }), [status, session, profile, currentCompany, companyId, role, roleLoaded, loadRole, bi]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
