/* Global Company Context for Super Admin cross-tenant filtering */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';

const CompanyCtx = createContext({
  activeCompany: 'all',
  setActiveCompany: () => {},
  companies: [],
  activeCompanyObj: null,
  refreshCompanies: () => {}
});

export const useCompany = () => useContext(CompanyCtx);

export function CompanyProvider({ children }) {
  const [activeCompany, setActiveCompanyState] = useState(() => {
    return localStorage.getItem('super_active_company') || 'all';
  });
  const [companies, setCompanies] = useState([]);

  const loadCompanies = useCallback(async () => {
    try {
      const d = await api.get('/api/companies?limit=200');
      const list = Array.isArray(d) ? d : (d?.rows || []);
      setCompanies(list);
    } catch (e) {
      // Non-super-admin sessions lack company hub permission; default safely to []
      setCompanies([]);
    }
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const setActiveCompany = (id) => {
    const val = id || 'all';
    setActiveCompanyState(val);
    if (val === 'all') {
      localStorage.removeItem('super_active_company');
    } else {
      localStorage.setItem('super_active_company', val);
    }
  };

  const activeCompanyObj = activeCompany === 'all' 
    ? null 
    : (companies.find(c => c.id === activeCompany) || null);

  return (
    <CompanyCtx.Provider value={{
      activeCompany,
      setActiveCompany,
      companies,
      activeCompanyObj,
      refreshCompanies: loadCompanies
    }}>
      {children}
    </CompanyCtx.Provider>
  );
}
