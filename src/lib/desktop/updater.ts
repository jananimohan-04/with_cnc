// Update orchestration for the desktop shell.
//
// Responsibilities (UI lives in components/desktop/UpdateCenter.tsx & UpdatesSettingsPage.tsx):
//   * schedule automatic checks: shortly after startup + every 4 hours (both
//     individually configurable, persisted in localStorage)
//   * auto-update capability: when enabled, downloads update in background and prepares for 1-click relaunch
//   * respond to manual "Check for updates" action (window event `cncforge:check-updates`)
//   * keep the latest `Update` resource so the UI can download/install it
//   * safe execution: no-ops safely when running in a standard web browser

import { check, type Update } from '@tauri-apps/plugin-updater';
import { isTauri } from './isTauri';

/** Suppresses the "Update available" card until this timestamp (Remind Me Later). */
export const REMIND_UNTIL_KEY = 'cncforge.update.remindUntil';
export const CHECK_STARTUP_KEY = 'cncforge.update.checkStartup';
export const CHECK_PERIODIC_KEY = 'cncforge.update.checkPeriodic';
export const AUTO_UPDATE_KEY = 'cncforge.update.autoUpdate';

const STARTUP_DELAY_MS = 8_000;
const PERIODIC_MS = 4 * 60 * 60 * 1000; // every 4 hours
const REMIND_LATER_MS = 24 * 60 * 60 * 1000; // re-offer tomorrow

export interface UpdateCheckSettings {
  checkOnStartup: boolean;
  checkPeriodic: boolean;
  autoUpdate: boolean;
}

export type UpdateCheckOrigin = 'startup' | 'periodic' | 'manual';

/** Serializable summary of an available update (the live `Update` stays module-side). */
export interface UpdateSummary {
  currentVersion: string;
  version: string;
  date?: string;
  notes?: string;
  origin: UpdateCheckOrigin;
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v !== 'false';
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch { /* private mode / quota: defaults still apply */ }
}

export function getUpdateSettings(): UpdateCheckSettings {
  return {
    checkOnStartup: readBool(CHECK_STARTUP_KEY, true),
    checkPeriodic: readBool(CHECK_PERIODIC_KEY, true),
    autoUpdate: readBool(AUTO_UPDATE_KEY, true),
  };
}

export function setUpdateSettings(settings: Partial<UpdateCheckSettings>): UpdateCheckSettings {
  if (settings.checkOnStartup !== undefined) writeBool(CHECK_STARTUP_KEY, settings.checkOnStartup);
  if (settings.checkPeriodic !== undefined) writeBool(CHECK_PERIODIC_KEY, settings.checkPeriodic);
  if (settings.autoUpdate !== undefined) writeBool(AUTO_UPDATE_KEY, settings.autoUpdate);
  return getUpdateSettings();
}

export function getRemindUntil(): number {
  try {
    return Number(localStorage.getItem(REMIND_UNTIL_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function setRemindLater(): void {
  try {
    localStorage.setItem(REMIND_UNTIL_KEY, String(Date.now() + REMIND_LATER_MS));
  } catch { /* ignore */ }
}

export function clearRemindLater(): void {
  try {
    localStorage.removeItem(REMIND_UNTIL_KEY);
  } catch { /* ignore */ }
}

// The live Update resource (holds a Rust-side handle; closed when replaced/dismissed).
let pendingUpdate: Update | null = null;
let isCurrentlyDownloading = false;

export function getPendingUpdate(): Update | null {
  return pendingUpdate;
}

/** Releases the current update resource without installing (e.g. user dismissed). */
export function discardPendingUpdate(): void {
  const current = pendingUpdate;
  pendingUpdate = null;
  if (current) void current.close().catch(() => { /* already gone */ });
}

export type UpdateEventDetail =
  | { kind: 'checking'; origin: UpdateCheckOrigin }
  | { kind: 'available'; summary: UpdateSummary }
  | { kind: 'downloading'; received: number; total?: number; version?: string }
  | { kind: 'ready'; version: string }
  | { kind: 'installing' }
  | { kind: 'none'; origin: UpdateCheckOrigin }
  | { kind: 'error'; origin: UpdateCheckOrigin; message: string };

export function dispatchUpdateState(detail: UpdateEventDetail): void {
  window.dispatchEvent(new CustomEvent<UpdateEventDetail>('cncforge:update-state', { detail }));
}

export type CheckOutcome =
  | { status: 'available'; update: Update }
  | { status: 'up-to-date' }
  | { status: 'error'; message: string };

/** Runs one update check. Silent checks swallow errors; manual ones report them. */
export async function runUpdateCheck(
  origin: UpdateCheckOrigin,
  options: { manual?: boolean } = {},
): Promise<CheckOutcome> {
  const manual = options.manual ?? origin === 'manual';

  // Guard: if running in web browser, do not invoke Tauri updater
  if (!isTauri()) {
    if (manual) dispatchUpdateState({ kind: 'none', origin });
    return { status: 'up-to-date' };
  }

  dispatchUpdateState({ kind: 'checking', origin });

  try {
    const update = await check();
    if (update) {
      if (pendingUpdate && pendingUpdate !== update) {
        void pendingUpdate.close().catch(() => { /* ignore */ });
      }
      pendingUpdate = update;
      const summary: UpdateSummary = {
        currentVersion: update.currentVersion,
        version: update.version,
        date: update.date,
        notes: update.body,
        origin,
      };

      dispatchUpdateState({
        kind: 'available',
        summary,
      });

      // Auto-update: if enabled, download package immediately in the background
      const settings = getUpdateSettings();
      if (settings.autoUpdate && !isCurrentlyDownloading) {
        void downloadPendingUpdate();
      }

      return { status: 'available', update };
    }
    if (manual) dispatchUpdateState({ kind: 'none', origin });
    return { status: 'up-to-date' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[updater] check failed (${origin}):`, message);
    if (manual) dispatchUpdateState({ kind: 'error', origin, message });
    return { status: 'error', message };
  }
}

/**
 * Downloads the update in background without restarting immediately.
 * Dispatches progress events, then a 'ready' event.
 */
export async function downloadPendingUpdate(): Promise<boolean> {
  if (!pendingUpdate || isCurrentlyDownloading) return false;
  isCurrentlyDownloading = true;
  let received = 0;
  let total: number | undefined;

  try {
    await pendingUpdate.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength;
        dispatchUpdateState({ kind: 'downloading', received, total, version: pendingUpdate?.version });
      } else if (event.event === 'Progress') {
        received += event.data.chunkLength;
        dispatchUpdateState({ kind: 'downloading', received, total, version: pendingUpdate?.version });
      } else if (event.event === 'Finished') {
        dispatchUpdateState({ kind: 'ready', version: pendingUpdate?.version || '' });
      }
    });

    isCurrentlyDownloading = false;
    return true;
  } catch (err) {
    isCurrentlyDownloading = false;
    const msg = err instanceof Error ? err.message : String(err);
    if (!/exit|closed|destroyed|shutdown/i.test(msg)) {
      console.error('[updater] auto download failed:', err);
      dispatchUpdateState({ kind: 'error', origin: 'manual', message: msg });
    }
    return false;
  }
}

/**
 * Installs the update and relaunches the application.
 */
export async function installPendingUpdateAndRestart(): Promise<void> {
  if (!isTauri()) return;
  const update = getPendingUpdate();
  if (!update) {
    throw new Error('No pending update ready to install.');
  }

  clearRemindLater();
  dispatchUpdateState({ kind: 'installing' });

  try {
    let received = 0;
    let total: number | undefined;
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength;
        dispatchUpdateState({ kind: 'downloading', received, total, version: update.version });
      } else if (event.event === 'Progress') {
        received += event.data.chunkLength;
        dispatchUpdateState({ kind: 'downloading', received, total, version: update.version });
      } else if (event.event === 'Finished') {
        dispatchUpdateState({ kind: 'installing' });
      }
    });

    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/exit|closed|destroyed|shutdown/i.test(msg)) {
      dispatchUpdateState({ kind: 'installing' });
      return;
    }
    console.error('[updater] install failed:', err);
    dispatchUpdateState({ kind: 'error', origin: 'manual', message: msg });
    throw err;
  }
}

let started = false;

/** Called once from main.tsx in the desktop shell. */
export function startUpdateScheduler(): void {
  if (started) return;
  if (!isTauri()) return;
  started = true;

  const settings = getUpdateSettings();
  if (settings.checkOnStartup) {
    window.setTimeout(() => { void runUpdateCheck('startup'); }, STARTUP_DELAY_MS);
  }

  // Periodic background check every 4 hours
  window.setInterval(() => {
    if (!getUpdateSettings().checkPeriodic) return;
    void runUpdateCheck('periodic');
  }, PERIODIC_MS);

  // Window event listeners for manual checks & installs
  window.addEventListener('cncforge:check-updates', () => {
    void runUpdateCheck('manual');
  });

  window.addEventListener('cncforge:install-updates', () => {
    void installPendingUpdateAndRestart();
  });
}
