import { createContext, useContext, ReactNode } from "react";
import { useAuth as useMainErpAuth } from "@/contexts/AuthContext";

// Bridge the Main ERP auth into the Vault's auth shape so all vault components work unchanged.
type AuthState = {
  session: any;
  user: any;
  profile: any;
  role: any;
  isLoading: boolean;
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  profile: null,
  role: null,
  isLoading: true,
});

/**
 * AuthProvider bridges the Main ERP's AuthContext into the Vault's expected shape.
 * No separate user tables — same users, same login, same session.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const mainAuth = useMainErpAuth();

  // Map the Main ERP profile to what the vault components expect
  const bridgedState: AuthState = {
    session: mainAuth.status === 'authorized' ? { access_token: 'erp-session', token_type: 'bearer' } : null,
    user: mainAuth.profile ? {
      id: mainAuth.profile.id,
      email: mainAuth.profile.email,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '',
    } : null,
    profile: mainAuth.profile ? {
      id: mainAuth.profile.id,
      email: mainAuth.profile.email,
      full_name: mainAuth.profile.full_name,
      department: 'Engineering',
      user_id: mainAuth.profile.id,
      created_at: '',
      updated_at: '',
      avatar_url: '',
      // Super Admin & Company Admin get full vault access; regular users get viewer access
      party_id: mainAuth.isSuperAdmin ? null : (mainAuth.company?.id || null),
    } : null,
    role: {
      id: 'erp-role',
      name: mainAuth.isSuperAdmin ? 'Super Admin' : mainAuth.isCompanyAdmin ? 'Admin' : 'Viewer',
      is_system_role: true,
      permissions: mainAuth.isSuperAdmin || mainAuth.isCompanyAdmin
        ? { manage_all: true }
        : ['view', 'download'],
      created_at: '',
    },
    isLoading: mainAuth.status === 'loading',
  };

  return <AuthContext.Provider value={bridgedState}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
