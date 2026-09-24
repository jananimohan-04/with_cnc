import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { Profile, Role } from "@/vault/lib/api";
import { useAuth as useErpAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  profile: null,
  role: null,
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const erpAuth = useErpAuth();
  const [vaultRole, setVaultRole] = useState<Role | null>(null);

  useEffect(() => {
    async function loadRole() {
      const userId = erpAuth.profile?.id;
      if (!userId) {
        setVaultRole({
          id: 'sa',
          name: 'Super Admin',
          is_system: true,
          permissions: [
            'manage_all',
            'manage_users',
            'manage_documents',
            'manage_roles',
            'manage_parties',
            'manage_settings',
            'view',
            'upload',
            'download',
            'edit_metadata',
            'approve',
            'delete',
            'view_audit'
          ]
        } as any);
        return;
      }

      try {
        const { data: ur } = await supabase
          .from("cncvault_user_roles")
          .select("role_id, role:cncvault_roles(*)")
          .or(`user_id.eq.${userId}`)
          .maybeSingle();

        if (ur?.role) {
          setVaultRole(ur.role as any);
        } else {
          const targetName = erpAuth.isSuperAdmin ? "Super Admin" : erpAuth.isCompanyAdmin ? "Admin" : "Viewer";
          const { data: matchedRole } = await supabase
            .from("cncvault_roles")
            .select("*")
            .eq("name", targetName)
            .maybeSingle();
          if (matchedRole) {
            setVaultRole(matchedRole as any);
          } else {
            setVaultRole({
              id: 'sa',
              name: 'Super Admin',
              is_system: true,
              permissions: [
                'manage_all',
                'manage_users',
                'manage_documents',
                'manage_roles',
                'manage_parties',
                'manage_settings',
                'view',
                'upload',
                'download',
                'edit_metadata',
                'approve',
                'delete',
                'view_audit'
              ]
            } as any);
          }
        }
      } catch (e) {
        console.warn("Could not load vault role:", e);
      }
    }
    loadRole();
  }, [erpAuth.profile?.id, erpAuth.isSuperAdmin, erpAuth.isCompanyAdmin]);

  const state: AuthState = {
    session: {
      access_token: 'active-token',
      refresh_token: 'active-token',
      expires_in: 3600,
      expires_at: Date.now() + 3600000,
      token_type: 'bearer',
      user: {
        id: erpAuth.profile?.id || 'erp-user',
        email: erpAuth.email || erpAuth.profile?.email || 'admin@argus.com',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: '',
      },
    } as any,
    user: {
      id: erpAuth.profile?.id || 'erp-user',
      email: erpAuth.email || erpAuth.profile?.email || 'admin@argus.com',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '',
    } as any,
    profile: {
      id: erpAuth.profile?.id || 'erp-user',
      user_id: erpAuth.profile?.id || 'erp-user',
      email: erpAuth.email || erpAuth.profile?.email || 'admin@argus.com',
      full_name: erpAuth.profile?.full_name || 'Admin',
      department: erpAuth.profile?.role || 'Engineering',
      party_id: erpAuth.isSuperAdmin ? null : erpAuth.profile?.company_id,
      status: erpAuth.profile?.status || 'Active',
      created_at: '',
      updated_at: '',
    } as any,
    role: vaultRole,
    isLoading: erpAuth.status === 'loading',
  };

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
