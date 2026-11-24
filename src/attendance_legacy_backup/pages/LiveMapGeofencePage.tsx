import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  ShieldCheck,
  ShieldAlert,
  Navigation,
  Save,
  Building2,
  RefreshCw,
  LocateFixed,
  Sliders,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { attendanceApi } from '../api';
import { useAuth } from '@/contexts/AuthContext';

export function LiveMapGeofencePage() {
  const { company } = useAuth();
  const companyId = company?.id || '';
  const companyName = (company as any)?.company_name || (company as any)?.name || 'Headquarters Campus';

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [geofence, setGeofence] = useState({
    is_enabled: true,
    latitude: 13.0827,
    longitude: 80.2707,
    radius_meters: 200,
    strict_enforcement: false,
    office_name: companyName,
  });

  const fetchGeofenceData = async () => {
    try {
      setLoading(true);
      const res = await attendanceApi.getGeofence(companyId);
      if (res.data?.geofence) {
        setGeofence({
          is_enabled: res.data.geofence.is_enabled !== false,
          latitude: res.data.geofence.latitude || 13.0827,
          longitude: res.data.geofence.longitude || 80.2707,
          radius_meters: res.data.geofence.radius_meters || 200,
          strict_enforcement: res.data.geofence.strict_enforcement || false,
          office_name: res.data.geofence.office_name || companyName,
        });
      }
    } catch (err: any) {
      console.error('Failed to load geofence', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGeofenceData();
  }, [companyId]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current).setView([geofence.latitude, geofence.longitude], 16);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Facility marker
      const marker = L.marker([geofence.latitude, geofence.longitude]).addTo(map);
      marker.bindPopup(`<b>${geofence.office_name}</b><br/>Facility Campus Geofence Center`).openPopup();
      markerRef.current = marker;

      // Geofence circle
      const circle = L.circle([geofence.latitude, geofence.longitude], {
        color: '#ea580c',
        fillColor: '#fb923c',
        fillOpacity: 0.2,
        radius: geofence.radius_meters,
      }).addTo(map);
      circleRef.current = circle;

      mapInstanceRef.current = map;
    } else {
      const map = mapInstanceRef.current;
      map.setView([geofence.latitude, geofence.longitude]);
      if (markerRef.current) {
        markerRef.current.setLatLng([geofence.latitude, geofence.longitude]);
      }
      if (circleRef.current) {
        circleRef.current.setLatLng([geofence.latitude, geofence.longitude]);
        circleRef.current.setRadius(geofence.radius_meters);
      }
    }

    return () => {
      // clean up on unmount
    };
  }, [geofence.latitude, geofence.longitude, geofence.radius_meters]);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeofence((prev) => ({
          ...prev,
          latitude: Math.round(pos.coords.latitude * 10000) / 10000,
          longitude: Math.round(pos.coords.longitude * 10000) / 10000,
        }));
      },
      (err) => {
        alert('Could not retrieve current location: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage('');
    try {
      await attendanceApi.saveGeofence({
        company_id: companyId,
        is_enabled: geofence.is_enabled,
        latitude: geofence.latitude,
        longitude: geofence.longitude,
        radius_meters: geofence.radius_meters,
        strict_enforcement: geofence.strict_enforcement,
        office_name: geofence.office_name,
      });
      setStatusMessage('Geofence boundaries and facility coordinates saved successfully.');
      setTimeout(() => setStatusMessage(''), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save geofence.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <MapPin className="w-7 h-7 text-blue-600" />
            Live Map &amp; Geofencing Boundaries
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Configure facility GPS perimeter, check-in radius, and on-site optical scanner tracking
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchGeofenceData()}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-bold shadow-2xs transition-all self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Map</span>
        </button>
      </div>

      {statusMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Geofence Controls */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-600" />
                <span>Geofence Parameters</span>
              </h2>
              <p className="text-[11px] text-slate-500">Facility coordinates &amp; radius</p>
            </div>

            <button
              type="button"
              onClick={handleGetCurrentLocation}
              title="Detect current device GPS"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors cursor-pointer"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              <span>Use My GPS</span>
            </button>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Campus / Facility Name
              </label>
              <input
                type="text"
                value={geofence.office_name}
                onChange={(e) => setGeofence((prev) => ({ ...prev, office_name: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Latitude
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={geofence.latitude}
                  onChange={(e) => setGeofence((prev) => ({ ...prev, latitude: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Longitude
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={geofence.longitude}
                  onChange={(e) => setGeofence((prev) => ({ ...prev, longitude: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Perimeter Radius (Meters)
                </label>
                <span className="text-xs font-bold font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                  {geofence.radius_meters}m
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="1000"
                step="25"
                value={geofence.radius_meters}
                onChange={(e) => setGeofence((prev) => ({ ...prev, radius_meters: parseInt(e.target.value, 10) }))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                <span>50m (Tight)</span>
                <span>200m (Standard)</span>
                <span>1000m (Campus)</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={geofence.is_enabled}
                  onChange={(e) => setGeofence((prev) => ({ ...prev, is_enabled: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="text-xs font-bold text-slate-800">
                  Enable Geofence Distance Validation
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={geofence.strict_enforcement}
                  onChange={(e) => setGeofence((prev) => ({ ...prev, strict_enforcement: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span className="text-xs font-medium text-slate-700">
                  Strict Enforcement (Reject punch if outside radius)
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/25 transition-all disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving Geofence...' : 'Save Geofence Settings'}
            </button>
          </form>
        </div>

        {/* Right Map View */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Navigation className="w-4 h-4 text-blue-600" />
                <span>Live Interactive Geofence Map</span>
              </h2>
              <p className="text-[11px] text-slate-500">
                Visualizing campus perimeter and boundary circle
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Perimeter Active
            </span>
          </div>

          <div className="flex-1 mt-4 rounded-2xl overflow-hidden border border-slate-200 min-h-[380px] z-10">
            <div ref={mapContainerRef} className="w-full h-full min-h-[380px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
