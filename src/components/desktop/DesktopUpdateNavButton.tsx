// Desktop Update Navigation Button for Topbar.
//
// Provides a prominent, modern desktop update trigger in the top bar:
//   * Displays current application version (e.g. v1.0.2)
//   * Real-time status badge:
//       - Green dot when up-to-date
//       - Animated amber beacon when update is available
//       - Spinning download indicator when downloading
//       - Emerald check when update is ready to apply
//   * Single click navigates directly to the Version Updates UI page (/updates)
//   * Works seamlessly both inside the Tauri desktop shell and on the web.

import { useEffect, useState } from 'react';
import { Sparkles, ArrowUpCircle, Laptop, CheckCircle2, RefreshCw } from 'lucide-react';
import { isTauri } from '@/lib/desktop/isTauri';
import { CURRENT_APP_VERSION } from '@/config/versionHistory';
import type { UpdateEventDetail } from '@/lib/desktop/updater';

type NavUpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready';

export function DesktopUpdateNavButton({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const desktop = isTauri();
  const [version, setVersion] = useState<string>(CURRENT_APP_VERSION);
  const [status, setStatus] = useState<NavUpdateStatus>('idle');
  const [targetVersion, setTargetVersion] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (desktop) {
      import('@tauri-apps/api/app')
        .then(({ getVersion }) => getVersion())
        .then((v) => { if (alive && v) setVersion(v); })
        .catch(() => { /* keep fallback */ });
    }
    return () => { alive = false; };
  }, [desktop]);

  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<UpdateEventDetail>).detail;
      if (!detail) return;
      if (detail.kind === 'checking') {
        setStatus('checking');
      } else if (detail.kind === 'available') {
        setStatus('available');
        if (detail.summary?.version) setTargetVersion(detail.summary.version);
      } else if (detail.kind === 'downloading') {
        setStatus('downloading');
      } else if (detail.kind === 'ready') {
        setStatus('ready');
        if (detail.version) setTargetVersion(detail.version);
      } else if (detail.kind === 'none') {
        setStatus('idle');
      } else if (detail.kind === 'error') {
        setStatus('idle');
      }
    };

    window.addEventListener('cncforge:update-state', onState);
    return () => window.removeEventListener('cncforge:update-state', onState);
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNavigate('/updates');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={
        status === 'available'
          ? `Update v${targetVersion || ''} available! Click to view release details.`
          : status === 'ready'
          ? `Update v${targetVersion || ''} is ready to install! Click to restart.`
          : `CNCFORGE Desktop App & Version Updates (v${version}) — Click to view version history`
      }
      aria-label={`View App Updates (Current: v${version})`}
      className={`relative shrink-0 flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all duration-200 cursor-pointer shadow-sm ${
        status === 'available'
          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-orange-400 shadow-orange-500/20 animate-pulse ring-2 ring-orange-400/40'
          : status === 'ready'
          ? 'bg-emerald-600 text-white border-emerald-500 ring-2 ring-emerald-400/40 animate-bounce'
          : status === 'downloading'
          ? 'bg-orange-50 text-orange-700 border-orange-300'
          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Icon */}
      {status === 'checking' ? (
        <RefreshCw size={13} className="animate-spin text-orange-500 shrink-0" />
      ) : status === 'ready' ? (
        <CheckCircle2 size={13} className="text-white shrink-0" />
      ) : status === 'available' ? (
        <ArrowUpCircle size={13} className="text-white shrink-0 animate-bounce" />
      ) : (
        <Laptop size={13} className="text-orange-500 shrink-0" />
      )}

      {/* Label & Version */}
      <span className="hidden sm:inline font-bold tracking-tight">
        {status === 'available'
          ? 'Update Available'
          : status === 'ready'
          ? 'Update Ready'
          : status === 'downloading'
          ? 'Downloading…'
          : 'Desktop App'}
      </span>

      <span
        className={`text-[10px] font-extrabold tabular-nums px-1.5 py-0.2 rounded ${
          status === 'available' || status === 'ready'
            ? 'bg-black/20 text-white'
            : 'bg-slate-100 text-slate-600'
        }`}
      >
        v{status === 'available' && targetVersion ? targetVersion : version}
      </span>

      {/* Status indicator dot */}
      {status === 'idle' && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-emerald-500 ring-2 ring-white shrink-0"
          title="Up to date"
        />
      )}
    </button>
  );
}
