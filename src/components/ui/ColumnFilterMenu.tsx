import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Check, X } from 'lucide-react';

/**
 * The Excel-style column menu (same look as the Inventory stock table): column name, a search box, "All" plus every
 * value found in the column (tick one or several), and a Sort section.
 */

export type SortDirection = 'asc' | 'desc';

const NUM = /^[-+]?[₹$]?\s*[-+]?[\d,]+(\.\d+)?\s*%?$/;
const DMY = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2}))?/;
const NAMED_DATE = /^(\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/;

/** A sortable key for a cell's text: a number for amounts / quantities / dates, otherwise the text itself. */
export function sortKeyOf(v: string): number | string {
  const t = v.trim();
  const plain = t.replace(/[₹$,\s]/g, '').replace(/%$/, '');
  if (NUM.test(t) && plain !== '' && !Number.isNaN(Number(plain))) return Number(plain);
  const d = DMY.exec(t);
  if (d) {
    const y = d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3]);
    return new Date(y, Number(d[2]) - 1, Number(d[1]), Number(d[4] ?? 0), Number(d[5] ?? 0)).getTime();
  }
  if (NAMED_DATE.test(t)) {
    const ms = Date.parse(t.replace(/(\d)(st|nd|rd|th)\b/, '$1'));
    if (!Number.isNaN(ms)) return ms;
  }
  return t.toLowerCase();
}

export function compareValues(a: string, b: string): number {
  const ka = sortKeyOf(a);
  const kb = sortKeyOf(b);
  if (typeof ka === 'number' && typeof kb === 'number') return ka - kb;
  if (typeof ka === 'number') return -1;
  if (typeof kb === 'number') return 1;
  return String(ka).localeCompare(String(kb), undefined, { numeric: true, sensitivity: 'base' });
}

/** True when most values in the list are numbers / dates (the sort buttons then read Low → High). */
export function isNumericList(values: string[]): boolean {
  const real = values.filter((v) => v && v !== BLANK);
  if (!real.length) return false;
  return real.filter((v) => typeof sortKeyOf(v) === 'number').length / real.length >= 0.7;
}

export const BLANK = '(Blanks)';

export function ColumnFilterMenu({
  anchor,
  title,
  values,
  selected,
  multi = true,
  onChange,
  sortDir,
  onSort,
  onClose,
  search,
  onSearch,
  allLabel = 'All',
  extra,
}: {
  anchor: DOMRect;
  title: string;
  /** Every value in the column (already de-duplicated). */
  values: string[];
  /** The ticked values; null = everything (no filter). */
  selected: Set<string> | null;
  /** Tick several values (Excel style). When false, picking a value selects only it and closes the menu. */
  multi?: boolean;
  onChange: (next: Set<string> | null) => void;
  sortDir?: SortDirection | null;
  onSort?: (dir: SortDirection) => void;
  onClose: () => void;
  /** Controlled search text (when the column filters by typed text); otherwise the menu keeps its own. */
  search?: string;
  onSearch?: (text: string) => void;
  allLabel?: string;
  extra?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [ownQuery, setOwnQuery] = useState('');
  const query = search ?? ownQuery;
  const setQuery = onSearch ?? setOwnQuery;

  useEffect(() => {
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const scroll = (e: Event) => { if (box.current && e.target instanceof Node && box.current.contains(e.target)) return; onClose(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return words.length ? values.filter((v) => words.every((w) => v.toLowerCase().includes(w))) : values;
  }, [values, query]);

  const numeric = isNumericList(values);
  const width = 340;
  const left = Math.min(Math.max(12, anchor.left), window.innerWidth - width - 16);
  const below = window.innerHeight - anchor.bottom;
  const pos = below < 460 && anchor.top > below ? { bottom: window.innerHeight - anchor.top + 4 } : { top: anchor.bottom + 4 };

  const isAll = selected == null;
  const pick = (v: string) => {
    if (!multi) { onChange(new Set([v])); onClose(); return; }
    const next = new Set(isAll ? [] : selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(next.size === 0 || next.size === values.length ? null : next);
  };
  const row = 'w-full text-left px-3 py-2 text-sm rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-colors';
  const on = 'font-bold text-blue-600 bg-blue-50/70';

  return createPortal(
    <div
      ref={box}
      style={{ left, width, ...pos }}
      className="no-glass fixed z-[9999] bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 text-sm"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 text-sm font-bold text-slate-700 uppercase tracking-wider">
        <span className="truncate">{title}</span>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-0.5 rounded" title="Close">
          <X size={16} />
        </button>
      </div>

      <div className="mb-1.5 px-0.5">
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !onSearch && shown.length === 1) pick(shown[0]); }}
          placeholder={`Search ${title.toLowerCase()}...`}
          className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800"
        />
      </div>

      <div className="max-h-80 overflow-y-auto space-y-0.5">
        <button type="button" onClick={() => { onChange(null); if (onSearch) onSearch(''); if (!multi) onClose(); }} className={`${row} justify-between ${isAll && !(onSearch && query) ? on : 'text-slate-700'}`}>
          <span>{allLabel}</span>
          {isAll && !(onSearch && query) && <Check size={15} className="text-blue-600 shrink-0" />}
        </button>
        {shown.map((v) => {
          const sel = !isAll && selected.has(v);
          return (
            <button key={v} type="button" onClick={() => pick(v)} className={`${row} justify-between ${sel ? on : 'text-slate-700'}`} title={v}>
              <span className="truncate">{v}</span>
              {sel && <Check size={15} className="text-blue-600 shrink-0" />}
            </button>
          );
        })}
        {!shown.length && <div className="px-3 py-2 text-slate-400 italic">No matching values</div>}
      </div>

      {extra}

      {onSort && (
        <div className="pt-1 mt-1 border-t border-slate-100 space-y-0.5">
          <div className="px-2 py-1 font-bold text-xs text-slate-500 uppercase tracking-wider">Sort</div>
          {(['asc', 'desc'] as const).map((d) => (
            <button key={d} type="button" onClick={() => { onSort(d); onClose(); }} className={`${row} ${sortDir === d ? on : 'text-slate-700'}`}>
              {d === 'asc' ? <ArrowUp size={15} className="text-slate-400 shrink-0" /> : <ArrowDown size={15} className="text-slate-400 shrink-0" />}
              <span>{numeric ? (d === 'asc' ? 'Low → High' : 'High → Low') : d === 'asc' ? 'A → Z (Ascending)' : 'Z → A (Descending)'}</span>
              {sortDir === d && <Check size={15} className="text-blue-600 ml-auto shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
