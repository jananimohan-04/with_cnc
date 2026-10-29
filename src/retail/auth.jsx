/* Auth — mirrors legacy js/auth.js + loginAs behavior exactly. */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getSession, setSession, setGoogleToken, googleToken, api, API_BASE } from './api';

const apiUrl = (p) => (API_BASE ? `${API_BASE}${p}` : p);

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const DEMO = {
  super_admin: { role: 'super_admin', name: 'Janani Mohan', companyId: null, email: 'jananimohan44@gmail.com' },
  super_admin_argus: { role: 'super_admin', name: 'Technologies Argus', companyId: null, email: 'technologiesargus@gmail.com' },
  company_admin: { role: 'company_admin', name: 'argus', companyId: 'C-ARGUS', email: 'argushexadoc2021@gmail.com' },
  content_writer: { role: 'content_writer', name: 'Content Writer', companyId: 'C-ARGUS', email: 'content.writer@arguscnc.com' },
  finance: { role: 'finance', name: 'Finance Reviewer', companyId: 'C-ARGUS', email: 'finance@arguscnc.com' },
  sales_regional_partner: { role: 'sales_regional_partner', name: 'Regional Partner (+10%)', companyId: 'C-ARGUS', email: 'regional.partner@arguscnc.com', markupPct: 10, salesTier: 'Regional Partner' },
  sales_channel_partner: { role: 'sales_channel_partner', name: 'Channel Partner (+15%)', companyId: 'C-ARGUS', email: 'channel.partner@arguscnc.com', markupPct: 15, salesTier: 'Channel Partner' },
  sales_referral_partner: { role: 'sales_referral_partner', name: 'Referral Partner (+5%)', companyId: 'C-ARGUS', email: 'referral.partner@arguscnc.com', markupPct: 5, salesTier: 'Referral Partner' },
  sales_user: { role: 'sales_user', name: 'janani (Direct Sales)', companyId: 'C-ARGUS', email: 'jananimohan1604@gmail.com', markupPct: 0 }
};

export function AuthProvider({ children }) {
  const [me, setMe] = useState(() => getSession());
  const [ready, setReady] = useState(true);
  const [oauth, setOauth] = useState(null); // supabase client or null
  const resolved = useRef(false);

  const refreshPermissions = useCallback(async () => {
    try {
      const cur = getSession();
      if (!cur) return;
      const t = googleToken();
      const cid = cur.role === 'super_admin' ? (cur.companyId || '') : (cur.companyId || 'C-ARGUS');
      const r = await fetch(apiUrl('/api/me'), {
        headers: {
          'Content-Type': 'application/json',
          'x-role': cur.role || 'sales_user',
          'x-company-id': cid,
          'x-user-name': cur.name || '',
          'x-user-email': cur.email || '',
          'x-user-id': cur.id || '',
          ...(t ? { Authorization: 'Bearer ' + t } : {})
        }
      });
      const j = await r.json().catch(() => ({}));
      const u = (j && j.data) || {};
      if (u && u.role) {
        setMe(prev => {
          const updated = {
            ...(prev || cur),
            ...u,
            effectivePermissions: u.effectivePermissions || [],
            menuOverrides: u.menuOverrides || {},
            globalDisabledMenus: u.globalDisabledMenus || []
          };
          setSession(updated);
          return updated;
        });
      }
    } catch (e) {
      console.warn('refreshPermissions error', e);
    }
  }, []);

  const resolveMe = useCallback(async (token) => {
    const r = await fetch(apiUrl('/api/me'), { headers: { Authorization: 'Bearer ' + (token || '') } });
    const j = await r.json().catch(() => ({}));
    const u = (j && j.data) || {};
    if (!u.role) throw new Error('no role');
    const s = {
      id: u.id,
      role: u.role,
      companyId: u.companyId,
      name: u.name || 'User',
      email: u.email || '',
      google: true,
      salesTier: u.salesTier,
      markupPct: u.markupPct,
      termsAccepted: u.termsAccepted,
      effectivePermissions: u.effectivePermissions || [],
      menuOverrides: u.menuOverrides || {},
      globalDisabledMenus: u.globalDisabledMenus || []
    };
    setSession(s);
    setMe(s);
    return s;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(apiUrl('/api/config'));
        const j = await r.json();
        const cfg = (j && j.data) || {};
        if (cfg.googleEnabled && cfg.supabaseUrl && cfg.publishableKey) {
          const client = createClient(cfg.supabaseUrl, cfg.publishableKey);
          setOauth(client);
          const { data } = await client.auth.getSession();
          if (data && data.session) {
            setGoogleToken(data.session.access_token);
            if (!resolved.current) { resolved.current = true; await resolveMe(data.session.access_token).catch(() => {}); }
          }
          client.auth.onAuthStateChange(async (ev, sess) => {
            if ((ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') && sess) {
              setGoogleToken(sess.access_token);
              resolved.current = true;
              await resolveMe(sess.access_token).catch(() => {});
            }
            if (ev === 'SIGNED_OUT') {
              setGoogleToken(null); setSession(null); setMe(null); resolved.current = false;
            }
          });
        } else {
          // If in demo/local mode and we have a session, refresh permissions from server
          await refreshPermissions();
        }
      } catch { /* offline demo continues */ }
      setReady(true);
    })();
  }, [resolveMe, refreshPermissions]);

  const loginAs = useCallback(async (role) => {
    const s = { ...DEMO[role] };
    setSession(s);
    setMe(s);
    try {
      const res = await fetch(apiUrl('/api/me'), {
        headers: {
          'x-role': s.role,
          'x-company-id': s.role === 'super_admin' ? '' : (s.companyId || 'C-ARGUS'),
          'x-user-name': s.name || '',
          'x-user-email': s.email || ''
        }
      });
      const j = await res.json().catch(() => ({}));
      if (j && j.data) {
        const full = { ...s, ...j.data };
        setSession(full);
        setMe(full);
        return full;
      }
    } catch {}
    return s;
  }, []);

  const googleLogin = useCallback(async () => {
    if (!oauth) throw new Error('Google login not configured yet');
    const redirectUrl = window.location.origin + window.location.pathname;
    const { error } = await oauth.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl } });
    if (error) throw error;
  }, [oauth]);

  const logout = useCallback(async () => {
    try { if (oauth) await oauth.auth.signOut(); } catch { /* noop */ }
    setGoogleToken(null);
    setSession(null);
    setMe(null);
    resolved.current = false;
  }, [oauth]);

  const loginAsEmail = useCallback(async (email) => {
    email = (email || '').trim().toLowerCase();
    try {
      const res = await fetch(apiUrl('/api/me'), {
        headers: {
          'x-user-email': email
        }
      });
      const j = await res.json().catch(() => ({}));
      if (j && j.data && j.data.role) {
        const full = { ...j.data, google: false };
        setSession(full);
        setMe(full);
        return full;
      }
    } catch (e) {
      console.warn('loginAsEmail error', e);
    }
    return null;
  }, []);

  return <AuthCtx.Provider value={{ me, ready, oauthReady: !!oauth, loginAs, loginAsEmail, googleLogin, logout, resolveMe, setMe, refreshPermissions }}>{children}</AuthCtx.Provider>;
}
