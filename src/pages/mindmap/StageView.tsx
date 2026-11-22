// "Stage view" of a mind map: the centre at the top with a glowing title, each main branch as a coloured stage
// header in one row (joined to the centre by glowing curves), and under each stage a numbered list of its points
// (nested points indented, each level numbered 1, 2, 3...). Same data and the same editing as the canvas:
// click = select, double-click = rename, + = add a point under it, the small circle = fold / unfold, bin = delete.

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import type { MindMapNode } from '@/lib/mindmap/types';

// one shared empty list: a new [] on every draw made the curve effect redraw forever (blank page on items with no points)
const NONE: MindMapNode[] = [];

const COLORS = ['#ef4444', '#eab308', '#22c55e', '#f97316', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e'];

interface Props {
  nodes: MindMapNode[];
  title: string;
  canEdit: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRename: (id: string, title: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onToggleCollapse: (id: string, collapsed: boolean) => void;
  /** The point shown as the centre (opened like a folder); null = the real centre. */
  focusId?: string | null;
  /** Open a stage / point as its own page. */
  onOpen?: (id: string) => void;
}

export function StageView({ nodes, title, canEdit, selectedId, onSelect, onRename, onAddChild, onDelete, onToggleCollapse, focusId = null, onOpen }: Props) {
  const kids = useMemo(() => {
    const m = new Map<string | null, MindMapNode[]>();
    for (const n of nodes) {
      const k = n.parent_node_id ?? null;
      (m.get(k) ?? m.set(k, []).get(k)!).push(n);
    }
    for (const list of m.values()) list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.created_at).localeCompare(String(b.created_at)));
    return m;
  }, [nodes]);
  const root = (focusId ? nodes.find((x) => x.id === focusId) : undefined) ?? (kids.get(null) ?? [])[0];
  const stages = (root && kids.get(root.id)) || NONE;

  // glowing curves from the centre to each stage header (measured after layout)
  const wrapRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRefs = useRef(new Map<string, HTMLDivElement>());
  const [curves, setCurves] = useState<{ d: string; color: string }[]>([]);
  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current, r = rootRef.current;
      if (!wrap || !r) return;
      const w = wrap.getBoundingClientRect();
      const rb = r.getBoundingClientRect();
      const x1 = rb.left + rb.width / 2 - w.left + wrap.scrollLeft, y1 = rb.bottom - w.top + wrap.scrollTop;
      const next = stages.map((s, i) => {
        const el = stageRefs.current.get(s.id);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const x2 = b.left + b.width / 2 - w.left + wrap.scrollLeft, y2 = b.top - w.top + wrap.scrollTop;
        const my = y1 + (y2 - y1) * 0.55;
        return { d: `M${x1},${y1} C${x1},${my} ${x2},${y1 + 6} ${x2},${y2}`, color: COLORS[i % COLORS.length] };
      }).filter(Boolean) as { d: string; color: string }[];
      // only redraw when a curve really moved
      setCurves((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [stages, nodes]);

  if (!root) return <div className="flex flex-1 items-center justify-center bg-[#070b18] text-sm text-slate-400">This mind map has no centre yet.</div>;

  return (
    <div ref={wrapRef} className="stage-view relative flex-1 overflow-auto bg-[#070b18]" onClick={() => onSelect(null)}
      style={{ backgroundImage: 'radial-gradient(rgba(148,163,184,0.10) 1px, transparent 1px)', backgroundSize: '22px 22px' }}>
      <svg className="pointer-events-none absolute left-0 top-0" width="100%" height="100%" style={{ minWidth: wrapRef.current?.scrollWidth, minHeight: wrapRef.current?.scrollHeight, overflow: 'visible' }}>
        <defs>
          <filter id="stage-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {curves.map((c, i) => <path key={i} d={c.d} fill="none" stroke={c.color} strokeWidth={2.2} filter="url(#stage-glow)" opacity={0.95} />)}
      </svg>

      <div className="relative mx-auto w-max min-w-full px-10 pb-16 pt-10">
        {/* the centre */}
        <div className="flex justify-center">
          <div ref={rootRef} onClick={(e) => { e.stopPropagation(); onSelect(root.id); }}
            className={`relative rounded-2xl border bg-[#0d1326] px-8 py-3 text-center shadow-[0_0_30px_rgba(99,102,241,0.25)] ${selectedId === root.id ? 'border-indigo-400' : 'border-slate-600/60'}`}>
            <EditableText value={root.title || title} editable={canEdit} onSave={(t) => onRename(root.id, t)}
              className="bg-gradient-to-r from-orange-400 via-pink-400 via-50% to-sky-400 bg-clip-text text-3xl font-black tracking-wide text-transparent" />
            <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{stages.length} {focusId ? 'point' : 'stage'}{stages.length === 1 ? '' : 's'}</p>
            {canEdit && <HoverAdd onClick={() => onAddChild(root.id)} title="Add a stage" />}
          </div>
        </div>

        {/* the stages */}
        <div className="mt-20 flex items-start gap-10">
          {stages.map((s, i) => {
            const color = COLORS[i % COLORS.length];
            const sub = kids.get(s.id) ?? [];
            return (
              <div key={s.id} className="w-max min-w-[160px] max-w-[320px] shrink-0">
                <div ref={(el) => { if (el) stageRefs.current.set(s.id, el); else stageRefs.current.delete(s.id); }}
                  onClick={(e) => { e.stopPropagation(); onSelect(s.id); }}
                  className="group relative inline-flex max-w-[260px] items-center gap-2 rounded-xl border-2 bg-[#0d1326] px-3 py-2"
                  style={{ borderColor: color, boxShadow: `0 0 18px ${color}66, inset 0 0 12px ${color}22`, outline: selectedId === s.id ? `2px solid ${color}` : undefined, outlineOffset: 3 }}>
                  <span className="h-3 w-3 shrink-0 rounded-full border-2" style={{ borderColor: `${color}aa` }} />
                  <EditableText value={s.title} editable={canEdit} onSave={(t) => onRename(s.id, t)} className="text-[14px] font-extrabold uppercase leading-tight tracking-wide text-white" wrap />
                  {canEdit && <RowActions onAdd={() => onAddChild(s.id)} onDelete={() => onDelete(s.id)} />}
                  {onOpen && <OpenBtn onClick={() => onOpen(s.id)} count={sub.length} color={color} />}
                  {sub.length > 0 && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onToggleCollapse(s.id, !s.is_collapsed); }} title={s.is_collapsed ? 'Show the points' : 'Fold the points'}
                      className="absolute -bottom-2 left-3 flex h-4 w-4 items-center justify-center rounded-full border bg-[#0d1326] text-slate-300" style={{ borderColor: color }}>
                      {s.is_collapsed ? <Plus size={9} /> : <Minus size={9} />}
                    </button>
                  )}
                </div>
                {!s.is_collapsed && sub.length > 0 && (
                  <Points list={sub} kids={kids} color={color} depth={1} canEdit={canEdit} selectedId={selectedId}
                    onSelect={onSelect} onRename={onRename} onAddChild={onAddChild} onDelete={onDelete} onToggleCollapse={onToggleCollapse} onOpen={onOpen} />
                )}
              </div>
            );
          })}
          {canEdit && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onAddChild(root.id); }}
              className="mt-1 flex h-11 shrink-0 items-center gap-1.5 rounded-xl border-2 border-dashed border-slate-600 px-4 text-xs font-bold text-slate-400 hover:border-indigo-400 hover:text-indigo-300">
              <Plus size={14} /> {focusId ? 'Add point' : 'Add stage'}
            </button>
          )}
          {stages.length === 0 && (
            <p className="mt-3.5 text-xs text-slate-500">Nothing inside yet.{canEdit ? ` Press "${focusId ? 'Add point' : 'Add stage'}" to start.` : ''}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Points({ list, kids, color, depth, canEdit, selectedId, onSelect, onRename, onAddChild, onDelete, onToggleCollapse, onOpen }: {
  list: MindMapNode[]; kids: Map<string | null, MindMapNode[]>; color: string; depth: number; canEdit: boolean; selectedId: string | null;
  onSelect: Props['onSelect']; onRename: Props['onRename']; onAddChild: Props['onAddChild']; onDelete: Props['onDelete']; onToggleCollapse: Props['onToggleCollapse']; onOpen?: Props['onOpen'];
}) {
  return (
    <div className="relative ml-2 mt-4 space-y-2 border-l-2 pl-4" style={{ borderColor: `${color}cc`, boxShadow: `-6px 0 10px -8px ${color}` }}>
      {list.map((n, i) => {
        const sub = kids.get(n.id) ?? [];
        const small = depth >= 2;
        return (
          <div key={n.id} className="relative">
            <span className="absolute -left-4 top-1/2 h-0.5 w-3" style={{ background: `${color}cc`, top: small ? 12 : 15 }} />
            <div onClick={(e) => { e.stopPropagation(); onSelect(n.id); }}
              className={`group relative inline-flex items-center gap-2 rounded-lg border bg-[#111a30] ${small ? 'px-2 py-1' : 'px-2.5 py-1.5'} ${selectedId === n.id ? '' : 'border-slate-700/70'}`}
              style={selectedId === n.id ? { borderColor: color, boxShadow: `0 0 12px ${color}55` } : undefined}>
              <span className={`flex shrink-0 items-center justify-center rounded font-black text-[#0b1020] ${small ? 'h-3.5 min-w-[14px] text-[8px]' : 'h-4 min-w-[16px] text-[9px]'}`} style={{ background: color }}>{i + 1}</span>
              <span className={`shrink-0 rounded-full border border-slate-500 ${small ? 'h-2 w-2' : 'h-2.5 w-2.5'}`} />
              <EditableText value={n.title} editable={canEdit} onSave={(t) => onRename(n.id, t)}
                className={`${small ? 'text-[9.5px] text-slate-300' : 'text-[11px] text-slate-100'} font-bold uppercase tracking-wide`} />
              {canEdit && <RowActions onAdd={() => onAddChild(n.id)} onDelete={() => onDelete(n.id)} />}
              {onOpen && <OpenBtn onClick={() => onOpen(n.id)} count={sub.length} color={color} />}
              {sub.length > 0 && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onToggleCollapse(n.id, !n.is_collapsed); }} title={n.is_collapsed ? 'Show' : 'Fold'}
                  className="absolute -bottom-2 left-2 flex h-3.5 w-3.5 items-center justify-center rounded-full border bg-[#111a30] text-slate-300" style={{ borderColor: color }}>
                  {n.is_collapsed ? <Plus size={8} /> : <Minus size={8} />}
                </button>
              )}
            </div>
            {!n.is_collapsed && sub.length > 0 && (
              <Points list={sub} kids={kids} color={color} depth={depth + 1} canEdit={canEdit} selectedId={selectedId}
                onSelect={onSelect} onRename={onRename} onAddChild={onAddChild} onDelete={onDelete} onToggleCollapse={onToggleCollapse} onOpen={onOpen} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Double-click (or the pencil) to rename; Enter saves, Esc cancels. */
function EditableText({ value, editable, onSave, className, wrap = false }: { value: string; editable: boolean; onSave: (v: string) => void; className: string; wrap?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onClick={(e) => e.stopPropagation()}
        onBlur={() => { setEditing(false); if (draft.trim() && draft.trim() !== value) onSave(draft.trim()); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } e.stopPropagation(); }}
        className={`${className} min-w-0 flex-1 rounded bg-black/30 px-1 outline-none ring-1 ring-indigo-400`} />
    );
  }
  return (
    <span className={`${className} min-w-0 ${wrap ? 'whitespace-normal break-words' : 'whitespace-nowrap'}`} title={editable ? `${value} (double-click to rename)` : value}
      onDoubleClick={(e) => { if (!editable) return; e.stopPropagation(); setDraft(value); setEditing(true); }}>
      {value || 'Untitled'}
      {editable && <Pencil size={9} className="ml-1 inline opacity-0 group-hover:opacity-60" onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }} />}
    </span>
  );
}

function RowActions({ onAdd, onDelete }: { onAdd: () => void; onDelete: () => void }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      <IconBtn title="Add a point under this" onClick={onAdd}><Plus size={11} /></IconBtn>
      <IconBtn title="Delete (with its points)" onClick={onDelete} danger><Trash2 size={10} /></IconBtn>
    </span>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button type="button" title={title} onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-white/10 ${danger ? 'hover:text-red-400' : 'hover:text-white'}`}>{children}</button>
  );
}

function HoverAdd({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button type="button" title={title} onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="absolute -bottom-3 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-indigo-400/60 bg-[#0d1326] text-indigo-300 hover:bg-indigo-500 hover:text-white">
      <Plus size={13} />
    </button>
  );
}

/** Opens the item as its own page (like opening a folder); shows how many points are inside. */
function OpenBtn({ onClick, count, color }: { onClick: () => void; count: number; color: string }) {
  return (
    <button type="button" title={count ? `Open this on its own page (${count} inside)` : 'Open this on its own page'} onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="ml-auto flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-slate-400 opacity-60 hover:bg-white/10 hover:text-white hover:opacity-100">
      <Maximize2 size={11} style={{ color: count ? color : undefined }} />
      {count > 0 && <span className="text-[9px] font-bold">{count}</span>}
    </button>
  );
}
