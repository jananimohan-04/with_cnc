/* Company media library — product-image grid from own catalog. Mirrors legacy vMedia. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Image as ImageIcon, Plus, ExternalLink, Video, 
  Eye, Boxes, Sparkles 
} from 'lucide-react';
import { api, imgFallback } from '../../api';
import { Empty, Skeleton, PageHero } from '../../components/ui';

export default function Media() {
  const [prods, setProds] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let on = true;
    api.get('/api/products')
      .then((d) => { if (on) setProds(Array.isArray(d) ? d : (d.rows || [])); })
      .catch((e) => { if (on) setErr(e.message); });
    return () => { on = false; };
  }, []);

  if (err && !prods) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-8 text-center max-w-lg mx-auto">
        <p className="text-red-500 font-bold mb-1">Failed to load media</p>
        <p className="text-xs text-slate-500">{err}</p>
      </div>
    );
  }

  if (!prods) return <Skeleton h={320} />;

  const cells = prods.flatMap((p) => ((p.images || []).slice(0, 3)).map((u, i) => ({ p, u, index: i })));

  return (
    <div className="space-y-6">
      <PageHero
        title={`Catalog Media Library (${cells.length})`}
        subtitle="High-definition industrial product photography, video demonstrations, and CAD captures."
        icon={ImageIcon}
        badgeText="Digital Assets"
        badgeColor="amber"
        gradient="from-amber-500 via-orange-500 to-yellow-500"
        actions={
          <Link 
            to="/admin/products/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm shadow-amber-600/30 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Upload Media via Product
          </Link>
        }
      />

      {/* Media Grid */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        {cells.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {cells.map(({ p, u, index }) => (
              <motion.div
                key={p.id + '-' + index}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group relative rounded-xl border border-slate-200 overflow-hidden bg-slate-50 flex flex-col hover:border-blue-400 hover:shadow-md transition-all"
              >
                <div className="aspect-square relative overflow-hidden bg-slate-100">
                  <img 
                    src={u} 
                    alt={p.name} 
                    loading="lazy" 
                    onError={(e) => { e.currentTarget.src = imgFallback(p.sku || p.id); }} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-2 left-2">
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-900/80 backdrop-blur-xs text-white">
                      {index === 0 ? 'Primary' : `Gallery #${index + 1}`}
                    </span>
                  </div>
                </div>

                <div className="p-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs truncate">{p.name}</h4>
                    <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">{p.sku || p.id}</span>
                  </div>

                  <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <Link 
                      to={'/store/product/' + p.id}
                      className="text-blue-600 font-bold hover:underline flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" /> View
                    </Link>
                    <Link 
                      to={'/admin/products/edit/' + p.id}
                      className="text-slate-500 font-medium hover:text-slate-800"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-slate-400">
            <ImageIcon className="w-12 h-12 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">No media assets found</p>
            <p className="text-xs text-slate-400 mt-1">Upload images or videos when creating or editing products.</p>
          </div>
        )}

        <p className="text-[11px] text-slate-400 pt-3 border-t border-slate-100">
          Media is scoped to your company catalog. Videos stream with lazy loading on the public storefront.
        </p>
      </div>
    </div>
  );
}
