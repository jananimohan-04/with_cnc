import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, Trash2 } from 'lucide-react';
import { Modal, FormField, inputClass } from '@/components/ui/Modal';
import { Badge, Button } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import { MENU_CATALOG } from '@/retail/menuCatalog';
import { api as retailApi } from '@/retail/api';

// Retail Store roles (sales partner tiers, content writer, finance...) are kept in public.retail_roles and edited here.
// Only the Super Admin can change them; the Retail Store reads them from the same table.

export interface RetailRoleRow {
  id: string; name: string; category: string; markup_pct: number; require_terms: boolean; terms: string;
  description: string; is_system: boolean; active: boolean; menu_permissions: string[];
}

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'sales_partner', label: 'Sales partner (sells from the Retail Store)' },
  { id: 'staff', label: 'Staff (content writer, finance...)' },
];

const emptyRole = (): RetailRoleRow => ({ id: '', name: '', category: 'sales_partner', markup_pct: 0, require_terms: false, terms: '', description: '', is_system: false, active: true, menu_permissions: [] });

// the Retail Store pages a role can be allowed to open (platform-only "super_" pages are never offered)
const PAGE_GROUPS = (MENU_CATALOG as any[])
  .map(cat => ({ id: cat.id as string, label: cat.label as string, items: ((cat.items || []) as any[]).filter(i => !String(i.id).startsWith('super_')).map(i => ({ id: i.id as string, label: i.label as string })) }))
  .filter(g => g.items.length > 0);

export function RetailRolesPanel({ open, onClose, onChanged, canEdit }: { open: boolean; onClose: () => void; onChanged?: () => void; canEdit: boolean }) {
  const [roles, setRoles] = useState<RetailRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [form, setForm] = useState<RetailRoleRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<RetailRoleRow | null>(null);
  const [pages, setPages] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let { data, error } = await supabase.from('retail_roles').select('*').order('category').order('name');
    if (!error && (data ?? []).length === 0) {
      // nothing in BI yet: asking the Retail Store for its roles makes it copy them here, then read again
      try { await retailApi.get('/api/roles'); await new Promise(res => setTimeout(res, 1200)); } catch { /* shown below */ }
      ({ data, error } = await supabase.from('retail_roles').select('*').order('category').order('name'));
    }
    if (error) setNote('Roles could not be loaded. Apply the retail roles migration (20261106010000_retail_roles.sql) in Supabase.');
    else setNote(((data as any[]) ?? []).length === 0 ? 'No roles yet. They are copied from the Retail Store the first time someone opens it; or add one here.' : null);
    setRoles(error ? [] : ((data as any[]) ?? []).map(r => ({ ...r, markup_pct: Number(r.markup_pct) || 0, menu_permissions: Array.isArray(r.menu_permissions) ? r.menu_permissions : [] })));
    setLoading(false);
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) { setFormError('Role name is required'); return; }
    setSaving(true); setFormError(null);
    const { error } = await supabase.rpc('erp_save_retail_role', { p_role: { ...form, id: form.id || null } });
    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setForm(null); await load(); onChanged?.();
  };
  const remove = async () => {
    if (!toDelete) return;
    const { error } = await supabase.rpc('erp_delete_retail_role', { p_id: toDelete.id });
    if (error) { setNote(error.message); } else { await load(); onChanged?.(); }
    setToDelete(null);
  };

  const selected = useMemo(() => new Set(form?.menu_permissions ?? []), [form]);
  const toggle = (id: string) => setForm(f => f && ({ ...f, menu_permissions: f.menu_permissions.includes(id) ? f.menu_permissions.filter(x => x !== id) : [...f.menu_permissions, id] }));
  const toggleGroup = (ids: string[], on: boolean) => setForm(f => f && ({ ...f, menu_permissions: on ? Array.from(new Set([...f.menu_permissions, ...ids])) : f.menu_permissions.filter(x => !ids.includes(x)) }));

  return (
    <>
      <Modal open={open} onClose={onClose} size="lg" title="Retail Store Roles"
        footer={<div className="flex justify-between w-full">
          {canEdit ? <Button onClick={() => { setForm(emptyRole()); setFormError(null); setPages(false); }}><Plus size={14} className="mr-1" /> Add Role</Button> : <span />}
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>}>
        {note && <p className="mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{note}</p>}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr><th className="px-3 py-2">Role</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Markup</th><th className="px-3 py-2">Sales terms</th><th className="px-3 py-2">Pages</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>}
              {!loading && roles.map(r => (
                <tr key={r.id}>
                  <td className="px-3 py-2"><div className="font-semibold text-slate-800">{r.name}</div>{r.description && <div className="text-[11px] text-slate-500 max-w-[260px] truncate">{r.description}</div>}</td>
                  <td className="px-3 py-2 text-slate-600">{r.category === 'sales_partner' ? 'Sales partner' : 'Staff'}</td>
                  <td className="px-3 py-2 text-slate-600">{r.markup_pct > 0 ? `+${r.markup_pct}%` : '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{r.require_terms ? 'Required' : '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{r.menu_permissions.length}</td>
                  <td className="px-3 py-2"><Badge variant={r.active ? 'success' : 'neutral'}>{r.active ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {canEdit && <>
                      <button className="p-1.5 text-slate-500 hover:text-brand-600" title="Edit" onClick={() => { setForm({ ...r }); setFormError(null); setPages(false); }}><Edit2 size={15} /></button>
                      {!r.is_system && <button className="p-1.5 text-slate-500 hover:text-red-600" title="Delete" onClick={() => setToDelete(r)}><Trash2 size={15} /></button>}
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!canEdit && <p className="mt-3 text-xs text-slate-500">Only the Super Admin can change roles.</p>}
      </Modal>

      {form && (
        <Modal open onClose={() => setForm(null)} size="lg" title={form.id ? `Edit Role: ${form.name}` : 'New Role'}
          footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Role'}</Button></div>}>
          {formError && <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Role Name" required><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Regional Partner" /></FormField>
            <FormField label="Type">
              <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </FormField>
            <FormField label="Markup % on catalog price" hint="Added to the catalog price this partner sees">
              <input className={inputClass} type="number" min={0} step="0.5" value={form.markup_pct} onChange={(e) => setForm({ ...form, markup_pct: Math.max(0, Number(e.target.value) || 0) })} />
            </FormField>
            <FormField label="Status">
              <select className={inputClass} value={form.active ? 'Active' : 'Inactive'} onChange={(e) => setForm({ ...form, active: e.target.value === 'Active' })}>
                <option>Active</option><option>Inactive</option>
              </select>
            </FormField>
            <div className="sm:col-span-2"><FormField label="Description"><input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField></div>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={form.require_terms} onChange={(e) => setForm({ ...form, require_terms: e.target.checked })} />
            Sales terms and conditions must be accepted when a user is given this role
          </label>
          {form.require_terms && (
            <textarea className={`${inputClass} mt-2 min-h-[90px]`} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} placeholder="Terms shown to the person who creates the user" />
          )}

          <div className="mt-5 border-t border-slate-200 pt-3">
            <button type="button" className="text-sm font-semibold text-brand-600" onClick={() => setPages(p => !p)}>
              {pages ? 'Hide' : 'Show'} Retail Store pages this role can open ({form.menu_permissions.length} selected)
            </button>
            {pages && (
              <div className="mt-3 space-y-3 max-h-72 overflow-y-auto pr-1">
                {PAGE_GROUPS.map(g => {
                  const ids = g.items.map(i => i.id);
                  const all = ids.every(i => selected.has(i));
                  return (
                    <div key={g.id} className="border border-slate-200 rounded-lg p-2.5">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase cursor-pointer">
                        <input type="checkbox" checked={all} onChange={(e) => toggleGroup(ids, e.target.checked)} /> {g.label}
                      </label>
                      <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                        {g.items.map(i => (
                          <label key={i.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} /> {i.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}

      {toDelete && (
        <Modal open onClose={() => setToDelete(null)} title="Delete role"
          footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setToDelete(null)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></div>}>
          <p className="text-sm text-slate-700">Delete the role <b>{toDelete.name}</b>? This is refused while users are still assigned to it.</p>
        </Modal>
      )}
    </>
  );
}
