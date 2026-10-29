/* Shared UI components with Framer Motion animations & Lucide icons */
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, AlertTriangle, CheckCircle2, Info, ChevronLeft, 
  ChevronRight, ArrowRight, ShieldAlert, Sparkles,
  GripHorizontal, Maximize2, Minimize2
} from 'lucide-react';

/* ---------- Toast Notification Bus ---------- */
let pushToast = () => {};

export function toast(msg, icon = 'ℹ️') {
  pushToast({ id: Date.now() + Math.random(), msg, icon });
}

export function ToastHost() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    pushToast = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 3500);
    };
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-[300] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none p-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="pointer-events-auto flex items-center gap-3 px-4 py-3 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-xl border border-slate-700/60 text-xs font-semibold"
          >
            <span className="text-base flex-shrink-0">{t.icon}</span>
            <span className="flex-1 leading-snug">{t.msg}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Status Badges ---------- */
const STATUS_STYLES = {
  Pending: { bg: 'bg-amber-50/90', text: 'text-amber-800', border: 'border-amber-300/80', dot: 'bg-amber-500 shadow-amber-500/50', glow: 'shadow-xs shadow-amber-200/50' },
  Confirmed: { bg: 'bg-blue-50/90', text: 'text-blue-800', border: 'border-blue-300/80', dot: 'bg-blue-500 shadow-blue-500/50', glow: 'shadow-xs shadow-blue-200/50' },
  Processing: { bg: 'bg-indigo-50/90', text: 'text-indigo-800', border: 'border-indigo-300/80', dot: 'bg-indigo-500 shadow-indigo-500/50', glow: 'shadow-xs shadow-indigo-200/50' },
  'Ready for Dispatch': { bg: 'bg-purple-50/90', text: 'text-purple-800', border: 'border-purple-300/80', dot: 'bg-purple-500 shadow-purple-500/50', glow: 'shadow-xs shadow-purple-200/50' },
  Shipped: { bg: 'bg-cyan-50/90', text: 'text-cyan-800', border: 'border-cyan-300/80', dot: 'bg-cyan-500 shadow-cyan-500/50', glow: 'shadow-xs shadow-cyan-200/50' },
  Delivered: { bg: 'bg-emerald-50/90', text: 'text-emerald-800', border: 'border-emerald-300/80', dot: 'bg-emerald-500 shadow-emerald-500/50', glow: 'shadow-xs shadow-emerald-200/50' },
  Cancelled: { bg: 'bg-rose-50/90', text: 'text-rose-800', border: 'border-rose-300/80', dot: 'bg-rose-500 shadow-rose-500/50', glow: 'shadow-xs shadow-rose-200/50' },
  Quoted: { bg: 'bg-sky-50/90', text: 'text-sky-800', border: 'border-sky-300/80', dot: 'bg-sky-500 shadow-sky-500/50', glow: 'shadow-xs shadow-sky-200/50' },
  Accepted: { bg: 'bg-teal-50/90', text: 'text-teal-800', border: 'border-teal-300/80', dot: 'bg-teal-500 shadow-teal-500/50', glow: 'shadow-xs shadow-teal-200/50' },
  Rejected: { bg: 'bg-red-50/90', text: 'text-red-800', border: 'border-red-300/80', dot: 'bg-red-500 shadow-red-500/50', glow: 'shadow-xs shadow-red-200/50' },
  active: { bg: 'bg-emerald-50/90', text: 'text-emerald-800', border: 'border-emerald-300/80', dot: 'bg-emerald-500 shadow-emerald-500/50', glow: 'shadow-xs shadow-emerald-200/50' },
  suspended: { bg: 'bg-rose-50/90', text: 'text-rose-800', border: 'border-rose-300/80', dot: 'bg-rose-500 shadow-rose-500/50', glow: 'shadow-xs shadow-rose-200/50' }
};

export function StatusBadge({ status }) {
  const conf = STATUS_STYLES[status] || {
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
    glow: ''
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border tracking-wide uppercase transition-all ${conf.bg} ${conf.text} ${conf.border} ${conf.glow}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${conf.dot} ${status === 'Pending' ? 'animate-pulse' : ''}`} />
      <span>{status}</span>
    </span>
  );
}

export function statusBadge(status) {
  return <StatusBadge status={status} />;
}

/* ---------- Themed Page Hero / Header Banner (Compact Single-Line) ---------- */
export function PageHero({
  icon: IconComponent,
  title,
  subtitle,
  badgeText,
  badgeColor = 'blue',
  gradient = 'from-blue-600 to-indigo-600',
  actions,
  tabs,
  className = ''
}) {
  const BADGE_COLORS = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    purple: 'bg-purple-50 text-purple-800 border-purple-200',
    rose: 'bg-rose-50 text-rose-800 border-rose-200',
    fuchsia: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200',
    teal: 'bg-teal-50 text-teal-800 border-teal-200',
    orange: 'bg-orange-50 text-orange-800 border-orange-200'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`relative overflow-hidden ${className ? className : 'bg-gradient-to-r from-[#EFE4D6] via-[#E8DCCF] to-[#DECDBE] border-[#BAA794]'} rounded-xl border px-4 py-2.5 sm:px-5 sm:py-3 shadow-xs mb-3.5`}
    >
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 via-amber-500 to-transparent" />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          {IconComponent && (
            <div className={`p-2 rounded-xl bg-gradient-to-br ${gradient} text-white shadow-xs flex-shrink-0`}>
              <IconComponent className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          )}
          <h1 className="text-base sm:text-lg font-black text-[#1A0A03] tracking-tight whitespace-nowrap flex-shrink-0">{title}</h1>
          {badgeText && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border flex-shrink-0 ${BADGE_COLORS[badgeColor] || BADGE_COLORS.blue}`}>
              {badgeText}
            </span>
          )}
          {tabs && (
            <div className="flex items-center overflow-x-auto">
              {tabs}
            </div>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ---------- Modal Dialog ---------- */
/* ---------- Modal Dialog (Draggable, 4-Side Resizable, Zero Backdrop Blur) ---------- */
export function Modal({ title, onClose, wide, children }) {
  const initWidth = typeof window !== 'undefined'
    ? (wide ? Math.min(1040, window.innerWidth - 32) : Math.min(620, window.innerWidth - 32))
    : 620;
  const initHeight = typeof window !== 'undefined'
    ? Math.min(660, window.innerHeight - 48)
    : 560;
  const initLeft = typeof window !== 'undefined'
    ? Math.max(16, Math.round((window.innerWidth - initWidth) / 2))
    : 32;
  const initTop = typeof window !== 'undefined'
    ? Math.max(20, Math.round((window.innerHeight - initHeight) / 2))
    : 32;

  const [rect, setRect] = useState({
    left: initLeft,
    top: initTop,
    width: initWidth,
    height: initHeight
  });
  const [isMaximized, setIsMaximized] = useState(false);
  const prevRectRef = useRef(rect);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle Dragging via Header
  const handleHeaderMouseDown = (e) => {
    if (e.target.closest('button, a, input, select, textarea')) return;
    if (isMaximized) return;
    e.preventDefault();

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top
    };

    const handleMouseMove = (moveEvent) => {
      if (!dragRef.current) return;
      const dx = moveEvent.clientX - dragRef.current.startX;
      const dy = moveEvent.clientY - dragRef.current.startY;
      setRect((prev) => {
        const newLeft = dragRef.current.startLeft + dx;
        const newTop = dragRef.current.startTop + dy;
        const clampedTop = Math.max(0, Math.min(window.innerHeight - 50, newTop));
        const clampedLeft = Math.max(-prev.width + 120, Math.min(window.innerWidth - 120, newLeft));
        return { ...prev, left: clampedLeft, top: clampedTop };
      });
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Handle Resizing from 4 Sides and 4 Corners
  const handleResizeStart = (dir, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMaximized) return;

    resizeRef.current = {
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      startWidth: rect.width,
      startHeight: rect.height
    };

    const handleResizeMove = (moveEvent) => {
      if (!resizeRef.current) return;
      const { dir: direction, startX, startY, startLeft, startTop, startWidth, startHeight } = resizeRef.current;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      setRect(() => {
        let newWidth = startWidth;
        let newHeight = startHeight;
        let newLeft = startLeft;
        let newTop = startTop;

        const minW = 340;
        const minH = 200;
        const maxW = window.innerWidth - 16;
        const maxH = window.innerHeight - 16;

        if (direction.includes('e')) {
          newWidth = Math.max(minW, Math.min(maxW, startWidth + dx));
        } else if (direction.includes('w')) {
          const potentialW = startWidth - dx;
          if (potentialW >= minW && potentialW <= maxW) {
            newWidth = potentialW;
            newLeft = startLeft + dx;
          }
        }

        if (direction.includes('s')) {
          newHeight = Math.max(minH, Math.min(maxH, startHeight + dy));
        } else if (direction.includes('n')) {
          const potentialH = startHeight - dy;
          if (potentialH >= minH && potentialH <= maxH) {
            newHeight = potentialH;
            newTop = startTop + dy;
          }
        }

        return { left: newLeft, top: newTop, width: newWidth, height: newHeight };
      });
    };

    const handleResizeEnd = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    };

    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
  };

  const toggleMaximize = () => {
    if (isMaximized) {
      setRect(prevRectRef.current);
      setIsMaximized(false);
    } else {
      prevRectRef.current = rect;
      setRect({
        left: 12,
        top: 12,
        width: window.innerWidth - 24,
        height: window.innerHeight - 24
      });
      setIsMaximized(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-slate-900/35 overflow-hidden"
      style={{ backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div
        style={{
          position: 'fixed',
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          zIndex: 210,
          maxWidth: '100vw',
          maxHeight: '100vh'
        }}
        onClick={(e) => e.stopPropagation()}
        className="modal bg-[#EDE1D3] rounded-2xl shadow-2xl border border-[#BAA794] overflow-hidden flex flex-col relative select-text"
      >
        {/* Resize Handles (4 Sides + 4 Corners) */}
        {!isMaximized && (
          <>
            {/* Top Side */}
            <div
              onMouseDown={(e) => handleResizeStart('n', e)}
              className="absolute -top-1.5 left-4 right-4 h-3 cursor-ns-resize z-30"
              title="Drag to resize top"
            />
            {/* Bottom Side */}
            <div
              onMouseDown={(e) => handleResizeStart('s', e)}
              className="absolute -bottom-1.5 left-4 right-4 h-3 cursor-ns-resize z-30"
              title="Drag to resize bottom"
            />
            {/* Left Side */}
            <div
              onMouseDown={(e) => handleResizeStart('w', e)}
              className="absolute top-4 bottom-4 -left-1.5 w-3 cursor-ew-resize z-30"
              title="Drag to resize left"
            />
            {/* Right Side */}
            <div
              onMouseDown={(e) => handleResizeStart('e', e)}
              className="absolute top-4 bottom-4 -right-1.5 w-3 cursor-ew-resize z-30"
              title="Drag to resize right"
            />

            {/* Corners */}
            <div
              onMouseDown={(e) => handleResizeStart('nw', e)}
              className="absolute -top-2 -left-2 w-5 h-5 cursor-nwse-resize z-40"
              title="Resize corner"
            />
            <div
              onMouseDown={(e) => handleResizeStart('ne', e)}
              className="absolute -top-2 -right-2 w-5 h-5 cursor-nesw-resize z-40"
              title="Resize corner"
            />
            <div
              onMouseDown={(e) => handleResizeStart('sw', e)}
              className="absolute -bottom-2 -left-2 w-5 h-5 cursor-nesw-resize z-40"
              title="Resize corner"
            />
            <div
              onMouseDown={(e) => handleResizeStart('se', e)}
              className="absolute -bottom-1.5 -right-1.5 w-5 h-5 cursor-nwse-resize z-40 flex items-end justify-end p-0.5"
              title="Resize corner"
            >
              <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-[#BAA794] rounded-br-xs pointer-events-none mb-0.5 mr-0.5" />
            </div>
          </>
        )}

        {/* Draggable Header */}
        <div
          onMouseDown={handleHeaderMouseDown}
          className="flex items-center justify-between px-5 py-3.5 border-b border-[#BAA794] bg-[#DECDBE] select-none cursor-move flex-shrink-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <GripHorizontal className="w-4 h-4 text-[#6B503E] flex-shrink-0 cursor-move" title="Drag to move popup" />
            <h3 className="font-extrabold text-[#1A0A03] text-sm tracking-tight truncate">{title}</h3>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
            <button
              onClick={toggleMaximize}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6B503E] hover:text-[#1A0A03] hover:bg-[#D4C2B0]/60 transition-colors cursor-pointer"
              title={isMaximized ? "Restore size" : "Maximize popup"}
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6B503E] hover:text-[#1A0A03] hover:bg-[#D4C2B0]/60 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Tab Switcher ---------- */
export function Tabs({ tabs = [], active, onTab, onChange, className = '', compact = false }) {
  const handler = onTab || onChange || (() => {});
  return (
    <div className={`flex items-center gap-1.5 p-1 bg-[#DECDBE] rounded-2xl w-fit border border-[#BAA794] overflow-x-auto max-w-full ${className !== undefined && className !== '' ? className : 'mb-5'}`}>
      {tabs.map((t) => {
        const id = Array.isArray(t) ? t[0] : (typeof t === 'string' ? t : t.id);
        const label = Array.isArray(t) ? t[1] : (typeof t === 'string' ? t : (t.label || t.name));
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => handler(id)}
            className={`flex items-center gap-2 ${compact ? 'px-3 py-1.5 rounded-xl' : 'px-4 py-2 rounded-xl'} text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              isActive
                ? 'bg-[#EDE1D3] text-[#1A0A03] shadow-xs border border-[#BAA794]'
                : 'text-[#6B503E] hover:text-[#1A0A03] hover:bg-[#D4C2B0]/60'
            }`}
          >
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Confirm Dialog ---------- */
export function Confirm({ title, body, okLabel = 'Confirm', danger = false, busy = false, onCancel, onOk }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${danger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="text-xs text-[#2E1508] leading-relaxed pt-1" dangerouslySetInnerHTML={{ __html: body }} />
        </div>
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#BAA794]">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-xl text-xs font-bold text-[#2E1508] hover:bg-[#DECDBE] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onOk}
            disabled={busy}
            className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-sm cursor-pointer disabled:opacity-50 ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {busy ? 'Processing…' : okLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Page Header (Compact Single-Line) ---------- */
export function PageHead({ title, eyebrow, desc, actions }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap pb-2 border-b border-[#BAA794] mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        {eyebrow && <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#6B503E]">{eyebrow}</span>}
        <h1 className="text-lg font-black text-[#1A0A03] tracking-tight">{title}</h1>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/* ---------- Empty State ---------- */
export function Empty({ icon = '📭', title = 'No records found', sub, action }) {
  return (
    <div className="py-16 px-4 text-center max-w-md mx-auto">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-bold text-[#1A0A03] text-sm mb-1">{title}</h3>
      {sub && <p className="text-xs text-[#6B503E] mb-4">{sub}</p>}
      {action}
    </div>
  );
}

/* ---------- Skeleton Loader ---------- */
export function Skeleton({ h = 200, count = 1 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{ height: h }}
          className="w-full bg-gradient-to-r from-slate-100 via-slate-200/60 to-slate-100 rounded-2xl animate-pulse"
        />
      ))}
    </div>
  );
}

/* ---------- Pagination Controls ---------- */
export function Pager({ total, page = 1, limit = 8, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-4 pt-4 border-t border-[#BAA794] text-xs">
      <div className="text-[#6B503E]">
        Showing <span className="font-bold text-[#1A0A03] font-mono">{(page - 1) * limit + 1}</span>–
        <span className="font-bold text-[#1A0A03] font-mono">{Math.min(page * limit, total)}</span> of{' '}
        <span className="font-bold text-[#1A0A03] font-mono">{total}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg border border-[#BAA794] text-[#2E1508] hover:bg-[#DECDBE] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-3 font-semibold text-[#2E1508]">
          Page {page} of {pages}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="p-1.5 rounded-lg border border-[#BAA794] text-[#2E1508] hover:bg-[#DECDBE] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ---------- Data Table ---------- */
export function DataTable({ cols, rows = [], rowKey = (r, i) => r.id || i, empty = 'No items found.' }) {
  if (!rows || !rows.length) {
    return <div className="text-center py-12 text-xs text-[#6B503E]">{empty}</div>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#BAA794] bg-[#EDE1D3] shadow-2xs">
      <table className="w-full text-left text-xs">
        <thead className="bg-[#DECDBE] border-b border-[#BAA794] text-[10px] uppercase font-bold text-[#2E1508] tracking-wider">
          <tr>
            {cols.map((c) => (
              <th key={c.key} className="px-4 py-3 font-bold">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#D8C6B5]">
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className="hover:bg-[#E5D7C9] transition-colors">
              {cols.map((c) => (
                <td key={c.key} className="px-4 py-3 text-[#1A0A03] align-middle">
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Distribution Bars ---------- */
export function Bars({ items, color = '#2563EB' }) {
  if (!items || !items.length) {
    return <div className="text-center py-6 text-xs text-[#6B503E]">Not enough data yet.</div>;
  }
  const mx = Math.max(...items.map((r) => r.value), 1);
  return (
    <div className="space-y-2">
      {items.map((r, i) => (
        <div key={i} className="grid grid-cols-[140px_1fr_48px] gap-3 items-center text-xs">
          <span className="truncate text-[#2E1508] font-medium" title={r.label}>
            {r.label}
          </span>
          <div className="w-full bg-[#D4C2B0] h-2.5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(3, (r.value / mx) * 100)}%`,
                backgroundColor: r.color || color
              }}
            />
          </div>
          <span className="text-right font-bold font-mono text-[#1A0A03]">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Form Field ---------- */
export function Field({ label, req, hint, full, children }) {
  return (
    <div className={`space-y-1.5 ${full ? 'sm:col-span-2' : ''}`}>
      {label && (
        <label className="text-xs font-bold text-[#2E1508] flex items-center gap-1">
          <span>{label}</span>
          {req && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && <span className="text-[11px] text-[#6B503E] block">{hint}</span>}
    </div>
  );
}

/* ---------- KPI Metric Tile ---------- */
export function Kpi({ to, onClick, value, label, sub, grad, compact = false, small = false }) {
  const content = (
    <div
      onClick={onClick}
      style={{ background: grad || 'linear-gradient(135deg,#172554,#2563EB)' }}
      className={`rounded-lg text-white shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${
        onClick ? 'cursor-pointer hover:scale-[1.015] active:scale-[0.98]' : ''
      } ${small ? 'p-1.5 px-2.5 min-h-[46px]' : compact ? 'p-2 min-h-[58px]' : 'p-2.5 sm:p-3 min-h-[64px]'}`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <div className={`${small ? 'text-lg' : 'text-xl sm:text-2xl'} font-black font-mono tracking-tight leading-none`}>{value}</div>
      </div>
      <div className="mt-0.5 min-w-0">
        <div className={`${small ? 'text-[10.5px]' : 'text-[11px] sm:text-xs'} font-bold opacity-90 truncate leading-tight`}>{label}</div>
        {sub && <div className={`${small ? 'text-[9px]' : 'text-[9.5px] sm:text-[10px]'} opacity-75 mt-0.5 truncate leading-tight`}>{sub}</div>}
      </div>
    </div>
  );

  if (to) {
    return <a href={to} className="block transition-transform hover:-translate-y-0.5">{content}</a>;
  }
  return content;
}
