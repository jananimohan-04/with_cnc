/* Company sales users — table with orders count, create, activate/deactivate with modern Tailwind UI. */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Users as UsersIcon, Plus, Mail, Phone, ShieldCheck, 
  Power, UserCheck, UserX, Loader2, Calendar 
} from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { statusBadge, Modal, Empty, Skeleton, toast, PageHero } from '../../components/ui';

export default function Users() {
  const { me } = useAuth();
  const [users, setUsers] = useState(null);
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState('');
  const [show, setShow] = useState(false);
  const [nName, setNName] = useState('');
  const [nEmail, setNEmail] = useState('');
  const [nMobile, setNMobile] = useState('');
  const [nRole, setNRole] = useState('sales_regional_partner');
  const [rolesList, setRolesList] = useState([]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [mErr, setMErr] = useState('');
  const [mBusy, setMBusy] = useState(false);

  function load() {
    api.get('/api/roles')
      .then((d) => setRolesList(Array.isArray(d) ? d : []))
      .catch(() => {});
    api.get('/api/users')
      .then((d) => {
        const list = Array.isArray(d) ? d : (d.rows || []);
        setUsers(list.filter((u) => !me.companyId || u.companyId === me.companyId));
      })
      .catch((e) => setErr(e.message));
    api.get('/api/orders')
      .then((d) => setOrders(Array.isArray(d) ? d : (d.rows || [])))
      .catch(() => {});
  }

  useEffect(load, [me && me.companyId]);

  if (err && !users) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-8 text-center max-w-lg mx-auto">
        <p className="text-red-500 font-bold mb-1">Failed to load users</p>
        <p className="text-xs text-slate-500">{err}</p>
      </div>
    );
  }

  if (!users) return <Skeleton h={320} />;

  function toggle(u) {
    const to = !(u.active !== false);
    api.patch('/api/users/' + u.id, { active: to })
      .then(() => { 
        toast(to ? u.name + ' activated' : u.name + ' deactivated', to ? '✅' : '⛔'); 
        load(); 
      })
      .catch((e) => toast(e.message, '⚠️'));
  }

  async function create() {
    const name = (nName || '').trim(), email = (nEmail || '').trim();
    if (!name) { setMErr('Full name is required.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setMErr('A valid email address is required.'); return; }
    const selectedRoleObj = (rolesList || []).find((r) => r.id === nRole);
    const requiresTerms = selectedRoleObj ? !!selectedRoleObj.requireTerms : nRole.startsWith('sales_');
    if (requiresTerms && !termsAccepted) {
      setMErr('Please confirm acceptance of the Sales Partner Terms & Conditions.');
      return;
    }
    setMBusy(true);
    setMErr('');
    try {
      await api.post('/api/users', { name, email, mobile: nMobile || '', role: nRole, companyId: me.companyId, termsAccepted: !!termsAccepted });
      toast(name + ' created', '👥');
      setShow(false);
      setNName(''); setNEmail(''); setNMobile(''); setNRole('sales_regional_partner'); setTermsAccepted(false);
      load();
    } catch (e) {
      setMErr(e.message || 'Create failed');
    } finally {
      setMBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        title={`Business Development Executives (${users.length})`}
        subtitle="Manage business development executives, partner tiers, and commercial order ownership."
        icon={UsersIcon}
        badgeText="Team Access"
        badgeColor="sky"
        gradient="from-sky-500 via-cyan-500 to-blue-600"
        actions={
          <button 
            type="button" 
            onClick={() => { setMErr(''); setShow(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-sky-600/30 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Invite Executive
          </button>
        }
      />

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="pb-3 font-bold">User Identity</th>
                <th className="pb-3 font-bold">Contact Details</th>
                <th className="pb-3 font-bold">Role</th>
                <th className="pb-3 font-bold">Account Status</th>
                <th className="pb-3 font-bold text-center">Orders</th>
                <th className="pb-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length ? users.map((u) => {
                const isActive = u.active !== false;
                const orderCount = orders.filter((o) => o.salesUser === u.name).length;
                return (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 font-bold flex items-center justify-center text-xs">
                          {(u.name || 'U')[0].toUpperCase()}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 text-sm block">{u.name}</span>
                          <span className="text-[11px] text-slate-400 font-mono">{u.id}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5">
                      <div className="text-slate-800 font-medium">{u.email}</div>
                      {u.mobile && <div className="text-[11px] text-slate-400 mt-0.5">{u.mobile}</div>}
                    </td>

                    <td className="py-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800">
                          {u.roleName || (u.role || '').replace(/_/g, ' ')}
                        </span>
                        {u.markupPct ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-100 text-blue-800">
                            +{u.markupPct}%
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="py-3.5">
                      {statusBadge(isActive ? 'Delivered' : 'Cancelled')}
                    </td>

                    <td className="py-3.5 text-center font-mono font-bold text-slate-800">
                      {orderCount}
                    </td>

                    <td className="py-3.5 text-right">
                      <button 
                        type="button" 
                        onClick={() => toggle(u)}
                        className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer border ${
                          isActive 
                            ? 'text-red-600 bg-red-50 hover:bg-red-100 border-red-200/60' 
                            : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200/60'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        {isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No sales users provisioned for this company yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {show && (
        <Modal title="👥 Provision Company User" onClose={() => setShow(false)}>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Full Name *</label>
              <input 
                type="text" 
                value={nName} 
                onChange={(e) => setNName(e.target.value)} 
                placeholder="e.g. Priya Sharma"
                className="w-full px-3.5 py-2 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Google / Business Email *</label>
              <input 
                type="email" 
                value={nEmail} 
                onChange={(e) => setNEmail(e.target.value)} 
                placeholder="name@company.in"
                className="w-full px-3.5 py-2 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Mobile Number (Optional)</label>
              <input 
                type="tel" 
                value={nMobile} 
                onChange={(e) => setNMobile(e.target.value)} 
                placeholder="+91 98765 00000"
                className="w-full px-3.5 py-2 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Role & Partner Pricing Tier</label>
              <select 
                value={nRole} 
                onChange={(e) => { setNRole(e.target.value); setTermsAccepted(false); }}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden"
              >
                {rolesList.filter((r) => r.id !== 'super_admin' && r.active !== false).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.markupPct ? `(+${r.markupPct}% price markup)` : (r.category === 'sales_partner' ? '(Base price 0%)' : '')}
                  </option>
                ))}
                {!rolesList.length && (
                  <>
                    <option value="sales_regional_partner">Regional Partner (+10% markup)</option>
                    <option value="sales_channel_partner">Channel Partner (+15% markup)</option>
                    <option value="sales_referral_partner">Referral Partner (+5% markup)</option>
                    <option value="sales_user">Direct Sales User (0%)</option>
                    <option value="company_admin">Company Admin</option>
                  </>
                )}
              </select>
            </div>

            {/* Terms and conditions for sales partners */}
            {((rolesList.find((r) => r.id === nRole) && rolesList.find((r) => r.id === nRole).requireTerms) || nRole.startsWith('sales_')) && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                  <span>📜</span> Sales Partner Terms & Conditions
                </div>
                <div className="text-[10px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200 max-h-20 overflow-y-auto leading-relaxed">
                  {rolesList.find((r) => r.id === nRole)?.terms || 'Authorized sales partner agrees to catalog pricing guidelines, territory confidentiality, and prompt customer order processing.'}
                </div>
                <label className="flex items-start gap-2 cursor-pointer text-[11px] text-slate-800 font-semibold">
                  <input 
                    type="checkbox" 
                    checked={termsAccepted} 
                    onChange={(e) => setTermsAccepted(e.target.checked)} 
                    className="mt-0.5 accent-blue-600 cursor-pointer" 
                  />
                  <span>Confirm user acceptance of Sales Terms & Conditions and Pricing Policy (Required)</span>
                </label>
              </div>
            )}

            {mErr && (
              <p className="text-xs text-red-600 font-semibold bg-red-50 p-2.5 rounded-lg border border-red-200">
                ⚠️ {mErr}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setShow(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button" 
                disabled={mBusy} 
                onClick={create}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-sm cursor-pointer"
              >
                {mBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {mBusy ? 'Saving…' : 'Create User Account'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
