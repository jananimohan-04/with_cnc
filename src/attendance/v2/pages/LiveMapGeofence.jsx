import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  MapPin, 
  ShieldCheck, 
  ShieldAlert, 
  Navigation, 
  RotateCcw, 
  Save, 
  Building2, 
  Clock, 
  Filter, 
  Search, 
  Users, 
  CheckCircle2, 
  AlertTriangle, 
  Sliders, 
  ExternalLink,
  ChevronRight,
  RefreshCw,
  LocateFixed,
  Radio,
  Briefcase,
  Plus,
  Trash2,
  Compass
} from 'lucide-react';

export const LiveMapGeofence = () => {
  const { organization } = useAuth();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const officeCircleRef = useRef(null);
  const officeMarkerRef = useRef(null);
  const punchMarkersLayerRef = useRef(null);
  const clientSitesLayerRef = useRef(null);
  const hasCenteredRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState({
    date: '',
    geofence: {
      is_enabled: true,
      latitude: organization?.geofence?.latitude || 13.0827,
      longitude: organization?.geofence?.longitude || 80.2707,
      radius_meters: organization?.geofence?.radius_meters || 200,
      strict_enforcement: organization?.geofence?.strict_enforcement || false,
      office_name: organization?.geofence?.office_name || organization?.name || 'Headquarters'
    },
    client_sites: [],
    punches: [],
    total_punches: 0,
    inside_count: 0,
    violation_count: 0
  });

  // Config Drawer & Form State
  const [showEditor, setShowEditor] = useState(false);
  const [editorTab, setEditorTab] = useState('HQ'); // 'HQ' | 'CLIENT_SITES'
  const [savingGeofence, setSavingGeofence] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editorForm, setEditorForm] = useState({
    is_enabled: true,
    latitude: organization?.geofence?.latitude || 13.0827,
    longitude: organization?.geofence?.longitude || 80.2707,
    radius_meters: organization?.geofence?.radius_meters || 200,
    strict_enforcement: organization?.geofence?.strict_enforcement || false,
    office_name: organization?.geofence?.office_name || organization?.name || 'Headquarters'
  });

  // New Client Site Form State
  const [creatingSite, setCreatingSite] = useState(false);
  const [siteForm, setSiteForm] = useState({
    site_name: '',
    client_name: '',
    address: '',
    latitude: organization?.geofence?.latitude || 13.0827,
    longitude: organization?.geofence?.longitude || 80.2707,
    radius_meters: 150,
    contact_person: '',
    contact_phone: ''
  });

  // Filters
  const [filterMode, setFilterMode] = useState('ALL'); // 'ALL' | 'INSIDE' | 'OUTSIDE' | 'FIELD'
  const [selectedDept, setSelectedDept] = useState('All Departments');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPunch, setSelectedPunch] = useState(null);

  // Fetch live punches, geofence config, and client sites
  const fetchMapData = async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const res = await api.get('/attendance/map-punches');
      setData(res.data);
      if (res.data?.geofence) {
        setEditorForm(res.data.geofence);
        const gLat = res.data.geofence.latitude;
        const gLon = res.data.geofence.longitude;
        // Automatically show & fly to organization's saved coordinates whenever opened
        if (gLat && gLon && !hasCenteredRef.current && mapInstanceRef.current) {
          mapInstanceRef.current.setView([gLat, gLon], 16);
          hasCenteredRef.current = true;
        }
      }
    } catch (err) {
      console.error('Failed to load live map data', err);
    } finally {
      if (!isSilent) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchMapData();
    const interval = setInterval(() => {
      fetchMapData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Update map coordinates if organization data becomes available
  useEffect(() => {
    if (organization?.geofence?.latitude && organization?.geofence?.longitude) {
      setEditorForm(prev => ({
        ...prev,
        latitude: organization.geofence.latitude,
        longitude: organization.geofence.longitude,
        radius_meters: organization.geofence.radius_meters || prev.radius_meters,
        office_name: organization.geofence.office_name || prev.office_name
      }));
      if (mapInstanceRef.current && !hasCenteredRef.current) {
        mapInstanceRef.current.setView([organization.geofence.latitude, organization.geofence.longitude], 16);
        hasCenteredRef.current = true;
      }
    }
  }, [organization]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Use organization's saved coordinates first, avoiding random fallback
    const initialLat = organization?.geofence?.latitude || editorForm.latitude || 13.0827;
    const initialLon = organization?.geofence?.longitude || editorForm.longitude || 80.2707;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLon],
      zoom: 16,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // OpenStreetMap Clean Carto-style tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    // Layer groups for dynamic punch markers and client project sites
    const punchLayer = L.layerGroup().addTo(map);
    punchMarkersLayerRef.current = punchLayer;

    const sitesLayer = L.layerGroup().addTo(map);
    clientSitesLayerRef.current = sitesLayer;

    mapInstanceRef.current = map;
    hasCenteredRef.current = true;

    // Handle map clicks when editor is open
    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      const formattedLat = parseFloat(lat.toFixed(6));
      const formattedLng = parseFloat(lng.toFixed(6));

      if (editorTab === 'HQ') {
        setEditorForm(prev => ({
          ...prev,
          latitude: formattedLat,
          longitude: formattedLng
        }));
      } else if (editorTab === 'CLIENT_SITES') {
        setSiteForm(prev => ({
          ...prev,
          latitude: formattedLat,
          longitude: formattedLng
        }));
      }
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Geofence Circle and Office HQ Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const lat = editorForm.latitude || 13.0827;
    const lon = editorForm.longitude || 80.2707;
    const radius = editorForm.radius_meters || 200;

    // Remove old circle
    if (officeCircleRef.current) {
      map.removeLayer(officeCircleRef.current);
    }

    // Draw new Geofence Circle
    const circle = L.circle([lat, lon], {
      radius: radius,
      color: '#2563eb',
      weight: 2,
      fillColor: '#3b82f6',
      fillOpacity: 0.12,
      dashArray: '6, 6'
    }).addTo(map);
    officeCircleRef.current = circle;

    // Remove old marker
    if (officeMarkerRef.current) {
      map.removeLayer(officeMarkerRef.current);
    }

    // Office HQ Marker
    const hqIcon = L.divIcon({
      className: 'custom-hq-marker',
      html: `
        <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
          <span class="absolute animate-ping inline-flex h-9 w-9 rounded-full bg-blue-400 opacity-60"></span>
          <div class="w-8 h-8 rounded-xl bg-blue-600 border-2 border-white shadow-md flex items-center justify-center text-white text-[11px] font-black">
            HQ
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([lat, lon], { 
      icon: hqIcon,
      draggable: true
    }).addTo(map);

    marker.bindPopup(`
      <div class="p-2 text-xs font-sans min-w-[180px]">
        <div class="flex items-center gap-1.5 font-black text-blue-600 uppercase text-[11px] mb-1">
          <span class="w-2 h-2 rounded-full bg-blue-600"></span>
          <span>${editorForm.office_name || 'Designated Office'}</span>
        </div>
        <div class="text-slate-600 font-semibold mb-1">Active Geofence Center</div>
        <div class="text-[10px] font-mono text-slate-400">Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}</div>
        <div class="text-[10px] font-mono text-blue-700 font-bold mt-1">Perimeter: ${radius} meters radius</div>
      </div>
    `);

    marker.on('dragend', (e) => {
      const newPos = e.target.getLatLng();
      setEditorForm(prev => ({
        ...prev,
        latitude: parseFloat(newPos.lat.toFixed(6)),
        longitude: parseFloat(newPos.lng.toFixed(6))
      }));
    });

    officeMarkerRef.current = marker;
  }, [editorForm.latitude, editorForm.longitude, editorForm.radius_meters, editorForm.office_name]);

  // Render Client Project Sites on Map (Field Worker Sites)
  useEffect(() => {
    const layer = clientSitesLayerRef.current;
    const map = mapInstanceRef.current;
    if (!layer || !map) return;

    layer.clearLayers();

    (data.client_sites || []).forEach(site => {
      if (!site.latitude || !site.longitude) return;

      const radius = site.radius_meters || 150;

      // Draw Site Perimeter Circle
      L.circle([site.latitude, site.longitude], {
        radius: radius,
        color: '#7c3aed',
        weight: 2,
        fillColor: '#8b5cf6',
        fillOpacity: 0.14,
        dashArray: '5, 5'
      }).addTo(layer);

      // Draw Site Pin Marker
      const siteIcon = L.divIcon({
        className: 'custom-client-site-marker',
        html: `
          <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 group cursor-pointer">
            <span class="absolute inline-flex h-7 w-7 rounded-full bg-purple-400 opacity-40 animate-pulse"></span>
            <div class="w-8 h-8 rounded-xl bg-purple-600 border-2 border-white shadow-md flex items-center justify-center text-white text-[10px] font-black group-hover:scale-110 transition-transform">
              SITE
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([site.latitude, site.longitude], { icon: siteIcon }).addTo(layer);
      marker.bindPopup(`
        <div class="p-2.5 text-xs font-sans min-w-[210px] space-y-1.5">
          <div class="flex items-center gap-1.5 font-black text-purple-700 uppercase text-[11px] border-b border-slate-100 pb-1">
            <span class="w-2 h-2 rounded-full bg-purple-600"></span>
            <span>${site.site_name}</span>
          </div>
          <div class="text-[11px] font-bold text-slate-800">Client: ${site.client_name || 'Designated Client'}</div>
          <div class="text-[10px] text-slate-500">${site.address || 'Field Project Location'}</div>
          <div class="grid grid-cols-2 gap-1 text-[10px] font-mono text-purple-800 pt-1 border-t border-slate-100">
            <div>Perimeter: ${radius}m</div>
            <div>Contact: ${site.contact_person || 'N/A'}</div>
          </div>
          ${site.contact_phone ? `<div class="text-[10px] font-mono text-slate-400">Tel: ${site.contact_phone}</div>` : ''}
        </div>
      `);
    });
  }, [data.client_sites]);

  // Filtered Punches List
  const filteredPunches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return (data.punches || []).filter(p => {
      const isFieldVisit = p.employment_type === 'FIELD_WORKER' || Boolean(p.client_site_id) || Boolean(p.site_visit_verified);
      const isSiteVerified = p.site_visit_verified === 'VERIFIED_ON_SITE';
      const isInside = isFieldVisit ? isSiteVerified : p.geofence_status === 'INSIDE';

      let matchesFilter = true;
      if (filterMode === 'INSIDE') {
        matchesFilter = isInside;
      } else if (filterMode === 'OUTSIDE') {
        matchesFilter = !isInside;
      } else if (filterMode === 'FIELD') {
        matchesFilter = isFieldVisit;
      }

      const matchesDept = selectedDept === 'All Departments' || (p.department || '').toLowerCase() === selectedDept.toLowerCase();

      const matchesQuery = !q ||
        (p.employee_name || '').toLowerCase().includes(q) ||
        (p.employee_code || '').toLowerCase().includes(q) ||
        (p.department || '').toLowerCase().includes(q) ||
        (p.client_site_name || '').toLowerCase().includes(q);

      return matchesFilter && matchesDept && matchesQuery;
    });
  }, [data.punches, filterMode, selectedDept, searchQuery]);

  // Distinct Departments
  const departmentsList = useMemo(() => {
    const set = new Set();
    (data.punches || []).forEach(p => {
      if (p.department) set.add(p.department.trim());
    });
    return ['All Departments', ...Array.from(set)];
  }, [data.punches]);

  // Render Punch Markers on Map
  useEffect(() => {
    const layer = punchMarkersLayerRef.current;
    if (!layer) return;

    layer.clearLayers();

    filteredPunches.forEach(p => {
      if (!p.latitude || !p.longitude) return;

      const isFieldVisit = p.employment_type === 'FIELD_WORKER' || Boolean(p.client_site_id) || Boolean(p.site_visit_verified);
      const isSiteVerified = p.site_visit_verified === 'VERIFIED_ON_SITE';
      const isInside = isFieldVisit ? isSiteVerified : p.geofence_status === 'INSIDE';

      const markerBgClass = isFieldVisit
        ? (isSiteVerified ? 'bg-purple-600' : 'bg-rose-600 animate-pulse')
        : (isInside ? 'bg-emerald-600' : 'bg-red-600 animate-pulse');

      const punchIcon = L.divIcon({
        className: 'custom-punch-marker',
        html: `
          <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 group cursor-pointer">
            <span class="absolute inline-flex h-6 w-6 rounded-full opacity-40 ${isInside ? 'bg-emerald-400' : 'bg-red-400 animate-ping'}"></span>
            <div class="w-7 h-7 rounded-full ${markerBgClass} border-2 border-white shadow-md flex items-center justify-center text-white text-[9px] font-black transition-transform hover:scale-125">
              ${p.avatar || 'EM'}
            </div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([p.latitude, p.longitude], { icon: punchIcon });

      const distText = isFieldVisit
        ? (p.distance_meters !== null && p.distance_meters !== undefined 
            ? `${Math.round(p.distance_meters)} meters far from ${p.client_site_name || 'Client Site'}` 
            : 'Distance N/A')
        : (p.distance_meters !== null && p.distance_meters !== undefined 
            ? `${Math.round(p.distance_meters)} meters far from ${editorForm.office_name || data?.geofence?.office_name || 'Headquarters'}` 
            : 'Distance N/A');

      const statusBadge = isFieldVisit
        ? (isSiteVerified 
            ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">VERIFIED AT CLIENT SITE</span>'
            : '<span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">SITE PERIMETER VIOLATION</span>')
        : (isInside 
            ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">VERIFIED ON-SITE</span>' 
            : '<span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-red-50 text-red-700 border border-red-200">GEOFENCE VIOLATION</span>');

      const popupHtml = `
        <div class="p-2.5 text-xs font-sans min-w-[210px] space-y-1.5">
          <div class="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div>
              <div class="font-black text-slate-900 text-xs">${p.employee_name}</div>
              <div class="text-[10px] font-mono text-slate-400">${p.employee_code} • ${p.department}</div>
            </div>
            ${statusBadge}
          </div>

          ${isFieldVisit ? `
            <div class="px-2 py-1 bg-purple-50 border border-purple-100 rounded text-[10px] font-mono text-purple-800">
              Field Site: <strong>${p.client_site_name || 'External Site'}</strong>
            </div>
          ` : ''}

          <div class="grid grid-cols-2 gap-1 text-[10px] pt-0.5">
            <div>
              <span class="text-slate-400 uppercase font-mono text-[9px]">Punch Time</span>
              <div class="font-bold text-slate-800 font-mono">${p.check_in_time || p.time || '—'}</div>
            </div>
            <div>
              <span class="text-slate-400 uppercase font-mono text-[9px]">Distance</span>
              <div class="font-bold ${isInside ? 'text-emerald-700' : 'text-red-600'} font-mono">${distText}</div>
            </div>
          </div>

          <div class="text-[9px] font-mono text-slate-400 pt-1 border-t border-slate-100">
            GPS: ${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      layer.addLayer(marker);
    });
  }, [filteredPunches]);

  // Center on employee pin
  const handleSelectPunch = (p) => {
    setSelectedPunch(p);
    const map = mapInstanceRef.current;
    if (map && p.latitude && p.longitude) {
      map.flyTo([p.latitude, p.longitude], 18, { duration: 1.2 });
    }
  };

  // Fly to HQ Saved Coordinates
  const handleFlyToHQ = () => {
    const map = mapInstanceRef.current;
    const lat = editorForm.latitude || organization?.geofence?.latitude;
    const lon = editorForm.longitude || organization?.geofence?.longitude;
    if (map && lat && lon) {
      map.flyTo([lat, lon], 16, { duration: 1.2 });
    }
  };

  // Use Current Device Location for HQ or Client Site
  const handleUseCurrentLocation = (target) => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const lat = parseFloat(latitude.toFixed(6));
        const lon = parseFloat(longitude.toFixed(6));

        if (target === 'SITE') {
          setSiteForm(prev => ({ ...prev, latitude: lat, longitude: lon }));
        } else {
          setEditorForm(prev => ({ ...prev, latitude: lat, longitude: lon }));
        }

        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([lat, lon], 17);
        }
      },
      (err) => {
        alert('Could not retrieve current location. Please ensure location permissions are granted.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Save Geofence Configuration
  const handleSaveGeofence = async (e) => {
    e.preventDefault();
    setSavingGeofence(true);
    setSaveSuccess(false);
    try {
      await api.put('/organizations/my-org/geofence', editorForm);
      setSaveSuccess(true);
      await fetchMapData(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert('Failed to save geofence settings.');
    } finally {
      setSavingGeofence(false);
    }
  };

  // Create Client Project Site
  const handleCreateClientSite = async (e) => {
    e.preventDefault();
    setCreatingSite(true);
    try {
      await api.post('/organizations/client-sites', siteForm);
      setSiteForm({
        site_name: '',
        client_name: '',
        address: '',
        latitude: editorForm.latitude || 13.0827,
        longitude: editorForm.longitude || 80.2707,
        radius_meters: 150,
        contact_person: '',
        contact_phone: ''
      });
      await fetchMapData(true);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to register client site.');
    } finally {
      setCreatingSite(false);
    }
  };

  // Delete Client Site
  const handleDeleteClientSite = async (siteId) => {
    if (!window.confirm('Are you sure you want to remove this client project site?')) return;
    try {
      await api.delete(`/organizations/client-sites/${siteId}`);
      await fetchMapData(true);
    } catch (err) {
      alert('Failed to remove client site.');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] space-y-3">
      {/* Top Header & Metrics Banner */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 uppercase">
                REAL-TIME GEOFENCE MAPVIEW
              </h1>
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-mono font-bold">
                LIVE GPS
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Metrics */}
          <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
            <div>
              <span className="text-slate-400 text-[10px] font-mono uppercase block">Total Punches</span>
              <span className="font-bold text-slate-800">{data.total_punches}</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 text-[10px] font-mono uppercase block">On-Site</span>
              <span className="font-bold text-emerald-600">{data.inside_count}</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 text-[10px] font-mono uppercase block">Violations</span>
              <span className="font-bold text-red-600">{data.violation_count}</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 text-[10px] font-mono uppercase block">Client Sites</span>
              <span className="font-bold text-purple-600">{data.client_sites?.length || 0}</span>
            </div>
          </div>

          <button
            onClick={handleFlyToHQ}
            className="py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title="Recenter map on saved Organization HQ"
          >
            <Compass className="w-3.5 h-3.5 text-blue-600" />
            <span>Center on HQ</span>
          </button>

          <button
            onClick={() => setShowEditor(!showEditor)}
            className={`py-2 px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
              showEditor 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{showEditor ? 'Close Perimeter Settings' : 'Configure Geofences'}</span>
          </button>

          <button
            onClick={() => fetchMapData()}
            disabled={refreshing}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-600 transition-colors cursor-pointer"
            title="Refresh Live Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Work Area: Map + Side Feed */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 overflow-hidden">
        {/* Left / Center: Interactive Leaflet Map Container */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative flex flex-col">
          {/* Map Controls Floating Overlay */}
          <div className="absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur-sm p-1.5 rounded-xl border border-slate-200 shadow-sm">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                filterMode === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All ({data.total_punches})
            </button>
            <button
              onClick={() => setFilterMode('INSIDE')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                filterMode === 'INSIDE' ? 'bg-emerald-600 text-white' : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>On-Site ({data.inside_count})</span>
            </button>
            <button
              onClick={() => setFilterMode('OUTSIDE')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                filterMode === 'OUTSIDE' ? 'bg-red-600 text-white' : 'text-red-700 hover:bg-red-50'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Violations ({data.violation_count})</span>
            </button>
            <button
              onClick={() => setFilterMode('FIELD')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                filterMode === 'FIELD' ? 'bg-purple-600 text-white' : 'text-purple-700 hover:bg-purple-50'
              }`}
            >
              <Briefcase className="w-3 h-3" />
              <span>Field Visits</span>
            </button>
          </div>

          {/* Map DOM Target */}
          <div ref={mapContainerRef} className="w-full h-full z-0" />

          {/* Bottom Floating Legend */}
          <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm text-[11px] font-semibold flex flex-wrap items-center gap-3 text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
              <span>HQ ({editorForm.radius_meters}m Perimeter)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block"></span>
              <span>Client Sites (Field)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
              <span>Verified On-Site</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span>
              <span>Geofence Violation</span>
            </div>
          </div>
        </div>

        {/* Right Panel: Geofence Setup Drawer OR Live Feed */}
        <div className="w-full lg:w-96 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
          {showEditor ? (
            /* Setup Drawer with Tabs (HQ vs Client Sites) */
            <div className="flex flex-col h-full overflow-hidden">
              <div className="p-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                <div className="flex items-center gap-1 p-0.5 bg-slate-200/60 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setEditorTab('HQ')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      editorTab === 'HQ' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Office HQ
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab('CLIENT_SITES')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      editorTab === 'CLIENT_SITES' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Briefcase className="w-3 h-3" />
                    <span>Client Sites ({data.client_sites?.length || 0})</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEditor(false)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 px-2 py-1"
                >
                  Close
                </button>
              </div>

              {editorTab === 'HQ' ? (
                /* HQ Setup Form */
                <form onSubmit={handleSaveGeofence} className="flex flex-col flex-1 overflow-hidden">
                  <div className="p-4 space-y-3.5 overflow-y-auto flex-1 text-xs">
                    {saveSuccess && (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>HQ geofence saved &amp; applied!</span>
                      </div>
                    )}

                    {/* Enable Geofencing Toggle */}
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div>
                        <div className="font-bold text-slate-800">Enable HQ Geofencing</div>
                        <div className="text-[10px] text-slate-400">Validate physical coordinates for office staff</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={editorForm.is_enabled}
                        onChange={(e) => setEditorForm({ ...editorForm, is_enabled: e.target.checked })}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                      />
                    </div>

                    {/* Office Name */}
                    <div>
                      <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                        HQ / Branch Name
                      </label>
                      <input
                        type="text"
                        value={editorForm.office_name}
                        onChange={(e) => setEditorForm({ ...editorForm, office_name: e.target.value })}
                        className="w-full text-xs font-semibold text-slate-800 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. Headquarters Campus"
                      />
                    </div>

                    {/* Coordinates Picker */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                          Latitude
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={editorForm.latitude}
                          onChange={(e) => setEditorForm({ ...editorForm, latitude: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs font-mono font-semibold text-slate-800 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                          Longitude
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={editorForm.longitude}
                          onChange={(e) => setEditorForm({ ...editorForm, longitude: parseFloat(e.target.value) || 0 })}
                          className="w-full text-xs font-mono font-semibold text-slate-800 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {/* Helper Button: GPS Auto-fill */}
                    <button
                      type="button"
                      onClick={() => handleUseCurrentLocation('HQ')}
                      className="w-full py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs"
                    >
                      <LocateFixed className="w-3.5 h-3.5" />
                      <span>Set HQ to My Current Device GPS</span>
                    </button>

                    <p className="text-[10px] text-slate-400 italic">
                      💡 Tip: Click or drag the blue "HQ" marker on the map to update coordinates visually.
                    </p>

                    {/* Radius Slider */}
                    <div className="space-y-1.5 pt-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-mono font-bold text-slate-500 uppercase">
                          Perimeter Radius
                        </label>
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono font-bold text-xs">
                          {editorForm.radius_meters} meters
                        </span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="1000"
                        step="25"
                        value={editorForm.radius_meters}
                        onChange={(e) => setEditorForm({ ...editorForm, radius_meters: parseInt(e.target.value, 10) })}
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>50m (Tight)</span>
                        <span>500m</span>
                        <span>1,000m (Large)</span>
                      </div>
                    </div>

                    {/* Strict Enforcement Toggle */}
                    <div className="flex items-start justify-between p-3 bg-amber-50/60 rounded-xl border border-amber-200">
                      <div className="pr-2">
                        <div className="font-bold text-amber-900">Strict Enforcement</div>
                        <div className="text-[10px] text-amber-700">
                          Block punches if outside the perimeter.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={editorForm.strict_enforcement}
                        onChange={(e) => setEditorForm({ ...editorForm, strict_enforcement: e.target.checked })}
                        className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 cursor-pointer mt-0.5 shrink-0"
                      />
                    </div>
                  </div>

                  <div className="p-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-2 shrink-0">
                    <button
                      type="submit"
                      disabled={savingGeofence}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{savingGeofence ? 'Saving...' : 'Save HQ Geofence Settings'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* Client Project Sites List & Registration (Field Workers) */
                <div className="flex flex-col flex-1 overflow-hidden text-xs">
                  <div className="p-3 bg-purple-50/80 border-b border-purple-100">
                    <div className="font-bold text-purple-900">Field Worker Designated Sites</div>
                    <div className="text-[10px] text-purple-700">
                      Register external client sites where field employees are authorized to work. Anti-fraud checks verify GPS distance against site perimeters.
                    </div>
                  </div>

                  <div className="p-3 space-y-3 overflow-y-auto flex-1">
                    {/* List Existing Sites */}
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-mono font-bold text-slate-500 uppercase">
                        Registered Sites ({data.client_sites?.length || 0})
                      </div>
                      {(!data.client_sites || data.client_sites.length === 0) ? (
                        <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs">
                          No client sites registered yet. Add one below to start tracking field visits.
                        </div>
                      ) : (
                        data.client_sites.map(s => (
                          <div key={s.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between gap-2">
                            <div>
                              <div className="font-bold text-slate-800">{s.site_name}</div>
                              <div className="text-[10px] text-purple-700 font-semibold">{s.client_name || 'Client Site'}</div>
                              <div className="text-[10px] text-slate-500">{s.address}</div>
                              <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                                Radius: {s.radius_meters}m • Lat: {s.latitude?.toFixed(4)}, Lon: {s.longitude?.toFixed(4)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteClientSite(s.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-white transition-colors cursor-pointer shrink-0"
                              title="Delete Site"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Add Client Site Form */}
                    <form onSubmit={handleCreateClientSite} className="p-3 bg-slate-50 border border-purple-200 rounded-xl space-y-2">
                      <div className="font-bold text-purple-900 flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5 text-purple-600" />
                        <span>Register New Client Site</span>
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase">Site / Project Name</label>
                        <input
                          type="text"
                          required
                          value={siteForm.site_name}
                          onChange={(e) => setSiteForm({ ...siteForm, site_name: e.target.value })}
                          placeholder="e.g. Metro Construction Site #3"
                          className="w-full text-xs font-semibold border border-slate-200 bg-white rounded-lg px-2.5 py-1.5"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase">Client / Organization Name</label>
                        <input
                          type="text"
                          required
                          value={siteForm.client_name}
                          onChange={(e) => setSiteForm({ ...siteForm, client_name: e.target.value })}
                          placeholder="e.g. Apex Infrastructure Ltd"
                          className="w-full text-xs font-semibold border border-slate-200 bg-white rounded-lg px-2.5 py-1.5"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase">Physical Address</label>
                        <input
                          type="text"
                          required
                          value={siteForm.address}
                          onChange={(e) => setSiteForm({ ...siteForm, address: e.target.value })}
                          placeholder="e.g. OMR IT Highway, Navalur"
                          className="w-full text-xs font-semibold border border-slate-200 bg-white rounded-lg px-2.5 py-1.5"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase">Latitude</label>
                          <input
                            type="number"
                            step="any"
                            required
                            value={siteForm.latitude}
                            onChange={(e) => setSiteForm({ ...siteForm, latitude: parseFloat(e.target.value) || 0 })}
                            className="w-full text-xs font-mono font-semibold border border-slate-200 bg-white rounded-lg px-2 py-1.5"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase">Longitude</label>
                          <input
                            type="number"
                            step="any"
                            required
                            value={siteForm.longitude}
                            onChange={(e) => setSiteForm({ ...siteForm, longitude: parseFloat(e.target.value) || 0 })}
                            className="w-full text-xs font-mono font-semibold border border-slate-200 bg-white rounded-lg px-2 py-1.5"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase">Radius (meters)</label>
                          <input
                            type="number"
                            min="50"
                            max="1500"
                            value={siteForm.radius_meters}
                            onChange={(e) => setSiteForm({ ...siteForm, radius_meters: parseInt(e.target.value, 10) || 150 })}
                            className="w-full text-xs font-mono font-semibold border border-slate-200 bg-white rounded-lg px-2 py-1.5"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase">Contact Person</label>
                          <input
                            type="text"
                            value={siteForm.contact_person}
                            onChange={(e) => setSiteForm({ ...siteForm, contact_person: e.target.value })}
                            placeholder="Site Engineer"
                            className="w-full text-xs font-semibold border border-slate-200 bg-white rounded-lg px-2 py-1.5"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUseCurrentLocation('SITE')}
                        className="w-full py-1.5 px-2 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer text-[11px]"
                      >
                        <LocateFixed className="w-3 h-3" />
                        <span>Set Site Coords to Current GPS</span>
                      </button>

                      <button
                        type="submit"
                        disabled={creatingSite}
                        className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{creatingSite ? 'Registering...' : 'Add Client Site'}</span>
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Live Punch Feed Panel */
            <div className="flex flex-col h-full overflow-hidden">
              {/* Feed Header */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/70 shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold uppercase text-slate-800">
                      Live Check-In Pins ({filteredPunches.length})
                    </h3>
                  </div>
                </div>

                {/* Mini Search & Dept Dropdown */}
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search name, code, dept, site..."
                      className="w-full pl-8 pr-3 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    {departmentsList.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Punch Item List */}
              <div className="overflow-y-auto flex-1 p-2 space-y-1.5 divide-y divide-slate-100">
                {filteredPunches.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-1.5">
                    <MapPin className="w-8 h-8 text-slate-300 stroke-1" />
                    <span className="font-bold text-slate-600">No punches found</span>
                    <span className="text-[10px]">Punches captured with GPS will appear on the map here.</span>
                  </div>
                ) : (
                  filteredPunches.map(p => {
                    const isFieldVisit = p.employment_type === 'FIELD_WORKER' || Boolean(p.client_site_id) || Boolean(p.site_visit_verified);
                    const isSiteVerified = p.site_visit_verified === 'VERIFIED_ON_SITE';
                    const isInside = isFieldVisit ? isSiteVerified : p.geofence_status === 'INSIDE';

                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectPunch(p)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                          selectedPunch?.id === p.id 
                            ? 'bg-blue-50/80 border-blue-300 shadow-sm' 
                            : 'bg-white hover:bg-slate-50 border-slate-200/80'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-lg text-white font-bold text-xs flex items-center justify-center shrink-0 ${
                            isFieldVisit 
                              ? (isSiteVerified ? 'bg-purple-600' : 'bg-rose-600')
                              : (isInside ? 'bg-emerald-600' : 'bg-red-600')
                          }`}>
                            {p.avatar || 'EM'}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 text-xs truncate">
                              {p.employee_name}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {p.employee_code} • {p.department}
                            </div>
                            {isFieldVisit && (
                              <div className="text-[10px] font-bold text-purple-700 truncate mt-0.5">
                                Site: {p.client_site_name || 'Designated Site'}
                              </div>
                            )}
                            {p.distance_meters !== null && p.distance_meters !== undefined && (
                              <div className={`text-[10px] font-bold mt-0.5 flex items-center gap-1 ${
                                isInside ? 'text-emerald-700' : 'text-rose-600'
                              }`}>
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                  {Math.round(p.distance_meters)} meters far from {p.client_site_name || editorForm.office_name || data?.geofence?.office_name || 'site'}
                                </span>
                              </div>
                            )}
                            <div className="text-[10px] font-mono text-blue-600 font-semibold mt-0.5">
                              {p.check_in_time || p.time || '—'}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {isFieldVisit ? (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold block mb-1 ${
                              isSiteVerified ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {isSiteVerified ? 'AT SITE' : 'VIOLATION'}
                            </span>
                          ) : (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold block mb-1 ${
                              isInside ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                            }`}>
                              {isInside ? 'ON-SITE' : 'VIOLATION'}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-slate-500 block">
                            {p.distance_meters !== null && p.distance_meters !== undefined ? `${Math.round(p.distance_meters)}m` : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
