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
  isLoading: false,
});

/**
 * AuthProvider bridges the Main ERP's AuthContext into the Vault's expected shape.
 * No separate user tables — same users, same login, same session.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  let mainAuth: any = null;
  try {
    mainAuth = useMainErpAuth();
  } catch (e) {
    // If rendered outside ERP AuthProvider
    mainAuth = null;
  }

  const profile = mainAuth?.profile;
  const isSuperAdmin = mainAuth?.isSuperAdmin ?? true;
  const isCompanyAdmin = mainAuth?.isCompanyAdmin ?? false;

  const userObj = {
    id: profile?.id || 'erp-user-1',
    email: profile?.email || mainAuth?.email || 'admin@argustech.com',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '',
  };

  const bridgedState: AuthState = {
    session: {
      access_token: 'erp-session',
      token_type: 'bearer',
      user: userObj,
    },
    user: userObj,
    profile: {
      id: profile?.id || 'erp-user-1',
      email: profile?.email || mainAuth?.email || 'admin@argustech.com',
      full_name: profile?.full_name || 'Janani Mohan',
      department: 'Engineering',
      user_id: profile?.id || 'erp-user-1',
      created_at: '',
      updated_at: '',
      avatar_url: '',
      party_id: isSuperAdmin ? null : (mainAuth?.company?.id || null),
    },
    role: {
      id: 'erp-role',
      name: isSuperAdmin ? 'Super Admin' : isCompanyAdmin ? 'Admin' : 'Viewer',
      is_system_role: true,
      permissions: isSuperAdmin || isCompanyAdmin
        ? { manage_all: true }
        : ['view', 'download'],
      created_at: '',
    },
    isLoading: false,
  };

  return <AuthContext.Provider value={bridgedState}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
