import { createContext, useContext, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { Profile, Role } from "@/vault/lib/api";

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
  const [state] = useState<AuthState>({
    session: { 
      access_token: 'mock-token', 
      refresh_token: 'mock-token', 
      expires_in: 3600, 
      expires_at: Date.now() + 3600000,
      token_type: 'bearer',
      user: { id: 'mock-user-123', email: 'admin@company.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' } 
    } as any,
    user: { id: 'mock-user-123', email: 'admin@company.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' } as any,
    profile: { id: 'mock-user-123', email: 'admin@company.com', full_name: 'Super Admin', department: 'Engineering', user_id: 'mock-user-123', created_at: '', updated_at: '', avatar_url: '' } as any,
    role: { id: 'mock-role-id', name: 'Super Admin', is_system_role: true, permissions: { 'manage_all': true }, created_at: '' } as any,
    isLoading: false,
  });

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
