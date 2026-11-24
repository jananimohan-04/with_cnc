import React, { useEffect, useState } from 'react';
import {
  Settings,
  Clock,
  ShieldCheck,
  MapPin,
  Save,
  CheckCircle2,
  AlertCircle,
  LocateFixed,
  Sliders,
} from 'lucide-react';
import { attendanceApi, AttendanceSettings } from '../api';
import { useAuth } from '@/contexts/AuthContext';

export function AttendanceSettingsPage() {
  const { company } = useAuth();
  const companyId = company?.id || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [settings, setSettings] = useState<AttendanceSettings>({
    company_id: companyId,
    work_start_time: '09:00',
    work_end_time: '18:00',
    late_grace_minutes: 15,
    half_day_hours: 4.5,
    full_day_hours: 8.0,
    geofence_enabled: false,
    geofence_latitude: 13.0827,
    geofence_longitude: 80.2707,
    geofence_radius_meters: 200,
    liveness_strict: true,
    similarity_threshold: 0.80,
  });

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    attendanceApi
      .getSettings(companyId)
      .then((res) => {
        if (res.settings) setSettings(res.settings);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [companyId]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSettings((prev) => ({
          ...prev,
          geofence_latitude: Math.round(pos.coords.latitude * 100000) / 100000,
          geofence_longitude: Math.round(pos.coords.longitude * 100000) / 100000,
        }));
      },
      (err) => alert('Could not get position: ' + err.message)
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSuccessMsg(null);
      await attendanceApi.saveSettings({
        ...settings,
        company_id: companyId,
      });
      setSuccessMsg('Attendance policies and biometric thresholds saved successfully!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      alert('Save failed: ' + (err.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Attendance & Shift Settings</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure default work hours, late grace thresholds, anti-spoofing sensitivity, and workplace geofencing.
          </p>
        </div>

        {successMsg && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Work Hours & Shift Rules */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Clock className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Shift Schedule & Time Policies</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">General Shift Start</label>
              <input
                type="time"
                value={settings.work_start_time}
                onChange={(e) => setSettings({ ...settings, work_start_time: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-800"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">General Shift End</label>
              <input
                type="time"
                value={settings.work_end_time}
                onChange={(e) => setSettings({ ...settings, work_end_time: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-800"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Late Grace Window</label>
              <div className="flex items-center">
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={settings.late_grace_minutes}
                  onChange={(e) =>
                    setSettings({ ...settings, late_grace_minutes: parseInt(e.target.value, 10) || 0 })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-800"
                />
                <span className="ml-2 text-xs font-semibold text-slate-400">min</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Half Day Cutoff</label>
              <div className="flex items-center">
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="8"
                  value={settings.half_day_hours}
                  onChange={(e) =>
                    setSettings({ ...settings, half_day_hours: parseFloat(e.target.value) || 4.5 })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-800"
                />
                <span className="ml-2 text-xs font-semibold text-slate-400">hrs</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Biometrics & AI Sensitivity */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-slate-900">Biometric Vector Matching & Anti-Spoofing</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">Cosine Similarity Threshold</label>
                <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {Math.round(settings.similarity_threshold * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.65"
                max="0.95"
                step="0.01"
                value={settings.similarity_threshold}
                onChange={(e) =>
                  setSettings({ ...settings, similarity_threshold: parseFloat(e.target.value) })
                }
                className="w-full accent-blue-600 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Recommended: 78–82%. Higher values enforce stricter identity matching; lower values allow faster check-in under dim lighting.
              </p>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div>
                <div className="text-xs font-bold text-slate-800">Dynamic Liveness Challenge</div>
                <div className="text-[11px] text-slate-500">Require natural eye blink or micro-head movement at terminal.</div>
              </div>
              <input
                type="checkbox"
                checked={settings.liveness_strict}
                onChange={(e) => setSettings({ ...settings, liveness_strict: e.target.checked })}
                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Geofencing Radius */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-bold text-slate-900">Workplace Geofencing Perimeter</h3>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.geofence_enabled}
                onChange={(e) => setSettings({ ...settings, geofence_enabled: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              />
              <span className="text-xs font-bold text-slate-700">Enforce Geofence</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Center Latitude</label>
              <input
                type="number"
                step="0.000001"
                value={settings.geofence_latitude || ''}
                onChange={(e) =>
                  setSettings({ ...settings, geofence_latitude: parseFloat(e.target.value) || null })
                }
                placeholder="e.g. 13.0827"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Center Longitude</label>
              <input
                type="number"
                step="0.000001"
                value={settings.geofence_longitude || ''}
                onChange={(e) =>
                  setSettings({ ...settings, geofence_longitude: parseFloat(e.target.value) || null })
                }
                placeholder="e.g. 80.2707"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Authorized Radius</label>
              <div className="flex items-center">
                <input
                  type="number"
                  min="20"
                  max="5000"
                  value={settings.geofence_radius_meters}
                  onChange={(e) =>
                    setSettings({ ...settings, geofence_radius_meters: parseInt(e.target.value, 10) || 200 })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800"
                />
                <span className="ml-2 text-xs font-semibold text-slate-400">meters</span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-start">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
            >
              <LocateFixed className="w-3.5 h-3.5 text-blue-600" />
              Set to Current GPS Location
            </button>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-600 text-white text-xs font-bold flex items-center gap-2 shadow-sm shadow-blue-500/20"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving Policies…' : 'Save Attendance Policies'}
          </button>
        </div>
      </form>
    </div>
  );
}
