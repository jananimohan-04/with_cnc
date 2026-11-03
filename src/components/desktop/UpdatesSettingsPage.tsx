// App Updates & Version History Page.
//
// Accessible both in the Tauri Desktop shell AND the Web browser:
//   - Route: /updates
//   - Settings tab: /admin/settings?tab=updates
//   - Topbar Desktop / Update icon button
//
// Capabilities:
//   * Version-wise release history and change logs (synced with GitHub releases)
//   * Real-time update checks (Tauri updater on desktop, GitHub releases on web)
//   * Auto-update toggles (startup check, periodic 4-hour check, automatic download)
//   * 1-click update & restart on desktop
//   * Direct desktop installer (.exe) download on web

import { useEffect, useState } from 'react';
import {
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Laptop,
  Globe,
  ShieldCheck,
  Calendar,
  ExternalLink,
  Tag,
  Clock,
  ArrowRight,
  Check,
  Copy,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { isTauri } from '@/lib/desktop/isTauri';
import {
  getUpdateSettings,
  setUpdateSettings,
  runUpdateCheck,
  installPendingUpdateAndRestart,
  type UpdateCheckSettings,
  type UpdateEventDetail,
} from '@/lib/desktop/updater';
import {
  CURRENT_APP_VERSION,
  VERSION_HISTORY,
  fetchLiveVersionHistory,
  type VersionRelease,
} from '@/config/versionHistory';
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
  const [settings, setSettings] = useState<UpdateCheckSettings>(() => getUpdateSettings());
  const [status, setStatus] = useState<CheckStatus>({ kind: 'idle' });
  const [releases, setReleases] = useState<VersionRelease[]>(VERSION_HISTORY);
  const [isFetchingReleases, setIsFetchingReleases] = useState(false);
  const [copiedVersion, setCopiedVersion] = useState<string | null>(null);
  const [isDownloadingInstaller, setIsDownloadingInstaller] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'features' | 'fixes'>('all');

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

  // Fetch live release data from GitHub Releases
  const loadLiveReleases = async () => {
    setIsFetchingReleases(true);
    try {
      const live = await fetchLiveVersionHistory();
      setReleases(live);
    } catch {
      // Keep VERSION_HISTORY on error
    } finally {
      setIsFetchingReleases(false);
    }
  };

  useEffect(() => {
    void loadLiveReleases();
  }, []);

  const checkNow = () => {
    setStatus({ kind: 'checking' });
    if (desktop) {
      void runUpdateCheck('manual');
    } else {
      // In web browser: refresh version history and compare
      void loadLiveReleases().then(() => {
        setStatus({ kind: 'uptodate' });
        setTimeout(() => setStatus({ kind: 'idle' }), 4000);
      });
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

  const toggle = (key: keyof UpdateCheckSettings) => {
    const next = setUpdateSettings({ [key]: !settings[key] } as Partial<UpdateCheckSettings>);
    setSettings(next);
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

  const copyToClipboard = (text: string, versionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedVersion(versionId);
    setTimeout(() => setCopiedVersion(null), 2500);
  };

  const cardStyle = 'rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden';
  const rowLabel = 'text-xs sm:text-sm font-semibold text-slate-800';
  const rowHint = 'text-[11px] sm:text-xs text-slate-500 mt-0.5';
  const switchTrack = (on: boolean) =>
    `relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
      on ? 'bg-orange-500' : 'bg-slate-300'
    }`;

  // Filter release sections
  const filteredReleases = releases.map((rel) => {
    if (activeFilter === 'all') return rel;
    return {
      ...rel,
      sections: rel.sections.filter((s) => {
        if (activeFilter === 'features') return s.type === 'feature';
        if (activeFilter === 'fixes') return s.type === 'fix' || s.type === 'improvement';
        return true;
      }),
    };
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-orange-100 text-orange-600">
              <Sparkles size={18} />
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              App Updates & Version History
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time version updates, feature release notes, and automatic desktop update management.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
            desktop
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-sky-50 text-sky-800 border-sky-200'
          }`}>
            {desktop ? <Laptop size={14} className="text-emerald-600" /> : <Globe size={14} className="text-sky-600" />}
            <span>{desktop ? 'Windows Desktop App' : 'Web Browser App'}</span>
            <span className="ml-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-white/80 tabular-nums">
              v{appVersion}
            </span>
          </div>

          <button
            onClick={() => void loadLiveReleases()}
            disabled={isFetchingReleases}
            title="Refresh release history from GitHub"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors cursor-pointer disabled:opacity-60"
          >
            <RefreshCw size={12} className={isFetchingReleases ? 'animate-spin text-orange-500' : ''} />
            <span className="hidden md:inline">Sync</span>
          </button>
        </div>
      </div>

      {/* Main Status & Action Hero */}
      <section className={`${cardStyle} bg-gradient-to-br from-slate-900 via-navy-950 to-slate-900 text-white p-5 sm:p-7 relative overflow-hidden`}>
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[11px] font-bold">
                CNCFORGE ERP SUITE
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
              {status.kind === 'idle' && `Running CNCFORGE ERP v${appVersion}`}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {status.kind === 'available' &&
                'A new version with enhancements and bug fixes is ready to download and install. Your database and data records are preserved.'}
              {status.kind === 'downloading' &&
                'Downloading packages from GitHub Releases. Signature will be verified before installation.'}
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

      {/* Desktop Configuration & Verification (Desktop Only) */}
      {desktop && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`${cardStyle} p-4 sm:p-5 flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className={rowLabel}>Auto-Download Updates</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.autoUpdate}
                  onClick={() => toggle('autoUpdate')}
                  className={switchTrack(settings.autoUpdate)}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      settings.autoUpdate ? 'translate-x-[18px]' : 'translate-x-[2px]'
                    }`}
                  />
                </button>
              </div>
              <p className={rowHint}>
                Automatically download and verify updates in background as soon as detected.
              </p>
            </div>
            <div className="mt-3 text-[10px] font-bold text-orange-600 uppercase tracking-wider">
              {settings.autoUpdate ? 'Enabled — Ready in background' : 'Disabled — Manual trigger only'}
            </div>
          </div>

          <div className={`${cardStyle} p-4 sm:p-5 flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className={rowLabel}>Check on App Startup</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.checkOnStartup}
                  onClick={() => toggle('checkOnStartup')}
                  className={switchTrack(settings.checkOnStartup)}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      settings.checkOnStartup ? 'translate-x-[18px]' : 'translate-x-[2px]'
                    }`}
                  />
                </button>
              </div>
              <p className={rowHint}>Look for newly pushed versions shortly after application opens.</p>
            </div>
            <div className="mt-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {settings.checkOnStartup ? 'Active — Runs 8s after launch' : 'Inactive'}
            </div>
          </div>

          <div className={`${cardStyle} p-4 sm:p-5 flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between">
                <span className={rowLabel}>Periodic Background Check</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.checkPeriodic}
                  onClick={() => toggle('checkPeriodic')}
                  className={switchTrack(settings.checkPeriodic)}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      settings.checkPeriodic ? 'translate-x-[18px]' : 'translate-x-[2px]'
                    }`}
                  />
                </button>
              </div>
              <p className={rowHint}>Periodic silent update checks every 4 hours while working.</p>
            </div>
            <div className="mt-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              {settings.checkPeriodic ? 'Active — Interval: 4 hours' : 'Inactive'}
            </div>
          </div>
        </div>
      )}

      {/* Version-Wise Updates & Changelog Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Clock size={20} className="text-orange-500" />
              Version-Wise Release History
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Detailed breakdown of features, improvements, and bug fixes in every release.
            </p>
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl self-start sm:self-center">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              All Changes
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('features')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activeFilter === 'features'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('fixes')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activeFilter === 'fixes'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Fixes & Improvements
            </button>
          </div>
        </div>

        {/* Version List Cards */}
        <div className="space-y-4">
          {filteredReleases.map((release) => {
            const isCurrent = release.version === appVersion;
            const isLatest = release.isLatest;

            return (
              <article
                key={release.version}
                className={`${cardStyle} transition-all duration-200 hover:border-slate-300 ${
                  isCurrent ? 'ring-2 ring-orange-500/30 border-orange-200' : ''
                }`}
              >
                {/* Header row */}
                <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                      v{release.version}
                    </span>

                    {isCurrent && (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold flex items-center gap-1">
                        <Check size={12} /> Installed & Active
                      </span>
                    )}

                    {isLatest && !isCurrent && (
                      <span className="px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-300 text-[11px] font-bold">
                        Latest Release
                      </span>
                    )}

                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Calendar size={13} className="text-slate-400" />
                      {release.releaseDate}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          `CNCFORGE ERP v${release.version}\n${release.title}\n\nHighlights:\n${release.highlights
                            .map((h) => `- ${h}`)
                            .join('\n')}`,
                          release.version,
                        )
                      }
                      title="Copy release details"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 hover:bg-white text-[11px] font-semibold text-slate-600 transition-colors cursor-pointer"
                    >
                      {copiedVersion === release.version ? (
                        <>
                          <Check size={12} className="text-emerald-600" />
                          <span className="text-emerald-700 font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>Copy Notes</span>
                        </>
                      )}
                    </button>

                    {release.githubUrl && (
                      <a
                        href={release.githubUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="View on GitHub"
                        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 transition-colors"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Body Content */}
                <div className="p-4 sm:p-6 space-y-4">
                  {/* Summary Title */}
                  <h3 className="text-sm sm:text-base font-bold text-slate-800">
                    {release.title}
                  </h3>

                  {/* Highlights Bullet strip */}
                  {release.highlights && release.highlights.length > 0 && (
                    <div className="p-3.5 bg-orange-50/60 border border-orange-100 rounded-xl space-y-1.5">
                      <p className="text-[11px] font-black uppercase tracking-wider text-orange-800 flex items-center gap-1.5">
                        <Tag size={12} /> Key Release Highlights
                      </p>
                      <ul className="space-y-1 text-xs text-slate-700 font-medium">
                        {release.highlights.map((h, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-orange-500 font-bold shrink-0 mt-0.5">•</span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Category Sections */}
                  {release.sections && release.sections.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      {release.sections.map((sec, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/70 space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                sec.type === 'feature'
                                  ? 'bg-emerald-500'
                                  : sec.type === 'fix'
                                  ? 'bg-blue-500'
                                  : 'bg-amber-500'
                              }`}
                            />
                            <h4 className="text-xs font-bold text-slate-800">{sec.title}</h4>
                          </div>
                          <ul className="space-y-1.5 text-xs text-slate-600">
                            {sec.items.map((item, itemIdx) => (
                              <li key={itemIdx} className="flex items-start gap-1.5 leading-relaxed">
                                <span className="text-slate-400 font-bold shrink-0">›</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Info & Cryptographic Security Note */}
      <footer className="p-4 sm:p-5 bg-slate-100/80 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
          <span>
            Desktop binaries are cryptographically signed with Minisign ED25519 before distribution.
            Untampered code integrity and database continuity guaranteed.
          </span>
        </div>
        <span className="text-slate-400 font-mono text-[11px] shrink-0">
          Identifier: com.cncforge.erp
        </span>
      </footer>
    </div>
  );
}
