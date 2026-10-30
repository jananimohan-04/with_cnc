import { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export type SortDir = 'asc' | 'desc';

export interface SortState<T> {
  key: string | null;
  dir: SortDir;
  toggle: (key: string) => void;
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

  return { key, dir, toggle, apply };
}

/** A column title that sorts its column when clicked, with the up / down arrow beside it. */
export function SortLabel<T>({ label, col, sort, title }: { label: string; col: string; sort: SortState<T>; title?: string }) {
  const active = sort.key === col;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => sort.toggle(col)}
      title={title ?? `Sort by ${label}`}
      className="flex items-center gap-1.5 hover:text-brand-300 transition-colors cursor-pointer"
    >
      <span className="whitespace-nowrap">{label}</span>
      <Icon size={12} className={active ? 'text-brand-300' : 'text-slate-400'} />
    </button>
  );
}
