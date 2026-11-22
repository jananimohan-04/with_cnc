import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Clock, 
  Upload, 
  Trash2, 
  Save, 
  RotateCcw, 
  CheckCircle2, 
  ShieldCheck, 
  Mail, 
  Phone, 
  Globe, 
  MapPin, 
  User, 
  Briefcase,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

export const OrgSettings = () => {
  const { user, organization, updateOrganization } = useAuth();
  const [activeTab, setActiveTab] = useState('details'); // 'details' or 'shifts'
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState(organization?.logo_url || '');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = React.useRef(null);

  const [formData, setFormData] = useState({
    name: organization?.name || '',
    industry: organization?.industry || 'Technology & Services',
    gstin: organization?.gstin || '',
    email: organization?.contact_email || user?.email || '',
    phone: organization?.phone || '',
    website: organization?.website || '',
    address: organization?.address || '',
    // Shift timings
    shiftStart: organization?.work_hours?.start_time || '09:00',
    shiftEnd: organization?.work_hours?.end_time || '18:00',
    graceMinutes: organization?.work_hours?.late_grace_minutes || 15,
    halfDayHours: organization?.work_hours?.half_day_hours || 4.5,
    otMultiplier: 1.5,
    // Geofencing
    geofenceEnabled: organization?.geofence?.is_enabled ?? true,
    geofenceLat: organization?.geofence?.latitude || 13.0827,
    geofenceLon: organization?.geofence?.longitude || 80.2707,
    geofenceRadius: organization?.geofence?.radius_meters || 200,
    geofenceStrict: organization?.geofence?.strict_enforcement ?? false,
    geofenceOfficeName: organization?.geofence?.office_name || organization?.name || 'Headquarters'
  });

  useEffect(() => {
    if (organization) {
      setLogoUrl(organization.logo_url || '');
      setFormData(prev => ({
        ...prev,
        name: organization.name || prev.name,
        industry: organization.industry || prev.industry,
        gstin: organization.gstin || prev.gstin,
        email: organization.contact_email || prev.email,
        phone: organization.phone || prev.phone,
        website: organization.website || prev.website,
        address: organization.address || prev.address,
        shiftStart: organization.work_hours?.start_time || prev.shiftStart,
        shiftEnd: organization.work_hours?.end_time || prev.shiftEnd,
        graceMinutes: organization.work_hours?.late_grace_minutes || prev.graceMinutes,
        halfDayHours: organization.work_hours?.half_day_hours || prev.halfDayHours,
        geofenceEnabled: organization.geofence?.is_enabled ?? prev.geofenceEnabled,
        geofenceLat: organization.geofence?.latitude ?? prev.geofenceLat,
        geofenceLon: organization.geofence?.longitude ?? prev.geofenceLon,
        geofenceRadius: organization.geofence?.radius_meters ?? prev.geofenceRadius,
        geofenceStrict: organization.geofence?.strict_enforcement ?? prev.geofenceStrict,
        geofenceOfficeName: organization.geofence?.office_name || prev.geofenceOfficeName
      }));
    }
  }, [organization]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleLogoFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, SVG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Image file size exceeds the 5MB limit. Please choose a smaller image.');
      return;
    }

    setUploadingLogo(true);
    setErrorMessage('');

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64Data = event.target.result;
          setLogoUrl(base64Data);

          // Upload to backend with resilient fallback
          let saved = false;
          try {
            await api.post('/organizations/my-org/logo', {
              logo_url: base64Data
            });
            saved = true;
          } catch (postErr) {
            console.warn('POST /my-org/logo failed, falling back to update settings:', postErr);
          }

          if (!saved) {
            await api.put('/organizations/my-org/settings', {
              logo_url: base64Data
            });
          }

          // Sync with AuthContext across the whole app
          if (updateOrganization) {
            updateOrganization({ logo_url: base64Data });
          }

          setSavedSuccess(true);
          setTimeout(() => setSavedSuccess(false), 4000);
        } catch (uploadErr) {
          setErrorMessage(uploadErr.response?.data?.detail || 'Failed to upload logo.');
        } finally {
          setUploadingLogo(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setErrorMessage('Failed to read image file.');
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!window.confirm('Are you sure you want to remove your company logo?')) return;
    setUploadingLogo(true);
    setErrorMessage('');
    try {
      let removed = false;
      try {
        await api.delete('/organizations/my-org/logo');
        removed = true;
      } catch (delErr) {
        console.warn('DELETE /my-org/logo failed, falling back to update settings:', delErr);
      }

      if (!removed) {
        await api.put('/organizations/my-org/settings', {
          logo_url: null
        });
      }

      setLogoUrl('');
      if (updateOrganization) {
        updateOrganization({ logo_url: null });
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Failed to remove logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    try {
      await api.put('/organizations/my-org/settings', {
        name: formData.name.trim(),
        industry: formData.industry,
        gstin: formData.gstin?.trim() ? formData.gstin.trim().toUpperCase() : null,
        phone: formData.phone,
        website: formData.website,
        address: formData.address,
        logo_url: logoUrl || null,
        work_hours: {
          start_time: formData.shiftStart,
          end_time: formData.shiftEnd,
          late_grace_minutes: parseInt(formData.graceMinutes) || 15,
          half_day_hours: parseFloat(formData.halfDayHours) || 4.5
        },
        geofence: {
          is_enabled: formData.geofenceEnabled,
          latitude: parseFloat(formData.geofenceLat) || 13.0827,
          longitude: parseFloat(formData.geofenceLon) || 80.2707,
          radius_meters: parseInt(formData.geofenceRadius, 10) || 200,
          strict_enforcement: formData.geofenceStrict,
          office_name: formData.geofenceOfficeName
        }
      });

      if (updateOrganization) {
        updateOrganization({
          name: formData.name.trim(),
          industry: formData.industry,
          gstin: formData.gstin?.trim() ? formData.gstin.trim().toUpperCase() : null,
          logo_url: logoUrl || null,
          geofence: {
            is_enabled: formData.geofenceEnabled,
            latitude: parseFloat(formData.geofenceLat) || 13.0827,
            longitude: parseFloat(formData.geofenceLon) || 80.2707,
            radius_meters: parseInt(formData.geofenceRadius, 10) || 200,
            strict_enforcement: formData.geofenceStrict,
            office_name: formData.geofenceOfficeName
          }
        });
      }

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Failed to update organisation settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (organization) {
      setLogoUrl(organization.logo_url || '');
      setFormData({
        name: organization.name || '',
        industry: organization.industry || 'Technology & Services',
        gstin: organization.gstin || '',
        email: organization.contact_email || user?.email || '',
        phone: organization.phone || '',
        website: organization.website || '',
        address: organization.address || '',
        shiftStart: organization.work_hours?.start_time || '09:00',
        shiftEnd: organization.work_hours?.end_time || '18:00',
        graceMinutes: organization.work_hours?.late_grace_minutes || 15,
        halfDayHours: organization.work_hours?.half_day_hours || 4.5,
        otMultiplier: 1.5
      });
    }
  };

  const ceoName = user?.name || user?.email?.split('@')[0] || 'Organisation Admin';
  const orgDisplayName = formData.name || organization?.name || 'Your Organisation';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Organisation Settings &amp; Preferences
          </h1>
        </div>

        <div className="flex items-center gap-3">

          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs">
              {ceoName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">{ceoName}</div>
              <div className="text-[10px] text-slate-400 font-mono">CHIEF EXECUTIVE OFFICER</div>
            </div>
          </div>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Organisation settings and operational parameters updated successfully in database!</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Sub-Tab Navigation Pills */}
      <div className="inline-flex rounded-xl p-1 bg-white border border-slate-200 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('details')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'details'
              ? 'bg-[#0052cc] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Organisation Details
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('shifts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'shifts'
              ? 'bg-[#0052cc] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-4 h-4" />
          Work Shifts &amp; Timing
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('geofence')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'geofence'
              ? 'bg-[#0052cc] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <MapPin className="w-4 h-4" />
          Geofencing &amp; Location
        </button>
      </div>

      {activeTab === 'details' && (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Top Row: Company Profile & Executive Oversight */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left Card: Company Profile */}
            <div className="lg:col-span-8 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-900">
                  Company Profile &amp; Branding
                </h2>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                {/* Logo Display Box */}
                <div className="relative w-24 h-24 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center p-2 shrink-0 overflow-hidden shadow-sm group">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={`${orgDisplayName} Logo`}
                      className="w-full h-full object-contain rounded-xl"
                      onError={() => setLogoUrl('')}
                    />
                  ) : (
                    <div className="text-center">
                      <Building2 className="w-8 h-8 text-blue-600 mx-auto" />
                      <span className="text-[10px] font-black text-slate-700 tracking-wider block mt-1">
                        {(formData.name || 'ORG').slice(0, 5).toUpperCase()}
                      </span>
                    </div>
                  )}

                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] shadow-sm">
                    ✓
                  </span>
                </div>

                {/* Upload & Management Controls */}
                <div className="space-y-2 flex-1">
                  <div className="font-extrabold text-base text-slate-900">
                    {orgDisplayName}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml"
                      onChange={handleLogoFileChange}
                      className="hidden"
                    />

                    <button
                      type="button"
                      disabled={uploadingLogo}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingLogo ? 'Uploading...' : (logoUrl ? 'Change Logo' : 'Upload Logo')}
                    </button>

                    {logoUrl && (
                      <button
                        type="button"
                        disabled={uploadingLogo}
                        onClick={handleRemoveLogo}
                        className="px-3 py-1.5 rounded-xl border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove Logo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Card: Executive Oversight */}
            <div className="lg:col-span-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">

              <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-3 my-auto">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-extrabold flex items-center justify-center text-sm shadow-sm shrink-0">
                  {ceoName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-xs sm:text-sm">
                    {ceoName}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Chief Executive Officer &amp; Founder
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Legal Registration & Contact Coordinates Card */}
          <div className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">
                  Legal Registration &amp; Contact Coordinates
                </h2>
              </div>
              <span className="text-slate-400">
                <Building2 className="w-4 h-4" />
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Organisation Legal Name *
                </label>
                <input
                  type="text"
                  required
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Argus Technologies Ltd."
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Industry / Operational Sector
                </label>
                <input
                  type="text"
                  name="industry"
                  value={formData.industry}
                  onChange={handleChange}
                  placeholder="e.g. Artificial Intelligence & Hardware"
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Corporate Registration / GSTIN (Optional)
                </label>
                <input
                  type="text"
                  name="gstin"
                  value={formData.gstin}
                  onChange={handleChange}
                  placeholder="33AAAAANM1RZN"
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none uppercase"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Official Contact Email
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Primary Voice Hotline
              </label>
              <div className="relative max-w-md">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+91 98765 43210"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Corporate Web Portal
              </label>
              <div className="relative">
                <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  placeholder="https://yourcompany.com"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Head Office Physical Campus
              </label>
              <textarea
                rows="2"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Office address / headquarters location"
                className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Bottom Bar Controls */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>Admin Account: <span className="font-bold text-slate-700">{user?.email}</span></span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-[#0052cc] hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                <span>{loading ? 'Saving...' : 'Save Organisation Details'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {activeTab === 'shifts' && (
        /* Work Shifts & Timing Configuration Tab */
        <form onSubmit={handleSave} className="space-y-6">
          <div className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                Work Shift Timing &amp; Attendance Rules
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Standard Shift Start Time
                </label>
                <input
                  type="time"
                  name="shiftStart"
                  value={formData.shiftStart}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Standard Shift End Time
                </label>
                <input
                  type="time"
                  name="shiftEnd"
                  value={formData.shiftEnd}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Late Grace Minutes
                </label>
                <input
                  type="number"
                  name="graceMinutes"
                  value={formData.graceMinutes}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">Arrival after grace is tagged as LATE.</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Half-Day Hours Threshold
                </label>
                <input
                  type="number"
                  step="0.5"
                  name="halfDayHours"
                  value={formData.halfDayHours}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">Shift below threshold marked HALF_DAY.</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Overtime Pay Multiplier
                </label>
                <input
                  type="number"
                  step="0.1"
                  name="otMultiplier"
                  value={formData.otMultiplier}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">Applied to extra approved hours (e.g. 1.5x).</p>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Reset Defaults
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-[#0052cc] hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Saving...' : 'Save Shift Timings'}</span>
            </button>
          </div>
        </form>
      )}

      {activeTab === 'geofence' && (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="bg-white p-5 sm:p-7 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  <span>Geofencing Perimeter &amp; Location Coordinates</span>
                </h2>
              </div>
              <a
                href="/attendance/geofence"
                className="py-2 px-3.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors self-start sm:self-auto shrink-0 shadow-sm"
              >
                <span>Launch Interactive Map</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Geofence Active Toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <div className="font-bold text-slate-800 text-xs">Enable Geofence Validation</div>
                <div className="text-[11px] text-slate-500">
                  When enabled, attendance punches compare the device GPS with your configured office perimeter.
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.geofenceEnabled}
                onChange={(e) => setFormData({ ...formData, geofenceEnabled: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {/* Office Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Premises / Branch Name
              </label>
              <input
                type="text"
                name="geofenceOfficeName"
                value={formData.geofenceOfficeName}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="e.g. Headquarters Chennai"
              />
            </div>

            {/* Coordinates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  name="geofenceLat"
                  value={formData.geofenceLat}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  name="geofenceLon"
                  value={formData.geofenceLon}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Radius Slider */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Allowed Perimeter Radius
                </label>
                <span className="px-2.5 py-0.5 rounded bg-blue-50 text-blue-700 font-mono font-bold text-xs">
                  {formData.geofenceRadius} meters
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="1000"
                step="25"
                name="geofenceRadius"
                value={formData.geofenceRadius}
                onChange={handleChange}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>50 meters (Tight)</span>
                <span>500 meters</span>
                <span>1,000 meters (Campus)</span>
              </div>
            </div>

            {/* Strict Enforcement Toggle */}
            <div className="flex items-start justify-between p-4 bg-amber-50/60 rounded-xl border border-amber-200">
              <div className="pr-4">
                <div className="font-bold text-amber-900 text-xs">Strict Perimeter Enforcement</div>
                <div className="text-[11px] text-amber-800 mt-0.5">
                  If enabled, any punch attempt made outside the allowed perimeter is rejected with HTTP 403. If disabled, punches are approved but recorded as violations on the Real-time Map.
                </div>
              </div>
              <input
                type="checkbox"
                checked={formData.geofenceStrict}
                onChange={(e) => setFormData({ ...formData, geofenceStrict: e.target.checked })}
                className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 cursor-pointer mt-0.5 shrink-0"
              />
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-[#0052cc] hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Saving...' : 'Save Geofence Settings'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
