/* View a PDF inside the application. The pages are drawn on a canvas, so there is no download, print or save button
   (a person who is determined can still find the file address in the browser; this removes the buttons, it is not copy protection). */
import { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';

function PageCanvas({ doc, number, width, zoom }) {
  const ref = useRef(null);
  useEffect(() => {
    let cancelled = false, task = null;
    (async () => {
      const page = await doc.getPage(number);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const scale = (width * zoom) / base.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: scale * dpr });
      const c = ref.current; if (!c) return;
      c.width = vp.width; c.height = vp.height;
      c.style.width = `${Math.round(width * zoom)}px`; c.style.height = `${Math.round(vp.height / dpr)}px`;
      task = page.render({ canvasContext: c.getContext('2d'), viewport: vp });
      try { await task.promise; } catch { /* a newer render replaced this one */ }
    })();
    return () => { cancelled = true; if (task) try { task.cancel(); } catch { /* done */ } };
  }, [doc, number, width, zoom]);
  return <canvas ref={ref} className="bg-white shadow-lg mx-auto block" />;
}

export default function PdfViewer({ url, title, onClose }) {
  const [doc, setDoc] = useState(null);
  const [state, setState] = useState('loading');
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(800);
  const box = useRef(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = worker;
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.arrayBuffer();
        const d = await pdfjs.getDocument({ data }).promise;
        if (!dead) { setDoc(d); setState('ready'); }
      } catch (e) { if (!dead) setState('error'); }
    })();
    return () => { dead = true; };
  }, [url]);

  useEffect(() => {
    const measure = () => box.current && setWidth(Math.max(280, Math.min(1000, box.current.clientWidth - 32)));
    measure(); window.addEventListener('resize', measure);
    const key = (e) => {
      if (e.key === 'Escape') onClose();
      if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'S', 'P'].includes(e.key)) e.preventDefault();   // no save / print shortcut while a document is open
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('keydown', key); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[400] bg-slate-950/85 flex flex-col" onContextMenu={(e) => e.preventDefault()}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-900 text-white">
        <div className="font-bold text-sm truncate">{title || 'Document'}</div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Zoom out"><ZoomOut className="w-4 h-4" /></button>
          <span className="text-xs w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Zoom in"><ZoomIn className="w-4 h-4" /></button>
          <button type="button" onClick={onClose} className="ml-2 p-1.5 rounded-lg hover:bg-white/10" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
      </div>
      <div ref={box} className="flex-1 overflow-auto py-4 select-none">
        {state === 'loading' && <div className="h-full flex items-center justify-center text-slate-300 text-sm gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Opening the document…</div>}
        {state === 'error' && <div className="h-full flex items-center justify-center text-slate-300 text-sm px-6 text-center">This document could not be opened. Please try again later.</div>}
        {state === 'ready' && doc && (
          <div className="space-y-4">
            {Array.from({ length: doc.numPages }, (_, i) => <PageCanvas key={i} doc={doc} number={i + 1} width={width} zoom={zoom} />)}
          </div>
        )}
      </div>
    </div>
  );
}
