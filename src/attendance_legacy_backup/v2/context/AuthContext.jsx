// AI Attendance sign-in state. Same shape as the attendance pages expect (user, organization, loading,
// logout, updateOrganization ...), but it comes from the BI sign-in: the organization is the active BI
// company and the role follows the BI role. Extra details (employee link, page permissions, company
// settings such as work hours / geofence / logo) are read from the attendance server's /auth/me.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth as useBiAuth } from '@/contexts/AuthContext';
import api, { getAuthToken } from '../utils/api';

const AuthContext = createContext(/** @type {any} */ (null));

const biRoleToAttendanceRole = (role) =>
  role === 'SUPER_ADMIN' || role === 'COMPANY_ADMIN' ? 'org_admin' : 'employee';

const notAvailable = async () => {
  throw new Error('Sign in from the main sign-in screen.');
};

export const AuthProvider = ({ children }) => {
  const bi = useBiAuth();
  const { profile, company, status, signOut } = bi;
  const [me, setMe] = useState(null); // { user, organization } from the attendance server
  const [orgOverrides, setOrgOverrides] = useState(null);
  const [meLoading, setMeLoading] = useState(true);
  const [token, setToken] = useState(null);

  const companyId = company?.id || null;
  const profileId = profile?.id || null;

  const loadMe = useCallback(async () => {
    if (status !== 'authorized' || !profileId) {
      setMe(null);
      setMeLoading(false);
      return;
    }
    setMeLoading(true);
    getAuthToken().then(setToken).catch(() => setToken(null));
    try {
      const res = await api.get('/auth/me');
      setMe(res.data && typeof res.data === 'object' ? res.data : null);
    } catch (err) {
      // The BI sign-in still holds: carry on with what BI knows.
      console.error('Attendance profile lookup failed', err);
      setMe(null);
    } finally {
      setMeLoading(false);
    }
  }, [status, profileId, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setOrgOverrides(null);
    loadMe();
  }, [loadMe]);

  const user = useMemo(() => {
    if (status !== 'authorized' || !profile) return null;
    const serverUser = (me && me.user) || {};
    return {
      ...serverUser,
      id: serverUser.id || profile.id,
      email: serverUser.email || profile.email,
      name: serverUser.name || profile.full_name || (profile.email ? profile.email.split('@')[0] : ''),
      role: biRoleToAttendanceRole(profile.role),
      bi_role: profile.role,
      is_super_admin: profile.role === 'SUPER_ADMIN',
    };
  }, [status, profile, me]);

  const organization = useMemo(() => {
    if (status !== 'authorized') return null;
    const serverOrg = (me && me.organization) || {};
    if (!company && !me?.organization) return null;
    return {
      ...serverOrg,
      ...(orgOverrides || {}),
      id: company?.id || serverOrg.id,
      name: company?.company_name || serverOrg.name,
      slug: company?.code || serverOrg.slug || company?.id || serverOrg.id,
    };
  }, [status, company, me, orgOverrides]);

  const setOrganization = useCallback((next) => {
    setOrgOverrides((prev) => (typeof next === 'function' ? next(prev) : next));
  }, []);

  const updateOrganization = useCallback((newOrgData) => {
    setOrgOverrides((prev) => ({ ...(prev || {}), ...(newOrgData || {}) }));
  }, []);

  const logout = useCallback(() => {
    setMe(null);
    setOrgOverrides(null);
    void signOut();
  }, [signOut]);

  const value = {
    user,
    organization,
    setOrganization,
    updateOrganization,
    loading: status === 'loading' || meLoading,
    token,
    refresh: loadMe,
    login: notAvailable,
    registerOrg: notAvailable,
    googleLogin: notAvailable,
    googleRegisterOrg: notAvailable,
    faceLogin: notAvailable,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
