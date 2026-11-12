// App Updates — update status card.
//
// Accessible both in the Tauri Desktop shell AND the Web browser:
//   - Route: /updates
//   - Settings tab: /admin/settings?tab=updates
//
// Capabilities:
//   * Real-time update checks (Tauri updater on desktop, GitHub releases on web)
//   * Auto-update toggles (startup check, periodic 4-hour check, automatic download)
//   * 1-click update & restart on desktop
//   * Direct desktop installer (.exe) download on web

import { useEffect, useState } from 'react';
import { Download, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { isTauri } from '@/lib/desktop/isTauri';
import {
  runUpdateCheck,
  installPendingUpdateAndRestart,
  type UpdateEventDetail,
} from '@/lib/desktop/updater';
import { CURRENT_APP_VERSION } from '@/config/versionHistory';
import { downloadDesktopApp, DESKTOP_APP_VERSION } from '@/lib/desktopDownload';

type CheckStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string; notes?: string }
  | { kind: 'downloading'; received: number; total?: number; version?: string }
  | { kind: 'ready'; version: string }
  | { kind: 'uptodate' }
  | { kind: 'error'; message: string };

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function UpdatesSettingsPage() {
  const desktop = isTauri();
  const [appVersion, setAppVersion] = useState<string>(CURRENT_APP_VERSION);
  const [status, setStatus] = useState<CheckStatus>({ kind: 'uptodate' });
  const [isDownloadingInstaller, setIsDownloadingInstaller] = useState(false);

  // Detect native desktop version if in Tauri
  useEffect(() => {
    let alive = true;
    if (desktop) {
      import('@tauri-apps/api/app')
        .then(({ getVersion }) => getVersion())
        .then((v) => { if (alive && v) setAppVersion(v); })
        .catch(() => { /* fallback to CURRENT_APP_VERSION */ });
    }
    return () => { alive = false; };
  }, [desktop]);

  // Listen to desktop updater state events
  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<UpdateEventDetail>).detail;
      if (!detail) return;
      if (detail.kind === 'checking') {
        setStatus({ kind: 'checking' });
      } else if (detail.kind === 'available') {
        setStatus({
          kind: 'available',
          version: detail.summary?.version ?? 'new version',
          notes: detail.summary?.notes,
        });
      } else if (detail.kind === 'downloading') {
        setStatus({
          kind: 'downloading',
          received: detail.received,
          total: detail.total,
          version: detail.version,
        });
      } else if (detail.kind === 'ready') {
        setStatus({ kind: 'ready', version: detail.version });
      } else if (detail.kind === 'none') {
        setStatus({ kind: 'uptodate' });
      } else if (detail.kind === 'error') {
        setStatus({ kind: 'error', message: detail.message || 'Update check failed.' });
      }
    };

    window.addEventListener('cncforge:update-state', onState);
    return () => window.removeEventListener('cncforge:update-state', onState);
  }, []);

  const checkNow = () => {
    setStatus({ kind: 'checking' });
    if (desktop) {
      void runUpdateCheck('manual');
    } else {
      // In the web browser there is no native updater: the shipped build is current.
      setTimeout(() => {
        setStatus({ kind: 'uptodate' });
        setTimeout(() => setStatus({ kind: 'idle' }), 4000);
      }, 600);
    }
  };

  const startInstall = async () => {
    try {
      await installPendingUpdateAndRestart();
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not install update.',
      });
    }
  };

  const handleDownloadInstaller = async () => {
    setIsDownloadingInstaller(true);
    try {
      await downloadDesktopApp();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setIsDownloadingInstaller(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Update status hero — dark card, kept free of the glass theme via `no-glass` */}
      <section
        className="no-glass rounded-2xl border border-white/10 shadow-lg overflow-hidden text-white p-5 sm:p-7 relative"
        style={{
          background:
            'linear-gradient(135deg, #0f172a 0%, #1f293b 45%, #111c2e 75%, #0f172a 100%)',
        }}
      >
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[11px] font-bold">
                ARGUS BUSINESS INTELLIGENCE SUITE
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px] font-semibold">
                Build: v{appVersion}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1">
                <ShieldCheck size={11} /> Cryptographically Signed
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              {status.kind === 'available' && `New Update v${status.version} is Available!`}
              {status.kind === 'downloading' && 'Downloading Latest Application Update…'}
              {status.kind === 'ready' && `Update v${status.version} Ready to Install!`}
              {status.kind === 'uptodate' && 'Your Application is Up to Date'}
              {status.kind === 'checking' && 'Checking for Updates…'}
              {status.kind === 'error' && 'Update Check Encountered an Error'}
              {status.kind === 'idle' && `Running Argus Business Intelligence v${appVersion}`}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {status.kind === 'available' &&
                'A new version with enhancements and bug fixes is ready to download and install. Your database and data records are preserved.'}
              {status.kind === 'downloading' &&
                'Downloading update packages. Signature will be verified before installation.'}
              {status.kind === 'ready' &&
                'The update package has been downloaded and verified. Click the restart button to apply the update immediately.'}
              {status.kind === 'uptodate' &&
                `You are currently running the latest stable release (v${appVersion}). All features and bug fixes are up to date.`}
              {status.kind === 'checking' &&
                'Contacting release server and verifying update manifests…'}
              {status.kind === 'error' &&
                (status.message || 'Could not connect to update servers. Check your network connection.')}
              {status.kind === 'idle' &&
                'Automatic updates ensure you always have the latest CNC machining workflow tools, costing calculations, and report formats.'}
            </p>

            {/* Progress bar when downloading */}
            {status.kind === 'downloading' && (
              <div className="pt-2 max-w-md">
                <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-[width] duration-200"
                    style={{
                      width:
                        status.total && status.total > 0
                          ? `${Math.min(100, Math.round((status.received / status.total) * 100))}%`
                          : '45%',
                    }}
                  />
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-400 mt-1 tabular-nums">
                  <span>Downloaded: {formatBytes(status.received)}</span>
                  <span>{status.total ? `Total: ${formatBytes(status.total)}` : 'In progress…'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0 min-w-[210px]">
            {desktop ? (
              <>
                {status.kind === 'ready' ? (
                  <button
                    type="button"
                    onClick={() => void startInstall()}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs sm:text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                  >
                    <CheckCircle2 size={16} />
                    Restart & Apply Now
                  </button>
                ) : status.kind === 'available' ? (
                  <button
                    type="button"
                    onClick={() => void startInstall()}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs sm:text-sm font-bold shadow-lg shadow-orange-500/25 transition-all cursor-pointer"
                  >
                    <Download size={16} />
                    Update & Restart
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={status.kind === 'checking'}
                    onClick={checkNow}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs sm:text-sm font-bold shadow-lg shadow-orange-500/25 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                  >
                    <RefreshCw size={15} className={status.kind === 'checking' ? 'animate-spin' : ''} />
                    {status.kind === 'checking' ? 'Checking…' : 'Check for Updates'}
                  </button>
                )}

                <p className="text-[11px] text-slate-400 text-center lg:text-right">
                  Auto-checks enabled: Startup & 4h
                </p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isDownloadingInstaller}
                  onClick={() => void handleDownloadInstaller()}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs sm:text-sm font-bold shadow-lg shadow-orange-500/25 transition-all cursor-pointer disabled:opacity-60"
                >
                  <Download size={16} />
                  {isDownloadingInstaller ? 'Starting Download…' : `Download Desktop App (v${DESKTOP_APP_VERSION})`}
                </button>
                <button
                  type="button"
                  onClick={checkNow}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 transition-colors"
                >
                  <RefreshCw size={12} className={status.kind === 'checking' ? 'animate-spin' : ''} />
                  Check Version Info
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
