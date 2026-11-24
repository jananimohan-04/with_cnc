import React, { useState, useRef, useLayoutEffect, useCallback, useEffect, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  TrendingUp,
  Cog,
  Boxes,
  Landmark,
  Camera,
  Store,
  BarChart3,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronsUpDown,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Layers,
  Box,
  LayoutGrid,
  Loader2,
  Plus,
} from 'lucide-react';

// @ts-ignore - JSX 3D scene chunk
const MindMap3DScene = lazy(() => import('./MindMap3DScene'));

export interface MindLeaf {
  id: string;
  label: string;
  route: string;
}

export interface MindBranch {
  id: string;
  title: string;
  subtitle: string;
  side: 'left' | 'right';
  color: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  dotClass: string;
  icon: React.ComponentType<{ className?: string }>;
  children: MindLeaf[];
}

const BRANCHES: MindBranch[] = [
  // LEFT WING (Core Operations)
  {
    id: 'sales',
    title: 'Sales & Quotations',
    subtitle: 'Dashboard, quotes & orders',
    side: 'left',
    color: '#10b981',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200 hover:border-emerald-400',
    textClass: 'text-emerald-700',
    dotClass: 'bg-emerald-500',
    icon: TrendingUp,
    children: [
      { id: 'sales-pipeline', label: 'Dashboard (Sales Pipeline)', route: '/sales/in-house' },
      { id: 'quotations', label: 'Quotations & Metal Calc', route: '/sales/quotations' },
      { id: 'sales-orders', label: 'Sales Orders', route: '/sales/orders' },
      { id: 'site-visits', label: 'Site Visit & Partner Sales', route: '/sales/site-visits' },
      { id: 'company-lib', label: 'All Company Library', route: '/sales/leads' },
    ],
  },
  {
    id: 'production',
    title: 'Production & Logistics',
    subtitle: 'Shop floor to delivery',
    side: 'left',
    color: '#f97316',
    bgClass: 'bg-orange-50',
    borderClass: 'border-orange-200 hover:border-orange-400',
    textClass: 'text-orange-700',
    dotClass: 'bg-orange-500',
    icon: Cog,
    children: [
      { id: 'prod-plan', label: 'Production Planning', route: '/production/planning' },
      { id: 'scheduling', label: 'Scheduling & Machine Log', route: '/production/scheduling' },
      { id: 'process-master', label: 'Process Master', route: '/production/process-master' },
      { id: 'finished-goods', label: 'Finished Goods', route: '/production/finished-goods' },
      { id: 'delivery-challan', label: 'Delivery Challan', route: '/operations/delivery' },
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory & Purchasing',
    subtitle: 'Stock, suppliers & quality',
    side: 'left',
    color: '#f59e0b',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200 hover:border-amber-400',
    textClass: 'text-amber-700',
    dotClass: 'bg-amber-500',
    icon: Boxes,
    children: [
      { id: 'stock', label: 'Inventory & Adjustments', route: '/inventory/stock' },
      { id: 'purchasing', label: 'Suppliers & Purchase Orders', route: '/purchasing/orders' },
      { id: 'grn', label: 'Goods Receipt (GRN)', route: '/purchasing/goods-receipt' },
      { id: 'cnc-vault', label: 'Products & Drawings', route: '/engineering/cnc-vault' },
      { id: 'quality-maint', label: 'Quality & Maintenance', route: '/quality/inspection-plans' },
    ],
  },
  {
    id: 'finance',
    title: 'Finance & Accounts',
    subtitle: 'Billing, books & costing',
    side: 'left',
    color: '#8b5cf6',
    bgClass: 'bg-violet-50',
    borderClass: 'border-violet-200 hover:border-violet-400',
    textClass: 'text-violet-700',
    dotClass: 'bg-violet-500',
    icon: Landmark,
    children: [
      { id: 'invoices', label: 'Commercial Invoices', route: '/finance/invoices' },
      { id: 'bank-cash', label: 'Bank Entry & Petty Cash', route: '/finance/bank-entry' },
      { id: 'ledger', label: 'Ledger & Trial Balance', route: '/accounts/ledger' },
      { id: 'pnl-bs', label: 'Profit & Loss / Balance Sheet', route: '/accounts/profit-loss' },
      { id: 'costing', label: 'Product & Material Costing', route: '/costing/job-costing' },
    ],
  },

  // RIGHT WING (Suites, Reports & Admin)
  {
    id: 'attendance',
    title: 'AI Face Attendance',
    subtitle: 'Biometric workforce suite',
    side: 'right',
    color: '#3b82f6',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-200 hover:border-blue-400',
    textClass: 'text-blue-700',
    dotClass: 'bg-blue-600',
    icon: Camera,
    children: [
      { id: 'att-dash', label: 'Attendance Dashboard', route: '/attendance/dashboard' },
      { id: 'att-kiosk', label: 'Live Kiosk Capture', route: '/attendance/kiosk' },
      { id: 'att-enroll', label: 'Face Enrollment', route: '/attendance/enroll' },
      { id: 'att-leaves', label: 'Manual Entry & Leaves', route: '/attendance/leaves' },
      { id: 'att-payslip', label: 'Payments, Payslip & Geofence', route: '/attendance/payslip' },
    ],
  },
  {
    id: 'retail',
    title: 'Retail Online Store',
    subtitle: 'Digital storefront & orders',
    side: 'right',
    color: '#f43f5e',
    bgClass: 'bg-rose-50',
    borderClass: 'border-rose-200 hover:border-rose-400',
    textClass: 'text-rose-700',
    dotClass: 'bg-rose-500',
    icon: Store,
    children: [
      { id: 'store-home', label: '3D Retail Storefront', route: '/store/home' },
      { id: 'digital-store', label: 'Digital Store Catalog', route: '/inventory/digital-store' },
      { id: 'retail-orders', label: 'Retail Orders', route: '/inventory/retail-orders' },
    ],
  },
  {
    id: 'insights',
    title: 'Reports & Communication',
    subtitle: 'Analytics, chat & mail',
    side: 'right',
    color: '#06b6d4',
    bgClass: 'bg-cyan-50',
    borderClass: 'border-cyan-200 hover:border-cyan-400',
    textClass: 'text-cyan-700',
    dotClass: 'bg-cyan-500',
    icon: BarChart3,
    children: [
      { id: 'exec-dash', label: 'Report (Executive Overview)', route: '/dashboard' },
      { id: 'reports', label: 'Production Reports', route: '/reports/production' },
      { id: 'bi-chat', label: 'BI Chat', route: '/bi-chat' },
      { id: 'mail-hub', label: 'Mail Integration', route: '/admin/email-integration' },
    ],
  },
  {
    id: 'admin',
    title: 'Admin & Support',
    subtitle: 'Users, access & helpdesk',
    side: 'right',
    color: '#6366f1',
    bgClass: 'bg-indigo-50',
    borderClass: 'border-indigo-200 hover:border-indigo-400',
    textClass: 'text-indigo-700',
    dotClass: 'bg-indigo-500',
    icon: ShieldCheck,
    children: [
      { id: 'users-access', label: 'Users & Access Control', route: '/admin/access' },
      { id: 'companies', label: 'Company & Settings', route: '/admin/settings' },
      { id: 'jd-audit', label: 'JD Build & Audit Logs', route: '/admin/audit-logs' },
      { id: 'support', label: 'Technical & On-site Support', route: '/support/technical' },
    ],
  },
];

// Graceful ErrorBoundary in case WebGL context is unavailable
class Scene3DBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

interface CurvePath {
  key: string;
  d: string;
  color: string;
  thick?: boolean;
}

// Match the clean non-overlapping amphitheater coordinates in MindMap3DScene
function getAmphitheaterPos(branch: MindBranch): [number, number, number] {
  const sideList = BRANCHES.filter((b) => b.side === branch.side);
  const idx = sideList.findIndex((b) => b.id === branch.id);
  const yPositions = [6.3, 2.1, -2.1, -6.3];
  const y = yPositions[idx] ?? 0;
  const x = branch.side === 'left' ? -5.8 : 5.8;
  const z = Math.abs(y) > 4 ? 0.5 : -0.4;
  return [x, y, z];
}

const DEFAULT_CAM = {
  pos: [0, 0.4, 21.5] as [number, number, number],
  target: [0, 0, 0] as [number, number, number],
};

export function MindMapPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const m = document.querySelector("main");
    if (m) m.scrollTop = 0;
  }, []);
  const { retailEnabled, attendanceEnabled, canView } = useAuth();
  const visibleBranches = React.useMemo(
    () =>
      BRANCHES.filter((b) => (retailEnabled || b.id !== 'retail') && (attendanceEnabled || b.id !== 'attendance'))
        .map((b) => ({
          ...b,
          children: b.children.filter((c) => canView('bi-chat') || c.id !== 'bi-chat'),
        })),
    [retailEnabled, attendanceEnabled, canView],
  );

  // Default: 3D curved amphitheater with ALL branches cleanly visible & zero overlap!
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState(DEFAULT_CAM);
  const [cameraTrigger, setCameraTrigger] = useState(0);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    BRANCHES.forEach((b) => { init[b.id] = true; });
    return init;
  });

  // 2D mode zoom + SVG curves
  const [zoom, setZoom] = useState(0.95);
  const [paths, setPaths] = useState<CurvePath[]>([]);
  const [svgSize, setSvgSize] = useState({ width: 1200, height: 800 });
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);
  const branchRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const leafRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const allExpanded = BRANCHES.every((b) => expanded[b.id]);

  // Smoothly zoom camera right into the selected module (dims all others for crystal clarity!)
  const handleFocusBranch3D = useCallback((branchId: string, customPos?: [number, number, number]) => {
    const branch = BRANCHES.find((b) => b.id === branchId);
    if (!branch) return;

    if (focusedId === branchId) {
      // Clicking the focused module again smoothly returns to full map overview
      setFocusedId(null);
      setCameraTarget(DEFAULT_CAM);
      setCameraTrigger((t) => t + 1);
      return;
    }

    const [bx, by] = customPos || getAmphitheaterPos(branch);
    const isLeft = branch.side === 'left';

    // Aim cleanly between the branch sphere and its outer leaf labels
    const targetX = isLeft ? -8.4 : 8.4;
    const camX = isLeft ? -7.2 : 7.2;

    setFocusedId(branchId);
    setExpanded((prev) => ({ ...prev, [branchId]: true }));
    setCameraTarget({
      pos: [camX, by, 11.2],
      target: [targetX, by, 0.4],
    });
    setCameraTrigger((t) => t + 1);
  }, [focusedId]);

  const handleReset3D = useCallback(() => {
    setFocusedId(null);
    setCameraTarget(DEFAULT_CAM);
    setCameraTrigger((t) => t + 1);
  }, []);

  const handleToggleAll = () => {
    const nextState = !allExpanded;
    const next: Record<string, boolean> = {};
    BRANCHES.forEach((b) => { next[b.id] = nextState; });
    setExpanded(next);
    if (viewMode === '3d') {
      setFocusedId(null);
      setCameraTarget(nextState ? DEFAULT_CAM : { pos: [0, 0.4, 17.0], target: [0, 0, 0] });
      setCameraTrigger((t) => t + 1);
    }
  };

  // Compute 2D Bezier curves when in 2D mode
  const computeCurves = useCallback(() => {
    if (viewMode !== '2d') return;
    const canvas = canvasRef.current;
    const center = centerRef.current;
    if (!canvas || !center) return;

    const cRect = canvas.getBoundingClientRect();
    const scale = zoom || 1;
    setSvgSize({ width: canvas.scrollWidth, height: canvas.scrollHeight });

    const relRect = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return {
        left: (r.left - cRect.left) / scale,
        right: (r.right - cRect.left) / scale,
        midY: (r.top + r.height / 2 - cRect.top) / scale,
      };
    };

    const hub = relRect(center);
    const nextPaths: CurvePath[] = [];

    BRANCHES.forEach((branch) => {
      const bEl = branchRefs.current[branch.id];
      if (!bEl) return;
      const bRect = relRect(bEl);

      if (branch.side === 'left') {
        const cx = (hub.left + bRect.right) / 2;
        nextPaths.push({
          key: `hub-${branch.id}`,
          d: `M ${hub.left} ${hub.midY} C ${cx} ${hub.midY}, ${cx} ${bRect.midY}, ${bRect.right} ${bRect.midY}`,
          color: branch.color,
          thick: true,
        });
      } else {
        const cx = (hub.right + bRect.left) / 2;
        nextPaths.push({
          key: `hub-${branch.id}`,
          d: `M ${hub.right} ${hub.midY} C ${cx} ${hub.midY}, ${cx} ${bRect.midY}, ${bRect.left} ${bRect.midY}`,
          color: branch.color,
          thick: true,
        });
      }

      if (expanded[branch.id]) {
        branch.children.forEach((leaf) => {
          const lEl = leafRefs.current[leaf.id];
          if (!lEl) return;
          const lRect = relRect(lEl);
          if (branch.side === 'left') {
            const cx = (bRect.left + lRect.right) / 2;
            nextPaths.push({
              key: `${branch.id}-${leaf.id}`,
              d: `M ${bRect.left} ${bRect.midY} C ${cx} ${bRect.midY}, ${cx} ${lRect.midY}, ${lRect.right} ${lRect.midY}`,
              color: branch.color,
            });
          } else {
            const cx = (bRect.right + lRect.left) / 2;
            nextPaths.push({
              key: `${branch.id}-${leaf.id}`,
              d: `M ${bRect.right} ${bRect.midY} C ${cx} ${bRect.midY}, ${cx} ${lRect.midY}, ${lRect.left} ${lRect.midY}`,
              color: branch.color,
            });
          }
        });
      }
    });

    setPaths(nextPaths);
  }, [expanded, zoom, viewMode]);

  useLayoutEffect(() => {
    computeCurves();
    const raf = requestAnimationFrame(computeCurves);
    return () => cancelAnimationFrame(raf);
  }, [computeCurves]);

  useEffect(() => {
    if (viewMode !== '2d') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => computeCurves());
    ro.observe(canvas);
    window.addEventListener('resize', computeCurves);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', computeCurves);
    };
  }, [computeCurves, viewMode]);

  const leftBranches = visibleBranches.filter((b) => b.side === 'left');
  const rightBranches = visibleBranches.filter((b) => b.side === 'right');

  const render2DMap = () => (
    <div
      className="flex-1 overflow-auto p-6 sm:p-10 flex items-center justify-center bg-[#f8fbff]"
      style={{
        backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      <div
        ref={canvasRef}
        className="relative inline-flex items-center justify-center gap-16 sm:gap-24 py-6 px-4 transition-transform duration-150 origin-center"
        style={{ transform: `scale(${zoom})` }}
      >
        <svg
          width={svgSize.width}
          height={svgSize.height}
          className="absolute inset-0 pointer-events-none overflow-visible"
          style={{ zIndex: 0 }}
        >
          {paths.map((p) => (
            <path
              key={p.key}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={p.thick ? 2.5 : 1.75}
              strokeOpacity={p.thick ? 0.55 : 0.4}
              strokeLinecap="round"
            />
          ))}
        </svg>

        <div className="flex flex-col gap-7 relative z-10">
          {leftBranches.map((branch) => {
            const Icon = branch.icon;
            const isOpen = !!expanded[branch.id];
            return (
              <div key={branch.id} className="flex items-center justify-end gap-10">
                {isOpen && (
                  <div className="flex flex-col items-end gap-2">
                    {branch.children.map((leaf) => (
                      <button
                        key={leaf.id}
                        ref={(el) => { leafRefs.current[leaf.id] = el; }}
                        type="button"
                        onClick={() => navigate(leaf.route)}
                        className="group flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-400 hover:shadow-sm text-xs font-semibold text-slate-700 hover:text-slate-950 transition-all cursor-pointer whitespace-nowrap"
                      >
                        <ArrowUpRight className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors" />
                        <span>{leaf.label}</span>
                        <span className={`w-2 h-2 rounded-full ${branch.dotClass} shrink-0`} />
                      </button>
                    ))}
                  </div>
                )}

                <div
                  ref={(el) => { branchRefs.current[branch.id] = el; }}
                  onClick={() => setExpanded((p) => ({ ...p, [branch.id]: !p[branch.id] }))}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border-2 shadow-xs cursor-pointer transition-all select-none min-w-[220px] ${branch.borderClass}`}
                >
                  <span className="p-1 rounded-lg bg-slate-50 text-slate-400">
                    {isOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                  </span>
                  <div className="flex-1 text-right min-w-0">
                    <div className="text-xs font-black text-slate-900 leading-tight">{branch.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{branch.subtitle}</div>
                  </div>
                  <div className={`w-9 h-9 rounded-xl ${branch.bgClass} ${branch.textClass} flex items-center justify-center shrink-0`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          ref={centerRef}
          className="relative z-10 px-7 py-6 rounded-3xl bg-slate-900 text-white shadow-xl border-4 border-white ring-2 ring-blue-500/30 text-center min-w-[200px] shrink-0 select-none"
        >
          <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-2.5 shadow-md shadow-blue-500/30">
            <Layers className="w-6 h-6" />
          </div>
          <div className="text-base font-black tracking-wide uppercase">ARGUS BI</div>
          <div className="text-[11px] text-blue-300 font-semibold mt-0.5">Complete Project Mind Map</div>
        </div>

        <div className="flex flex-col gap-7 relative z-10">
          {rightBranches.map((branch) => {
            const Icon = branch.icon;
            const isOpen = !!expanded[branch.id];
            return (
              <div key={branch.id} className="flex items-center justify-start gap-10">
                <div
                  ref={(el) => { branchRefs.current[branch.id] = el; }}
                  onClick={() => setExpanded((p) => ({ ...p, [branch.id]: !p[branch.id] }))}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border-2 shadow-xs cursor-pointer transition-all select-none min-w-[220px] ${branch.borderClass}`}
                >
                  <div className={`w-9 h-9 rounded-xl ${branch.bgClass} ${branch.textClass} flex items-center justify-center shrink-0`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-xs font-black text-slate-900 leading-tight">{branch.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{branch.subtitle}</div>
                  </div>
                  <span className="p-1 rounded-lg bg-slate-50 text-slate-400">
                    {isOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </span>
                </div>

                {isOpen && (
                  <div className="flex flex-col items-start gap-2">
                    {branch.children.map((leaf) => (
                      <button
                        key={leaf.id}
                        ref={(el) => { leafRefs.current[leaf.id] = el; }}
                        type="button"
                        onClick={() => navigate(leaf.route)}
                        className="group flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-400 hover:shadow-sm text-xs font-semibold text-slate-700 hover:text-slate-950 transition-all cursor-pointer whitespace-nowrap"
                      >
                        <span className={`w-2 h-2 rounded-full ${branch.dotClass} shrink-0`} />
                        <span>{leaf.label}</span>
                        <ArrowUpRight className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full min-h-[560px] flex-1 flex flex-col relative overflow-hidden bg-[#060b19]">
      {/* Clean Minimal Header Bar */}
      <div
        className={`px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 z-30 border-b shrink-0 ${
          viewMode === '3d'
            ? 'bg-slate-950/85 backdrop-blur-md border-white/10 text-white'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-400/30 text-sky-400 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-black tracking-tight leading-tight">
              3D Project Mind Map
            </h1>
            <p className={`text-[11px] ${viewMode === '3d' ? 'text-slate-400' : 'text-slate-500'}`}>
              {viewMode === '3d'
                ? 'Click any module to zoom in • Click any topic card to open it • Drag to tilt in 3D'
                : 'Click any branch to fold or click any topic to open it'}
            </p>
          </div>
        </div>

        {/* Simple Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => navigate('/mind-map/workspace')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/30 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Mind Map</span>
          </button>
          <button
            type="button"
            onClick={handleToggleAll}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              viewMode === '3d'
                ? 'bg-white/10 hover:bg-white/15 border-white/15 text-white'
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <ChevronsUpDown className="w-3.5 h-3.5 text-sky-400" />
            <span>{allExpanded ? 'Modules Only' : 'Show All Topics'}</span>
          </button>

          {viewMode === '3d' ? (
            <button
              type="button"
              onClick={handleReset3D}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 border border-white/15 text-white transition-colors cursor-pointer"
              title="Reset 3D Camera"
            >
              <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
              <span>Full Map</span>
            </button>
          ) : (
            <div className="inline-flex items-center bg-white border border-slate-200 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.65, +(z - 0.1).toFixed(2)))}
                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-[11px] font-mono font-bold text-slate-700">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.25, +(z + 0.1).toFixed(2)))}
                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 3D / 2D Switcher */}
          <div
            className={`inline-flex p-0.5 rounded-xl border ${
              viewMode === '3d' ? 'bg-white/10 border-white/15' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>3D</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('2d')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === '2d'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>2D</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      {viewMode === '3d' ? (
        <div className="flex-1 relative w-full h-full">
          <Scene3DBoundary fallback={render2DMap()}>
            <Suspense
              fallback={
                <div className="w-full h-full flex flex-col items-center justify-center text-sky-300 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-xs font-semibold tracking-wide">Loading 3D Mind Map…</span>
                </div>
              }
            >
              <MindMap3DScene
                branches={visibleBranches}
                expanded={expanded}
                focusedId={focusedId}
                autoRotate={false}
                cameraTarget={cameraTarget}
                cameraTrigger={cameraTrigger}
                onFocusBranch={handleFocusBranch3D}
                onResetView={handleReset3D}
                onNavigate={(route: string) => navigate(route)}
              />
            </Suspense>
          </Scene3DBoundary>

          {/* Floating Bottom Quick-Focus Module Dock */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 max-w-[96vw] overflow-x-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-white/15 shadow-2xl">
              <button
                type="button"
                onClick={() => navigate('/mind-map/workspace')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-500/30 transition-all cursor-pointer whitespace-nowrap mr-1"
                title="Create a new custom Mind Map"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Mind Map</span>
              </button>
              <button
                type="button"
                onClick={handleReset3D}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                  focusedId === null
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                All Modules
              </button>
              {BRANCHES.map((b) => {
                const active = focusedId === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleFocusBranch3D(b.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-white text-slate-950 shadow-md'
                        : 'text-slate-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: b.color, boxShadow: `0 0 8px ${b.color}` }}
                    />
                    <span>{b.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        render2DMap()
      )}
    </div>
  );
}
