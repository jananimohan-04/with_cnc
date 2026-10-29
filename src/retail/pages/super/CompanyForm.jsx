/* Shared company create/edit form — fields, validation and payloads mirror the
   legacy saveCompanyModal/saveCompany paths in js/app.js exactly:
   required name/city/admin-email-when-new, email regex, unique-code client
   pre-check, disable-while-saving, POST (create) then PUT (edit). */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { Field, Skeleton, Empty, toast } from '../../components/ui';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const INDUSTRIES = ['CNC Manufacturing', 'Machine Tools', 'Auto Components', 'Fabrication', 'General Engineering'];
export const PLANS = ['Starter', 'Growth', 'Scale'];

export const emptyCompany = () => ({
  name: '', code: '', industry: 'CNC Manufacturing', email: '', logo: '🏭',
  phone: '', city: '', state: '', pin: '', address: '',
  description: '', plan: 'Starter', storeStatus: 'active',
  adminName: '', adminEmail: ''
});

export function companyFromDetail(c) {
  const v = emptyCompany();
  if (!c) return v;
  for (const k of Object.keys(v)) if (c[k] !== undefined && c[k] !== null) v[k] = c[k];
  v.code = c.code || c.id || '';
  v.storeStatus = c.storeStatus || c.status || 'active';
  v.plan = c.plan || 'Starter';
  return v;
}

/* Single-error-string semantics, same order/checks as legacy saveCompanyModal. */
export function validateCompany(v, { isNew, codes = [] }) {
  const code = (v.code || '').trim().toUpperCase();
  if (!((v.name || '').trim())) return 'Company name is required.';
  if (!((v.city || '').trim())) return 'City is required.';
  if ((v.email || '').trim() && !EMAIL_RE.test((v.email || '').trim())) return 'Company email format is invalid.';
  if (isNew && !((v.adminEmail || '').trim())) return 'Admin email is required to provision the Company Admin.';
  if ((v.adminEmail || '').trim() && !EMAIL_RE.test((v.adminEmail || '').trim())) return 'Admin email format is invalid.';
  if (isNew && code && codes.some((x) => x === code)) return 'Company code already exists.';
  return '';
}

export function companyPayload(v, isNew) {
  const p = {
    name: (v.name || '').trim(),
    code: (v.code || '').trim().toUpperCase() || undefined,
    industry: v.industry || 'CNC Manufacturing',
    email: (v.email || '').trim(),
    logo: (v.logo || '').trim() || '🏭',
    phone: (v.phone || '').trim(),
    city: (v.city || '').trim(),
    state: (v.state || '').trim(),
    pin: (v.pin || '').trim(),
    address: (v.address || '').trim(),
    description: (v.description || '').trim(),
    plan: v.plan || 'Starter',
    storeStatus: v.storeStatus || 'active'
  };
  if (isNew) {
    if ((v.adminName || '').trim()) p.adminName = (v.adminName || '').trim();
    if ((v.adminEmail || '').trim()) p.adminEmail = (v.adminEmail || '').trim();
  }
  return p;
}

/* Fields-only JSX shared by the Companies modal and the full-page form. */
export function CompanyFormFields({ v, on, errors = {}, isNew, codeLocked }) {
  const set = (k) => (e) => on(k, e.target.value);
  const col = { display: 'flex', flexDirection: 'column', gap: 10 };
  return (
    <div className="co-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
      <div className="co-col" style={col}>
        <div className="co-col-title" style={{ fontWeight: 800, fontSize: 13 }}>🏢 Company Profile</div>
        <Field label="Company Name" req error={errors.name}>
          <input id="nc_name" value={v.name} onChange={set('name')} placeholder="e.g. Argus Precision Works" />
        </Field>
        <Field label={isNew ? 'Company Code * (unique)' : 'Company Code * (locked)'} req error={errors.code}>
          <input id="nc_code" value={v.code} onChange={set('code')} disabled={codeLocked} placeholder="e.g. C-D" style={{ textTransform: 'uppercase' }} />
        </Field>
        <Field label="Industry">
          <select id="nc_ind" value={v.industry} onChange={set('industry')}>
            {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Company Email" error={errors.email}>
          <input id="nc_email" value={v.email} onChange={set('email')} placeholder="contact@company.in" />
        </Field>
        <Field label="Logo (emoji or text)">
          <input id="nc_logo" value={v.logo} onChange={set('logo')} placeholder="🏭" />
        </Field>
      </div>
      <div className="co-col" style={col}>
        <div className="co-col-title" style={{ fontWeight: 800, fontSize: 13 }}>📍 Location &amp; Contact</div>
        <Field label="Phone">
          <input id="nc_phone" value={v.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
        </Field>
        <Field label="City" req error={errors.city}>
          <input id="nc_city" value={v.city} onChange={set('city')} placeholder="e.g. Pune" />
        </Field>
        <div className="form-row-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="State">
            <input id="nc_state" value={v.state} onChange={set('state')} placeholder="Maharashtra" />
          </Field>
          <Field label="PIN Code">
            <input id="nc_pin" value={v.pin} onChange={set('pin')} placeholder="411001" />
          </Field>
        </div>
        <Field label="Address">
          <input id="nc_addr" value={v.address} onChange={set('address')} placeholder="Industrial Estate Phase 2" />
        </Field>
      </div>
      <div className="co-col" style={col}>
        <div className="co-col-title" style={{ fontWeight: 800, fontSize: 13 }}>⚙️ Admin &amp; Access</div>
        {isNew && (
          <>
            <Field label="Company Admin Name">
              <input id="nc_admin" value={v.adminName} onChange={set('adminName')} placeholder="e.g. Neha Gupta" />
            </Field>
            <Field label="Admin Email" req error={errors.adminEmail}>
              <input id="nc_aemail" value={v.adminEmail} onChange={set('adminEmail')} placeholder="admin@company.in" />
            </Field>
          </>
        )}
        <div className="form-row-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Plan">
            <select id="nc_plan" value={v.plan} onChange={set('plan')}>
              {PLANS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select id="nc_status" value={v.storeStatus} onChange={set('storeStatus')}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </Field>
        </div>
        <Field label="Short Description">
          <input id="nc_desc" value={v.description} onChange={set('description')} placeholder="CNC facility for precision machining" />
        </Field>
      </div>
    </div>
  );
}

/* Full-page create/edit — routes /super/companies/new and /super/companies/:id/edit.
   Edit mode: useParams id, prefill from GET /api/companies/:id, code locked. */
export default function CompanyForm() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const [v, setV] = useState(emptyCompany());
  const [loading, setLoading] = useState(!isNew);
  const [loadErr, setLoadErr] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    api.get('/api/companies/' + id)
      .then((c) => { setV(companyFromDetail(c)); setLoadErr(''); })
      .catch((e) => setLoadErr(e.message || 'Failed to load company'))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const on = (k, val) => setV((p) => ({ ...p, [k]: val }));

  async function submit() {
    setErr('');
    let codes = [];
    if (isNew) {
      try {
        const all = await api.get('/api/companies?limit=200');
        const rows = Array.isArray(all) ? all : (all.rows || []);
        codes = rows.map((x) => (x.code || x.id || '').toUpperCase());
      } catch { /* pre-check is best-effort; server enforces uniqueness */ }
    }
    const msg = validateCompany(v, { isNew, codes });
    if (msg) { setErr(msg); toast(msg, '⚠️'); return; }
    setSaving(true);
    try {
      const payload = companyPayload(v, isNew);
      if (isNew) await api.post('/api/companies', payload);
      else await api.put('/api/companies/' + id, payload);
      toast(isNew ? v.name.trim() + ' created' : 'Company updated', '🏭');
      nav('/super/companies');
    } catch (e) {
      setErr(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton h={220} />;
  if (loadErr) return <Empty icon="🔍" title={'⚠️ ' + loadErr} sub={id ? 'Company not found.' : ''} />;

  return (
    <div className="co-create-wrap">
      <div className="section-head" style={{ margin: '0 0 10px' }}>
        <div>
          <p className="hint" style={{ margin: 0, fontSize: 11, fontWeight: 700 }}>SUPER ADMIN • COMPANY ONBOARDING</p>
          <h2 style={{ fontSize: 18, margin: '2px 0 0' }}>{isNew ? 'Create Company' : 'Edit Company — ' + v.name}</h2>
        </div>
        <Link className="btn btn-ghost btn-sm" to={isNew ? '/super/companies' : '/super/companies/' + id}>← Back to Companies</Link>
      </div>
      <div className="card" style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
        <div className="card-pad" style={{ padding: '14px 18px' }}>
          <CompanyFormFields v={v} on={on} errors={{}} isNew={isNew} codeLocked={!isNew} />
          {err && <div className="hint" style={{ color: '#DC2626', marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid #E2E8F0' }}>
            <span className="hint" style={{ fontSize: 11.5 }}>Company database record created immediately with isolated multi-tenant data scoping.</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link className="btn btn-ghost btn-sm" to={isNew ? '/super/companies' : '/super/companies/' + id}>Cancel</Link>
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={submit}>{saving ? 'Saving…' : (isNew ? 'Create company' : 'Save changes')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
