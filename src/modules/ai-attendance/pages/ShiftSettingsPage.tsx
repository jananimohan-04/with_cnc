import React, { useState, useEffect } from 'react';
import { Settings, Save, MapPin, Clock, ShieldCheck } from 'lucide-react';
import { settingsService } from '../services/settingsService';
import type { AttendanceSettings } from '../types/attendance.types';

interface Props {
  companyId: string;
}

export const ShiftSettingsPage: React.FC<Props> = ({ companyId }) => {
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const s = await settingsService.getSettings(companyId);
        setSettings(s);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [companyId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      setSaving(true);
      await settingsService.updateSettings(companyId, settings);
      alert('Shift and geofence policies updated successfully!');
    } catch (err) {
      alert('Failed to update settings: ' + String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return <div className="p-8 text-center text-xs text-slate-400 font-mono">Loading shift settings...</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-black text-white">Shift Timings & Geofence Policy</h2>
        <p className="text-xs text-slate-400">
          Configure office hours, late arrival grace windows, half-day hour limits, and GPS geofencing radius.
        </p>
      </div>

      <form onSubmit={handleSave} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 text-xs">
        {/* Shift Timings */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <Clock className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-white uppercase tracking-wider text-[11px]">Working Hours Policy</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Standard Shift Start Time</label>
              <input
                type="time"
                value={settings.work_start_time}
                onChange={(e) => setSettings({ ...settings, work_start_time: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Standard Shift End Time</label>
              <input
                type="time"
                value={settings.work_end_time}
                onChange={(e) => setSettings({ ...settings, work_end_time: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Late Grace Window (Mins)</label>
              <input
                type="number"
                value={settings.late_grace_minutes}
                onChange={(e) => setSettings({ ...settings, late_grace_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Half-Day Limit (Hours)</label>
              <input
                type="number"
                step="0.5"
                value={settings.half_day_hours}
                onChange={(e) => setSettings({ ...settings, half_day_hours: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Full Day Target (Hours)</label>
              <input
                type="number"
                step="0.5"
                value={settings.full_day_hours}
                onChange={(e) => setSettings({ ...settings, full_day_hours: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* Geofencing Settings */}
        <div className="space-y-4 pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-white uppercase tracking-wider text-[11px]">GPS Geofencing Security</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.geofence_enabled}
                onChange={(e) => setSettings({ ...settings, geofence_enabled: e.target.checked })}
                className="rounded border-slate-700 bg-slate-800 text-amber-400 focus:ring-0"
              />
              <span className="text-slate-300 font-semibold">Enforce GPS Geofence</span>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Office Latitude</label>
              <input
                type="number"
                step="0.000001"
                value={settings.geofence_latitude || 13.0827}
                onChange={(e) => setSettings({ ...settings, geofence_latitude: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Office Longitude</label>
              <input
                type="number"
                step="0.000001"
                value={settings.geofence_longitude || 80.2707}
                onChange={(e) => setSettings({ ...settings, geofence_longitude: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Allowed Radius (Meters)</label>
              <input
                type="number"
                value={settings.geofence_radius_meters}
                onChange={(e) => setSettings({ ...settings, geofence_radius_meters: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* Biometric Thresholds */}
        <div className="space-y-4 pt-4 border-t border-slate-800">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-white uppercase tracking-wider text-[11px]">AI Vector Confidence</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Similarity Match Threshold</label>
              <input
                type="number"
                step="0.01"
                min="0.5"
                max="0.99"
                value={settings.similarity_threshold}
                onChange={(e) => setSettings({ ...settings, similarity_threshold: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Default: 0.72 (Recommended for 128-d Cosine matching)</span>
            </div>
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Strict Anti-Spoofing Liveness</label>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={settings.liveness_strict}
                  onChange={(e) => setSettings({ ...settings, liveness_strict: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-800 text-amber-400"
                />
                <span className="text-slate-300">Reject static photo/screen attacks</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow transition-all cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Updating Settings...' : 'Save Configuration'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
