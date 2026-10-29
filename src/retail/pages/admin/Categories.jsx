/* Company categories — chips + table with SKU counts, rename (PUT), add (POST, company-scoped). */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  FolderTree, Plus, Edit2, Boxes, Loader2, Sparkles 
} from 'lucide-react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Modal, Empty, Skeleton, toast, PageHero } from '../../components/ui';

export default function Categories() {
  const { me } = useAuth();
  const [cats, setCats] = useState(null);
  const [prods, setProds] = useState([]);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null); // {mode:'add'} | {mode:'rename', cat}
  const [mName, setMName] = useState('');
  const [mIcon, setMIcon] = useState('🏭');
  const [mDesc, setMDesc] = useState('');
  const [mErr, setMErr] = useState('');
  const [mBusy, setMBusy] = useState(false);

  function load() {
    api.get('/api/categories/company/' + me.companyId)
      .then((d) => setCats(Array.isArray(d) ? d : (d.rows || [])))
      .catch((e) => setErr(e.message));
    api.get('/api/products')
      .then((d) => setProds(Array.isArray(d) ? d : (d.rows || [])))
      .catch(() => {});
  }

  useEffect(load, [me && me.companyId]);

  if (err && !cats) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-8 text-center max-w-lg mx-auto">
        <p className="text-red-500 font-bold mb-1">Failed to load categories</p>
        <p className="text-xs text-slate-500">{err}</p>
      </div>
    );
  }

  if (!cats) return <Skeleton h={320} />;

  const count = (id) => prods.filter((p) => p.category === id).length;

  function openAdd() {
    setMName(''); 
    setMIcon('🏭'); 
    setMDesc(''); 
    setMErr('');
    setModal({ mode: 'add' });
  }

  function openRename(c) {
    setMName(c.name); 
    setMIcon(c.icon || '🏭'); 
    setMDesc(c.desc || ''); 
    setMErr('');
    setModal({ mode: 'rename', cat: c });
  }

  async function submit() {
    const name = (mName || '').trim();
    if (!name) { 
      setMErr('Category name is required.'); 
      return; 
    }
    setMBusy(true);
    setMErr('');
    try {
      if (modal.mode === 'add') {
        await api.post('/api/categories', { name, icon: mIcon || '🏭', desc: mDesc || '' });
        toast('Category "' + name + '" created', '🗂️');
      } else {
        await api.put('/api/categories/' + modal.cat.id, { name, icon: mIcon || '🏭', desc: mDesc || '' });
        toast('Category renamed', '🗂️');
      }
      setModal(null);
      load();
    } catch (e) {
      setMErr(e.message || 'Save failed');
    } finally {
      setMBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        title={`Catalog Taxonomies (${cats.length})`}
        subtitle="Custom category classifications and SKU distributions for your enterprise catalog."
        icon={FolderTree}
        badgeText="Taxonomy"
        badgeColor="amber"
        gradient="from-amber-500 via-orange-500 to-yellow-500"
        actions={
          <button 
            type="button" 
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-amber-600/30 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> New Category
          </button>
        }
      />

      {/* Category Pills Strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {cats.map((c) => (
          <span 
            key={c.id}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-200 rounded-full text-xs font-semibold text-slate-800 shadow-2xs flex-shrink-0"
          >
            <span>{c.icon}</span>
            <span>{c.name}</span>
            <span className="font-mono text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
              {count(c.id)}
            </span>
          </span>
        ))}
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="pb-3 font-bold">Category Name</th>
                <th className="pb-3 font-bold">Description</th>
                <th className="pb-3 font-bold text-center">Active SKUs</th>
                <th className="pb-3 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cats.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5">
                    <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                      <span className="text-lg">{c.icon || '🏭'}</span>
                      <span>{c.name}</span>
                    </div>
                  </td>

                  <td className="py-3.5 text-slate-500 max-w-md truncate">
                    {c.desc || '—'}
                  </td>

                  <td className="py-3.5 text-center font-bold text-slate-800 font-mono">
                    {count(c.id)}
                  </td>

                  <td className="py-3.5 text-right">
                    <button 
                      type="button" 
                      onClick={() => openRename(c)}
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-slate-400 pt-3 border-t border-slate-100">
          Taxonomies are company-scoped. Every supplier has its own tailored product tree.
        </p>
      </div>

      {/* Add / Rename Modal */}
      {modal && (
        <Modal 
          title={modal.mode === 'add' ? '➕ Create Custom Category' : '✏️ Rename Category'} 
          onClose={() => setModal(null)}
        >
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Category Name *</label>
              <input 
                type="text" 
                value={mName} 
                onChange={(e) => setMName(e.target.value)} 
                placeholder="e.g. Precision CNC Tooling"
                className="w-full px-3.5 py-2 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Emoji Icon</label>
              <input 
                type="text" 
                value={mIcon} 
                onChange={(e) => setMIcon(e.target.value)} 
                placeholder="🏭"
                className="w-full px-3.5 py-2 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Category Description</label>
              <input 
                type="text" 
                value={mDesc} 
                onChange={(e) => setMDesc(e.target.value)} 
                placeholder="Short summary of industrial products in this classification"
                className="w-full px-3.5 py-2 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-hidden transition-all"
              />
            </div>

            {mErr && (
              <p className="text-xs text-red-600 font-semibold bg-red-50 p-2.5 rounded-lg border border-red-200">
                ⚠️ {mErr}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setModal(null)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button" 
                disabled={mBusy} 
                onClick={submit}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-sm cursor-pointer"
              >
                {mBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {mBusy ? 'Saving…' : (modal.mode === 'add' ? 'Create Category' : 'Save Changes')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
