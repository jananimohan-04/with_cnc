// Desktop update center: the in-app notification + download/install UI.
//
// Mounted only in the Tauri shell (App.tsx). Listens for update state events
// emitted by lib/desktop/updater.ts (startup/periodic/manual checks) and shows:
//   * an "Update available" card  →  Update Now  /  Remind Me Later
//   * download progress           →  Installing… (the app restarts itself)
//   * update ready                →  Restart & Apply Now
//   * errors                      →  Retry / Dismiss (manual checks only)
//
// The updater plugin verifies the minisign signature of every downloaded
// artifact against the public key compiled into tauri.conf.json before install;
// this UI never touches that path.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearRemindLater,
  discardPendingUpdate,
  getPendingUpdate,
  getRemindUntil,
  installPendingUpdateAndRestart,
  runUpdateCheck,
  setRemindLater,
  type UpdateEventDetail,
  type UpdateSummary,
} from '@/lib/desktop/updater';

type ViewState =
  | { kind: 'hidden' }
  | { kind: 'available'; summary: UpdateSummary }
  | { kind: 'downloading'; received: number; total?: number; version?: string }
  | { kind: 'ready'; version: string }
  | { kind: 'installing' }
  | { kind: 'error'; message: string }
  | { kind: 'uptodate' };

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function UpdateCenter() {
  const [view, setView] = useState<ViewState>({ kind: 'hidden' });
  const dismissing = useRef(false);

  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<UpdateEventDetail>).detail;
      if (!detail) return;
      if (detail.kind === 'available' && detail.summary) {
        const summary = detail.summary;
        if (dismissing.current) return;
        // Automatic checks honour "Remind Me Later"; manual checks always show.
        if (summary.origin !== 'manual' && getRemindUntil() > Date.now()) return;
        setView({ kind: 'available', summary });
      } else if (detail.kind === 'downloading') {
        setView({ kind: 'downloading', received: detail.received, total: detail.total, version: detail.version });
      } else if (detail.kind === 'ready') {
        setView({ kind: 'ready', version: detail.version });
      } else if (detail.kind === 'installing') {
        setView({ kind: 'installing' });
      } else if (detail.kind === 'error') {
        if (detail.origin === 'manual') {
          setView({ kind: 'error', message: detail.message || 'Update check failed.' });
        }
      } else if (detail.kind === 'none' && detail.origin === 'manual') {
        setView({ kind: 'uptodate' });
        window.setTimeout(() => {
          setView((v) => (v.kind === 'uptodate' ? { kind: 'hidden' } : v));
        }, 4000);
      }
    };
    window.addEventListener('cncforge:update-state', onState);
    return () => window.removeEventListener('cncforge:update-state', onState);
  }, []);

  const dismiss = useCallback(() => {
    setView({ kind: 'hidden' });
    if (getPendingUpdate()) discardPendingUpdate();
  }, []);

  const remindLater = useCallback(() => {
    setRemindLater();
    setView({ kind: 'hidden' });
    if (getPendingUpdate()) discardPendingUpdate();
  }, []);

  const startInstall = useCallback(async () => {
    clearRemindLater();
    try {
      await installPendingUpdateAndRestart();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/exit|closed|destroyed|shutdown/i.test(message)) {
        setView({ kind: 'installing' });
        return;
      }
      console.error('[UpdateCenter] install failed:', err);
      setView({ kind: 'error', message });
    }
  }, []);

  const retry = useCallback(() => {
    setView({ kind: 'hidden' });
    void runUpdateCheck('manual');
  }, []);

  if (view.kind === 'hidden' || view.kind === 'uptodate') return null;

  const cardBase =
    'fixed bottom-4 right-4 z-[2147483500] w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/25 overflow-hidden animate-fade-in';
  const titleBar =
    'flex items-center gap-2 bg-navy-950 text-white px-4 py-3';
  const actions = 'flex items-center justify-end gap-2 px-4 py-3 bg-slate-50 border-t border-slate-200';
  const btnPrimary =
    'px-3.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-colors disabled:opacity-60 cursor-pointer shadow-sm';
  const btnGhost =
    'px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer';

  if (view.kind === 'available') {
    const { summary } = view;
    return (
      <div className={cardBase} role="alertdialog" aria-label="Update available">
        <div className={titleBar}>
          <span className="text-base">⬆</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">Update available</p>
            <p className="text-xs text-slate-300 leading-tight mt-0.5">
              v{summary.currentVersion} → v{summary.version}
            </p>
          </div>
        </div>
        <div className="px-4 py-3">
          {summary.notes && (
            <p className="text-xs text-slate-600 line-clamp-4 whitespace-pre-wrap max-h-28 overflow-y-auto">
              {summary.notes}
            </p>
          )}
          {!summary.notes && (
            <p className="text-xs text-slate-500">
              A new version of Business Intelligence is ready to install. Your data is preserved.
            </p>
          )}
        </div>
        <div className={actions}>
          <button type="button" className={btnGhost} onClick={remindLater}>
            Remind Me Later
          </button>
          <button type="button" className={btnPrimary} onClick={() => void startInstall()}>
            Update & Restart Now
          </button>
        </div>
      </div>
    );
  }

  if (view.kind === 'downloading') {
    const pct =
      view.total && view.total > 0 ? Math.min(100, Math.round((view.received / view.total) * 100)) : null;
    return (
      <div className={cardBase} role="status" aria-label="Downloading update">
        <div className={titleBar}>
          <span className="text-base">⬇</span>
          <p className="text-sm font-semibold flex-1">Downloading update…</p>
          <span className="text-xs text-slate-300 tabular-nums">{pct !== null ? `${pct}%` : formatBytes(view.received)}</span>
        </div>
        <div className="px-4 py-4">
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-[width] duration-200"
              style={{ width: pct !== null ? `${pct}%` : '35%' }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Cryptographically verified before installation.
          </p>
        </div>
      </div>
    );
  }

  if (view.kind === 'ready') {
    return (
      <div className={cardBase} role="alertdialog" aria-label="Update ready to install">
        <div className={`${titleBar} !bg-emerald-900`}>
          <span className="text-base text-emerald-400">✓</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">Update Downloaded</p>
            <p className="text-xs text-emerald-200 leading-tight mt-0.5">
              Ready to install v{view.version}
            </p>
          </div>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-slate-700 font-medium">
            The new version has been verified and prepared. Click below to restart and apply updates immediately.
          </p>
        </div>
        <div className={actions}>
          <button type="button" className={btnGhost} onClick={dismiss}>
            Restart Later
          </button>
          <button type="button" className={`${btnPrimary} !bg-emerald-600 hover:!bg-emerald-500`} onClick={() => void startInstall()}>
            Restart & Apply Now
          </button>
        </div>
      </div>
    );
  }

  if (view.kind === 'installing') {
    return (
      <div className={cardBase} role="status" aria-label="Installing update">
        <div className={titleBar}>
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          <p className="text-sm font-semibold flex-1">Installing update…</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-xs text-slate-600">
            Business Intelligence will restart automatically. Please do not shut down the app.
          </p>
        </div>
      </div>
    );
  }

  // error
  return (
    <div className={cardBase} role="alertdialog" aria-label="Update error">
      <div className={`${titleBar} !bg-rose-950`}>
        <span className="text-base">⚠</span>
        <p className="text-sm font-semibold flex-1">Update check failed</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs text-slate-600 break-words max-h-28 overflow-y-auto">{view.message}</p>
        <p className="text-xs text-slate-400 mt-1">
          You can keep working — updates will be checked again automatically.
        </p>
      </div>
      <div className={actions}>
        <button type="button" className={btnGhost} onClick={dismiss}>
          Dismiss
        </button>
        <button type="button" className={btnPrimary} onClick={retry}>
          Try Again
        </button>
      </div>
    </div>
  );
}
