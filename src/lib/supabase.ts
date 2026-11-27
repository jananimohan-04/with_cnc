import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

const isNative = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();

// Android app: the sign-in is also kept in the phone's own app storage, which is written to disk at once.
// The web view's localStorage is saved to disk only now and then, so when Android closed the app in the background
// (e.g. during a phone call) the saved copy could be an older, already-used sign-in, and the app reopened on the
// sign-in screen. Reads prefer the app storage and fall back to localStorage (so existing sign-ins carry over).
const nativeStorage: SupportedStorage = {
  async getItem(key) {
    try {
      const { value } = await Preferences.get({ key });
      if (value !== null) return value;
    } catch { /* fall back */ }
    try { return localStorage.getItem(key); } catch { return null; }
  },
  async setItem(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
    try { await Preferences.set({ key, value }); } catch { /* localStorage still has it */ }
  },
  async removeItem(key) {
    try { localStorage.removeItem(key); } catch { /* storage blocked */ }
    try { await Preferences.remove({ key }); } catch { /* nothing to remove */ }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, isNative ? { auth: { storage: nativeStorage } } : undefined);
