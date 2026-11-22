import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  FileImage,
  FileText,
  FileCode2,
  Grid3X3,
  LayoutTemplate,
  Loader2,
  Lock,
  Maximize2,
  Minus,
  Network,
  PanelRight,
  Plus,
  RefreshCw,
  Save,
  Share2,
  Sparkles,
  Spline,
  StickyNote,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { mindMapApi, VersionConflictError } from '@/lib/mindmap/api';
import {
  buildConnectorPath,
  exportMindMapPdf,
  exportMindMapPng,
  exportMindMapSvg,
  getVisibleNodes,
} from '@/lib/mindmap/exportUtils';
import {
  DEFAULT_CANVAS_SETTINGS,
  NODE_COLOR_PALETTE,
  type CanvasSettings,
  type MindMapEdge,
  type MindMapMember,
  type MindMapNode,
  type MindMapRecord,
  type MindMapRole,
  type NodeStyle,
  type TemplateNodeSeed,
} from '@/lib/mindmap/types';
import { NodeFloatingToolbar } from './NodeFloatingToolbar';
import { StageView } from './StageView';
import { NodeInspectorDrawer } from './NodeInspectorDrawer';
import { ShareMindMapModal } from './ShareMindMapModal';

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict';

interface DragState {
  kind: 'pan' | 'node' | 'resize';
  nodeId?: string;
  startClientX: number;
  startClientY: number;
  origPanX: number;
  origPanY: number;
  origPositions: Map<string, { x: number; y: number }>;
  origW: number;
  origH: number;
  moved: boolean;
}

const BRANCH_COLORS = NODE_COLOR_PALETTE.slice(1, 8);

function collectSubtreeIds(rootId: string, nodes: MindMapNode[]): Set<string> {
  const out = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const n of nodes) {
      if (n.parent_node_id && out.has(n.parent_node_id) && !out.has(n.id)) {
        out.add(n.id);
        added = true;
      }
    }
  }
  return out;
}

function countHiddenDescendants(nodeId: string, nodes: MindMapNode[]): number {
  const set = collectSubtreeIds(nodeId, nodes);
  return Math.max(0, set.size - 1);
}

export function MindMapEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company, profile, isSuperAdmin, isCompanyAdmin, canDo } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [map, setMap] = useState<MindMapRecord | null>(null);
  const [nodes, setNodes] = useState<MindMapNode[]>([]);
  const [edges, setEdges] = useState<MindMapEdge[]>([]);
  const [members, setMembers] = useState<MindMapMember[]>([]);
  const [myRole, setMyRole] = useState<MindMapRole>('viewer');

  // Canvas viewport state (zoom & pan)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [connectorStyle, setConnectorStyle] = useState<CanvasSettings['connectorStyle']>('curved');

  // Interaction state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // "stage": the coloured stage layout (default); "canvas": the free drag-anywhere canvas
  const [viewMode, setViewModeState] = useState<'stage' | 'canvas'>(() => {
    try { return localStorage.getItem('mm.viewMode') === 'canvas' ? 'canvas' : 'stage'; } catch { return 'stage'; }
  });
  const setViewMode = (v: 'stage' | 'canvas') => { setViewModeState(v); try { localStorage.setItem('mm.viewMode', v); } catch { /* not saved */ } };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<TemplateNodeSeed[] | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Header inline metadata editing
  const [titleDraft, setTitleDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);

  // Save status & toast
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number>(0);

  // Refs for smooth drag, wheel zoom & debounced node persistence
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const nodesRef = useRef<MindMapNode[]>(nodes);
  nodesRef.current = nodes;
  const mapRef = useRef<MindMapRecord | null>(map);
  mapRef.current = map;
  const nodeTimersRef = useRef<Map<string, number>>(new Map());
  const pendingNodePatchesRef = useRef<Map<string, Partial<MindMapNode>>>(new Map());
  const metaTimerRef = useRef<number>(0);
  const canvasTimerRef = useRef<number>(0);
  const centeredOnceRef = useRef(false);

  const isAdmin = isSuperAdmin || isCompanyAdmin;
  const canEdit =
    (myRole === 'owner' || myRole === 'editor') && canDo('mind-map', 'edit') && map?.status !== 'archived';
  const canManage = myRole === 'owner';

  const showToast = useCallback((msg: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(''), 2800);
  }, []);

  // Center/fit helper
  const fitToScreen = useCallback((list: MindMapNode[] = nodesRef.current) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    if (!vw || !vh) return;
    const visible = getVisibleNodes(list);
    if (!visible.length) {
      setZoom(1);
      setPan({ x: vw / 2, y: vh / 2 });
      return;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of visible) {
      minX = Math.min(minX, n.position_x - n.width / 2);
      maxX = Math.max(maxX, n.position_x + n.width / 2);
      minY = Math.min(minY, n.position_y - n.height / 2);
      maxY = Math.max(maxY, n.position_y + n.height / 2);
    }
    const contentW = Math.max(240, maxX - minX + 160);
    const contentH = Math.max(180, maxY - minY + 180);
    const nextZoom = Math.min(1.15, Math.max(0.32, Math.min(vw / contentW, vh / contentH)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setZoom(Number(nextZoom.toFixed(2)));
    setPan({
      x: Math.round(vw / 2 - cx * nextZoom),
      y: Math.round(vh / 2 - cy * nextZoom),
    });
  }, []);

  // Load mind map from PostgreSQL
  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    try {
      const loaded = await mindMapApi.loadMindMap(id, profile?.id ?? null, isAdmin);
      setMap(loaded.map);
      setTitleDraft(loaded.map.title);
      setDescDraft(loaded.map.description ?? '');
      setNodes(loaded.nodes);
      setEdges(loaded.edges);
      setMembers(loaded.members);
      setMyRole(loaded.myRole);
      setShowGrid(loaded.map.canvas_settings.grid !== false);
      setConnectorStyle(loaded.map.canvas_settings.connectorStyle || 'curved');
      const root = loaded.nodes.find((n) => !n.parent_node_id) ?? loaded.nodes[0];
      if (root) setSelectedId(root.id);
      setSaveState('saved');
      centeredOnceRef.current = false;
      requestAnimationFrame(() => {
        fitToScreen(loaded.nodes);
        centeredOnceRef.current = true;
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load mind map');
    } finally {
      setLoading(false);
    }
  }, [id, profile?.id, isAdmin, fitToScreen]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Flush any pending per-node debounced updates immediately
  const flushNodePatch = useCallback(async (nodeId: string) => {
    const timer = nodeTimersRef.current.get(nodeId);
    if (timer) {
      window.clearTimeout(timer);
      nodeTimersRef.current.delete(nodeId);
    }
    const patch = pendingNodePatchesRef.current.get(nodeId);
    if (!patch) return;
    pendingNodePatchesRef.current.delete(nodeId);
    setSaveState('saving');
    try {
      const updated = await mindMapApi.updateNode(nodeId, patch);
      setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setSaveState('saved');
    } catch (e) {
      console.error('Node autosave error:', e);
      setSaveState('error');
      showToast(e instanceof Error ? e.message : 'Failed to save node changes');
    }
  }, [showToast]);

  const scheduleNodeSave = useCallback(
    (nodeId: string, patch: Partial<MindMapNode>, immediate = false) => {
      if (!canEdit) return;
      const existing = pendingNodePatchesRef.current.get(nodeId) ?? {};
      pendingNodePatchesRef.current.set(nodeId, { ...existing, ...patch });
      setSaveState('unsaved');

      const oldTimer = nodeTimersRef.current.get(nodeId);
      if (oldTimer) window.clearTimeout(oldTimer);

      if (immediate) {
        void flushNodePatch(nodeId);
      } else {
        const t = window.setTimeout(() => void flushNodePatch(nodeId), 550);
        nodeTimersRef.current.set(nodeId, t);
      }
    },
    [canEdit, flushNodePatch],
  );

  // Persist map metadata (with optimistic concurrency check on version)
  const saveMetaNow = useCallback(
    async (overrides?: {
      title?: string;
      description?: string | null;
      canvas_settings?: CanvasSettings;
    }) => {
      const cur = mapRef.current;
      if (!cur || !canEdit) return;
      setSaveState('saving');
      try {
        const nextCanvas: CanvasSettings = overrides?.canvas_settings ?? {
          ...DEFAULT_CANVAS_SETTINGS,
          ...cur.canvas_settings,
          zoom,
          panX: pan.x,
          panY: pan.y,
          grid: showGrid,
          connectorStyle,
        };
        const updated = await mindMapApi.updateMindMapMeta(cur.id, {
          title: overrides?.title ?? titleDraft,
          description: overrides?.description !== undefined ? overrides.description : descDraft,
          canvas_settings: nextCanvas,
          expectedVersion: cur.version,
        });
        setMap((prev) => (prev ? { ...updated, my_role: prev.my_role } : updated));
        setSaveState('saved');
      } catch (e) {
        if (e instanceof VersionConflictError) {
          setSaveState('conflict');
          showToast(e.message);
        } else {
          setSaveState('error');
          showToast(e instanceof Error ? e.message : 'Could not save mind map');
        }
      }
    },
    [canEdit, zoom, pan.x, pan.y, showGrid, connectorStyle, titleDraft, descDraft, showToast],
  );

  // Manual Save (flushes all pending node patches + updates map metadata)
  const handleManualSave = useCallback(async () => {
    if (!canEdit) return;
    const ids = Array.from(pendingNodePatchesRef.current.keys());
    await Promise.all(ids.map((nid) => flushNodePatch(nid)));
    await saveMetaNow();
    showToast('All changes saved');
  }, [canEdit, flushNodePatch, saveMetaNow, showToast]);

  // Debounced canvas settings save when grid / connector style changes
  const saveCanvasPrefs = useCallback(
    (nextGrid: boolean, nextConn: CanvasSettings['connectorStyle']) => {
      if (!canEdit || !mapRef.current) return;
      window.clearTimeout(canvasTimerRef.current);
      canvasTimerRef.current = window.setTimeout(() => {
        const cur = mapRef.current;
        if (!cur) return;
        void saveMetaNow({
          canvas_settings: {
            ...DEFAULT_CANVAS_SETTINGS,
            ...cur.canvas_settings,
            zoom,
            panX: pan.x,
            panY: pan.y,
            grid: nextGrid,
            connectorStyle: nextConn,
          },
        });
      }, 650);
    },
    [canEdit, zoom, pan.x, pan.y, saveMetaNow],
  );

  // Cleanup pending timers on unmount
  useEffect(() => {
    return () => {
      window.clearTimeout(metaTimerRef.current);
      window.clearTimeout(canvasTimerRef.current);
      window.clearTimeout(toastTimer.current);
      nodeTimersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // ------------------------------------------------------------------ Node CRUD Operations

  const handleUpdateNodeLocal = useCallback(
    (nodeId: string, patch: Partial<MindMapNode>, immediate = false) => {
      if (!canEdit) return;
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)));
      scheduleNodeSave(nodeId, patch, immediate);
    },
    [canEdit, scheduleNodeSave],
  );

  const handleUpdateNodeStyle = useCallback(
    (nodeId: string, stylePatch: Partial<NodeStyle>) => {
      if (!canEdit) return;
      const target = nodesRef.current.find((n) => n.id === nodeId);
      if (!target) return;
      const merged: NodeStyle = { ...(target.style || {}), ...stylePatch };
      handleUpdateNodeLocal(nodeId, { style: merged }, true);
    },
    [canEdit, handleUpdateNodeLocal],
  );

  const handleAddChild = useCallback(
    async (parentId: string) => {
      if (!canEdit || !mapRef.current) return;
      const parent = nodesRef.current.find((n) => n.id === parentId);
      if (!parent) return;

      // Expand parent if collapsed
      if (parent.is_collapsed) {
        handleUpdateNodeLocal(parent.id, { is_collapsed: false }, true);
      }

      const existingChildren = nodesRef.current.filter((n) => n.parent_node_id === parent.id);
      const root = nodesRef.current.find((n) => !n.parent_node_id);
      let dir = 1;
      if (!parent.parent_node_id) {
        // Alternate right / left on root so map balances nicely
        const rightCount = existingChildren.filter((c) => c.position_x >= parent.position_x).length;
        const leftCount = existingChildren.length - rightCount;
        dir = rightCount <= leftCount ? 1 : -1;
      } else if (root) {
        dir = parent.position_x < root.position_x ? -1 : 1;
      }

      const sameSide = existingChildren.filter((c) =>
        dir === 1 ? c.position_x >= parent.position_x : c.position_x < parent.position_x,
      );
      const offsetX = dir * (Math.round(parent.width / 2) + 175);
      const lastSame = sameSide[sameSide.length - 1];
      const offsetY = lastSame
        ? lastSame.position_y + lastSame.height + 28 - parent.position_y
        : sameSide.length === 0
          ? 0
          : sameSide.length * 76;

      // Pick harmonious color: new branch gets palette color, sub-branch inherits parent border
      let style: NodeStyle;
      if (!parent.parent_node_id) {
        const sw = BRANCH_COLORS[existingChildren.length % BRANCH_COLORS.length];
        style = {
          backgroundColor: sw.bg,
          borderColor: sw.border,
          borderWidth: 2,
          shape: 'rounded',
          fontSize: 14,
          fontColor: sw.text,
          fontWeight: 'bold',
          textAlign: 'left',
          lineColor: sw.line,
        };
      } else {
        const lineCol = parent.style.lineColor || parent.style.borderColor || '#3b82f6';
        style = {
          backgroundColor: '#ffffff',
          borderColor: lineCol,
          borderWidth: 1.5,
          shape: 'pill',
          fontSize: 12.5,
          fontColor: '#1e293b',
          fontWeight: 'semibold',
          textAlign: 'left',
          lineColor: lineCol,
        };
      }

      setSaveState('saving');
      try {
        const created = await mindMapApi.createNode({
          mind_map_id: mapRef.current.id,
          parent_node_id: parent.id,
          title: 'New Idea',
          node_type: parent.parent_node_id ? 'subtopic' : 'topic',
          position_x: parent.position_x + offsetX,
          position_y: parent.position_y + offsetY,
          width: parent.parent_node_id ? 172 : 190,
          height: parent.parent_node_id ? 48 : 58,
          sort_order: existingChildren.length,
          style,
          created_by: profile?.id ?? null,
        });
        setNodes((prev) => [...prev, created]);
        setSelectedId(created.id);
        setEditingId(created.id);
        setSaveState('saved');
      } catch (e) {
        setSaveState('error');
        showToast(e instanceof Error ? e.message : 'Could not add child node');
      }
    },
    [canEdit, handleUpdateNodeLocal, profile?.id, showToast],
  );

  const handleAddSibling = useCallback(
    async (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node || !node.parent_node_id) return;
      await handleAddChild(node.parent_node_id);
    },
    [handleAddChild],
  );

  const handleAddParent = useCallback(
    async (nodeId: string) => {
      if (!canEdit || !mapRef.current) return;
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      const root = nodesRef.current.find((n) => !n.parent_node_id);
      const dir = root && node.position_x < root.position_x ? 1 : -1;
      const sw = BRANCH_COLORS[Math.floor(Math.random() * BRANCH_COLORS.length)];
      setSaveState('saving');
      try {
        const res = await mindMapApi.insertParentNode({
          mindMapId: mapRef.current.id,
          childNodeId: node.id,
          title: node.parent_node_id ? 'Parent Group' : 'New Central Topic',
          positionX: node.parent_node_id ? node.position_x + dir * 210 : node.position_x,
          positionY: node.position_y,
          width: node.parent_node_id ? 190 : 224,
          height: node.parent_node_id ? 58 : 74,
          style: node.parent_node_id
            ? {
                backgroundColor: sw.bg,
                borderColor: sw.border,
                borderWidth: 2,
                shape: 'rounded',
                fontSize: 14,
                fontColor: sw.text,
                fontWeight: 'bold',
                lineColor: sw.line,
              }
            : {
                backgroundColor: '#0f172a',
                borderColor: '#3b82f6',
                borderWidth: 2,
                shape: 'rounded',
                fontSize: 17,
                fontColor: '#ffffff',
                fontWeight: 'bold',
                lineColor: '#3b82f6',
              },
        });
        if (res.wrappedRoot) {
          // Reload full map so all reparented children & edges are 100% synced
          await loadAll();
          setSelectedId(res.newParent.id);
          setEditingId(res.newParent.id);
        } else {
          setNodes((prev) => [
            ...prev.map((n) => (n.id === res.childNode.id ? res.childNode : n)),
            res.newParent,
          ]);
          setSelectedId(res.newParent.id);
          setEditingId(res.newParent.id);
        }
        setSaveState('saved');
      } catch (e) {
        setSaveState('error');
        showToast(e instanceof Error ? e.message : 'Could not insert parent node');
      }
    },
    [canEdit, loadAll, showToast],
  );

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      if (!canEdit || !mapRef.current) return;
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      if (!node.parent_node_id) {
        showToast('Cannot delete the central root node while this mind map is active.');
        return;
      }
      setSaveState('saving');
      try {
        const deletedIds = await mindMapApi.deleteNodeSubtree(mapRef.current.id, node.id);
        const delSet = new Set(deletedIds);
        setNodes((prev) => prev.filter((n) => !delSet.has(n.id)));
        setEdges((prev) =>
          prev.filter((e) => !delSet.has(e.source_node_id) && !delSet.has(e.target_node_id)),
        );
        setSelectedId(node.parent_node_id);
        setEditingId(null);
        setSaveState('saved');
        showToast(
          deletedIds.length > 1
            ? `Deleted node and ${deletedIds.length - 1} sub-branch node(s)`
            : 'Node deleted',
        );
      } catch (e) {
        setSaveState('error');
        showToast(e instanceof Error ? e.message : 'Could not delete node');
      }
    },
    [canEdit, showToast],
  );

  const serializeSubtreeForClipboard = useCallback(
    (nodeId: string): TemplateNodeSeed[] => {
      const subIds = collectSubtreeIds(nodeId, nodesRef.current);
      const anchor = nodesRef.current.find((n) => n.id === nodeId);
      if (!anchor) return [];
      // Order breadth-first starting from anchor so parents always precede children
      const ordered: MindMapNode[] = [];
      const queue: MindMapNode[] = [anchor];
      while (queue.length) {
        const cur = queue.shift()!;
        ordered.push(cur);
        for (const c of nodesRef.current) {
          if (c.parent_node_id === cur.id && subIds.has(c.id)) queue.push(c);
        }
      }
      return ordered.map((n) => ({
        temp_id: n.id,
        parent_temp_id: n.id === anchor.id ? null : n.parent_node_id,
        title: n.title,
        description: n.description ?? undefined,
        notes: n.notes ?? undefined,
        node_type: n.parent_node_id ? n.node_type : 'topic',
        position_x: n.position_x - anchor.position_x,
        position_y: n.position_y - anchor.position_y,
        width: n.width,
        height: n.height,
        sort_order: n.sort_order,
        style: n.style,
      }));
    },
    [],
  );

  const handleCopyNode = useCallback(
    (nodeId: string) => {
      const seeds = serializeSubtreeForClipboard(nodeId);
      if (!seeds.length) return;
      setClipboard(seeds);
      showToast(
        seeds.length > 1 ? `Copied branch (${seeds.length} nodes)` : 'Copied node to clipboard',
      );
    },
    [serializeSubtreeForClipboard, showToast],
  );

  const handlePasteAsChild = useCallback(
    async (targetParentId: string, customSeeds?: TemplateNodeSeed[], offset?: { x: number; y: number }) => {
      if (!canEdit || !mapRef.current) return;
      const seeds = customSeeds ?? clipboard;
      if (!seeds || !seeds.length) return;
      const parent = nodesRef.current.find((n) => n.id === targetParentId);
      if (!parent) return;

      const ox = offset ? offset.x : parent.position_x + 230;
      const oy = offset ? offset.y : parent.position_y + 42;
      const positioned = seeds.map((s) => ({
        ...s,
        position_x: ox + s.position_x,
        position_y: oy + s.position_y,
      }));

      setSaveState('saving');
      try {
        const pasted = await mindMapApi.pasteSubtree(mapRef.current.id, parent.id, positioned);
        setNodes((prev) => [...prev, ...pasted]);
        if (pasted[0]) setSelectedId(pasted[0].id);
        setSaveState('saved');
        showToast(pasted.length > 1 ? `Pasted ${pasted.length} nodes` : 'Node pasted');
      } catch (e) {
        setSaveState('error');
        showToast(e instanceof Error ? e.message : 'Could not paste nodes');
      }
    },
    [canEdit, clipboard, showToast],
  );

  const handleDuplicateNode = useCallback(
    async (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node || !node.parent_node_id) return;
      const seeds = serializeSubtreeForClipboard(nodeId);
      if (!seeds.length) return;
      seeds[0] = { ...seeds[0], title: `${seeds[0].title} (Copy)` };
      await handlePasteAsChild(node.parent_node_id, seeds, {
        x: node.position_x + 30,
        y: node.position_y + node.height + 28,
      });
    },
    [serializeSubtreeForClipboard, handlePasteAsChild],
  );

  // Create custom cross-edge between two nodes
  const handleCompleteConnect = useCallback(
    async (targetId: string) => {
      if (!canEdit || !mapRef.current || !connectingFromId) return;
      if (connectingFromId === targetId) {
        setConnectingFromId(null);
        return;
      }
      setSaveState('saving');
      try {
        const created = await mindMapApi.createEdge({
          mind_map_id: mapRef.current.id,
          source_node_id: connectingFromId,
          target_node_id: targetId,
        });
        setEdges((prev) => [...prev, created]);
        setConnectingFromId(null);
        setSaveState('saved');
        showToast('Nodes connected! Click a node & open Details to label or remove the link.');
      } catch (e) {
        setConnectingFromId(null);
        setSaveState('error');
        showToast(e instanceof Error ? e.message : 'Could not create connection');
      }
    },
    [canEdit, connectingFromId, showToast],
  );

  const handleUpdateEdgeLabel = useCallback(
    async (edgeId: string, label: string) => {
      if (!canEdit) return;
      setEdges((prev) => prev.map((e) => (e.id === edgeId ? { ...e, label } : e)));
      try {
        await mindMapApi.updateEdge(edgeId, { label: label || null });
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Could not update connection label');
      }
    },
    [canEdit, showToast],
  );

  const handleDeleteEdge = useCallback(
    async (edgeId: string) => {
      if (!canEdit) return;
      try {
        await mindMapApi.deleteEdge(edgeId);
        setEdges((prev) => prev.filter((e) => e.id !== edgeId));
        showToast('Connection removed');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Could not remove connection');
      }
    },
    [canEdit, showToast],
  );

  // Auto-layout tidy tree
  const handleAutoLayout = useCallback(async () => {
    if (!canEdit) return;
    const all = nodesRef.current;
    const root = all.find((n) => !n.parent_node_id);
    if (!root) return;

    const childrenOf = (pid: string) =>
      all
        .filter((n) => n.parent_node_id === pid)
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));

    const subtreeHeight = (nid: string): number => {
      const node = all.find((x) => x.id === nid);
      if (!node || node.is_collapsed) return (node?.height ?? 56) + 26;
      const kids = childrenOf(nid);
      if (!kids.length) return node.height + 26;
      return kids.reduce((sum, k) => sum + subtreeHeight(k.id), 0);
    };

    const nextPos = new Map<string, { x: number; y: number }>();
    nextPos.set(root.id, { x: 0, y: 0 });

    const placeSubtree = (nid: string, dir: -1 | 1, parentX: number, topY: number, bandH: number) => {
      const node = all.find((x) => x.id === nid)!;
      const y = Math.round(topY + bandH / 2);
      const x = Math.round(parentX + dir * (Math.round(node.width / 2) + 175));
      nextPos.set(nid, { x, y });
      if (node.is_collapsed) return;
      const kids = childrenOf(nid);
      let curY = topY;
      for (const k of kids) {
        const kh = subtreeHeight(k.id);
        placeSubtree(k.id, dir, x + dir * Math.round(node.width / 2), curY, kh);
        curY += kh;
      }
    };

    const topBranches = childrenOf(root.id);
    const rightList = topBranches.filter((_, i) => i % 2 === 0);
    const leftList = topBranches.filter((_, i) => i % 2 === 1);

    const placeWing = (list: MindMapNode[], dir: -1 | 1) => {
      const totalH = list.reduce((s, b) => s + subtreeHeight(b.id), 0);
      let curY = -totalH / 2;
      for (const b of list) {
        const bh = subtreeHeight(b.id);
        placeSubtree(b.id, dir, dir * Math.round(root.width / 2), curY, bh);
        curY += bh;
      }
    };

    placeWing(rightList, 1);
    placeWing(leftList, -1);

    const updated = all.map((n) => {
      const pos = nextPos.get(n.id);
      return pos ? { ...n, position_x: pos.x, position_y: pos.y } : n;
    });
    setNodes(updated);
    fitToScreen(updated);

    setSaveState('saving');
    try {
      await Promise.all(
        Array.from(nextPos.entries()).map(([nid, pos]) =>
          mindMapApi.updateNode(nid, { position_x: pos.x, position_y: pos.y }),
        ),
      );
      setSaveState('saved');
      showToast('Auto-layout applied and saved');
    } catch (e) {
      setSaveState('error');
      showToast(e instanceof Error ? e.message : 'Failed to persist layout');
    }
  }, [canEdit, fitToScreen, showToast]);

  // ------------------------------------------------------------------ Canvas Pointer & Keyboard

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (connectingFromId) setConnectingFromId(null);
    setSelectedId(null);
    setEditingId(null);
    setExportOpen(false);
    dragRef.current = {
      kind: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
      origPositions: new Map(),
      origW: 0,
      origH: 0,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleNodePointerDown = (e: React.PointerEvent, node: MindMapNode) => {
    e.stopPropagation();
    if (editingId === node.id) return;

    if (connectingFromId) {
      void handleCompleteConnect(node.id);
      return;
    }

    setSelectedId(node.id);
    setExportOpen(false);
    if (!canEdit || e.button !== 0) return;

    // Hold Shift to move the entire sub-branch together!
    const moveIds = e.shiftKey ? collectSubtreeIds(node.id, nodesRef.current) : new Set([node.id]);
    const origPositions = new Map<string, { x: number; y: number }>();
    for (const n of nodesRef.current) {
      if (moveIds.has(n.id)) origPositions.set(n.id, { x: n.position_x, y: n.position_y });
    }

    dragRef.current = {
      kind: 'node',
      nodeId: node.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
      origPositions,
      origW: node.width,
      origH: node.height,
      moved: false,
    };
    viewportRef.current?.setPointerCapture(e.pointerId);
  };

  const handleResizePointerDown = (e: React.PointerEvent, node: MindMapNode) => {
    e.stopPropagation();
    if (!canEdit) return;
    dragRef.current = {
      kind: 'resize',
      nodeId: node.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
      origPositions: new Map(),
      origW: node.width,
      origH: node.height,
      moved: false,
    };
    viewportRef.current?.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;

    if (d.kind === 'pan') {
      setPan({ x: Math.round(d.origPanX + dx), y: Math.round(d.origPanY + dy) });
    } else if (d.kind === 'node') {
      const worldDx = dx / zoom;
      const worldDy = dy / zoom;
      setNodes((prev) =>
        prev.map((n) => {
          const orig = d.origPositions.get(n.id);
          if (!orig) return n;
          return {
            ...n,
            position_x: Math.round(orig.x + worldDx),
            position_y: Math.round(orig.y + worldDy),
          };
        }),
      );
    } else if (d.kind === 'resize' && d.nodeId) {
      const nextW = Math.min(440, Math.max(100, Math.round(d.origW + dx / zoom)));
      const nextH = Math.min(240, Math.max(40, Math.round(d.origH + dy / zoom)));
      setNodes((prev) =>
        prev.map((n) => (n.id === d.nodeId ? { ...n, width: nextW, height: nextH } : n)),
      );
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    try {
      viewportRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!d.moved) return;

    if (d.kind === 'node') {
      for (const nid of d.origPositions.keys()) {
        const latest = nodesRef.current.find((n) => n.id === nid);
        if (latest) {
          scheduleNodeSave(
            nid,
            { position_x: latest.position_x, position_y: latest.position_y },
            true,
          );
        }
      }
    } else if (d.kind === 'resize' && d.nodeId) {
      const latest = nodesRef.current.find((n) => n.id === d.nodeId);
      if (latest) {
        scheduleNodeSave(d.nodeId, { width: latest.width, height: latest.height }, true);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    const nextZoom = Math.min(2.2, Math.max(0.25, Number((zoom * factor).toFixed(3))));
    const ratio = nextZoom / zoom;
    setPan({
      x: Math.round(mx - (mx - pan.x) * ratio),
      y: Math.round(my - (my - pan.y) * ratio),
    });
    setZoom(nextZoom);
  };

  // Keyboard shortcuts: Tab (child), Enter (sibling), Delete, Ctrl+C/V/D/S, Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleManualSave();
        return;
      }
      if (inInput) return;

      if (e.key === 'Escape') {
        setConnectingFromId(null);
        setEditingId(null);
        setExportOpen(false);
        return;
      }

      if (!selectedId) return;

      if (e.key === 'Tab' && canEdit) {
        e.preventDefault();
        void handleAddChild(selectedId);
      } else if (e.key === 'Enter' && canEdit) {
        e.preventDefault();
        const cur = nodesRef.current.find((n) => n.id === selectedId);
        if (cur?.parent_node_id) void handleAddSibling(selectedId);
        else void handleAddChild(selectedId);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && canEdit) {
        e.preventDefault();
        void handleDeleteNode(selectedId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopyNode(selectedId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && canEdit) {
        e.preventDefault();
        void handlePasteAsChild(selectedId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && canEdit) {
        e.preventDefault();
        void handleDuplicateNode(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    selectedId,
    canEdit,
    handleManualSave,
    handleAddChild,
    handleAddSibling,
    handleDeleteNode,
    handleCopyNode,
    handlePasteAsChild,
    handleDuplicateNode,
  ]);

  // Derived visible nodes & maps
  const visibleNodes = useMemo(() => getVisibleNodes(nodes), [nodes]);
  const visibleById = useMemo(() => new Map(visibleNodes.map((n) => [n.id, n])), [visibleNodes]);
  const selectedNode = useMemo(
    () => (selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null),
    [nodes, selectedId],
  );

  // Export handlers
  const handleExport = async (fmt: 'png' | 'pdf' | 'svg') => {
    if (!map || exporting) return;
    setExportOpen(false);
    setExporting(true);
    const settings: CanvasSettings = {
      ...DEFAULT_CANVAS_SETTINGS,
      ...map.canvas_settings,
      grid: showGrid,
      connectorStyle,
    };
    try {
      if (fmt === 'svg') {
        exportMindMapSvg(titleDraft || map.title, nodes, edges, settings);
      } else if (fmt === 'png') {
        await exportMindMapPng(titleDraft || map.title, nodes, edges, settings);
      } else {
        await exportMindMapPdf(titleDraft || map.title, descDraft || map.description, nodes, edges, settings);
      }
      showToast(`Exported as ${fmt.toUpperCase()}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : `Export failed`);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-56px)] flex flex-col items-center justify-center bg-[#f8fbff] gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-xs font-semibold">Loading mind map workspace…</p>
      </div>
    );
  }

  if (loadError || !map) {
    return (
      <div className="h-[calc(100vh-56px)] flex flex-col items-center justify-center bg-[#f8fbff] p-6 text-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-base font-black text-slate-900">Unable to open Mind Map</h2>
        <p className="max-w-md text-xs text-slate-500">{loadError || 'Mind map not found.'}</p>
        <button
          type="button"
          onClick={() => navigate('/mind-map/workspace')}
          className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Mind Maps
        </button>
      </div>
    );
  }

  // Compute screen coordinates for floating toolbar anchored above the selected node
  const toolbarScreenPos =
    selectedNode && visibleById.has(selectedNode.id)
      ? {
          left: pan.x + selectedNode.position_x * zoom,
          top: pan.y + (selectedNode.position_y - selectedNode.height / 2) * zoom - 52,
        }
      : null;

  return (
    <div className="h-[calc(100vh-56px)] min-h-[600px] flex flex-col bg-[#f8fbff] overflow-hidden select-none">
      {/* Top Editor Header Bar (matches Argus BI clean white header system) */}
      <header className="z-30 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-4 py-2 shadow-2xs">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => navigate('/mind-map/workspace')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shrink-0 cursor-pointer"
            title="Back to My Mind Maps"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-200/70 shrink-0">
            <Network className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1 max-w-md">
            <div className="flex items-center gap-2">
              <input
                type="text"
                disabled={!canEdit}
                value={titleDraft}
                onChange={(e) => {
                  const v = e.target.value;
                  setTitleDraft(v);
                  setSaveState('unsaved');
                  window.clearTimeout(metaTimerRef.current);
                  metaTimerRef.current = window.setTimeout(() => {
                    void saveMetaNow({ title: v });
                  }, 700);
                }}
                onBlur={() => {
                  if (canEdit && titleDraft.trim() && titleDraft !== map.title) {
                    void saveMetaNow({ title: titleDraft });
                  }
                }}
                className="w-full truncate rounded-lg bg-transparent px-1.5 py-0.5 text-sm font-black text-slate-900 hover:bg-slate-100/70 focus:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:hover:bg-transparent"
                placeholder="Untitled Mind Map"
              />
              {!canEdit && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  <Lock className="h-2.5 w-2.5" />
                  View Only
                </span>
              )}
            </div>
            {editingDesc && canEdit ? (
              <input
                autoFocus
                type="text"
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={() => {
                  setEditingDesc(false);
                  void saveMetaNow({ description: descDraft });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setEditingDesc(false);
                    void saveMetaNow({ description: descDraft });
                  }
                }}
                placeholder="Add a short description for this mind map…"
                className="mt-0.5 w-full rounded bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            ) : (
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => canEdit && setEditingDesc(true)}
                className="block max-w-full truncate px-1.5 text-left text-[11px] text-slate-400 hover:text-slate-600 disabled:cursor-default"
              >
                {descDraft || (canEdit ? 'Click to add description…' : `${nodes.length} nodes`)}
              </button>
            )}
          </div>
        </div>

        {/* Right Controls: Save Status, Auto-Layout, Connector, Share, Export, Inspector */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Save Status Indicator */}
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold">
            {saveState === 'saving' && (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                <span className="text-blue-700">Saving…</span>
              </>
            )}
            {saveState === 'saved' && (
              <>
                <Check className="h-3 w-3 text-emerald-600" />
                <span className="text-emerald-700">Saved</span>
              </>
            )}
            {saveState === 'unsaved' && <span className="text-amber-600">Unsaved…</span>}
            {saveState === 'error' && <span className="text-rose-600">Save failed</span>}
            {saveState === 'conflict' && (
              <button
                type="button"
                onClick={() => void loadAll()}
                className="inline-flex items-center gap-1 text-rose-600 underline cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                Conflict · Reload
              </button>
            )}
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() => void handleManualSave()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 cursor-pointer"
              title="Save now (Ctrl+S)"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save</span>
            </button>
          )}

          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5" title="How the mind map is shown">
            {(['stage', 'canvas'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setViewMode(v)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold ${viewMode === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {v === 'stage' ? 'Stage view' : 'Canvas'}
              </button>
            ))}
          </div>

          {canEdit && viewMode === 'canvas' && (
            <button
              type="button"
              onClick={() => void handleAutoLayout()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              title="Tidy branches automatically"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              <span className="hidden md:inline">Auto-Layout</span>
            </button>
          )}

          {/* Connector Line Style */}
          <button
            type="button"
            onClick={() => {
              const order: CanvasSettings['connectorStyle'][] = ['curved', 'elbow', 'straight'];
              const next = order[(order.indexOf(connectorStyle) + 1) % order.length];
              setConnectorStyle(next);
              saveCanvasPrefs(showGrid, next);
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            title={`Connector style: ${connectorStyle} (click to switch)`}
          >
            <Spline className="h-3.5 w-3.5 text-slate-500" />
            <span className="hidden xl:inline capitalize">{connectorStyle}</span>
          </button>

          {/* Grid Toggle */}
          <button
            type="button"
            onClick={() => {
              const next = !showGrid;
              setShowGrid(next);
              saveCanvasPrefs(next, connectorStyle);
            }}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border cursor-pointer ${
              showGrid
                ? 'border-blue-200 bg-blue-50 text-blue-600'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
            title={showGrid ? 'Hide dot grid' : 'Show dot grid'}
          >
            <Grid3X3 className="h-3.5 w-3.5" />
          </button>

          {/* Share */}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Share2 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Share</span>
            {members.length > 1 && (
              <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-black text-emerald-700">
                {members.length}
              </span>
            )}
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              disabled={exporting}
              onClick={() => setExportOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {exporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
              ) : (
                <Download className="h-3.5 w-3.5 text-slate-600" />
              )}
              <span className="hidden sm:inline">Export</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-44 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl z-50">
                <button
                  type="button"
                  onClick={() => void handleExport('png')}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <FileImage className="h-3.5 w-3.5 text-blue-600" />
                  Export as PNG
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('pdf')}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <FileText className="h-3.5 w-3.5 text-rose-600" />
                  Export as PDF
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('svg')}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <FileCode2 className="h-3.5 w-3.5 text-violet-600" />
                  Export as SVG
                </button>
              </div>
            )}
          </div>

          {/* Toggle Side Inspector */}
          <button
            type="button"
            onClick={() => setInspectorOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold cursor-pointer ${
              inspectorOpen
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle Node Inspector & Notes panel"
          >
            <PanelRight className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Notes &amp; Style</span>
          </button>
        </div>
      </header>

      {/* Main Editor Body: Interactive Canvas + Optional Inspector Drawer */}
      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        {viewMode === 'stage' ? (
          <StageView
            nodes={nodes}
            title={map.title}
            canEdit={canEdit}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRename={(nid, t) => handleUpdateNodeLocal(nid, { title: t }, true)}
            onAddChild={(pid) => void handleAddChild(pid)}
            onDelete={(nid) => void handleDeleteNode(nid)}
            onToggleCollapse={(nid, c) => handleUpdateNodeLocal(nid, { is_collapsed: c }, true)}
          />
        ) : (
        <div
          ref={viewportRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onWheel={handleWheel}
          className="relative flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
          style={{
            backgroundColor: map.canvas_settings.background || '#f8fbff',
            backgroundImage: showGrid
              ? `radial-gradient(#cbd5e1 ${Math.max(1, zoom * 1.1)}px, transparent ${Math.max(1, zoom * 1.1)}px)`
              : 'none',
            backgroundSize: `${Math.max(12, 24 * zoom)}px ${Math.max(12, 24 * zoom)}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        >
          {/* Connection mode banner */}
          {connectingFromId && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-lg">
              <span>Click another node to draw a connection line</span>
              <button
                type="button"
                onClick={() => setConnectingFromId(null)}
                className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] hover:bg-white/30 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {/* World Transform Layer */}
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            {/* SVG Connectors Layer */}
            <svg
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
              width="1"
              height="1"
            >
              <defs>
                <marker
                  id="mm-live-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#6366f1" />
                </marker>
              </defs>

              {/* Hierarchical parent -> child connectors */}
              {visibleNodes.map((n) => {
                if (!n.parent_node_id) return null;
                const parent = visibleById.get(n.parent_node_id);
                if (!parent) return null;
                const d = buildConnectorPath(parent, n, connectorStyle);
                const stroke = n.style.lineColor || n.style.borderColor || '#3b82f6';
                const isRootBranch = !parent.parent_node_id;
                return (
                  <path
                    key={`p-${parent.id}-${n.id}`}
                    d={d}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={isRootBranch ? 2.8 : 2}
                    strokeOpacity={isRootBranch ? 0.75 : 0.58}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* Custom non-hierarchical edges */}
              {edges.map((e) => {
                const src = visibleById.get(e.source_node_id);
                const tgt = visibleById.get(e.target_node_id);
                if (!src || !tgt) return null;
                const midX = (src.position_x + tgt.position_x) / 2;
                const midY = (src.position_y + tgt.position_y) / 2 - 42;
                const d = `M ${src.position_x} ${src.position_y} Q ${midX} ${midY}, ${tgt.position_x} ${tgt.position_y}`;
                const stroke = e.style?.strokeColor || '#6366f1';
                return (
                  <g key={e.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={e.style?.strokeWidth || 2}
                      strokeDasharray={e.style?.dashed !== false ? '6 4' : undefined}
                      markerEnd={e.style?.arrow !== false ? 'url(#mm-live-arrow)' : undefined}
                      strokeLinecap="round"
                    />
                    {e.label && (
                      <g transform={`translate(${midX}, ${midY})`}>
                        <rect
                          x={-Math.max(36, e.label.length * 3.8 + 12)}
                          y={-11}
                          width={Math.max(72, e.label.length * 7.6 + 24)}
                          height={22}
                          rx={10}
                          fill="#ffffff"
                          stroke={stroke}
                          strokeWidth={1.2}
                        />
                        <text
                          textAnchor="middle"
                          y={3.5}
                          fontSize={10.5}
                          fontWeight={700}
                          fill="#334155"
                        >
                          {e.label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Nodes Layer */}
            {visibleNodes.map((node) => {
              const isRoot = !node.parent_node_id;
              const isSelected = selectedId === node.id;
              const isEditing = editingId === node.id;
              const style = node.style || {};
              const shape = style.shape || 'rounded';
              const bg = style.backgroundColor || (isRoot ? '#0f172a' : '#ffffff');
              const border = style.borderColor || '#3b82f6';
              const bw = style.borderWidth ?? 2;
              const fg = style.fontColor || (isRoot ? '#ffffff' : '#0f172a');
              const fs = style.fontSize || (isRoot ? 17 : 13);
              const fw =
                style.fontWeight === 'normal'
                  ? 400
                  : style.fontWeight === 'semibold'
                    ? 600
                    : 700;
              const hasChildren = nodes.some((c) => c.parent_node_id === node.id);
              const hiddenCount = node.is_collapsed ? countHiddenDescendants(node.id, nodes) : 0;

              const shapeRadius =
                shape === 'pill'
                  ? '9999px'
                  : shape === 'rectangle'
                    ? '4px'
                    : shape === 'ellipse'
                      ? '50%'
                      : shape === 'underline'
                        ? '6px'
                        : '16px';

              return (
                <div
                  key={node.id}
                  onPointerDown={(e) => handleNodePointerDown(e, node)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!canEdit) return;
                    setSelectedId(node.id);
                    setEditingId(node.id);
                  }}
                  className={`group absolute flex flex-col justify-center transition-shadow ${
                    connectingFromId && connectingFromId !== node.id
                      ? 'cursor-crosshair ring-2 ring-indigo-400/70'
                      : canEdit
                        ? 'cursor-move'
                        : 'cursor-pointer'
                  } ${isSelected ? 'z-20' : 'z-10'}`}
                  style={{
                    left: node.position_x - node.width / 2,
                    top: node.position_y - node.height / 2,
                    width: node.width,
                    minHeight: node.height,
                    backgroundColor: shape === 'diamond' ? 'transparent' : bg,
                    border:
                      shape === 'diamond'
                        ? 'none'
                        : shape === 'underline'
                          ? 'none'
                          : `${bw}px solid ${border}`,
                    borderBottom:
                      shape === 'underline' ? `${Math.max(3, bw)}px solid ${border}` : undefined,
                    borderRadius: shape === 'diamond' ? undefined : shapeRadius,
                    color: fg,
                    padding: shape === 'diamond' ? '14px 22px' : '10px 14px',
                    boxShadow: isSelected
                      ? `0 0 0 3px rgba(59,130,246,0.35), 0 12px 24px -8px rgba(15,23,42,0.22)`
                      : isRoot
                        ? '0 14px 28px -10px rgba(15,23,42,0.35)'
                        : '0 4px 12px -4px rgba(15,23,42,0.08)',
                    textAlign: style.textAlign || (isRoot ? 'center' : 'left'),
                  }}
                >
                  {/* Diamond SVG backdrop */}
                  {shape === 'diamond' && (
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      <polygon
                        points="50,2 98,50 50,98 2,50"
                        fill={bg}
                        stroke={border}
                        strokeWidth={Math.max(2, bw * 1.3)}
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}

                  {/* Node content (inline edit vs display) */}
                  <div className="relative z-10 w-full">
                    {isEditing && canEdit ? (
                      <input
                        autoFocus
                        value={node.title}
                        onPointerDown={(e) => e.stopPropagation()}
                        onChange={(e) => handleUpdateNodeLocal(node.id, { title: e.target.value })}
                        onBlur={() => {
                          setEditingId(null);
                          void flushNodePatch(node.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            e.stopPropagation();
                            setEditingId(null);
                            void flushNodePatch(node.id);
                          }
                        }}
                        className="w-full rounded bg-white/20 px-1 py-0.5 text-inherit focus:outline-none focus:ring-1 focus:ring-blue-400"
                        style={{
                          fontSize: fs,
                          fontWeight: fw,
                          fontStyle: style.fontStyle || 'normal',
                          textAlign: style.textAlign || (isRoot ? 'center' : 'left'),
                        }}
                      />
                    ) : (
                      <div
                        className="break-words leading-snug"
                        style={{
                          fontSize: fs,
                          fontWeight: fw,
                          fontStyle: style.fontStyle || 'normal',
                        }}
                      >
                        {node.title || 'Untitled'}
                      </div>
                    )}

                    {node.description && (
                      <div
                        className="mt-0.5 truncate text-[10.5px] opacity-75"
                        style={{ color: fg }}
                      >
                        {node.description}
                      </div>
                    )}
                  </div>

                  {/* Notes indicator badge */}
                  {node.notes && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(node.id);
                        setInspectorOpen(true);
                      }}
                      title="View node notes"
                      className="absolute -top-2 -right-2 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow-sm hover:scale-110 transition-transform cursor-pointer"
                    >
                      <StickyNote className="h-3 w-3" />
                    </button>
                  )}

                  {/* Quick '+' add-child handle on hover */}
                  {canEdit && !isEditing && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleAddChild(node.id);
                      }}
                      title="Add Child Node (Tab)"
                      className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-md opacity-0 group-hover:opacity-100 hover:scale-110 transition-all cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {/* Collapse / Expand sub-branch pill */}
                  {hasChildren && (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateNodeLocal(node.id, { is_collapsed: !node.is_collapsed }, true);
                      }}
                      title={node.is_collapsed ? 'Expand branch' : 'Collapse branch'}
                      className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-20 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-slate-300 bg-white px-1.5 text-[10px] font-black text-slate-700 shadow-xs hover:border-blue-400 hover:text-blue-600 cursor-pointer"
                    >
                      {node.is_collapsed ? `+${hiddenCount}` : <Minus className="h-2.5 w-2.5" />}
                    </button>
                  )}

                  {/* Resize handle on selected node */}
                  {isSelected && canEdit && (
                    <div
                      onPointerDown={(e) => handleResizePointerDown(e, node)}
                      title="Drag to resize node"
                      className="absolute -bottom-1.5 -right-1.5 z-30 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-600 shadow cursor-nwse-resize"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Floating Node Toolbar (anchored cleanly above the selected node in screen coordinates) */}
          {selectedNode && toolbarScreenPos && !editingId && canEdit && (
            <div
              className="absolute z-30 -translate-x-1/2"
              style={{
                left: Math.min(
                  Math.max(210, toolbarScreenPos.left),
                  (viewportRef.current?.clientWidth ?? 900) - 210,
                ),
                top: Math.max(12, toolbarScreenPos.top),
              }}
            >
              <NodeFloatingToolbar
                node={selectedNode}
                isRoot={!selectedNode.parent_node_id}
                canEdit={canEdit}
                hasClipboard={!!clipboard?.length}
                connectingFromId={connectingFromId}
                onAddChild={() => void handleAddChild(selectedNode.id)}
                onAddSibling={() => void handleAddSibling(selectedNode.id)}
                onAddParent={() => void handleAddParent(selectedNode.id)}
                onEditNode={() => {
                  setEditingId(selectedNode.id);
                  setInspectorOpen(true);
                }}
                onUpdateStyle={(patch) => handleUpdateNodeStyle(selectedNode.id, patch)}
                onStartConnect={() =>
                  setConnectingFromId((cur) => (cur === selectedNode.id ? null : selectedNode.id))
                }
                onDuplicate={() => void handleDuplicateNode(selectedNode.id)}
                onCopy={() => handleCopyNode(selectedNode.id)}
                onPaste={() => void handlePasteAsChild(selectedNode.id)}
                onDelete={() => void handleDeleteNode(selectedNode.id)}
              />
            </div>
          )}

          {/* Bottom-Left Shortcut Hint & Node Count */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 hidden sm:flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-1.5 text-[10.5px] font-semibold text-slate-500 shadow-sm backdrop-blur-sm">
            <span className="font-bold text-slate-800">{nodes.length} nodes</span>
            <span>•</span>
            <span>Tab: Child</span>
            <span>•</span>
            <span>Enter: Sibling</span>
            <span>•</span>
            <span>Double-click: Edit</span>
            <span>•</span>
            <span>Shift+Drag: Move branch</span>
          </div>

          {/* Bottom-Right Zoom & Fit Controls */}
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.25, Number((z - 0.12).toFixed(2))))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="min-w-[44px] rounded-lg px-1.5 py-1 text-[11px] font-mono font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              title="Reset zoom to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.12).toFixed(2))))}
              className="inline-flex h-7 w-7 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <span className="mx-0.5 h-4 w-px bg-slate-200" />
            <button
              type="button"
              onClick={() => fitToScreen()}
              className="inline-flex h-7 items-center gap-1 rounded-xl px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              title="Fit mind map to screen"
            >
              <Maximize2 className="h-3.5 w-3.5 text-blue-600" />
              <span>Fit</span>
            </button>
          </div>

          {/* Toast feedback */}
          {toast && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-40 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-xl">
              {toast}
            </div>
          )}
        </div>
        )}

        {/* Collapsible Node Inspector & Notes Drawer */}
        {inspectorOpen && selectedNode && (
          <NodeInspectorDrawer
            node={selectedNode}
            allNodes={nodes}
            edges={edges}
            canEdit={canEdit}
            onClose={() => setInspectorOpen(false)}
            onChangeNode={(patch) => handleUpdateNodeLocal(selectedNode.id, patch)}
            onChangeStyle={(patch) => handleUpdateNodeStyle(selectedNode.id, patch)}
            onUpdateEdgeLabel={(edgeId, label) => void handleUpdateEdgeLabel(edgeId, label)}
            onDeleteEdge={(edgeId) => void handleDeleteEdge(edgeId)}
          />
        )}
      </div>

      {/* Share Mind Map Modal */}
      <ShareMindMapModal
        open={shareOpen}
        mindMapId={map.id}
        mindMapTitle={titleDraft || map.title}
        companyId={map.company_id || company?.id || null}
        currentUserId={profile?.id ?? null}
        canManage={canManage}
        members={members}
        onMembersChange={setMembers}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

// Re-export icon reference guard if unused
void LayoutTemplate;
