import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, Edit, Edit2, Trash2, Users as UsersIcon, Building2, ShieldCheck, Settings as SettingsIcon, FileText, ChevronDown, ChevronRight, Search, Lock, KeyRound, Plus, Download, Upload, Power, Briefcase, Store, CheckSquare, Square, Check, X, Layers, SlidersHorizontal, CheckCircle2, AlertCircle } from 'lucide-react';
import { fetchJobDescriptions, createJobDescription, EMPTY_JD, type JobDescription } from '@/lib/jdBuild';
import { fetchUserJdMap, saveUserJd, getUserJdId } from '@/lib/userJd';
import { JobDescriptionModal, JobDescriptionViewModal, JobDescriptionFormFields, toDraft, fromDraft, type JdDraft } from '@/components/admin/JobDescriptionModal';
import { NEVER_OFF, fetchDisabledModules, setModuleOff } from '@/lib/moduleSwitches';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, Button, StatCard } from '@/components/ui/Card';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { supabase } from '@/lib/supabase';
import { exportCsv } from '@/lib/reportExport';
import { todayISO } from '@/lib/format';
import { useAuth, type ErpRole } from '@/contexts/AuthContext';
import { useHeaderKpis } from '@/contexts/HeaderKpiContext';
import { isTauri } from '@/lib/desktop/isTauri';
import { UpdatesSettingsPage } from '@/components/desktop/UpdatesSettingsPage';
import { DocumentProfilePage } from '@/pages/quotation/CompanyProfilePage';
import { ProfilesCreatedPanel } from '@/pages/admin/ProfilesCreatedPanel';
import { RetailRolesPanel } from '@/pages/admin/RetailRolesPanel';
import {
  ADMIN_RESERVED_MODULES, MODULE_CATALOG, PERM_CATEGORIES, VISIBLE_MODULES,
  emptyMatrix, fullMatrix, matrixToPayload, rowsToMatrix,
  type PermAction, type PermMatrix,
} from '@/config/permissions';
import { MENU_CATALOG } from '@/retail/menuCatalog';
import { api as retailApi } from '@/retail/api';

// ---------------------------------------------------------------------------------------
// Users and companies are read through RLS and written ONLY through the erp_save_user /
// erp_save_company database functions, which enforce every role and company rule.
// The checks in this file just keep the UI from offering actions that would be refused.
// ---------------------------------------------------------------------------------------

interface CompanyRow {
  id: string;
  company_name: string;
  code: string | null;
  status: 'Active' | 'Inactive';
  created_at: string;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: ErpRole;
  status: 'Active' | 'Inactive';
  company_id: string | null;
  last_login_at: string | null;
  created_at: string;
  company_name: string;
  mobile?: string | null;
  retail_role?: string | null;
}

/** A Retail Store role (sales partner tier, content writer, finance...), kept by the Retail Store backend. */
interface RetailRole { id: string; name: string; category?: string; markupPct?: number; requireTerms?: boolean; terms?: string; active?: boolean }

const ROLE_LABELS: Record<ErpRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  COMPANY_ADMIN: 'Company Admin',
  USER: 'User',
};

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function useCompanies() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('companies').select('id, company_name, code, status, created_at').order('company_name');
    if (error) console.error('Failed to load companies:', error);
    setCompanies((data as CompanyRow[]) || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  return { companies, reload: load };
}

// ======================================================================================
// User Management
// ======================================================================================

const emptyUserForm = { id: null as string | null, full_name: '', email: '', role: 'USER' as ErpRole, status: 'Active' as 'Active' | 'Inactive', company_id: '', mobile: '', retail_role: '', terms: false };

export function UsersPage({ embeddedCompanyId }: { embeddedCompanyId?: string } = {}) {
  const navigate = useNavigate();
  const { profile, company, isSuperAdmin, isCompanyAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const { companies } = useCompanies();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyFilter, setCompanyFilter] = useState<string>(() => embeddedCompanyId ?? searchParams.get('company') ?? company?.id ?? '');
  const [form, setForm] = useState(emptyUserForm);
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<UserRow | null>(null);
  const [toDelete, setToDelete] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [retailRoles, setRetailRoles] = useState<RetailRole[]>([]);
  const [showRoles, setShowRoles] = useState(false);
  const loadRetailRoles = useCallback(async () => {
    const keep = (rows: RetailRole[]) => (rows || []).filter(x => x.id !== 'super_admin' && x.id !== 'company_admin' && x.active !== false);
    const { data, error } = await supabase.from('retail_roles').select('id, name, category, markup_pct, require_terms, terms, active').order('name');
    if (!error && data && data.length) {
      setRetailRoles(keep((data as any[]).map(x => ({ id: x.id, name: x.name, category: x.category, markupPct: Number(x.markup_pct) || 0, requireTerms: !!x.require_terms, terms: x.terms, active: x.active }))));
      return;
    }
    // table not created yet / still empty: the roles held by the Retail Store
    retailApi.get('/api/roles').then((rows: RetailRole[]) => setRetailRoles(keep(rows))).catch(() => setRetailRoles([]));
  }, []);
  useEffect(() => { void loadRetailRoles(); }, [loadRetailRoles]);

  // Job Description state
  const [allJds, setAllJds] = useState<JobDescription[]>([]);
  const [userJdMap, setUserJdMap] = useState<Record<string, string>>({});
  const [selectedJdId, setSelectedJdId] = useState<string | null>(null);
  const [showJdFormInline, setShowJdFormInline] = useState(false);
  const [jdDraft, setJdDraft] = useState<JdDraft>(() => toDraft(EMPTY_JD));
  const [showJdModal, setShowJdModal] = useState(false);
  const [editingJdForModal, setEditingJdForModal] = useState<JobDescription | 'new' | null>(null);
  const [viewingJd, setViewingJd] = useState<JobDescription | null>(null);
  const [targetUserForJd, setTargetUserForJd] = useState<UserRow | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const [usersRes, jdsRes, mapRes] = await Promise.all([
      supabase
        .from('company_users')
        .select('id, email, full_name, role, status, company_id, last_login_at, created_at, companies!company_users_company_id_fkey(company_name)')
        .order('created_at', { ascending: false }),
      fetchJobDescriptions().catch(() => []),
      fetchUserJdMap().catch(() => ({})),
    ]);
    if (usersRes.error) console.error('Failed to load users:', usersRes.error);
    // mobile + Retail Store role live in extra columns; a failed read (migration not applied yet) just leaves them empty
    const extra = await supabase.from('company_users').select('id, mobile, retail_role');
    const extraById = new Map(((extra.error ? [] : extra.data) as any[]).map(x => [x.id, x]));
    setUsers(((usersRes.data as any[]) || []).map(u => ({ ...u, mobile: extraById.get(u.id)?.mobile ?? null, retail_role: extraById.get(u.id)?.retail_role ?? null, company_name: u.companies?.company_name ?? (u.role === 'SUPER_ADMIN' ? 'All companies' : '—') })));
    setAllJds(jdsRes);
    setUserJdMap(mapRes);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const visibleUsers = useMemo(
    () => (embeddedCompanyId ? users.filter(u => u.company_id === embeddedCompanyId)
      : isSuperAdmin && companyFilter ? users.filter(u => u.company_id === companyFilter || u.role === 'SUPER_ADMIN') : users),
    [users, companyFilter, isSuperAdmin, embeddedCompanyId],
  );

  // A Super Admin may edit anyone except themselves (self-edit stays blocked
  // so nobody can accidentally remove their own Super Admin access).
  const canEdit = (u: UserRow) =>
    u.id !== profile?.id && (isSuperAdmin || (isCompanyAdmin && u.role !== 'SUPER_ADMIN' && u.company_id === profile?.company_id));

  const openCreate = () => {
    setForm({ ...emptyUserForm, company_id: isSuperAdmin ? companyFilter || company?.id || '' : profile?.company_id ?? '' });
    setSelectedJdId(null);
    setShowJdFormInline(false);
    setJdDraft(toDraft({ ...EMPTY_JD, title: '' }));
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (u: UserRow) => {
    setForm({ id: u.id, full_name: u.full_name, email: u.email, role: u.role, status: u.status, company_id: u.company_id ?? '', mobile: u.mobile ?? '', retail_role: u.retail_role ?? '', terms: false });
    const currentJdId = getUserJdId(userJdMap, u);
    setSelectedJdId(currentJdId);
    setShowJdFormInline(false);
    const existing = allJds.find(j => j.id === currentJdId);
    if (existing) {
      setJdDraft(toDraft(existing));
    } else {
      setJdDraft(toDraft({ ...EMPTY_JD, title: u.full_name ? `${u.full_name} - Role` : '' }));
    }
    setFormError(null);
    setShowForm(true);
  };

  const openAssignJdForUser = (u: UserRow) => {
    setTargetUserForJd(u);
    const currentJdId = getUserJdId(userJdMap, u);
    const existing = allJds.find(j => j.id === currentJdId);
    if (existing) {
      setEditingJdForModal(existing);
    } else {
      setEditingJdForModal('new');
    }
    setShowJdModal(true);
  };

  const handleJdSaved = async (savedJd: JobDescription) => {
    setAllJds(prev => {
      const exists = prev.some(j => j.id === savedJd.id);
      return exists ? prev.map(j => (j.id === savedJd.id ? savedJd : j)) : [savedJd, ...prev];
    });

    if (showForm) {
      setSelectedJdId(savedJd.id);
      setShowJdFormInline(false);
    }

    if (targetUserForJd) {
      await saveUserJd(targetUserForJd.id, targetUserForJd.email, savedJd.id, targetUserForJd.company_id);
      setUserJdMap(prev => ({
        ...prev,
        [targetUserForJd.id]: savedJd.id,
        [targetUserForJd.email.toLowerCase()]: savedJd.id,
      }));
      setTargetUserForJd(null);
    }
  };

  const save = async (next: typeof emptyUserForm) => {
    setSaving(true);
    setFormError(null);
    const { data: savedData, error } = await supabase.rpc('erp_save_user', {
      p_id: next.id,
      p_email: next.email,
      p_full_name: next.full_name,
      p_role: next.role,
      p_status: next.status,
      // Company Admins never choose a company: the database uses their own.
      // Super Admin accounts span all companies: no company is sent.
      p_company_id: isSuperAdmin && next.role !== 'SUPER_ADMIN' ? next.company_id || null : null,
    });
    if (error) {
      setSaving(false);
      setFormError(error.message);
      return { error: error.message, data: null };
    }
    // Retail Store details (mobile, Retail Store role): saved with the user; a failure here never undoes the user itself
    const savedId = next.id || (savedData as any)?.id;
    if (savedId) {
      const { error: dErr } = await supabase.rpc('erp_save_user_details', {
        p_id: savedId,
        p_data: { mobile: next.mobile, retail_role: next.role === 'USER' ? next.retail_role : '', terms_accepted: next.terms || undefined },
      });
      if (dErr) console.warn('Could not save the mobile / Retail Store role (apply the company hub migration):', dErr.message);
    }
    // the person is also set up in the Retail Store right away (otherwise it happens on their first login)
    const retailRole = next.role === 'SUPER_ADMIN' ? 'super_admin' : next.role === 'COMPANY_ADMIN' ? 'company_admin' : next.retail_role;
    if (!next.id && retailRole) {
      const co = companies.find(c => c.id === (next.company_id || profile?.company_id));
      try {
        await retailApi.post('/api/users', {
          name: next.full_name || next.email.split('@')[0], email: next.email, mobile: next.mobile, role: retailRole,
          companyId: next.role === 'SUPER_ADMIN' ? null : (co?.code || co?.id), termsAccepted: next.terms || retailRoles.find(x => x.id === retailRole)?.requireTerms === false,
        });
      } catch { /* created on their first login instead */ }
    }
    setSaving(false);
    await loadUsers();
    return { error: null, data: savedData };
  };

  const handleSubmit = async () => {
    if (!form.email.trim()) { setFormError('Google account email is required'); return; }
    if (form.role === 'USER' && form.retail_role && retailRoles.find(x => x.id === form.retail_role)?.requireTerms && !form.terms && !form.id) { setFormError('Accept the sales terms for this Retail Store role'); return; }
    if (isSuperAdmin && form.role !== 'SUPER_ADMIN' && !form.company_id) { setFormError('Select a company'); return; }

    setSaving(true);
    setFormError(null);

    let effectiveJdId = selectedJdId;

    // If inline JD form was filled with a title, create the JD now
    if (showJdFormInline && !selectedJdId && jdDraft.title.trim()) {
      try {
        const createdJd = await createJobDescription(fromDraft(jdDraft));
        effectiveJdId = createdJd.id;
        setAllJds(prev => [createdJd, ...prev]);
      } catch (e) {
        setFormError(e instanceof Error ? e.message : 'Failed to save Job Description');
        setSaving(false);
        return;
      }
    }

    const res = await save(form);
    if (res.error) {
      setSaving(false);
      return;
    }

    const savedUserId = form.id || (res.data as any)?.id;
    const targetCompanyId = form.company_id || profile?.company_id || null;
    await saveUserJd(savedUserId, form.email, effectiveJdId, targetCompanyId);

    if (effectiveJdId) {
      setUserJdMap(prev => ({
        ...prev,
        [form.email.toLowerCase()]: effectiveJdId,
        ...(savedUserId ? { [savedUserId]: effectiveJdId } : {}),
      }));
    } else {
      setUserJdMap(prev => {
        const nextMap = { ...prev };
        delete nextMap[form.email.toLowerCase()];
        if (savedUserId) delete nextMap[savedUserId];
        return nextMap;
      });
    }

    setSaving(false);
    setShowForm(false);
  };

  // Permanent: removes the BI user and their Google sign-in (erp_delete_user enforces who may do this).
  const confirmDeleteUser = async () => {
    if (!toDelete) return;
    setDeleting(true); setDeleteError(null);
    const { error } = await supabase.rpc('erp_delete_user', { p_id: toDelete.id });
    setDeleting(false);
    if (error) { setDeleteError(error.message); return; }
    setToDelete(null);
    await loadUsers();
  };

  const columns: Column<UserRow>[] = [
    { key: 'full_name', label: 'Name', sortable: true, render: (r) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
          {(r.full_name || r.email).slice(0, 2).toUpperCase()}
        </div>
        <p className="font-medium text-slate-800">{r.full_name || <span className="text-slate-400 italic">Not signed in yet</span>}</p>
      </div>
    )},
    { key: 'email', label: 'Email', sortable: true, render: (r) => <span className="text-sm text-slate-600">{r.email}</span> },
    { key: 'company_name', label: 'Company', sortable: true, render: (r) => <span className="text-sm text-slate-600">{r.company_name}</span> },
    { key: 'role', label: 'Role', sortable: true, render: (r) => <Badge variant={r.role === 'USER' ? 'neutral' : 'brand'}>{ROLE_LABELS[r.role]}</Badge> },
    {
      key: 'jd',
      label: 'Job Description',
      sortable: true,
      render: (r) => {
        const jdId = getUserJdId(userJdMap, r);
        const jd = allJds.find(j => j.id === jdId);
        if (jd) {
          return (
            <button
              type="button"
              onClick={() => setViewingJd(jd)}
              title={`View ${jd.title} JD`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 hover:border-orange-300 transition-all text-left group"
            >
              <Briefcase size={12} className="text-orange-600 shrink-0 group-hover:scale-110 transition-transform" />
              <span className="truncate max-w-[130px]">{jd.title}</span>
            </button>
          );
        }
        return canEdit(r) ? (
          <button
            type="button"
            onClick={() => openAssignJdForUser(r)}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md border border-dashed border-orange-300 text-orange-600 bg-orange-50/40 hover:bg-orange-100/60 transition-colors"
            title="Create or assign Job Description"
          >
            <Plus size={11} /> Create JD
          </button>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        );
      }
    },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={r.status === 'Active' ? 'success' : 'error'} dot>{r.status}</Badge> },
    { key: 'created_at', label: 'Created Date', sortable: true, render: (r) => <span className="text-xs text-slate-500">{formatDate(r.created_at)}</span> },
    {
      key: 'actions', label: 'Actions', align: 'center', render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button title="View" onClick={() => setViewing(r)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Eye size={15} /></button>
          <button
            title="Job Description"
            onClick={() => {
              const jdId = getUserJdId(userJdMap, r);
              const jd = allJds.find(j => j.id === jdId);
              if (jd) setViewingJd(jd);
              else openAssignJdForUser(r);
            }}
            className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
          >
            <Briefcase size={15} />
          </button>
          {canEdit(r) && (
            <>
              <button title="Manage access" aria-label={`Manage access for ${r.email}`} onClick={() => navigate(`/admin/access?user=${r.id}${r.company_id ? `&company=${r.company_id}` : ''}`)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"><KeyRound size={15} /></button>
              <button title="Edit" onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Edit size={15} /></button>
              {r.id !== profile?.id && <button title="Delete user" aria-label={`Delete user ${r.email}`} onClick={() => { setDeleteError(null); setToDelete(r); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={15} /></button>}
            </>
          )}
        </div>
      )
    },
  ];

  const roleOptions: ErpRole[] = isSuperAdmin ? ['SUPER_ADMIN', 'COMPANY_ADMIN', 'USER'] : ['COMPANY_ADMIN', 'USER'];
  const ownCompanyName = companies.find(c => c.id === profile?.company_id)?.company_name ?? company?.company_name ?? '';

  const [search, setSearch] = useState('');

  const searchedUsers = useMemo(() => {
    if (!search.trim()) return visibleUsers;
    const q = search.toLowerCase();
    return visibleUsers.filter(u =>
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q) ||
      (u.company_name || '').toLowerCase().includes(q)
    );
  }, [visibleUsers, search]);

  const activeCount = visibleUsers.filter(u => u.status === 'Active').length;
  const inactiveCount = visibleUsers.filter(u => u.status !== 'Active').length;

  const handleExport = () => {
    if (searchedUsers.length === 0) return;
    exportCsv(`BI_Users_${todayISO()}`, [
      ['Full Name', 'Email', 'Company', 'Role', 'Status', 'Created Date'],
      ...searchedUsers.map(u => [
        u.full_name || '',
        u.email || '',
        u.company_name || '',
        ROLE_LABELS[u.role] || u.role,
        u.status || '',
        formatDate(u.created_at),
      ]),
    ]);
  };

  const handleExportRef = useRef(handleExport);
  handleExportRef.current = handleExport;
  const openCreateRef = useRef(openCreate);
  openCreateRef.current = openCreate;

  const { setHeader, setTabActions, setHeaderCenter } = useHeaderKpis();

  useEffect(() => {
    if (embeddedCompanyId) return;   // inside a company's hub the toolbar is part of the page, not the top bar
    setHeader({ title: 'User Management' });
    setHeaderCenter(
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-xs">
          <UsersIcon size={11} className="text-slate-600" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total:</span>
          <span className="text-xs font-black text-slate-800 tabular-nums">{visibleUsers.length}</span>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-md text-xs">
          <UsersIcon size={11} className="text-emerald-600" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Active:</span>
          <span className="text-xs font-black text-emerald-900 tabular-nums">{activeCount}</span>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-xs">
          <UsersIcon size={11} className="text-slate-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Inactive:</span>
          <span className="text-xs font-black text-slate-700 tabular-nums">{inactiveCount}</span>
        </div>
      </div>
    );
    setTabActions(
      <div className="flex items-center gap-2">
        {isSuperAdmin && (
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="h-7 px-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md shadow-sm focus:outline-none focus:border-brand-500 max-w-[150px] truncate"
          >
            <option value="">All companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
        )}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search records..."
            className="h-7 w-32 xl:w-44 pl-7 pr-2 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500/30 focus:border-brand-500 transition-all placeholder:text-slate-400"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<Upload size={13} />}
          onClick={() => handleExportRef.current()}
          className="h-7 py-1 text-xs px-2.5 shadow-sm font-semibold"
        >
          EXPORT
        </Button>
        {(isSuperAdmin || isCompanyAdmin) && (
          <Button variant="secondary" size="sm" icon={<ShieldCheck size={13} />} onClick={() => setShowRoles(true)} className="h-7 py-1 text-xs px-2.5 shadow-sm font-semibold">
            RETAIL ROLES
          </Button>
        )}
        <Button
          onClick={() => openCreateRef.current()}
          icon={<Plus size={14} />}
          size="sm"
          className="h-7 py-1 text-xs px-2.5 shadow-sm"
        >
          Create User
        </Button>
      </div>
    );
    return () => {
      setHeader(null);
      setHeaderCenter(null);
      setTabActions(null);
    };
  }, [setHeader, setHeaderCenter, setTabActions, visibleUsers.length, activeCount, inactiveCount, isSuperAdmin, companyFilter, companies, search, embeddedCompanyId]);

  return (
    <div className={embeddedCompanyId ? 'space-y-2' : 'p-3 sm:p-4 lg:px-4 lg:pt-1.5 lg:pb-4 bg-grid min-h-full space-y-2'}>
      {embeddedCompanyId && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500"><b className="text-slate-800">{visibleUsers.length}</b> users · <b className="text-emerald-700">{activeCount}</b> active</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…" className="h-8 w-44 px-2.5 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500/30 focus:border-brand-500" />
            {(isSuperAdmin || isCompanyAdmin) && <Button variant="secondary" size="sm" icon={<ShieldCheck size={13} />} onClick={() => setShowRoles(true)} className="h-8 text-xs">RETAIL ROLES</Button>}
            <Button size="sm" icon={<Plus size={14} />} onClick={openCreate} className="h-8 text-xs">Create User</Button>
          </div>
        </div>
      )}
      <div className={embeddedCompanyId ? 'hidden' : 'lg:hidden'}>
        <PageHeader
          title="User Management"
          description={isSuperAdmin ? 'All BI users across companies. Users sign in with their Google account — no passwords.' : `Users of ${ownCompanyName}. Users sign in with their Google account — no passwords.`}
          actions={isSuperAdmin ? (
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className={`${inputClass} w-56`}>
              <option value="">All companies</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          ) : undefined}
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <StatCard label="Total Users" value={visibleUsers.length.toString()} icon={<UsersIcon size={20} />} accent="brand" />
          <StatCard label="Active" value={activeCount.toString()} icon={<UsersIcon size={20} />} accent="success" />
          <StatCard label="Inactive" value={inactiveCount.toString()} icon={<UsersIcon size={20} />} accent="neutral" />
        </div>
      </div>
      <DataTable
        data={searchedUsers}
        columns={columns}
        searchKeys={['full_name', 'email', 'role', 'company_name']}
        onAdd={openCreate}
        addLabel="Create User"
        emptyMessage={loading ? 'Loading…' : 'No users yet'}
        hideToolbar
      />

      <RetailRolesPanel open={showRoles} onClose={() => setShowRoles(false)} onChanged={() => void loadRetailRoles()} canEdit={isSuperAdmin} />

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={form.id ? 'Edit User' : 'Create User'}
        subtitle="The user signs in with Continue with Google using this exact email address."
        size={showJdFormInline ? 'xl' : 'lg'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create User'}</Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Full Name">
            <input className={inputClass} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Priya Sharma" />
          </FormField>
          <FormField label="Gmail / Google Account Email" required>
            <input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@gmail.com" />
          </FormField>
          <FormField label="Company" required={form.role !== 'SUPER_ADMIN'}>
            {isSuperAdmin && form.role === 'SUPER_ADMIN' ? (
              <input className={`${inputClass} !bg-slate-100 !text-slate-500 cursor-not-allowed`} value="All companies" disabled title="Super Admin accounts span all companies" />
            ) : isSuperAdmin ? (
              <select className={inputClass} value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}>
                <option value="">Select company…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            ) : (
              <input className={`${inputClass} !bg-slate-100 !text-slate-500 cursor-not-allowed`} value={ownCompanyName} disabled title="Users are always created in your own company" />
            )}
          </FormField>
          <FormField label="Role" required>
            <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as ErpRole })} disabled={roleOptions.length === 1}>
              {roleOptions.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </FormField>
          <FormField label="Mobile Number">
            <input className={inputClass} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="Optional" />
          </FormField>
          {form.role === 'USER' && (
            <FormField label="Retail Store Role">
              <select className={inputClass} value={form.retail_role} onChange={(e) => setForm({ ...form, retail_role: e.target.value, terms: false })}>
                <option value="">No Retail Store access</option>
                {retailRoles.map(x => <option key={x.id} value={x.id}>{x.name}{typeof x.markupPct === 'number' && x.markupPct > 0 ? ` (+${x.markupPct}%)` : ''}</option>)}
              </select>
            </FormField>
          )}
          <FormField label="Status" required>
            <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'Active' | 'Inactive' })}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </FormField>
        </div>
        {form.role === 'USER' && retailRoles.find(x => x.id === form.retail_role)?.requireTerms && (
          <label className="mt-3 flex items-start gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.checked })} />
            <span><b>Sales terms accepted.</b> {retailRoles.find(x => x.id === form.retail_role)?.terms}</span>
          </label>
        )}

        {/* Job Description (JD) Section */}
        <div className="mt-5 pt-4 border-t border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Briefcase size={14} className="text-orange-500" />
                Job Description (JD)
              </h4>
              <p className="text-[11px] text-slate-500">
                Configure role requirements, outcomes, responsibilities and KPIs for this user.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditingJdForModal('new');
                setShowJdModal(true);
              }}
              className="!text-orange-600 !border-orange-200 hover:!bg-orange-50 text-xs font-semibold"
            >
              <Plus size={13} /> Create New JD
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <FormField label="Assign Existing JD">
              <select
                className={inputClass}
                value={selectedJdId || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__NEW__') {
                    setEditingJdForModal('new');
                    setShowJdModal(true);
                  } else {
                    setSelectedJdId(val || null);
                  }
                }}
              >
                <option value="">-- No Job Description assigned --</option>
                <option value="__NEW__">➕ Create New Job Description...</option>
                {allJds.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title} {j.department ? `(${j.department})` : ''}
                  </option>
                ))}
              </select>
            </FormField>

            {(() => {
              const activeJd = allJds.find(j => j.id === selectedJdId);
              if (activeJd) {
                return (
                  <div className="flex flex-col justify-end">
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-50/80 border border-orange-200">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-orange-950 truncate">{activeJd.title}</p>
                        <p className="text-[10px] text-orange-700 truncate">
                          {[activeJd.department, activeJd.employment, activeJd.location].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setViewingJd(activeJd)}
                          title="View JD"
                          className="!h-7 !px-2 text-xs"
                        >
                          <Eye size={12} /> View
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditingJdForModal(activeJd);
                            setShowJdModal(true);
                          }}
                          title="Edit JD"
                          className="!h-7 !px-2 text-xs"
                        >
                          <Edit2 size={12} /> Edit
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedJdId(null)}
                          title="Remove assignment"
                          className="!h-7 !px-2 !text-red-600 hover:!bg-red-50 text-xs"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={showJdFormInline}
                      onChange={(e) => setShowJdFormInline(e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span>Fill JD form directly inside this user dialog</span>
                  </label>
                </div>
              );
            })()}
          </div>

          {/* Inline JD form (when user checks the box) */}
          {showJdFormInline && !selectedJdId && (
            <div className="mt-3 p-3 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Create Job Description for this User
                </span>
                <span className="text-[11px] text-slate-500">Will be saved and assigned upon user creation</span>
              </div>
              <JobDescriptionFormFields
                draft={jdDraft}
                onChange={(key, val) => setJdDraft(prev => ({ ...prev, [key]: val }))}
              />
            </div>
          )}
        </div>

        {formError && <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</p>}
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title="User Details" size="sm">
        {viewing && (
          <dl className="grid grid-cols-3 gap-y-3 text-sm">
            <dt className="text-slate-500">Name</dt><dd className="col-span-2 font-medium text-slate-800">{viewing.full_name || '—'}</dd>
            <dt className="text-slate-500">Email</dt><dd className="col-span-2 font-medium text-slate-800 break-all">{viewing.email}</dd>
            <dt className="text-slate-500">Company</dt><dd className="col-span-2 font-medium text-slate-800">{viewing.company_name}</dd>
            <dt className="text-slate-500">Role</dt><dd className="col-span-2 font-medium text-slate-800">{ROLE_LABELS[viewing.role]}</dd>
            <dt className="text-slate-500">Status</dt><dd className="col-span-2 font-medium text-slate-800">{viewing.status}</dd>
            <dt className="text-slate-500">Job Description</dt>
            <dd className="col-span-2 font-medium text-slate-800">
              {(() => {
                const jdId = getUserJdId(userJdMap, viewing);
                const jd = allJds.find(j => j.id === jdId);
                return jd ? (
                  <button
                    type="button"
                    onClick={() => {
                      setViewing(null);
                      setViewingJd(jd);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors"
                  >
                    <Briefcase size={12} className="text-orange-600" />
                    <span>{jd.title} ({jd.department})</span>
                  </button>
                ) : (
                  <span className="text-slate-400 italic">None assigned</span>
                );
              })()}
            </dd>
            <dt className="text-slate-500">Created</dt><dd className="col-span-2 font-medium text-slate-800">{formatDate(viewing.created_at)}</dd>
            <dt className="text-slate-500">Last login</dt><dd className="col-span-2 font-medium text-slate-800">{viewing.last_login_at ? new Date(viewing.last_login_at).toLocaleString('en-IN', { hour12: false }) : 'Never'}</dd>
          </dl>
        )}
      </Modal>

      {/* Standalone / Triggered Job Description Modals */}
      <JobDescriptionModal
        open={showJdModal}
        onClose={() => {
          setShowJdModal(false);
          setEditingJdForModal(null);
        }}
        initialData={editingJdForModal && editingJdForModal !== 'new' ? editingJdForModal : { ...EMPTY_JD, title: targetUserForJd?.full_name ? `${targetUserForJd.full_name} - Role` : '' }}
        onSaved={handleJdSaved}
        zIndex={60}
      />

      <JobDescriptionViewModal
        open={!!viewingJd}
        onClose={() => setViewingJd(null)}
        jd={viewingJd}
        onEdit={(j) => {
          setEditingJdForModal(j);
          setShowJdModal(true);
        }}
        companyName={ownCompanyName}
        zIndex={60}
      />
      <Modal open={!!toDelete} onClose={() => !deleting && setToDelete(null)} title="Delete user permanently?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setToDelete(null)} disabled={deleting}>Cancel</Button><button onClick={confirmDeleteUser} disabled={deleting} className="h-9 px-4 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">{deleting ? 'Deleting…' : 'Delete permanently'}</button></>}>
        <p className="text-sm text-slate-700"><b>{toDelete?.full_name || toDelete?.email}</b> ({toDelete?.email}) will be removed completely, including their Google sign-in. This cannot be undone.</p>
        {deleteError && <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{deleteError}</p>}
      </Modal>
    </div>
  );
}

// One page per company, like the Retail Store's Company Hub: the company's details and its users together.
function CompanyHub({ company, onBack, onEdit }: { company: CompanyRow; onBack: () => void; onEdit: (c: CompanyRow) => void }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'users' | 'details'>('users');
  const [details, setDetails] = useState<Record<string, string | null>>({});
  useEffect(() => {
    supabase.from('companies').select(COMPANY_DETAIL_KEYS.join(',')).eq('id', company.id).maybeSingle().then(({ data }) => { if (data) setDetails(data as any); });
  }, [company.id]);
  const rows: [string, string | null | undefined][] = [
    ['GST No.', company.code], ['Status', company.status], ['Created', formatDate(company.created_at)],
    ['Industry', details.industry], ['Company email', details.email], ['Phone', details.phone], ['Plan', details.plan],
    ['City', details.city], ['State', details.state], ['PIN code', details.pin], ['PAN', details.pan], ['CIN', details.cin],
    ['Address', details.address], ['Description', details.description],
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="text-xs font-semibold text-brand-600 hover:underline">← All companies</button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500"><Building2 size={15} /></div>
          <h2 className="text-lg font-bold text-slate-800">{company.company_name}</h2>
          <Badge variant={company.status === 'Active' ? 'success' : 'error'} dot>{company.status}</Badge>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" icon={<KeyRound size={13} />} onClick={() => navigate(`/admin/access?company=${company.id}`)} className="h-8 text-xs">Manage access</Button>
          <Button variant="secondary" size="sm" icon={<Edit2 size={13} />} onClick={() => onEdit(company)} className="h-8 text-xs">Edit company</Button>
        </div>
      </div>
      <div className="flex gap-1 border-b border-slate-200">
        {([['users', 'Users'], ['details', 'Company details']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${tab === k ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
        ))}
      </div>
      {tab === 'users' && <UsersPage embeddedCompanyId={company.id} />}
      {tab === 'details' && (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-3 gap-3 px-4 py-2.5 text-sm"><span className="text-slate-500">{k}</span><span className="col-span-2 text-slate-800 break-words">{v || '—'}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}


// ======================================================================================
// Company Management (Super Admin only)
// ======================================================================================

const emptyCompanyForm = {
  id: null as string | null, company_name: '', code: '', status: 'Active' as 'Active' | 'Inactive',
  // company details (the same ones the Retail Store company form asked for)
  industry: '', email: '', phone: '', address: '', city: '', state: '', pin: '', pan: '', cin: '', plan: 'Scale', description: '',
};
const COMPANY_DETAIL_KEYS = ['industry', 'email', 'phone', 'address', 'city', 'state', 'pin', 'pan', 'cin', 'plan', 'description'] as const;

export function CompaniesPage() {
  const navigate = useNavigate();
  const [hubParams, setHubParams] = useSearchParams();
  const hubId = hubParams.get('hub');
  const openHub = (id: string | null) => setHubParams(id ? { hub: id } : {});
  const { refresh, profile } = useAuth();
  const { companies, reload } = useCompanies();
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [form, setForm] = useState(emptyCompanyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<CompanyRow | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Menu Access Configuration State (BI + Retail)
  const [accessTab, setAccessTab] = useState<'bi' | 'retail'>('bi');
  const [accessSearch, setAccessSearch] = useState('');
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [globalDisabledBi, setGlobalDisabledBi] = useState<Set<string>>(new Set());
  const [globalDisabledRetail, setGlobalDisabledRetail] = useState<Set<string>>(new Set());
  const [selectedBi, setSelectedBi] = useState<Set<string>>(new Set());
  const [selectedRetail, setSelectedRetail] = useState<Set<string>>(new Set());
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const RETAIL_COMPANY_CATEGORY_IDS = useMemo(() => ['overview', 'operations', 'commerce', 'publishing', 'storefront', 'browse_categories'], []);

  // Filter out any retail items that are globally disabled or platform-exclusive super admin items
  const availableRetailCategories = useMemo(() => {
    return (MENU_CATALOG as any[])
      .filter((cat) => RETAIL_COMPANY_CATEGORY_IDS.includes(cat.id))
      .map((cat) => {
        const items = (cat.items || []).filter((item: any) =>
          !item.id.startsWith('super_') && !globalDisabledRetail.has(item.id)
        );
        return { id: cat.id, label: cat.label, items };
      })
      .filter((cat) => cat.items.length > 0);
  }, [globalDisabledRetail, RETAIL_COMPANY_CATEGORY_IDS]);

  const availableRetailItems = useMemo(() => {
    return availableRetailCategories.flatMap((cat) => cat.items);
  }, [availableRetailCategories]);

  // Filter out any BI modules that are globally disabled
  const availableBiCategories = useMemo(() => {
    return PERM_CATEGORIES.map((cat) => {
      const modules = VISIBLE_MODULES.filter(
        (m) => m.category === cat && !globalDisabledBi.has(m.key)
      );
      return { category: cat, modules };
    }).filter((group) => group.modules.length > 0);
  }, [globalDisabledBi]);

  const availableBiModules = useMemo(() => {
    return availableBiCategories.flatMap((group) => group.modules);
  }, [availableBiCategories]);

  // Filtered by in-modal search
  const filteredBiCategories = useMemo(() => {
    const q = accessSearch.trim().toLowerCase();
    if (!q) return availableBiCategories;
    return availableBiCategories.map((group) => ({
      ...group,
      modules: group.modules.filter((m) =>
        m.label.toLowerCase().includes(q) ||
        m.key.toLowerCase().includes(q) ||
        group.category.toLowerCase().includes(q)
      ),
    })).filter((group) => group.modules.length > 0);
  }, [availableBiCategories, accessSearch]);

  const filteredRetailCategories = useMemo(() => {
    const q = accessSearch.trim().toLowerCase();
    if (!q) return availableRetailCategories;
    return availableRetailCategories.map((group) => ({
      ...group,
      items: group.items.filter((item: any) =>
        item.label.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        (item.path && item.path.toLowerCase().includes(q)) ||
        group.label.toLowerCase().includes(q)
      ),
    })).filter((group) => group.items.length > 0);
  }, [availableRetailCategories, accessSearch]);

  const toggleCollapseCat = (id: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSingleBi = (key: string) => {
    setSelectedBi((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCatBi = (keys: string[], check: boolean) => {
    setSelectedBi((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => {
        if (check) next.add(k);
        else next.delete(k);
      });
      return next;
    });
  };

  const toggleSingleRetail = (id: string) => {
    setSelectedRetail((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCatRetail = (ids: string[], check: boolean) => {
    setSelectedRetail((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (check) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const handleSelectAllTab = () => {
    if (accessTab === 'bi') {
      setSelectedBi(new Set(availableBiModules.map((m) => m.key)));
    } else {
      setSelectedRetail(new Set(availableRetailItems.map((i: any) => i.id)));
    }
  };

  const handleClearAllTab = () => {
    if (accessTab === 'bi') {
      setSelectedBi(new Set());
    } else {
      setSelectedRetail(new Set());
    }
  };

  // Reuse the menu choices of a company that already exists (only fills the ticks; nothing is saved until Create / Save).
  const [copyingFrom, setCopyingFrom] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const copyAccessFrom = async (companyId: string) => {
    const src = (companies as CompanyRow[]).find((c) => c.id === companyId);
    if (!src) return;
    setCopyingFrom(true);
    setCopyNote(null);
    try {
      const compOffBi = new Set<string>((await fetchDisabledModules(src.id)) || []);
      setSelectedBi(new Set(VISIBLE_MODULES.filter((m) => !globalDisabledBi.has(m.key) && !compOffBi.has(m.key)).map((m) => m.key)));

      let retailPerms: string[] | null = null;
      try {
        const coRes = await retailApi.get('/api/companies/' + encodeURIComponent(src.code || src.id));
        if (coRes && Array.isArray(coRes.menuPermissions)) retailPerms = coRes.menuPermissions;
      } catch {}
      if (retailPerms && retailPerms.length > 0) {
        setSelectedRetail(new Set(retailPerms.filter((id) => !globalDisabledRetail.has(id))));
      } else {
        setSelectedRetail(new Set(availableRetailItems.map((i: any) => i.id)));
      }
      setCopyNote(`Menus copied from ${src.company_name}. Adjust if needed, then save.`);
    } catch (err) {
      console.error('Failed copying company menus:', err);
      setCopyNote('Could not copy menus from that company.');
    } finally {
      setCopyingFrom(false);
    }
  };

  useEffect(() => {
    supabase.from('company_users').select('company_id').then(({ data, error }) => {
      if (error) console.error('Failed to count users:', error);
      const counts: Record<string, number> = {};
      (data || []).forEach((u: { company_id: string | null }) => { if (u.company_id) counts[u.company_id] = (counts[u.company_id] || 0) + 1; });
      setUserCounts(counts);
    });
  }, [companies]);

  const openCreate = async () => {
    setForm(emptyCompanyForm);
    setFormError(null);
    setAccessTab('bi');
    setAccessSearch('');
    setCopyNote(null);
    setLoadingAccess(true);
    setShowForm(true);

    try {
      const { data: globalBiRows } = await supabase
        .from('cnc_disabled_modules')
        .select('module_key')
        .eq('is_global', true);
      const gBi = new Set<string>((globalBiRows || []).map((r: any) => r.module_key));
      setGlobalDisabledBi(gBi);

      let gRetail = new Set<string>();
      try {
        const res = await retailApi.get('/api/permissions/global-disabled');
        if (res && Array.isArray(res.disabled)) {
          gRetail = new Set(res.disabled);
        }
      } catch {}
      setGlobalDisabledRetail(gRetail);

      // Default: select all non-globally-disabled modules for both BI & Retail
      const biAvail = VISIBLE_MODULES.filter((m) => !gBi.has(m.key)).map((m) => m.key);
      setSelectedBi(new Set(biAvail));

      const retailAvail: string[] = [];
      (MENU_CATALOG as any[]).forEach((cat) => {
        if (RETAIL_COMPANY_CATEGORY_IDS.includes(cat.id)) {
          (cat.items || []).forEach((item: any) => {
            if (!item.id.startsWith('super_') && !gRetail.has(item.id)) {
              retailAvail.push(item.id);
            }
          });
        }
      });
      setSelectedRetail(new Set(retailAvail));
    } catch (err) {
      console.error('Failed to init company permissions:', err);
    } finally {
      setLoadingAccess(false);
    }
  };

  const openEdit = async (r: CompanyRow) => {
    setForm({ ...emptyCompanyForm, id: r.id, company_name: r.company_name, code: r.code ?? '', status: r.status });
    // company details are read separately: a failed read (migration not applied yet) just leaves them empty
    supabase.from('companies').select(COMPANY_DETAIL_KEYS.join(',')).eq('id', r.id).maybeSingle().then(({ data }) => {
      if (data) setForm(f => (f.id === r.id ? { ...f, ...Object.fromEntries(COMPANY_DETAIL_KEYS.map(k => [k, (data as any)[k] ?? (k === 'plan' ? 'Scale' : '')])) } : f));
    });
    setFormError(null);
    setAccessTab('bi');
    setAccessSearch('');
    setCopyNote(null);
    setLoadingAccess(true);
    setShowForm(true);

    try {
      const [globalBiRes, compOffBi] = await Promise.all([
        supabase.from('cnc_disabled_modules').select('module_key').eq('is_global', true),
        fetchDisabledModules(r.id),
      ]);
      const gBi = new Set<string>((globalBiRes.data || []).map((row: any) => row.module_key));
      setGlobalDisabledBi(gBi);

      const compOffBiSet = new Set(compOffBi || []);
      const biSelected = VISIBLE_MODULES
        .filter((m) => !gBi.has(m.key) && !compOffBiSet.has(m.key))
        .map((m) => m.key);
      setSelectedBi(new Set(biSelected));

      let gRetail = new Set<string>();
      try {
        const res = await retailApi.get('/api/permissions/global-disabled');
        if (res && Array.isArray(res.disabled)) {
          gRetail = new Set(res.disabled);
        }
      } catch {}
      setGlobalDisabledRetail(gRetail);

      let retailPerms: string[] | null = null;
      try {
        const coCode = r.code || r.id;
        const coRes = await retailApi.get('/api/companies/' + encodeURIComponent(coCode));
        if (coRes && Array.isArray(coRes.menuPermissions)) {
          retailPerms = coRes.menuPermissions;
        }
      } catch {}

      const retailAvail: string[] = [];
      (MENU_CATALOG as any[]).forEach((cat) => {
        if (RETAIL_COMPANY_CATEGORY_IDS.includes(cat.id)) {
          (cat.items || []).forEach((item: any) => {
            if (!item.id.startsWith('super_') && !gRetail.has(item.id)) {
              retailAvail.push(item.id);
            }
          });
        }
      });

      if (retailPerms && retailPerms.length > 0) {
        setSelectedRetail(new Set(retailPerms.filter((id) => !gRetail.has(id))));
      } else {
        setSelectedRetail(new Set(retailAvail));
      }
    } catch (err) {
      console.error('Failed loading company permissions:', err);
    } finally {
      setLoadingAccess(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.company_name.trim()) { setFormError('Company name is required'); return; }
    setSaving(true);
    setFormError(null);

    // 1. Save company in Supabase
    const { data: savedCompany, error } = await supabase.rpc('erp_save_company', {
      p_id: form.id, p_company_name: form.company_name, p_code: form.code, p_status: form.status,
    });
    if (error) {
      setSaving(false);
      setFormError(error.message);
      return;
    }

    const targetCompanyId = (savedCompany as any)?.id || form.id;

    // 1b. Company details (industry, contact, address, PAN, CIN, plan...)
    {
      const { error: dErr } = await supabase.rpc('erp_save_company_details', {
        p_id: targetCompanyId,
        p_data: Object.fromEntries(COMPANY_DETAIL_KEYS.map(k => [k, form[k]])),
      });
      if (dErr) console.warn('Could not save the company details (apply the company hub migration):', dErr.message);
    }

    // 2. Save BI module access for this company
    const biAvail = VISIBLE_MODULES.filter((m) => !globalDisabledBi.has(m.key));
    const unselectedBi = biAvail
      .filter((m) => !selectedBi.has(m.key))
      .map((m) => m.key);

    try {
      const { error: rpcErr } = await supabase.rpc('erp_set_company_disabled_modules', {
        p_company_id: targetCompanyId,
        p_disabled_modules: unselectedBi,
      });
      if (rpcErr) {
        // Fallback: direct table update
        await supabase.from('cnc_disabled_modules').delete().eq('company_id', targetCompanyId).eq('is_global', false);
        if (unselectedBi.length > 0) {
          const rows = unselectedBi.map((k) => ({
            company_id: targetCompanyId,
            module_key: k,
            disabled_by: profile?.full_name || 'Admin',
            is_global: false,
          }));
          await supabase.from('cnc_disabled_modules').insert(rows);
        }
      }
    } catch (err) {
      console.warn('Failed saving BI company module access:', err);
    }

    // 3. Save Retail menu access for this company
    const retailAvailItems: string[] = [];
    (MENU_CATALOG as any[]).forEach((cat) => {
      if (RETAIL_COMPANY_CATEGORY_IDS.includes(cat.id)) {
        (cat.items || []).forEach((item: any) => {
          if (!item.id.startsWith('super_') && !globalDisabledRetail.has(item.id)) {
            retailAvailItems.push(item.id);
          }
        });
      }
    });
    const selectedRetailList = Array.from(selectedRetail);
    const unselectedRetailList = retailAvailItems.filter((id) => !selectedRetail.has(id));

    try {
      const coCode = form.code || targetCompanyId;
      const retailPayload = {
        name: form.company_name,
        code: form.code,
        city: form.city || 'Default',
        industry: form.industry || undefined, email: form.email || undefined, phone: form.phone || undefined,
        address: form.address || undefined, state: form.state || undefined, pin: form.pin || undefined,
        description: form.description || undefined, plan: form.plan || undefined,
        gstin: form.code || undefined, pan: form.pan || undefined, cin: form.cin || undefined,
        status: form.status.toLowerCase(),
        menuPermissions: selectedRetailList,
        disabledMenus: unselectedRetailList,
      };
      try {
        const patchRes = await retailApi.patch('/api/companies/' + encodeURIComponent(coCode), retailPayload);
        if (!patchRes) {
          await retailApi.post('/api/companies', retailPayload);
        }
      } catch {
        await retailApi.post('/api/companies', retailPayload).catch(() => {});
      }

      // (an rpc call is awaited, not chained with .catch: the builder has no catch)
      try {
        await supabase.rpc('erp_set_company_retail_menus', {
          p_company_id: targetCompanyId,
          p_retail_menus: selectedRetailList,
        });
      } catch { /* the company is saved; the retail menu list can be set again */ }
    } catch (err) {
      console.warn('Failed syncing to retail backend:', err);
    }

    setSaving(false);
    setShowForm(false);
    await reload();
    await refresh();
  };

  // Permanent: erp_delete_company removes the company, ALL its data and its users, atomically.
  const confirmDeleteCompany = async () => {
    if (!toDelete) return;
    setDeleting(true); setDeleteError(null);
    const { error } = await supabase.rpc('erp_delete_company', { p_id: toDelete.id, p_confirm_name: confirmText });
    setDeleting(false);
    if (error) { setDeleteError(error.message); return; }
    setToDelete(null); setConfirmText('');
    await reload();
    await refresh();
  };

  const [search, setSearch] = useState('');

  const rows = companies.map(c => ({ ...c, users: userCounts[c.id] || 0 }));

  const searchedRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      (r.company_name || '').toLowerCase().includes(q) ||
      (r.code || '').toLowerCase().includes(q) ||
      (r.status || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const activeCount = companies.filter(c => c.status === 'Active').length;
  const inactiveCount = companies.filter(c => c.status !== 'Active').length;

  const handleExport = () => {
    if (searchedRows.length === 0) return;
    exportCsv(`BI_Companies_${todayISO()}`, [
      ['Company Name', 'GST No.', 'Users', 'Status', 'Created Date'],
      ...searchedRows.map(r => [
        r.company_name || '',
        r.code || '',
        r.users || 0,
        r.status || '',
        formatDate(r.created_at),
      ]),
    ]);
  };

  const handleExportRef = useRef(handleExport);
  handleExportRef.current = handleExport;
  const openCreateRef = useRef(() => { openCreate(); });
  openCreateRef.current = () => { openCreate(); };

  const { setHeader, setTabActions, setHeaderCenter } = useHeaderKpis();

  useEffect(() => {
    setHeader({ title: 'Company Management' });
    setHeaderCenter(
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-xs">
          <Building2 size={11} className="text-slate-600" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Companies:</span>
          <span className="text-xs font-black text-slate-800 tabular-nums">{companies.length}</span>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-md text-xs">
          <Building2 size={11} className="text-emerald-600" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Active:</span>
          <span className="text-xs font-black text-emerald-900 tabular-nums">{activeCount}</span>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-xs">
          <Building2 size={11} className="text-slate-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Inactive:</span>
          <span className="text-xs font-black text-slate-700 tabular-nums">{inactiveCount}</span>
        </div>
      </div>
    );
    setTabActions(
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search records..."
            className="h-7 w-32 xl:w-44 pl-7 pr-2 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500/30 focus:border-brand-500 transition-all placeholder:text-slate-400"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<Upload size={13} />}
          onClick={() => handleExportRef.current()}
          className="h-7 py-1 text-xs px-2.5 shadow-sm font-semibold"
        >
          EXPORT
        </Button>
        <Button
          onClick={() => openCreateRef.current()}
          icon={<Plus size={14} />}
          size="sm"
          className="h-7 py-1 text-xs px-2.5 shadow-sm"
        >
          Create Company
        </Button>
      </div>
    );
    return () => {
      setHeader(null);
      setHeaderCenter(null);
      setTabActions(null);
    };
  }, [setHeader, setHeaderCenter, setTabActions, companies.length, activeCount, inactiveCount, search]);

  const columns: Column<CompanyRow & { users: number }>[] = [
    { key: 'company_name', label: 'Company', sortable: true, render: (r) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500"><Building2 size={15} /></div>
        <p className="font-medium text-slate-800 hover:text-brand-600">{r.company_name}</p>
      </div>
    )},
    { key: 'code', label: 'GST No.', sortable: true, render: (r) => <span className="font-mono text-xs text-slate-600">{r.code || '—'}</span> },
    { key: 'users', label: 'Users', sortable: true, align: 'center', render: (r) => <span className="text-sm text-slate-700">{r.users}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge variant={r.status === 'Active' ? 'success' : 'error'} dot>{r.status}</Badge> },
    { key: 'created_at', label: 'Created Date', sortable: true, render: (r) => <span className="text-xs text-slate-500">{formatDate(r.created_at)}</span> },
    {
      key: 'actions', label: 'Actions', align: 'center', render: (r) => (
        <div className="flex items-center justify-center gap-1">
          <button title="Open company (details and users)" onClick={() => openHub(r.id)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><UsersIcon size={15} /></button>
          <button title="Manage access" aria-label={`Manage access for ${r.company_name}`} onClick={() => navigate(`/admin/access?company=${r.id}`)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"><KeyRound size={15} /></button>
          <button title="Edit" onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><Edit size={15} /></button>
          <button title="Delete company" aria-label={`Delete company ${r.company_name}`} onClick={() => { setDeleteError(null); setConfirmText(''); setToDelete(r); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={15} /></button>
        </div>
      )
    },
  ];

  return (
    <div className="p-3 sm:p-4 lg:px-4 lg:pt-1.5 lg:pb-4 bg-grid min-h-full space-y-2">
      <div className="lg:hidden">
        <PageHeader title="Company Management" description="Companies using this BI. Each company's data is isolated by the database." />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <StatCard label="Companies" value={companies.length.toString()} icon={<Building2 size={20} />} accent="brand" />
          <StatCard label="Active" value={activeCount.toString()} icon={<Building2 size={20} />} accent="success" />
          <StatCard label="Inactive" value={inactiveCount.toString()} icon={<Building2 size={20} />} accent="neutral" />
        </div>
      </div>
      {hubId && companies.find(c => c.id === hubId) ? (
        <CompanyHub company={companies.find(c => c.id === hubId)!} onBack={() => openHub(null)} onEdit={(c) => openEdit(c)} />
      ) : (
        <DataTable
          data={searchedRows}
          columns={columns}
          searchKeys={['company_name', 'code']}
          onAdd={() => openCreate()}
          addLabel="Create Company"
          onRowClick={(row) => openHub(row.id)}
          hideToolbar
        />
      )}

      <Modal
        open={showForm}
        onClose={() => !saving && setShowForm(false)}
        title={form.id ? 'Edit Company' : 'Create Company'}
        subtitle="Configure company details and assign menu access for both BI and Retail platforms."
        size="xl"
        tall
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{selectedBi.size}</span> BI modules · <span className="font-semibold text-slate-700">{selectedRetail.size}</span> Retail menus granted
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create Company'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Top Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200">
            <FormField label="Company Name" required>
              <input
                className={inputClass}
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                placeholder="e.g. Argus Technology"
              />
            </FormField>
            <FormField label="GST No.">
              <input
                className={inputClass}
                value={form.code}
                maxLength={15}
                onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\s+/g, '').toUpperCase() })}
                placeholder="e.g. 33ABCDE1234F1Z5"
              />
            </FormField>
            <FormField label="Status" required>
              <select
                className={inputClass}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'Active' | 'Inactive' })}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </FormField>
          </div>

          {/* Company details: the same ones the Retail Store company form used to ask for */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200">
            <FormField label="Industry"><input className={inputClass} value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="e.g. CNC Manufacturing" /></FormField>
            <FormField label="Company Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
            <FormField label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
            <FormField label="Plan">
              <select className={inputClass} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                <option>Starter</option><option>Growth</option><option>Scale</option><option>Enterprise</option>
              </select>
            </FormField>
            <FormField label="City"><input className={inputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></FormField>
            <FormField label="State"><input className={inputClass} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></FormField>
            <FormField label="PIN Code"><input className={inputClass} value={form.pin} maxLength={6} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} /></FormField>
            <FormField label="PAN"><input className={inputClass} value={form.pan} maxLength={10} onChange={(e) => setForm({ ...form, pan: e.target.value.replace(/\s+/g, '').toUpperCase() })} /></FormField>
            <FormField label="CIN"><input className={inputClass} value={form.cin} maxLength={21} onChange={(e) => setForm({ ...form, cin: e.target.value.replace(/\s+/g, '').toUpperCase() })} /></FormField>
            <div className="col-span-2"><FormField label="Address"><input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></FormField></div>
            <div className="col-span-2 sm:col-span-4"><FormField label="Short Description"><input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField></div>
          </div>

          {/* Menu Access Header & Controls */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
            {/* Platform Tab Headers */}
            <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50/60 px-3 pt-2 gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAccessTab('bi')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-t-lg transition-all border-b-2 ${
                    accessTab === 'bi'
                      ? 'border-brand-600 text-brand-700 bg-white shadow-2xs'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
                  }`}
                >
                  <Building2 size={13} className="text-brand-500" />
                  <span>This BI Menus</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    accessTab === 'bi' ? 'bg-brand-100 text-brand-800' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {selectedBi.size}/{availableBiModules.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAccessTab('retail')}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-t-lg transition-all border-b-2 ${
                    accessTab === 'retail'
                      ? 'border-emerald-600 text-emerald-700 bg-white shadow-2xs'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
                  }`}
                >
                  <Store size={13} className="text-emerald-600" />
                  <span>The Retail Menus</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    accessTab === 'retail' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {selectedRetail.size}/{availableRetailItems.length}
                  </span>
                </button>
              </div>

              {/* Quick Actions Toolbar */}
              <div className="flex items-center gap-2 pb-2">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    value={accessSearch}
                    onChange={(e) => setAccessSearch(e.target.value)}
                    placeholder="Search menus…"
                    className="h-6 w-36 pl-6 pr-2 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500/40"
                  />
                </div>
                <select
                  value=""
                  disabled={copyingFrom || loadingAccess}
                  onChange={(e) => { if (e.target.value) copyAccessFrom(e.target.value); }}
                  title="Reuse the menu choices of an existing company"
                  className="h-6 max-w-[170px] px-1.5 text-[11px] font-semibold rounded border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
                >
                  <option value="">{copyingFrom ? 'Copying…' : 'Copy from company…'}</option>
                  {(companies as CompanyRow[]).filter((c) => c.id !== form.id).map((c) => (
                    <option key={c.id} value={c.id}>{c.company_name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleSelectAllTab}
                  className="px-2 py-0.5 text-[11px] font-semibold rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearAllTab}
                  className="px-2 py-0.5 text-[11px] font-semibold rounded border border-slate-200 bg-white text-slate-600 hover:text-red-600 hover:border-red-200 hover:bg-red-50/50 shadow-2xs"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Note banner: project-wide disabled excluded */}
            <div className="flex items-center justify-between px-3 py-1 bg-amber-50/60 border-b border-amber-100 text-[11px] text-amber-800">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={12} className="text-amber-600 shrink-0" />
                <span>
                  {accessTab === 'bi'
                    ? `${globalDisabledBi.size} module(s) turned off for the entire project are automatically omitted.`
                    : `${globalDisabledRetail.size} retail menu(s) turned off globally are automatically omitted.`}
                </span>
              </span>
              <span className="text-[10px] text-amber-600/90 font-medium">
                {copyNote ?? 'Only active platform options shown'}
              </span>
            </div>

            {/* Scrollable list of categories and items */}
            <div className="max-h-[380px] overflow-y-auto p-3 space-y-3">
              {loadingAccess ? (
                <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  <span>Loading platform menu permissions…</span>
                </div>
              ) : accessTab === 'bi' ? (
                /* BI Categories */
                filteredBiCategories.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-8">No BI modules match your search.</p>
                ) : (
                  filteredBiCategories.map((catGroup) => {
                    const isCollapsed = collapsedCats.has(catGroup.category);
                    const catModKeys = catGroup.modules.map((m) => m.key);
                    const enabledCount = catModKeys.filter((k) => selectedBi.has(k)).length;
                    const allCatOn = catModKeys.length > 0 && enabledCount === catModKeys.length;

                    return (
                      <div key={catGroup.category} className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                        <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50/90 border-b border-slate-100">
                          <button
                            type="button"
                            onClick={() => toggleCollapseCat(catGroup.category)}
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-brand-600 transition-colors"
                          >
                            {isCollapsed ? <ChevronRight size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                            <span className="uppercase tracking-wider text-[11px]">{catGroup.category}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-200/70 text-slate-600 ml-1">
                              {enabledCount}/{catModKeys.length}
                            </span>
                          </button>
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={allCatOn}
                              onChange={(e) => toggleCatBi(catModKeys, e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-brand-600 focus:ring-brand-500/40"
                            />
                            <span>Select category</span>
                          </label>
                        </div>
                        {!isCollapsed && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-2 bg-slate-50/30">
                            {catGroup.modules.map((m) => {
                              const checked = selectedBi.has(m.key);
                              return (
                                <div
                                  key={m.key}
                                  onClick={() => toggleSingleBi(m.key)}
                                  className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer select-none transition-all ${
                                    checked
                                      ? 'border-brand-200 bg-brand-50/40 hover:bg-brand-50/70'
                                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-400'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {}}
                                    className="mt-0.5 w-3.5 h-3.5 rounded text-brand-600 focus:ring-brand-500/40 pointer-events-none shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                      <span className={`text-xs font-semibold truncate ${checked ? 'text-slate-800' : 'text-slate-500'}`}>
                                        {m.label}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 line-clamp-1">
                                      {m.pages?.[0] ? `/${m.pages[0]}` : m.category}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )
              ) : (
                /* Retail Categories */
                filteredRetailCategories.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-8">No Retail menus match your search.</p>
                ) : (
                  filteredRetailCategories.map((catGroup) => {
                    const isCollapsed = collapsedCats.has(catGroup.id);
                    const itemIds = catGroup.items.map((i: any) => i.id);
                    const enabledCount = itemIds.filter((id: string) => selectedRetail.has(id)).length;
                    const allCatOn = itemIds.length > 0 && enabledCount === itemIds.length;

                    return (
                      <div key={catGroup.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                        <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50/90 border-b border-slate-100">
                          <button
                            type="button"
                            onClick={() => toggleCollapseCat(catGroup.id)}
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-emerald-600 transition-colors"
                          >
                            {isCollapsed ? <ChevronRight size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                            <span className="uppercase tracking-wider text-[11px]">{catGroup.label}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-200/70 text-slate-600 ml-1">
                              {enabledCount}/{itemIds.length}
                            </span>
                          </button>
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={allCatOn}
                              onChange={(e) => toggleCatRetail(itemIds, e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500/40"
                            />
                            <span>Select category</span>
                          </label>
                        </div>
                        {!isCollapsed && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-2 bg-slate-50/30">
                            {catGroup.items.map((item: any) => {
                              const checked = selectedRetail.has(item.id);
                              return (
                                <div
                                  key={item.id}
                                  onClick={() => toggleSingleRetail(item.id)}
                                  className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer select-none transition-all ${
                                    checked
                                      ? 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/70'
                                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-400'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {}}
                                    className="mt-0.5 w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500/40 pointer-events-none shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                      <span className={`text-xs font-semibold truncate ${checked ? 'text-slate-800' : 'text-slate-500'}`}>
                                        {item.label}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 line-clamp-1">
                                      {item.path || item.id}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )
              )}
            </div>
          </div>
        </div>
        {formError && <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</p>}
      </Modal>
      <Modal open={!!toDelete} onClose={() => !deleting && setToDelete(null)} title="Delete company permanently?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setToDelete(null)} disabled={deleting}>Cancel</Button><button onClick={confirmDeleteCompany} disabled={deleting || confirmText.trim() !== toDelete?.company_name} className="h-9 px-4 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40">{deleting ? 'Deleting…' : 'Delete everything'}</button></>}>
        <div className="space-y-3 text-sm text-slate-700">
          <p><b>{toDelete?.company_name}</b> and <b>all of its data</b> (enquiries, quotations, orders, inventory, accounts, files records…) will be erased, together with its {userCounts[toDelete?.id ?? ''] || 0} user(s) and their Google sign-ins. <b>This cannot be undone.</b></p>
          <FormField label={`Type the company name to confirm`}>
            <input autoFocus aria-label="Confirm company name" className={inputClass} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={toDelete?.company_name} />
          </FormField>
          {deleteError && <p className="text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{deleteError}</p>}
        </div>
      </Modal>
    </div>
  );
}

function AdminStub({ title, description, icon: Icon }: { title: string, description: string, icon: any }) {
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title={title} description={description} />
      <div className="flex flex-col items-center justify-center h-64 border border-dashed border-slate-300 rounded-xl bg-slate-50">
        <Icon className="text-slate-400 mb-3" size={32} />
        <h3 className="text-slate-700 font-medium">{title}</h3>
        <p className="text-slate-500 text-sm mt-1">Configuration module coming soon.</p>
      </div>
    </div>
  );
}

export function RolesPage() { return <AdminStub title="Roles" description="Define user roles and group policies" icon={ShieldCheck} />; }
export function PermissionsPage() { return <AdminStub title="Permissions" description="Granular access control matrix" icon={ShieldCheck} />; }
// Web: keeps the original placeholder. Desktop: real About + Updates settings
// (version, startup/periodic check toggles, manual check) — no other settings moved.
// Company Settings: the company profile printed on each document, one tab per document (same setup for all three), plus
// the app updates on the desktop app. A link like /admin/settings?tab=invoice opens straight on a tab.
export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const { isSuperAdmin } = useAuth();
  const tabs: { id: string; label: string; hint: string; node: JSX.Element }[] = [
    { id: 'quotation', label: 'Quotation Profile', hint: 'Printed on quotations', node: <DocumentProfilePage kind="quotation" embedded /> },
    { id: 'invoice', label: 'Invoice Profile', hint: 'Printed on invoices', node: <DocumentProfilePage kind="invoice" embedded /> },
    { id: 'dc', label: 'Delivery Challan Profile', hint: 'Printed on delivery challans', node: <DocumentProfilePage kind="dc" embedded /> },
    ...(isSuperAdmin ? [{ id: 'created', label: 'Profiles Created', hint: 'Who created which profile', node: <ProfilesCreatedPanel /> }] : []),
    { id: 'updates', label: 'App Updates & Releases', hint: 'Version-wise history & updates', node: <UpdatesSettingsPage /> },
  ];
  const active = tabs.find((t) => t.id === params.get('tab')) ?? tabs[0];
  return (
    <div className="p-4 lg:p-6 bg-grid min-h-full">
      <PageHeader title="Company Settings" description="Set up the company details that are printed on each document: logo, address, GSTIN, contacts, bank and signature." />
      <div role="tablist" aria-label="Settings" className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={active.id === t.id} title={t.hint}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${active.id === t.id ? 'bg-orange-500 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div key={active.id}>{active.node}</div>
    </div>
  );
}
export function AuditLogsPage() { return <AdminStub title="Audit Logs" description="System-wide activity monitoring" icon={FileText} />; }

// ======================================================================================
// Company & Access Management: All Companies → Company → Users → User Permissions
const ACTION_LABELS: Record<PermAction, string> = {
  view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', approve: 'Approve', export: 'Export',
};

const CATEGORY_THEMES: Record<string, {
  cardBg: string;
  cardBorder: string;
  headerBg: string;
  headerBorder: string;
  headerText: string;
  badgeBg: string;
  badgeText: string;
  divider: string;
  rowHover: string;
  accent: string;
  toggleOn: string;
}> = {
  Overview: {
    cardBg: 'bg-indigo-50/40',
    cardBorder: 'border-indigo-200/80',
    headerBg: 'bg-indigo-100/70',
    headerBorder: 'border-indigo-200',
    headerText: 'text-indigo-900',
    badgeBg: 'bg-indigo-200/60',
    badgeText: 'text-indigo-800',
    divider: 'divide-indigo-100/70',
    rowHover: 'hover:bg-indigo-100/30',
    accent: 'accent-indigo-600',
    toggleOn: 'bg-indigo-600',
  },
  Sales: {
    cardBg: 'bg-emerald-50/40',
    cardBorder: 'border-emerald-200/80',
    headerBg: 'bg-emerald-100/70',
    headerBorder: 'border-emerald-200',
    headerText: 'text-emerald-900',
    badgeBg: 'bg-emerald-200/60',
    badgeText: 'text-emerald-800',
    divider: 'divide-emerald-100/70',
    rowHover: 'hover:bg-emerald-100/30',
    accent: 'accent-emerald-600',
    toggleOn: 'bg-emerald-600',
  },
  Production: {
    cardBg: 'bg-amber-50/40',
    cardBorder: 'border-amber-200/80',
    headerBg: 'bg-amber-100/70',
    headerBorder: 'border-amber-200',
    headerText: 'text-amber-900',
    badgeBg: 'bg-amber-200/60',
    badgeText: 'text-amber-800',
    divider: 'divide-amber-100/70',
    rowHover: 'hover:bg-amber-100/30',
    accent: 'accent-amber-600',
    toggleOn: 'bg-amber-600',
  },
  'Sales Pipeline Columns': {
    cardBg: 'bg-rose-50/40', cardBorder: 'border-rose-200/80', headerBg: 'bg-rose-100/70', headerBorder: 'border-rose-200', headerText: 'text-rose-900',
    badgeBg: 'bg-rose-200/60', badgeText: 'text-rose-800', divider: 'divide-rose-100/70', rowHover: 'hover:bg-rose-100/30', accent: 'accent-rose-600', toggleOn: 'bg-rose-600',
  },
  Logistics: {
    cardBg: 'bg-sky-50/40',
    cardBorder: 'border-sky-200/80',
    headerBg: 'bg-sky-100/70',
    headerBorder: 'border-sky-200',
    headerText: 'text-sky-900',
    badgeBg: 'bg-sky-200/60',
    badgeText: 'text-sky-800',
    divider: 'divide-sky-100/70',
    rowHover: 'hover:bg-sky-100/30',
    accent: 'accent-sky-600',
    toggleOn: 'bg-sky-600',
  },
  Finance: {
    cardBg: 'bg-violet-50/40',
    cardBorder: 'border-violet-200/80',
    headerBg: 'bg-violet-100/70',
    headerBorder: 'border-violet-200',
    headerText: 'text-violet-900',
    badgeBg: 'bg-violet-200/60',
    badgeText: 'text-violet-800',
    divider: 'divide-violet-100/70',
    rowHover: 'hover:bg-violet-100/30',
    accent: 'accent-violet-600',
    toggleOn: 'bg-violet-600',
  },
  'Inventory & Purchasing': {
    cardBg: 'bg-teal-50/40',
    cardBorder: 'border-teal-200/80',
    headerBg: 'bg-teal-100/70',
    headerBorder: 'border-teal-200',
    headerText: 'text-teal-900',
    badgeBg: 'bg-teal-200/60',
    badgeText: 'text-teal-800',
    divider: 'divide-teal-100/70',
    rowHover: 'hover:bg-teal-100/30',
    accent: 'accent-teal-600',
    toggleOn: 'bg-teal-600',
  },
  Administration: {
    cardBg: 'bg-rose-50/40',
    cardBorder: 'border-rose-200/80',
    headerBg: 'bg-rose-100/70',
    headerBorder: 'border-rose-200',
    headerText: 'text-rose-900',
    badgeBg: 'bg-rose-200/60',
    badgeText: 'text-rose-800',
    divider: 'divide-rose-100/70',
    rowHover: 'hover:bg-rose-100/30',
    accent: 'accent-rose-600',
    toggleOn: 'bg-rose-600',
  },
};

function TriCheckbox({ checked, indeterminate, onChange, label, disabled, title, accentClass }: {
  checked: boolean; indeterminate: boolean; onChange: (on: boolean) => void;
  label: string; disabled?: boolean; title?: string; accentClass?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate && !checked; }, [indeterminate, checked]);
  return (
    <label title={title} className={`flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap ${disabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 cursor-pointer hover:text-slate-900'}`}>
      <input ref={ref} type="checkbox" disabled={disabled} checked={checked} onChange={(e) => onChange(e.target.checked)}
        className={`w-3.5 h-3.5 rounded cursor-pointer disabled:cursor-not-allowed ${accentClass ?? 'accent-brand-600'}`} />
      {label}
    </label>
  );
}

export function PermissionEditor({ userId, userEmail, userRole, companyId, companyName, onSaved }: {
  userId: string; userEmail: string; userRole: ErpRole; companyId?: string | null; companyName?: string; onSaved?: () => void;
}) {
  // These stages live on the Sales Pipeline strip (no sidebar entry): their
  // matrix rows still control the pipeline column, KPI tile and list access.
  const emptyFlags0 = { view: false, create: false, edit: false, delete: false, approve: false, export: false };
  const PIPELINE_ONLY: Record<string, boolean> = { enquiries: true, rejected: true, inward: true };
  const { profile, isSuperAdmin, refreshPermissions } = useAuth();
  const [matrix, setMatrix] = useState<PermMatrix>(emptyMatrix);
  const [saved, setSaved] = useState<PermMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // "Full off": modules switched off for EVERYONE in this user's company (loaded and saved on their own, not with Save Permissions)
  const [fullOff, setFullOff] = useState<Set<string>>(new Set());
  useEffect(() => {
    let off = false;
    void fetchDisabledModules(companyId).then((keys) => { if (!off) setFullOff(new Set(keys)); });
    return () => { off = true; };
  }, [companyId]);
  const toggleFullOff = async (key: string, label: string) => {
    const turnOff = !fullOff.has(key);
    const where = isSuperAdmin ? 'ALL companies' : (companyName || 'this company');
    const msg = turnOff
      ? `Switch "${label}" fully OFF for everyone in ${where}?\n\nIts menu, pages, pipeline column and KPI tile will disappear for every user, administrators included, until you switch it on again.${isSuperAdmin ? ' This applies to every company, including companies added later.' : ''}`
      : `Switch "${label}" back on for ${where}?\n\nEach user will see it again if they have access to it.`;
    if (!window.confirm(msg)) return;
    setError(null); setNotice(null);
    const res = await setModuleOff(key, turnOff, companyId);
    if ('error' in res) { setError(res.error); return; }
    setFullOff(new Set(res.modules));
    setNotice(turnOff ? `${label} is now fully off for everyone in ${where}.` : `${label} is on again for ${where}.`);
    void refreshPermissions();   // this administrator's own menu follows at once
  };

  // Category bulk controls. Select All toggles View only (never grants
  // actions); the Actions menu enables one action at a time (implying View,
  // like the single-module controls) or clears optional actions. Locked and
  // Super-Admin-target modules are always skipped; backend rules still apply.
  const setCategoryView = (cat: string, on: boolean) => {
    setMatrix((prev) => {
      const next = { ...prev };
      VISIBLE_MODULES.filter((m) => m.category === cat).forEach((m) => {
        if (lockedForCaller(m.key) || isSuperTarget) return;
        next[m.key] = on
          ? { ...next[m.key], view: true }
          : { view: false, create: false, edit: false, delete: false, approve: false, export: false };
      });
      return next;
    });
  };

  const setCategoryAction = (cat: string, action: PermAction | 'clear') => {
    setMatrix((prev) => {
      const next = { ...prev };
      VISIBLE_MODULES.filter((m) => m.category === cat).forEach((m) => {
        if (lockedForCaller(m.key) || isSuperTarget) return;
        if (action === 'clear') {
          next[m.key] = { ...next[m.key], create: false, edit: false, delete: false, approve: false, export: false };
        } else if ((m.actions as string[]).includes(action)) {
          next[m.key] = { ...next[m.key], view: true, [action]: true };
        }
      });
      return next;
    });
    setMenuFor(null);
  };

  const isSelf = profile?.id === userId;
  const isSuperTarget = userRole === 'SUPER_ADMIN';
  // Company Admins can never grant these (mirrors the database rule).
  const lockedForCaller = useCallback((key: string) => !isSuperAdmin && ADMIN_RESERVED_MODULES.includes(key), [isSuperAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('erp_get_user_permissions', { p_user_id: userId });
    setLoading(false);
    if (err) { setError(err.message); return; }
    // Admins resolve to full access even with no rows: show that reality as the base.
    const base = (data?.role === 'SUPER_ADMIN' || data?.role === 'COMPANY_ADMIN')
      ? fullMatrix()
      : rowsToMatrix(data?.permissions);
    setMatrix(base);
    setSaved(JSON.parse(JSON.stringify(base)));
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const dirty = saved !== null && JSON.stringify(matrix) !== JSON.stringify(saved);
  const grantedCount = VISIBLE_MODULES.filter((m) => matrix[m.key]?.view).length;

  const setModule = (key: string, patch: Partial<Record<PermAction, boolean>>) => {
    setMatrix((prev) => {
      const next = { ...prev, [key]: { ...prev[key], ...patch } };
      // View off clears every action; an action on implies view.
      if (patch.view === false) {
        next[key] = { view: false, create: false, edit: false, delete: false, approve: false, export: false };
      } else if (Object.entries(patch).some(([a, v]) => a !== 'view' && v)) {
        next[key] = { ...next[key], view: true };
      }
      return next;
    });
  };

  const selectAll = () => {
    const next = emptyMatrix();
    VISIBLE_MODULES.forEach((m) => {
      if (lockedForCaller(m.key)) return;
      m.actions.forEach((a) => { next[m.key][a] = true; });
    });
    setMatrix(next);
  };

  const save = async () => {
    if (isSelf) { setError('You cannot edit your own permissions — ask another administrator.'); return; }
    if (isSuperTarget) { setError('Super Admins always have full access — nothing to configure.'); return; }
    const revoked = saved ? VISIBLE_MODULES.filter((m) => saved[m.key]?.view && !matrix[m.key]?.view).map((m) => m.label) : [];
    if (revoked.length && !window.confirm(`Remove access to ${revoked.join(', ')} for ${userEmail}?`)) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const { error: err } = await supabase.rpc('erp_save_permissions', { p_user_id: userId, p_permissions: matrixToPayload(matrix) });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSaved(JSON.parse(JSON.stringify(matrix)));
    setNotice('Permissions saved. They apply the next time the user loads a page (no re-login needed).');
    // If an admin trimmed their own session's scope indirectly, refresh local nav.
    if (profile) void refreshPermissions();
    onSaved?.();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-3 border-slate-200 border-t-brand-500 rounded-full animate-spin" style={{ borderWidth: '3px' }} /></div>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 truncate">User Access — {userEmail}</h3>
          <p className="text-[11px] text-slate-500">{grantedCount} of {VISIBLE_MODULES.length} modules enabled{dirty ? ' · unsaved changes' : ''}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={selectAll}>Select All Allowed</Button>
          <Button variant="secondary" size="sm" onClick={() => setMatrix(emptyMatrix())}>Clear</Button>
          <Button variant="secondary" size="sm" disabled={!dirty} onClick={() => saved && setMatrix(JSON.parse(JSON.stringify(saved)))}>Cancel</Button>
          <Button size="sm" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save Permissions'}</Button>
        </div>
      </div>
      {error && <p className="text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm">{error}</p>}
      {notice && <p className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm">{notice}</p>}
      {isSuperTarget && <p className="text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">Super Admins always have full access across all companies — there is nothing to configure here.</p>}
      {(() => {
        const renderCategoryCard = (cat: string) => {
          const mods = VISIBLE_MODULES.filter((m) => m.category === cat);
          const isCollapsed = collapsed.has(cat);
          const selectable = isSuperTarget ? [] : mods.filter((m) => !lockedForCaller(m.key));
          const viewOn = selectable.filter((m) => matrix[m.key]?.view).length;
          const allOn = selectable.length > 0 && viewOn === selectable.length;
          const someOn = viewOn > 0 && viewOn < selectable.length;
          const bulkActions: PermAction[] = (['create', 'edit', 'delete', 'export'] as PermAction[]).filter((a) =>
            selectable.some((m) => (m.actions as string[]).includes(a)));
          const theme = CATEGORY_THEMES[cat] ?? {
            cardBg: 'bg-white',
            cardBorder: 'border-slate-200',
            headerBg: 'bg-slate-50/70',
            headerBorder: 'border-slate-100',
            headerText: 'text-slate-700',
            badgeBg: 'bg-slate-100',
            badgeText: 'text-slate-500',
            divider: 'divide-slate-100',
            rowHover: 'hover:bg-slate-50/50',
            accent: 'accent-brand-600',
            toggleOn: 'bg-brand-600',
          };

          return (
            <div key={cat} className={`${theme.cardBg} rounded-xl border ${theme.cardBorder} shadow-sm overflow-hidden transition-shadow`}>
              <div className={`flex items-center gap-2 pl-2 pr-2.5 h-9 ${theme.headerBg} border-b ${theme.headerBorder}`}>
                <button type="button" onClick={() => setCollapsed((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; })}
                  className="flex items-center gap-1.5 min-w-0 shrink-0 hover:opacity-80" title={isCollapsed ? `Expand ${cat}` : `Collapse ${cat}`}>
                  {isCollapsed ? <ChevronRight size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
                  <span className={`text-xs font-bold ${theme.headerText} uppercase tracking-wider truncate`}>{cat}</span>
                  {cat === 'Sales Pipeline Columns' && <span className="ml-1 text-[10px] font-medium normal-case text-slate-500">· the columns inside Sales Pipelines</span>}
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${theme.badgeBg} ${theme.badgeText} shrink-0`}>{viewOn}/{mods.length}</span>
                </button>
                <TriCheckbox checked={allOn} indeterminate={someOn} disabled={selectable.length === 0}
                  label="Select All" accentClass={theme.accent}
                  title={selectable.length === 0 ? 'No grantable modules in this category' : `Turn View ${allOn ? 'off' : 'on'} for every ${cat} module (actions untouched when turning on)`}
                  onChange={(on) => setCategoryView(cat, on)} />
                <div className="relative shrink-0 ml-auto">
                  <button type="button" onClick={() => setMenuFor(menuFor === cat ? null : cat)} disabled={selectable.length === 0}
                    className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:text-slate-800 border border-slate-200/90 rounded-md bg-white shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Bulk actions for this category">
                    Actions
                    <ChevronDown size={12} className={`transition-transform ${menuFor === cat ? 'rotate-180' : ''}`} />
                  </button>
                  {menuFor === cat && (
                    <>
                      <button type="button" aria-label="Close menu" onClick={() => setMenuFor(null)} className="fixed inset-0 z-10 cursor-default" />
                      <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                        {bulkActions.map((a) => (
                          <button key={a} type="button" onClick={() => setCategoryAction(cat, a)}
                            className="w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900">
                            Enable {ACTION_LABELS[a]} for this category
                          </button>
                        ))}
                        <div className="border-t border-slate-100 mt-1 pt-1">
                          <button type="button" onClick={() => setCategoryAction(cat, 'clear')}
                            className="w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900">
                            Clear optional actions (keep View)
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {!isCollapsed && (
                <div className={`divide-y ${theme.divider}`}>
                  {mods.map((m) => {
                    const locked = lockedForCaller(m.key);
                    const isOff = fullOff.has(m.key);
                    // A module that is fully off has no rights for anybody, so its row is shown switched off and locked.
                    const f = isOff ? emptyFlags0 : matrix[m.key];
                    return (
                      <div key={m.key} className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-1.5 ${theme.rowHover} transition-colors`}>
                        <label className="flex items-center gap-2 min-w-[9.5rem] cursor-pointer">
                          <button type="button" role="switch" aria-checked={f.view} disabled={locked || isSuperTarget || fullOff.has(m.key)}
                            onClick={() => setModule(m.key, { view: !f.view })}
                            className={`relative w-8 h-4.5 rounded-full transition-colors shrink-0 ${f.view ? theme.toggleOn : 'bg-slate-300'} ${(locked || isSuperTarget) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            style={{ height: '18px', width: '32px' }}>
                            <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${f.view ? 'left-[15px]' : 'left-0.5'}`} />
                          </button>
                          <span className="text-xs font-semibold text-slate-800 truncate">{m.label}</span>
                          {locked && <Lock size={12} className="text-slate-400 shrink-0" />}
                          {fullOff.has(m.key) && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-700 whitespace-nowrap" data-testid="off-badge">Off for everyone</span>}
                          {PIPELINE_ONLY[m.key] && <span className="text-[10px] text-slate-400 whitespace-nowrap" title="No sidebar entry — this permission controls the Sales Pipeline column, KPI tile and list access">via Sales Pipeline</span>}
                        </label>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          {!NEVER_OFF.includes(m.key) && !locked && (
                            <button type="button" role="switch" aria-checked={fullOff.has(m.key)} aria-label={`Full off ${m.label}`}
                              title={fullOff.has(m.key) ? `Click to switch ${m.label} back on for the whole company` : `Switch ${m.label} fully off: its menu disappears for everyone in the company`}
                              onClick={() => void toggleFullOff(m.key, m.label)}
                              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${fullOff.has(m.key) ? 'border-red-600 bg-red-600 text-white hover:bg-red-700' : 'border-slate-200 bg-white text-slate-500 hover:border-red-300 hover:text-red-600'}`}>
                              <Power size={10} />{fullOff.has(m.key) ? 'Full off · click to turn on' : 'Full off'}
                            </button>
                          )}
                          {m.actions.filter((a) => a !== 'view').map((a) => (
                            <label key={a} className={`flex items-center gap-1 text-[11px] ${(locked || isSuperTarget || isOff || !f.view) ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 cursor-pointer hover:text-slate-900'}`}>
                              <input type="checkbox" disabled={locked || isSuperTarget || isOff || !f.view} checked={!!f[a]}
                                onChange={(e) => setModule(m.key, { [a]: e.target.checked } as Partial<Record<PermAction, boolean>>)}
                                className={`w-3.5 h-3.5 rounded ${theme.accent}`} />
                              {ACTION_LABELS[a]}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        };

        // Distribute categories across two vertical columns so cards stack tightly with no blank gaps below shorter boxes
        const leftCategories = ['Overview', 'Production', 'Inventory & Purchasing'];
        const rightCategories = ['Sales', 'Sales Pipeline Columns', 'Logistics', 'Finance', 'Administration'];

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            <div className="flex flex-col gap-3">
              {leftCategories.map(renderCategoryCard)}
            </div>
            <div className="flex flex-col gap-3">
              {rightCategories.map(renderCategoryCard)}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

interface AccessUser {
  id: string;
  email: string;
  full_name: string;
  role: ErpRole;
  status: 'Active' | 'Inactive';
  company_id: string | null;
  company_name: string;
}

export function AccessPage() {
  const { profile, company, isSuperAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { companies } = useCompanies();
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [moduleCounts, setModuleCounts] = useState<Record<string, number>>({});
  const selectedUserId = searchParams.get('user') ?? null;
  const focusedCompany = searchParams.get('company') ?? null;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('company_users')
      .select('id, email, full_name, role, status, company_id, companies!company_users_company_id_fkey(company_name)')
      .order('created_at', { ascending: false });
    if (error) console.error('Failed to load users:', error);
    const rows = ((data as any[]) || []).map((u) => ({
      id: u.id, email: u.email, full_name: u.full_name, role: u.role, status: u.status,
      company_id: u.company_id, company_name: u.companies?.company_name ?? (u.role === 'SUPER_ADMIN' ? 'All companies' : '—'),
    }));
    // Company Admins see their own company (RLS already restricts; this is display only).
    setUsers(isSuperAdmin ? rows : rows.filter((u) => u.company_id === profile?.company_id || u.id === profile?.id));
    setLoading(false);
  }, [isSuperAdmin, profile?.company_id, profile?.id]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const visibleCompanies = useMemo(() => {
    const list = isSuperAdmin ? companies : companies.filter((c) => c.id === profile?.company_id);
    const q = query.trim().toLowerCase();
    const rf = roleFilter, sf = statusFilter;
    return list
      .filter((c) => !focusedCompany || c.id === focusedCompany)
      .map((c) => ({
        ...c,
        users: users.filter((u) =>
          u.company_id === c.id &&
          (!q || u.email.toLowerCase().includes(q) || (u.full_name || '').toLowerCase().includes(q)) &&
          (!rf || u.role === rf) &&
          (!sf || u.status === sf)),
      }))
      .filter((c) => {
        const q = query.trim().toLowerCase();
        return c.users.length > 0 || (!q && !roleFilter && !statusFilter && !focusedCompany) || (q && c.company_name.toLowerCase().includes(q));
      });
  }, [companies, users, query, roleFilter, statusFilter, focusedCompany, isSuperAdmin]);

  // Company Admins land expanded on their own company; deep links expand too.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!isSuperAdmin && profile?.company_id) next.add(profile.company_id);
      if (focusedCompany) next.add(focusedCompany);
      const sel = users.find((u) => u.id === selectedUserId);
      if (sel?.company_id) next.add(sel.company_id);
      return next;
    });
  }, [isSuperAdmin, profile?.company_id, focusedCompany, selectedUserId, users]);

  const toggleCompany = async (id: string) => {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    // Lazy module counts for the expanded company (one small RPC per user).
    const list = users.filter((u) => u.company_id === id && moduleCounts[u.id] === undefined);
    if (!list.length) return;
    const entries = await Promise.all(list.map(async (u) => {
      const { data, error } = await supabase.rpc('erp_get_user_permissions', { p_user_id: u.id });
      if (error || !data) return [u.id, -1] as const;
      if (data.role === 'SUPER_ADMIN' || data.role === 'COMPANY_ADMIN') return [u.id, -2] as const; // full by role
      return [u.id, (data.permissions ?? []).filter((p: any) => p.can_view).length] as const;
    }));
    setModuleCounts((prev) => {
      const n = { ...prev };
      entries.forEach(([id, c]) => { n[id] = c; });
      return n;
    });
  };

  const selectUser = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('user', id); else next.delete('user');
    setSearchParams(next, { replace: true });
  };

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;
  const canManage = (u: AccessUser) =>
    u.id !== profile?.id && (isSuperAdmin || (u.role !== 'SUPER_ADMIN' && u.company_id === profile?.company_id));

  // Title lives in the top bar (same line as date/profile); nothing rendered here.
  const { setHeader } = useHeaderKpis();
  useEffect(() => {
    setHeader({
      title: 'Company & Access Management',
      subtitle: isSuperAdmin ? 'All Companies → Company → Users → Permissions' : `${company?.company_name ?? 'Your company'} → Users → Permissions`,
    });
    return () => setHeader(null);
  }, [setHeader, isSuperAdmin, company?.company_name]);

  return (
    <div className="p-3 bg-grid min-h-full">
      {focusedCompany && (
        <div className="mb-2">
          <Button variant="secondary" size="sm" onClick={() => { const n = new URLSearchParams(searchParams); n.delete('company'); n.delete('user'); setSearchParams(n, { replace: true }); }}>← All companies</Button>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-2.5 items-start">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-2.5 border-b border-slate-100 flex flex-col gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search companies or users…"
                className="w-full pl-8 pr-2.5 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-brand-500" />
            </div>
            <div className="flex gap-2">
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white">
                <option value="">All roles</option>
                <option value="COMPANY_ADMIN">Company Admin</option>
                <option value="USER">Member</option>
                {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white">
                <option value="">Any status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
            ) : visibleCompanies.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No companies or users match.</p>
            ) : visibleCompanies.map((c) => {
              const open = expanded.has(c.id);
              return (
                <div key={c.id} className="border-b border-slate-100 last:border-0">
                  <button type="button" onClick={() => toggleCompany(c.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left">
                    {open ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                    <Building2 size={14} className="text-brand-500 shrink-0" />
                    <span className="text-sm font-bold text-slate-800 truncate">{c.company_name}</span>
                    <span className="ml-auto text-[11px] text-slate-400 shrink-0">{c.users.length} user{c.users.length === 1 ? '' : 's'}</span>
                  </button>
                  {open && (
                    <div className="pb-1">
                      {c.users.length === 0 && <p className="text-xs text-slate-400 px-9 py-1.5">No users match the filters.</p>}
                      {c.users.map((u) => {
                        const mc = moduleCounts[u.id];
                        const active = u.id === selectedUserId;
                        return (
                          <button key={u.id} type="button" onClick={() => selectUser(active ? null : u.id)}
                            className={`w-full flex items-center gap-2 pl-9 pr-3 py-1 text-left hover:bg-brand-50/50 ${active ? 'bg-brand-50' : ''}`}>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-semibold text-slate-700 truncate">{u.full_name || u.email}</span>
                              <span className="block text-[11px] text-slate-400 truncate">
                                {ROLE_LABELS[u.role] ?? u.role} · {u.status}
                                {mc === undefined ? '' : mc === -2 ? ' · full access (role)' : ` · ${mc} modules`}
                              </span>
                            </span>
                            <Badge variant={u.status === 'Active' ? 'success' : 'error'} dot>{u.status}</Badge>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
          {selectedUser ? (
            canManage(selectedUser) ? (
              <PermissionEditor key={selectedUser.id} userId={selectedUser.id} userEmail={selectedUser.email} userRole={selectedUser.role} companyId={selectedUser.company_id} companyName={selectedUser.company_name} onSaved={() => loadUsers()} />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ShieldCheck size={28} className="text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-700">{selectedUser.email}</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  {selectedUser.id === profile?.id
                    ? 'You cannot edit your own permissions — ask another administrator.'
                    : 'You are not authorized to manage this user.'}
                </p>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <KeyRound size={28} className="text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-700">Select a user to manage access</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">Expand a company, pick a user, then toggle modules and actions. Changes save only when you press Save Permissions.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
