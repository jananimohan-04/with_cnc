import { useState } from 'react';

export type SortDir = 'asc' | 'desc';

export interface SortState<T> {
  key: string | null;
  dir: SortDir;
  toggle: (key: string) => void;
  set?: (key: string | null, dir?: SortDir) => void;
  /** Returns the rows in the chosen order (the same array when no column is chosen, so the page's own default order stays). */
  apply: (rows: T[]) => T[];
  /** Same as `apply` (some pages call it by this name). */
  sortRows: (rows: T[]) => T[];
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

  return { key, dir, toggle, set, apply, sortRows: apply };
}

/** A column title. Sorting now lives in the column's funnel menu (Excel-style filter), so the title is plain text. */
export function SortLabel<T>({
  label,
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
  const defaultClass = light
    ? 'inline-flex items-center text-slate-700 font-semibold text-xs'
    : 'inline-flex items-center font-semibold text-white';
  return (
    <span title={title} className={className ? className.replace(/\b(cursor-pointer|hover:\S+)/g, '') : defaultClass}>
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}
