// Phone app (Android) behaviour. Runs only inside the Android app, never on the website or the desktop app.
//  - The Android BACK button works like in other apps: it closes an open popup first, then goes back a page,
//    and on the first page it puts the app in the background instead of closing it.
//  - <html class="native-app"> turns on phone-only styles (index.css): no grey tap flashes, no pull-to-refresh
//    bounce, text that does not grow with the browser's own text scaling, room for the phone's top / bottom bars.

import { isAndroidApp } from './auth';

/** Clicks the close button of the popup in front, if one is open. Returns true when something was closed. */
function closeTopPopup(): boolean {
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((d) => d.offsetParent !== null || getComputedStyle(d).position === 'fixed');
  const top = dialogs[dialogs.length - 1];
  if (!top) return false;
  const close = top.querySelector<HTMLElement>('[aria-label*="Close" i], [title="Close"], button[aria-label="close"], [data-close]');
  if (close) { close.click(); return true; }
  // a popup without its own close button: the Escape key closes most of them
  top.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return true;
}

export async function initNativeApp(): Promise<void> {
  if (!isAndroidApp()) return;
  document.documentElement.classList.add('native-app');
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('backButton', ({ canGoBack }) => {
      if (closeTopPopup()) return;
      if (canGoBack && window.history.length > 1) window.history.back();
      else void App.minimizeApp();
    });
  } catch { /* the app plugin is not available: the default back behaviour stays */ }
}
