import { Children, isValidElement, useEffect, useRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { Filter, X } from 'lucide-react';

/**
 * Column-heading filters in the Inventory style: a small white funnel beside the column title (no box), and when a filter
 * is on, the funnel turns light blue and a rounded chip with the chosen value and an × appears next to it.
 */

const fakeChange = (value: string) =>
  ({ target: { value }, currentTarget: { value }, stopPropagation() {}, preventDefault() {} }) as never;

const FUNNEL = 'relative inline-flex items-center justify-center w-5 h-5 rounded cursor-pointer transition-colors hover:bg-blue-500/30';

export function FilterChip({ text, onClear }: { text: string; onClear?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold normal-case tracking-normal text-blue-700 bg-white border border-blue-200 px-1.5 py-0.5 rounded-full whitespace-nowrap"
      title={`Active filter: ${text}`}
    >
      <span className="max-w-[90px] truncate">{text}</span>
      {onClear && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="text-blue-500 hover:text-blue-800 rounded-full p-0.5"
          title="Clear filter"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

export function FunnelIcon({ active }: { active: boolean }) {
  return <Filter size={12} className={`shrink-0 ${active ? 'text-sky-300 fill-sky-300' : 'text-white'}`} style={{ color: active ? '#7dd3fc' : '#ffffff' }} />;
}

/** Text of an <option> child (strings / numbers joined). */
const textOf = (n: ReactNode): string =>
  Children.toArray(n).map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement(c) ? textOf((c.props as { children?: ReactNode }).children) : '')).join('');

/** Drop-in replacement for a <select> inside a table heading: the same props and <option> children. */
export function HeaderSelect({ children, className: _c, style: _s, value, onChange, title, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = Children.toArray(children).flatMap((c) =>
    isValidElement(c) && c.type === 'optgroup' ? Children.toArray((c.props as { children?: ReactNode }).children) : [c],
  ).filter(isValidElement) as React.ReactElement<{ value?: unknown; children?: ReactNode }>[];
  const optValue = (o: React.ReactElement<{ value?: unknown; children?: ReactNode }>) => String(o.props.value ?? textOf(o.props.children));
  const allValue = options.length ? optValue(options[0]) : '';
  const current = value == null ? '' : String(value);
  const active = current !== '' && current !== allValue;
  const chosen = options.find((o) => optValue(o) === current);
  const label = chosen ? textOf(chosen.props.children) || current : current;

  return (
    <span className="inline-flex items-center gap-1 align-middle normal-case tracking-normal">
      <span className={FUNNEL} title={title ?? rest['aria-label'] ?? 'Filter'}>
        <FunnelIcon active={active} />
        <select
          {...rest}
          value={value}
          onChange={onChange}
          title={title}
          className="absolute inset-0 w-full h-full cursor-pointer appearance-none"
          style={{ opacity: 0, fontSize: 12 }}
        >
          {children}
        </select>
      </span>
      {active && <FilterChip text={label} onClear={onChange ? () => onChange(fakeChange(allValue)) : undefined} />}
    </span>
  );
}

/** Drop-in replacement for a text <input> filter inside a table heading: the funnel opens a small search box. */
export function HeaderInput({ className: _c, style: _s, value, onChange, placeholder, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const current = value == null ? '' : String(value);
  const active = current.trim() !== '';

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  return (
    <span ref={wrap} className="relative inline-flex items-center gap-1 align-middle normal-case tracking-normal">
      <button type="button" className={FUNNEL} title={rest['aria-label'] ?? 'Filter'} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <FunnelIcon active={active} />
      </button>
      {active && <FilterChip text={current} onClear={onChange ? () => onChange(fakeChange('')) : undefined} />}
      {open && (
        <span className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-1.5" onClick={(e) => e.stopPropagation()}>
          <input
            {...rest}
            autoFocus
            value={value}
            onChange={onChange}
            placeholder={placeholder ?? 'Filter…'}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setOpen(false); rest.onKeyDown?.(e); }}
            className="h-7 w-44 rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
          />
        </span>
      )}
    </span>
  );
}
