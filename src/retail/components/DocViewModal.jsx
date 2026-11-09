/* Shows a quotation / tax invoice inside the page as a popup (no new tab). */
import { useEffect } from 'react';
import { X, Printer } from 'lucide-react';
import '../styles/glass.css';

export default function DocViewModal({ view, onClose }) {
  useEffect(() => {
    if (!view) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [view, onClose]);
  if (!view) return null;
  const print = () => { const f = document.getElementById('doc-view-frame'); try { f.contentWindow.focus(); f.contentWindow.print(); } catch { /* ignore */ } };
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 gl-overlay" onClick={onClose}>
      <div className="gl-modal rounded-3xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 gl-modal-head">
          <div className="font-black text-slate-900 text-sm truncate">{view.title}</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={print} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer"><Printer className="w-3.5 h-3.5" /> Print / PDF</button>
            <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <iframe id="doc-view-frame" title={view.title} srcDoc={view.html} className="flex-1 w-full bg-white border-0 m-2 mt-0 rounded-2xl shadow-inner" style={{ width: 'calc(100% - 1rem)' }} />
      </div>
    </div>
  );
}
