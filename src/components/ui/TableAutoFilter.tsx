import { useCallback, useEffect, useState } from 'react';
import { BLANK, ColumnFilterMenu, compareValues } from './ColumnFilterMenu';
import type { SortDirection } from './ColumnFilterMenu';

/**
 * Excel-style filters on every table in the app, without touching each page: every column heading gets a funnel that opens
 * the column menu (search, tick values, sort). Filtering hides the rows that don't match; sorting reorders the rows on screen.
 * Columns that already have their own filter (Inventory, company / status filters) keep theirs and can call
 * `sortByHeader` / `headerValues` below. Opt a table out with the class `no-autofilter`.
 */

type TableState = { filters: Map<number, Set<string>>; sort: { col: number; dir: SortDirection } | null };

const state = new WeakMap<HTMLTableElement, TableState>();
const watched = new WeakSet<HTMLTableSectionElement>();
let observer: MutationObserver | null = null;
let openMenu: ((m: OpenMenu | null) => void) | null = null;

type OpenMenu = { table: HTMLTableElement; col: number; title: string; rect: DOMRect };

const FUNNEL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>';

const st = (t: HTMLTableElement): TableState => {
  let s = state.get(t);
  if (!s) { s = { filters: new Map(), sort: null }; state.set(t, s); }
  return s;
};

const headerRow = (t: HTMLTableElement) => (t.tHead && t.tHead.rows.length ? t.tHead.rows[t.tHead.rows.length - 1] : null);

const colCount = (t: HTMLTableElement) => {
  const r = headerRow(t);
  return r ? Array.from(r.cells).reduce((n, c) => n + (c.colSpan || 1), 0) : 0;
};

/** Column number of a heading cell (counting colspans). */
export function columnOf(th: HTMLTableCellElement): number {
  let n = 0;
  for (const c of Array.from((th.parentElement as HTMLTableRowElement).cells)) { if (c === th) return n; n += c.colSpan || 1; }
  return n;
}

const cellAt = (tr: HTMLTableRowElement, col: number) => {
  let n = 0;
  for (const c of Array.from(tr.cells)) { const span = c.colSpan || 1; if (col >= n && col < n + span) return c; n += span; }
  return null;
};

/** The text a person sees in a cell (chosen option for a dropdown, typed value for a box). */
function cellText(cell: HTMLTableCellElement | null): string {
  if (!cell) return BLANK;
  const sel = cell.querySelector('select');
  if (sel) return (sel.selectedOptions[0]?.text ?? '').trim() || BLANK;
  const inp = cell.querySelector('input:not([type=checkbox]):not([type=radio]):not([type=hidden])') as HTMLInputElement | null;
  if (inp && !cell.textContent?.trim()) return inp.value.trim() || BLANK;
  const parts: string[] = [];
  const walk = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('option, script, style, [data-af-btn]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walk.nextNode(); n; n = walk.nextNode()) { const t = n.textContent?.trim(); if (t) parts.push(t); }
  return parts.join(' ').replace(/\s+/g, ' ').trim() || BLANK;
}

/** Rows that carry a value per column (not "no records" rows or full-width detail rows). */
const dataRows = (t: HTMLTableElement) => {
  const need = colCount(t);
  return Array.from(t.tBodies).flatMap((b) => Array.from(b.rows)).filter((r) => {
    const span = Array.from(r.cells).reduce((n, c) => n + (c.colSpan || 1), 0);
    return r.cells.length > 1 && span >= need - 1;
  });
};

/** Every distinct value in a column, sorted. */
export function columnValues(t: HTMLTableElement, col: number): string[] {
  const set = new Set<string>();
  for (const r of dataRows(t)) set.add(cellText(cellAt(r, col)));
  return Array.from(set).sort(compareValues);
}

export function headerValues(th: Element | null): string[] {
  const cell = th?.closest('th') as HTMLTableCellElement | null;
  const t = cell?.closest('table') as HTMLTableElement | null;
  return cell && t ? columnValues(t, columnOf(cell)).filter((v) => v !== BLANK) : [];
}

function apply(t: HTMLTableElement) {
  const s = st(t);
  const rows = dataRows(t);
  for (const r of rows) {
    let show = true;
    for (const [c, vals] of s.filters) if (!vals.has(cellText(cellAt(r, c)))) { show = false; break; }
    if (show) { if (r.dataset.afHidden) { r.style.display = ''; delete r.dataset.afHidden; } }
    else if (!r.dataset.afHidden) { r.style.display = 'none'; r.dataset.afHidden = '1'; }
  }
  if (s.sort) {
    const { col, dir } = s.sort;
    for (const body of Array.from(t.tBodies)) {
      const mine = rows.filter((r) => r.parentElement === body);
      if (mine.length < 2) continue;
      const keyed = mine.map((r, i) => ({ r, i, v: cellText(cellAt(r, col)) }));
      const sorted = [...keyed].sort((a, b) => (dir === 'asc' ? 1 : -1) * compareValues(a.v, b.v) || a.i - b.i);
      if (sorted.every((x, i) => x.r === mine[i])) continue;
      for (const x of sorted) body.appendChild(x.r);
    }
  }
  // funnels light up for filtered columns
  headerRow(t)?.querySelectorAll<HTMLElement>('[data-af-btn]').forEach((b) => {
    const c = Number(b.dataset.afCol);
    b.classList.toggle('af-on', s.filters.has(c));
    b.classList.toggle('af-sorted', s.sort?.col === c);
  });
  observer?.takeRecords();   // our own row moves are not "new rows"
}

/** Sort a table by the column under this heading element (used by columns that keep their own filter). */
export function sortByHeader(el: Element | null, dir: SortDirection) {
  const th = el?.closest('th') as HTMLTableCellElement | null;
  const t = th?.closest('table') as HTMLTableElement | null;
  if (!th || !t) return;
  st(t).sort = { col: columnOf(th), dir };
  watch(t);
  apply(t);
}

export function headerSortDir(el: Element | null): SortDirection | null {
  const th = el?.closest('th') as HTMLTableCellElement | null;
  const t = th?.closest('table') as HTMLTableElement | null;
  if (!th || !t) return null;
  const s = state.get(t)?.sort;
  return s && s.col === columnOf(th) ? s.dir : null;
}

function watch(t: HTMLTableElement) {
  for (const b of Array.from(t.tBodies)) {
    if (watched.has(b)) continue;
    watched.add(b);
    new MutationObserver(() => {
      const s = state.get(t);
      if (s && (s.filters.size || s.sort)) requestAnimationFrame(() => apply(t));
    }).observe(b, { childList: true, subtree: true, characterData: true });
  }
}

const SKIP_LABEL = /^(#|s\.?\s?no\.?|sl\.?\s?no\.?|sr\.?\s?no\.?|actions?|action|options?|select|)$/i;

function labelOf(th: HTMLTableCellElement): string {
  const parts: string[] = [];
  const walk = document.createTreeWalker(th, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('option, select, [data-af-btn], [data-colfilter]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walk.nextNode(); n; n = walk.nextNode()) { const x = n.textContent?.trim(); if (x) parts.push(x); }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function setup(t: HTMLTableElement) {
  if (t.closest('.no-autofilter, [role="dialog"], .fixed') || t.classList.contains('no-autofilter')) return;
  const head = headerRow(t);
  if (!head || !t.tHead || t.tHead.rows.length !== 1 || !t.tBodies.length) return;
  // data-entry grids (rows of input boxes) are not lists
  const first = t.tBodies[0].rows[0];
  if (first && first.querySelectorAll('input:not([type=checkbox]):not([type=radio]), textarea').length >= 2) return;
  for (const th of Array.from(head.cells) as HTMLTableCellElement[]) {
    if (th.tagName !== 'TH') continue;
    if (th.querySelector('[data-af-btn], [data-colfilter], button[title^="Filter & sort"], input[type=checkbox]')) continue;
    const label = labelOf(th);
    if (SKIP_LABEL.test(label) || label.length > 60) continue;
    const col = columnOf(th);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'af-btn';
    btn.dataset.afBtn = '1';
    btn.dataset.afCol = String(col);
    btn.title = `Filter & sort by ${label}`;
    btn.innerHTML = FUNNEL_SVG;
    const s = state.get(t);
    if (s?.filters.has(col)) btn.classList.add('af-on');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      openMenu?.({ table: t, col: columnOf(th), title: labelOf(th), rect: btn.getBoundingClientRect() });
    });
    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    // sit on the same line as the title
    const only = th.children.length === 1 ? (th.children[0] as HTMLElement) : null;
    const host = only && only.tagName === 'DIV' && /flex/.test(getComputedStyle(only).display) ? only : th;
    host.appendChild(btn);
    if (host === th) th.style.whiteSpace = 'nowrap';
  }
}

function scan() {
  document.querySelectorAll('main table').forEach((t) => setup(t as HTMLTableElement));
}

/** Mount once (in App): adds the funnels and shows the column menu. */
export function TableAutoFilter() {
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    openMenu = setMenu;
    let queued = false;
    const run = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; scan(); }); };
    observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    run();
    return () => { observer?.disconnect(); observer = null; openMenu = null; };
  }, []);

  const close = useCallback(() => setMenu(null), []);
  if (!menu || !menu.table.isConnected) return null;
  const s = st(menu.table);

  return (
    <ColumnFilterMenu
      anchor={menu.rect}
      title={menu.title}
      values={columnValues(menu.table, menu.col)}
      selected={s.filters.get(menu.col) ?? null}
      onChange={(next) => {
        if (next) s.filters.set(menu.col, next); else s.filters.delete(menu.col);
        watch(menu.table);
        apply(menu.table);
        bump((n) => n + 1);
      }}
      sortDir={s.sort?.col === menu.col ? s.sort.dir : null}
      onSort={(dir) => { s.sort = { col: menu.col, dir }; watch(menu.table); apply(menu.table); }}
      onClose={close}
    />
  );
}
