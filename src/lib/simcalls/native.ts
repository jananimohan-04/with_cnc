// SIM Calls on the Android app: the native SimCalls plugin (android/app/src/main/java/com/arguscnc/erp/simcalls).
// It lists the phone's SIMs, remembers the company SIM the person chose, places calls through it and copies that
// SIM's calls to BI (on app open, after each call, and every 15 minutes in the background).
// Outside the Android app (web, desktop) none of this exists: there the module only shows the saved calls.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { API_BASE } from '@/retail/api';

/** Where the phone uploads call recordings (the BI server). */
export const SIM_API = (API_BASE || 'https://with-cnc.vercel.app').replace(/\/+$/, '');

export interface PhoneSim { subscriptionId: number; slot: number; carrier: string; label: string; number: string; country?: string }
export interface SimStatus {
  supported: boolean; granted: boolean; deviceId: string; deviceModel: string; connected: boolean;
  sim?: PhoneSim & { lineId: string }; lastSync: number; lastError: string;
  recordingsAllowed: boolean; recordingsWaiting: number; lastRecordingAt: number; lastRecordingError: string;
}

interface SimCallsPlugin {
  status(): Promise<SimStatus>;
  requestAccess(): Promise<{ granted: boolean }>;
  listSims(): Promise<{ sims: PhoneSim[] }>;
  connect(o: PhoneSim & { lineId: string; token: string; url: string; anon: string; api: string }): Promise<void>;
  requestRecordings(): Promise<{ granted: boolean }>;
  configure(o: { api: string }): Promise<void>;
  disconnect(): Promise<void>;
  syncNow(): Promise<{ sent: number; error?: string }>;
  dial(o: { number: string }): Promise<void>;
}

const SimCalls = registerPlugin<SimCallsPlugin>('SimCalls');

export const simCallsAvailable = (): boolean => {
  try { return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('SimCalls'); } catch { return false; }
};

export const simNative = {
  status: () => SimCalls.status(),
  requestAccess: () => SimCalls.requestAccess(),
  listSims: async () => (await SimCalls.listSims()).sims,
  syncNow: () => SimCalls.syncNow(),
  dial: (number: string) => SimCalls.dial({ number }),
  requestRecordings: () => SimCalls.requestRecordings(),
  configure: () => SimCalls.configure({ api: SIM_API }),

  /** Register the chosen SIM in BI (gets the phone's key) and start sending its calls. */
  async connect(sim: PhoneSim, number: string): Promise<void> {
    const st = await SimCalls.status();
    const { data, error } = await supabase.rpc('sim_register', {
      p_device_id: st.deviceId, p_device_model: st.deviceModel, p_slot: sim.slot,
      p_carrier: sim.carrier, p_label: sim.label, p_number: number,
    });
    if (error) throw new Error(error.message);
    const r = data as { line_id: string; token: string };
    await SimCalls.connect({
      ...sim, number, lineId: r.line_id, token: r.token,
      url: import.meta.env.VITE_SUPABASE_URL, anon: import.meta.env.VITE_SUPABASE_ANON_KEY, api: SIM_API,
    });
  },

  /** Stop sending from this phone (BI keeps the calls already saved). */
  async disconnect(): Promise<void> {
    const st = await SimCalls.status();
    if (st.sim?.lineId) await supabase.rpc('sim_disconnect', { p_line_id: st.sim.lineId });
    await SimCalls.disconnect();
  },
};

/** "SIM 2 · Jio · +9198…" */
export const simTitle = (s: Pick<PhoneSim, 'slot' | 'carrier' | 'label' | 'number'>) =>
  [`SIM ${s.slot || '?'}`, s.carrier || s.label, s.number].filter(Boolean).join(' · ');

export const missingSimTable = (msg: string) => /sim_(lines|calls|register|ingest)/.test(msg) && /(does not exist|schema cache|could not find)/i.test(msg);
