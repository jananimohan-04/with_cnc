import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { GripVertical, X } from 'lucide-react';

// Light scrim only: the page behind stays clearly visible (never blurred).
const SCRIM = 'bg-[rgba(15,23,42,0.12)]';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  draggable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  /** Header drag handle. Disable only for flows that must stay centered. */
  draggable?: boolean;
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Every open starts centered; the position is kept until close.
  useEffect(() => {
    if (open) setPos({ x: 0, y: 0 });
  }, [open ]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  if (!open) return null;

  const sizes: Record<string, string> = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
    '2xl': 'max-w-6xl',
    '3xl': 'max-w-7xl',
    full: 'max-w-[95vw]',
  };

  // Clamp the center so at least a grabbable portion always stays on screen.
  const clamp = (x: number, y: number) => {
    const el = boxRef.current;
    const w = el?.offsetWidth ?? 600;
    const h = el?.offsetHeight ?? 400;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      x: Math.min(Math.max(x, 140 - w / 2 - vw / 2), vw / 2 - 120 + w / 2),
      y: Math.min(Math.max(y, 56 - h / 2 - vh / 2), vh / 2 - 64 + h / 2),
    };
  };

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!draggable) return;
    // Never start a drag from a control inside the header (e.g. the X).
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    setDragging(true);
  };
  const onHeaderPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setPos(clamp(d.ox + e.clientX - d.sx, d.oy + e.clientY - d.sy));
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className={`absolute inset-0 ${SCRIM}`} onClick={onClose} />
      <div
        ref={boxRef}
        className="absolute w-full"
        style={{
          left: `calc(50% + ${pos.x}px)`,
          top: `calc(50% + ${pos.y}px)`,
          transform: 'translate(-50%, -50%)',
          maxWidth: 'calc(100vw - 2rem)',
        }}
      >
        <div
          className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizes[size] ?? sizes.md} max-h-[90vh] flex flex-col animate-scale-in border border-slate-200`}
        >
          <div
            className={`flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl select-none ${
              draggable ? 'touch-none' : ''
            } ${draggable ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            title={draggable ? 'Drag to move' : undefined}
          >
            <div className="flex items-center gap-2 min-w-0">
              {draggable && <GripVertical size={15} className="shrink-0 text-slate-300" />}
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider truncate">{title}</h2>
                {subtitle && <p className="text-xs font-medium text-slate-500 mt-0.5 truncate">{subtitle}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-8 h-8 flex items-center justify-center rounded border border-transparent hover:border-slate-200 hover:bg-white text-slate-500 transition-colors shadow-sm shrink-0"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 bg-slate-50/30">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6 last:mb-0">
      <h3 className="text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-4 border-b border-brand-100 pb-2">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className={`absolute inset-0 ${SCRIM}`} onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm p-6 animate-scale-in">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{title}</h2>
        <p className="text-sm font-medium text-slate-500 mt-2">{message}</p>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider text-white rounded transition-colors shadow-sm ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FormField({
  label,
  children,
  required,
  hint,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] font-medium text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export const inputClass =
  'w-full px-3 py-2 text-sm font-medium rounded border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm';
