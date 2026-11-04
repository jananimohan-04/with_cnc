import { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export type SortDir = 'asc' | 'desc';

export interface SortState<T> {
  key: string | null;
  dir: SortDir;
  toggle: (key: string) => void;
  set?: (key: string | null, dir?: SortDir) => void;
  /** Returns the rows in the chosen order (the same array when no column is chosen, so the page's own default order stays). */
  apply: (rows: T[]) => T[];
}

/**
 * Click-to-sort for list tables, the same behaviour as the Enquiries list: the first click on a column sorts it ascending,
 * the next click flips it, and another column starts ascending again. `accessors` say what each column sorts by.
 */
export function useSort<T>(accessors: Record<string, (row: T) => string | number>): SortState<T> {
  const [key, setKey] = useState<string | null>(null);
  const [dir, setDir] = useState<SortDir>('asc');

  const toggle = (k: string) => {
    if (key === k) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setKey(k); setDir('asc'); }
  };

  const set = (k: string | null, d: SortDir = 'asc') => {
    setKey(k);
    setDir(d);
  };

  const apply = (rows: T[]): T[] => {
    const get = key ? accessors[key] : undefined;
    if (!get) return rows;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av;
      const c = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return dir === 'asc' ? c : -c;
    });
  };

  return { key, dir, toggle, set, apply };
}

/** A column title that sorts its column when clicked, with the up / down arrow beside it. */
export function SortLabel<T>({
  label,
  col,
  sort,
  title,
  className,
  light = false,
}: {
  label: string;
  col: string;
  sort: SortState<T>;
  title?: string;
  className?: string;
  light?: boolean;
}) {
  const active = sort.key === col;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  const defaultClass = light
    ? 'inline-flex items-center gap-1.5 text-slate-700 hover:text-blue-600 font-semibold transition-colors cursor-pointer text-xs'
    : 'flex items-center gap-1.5 hover:text-brand-300 transition-colors cursor-pointer';

  return (
    <button
      type="button"
      onClick={() => sort.toggle(col)}
      title={title ?? `Sort by ${label}`}
      className={className ?? defaultClass}
    >
      <span className="whitespace-nowrap">{label}</span>
      <Icon size={12} className={active ? (light ? 'text-blue-600 font-bold' : 'text-brand-300') : 'text-slate-400'} />
    </button>
  );
}
