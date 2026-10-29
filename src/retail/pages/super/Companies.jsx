/* Unified Company Management — companies + admins + users on one page.
   Mirrors legacy vCompanyMgmt/coTable/admTable/usrTable and the App methods
   goMgmt/mgCard/openCoModal/saveCompanyModal/coToggle/coUserNew/saveUserModal/
   userView/coUserToggle/coUserRole/coDetails/mgExport/mgRefresh. */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useCompany } from '../../companyContext';
import { Building2 } from 'lucide-react';
import {
  PageHead, PageHero, Kpi, DataTable, Tabs, Modal, Field, Pager, Empty, Skeleton, statusBadge, toast, Confirm
} from '../../components/ui';
import { CompanyFormFields, emptyCompany, companyFromDetail, validateCompany, companyPayload } from './CompanyForm';
import { asRows, csvDownload, fetchCompanyOptions, UserModal, UserView, RoleButton, SuspendConfirm, toggleUserActive } from './_shared';

const MG_TABS = [
  ['companies', '🏢 Companies'],
  ['superadmins', '👑 Super Admins'],
  ['admins', '👔 Company Admins'],
  ['users', '👥 Company Users'],
  ['roles', '🛡️ Existing Roles']
];
const LIMIT = 8;

function useDebounced(value, ms = 280) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function Companies({ tab: tabProp }) {
  const { activeCompany, activeCompanyObj, setActiveCompany } = useCompany();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const tab = tabProp || (['superadmins', 'admins', 'users', 'roles'].includes(sp.get('tab')) ? sp.get('tab') : 'companies');

  const [stats, setStats] = useState(null);
  const [statsErr, setStatsErr] = useState('');
  const [cos, setCos] = useState([]); // company options for filters/dropdowns
  const [page, setPage] = useState(1);

  // Role and pricing tiers modals
  const [rolesModal, setRolesModal] = useState(false);
  const [addRoleModal, setAddRoleModal] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [editTcRole, setEditTcRole] = useState(null);

  // per-tab filters (mirror legacy ui.coFQ/coFStatus/…/admFQ…/usrFQ…)
  const [coQ, setCoQ] = useState('');
  const [coStatus, setCoStatus] = useState('all');
  const [coInd, setCoInd] = useState('all');
  const [coCity, setCoCity] = useState('all');
  const [superQ, setSuperQ] = useState('');
  const [admQ, setAdmQ] = useState('');
  const [admCo, setAdmCo] = useState(activeCompany || 'all');
  const [admSt, setAdmSt] = useState('all');
  const [usrQ, setUsrQ] = useState('');
  const [usrCo, setUsrCo] = useState(activeCompany || 'all');
  const [usrRole, setUsrRole] = useState('all');
  const [usrSt, setUsrSt] = useState('all');

  useEffect(() => {
    if (activeCompany !== 'all') {
      setAdmCo(activeCompany);
      setUsrCo(activeCompany);
    } else {
      setAdmCo('all');
      setUsrCo('all');
    }
  }, [activeCompany]);

  const dCoQ = useDebounced(coQ), dSuperQ = useDebounced(superQ), dAdmQ = useDebounced(admQ), dUsrQ = useDebounced(usrQ);

  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // modals
  const [coModal, setCoModal] = useState(null); // { id } — '' = create
  const [detailId, setDetailId] = useState(null);
  const [userModal, setUserModal] = useState(null); // { preset, editId }
  const [superAdminModal, setSuperAdminModal] = useState(null); // { user }
  const [deleteSuperTarget, setDeleteSuperTarget] = useState(null);
  const [viewUser, setViewUser] = useState(null);
  const [suspendCo, setSuspendCo] = useState(null);

  const goTab = (k, company) => {
    setPage(1);
    if (company !== undefined) { setAdmCo(company || 'all'); setUsrCo(company || 'all'); }
    if (tabProp) { nav('/super/companies?tab=' + k); return; }
    setSp({ tab: k });
  };

  const loadStats = useCallback(() => {
    api.get('/api/stats/platform').then(setStats).catch((e) => setStatsErr(e.message));
    fetchCompanyOptions().then(setCos).catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ?new=1 opens the create modal once (legacy render() behavior)
  useEffect(() => {
    if (sp.get('new') === '1' && !tabProp) {
      setCoModal({ id: '' });
      setSp({ tab: sp.get('tab') || 'companies' }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (tab === 'roles') {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let url;
      if (tab === 'companies') {
        const p = new URLSearchParams({ page, limit: LIMIT });
        if (dCoQ) p.set('q', dCoQ);
        if (coStatus !== 'all') p.set('status', coStatus);
        if (coInd !== 'all') p.set('industry', coInd);
        if (coCity !== 'all') p.set('city', coCity);
        url = '/api/companies?' + p;
      } else if (tab === 'superadmins') {
        const p = new URLSearchParams({ page, limit: LIMIT, role: 'super_admin' });
        if (dSuperQ) p.set('q', dSuperQ);
        url = '/api/users?' + p;
      } else if (tab === 'admins') {
        const p = new URLSearchParams({ page, limit: LIMIT, role: 'company_admin' });
        if (dAdmQ) p.set('q', dAdmQ);
        if (admCo !== 'all') p.set('companyId', admCo);
        if (admSt !== 'all') p.set('active', admSt);
        url = '/api/users?' + p;
      } else {
        const p = new URLSearchParams({ page, limit: LIMIT });
        if (dUsrQ) p.set('q', dUsrQ);
        if (usrCo !== 'all') p.set('companyId', usrCo);
        if (usrRole !== 'all') p.set('role', usrRole);
        if (usrSt !== 'all') p.set('active', usrSt);
        url = '/api/users?' + p;
      }
      const d = await api.get(url);
      const n = asRows(d);
      setData({ rows: tab === 'users' ? n.rows.filter((u) => u.role !== 'super_admin') : n.rows, total: n.total });
      setErr('');
    } catch (e) {
      setErr(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab, page, dCoQ, coStatus, coInd, coCity, dSuperQ, dAdmQ, admCo, admSt, dUsrQ, usrCo, usrRole, usrSt]);

  useEffect(() => { load(); }, [load]);

  const refresh = () => { loadStats(); load(); toast('Refreshed from database', '↻'); };

  // Fetch full detail first so the impact confirm shows live users/pending counts (legacy coToggle).
  async function askSuspend(c) {
    try {
      const d = await api.get('/api/companies/' + c.id);
      setSuspendCo({ ...c, ...d });
    } catch {
      setSuspendCo(c);
    }
  }

  function mgExport() {
    if (!data.rows.length) { toast('Nothing to export', '⚠️'); return; }
    if (tab === 'companies') {
      const cols = ['id', 'code', 'name', 'industry', 'email', 'phone', 'city', 'state', 'pin', 'status', 'plan', 'createdAt'];
      csvDownload(`company-mgCompanies-${new Date().toISOString().slice(0, 10)}.csv`, cols,
        data.rows.map((c) => [c.id, c.code || c.id, c.name, c.industry || '', c.email || '', c.phone || '', c.city || '', c.state || '', c.pin || '', c.storeStatus || c.status || '', c.plan || '', c.createdAt || '']));
    } else if (tab === 'superadmins') {
      const cols = ['id', 'name', 'email', 'mobile', 'role', 'status', 'created'];
      csvDownload(`super-admins-${new Date().toISOString().slice(0, 10)}.csv`, cols,
        data.rows.map((u) => [u.id, u.name, u.email, u.mobile || '', u.role, u.active !== false ? 'active' : 'inactive', u.createdAt || '']));
    } else {
      const cols = ['id', 'name', 'email', 'mobile', 'role', 'company', 'status', 'created'];
      csvDownload(`company-${tab === 'admins' ? 'mgAdmins' : 'mgUsers'}-${new Date().toISOString().slice(0, 10)}.csv`, cols,
        data.rows.map((u) => [u.id, u.name, u.email, u.mobile || '', u.role, u.companyName || u.companyId, u.active !== false ? 'active' : 'inactive', u.createdAt || '']));
    }
    toast(data.rows.length + ' rows exported', '⤓');
  }

  const mgCard = (kind) => {
    setPage(1);
    if (kind === 'all') { setCoStatus('all'); goTab('companies'); }
    else if (kind === 'active' || kind === 'suspended') { setCoStatus(kind); goTab('companies'); }
    else if (kind === 'superadmins') goTab('superadmins');
    else if (kind === 'admins') goTab('admins');
    else if (kind === 'users') goTab('users');
    else if (kind === 'products') nav('/super/catalog');
    else nav('/super/orders');
  };

  const s = stats || {};
  const totalUsers = (s.admins || 0) + (s.salesUsers || 0);

  return (
    <>
      <PageHero
        title="Company Hub"
        subtitle="Manage registered enterprises, tenant administrators, user accounts, and tier permissions."
        icon={Building2}
        gradient="from-sky-500 via-cyan-500 to-blue-600"
        actions={<>
          <button className="btn btn-ghost btn-sm" onClick={mgExport}>⤓ Export</button>
          <button className="btn btn-ghost btn-sm" onClick={refresh}>↻ Refresh</button>
          {tab === 'superadmins' ? (
            <button className="btn btn-primary btn-sm bg-sky-600 hover:bg-sky-700 border-none shadow-sm shadow-sky-600/30 text-white" onClick={() => setSuperAdminModal({ user: null })}>
              + Add Super Admin
            </button>
          ) : tab === 'users' ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddRoleModal(true)} title="Create new role">
                + Add Role
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setUserModal({ preset: { role: 'company_admin' } })}>
                + Invite Admin
              </button>
              <button className="btn btn-primary btn-sm bg-sky-600 hover:bg-sky-700 border-none shadow-sm shadow-sky-600/30 text-white" onClick={() => setUserModal({ preset: { role: 'sales_regional_partner' } })}>
                + Add User
              </button>
            </>
          ) : tab === 'roles' ? (
            <button className="btn btn-primary btn-sm bg-sky-600 hover:bg-sky-700 border-none shadow-sm shadow-sky-600/30 text-white" onClick={() => setAddRoleModal(true)} title="Create new role">
              + Add Role
            </button>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setUserModal({ preset: { role: 'company_admin' } })}>
                + Invite Admin
              </button>
              <button className="btn btn-primary btn-sm bg-sky-600 hover:bg-sky-700 border-none shadow-sm shadow-sky-600/30 text-white" onClick={() => setCoModal({ id: '' })}>
                + Create Company
              </button>
            </>
          )}
        </>}
        tabs={<Tabs compact className="mb-0" tabs={MG_TABS} active={tab} onTab={(k) => goTab(k)} />}
      />
      {activeCompanyObj && (
        <div className="flex items-center justify-between gap-3 p-3.5 mb-3 bg-sky-50/90 border border-sky-200/90 rounded-2xl shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{activeCompanyObj.logo || '🏭'}</span>
            <div>
              <div className="text-xs font-bold text-slate-900">
                Active Tenant Scope: <span className="text-sky-700 font-extrabold">{activeCompanyObj.name}</span> <span className="font-mono text-slate-500">({activeCompanyObj.code || activeCompanyObj.id})</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Admins and user directories are scoped to this company
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveCompany('all')}
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-sky-800 hover:text-sky-950 bg-white hover:bg-sky-100/60 border border-sky-200 transition-colors cursor-pointer shadow-2xs"
          >
            Reset to All Companies
          </button>
        </div>
      )}
      {statsErr && <Empty icon="⚠️" title={'⚠️ ' + statsErr} />}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-1.5">
        <Kpi small onClick={() => mgCard('all')} value={s.companies ?? '—'} label="Total companies" sub={`${s.activeCompanies ?? 0} act · ${s.suspendedCompanies ?? 0} susp`} grad="linear-gradient(135deg,#0284c7,#0369a1)" />
        <Kpi small onClick={() => mgCard('users')} value={stats ? totalUsers : '—'} label="Company users" sub={`${s.admins ?? 0} admins · ${s.salesUsers ?? 0} sales`} grad="linear-gradient(135deg,#0891b2,#0e7490)" />
        <Kpi small onClick={() => mgCard('products')} value={s.products ?? '—'} label="Products" sub="across companies" grad="linear-gradient(135deg,#4f46e5,#4338ca)" />
        <Kpi small onClick={() => mgCard('orders')} value={s.orders ?? '—'} label="Orders" sub="across companies" grad="linear-gradient(135deg,#7c3aed,#6d28d9)" />
      </div>
      <div className="card">
        <div className="card-pad">
          {tab === 'companies' && (
            <CompaniesTab
              q={coQ} setQ={(x) => { setCoQ(x); setPage(1); }} status={coStatus} setStatus={(x) => { setCoStatus(x); setPage(1); }}
              ind={coInd} setInd={(x) => { setCoInd(x); setPage(1); }} city={coCity} setCity={(x) => { setCoCity(x); setPage(1); }}
              cos={cos} data={data} loading={loading} err={err} page={page} setPage={setPage}
              onDetails={setDetailId} onEdit={(id) => setCoModal({ id })} onToggle={(c) => askSuspend(c)}
            />
          )}
          {tab === 'superadmins' && (
            <SuperAdminsTab
              q={superQ} setQ={(x) => { setSuperQ(x); setPage(1); }}
              data={data} loading={loading} err={err} page={page} setPage={setPage}
              onAdd={() => setSuperAdminModal({ user: null })}
              onEdit={(u) => setSuperAdminModal({ user: u })}
              onToggle={(u) => toggleUserActive(u, load)}
              onDelete={(u) => setDeleteSuperTarget(u)}
            />
          )}
          {tab === 'admins' && (
            <AdminsTab
              q={admQ} setQ={(x) => { setAdmQ(x); setPage(1); }} co={admCo} setCo={(x) => { setAdmCo(x); setPage(1); }}
              st={admSt} setSt={(x) => { setAdmSt(x); setPage(1); }} cos={cos} data={data} loading={loading} err={err}
              page={page} setPage={setPage} onInvite={() => setUserModal({ preset: { role: 'company_admin' } })}
              onView={setViewUser} onEdit={(id) => setUserModal({ editId: id })} onToggle={(u) => toggleUserActive(u, load)}
            />
          )}
          {tab === 'users' && (
            <UsersTab
              data={data} loading={loading} err={err} page={page} setPage={setPage}
              onView={setViewUser}
              onEdit={(id) => setUserModal({ editId: id })} onToggle={(u) => toggleUserActive(u, load)} onRoleChanged={load}
            />
          )}
          {tab === 'roles' && (
            <RolesTab
              onAddRole={() => setAddRoleModal(true)}
              onEditRole={(r) => setEditRole(r)}
              onEditTc={(r) => setEditTcRole(r)}
              onRoleChanged={load}
            />
          )}
        </div>
      </div>

      {rolesModal && (
        <RolesModal 
          onClose={() => setRolesModal(false)} 
          onAddRole={() => { setRolesModal(false); setAddRoleModal(true); }}
          onEditRole={(r) => { setRolesModal(false); setEditRole(r); }}
          onEditTc={(r) => { setRolesModal(false); setEditTcRole(r); }}
          onRoleChanged={load}
        />
      )}
      {addRoleModal && (
        <RoleEditModal 
          onClose={() => setAddRoleModal(false)} 
          onSaved={() => { setAddRoleModal(false); load(); }} 
        />
      )}
      {editRole && (
        <RoleEditModal 
          role={editRole} 
          onClose={() => setEditRole(null)} 
          onSaved={() => { setEditRole(null); load(); }} 
        />
      )}
      {editTcRole && (
        <RoleTcModal
          role={editTcRole}
          onClose={() => setEditTcRole(null)}
          onSaved={() => { setEditTcRole(null); load(); }}
        />
      )}

      {superAdminModal && (
        <SuperAdminModal
          user={superAdminModal.user}
          onClose={() => setSuperAdminModal(null)}
          onSaved={() => { setSuperAdminModal(null); load(); }}
        />
      )}
      {deleteSuperTarget && (
        <Confirm
          title="Delete Super Administrator"
          body={`Are you sure you want to permanently remove <b>${deleteSuperTarget.name || deleteSuperTarget.email}</b> (${deleteSuperTarget.email}) from Super Administrators? They will immediately lose platform root access.`}
          okLabel="Delete Super Admin"
          danger
          onCancel={() => setDeleteSuperTarget(null)}
          onOk={async () => {
            try {
              await api.del(`/api/users/${deleteSuperTarget.id}`);
              toast('Super administrator removed', '🗑️');
              setDeleteSuperTarget(null);
              load();
            } catch (err) {
              toast(err.message || 'Failed to delete super admin', '⚠️');
            }
          }}
        />
      )}

      {coModal && <CompanyModal id={coModal.id} onClose={() => setCoModal(null)} onSaved={() => { setCoModal(null); load(); loadStats(); }} />}
      {detailId && <CompanyDetails id={detailId} onClose={() => setDetailId(null)} onEdit={(id) => { setDetailId(null); setCoModal({ id }); }} onManage={(t, co) => { setDetailId(null); goTab(t, co); }} />}
      {userModal && <UserModal preset={userModal.preset} editId={userModal.editId} onClose={() => setUserModal(null)} onSaved={() => { setUserModal(null); load(); loadStats(); }} />}
      {viewUser && <UserView id={viewUser} onClose={() => setViewUser(null)} onChanged={() => { setViewUser(null); load(); }} onEdit={(id) => { setViewUser(null); setUserModal({ editId: id }); }} />}
      {suspendCo && <SuspendConfirm co={suspendCo} onCancel={() => setSuspendCo(null)} onDone={() => { setSuspendCo(null); load(); loadStats(); }} />}
    </>
  );
}

/* ---------------- companies tab ---------------- */
function CompaniesTab({ q, setQ, status, setStatus, ind, setInd, city, setCity, cos, data, loading, err, page, setPage, onDetails, onEdit, onToggle }) {
  if (loading) return <Skeleton h={220} />;
  if (err) return <Empty title={'⚠️ ' + err} />;
  return (
    <>
      <DataTable
        rowKey={(r) => r.id}
        empty="No companies match."
        cols={[
          { key: 'co', label: 'Company', render: (c) => <><b>{c.logo || '🏭'} {c.name}</b><div className="hint">{c.city}{c.state ? ', ' + c.state : ''}</div></> },
          { key: 'code', label: 'Code', render: (c) => <b>{c.code || c.id}</b> },
          { key: 'industry', label: 'Industry', render: (c) => c.industry || '—' },
          { key: 'admin', label: 'Admin', render: (c) => c.admin || '-' },
          { key: 'users', label: 'Users', render: (c) => c.userCount ?? '' },
          { key: 'skus', label: 'SKUs', render: (c) => c.productCount ?? '' },
          { key: 'orders', label: 'Orders', render: (c) => c.orderCount ?? '' },
          { key: 'status', label: 'Status', render: (c) => statusBadge((c.storeStatus || c.status) === 'active' ? 'Delivered' : 'Cancelled') },
          { key: 'created', label: 'Created', render: (c) => <span className="hint">{c.createdAt || '—'}</span> },
          {
            key: 'act', label: 'Actions', render: (c) => (
              <span style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => onDetails(c.id)}>Details</button>{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(c.id)}>Edit</button>{' '}
                <Link className="btn btn-ghost btn-sm" to={'/super/companies/' + c.id}>Open</Link>{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => onToggle(c)}>{(c.storeStatus || c.status) === 'active' ? 'Suspend' : 'Activate'}</button>
              </span>
            )
          }
        ]}
        rows={data.rows}
      />
      <Pager total={data.total} page={page} limit={LIMIT} onPage={setPage} />
    </>
  );
}

/* ---------------- admins tab ---------------- */
function AdminsTab({ q, setQ, co, setCo, st, setSt, cos, data, loading, err, page, setPage, onInvite, onView, onEdit, onToggle }) {
  if (loading) return <Skeleton h={220} />;
  if (err) return <Empty title={'⚠️ ' + err} />;
  return (
    <>
      <DataTable
        rowKey={(r) => r.id}
        empty="No administrators match."
        cols={[
          { key: 'name', label: 'Name', render: (u) => <b>{u.name}</b> },
          { key: 'email', label: 'Email', render: (u) => u.email },
          { key: 'co', label: 'Company', render: (u) => u.companyName || u.companyId },
          { key: 'mob', label: 'Mobile', render: (u) => u.mobile || '—' },
          { key: 'st', label: 'Status', render: (u) => statusBadge(u.active !== false ? 'Delivered' : 'Cancelled') },
          { key: 'cr', label: 'Created', render: (u) => <span className="hint">{u.createdAt || '—'}</span> },
          {
            key: 'act', label: 'Actions', render: (u) => (
              <span style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => onView(u.id)}>View</button>{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(u.id)}>Edit</button>{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => onToggle(u)}>{u.active !== false ? 'Deactivate' : 'Activate'}</button>
              </span>
            )
          }
        ]}
        rows={data.rows}
      />
      <Pager total={data.total} page={page} limit={LIMIT} onPage={setPage} />
    </>
  );
}

/* ---------------- users tab ---------------- */
function UsersTab({ data, loading, err, page, setPage, onView, onEdit, onToggle, onRoleChanged }) {
  if (loading) return <Skeleton h={220} />;
  if (err) return <Empty title={'⚠️ ' + err} />;
  return (
    <>
      <DataTable
        rowKey={(r) => r.id}
        empty="No users match."
        cols={[
          { key: 'name', label: 'Name', render: (u) => <b>{u.name}</b> },
          { key: 'email', label: 'Email', render: (u) => u.email },
          { key: 'co', label: 'Company', render: (u) => u.companyName || u.companyId },
          { 
            key: 'role', 
            label: 'Role & Tier', 
            render: (u) => (
              <span>
                <b>{u.roleName || (u.role === 'company_admin' ? 'Company Admin' : u.role === 'super_admin' ? 'Super Admin' : u.role)}</b>
                {u.markupPct ? (
                  <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', background: '#DBEAFE', color: '#1E40AF', borderRadius: 4, fontWeight: 700 }}>
                    +{u.markupPct}%
                  </span>
                ) : null}
              </span>
            )
          },
          { key: 'mob', label: 'Mobile', render: (u) => u.mobile || '—' },
          { key: 'st', label: 'Status', render: (u) => statusBadge(u.active !== false ? 'Delivered' : 'Cancelled') },
          {
            key: 'act', label: 'Actions', render: (u) => (
              <span style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => onView(u.id)}>View</button>{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(u.id)}>Edit</button>{' '}
                <RoleButton id={u.id} role={u.role} name={u.name} company={u.companyName || u.companyId} onChanged={onRoleChanged} />{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => onToggle(u)}>{u.active !== false ? 'Deactivate' : 'Activate'}</button>
              </span>
            )
          }
        ]}
        rows={data.rows}
      />
      <Pager total={data.total} page={page} limit={LIMIT} onPage={setPage} />
    </>
  );
}

/* ---------------- company create/edit modal ---------------- */
function CompanyModal({ id, onClose, onSaved }) {
  const isEdit = !!id;
  const [v, setV] = useState(emptyCompany());
  const [ready, setReady] = useState(!isEdit);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    api.get('/api/companies/' + id)
      .then((c) => { setV(companyFromDetail(c)); setReady(true); })
      .catch((e) => setErr(e.message || 'Company not found.'));
  }, [id, isEdit]);

  const on = (k, val) => setV((p) => ({ ...p, [k]: val }));

  async function save() {
    setErr('');
    let codes = [];
    if (!isEdit) {
      try {
        const all = await api.get('/api/companies?limit=200');
        codes = asRows(all).rows.map((x) => (x.code || x.id || '').toUpperCase());
      } catch { /* server enforces uniqueness */ }
    }
    const msg = validateCompany(v, { isNew: !isEdit, codes });
    if (msg) { setErr(msg); return; }
    setSaving(true);
    try {
      const payload = companyPayload(v, !isEdit);
      if (isEdit) await api.put('/api/companies/' + id, payload);
      else await api.post('/api/companies', payload);
      toast(isEdit ? 'Company updated' : v.name.trim() + ' created — available immediately', '🏭');
      onSaved();
    } catch (e) {
      setErr(e.message || 'Save failed');
      setSaving(false);
    }
  }

  return (
    <Modal title={'🏢 ' + (isEdit ? 'Edit Company' + (v.name ? ' — ' + v.name : '') : 'Create Company')} onClose={onClose} wide>
      {!ready ? <p className="hint">Loading…</p> : <CompanyFormFields v={v} on={on} errors={{}} isNew={!isEdit} codeLocked={isEdit} />}
      {err && <div className="hint" style={{ color: '#DC2626', marginTop: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" id="coSaveBtn" disabled={saving || !ready} onClick={save}>💾 {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create company')}</button>
      </div>
    </Modal>
  );
}

/* ---------------- company details modal with quick actions ---------------- */
function CompanyDetails({ id, onClose, onEdit, onManage }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get('/api/companies/' + id).then(setD).catch((e) => setErr(e.message || 'Company not found.'));
  }, [id]);

  if (err) return <Modal title="🏢 Company details" onClose={onClose} wide><Empty title={'⚠️ ' + err} /></Modal>;
  if (!d) return <Modal title="🏢 Company details" onClose={onClose} wide><Skeleton h={160} /></Modal>;

  const st = d.storeStatus || d.status;
  const adm = d.admin || {};
  return (
    <Modal title={(d.logo || '🏭') + ' ' + d.name} onClose={onClose} wide>
      <p className="hint" style={{ marginTop: 0 }}>{d.code || d.id} • {d.industry || ''} • {d.city || ''} {statusBadge(st === 'active' ? 'Delivered' : 'Cancelled')}</p>
      <div className="form-grid">
        <Field label="Email / Phone"><div style={{ fontSize: 13 }}><b>{d.email || '—'}</b><div className="hint">{d.phone || ''}</div></div></Field>
        <Field label="Address"><div style={{ fontSize: 13 }}>{d.address || '—'}<div className="hint">{d.city || ''} {d.state || ''} {d.pin || ''}</div></div></Field>
        <Field label="Company Admin"><div style={{ fontSize: 13 }}><b>{adm.name || '—'}</b><div className="hint">{adm.email || ''}</div></div></Field>
        <Field label="Plan / Created"><div style={{ fontSize: 13 }}>{d.plan || ''}<div className="hint">{d.createdAt || ''}</div></div></Field>
      </div>
      {d.description && <p style={{ fontSize: 13 }}>{d.description}</p>}
      <div className="mgmt-cards" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="ind-stat"><b>{d.userCount || 0}</b><p>Users</p></div>
        <div className="ind-stat"><b>{d.productCount || 0}</b><p>SKUs</p></div>
        <div className="ind-stat"><b>{d.orderCount || 0}</b><p>Orders</p></div>
        <div className="ind-stat"><b>₹{(d.revenue || 0).toLocaleString('en-IN')}</b><p>Revenue</p></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => onEdit(d.id)}>Edit Company</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onManage('admins', d.id)}>Manage Admins</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onManage('users', d.id)}>Manage Users</button>
        <Link className="btn btn-ghost btn-sm" to={'/super/companies/' + d.id + '?tab=catalog'} onClick={onClose}>Products</Link>
        <Link className="btn btn-ghost btn-sm" to={'/super/companies/' + d.id + '?tab=categories'} onClick={onClose}>Categories</Link>
        <Link className="btn btn-ghost btn-sm" to={'/super/companies/' + d.id + '?tab=orders'} onClick={onClose}>Orders</Link>
        <Link className="btn btn-ghost btn-sm" to={'/super/companies/' + d.id} onClick={onClose}>Full workspace →</Link>
      </div>
    </Modal>
  );
}

/* ---------------- Roles Management View (Used in Tab and Modal) ---------------- */
function RolesTab({ onAddRole, onEditRole, onEditTc, onRoleChanged, isModal }) {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [draftPcts, setDraftPcts] = useState({});

  const loadRoles = useCallback(() => {
    setLoading(true);
    api.get('/api/roles')
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setRoles(list);
        const pcts = {};
        list.forEach((r) => { pcts[r.id] = r.markupPct != null ? String(r.markupPct) : '0'; });
        setDraftPcts(pcts);
        setLoading(false);
      })
      .catch((e) => { setErr(e.message || 'Failed to load roles'); setLoading(false); });
  }, []);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  // Quick save markup % directly
  async function saveMarkup(r) {
    const val = Number(draftPcts[r.id]);
    if (isNaN(val) || val < 0) {
      toast('Please enter a valid markup percentage >= 0', '⚠️');
      return;
    }
    setSavingId(r.id);
    try {
      await api.patch('/api/roles/' + r.id, { markupPct: val });
      toast(`${r.name} markup set to +${val}%`, '✅');
      loadRoles();
      if (onRoleChanged) onRoleChanged();
    } catch (e) {
      toast(e.message || 'Failed to update markup', '⚠️');
    } finally {
      setSavingId(null);
    }
  }

  // Quick toggle T&C mandatory
  async function toggleRequireTerms(r) {
    const nextVal = !r.requireTerms;
    try {
      await api.patch('/api/roles/' + r.id, { requireTerms: nextVal });
      toast(`${r.name}: T&C is now ${nextVal ? 'Mandatory' : 'Optional'}`, '📜');
      loadRoles();
      if (onRoleChanged) onRoleChanged();
    } catch (e) {
      toast(e.message || 'Failed to update T&C requirement', '⚠️');
    }
  }

  async function handleDelete(r) {
    if (r.isSystem) return;
    if (!window.confirm(`Delete custom role "${r.name}"?`)) return;
    try {
      await api.del('/api/roles/' + r.id);
      toast(`Role ${r.name} deleted`, '🗑️');
      loadRoles();
      if (onRoleChanged) onRoleChanged();
    } catch (e) {
      toast(e.message || 'Delete failed', '⚠️');
    }
  }

  const filtered = roles.filter((r) => {
    if (!q) return true;
    const term = q.toLowerCase();
    return (r.name || '').toLowerCase().includes(term) ||
           (r.id || '').toLowerCase().includes(term) ||
           (r.category || '').toLowerCase().includes(term) ||
           (r.description || '').toLowerCase().includes(term);
  });

  const partnerCount = roles.filter((r) => r.category === 'sales_partner').length;
  const internalCount = roles.filter((r) => r.category !== 'sales_partner').length;

  return (
    <div className="space-y-3">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingBottom: 8, borderBottom: '1px solid #E2E8F0' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🛡️ Configured Roles & Partner Pricing Tiers</span>
            <span style={{ fontSize: 11, background: '#EFF6FF', color: '#1D4ED8', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
              {roles.length} Roles ({partnerCount} Sales Partners · {internalCount} Internal)
            </span>
          </div>
          <p className="hint" style={{ margin: '2px 0 0 0', fontSize: 11.5 }}>
            Directly configure price markup %, enforce mandatory Terms & Conditions, and adjust role definitions. Pricing updates immediately apply across retail catalog & checkout.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search roles…"
            className="input-sm"
            style={{ width: 170, fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #CBD5E1' }}
          />
          <button className="btn btn-primary btn-sm" onClick={onAddRole} title="Create a new role or pricing tier">
            + Add Role
          </button>
        </div>
      </div>

      {loading && <Skeleton h={220} />}
      {err && <div className="hint" style={{ color: '#DC2626' }}>{err}</div>}

      {!loading && !err && (
        <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
          <table className="data-table" style={{ width: '100%', minWidth: 840, fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px', minWidth: 160 }}>Role / Tier Name</th>
                <th style={{ padding: '8px 10px', minWidth: 120 }}>Category</th>
                <th style={{ padding: '8px 10px', minWidth: 160 }}>Price Markup % (Direct Edit)</th>
                <th style={{ padding: '8px 10px', minWidth: 180 }}>Terms & Conditions (T&C)</th>
                <th style={{ padding: '8px 10px', minWidth: 150 }}>Description</th>
                <th style={{ padding: '8px 10px', minWidth: 110, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const draft = draftPcts[r.id] ?? (r.markupPct != null ? String(r.markupPct) : '0');
                const isModified = String(draft) !== String(r.markupPct != null ? r.markupPct : '0');
                const numDraft = Number(draft) || 0;
                const samplePrice = Math.round(1000 * (1 + numDraft / 100));

                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <b style={{ color: '#0F172A' }}>{r.name}</b>
                        {r.isSystem ? (
                          <span style={{ fontSize: 9.5, background: '#F1F5F9', color: '#64748B', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>Core System</span>
                        ) : (
                          <span style={{ fontSize: 9.5, background: '#EEF2FF', color: '#4F46E5', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>Custom Tier</span>
                        )}
                      </div>
                      <div className="hint" style={{ fontSize: 10, fontFamily: 'monospace' }}>{r.id}</div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ 
                        fontSize: 10.5, 
                        fontWeight: 700, 
                        padding: '2px 8px', 
                        borderRadius: 12, 
                        background: r.category === 'sales_partner' ? '#EFF6FF' : '#F1F5F9',
                        color: r.category === 'sales_partner' ? '#1D4ED8' : '#475569'
                      }}>
                        {r.category === 'sales_partner' ? '🤝 Sales Partner' : '🏢 Internal'}
                      </span>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={draft}
                          onChange={(e) => setDraftPcts({ ...draftPcts, [r.id]: e.target.value })}
                          style={{
                            width: 65,
                            padding: '3px 6px',
                            fontSize: 12,
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            borderRadius: 6,
                            border: isModified ? '2px solid #2563EB' : '1px solid #CBD5E1',
                            background: isModified ? '#EFF6FF' : '#FFFFFF',
                            textAlign: 'center'
                          }}
                          title="Type a new percentage and click Save"
                        />
                        <span style={{ fontWeight: 800, fontSize: 12, color: '#334155' }}>%</span>
                        {isModified && (
                          <button
                            className="btn btn-primary btn-xs"
                            disabled={savingId === r.id}
                            onClick={() => saveMarkup(r)}
                            title="Save markup percentage changes"
                          >
                            {savingId === r.id ? '…' : 'Save'}
                          </button>
                        )}
                      </div>
                      <div className="hint" style={{ fontSize: 10, marginTop: 3 }}>
                        Base ₹1,000 → <b style={{ color: numDraft > 0 ? '#15803D' : '#334155' }}>₹{samplePrice.toLocaleString('en-IN')}</b>
                      </div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          style={{
                            padding: '2px 6px',
                            fontSize: 10.5,
                            fontWeight: 700,
                            borderRadius: 4,
                            background: r.requireTerms ? '#DCFCE7' : '#F1F5F9',
                            color: r.requireTerms ? '#15803D' : '#64748B',
                            border: '1px solid ' + (r.requireTerms ? '#86EFAC' : '#E2E8F0')
                          }}
                          onClick={() => toggleRequireTerms(r)}
                          title="Click to toggle mandatory vs optional acceptance"
                        >
                          {r.requireTerms ? '✅ Mandatory' : '⚪ Optional'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          style={{ color: '#2563EB', fontWeight: 600, padding: '2px 6px', background: '#EFF6FF', borderRadius: 4 }}
                          onClick={() => onEditTc(r)}
                          title="View and modify full Terms & Conditions text"
                        >
                          📜 Edit T&C Text
                        </button>
                      </div>
                      {r.terms ? (
                        <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 4, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.terms}>
                          "{r.terms}"
                        </div>
                      ) : (
                        <div className="hint" style={{ fontSize: 10, marginTop: 2 }}>No agreement text set</div>
                      )}
                    </td>
                    <td style={{ padding: '10px', maxWidth: 180, fontSize: 11, color: '#64748B' }}>
                      {r.description || '—'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => onEditRole(r)} title="Edit all role properties">
                        ✏️ Edit Role
                      </button>
                      {!r.isSystem && (
                        <button className="btn btn-ghost btn-sm" style={{ color: '#DC2626' }} onClick={() => handleDelete(r)} title="Delete custom role">
                          🗑️
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Roles Modal Wrapper ---------------- */
function RolesModal({ onClose, onAddRole, onEditRole, onEditTc, onRoleChanged }) {
  return (
    <Modal title="🛡️ Existing Roles & Pricing Tiers" onClose={onClose} wide>
      <RolesTab 
        onAddRole={onAddRole} 
        onEditRole={onEditRole} 
        onEditTc={onEditTc} 
        onRoleChanged={onRoleChanged} 
        isModal 
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

/* ---------------- Terms & Conditions Editor Modal ---------------- */
function RoleTcModal({ role, onClose, onSaved }) {
  const [requireTerms, setRequireTerms] = useState(!!role.requireTerms);
  const [terms, setTerms] = useState(role.terms || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const PRESETS = [
    {
      label: '🌐 Regional Distribution Agreement',
      text: 'By registering as an authorized Regional Distribution Partner, you agree to uphold brand pricing guidelines, maintain active territory coverage, and adhere to confidentiality and warranty standards. All orders are subject to regional quota allocations and payment terms.'
    },
    {
      label: '🤝 Commercial Channel Partner Terms',
      text: 'By registering as an authorized Channel Sales Partner, you agree to commercial resale terms, minimum advertised price (MAP) policies, and prompt payment settlements. Commercial warranty and return terms apply.'
    },
    {
      label: '📣 Referral Agent Commission Agreement',
      text: 'By registering as an authorized Commercial Referral Partner, you agree that referrals must be bona fide commercial inquiries. Commission entitlements are calculated on the agreed markup tier basis upon confirmed order delivery.'
    },
    {
      label: '💼 Direct Sales Representative Agreement',
      text: 'Standard direct sales representative agreement: confidential catalog pricing, customer order processing, and quotation terms apply.'
    }
  ];

  async function save() {
    setSaving(true);
    setErr('');
    try {
      await api.patch('/api/roles/' + role.id, {
        requireTerms: !!requireTerms,
        terms: terms.trim()
      });
      toast(`Terms & Conditions updated for "${role.name}"`, '📜');
      onSaved();
    } catch (e) {
      setErr(e.message || 'Failed to update Terms & Conditions');
      setSaving(false);
    }
  }

  return (
    <Modal title={`📜 Terms & Conditions: ${role.name}`} onClose={onClose} wide>
      <div style={{ marginBottom: 12 }}>
        <p className="hint" style={{ margin: 0 }}>
          Define the legal agreement text and acceptance requirements for <b>{role.name}</b> ({role.markupPct ? `+${role.markupPct}% markup` : 'Base price'}).
          When mandatory, users assigned to this role must accept these terms before their account can be created.
        </p>
      </div>

      <div style={{ background: '#F8FAFC', padding: '10px 14px', borderRadius: 8, border: '1px solid #E2E8F0', marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          <input 
            type="checkbox" 
            checked={requireTerms} 
            onChange={(e) => setRequireTerms(e.target.checked)} 
            style={{ width: 16, height: 16, accentColor: '#2563EB' }}
          />
          <span>Mandatory: Require Terms & Conditions acceptance when creating users with this role</span>
        </label>
      </div>

      <Field label="Agreement Terms & Conditions Text" req={requireTerms} hint="This exact text will be displayed in the T&C review card during user registration.">
        <textarea 
          rows={6} 
          value={terms} 
          onChange={(e) => setTerms(e.target.value)} 
          placeholder="Enter legal terms and conditions agreement..." 
          style={{ width: '100%', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5 }}
        />
      </Field>

      <div style={{ marginTop: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 6 }}>
          Quick Template Presets (Click to insert):
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map((p, idx) => (
            <button 
              key={idx} 
              type="button" 
              className="btn btn-ghost btn-xs" 
              style={{ background: '#EFF6FF', color: '#1D4ED8', fontSize: 11 }}
              onClick={() => setTerms(p.text)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="hint" style={{ color: '#DC2626', marginBottom: 10 }}>{err}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
          💾 {saving ? 'Saving…' : 'Save Terms & Conditions'}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------- Full Role Create/Edit Modal ---------------- */
function RoleEditModal({ role, onClose, onSaved }) {
  const isEdit = !!role;
  const [name, setName] = useState(role ? role.name : '');
  const [category, setCategory] = useState(role ? (role.category || 'sales_partner') : 'sales_partner');
  const [markupPct, setMarkupPct] = useState(role && role.markupPct != null ? String(role.markupPct) : '10');
  const [requireTerms, setRequireTerms] = useState(role ? !!role.requireTerms : true);
  const [terms, setTerms] = useState(role ? (role.terms || '') : 'By registering as an authorized sales partner, you agree to catalog pricing guidelines, territory confidentiality, and prompt customer order processing.');
  const [description, setDescription] = useState(role ? (role.description || '') : '');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setErr('');
    if (!name.trim()) return setErr('Role name is required.');
    const pct = Number(markupPct);
    if (isNaN(pct) || pct < 0) return setErr('Markup percentage must be a number >= 0.');

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        category,
        markupPct: pct,
        requireTerms: !!requireTerms,
        terms: terms.trim(),
        description: description.trim()
      };
      if (isEdit) {
        await api.patch('/api/roles/' + role.id, payload);
        toast(`Role "${name}" updated (${pct}% markup)`, '✅');
      } else {
        await api.post('/api/roles', payload);
        toast(`Role "${name}" created (${pct}% markup)`, '🛡️');
      }
      onSaved();
    } catch (e) {
      setErr(e.message || 'Save failed');
      setSaving(false);
    }
  }

  const numPct = Number(markupPct) || 0;
  const previewPrice = Math.round(1000 * (1 + numPct / 100));

  return (
    <Modal title={isEdit ? `✏️ Edit Role: ${role.name}` : '🛡️ Add New Role & Partner Tier'} onClose={onClose}>
      <Field label="Role / Tier Name" req>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Regional Partner, Channel Partner" />
      </Field>
      <Field label="Role Category" req hint="Sales Partners will have access to the sales catalog with tier pricing.">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="sales_partner">Sales Partner (Regional, Channel, Referral, etc.)</option>
          <option value="internal">Internal / Operational Role</option>
        </select>
      </Field>
      <Field label="Price Markup Percentage (%)" req hint="In accounts, if ₹1,000 is given, 10% markup displays ₹1,100 to users with this role.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input 
            type="number" 
            min="0" 
            step="0.5" 
            value={markupPct} 
            onChange={(e) => setMarkupPct(e.target.value)} 
            placeholder="e.g. 10" 
            style={{ width: 140 }}
          />
          <span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>% Markup over Base Price</span>
        </div>
        <div className="hint" style={{ marginTop: 4, fontSize: 11 }}>
          Live impact preview: Base ₹1,000 product ➔ Partner displays <b style={{ color: '#15803D' }}>₹{previewPrice.toLocaleString('en-IN')}</b>
        </div>
      </Field>
      <div style={{ marginTop: 10, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
          <input 
            type="checkbox" 
            checked={requireTerms} 
            onChange={(e) => setRequireTerms(e.target.checked)} 
            style={{ accentColor: '#2563EB' }}
          />
          <span>Require Terms & Conditions acceptance when creating this user</span>
        </label>
      </div>
      {requireTerms && (
        <Field label="Terms & Conditions Agreement Text" hint="Shown to admin when creating sales user under this tier.">
          <textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Enter terms & conditions text..." />
        </Field>
      )}
      <Field label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short notes about this role or tier" />
      </Field>

      {err && <div className="hint" style={{ color: '#DC2626', marginTop: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
          💾 {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Role')}
        </button>
      </div>
    </Modal>
  );
}

/* ---------------- super admins tab ---------------- */
function SuperAdminsTab({ q, setQ, data, loading, err, page, setPage, onAdd, onEdit, onToggle, onDelete }) {
  if (loading) return <Skeleton h={220} />;
  if (err) return <Empty title={'⚠️ ' + err} />;
  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <input
            className="input input-sm"
            style={{ width: 240 }}
            placeholder="Search super admins..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Total: <b className="text-slate-800">{data.total || data.rows.length}</b> Super {data.total === 1 ? 'Admin' : 'Admins'}
        </div>
      </div>
      <DataTable
        rowKey={(r) => r.id}
        empty="No super administrators found."
        cols={[
          {
            key: 'name',
            label: 'Administrator',
            render: (u) => (
              <div className="flex items-center gap-2">
                <span className="text-base">👑</span>
                <div>
                  <div className="font-bold text-slate-900">{u.name}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{u.id}</div>
                </div>
              </div>
            )
          },
          { key: 'email', label: 'Email Address', render: (u) => <span className="font-mono text-xs">{u.email}</span> },
          { key: 'mobile', label: 'Mobile', render: (u) => u.mobile || '—' },
          {
            key: 'status',
            label: 'Status',
            render: (u) => statusBadge(u.active !== false ? 'Delivered' : 'Cancelled')
          },
          { key: 'createdAt', label: 'Added Date', render: (u) => <span className="hint">{u.createdAt || '—'}</span> },
          {
            key: 'act',
            label: 'Actions',
            render: (u) => (
              <span style={{ whiteSpace: 'nowrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => onEdit(u)}>Edit</button>{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => onToggle(u)}>
                  {u.active !== false ? 'Suspend' : 'Activate'}
                </button>{' '}
                <button className="btn btn-ghost btn-sm text-red-600 hover:text-red-700" onClick={() => onDelete(u)}>
                  Delete
                </button>
              </span>
            )
          }
        ]}
        rows={data.rows}
      />
      <Pager total={data.total} page={page} limit={LIMIT} onPage={setPage} />
    </>
  );
}

/* ---------------- super admin add/edit modal ---------------- */
function SuperAdminModal({ user, onClose, onSaved }) {
  const isEdit = !!user;
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [mobile, setMobile] = useState(user?.mobile || '');
  const [active, setActive] = useState(user ? user.active !== false : true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!name.trim()) { setErr('Full name is required'); return; }
    if (!email.trim()) { setErr('Email address is required'); return; }
    setSaving(true);
    setErr('');
    try {
      if (isEdit) {
        await api.patch(`/api/users/${user.id}`, {
          name: name.trim(),
          mobile: mobile.trim(),
          active
        });
        toast('Super administrator updated', '👑');
      } else {
        await api.post('/api/users', {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          mobile: mobile.trim(),
          role: 'super_admin'
        });
        toast('Super administrator created', '👑');
      }
      onSaved();
    } catch (e) {
      setErr(e.message || 'Failed to save super administrator');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isEdit ? `👑 Edit Super Admin: ${user.name}` : '👑 Add Super Administrator'} onClose={onClose}>
      <Field label="Full Name" req>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. System Admin"
          autoFocus
        />
      </Field>
      <Field label="Email Address" req hint={isEdit ? "Email address cannot be changed." : "Authorized Google / SSO / local sign-in email address."}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isEdit}
          placeholder="admin@example.com"
        />
      </Field>
      <Field label="Mobile / Contact">
        <input
          type="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder="+91 98765 43210"
        />
      </Field>
      {isEdit && (
        <div style={{ marginTop: 8, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              style={{ accentColor: '#2563EB' }}
            />
            <span>Active Super Admin account</span>
          </label>
        </div>
      )}
      {err && <div className="hint" style={{ color: '#DC2626', marginTop: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-primary btn-sm bg-sky-600 hover:bg-sky-700 text-white" disabled={saving} onClick={save}>
          💾 {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Super Admin')}
        </button>
      </div>
    </Modal>
  );
}

