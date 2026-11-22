import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { extract128VectorFromCanvas } from '../../engine/faceMeshEngine';
import { Calendar, Clock, CheckCircle2, ShieldCheck, UserCheck, Award, AlertTriangle, LogOut, ChevronRight, X, Briefcase, Camera, MapPin, Loader2, Utensils } from 'lucide-react';

export const EmployeePortal = () => {
  const { user, organization } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPunches, setSelectedPunches] = useState(null);

  // Field Worker Site Visit Punch State
  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [clientSites, setClientSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [fieldNotes, setFieldNotes] = useState('');
  const [submittingFieldPunch, setSubmittingFieldPunch] = useState(false);
  const [fieldPunchResult, setFieldPunchResult] = useState(null);
  const [fieldPunchError, setFieldPunchError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [streamActive, setStreamActive] = useState(false);

  const fetchMyHistory = async () => {
    try {
      const res = await api.get('/attendance/my-history');
      setHistory(res.data);
    } catch (err) {
      console.error('Failed to load my attendance history', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyHistory();
  }, []);

  const openFieldModal = async () => {
    setFieldModalOpen(true);
    setFieldPunchResult(null);
    setFieldPunchError('');
    try {
      const res = await api.get('/organizations/client-sites');
      setClientSites(res.data || []);
      if (res.data && res.data.length > 0) {
        setSelectedSiteId(res.data[0].id);
      }
    } catch (e) {
      setClientSites([]);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 360, facingMode: 'user' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStreamActive(true);
      }
    } catch (err) {
      setFieldPunchError('Could not start webcam. Please grant camera permissions.');
    }
  };

  const closeFieldModal = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    }
    setStreamActive(false);
    setFieldModalOpen(false);
    setFieldPunchResult(null);
    setFieldPunchError('');
  };

  const handleFieldPunchSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSiteId) {
      setFieldPunchError('Please select a designated client project site.');
      return;
    }
    if (!videoRef.current || !canvasRef.current) {
      setFieldPunchError('Camera preview is unavailable.');
      return;
    }

    setSubmittingFieldPunch(true);
    setFieldPunchError('');
    setFieldPunchResult(null);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 480;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      // Compute the 128-d face embedding locally (no raw image leaves the device)
      const extraction = extract128VectorFromCanvas(canvas);
      if (!extraction.quality.faceDetected) {
        throw new Error('No face clearly detected. Please center your face in the camera preview.');
      }
      const faceEmbedding = extraction.vector;

      const coords = await new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve(null);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });

      if (!coords) {
        throw new Error('Location access is required to verify on-site attendance. Please enable device GPS.');
      }

      const payload = {
        client_site_id: selectedSiteId,
        face_embedding: faceEmbedding,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        notes: fieldNotes
      };

      const res = await api.post('/attendance/field-punch', payload);
      setFieldPunchResult(res.data);
      fetchMyHistory();
    } catch (err) {
      setFieldPunchError(err.response?.data?.detail || err.message || 'Failed to submit field punch.');
    } finally {
      setSubmittingFieldPunch(false);
    }
  };

  const totalHours = history.reduce((acc, curr) => acc + (curr.total_hours || 0), 0);
  const presentDays = history.filter(h => h.status === 'PRESENT' || h.status === 'LATE').length;
  const onTimeDays = history.filter(h => 
    h.status === 'PRESENT' && (h.shift_status === 'ON-TIME' || !h.shift_status || !h.shift_status.includes('LATE'))
  ).length;
  const punctualityScore = presentDays > 0 ? Math.round((onTimeDays / presentDays) * 100) : 100;

  // Identify today's active punch state
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRecord = history.find(h => h.date === todayStr);
  const isClockedIn = todayRecord?.is_currently_in === true;
  const punchCount = todayRecord?.punch_count || (todayRecord?.punches?.length || 0);

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <span className="text-[11px] sm:text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md uppercase">
            {organization?.name || 'Organization'}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">Welcome, {user?.name}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Employee Self-Service Attendance & Alternating Multi-Punch Hub
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={openFieldModal}
            className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl flex items-center gap-2 text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <Briefcase className="w-4 h-4" />
            <span>Field Site Punch</span>
          </button>
          <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Biometric Consent Active</span>
          </div>
        </div>
      </div>

      {/* Real-time Clocked In / Overdue Punch-Out Banner */}
      {isClockedIn ? (
        <div className="p-4 sm:p-5 rounded-2xl border bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-rose-500/10 border-amber-300 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500 text-white">
                  Action Required: Punch Out Reminder
                </span>
                <span className="text-xs text-slate-500 font-mono">Punch #{punchCount} Active</span>
              </div>
              <p className="text-sm font-bold text-slate-900 mt-1">
                You are currently <span className="text-amber-700">CLOCKED IN</span> from {todayRecord?.last_punch_time || todayRecord?.check_in_time || 'earlier today'}.
              </p>
              <p className="text-xs text-slate-600">
                Please remember to punch out before leaving so your total worked hours ({todayRecord?.total_hours || 0}h confirmed) are logged accurately.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={openFieldModal}
              className="px-3.5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Briefcase className="w-4 h-4" />
              <span>Field Site Punch</span>
            </button>
            <button
              onClick={() => navigate('/attendance/kiosk')}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Clock Out at Kiosk</span>
            </button>
          </div>
        </div>
      ) : todayRecord && (punchCount === 2 || todayRecord.break_status === 'ON_LUNCH_BREAK') ? (
        <div className="p-4 sm:p-5 rounded-2xl border bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-blue-500/10 border-amber-300 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500 text-white">
                  On Lunch Break
                </span>
                <span className="text-xs text-slate-500 font-mono">Punch #2 Logged ({todayRecord?.last_punch_time || 'Lunch Out'})</span>
              </div>
              <p className="text-sm font-bold text-slate-900 mt-1">
                Enjoy your break! Morning session confirmed: <span className="text-emerald-700 font-mono font-bold">{todayRecord?.total_hours || 0} hrs</span>.
              </p>
              <p className="text-xs text-slate-600">
                Break duration is excluded from working hours. Please punch in (Punch #3) when you return to begin your afternoon work session.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => navigate('/attendance/kiosk')}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Resume Work (Punch In)</span>
            </button>
            {todayRecord.punches?.length > 0 && (
              <button
                onClick={() => setSelectedPunches(todayRecord)}
                className="px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs rounded-xl transition-all flex items-center gap-1 cursor-pointer"
              >
                <span>Timeline</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : todayRecord ? (
        <div className="p-3.5 rounded-2xl border bg-slate-50 border-slate-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Shift Inactive:</strong> You completed {punchCount} alternating punches today. Current confirmed work time: <strong>{todayRecord.total_hours} hrs</strong>.
            </span>
          </div>
          {todayRecord.punches?.length > 0 && (
            <button
              onClick={() => setSelectedPunches(todayRecord)}
              className="text-blue-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              View Punch Timeline <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : null}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5 sm:gap-4">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Days Present</div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900">{presentDays}</div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5 sm:gap-4">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Total Hours Logged</div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-600">{totalHours.toFixed(1)} hrs</div>
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5 sm:gap-4">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Punctuality Score</div>
            <div className="text-xl sm:text-2xl font-bold text-indigo-600">{punctualityScore}%</div>
          </div>
        </div>
      </div>

      {/* Attendance History Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
        <h3 className="text-sm sm:text-base font-bold text-slate-900 mb-3 sm:mb-4">Recent Attendance Logs</h3>

        {history.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs sm:text-sm">
            No previous punches recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-left text-xs text-slate-600 min-w-[600px]">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">First Check In</th>
                  <th className="p-3">Latest Check Out</th>
                  <th className="p-3">Punches</th>
                  <th className="p-3">Total Hours</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((rec) => {
                  const count = rec.punch_count || (rec.punches?.length || (rec.check_out ? 2 : 1));
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-semibold text-slate-900 font-mono whitespace-nowrap">{rec.date}</td>
                      <td className="p-3 text-slate-800 font-medium whitespace-nowrap">
                        {rec.check_in_time || (rec.check_in ? new Date(rec.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—')}
                      </td>
                      <td className="p-3 text-slate-800 font-medium whitespace-nowrap">
                        {rec.is_currently_in ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] animate-pulse">
                            Clocked In
                          </span>
                        ) : (rec.break_status === 'ON_LUNCH_BREAK' || (count === 2 && rec.date === todayStr)) ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">
                            On Lunch Break
                          </span>
                        ) : rec.check_out_time || (rec.check_out ? new Date(rec.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—')}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {rec.punches && rec.punches.length > 0 ? (
                          <button
                            onClick={() => setSelectedPunches(rec)}
                            className="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-[11px] border border-blue-200 flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <span>{count} Punches</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">{count} Punch</span>
                        )}
                      </td>
                      <td className="p-3 font-semibold text-slate-700 whitespace-nowrap">{rec.total_hours || 0} hrs</td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          rec.status === 'HALF_DAY' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                          rec.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-800' :
                          rec.status === 'LATE' ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {rec.status === 'HALF_DAY' ? 'HALF-DAY (0.5d)' : (rec.shift_status || rec.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Punch Breakdown Modal */}
      {selectedPunches && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Punch Timeline Breakdown • {selectedPunches.date}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Total Confirmed Worked Time: {selectedPunches.total_hours || 0} hrs
                </p>
              </div>
              <button
                onClick={() => setSelectedPunches(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-3">
              {selectedPunches.punches && selectedPunches.punches.length > 0 ? (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {selectedPunches.punches.map((p, idx) => {
                    const pNum = p.punch_number || idx + 1;
                    const pLabel = pNum === 1 ? 'Morning Check-In (Session 1 Start)' :
                                   pNum === 2 ? 'Lunch Break Check-Out (Session 1 End)' :
                                   pNum === 3 ? 'Lunch Return Check-In (Session 2 Start)' :
                                   pNum === 4 ? 'Evening Check-Out (Shift Concluded)' :
                                   p.action === 'CHECK_IN' ? 'Session Start (Punch In)' : 'Session End (Punch Out)';

                    return (
                      <div key={idx} className="relative flex items-start justify-between gap-3 text-xs">
                        <div className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold text-white shadow-sm ${
                          p.action === 'CHECK_IN' ? 'bg-emerald-600' : 'bg-blue-600'
                        }`}>
                          {pNum}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <span>{pLabel}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                              p.action === 'CHECK_IN' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                            }`}>
                              {p.action}
                            </span>
                          </div>
                        <div className="text-slate-500 text-[11px] font-mono mt-0.5">
                          {p.time || (p.timestamp ? new Date(p.timestamp).toLocaleTimeString() : '—')}
                        </div>
                        {p.client_site_name && (
                          <div className="text-[10px] font-bold text-purple-700 mt-0.5">
                            Client Site: {p.client_site_name}
                          </div>
                        )}
                        {p.site_visit_verified && (
                          <div className={`text-[9px] font-mono font-bold mt-0.5 ${
                            p.site_visit_verified === 'VERIFIED_ON_SITE' ? 'text-purple-700' : 'text-red-600'
                          }`}>
                            {p.site_visit_verified === 'VERIFIED_ON_SITE' ? '✓ Verified on Client Site' : '⚠ External Perimeter Violation'}
                            {p.distance_meters != null ? ` (${Math.round(p.distance_meters)}m)` : ''}
                          </div>
                        )}
                        {!p.client_site_name && p.geofence_status && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Location: {p.geofence_status} {p.distance_meters ? `(${p.distance_meters}m)` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No individual punch timeline records for this entry.
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-800">
                <span>Total Accumulated Work Duration</span>
                <span className="text-sm font-mono text-emerald-600">{selectedPunches.total_hours || 0} hrs</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
              <button
                onClick={() => setSelectedPunches(null)}
                className="px-4 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Field Worker Site Visit Modal */}
      {fieldModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-purple-50/70">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-purple-600" />
                <div>
                  <h3 className="text-sm font-bold text-purple-950 uppercase tracking-tight">
                    Field Worker Site Attendance
                  </h3>
                  <p className="text-[11px] text-purple-700">
                    Facial biometrics &amp; live GPS honesty verification
                  </p>
                </div>
              </div>
              <button
                onClick={closeFieldModal}
                className="w-8 h-8 rounded-full bg-white border border-purple-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFieldPunchSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
              {fieldPunchError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{fieldPunchError}</span>
                </div>
              )}

              {fieldPunchResult && (
                <div className={`p-3.5 border rounded-xl text-xs space-y-1 ${
                  fieldPunchResult.site_visit_verified === 'VERIFIED_ON_SITE'
                    ? 'bg-purple-50 border-purple-200 text-purple-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}>
                  <div className="font-bold flex items-center gap-1.5">
                    {fieldPunchResult.site_visit_verified === 'VERIFIED_ON_SITE' ? (
                      <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    )}
                    <span>
                      {fieldPunchResult.site_visit_verified === 'VERIFIED_ON_SITE'
                        ? '✓ Verified On-Site Check-In!'
                        : '⚠ Site Perimeter Violation Logged!'}
                    </span>
                  </div>
                  <div className="text-[11px]">
                    Site: <strong>{fieldPunchResult.client_site_name}</strong> • Punch #{fieldPunchResult.punch_number} ({fieldPunchResult.action})
                  </div>
                  <div className="text-[10px] font-mono opacity-80">
                    Distance: {Math.round(fieldPunchResult.distance_meters)}m from project perimeter
                  </div>
                </div>
              )}

              {/* Site Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Select Designated Client Project Site
                </label>
                {clientSites.length === 0 ? (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                    No active client project sites found. Contact administrator.
                  </div>
                ) : (
                  <select
                    value={selectedSiteId}
                    onChange={(e) => setSelectedSiteId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-purple-500 cursor-pointer"
                  >
                    {clientSites.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.site_name} — {s.client_name || 'Client'} ({s.address})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Live Webcam Preview */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Facial Biometric Scan
                </label>
                <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video flex items-center justify-center border border-slate-200">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  <div className="absolute inset-0 border-2 border-dashed border-purple-400/50 pointer-events-none m-4 rounded-xl flex items-center justify-center">
                    <span className="text-[10px] text-white/70 font-mono bg-black/40 px-2 py-0.5 rounded">
                      Center face in frame
                    </span>
                  </div>
                </div>
              </div>

              {/* Optional Field Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Visit Purpose / Notes (Optional)
                </label>
                <input
                  type="text"
                  value={fieldNotes}
                  onChange={(e) => setFieldNotes(e.target.value)}
                  placeholder="e.g. Scheduled site audit and safety inspection"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeFieldModal}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingFieldPunch || clientSites.length === 0}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {submittingFieldPunch ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying &amp; Punching...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-3.5 h-3.5" />
                      <span>Capture &amp; Punch Site Visit</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
