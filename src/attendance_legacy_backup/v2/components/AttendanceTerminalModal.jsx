import React, { useState, useEffect, useRef } from 'react';
import { 
  ScanFace, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Building2, 
  ShieldCheck, 
  Clock, 
  UserCheck, 
  Camera, 
  X,
  Radio,
  ArrowRight,
  Sparkles,
  ChevronDown,
  MapPin
} from 'lucide-react';
import confetti from 'canvas-confetti';
import api from '../utils/api';
import { faceVectorFromCanvas } from '../utils/faceVector';

// Gentle synthetic audio chime for successful biometric verification
const playSuccessChime = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    // AudioContext may be restricted by browser policy
  }
};

export const AttendanceTerminalModal = ({ isOpen, onClose }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [streamActive, setStreamActive] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [punchMode, setPunchMode] = useState('AUTO'); // 'AUTO', 'CHECK_IN', 'CHECK_OUT'

  // Organization selection (default AUTO / cross-tenant)
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState('AUTO');

  // Verification state
  const [scanStatus, setScanStatus] = useState('IDLE'); // 'IDLE', 'SCANNING', 'SUCCESS', 'ERROR'
  const [punchResult, setPunchResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [countdown, setCountdown] = useState(3);

  // Recent punches feed
  const [recentPunches, setRecentPunches] = useState([]);

  // Fetch public organizations list on mount
  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const res = await api.get('/organizations/public/list');
        setOrganizations(res.data || []);
      } catch (err) {
        console.warn('Failed to load public organizations', err);
      }
    };
    fetchOrgs();
  }, []);

  // Real-time clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch recent punches stream
  const fetchRecentPunches = async () => {
    try {
      const res = await api.get(`/attendance/kiosk-stream?organization_slug_or_id=${encodeURIComponent(selectedOrg || 'AUTO')}`);
      if (Array.isArray(res.data)) {
        setRecentPunches(res.data);
      }
    } catch (err) {
      console.warn('Failed to fetch kiosk stream', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRecentPunches();
    }
  }, [isOpen, selectedOrg]);

  // Camera management
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStreamActive(true);
      }
    } catch (err) {
      console.error('Terminal webcam error:', err);
      setErrorMessage('Unable to access camera. Please allow webcam permissions in your browser.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      setStreamActive(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      resetScanner();
    }
    return () => stopCamera();
  }, [isOpen]);

  // Countdown timer on successful punch
  useEffect(() => {
    let timer;
    if (scanStatus === 'SUCCESS') {
      setCountdown(3);
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            resetScanner();
            return 3;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [scanStatus]);

  // Spacebar shortcut to punch
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.code === 'Space' && scanStatus === 'IDLE') {
        e.preventDefault();
        triggerPunch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, scanStatus, selectedOrg, punchMode]);

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const getDeviceLocation = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ latitude: null, longitude: null, accuracy: null });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          });
        },
        () => resolve({ latitude: null, longitude: null, accuracy: null }),
        { enableHighAccuracy: true, timeout: 4000, maximumAge: 30000 }
      );
    });
  };

  const triggerPunch = async () => {
    if (scanStatus === 'SCANNING') return;
    const frame = captureFrame();
    if (!frame) {
      setErrorMessage('Camera frame not available. Ensure camera is running.');
      return;
    }

    // Face vector is computed in the browser from the captured frame (no photo is uploaded).
    const face = faceVectorFromCanvas(canvasRef.current);
    if (!face.vector) {
      setScanStatus('ERROR');
      setErrorMessage(face.error);
      setTimeout(() => {
        setScanStatus('IDLE');
        setErrorMessage('');
      }, 3500);
      return;
    }

    setScanStatus('SCANNING');
    setErrorMessage('');

    try {
      const coords = await getDeviceLocation();
      const res = await api.post('/attendance/kiosk-punch', {
        organization_slug_or_id: selectedOrg === 'AUTO' ? null : selectedOrg,
        face_embedding: face.vector,
        punch_type: punchMode,
        liveness_challenge_response: 'VERIFIED',
        kiosk_id: 'public-signin-terminal',
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy
      });

      const data = res.data;
      setPunchResult(data);
      setScanStatus('SUCCESS');

      // Visual confetti & audio chime
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
      playSuccessChime();

      // Prepend to recent punches stream
      const fn = data.employee_name || 'Staff';
      const initials = fn.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
      const punchNum = data.punch_number || data.punch_count || 1;
      const opLabel = `PUNCH #${punchNum} [${data.action === 'CHECK_IN' ? 'IN' : 'OUT'}]`;
      const newEntry = {
        id: 'p-' + Date.now(),
        employee_name: data.employee_name,
        employee_code: data.employee_code,
        department: data.department || 'Operations',
        time: data.timestamp,
        operation: opLabel,
        is_in: data.action === 'CHECK_IN',
        avatar: initials,
        entry_distance: data.entry_distance || (data.distance_meters != null ? `${Math.round(data.distance_meters)}m` : '0m (On-Site)'),
        distance_meters: data.distance_meters
      };
      setRecentPunches(prev => [newEntry, ...prev.slice(0, 8)]);

    } catch (err) {
      setScanStatus('ERROR');
      const detail = err.response?.data?.detail || 'Face not recognized. Please center face with good lighting.';
      setErrorMessage(detail);
      setTimeout(() => {
        setScanStatus('IDLE');
        setErrorMessage('');
      }, 3500);
    }
  };

  const resetScanner = () => {
    setScanStatus('IDLE');
    setPunchResult(null);
    setErrorMessage('');
  };

  if (!isOpen) return null;

  const formattedDayOfWeek = currentTime.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const formattedDate = currentTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  const formattedTimeString = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl sm:rounded-2xl rounded-none shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-full sm:h-auto sm:max-h-[96vh]">
        
        {/* Top Terminal Bar */}
        <div className="bg-slate-900 text-white px-3 sm:px-6 py-3 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs font-bold shrink-0">
              <ScanFace className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h2 className="text-xs sm:text-base font-extrabold tracking-tight truncate">
                  Attendance Terminal
                </h2>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[9px] sm:text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  ONLINE
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 font-mono">
                Multi-Tenant Biometric Punch
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Real-time digital clock */}
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-sm sm:text-base font-black font-mono text-cyan-400 tracking-wider">
                {formattedTimeString}
              </span>
              <span className="text-[10px] font-mono text-slate-400 font-semibold">
                {formattedDayOfWeek} • {formattedDate}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Exit Terminal and Return to Sign In"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Controls & Org Selector Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-3 sm:px-6 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 shrink-0">
          {/* Punch Mode Selector (Horizontal Scrollable on mobile) */}
          <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl shadow-2xs overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setPunchMode('AUTO')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                punchMode === 'AUTO'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Auto Punch
            </button>
            <button
              type="button"
              onClick={() => setPunchMode('CHECK_IN')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                punchMode === 'CHECK_IN'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Punch In
            </button>
            <button
              type="button"
              onClick={() => setPunchMode('CHECK_OUT')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                punchMode === 'CHECK_OUT'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Punch Out
            </button>
          </div>

          {/* Organization Filter */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-[10px] sm:text-[11px] font-mono text-slate-400 uppercase font-bold shrink-0">ORG:</span>
            <div className="relative flex-1 sm:flex-none">
              <select
                value={selectedOrg}
                onChange={(e) => setSelectedOrg(e.target.value)}
                className="w-full sm:w-auto bg-white border border-slate-200 rounded-xl pl-2.5 pr-8 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
              >
                <option value="AUTO">✨ Auto-Detect (All Registered)</option>
                {organizations.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Main Terminal Viewport Grid */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Optical Camera & Trigger (8 Cols) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            
            {/* Viewport Frame with Cybernetic Scanner Brackets */}
            <div className="relative w-full aspect-[4/3] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-xl flex items-center justify-center">
              {/* Sensor telemetry banner */}
              <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-slate-900/85 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-700 text-[10px] font-mono text-slate-300">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold tracking-wider text-slate-200">OPTICAL SENSOR ACTIVE</span>
                <span className="text-slate-500">|</span>
                <span className="text-cyan-400 font-mono">30 FPS</span>
              </div>

              {/* Mode badge */}
              <div className="absolute top-3 right-3 z-20 px-2.5 py-1 rounded-lg bg-slate-900/85 backdrop-blur-md border border-slate-700 text-[10px] font-mono font-bold text-cyan-300 uppercase">
                MODE: {punchMode}
              </div>

              {/* Cybernetic HUD Corner Brackets */}
              <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-cyan-400 z-10" />
              <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-cyan-400 z-10" />
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-cyan-400 z-10" />
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-cyan-400 z-10" />

              {/* Live Video Feed */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />

              {/* Laser Scanline Animation */}
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#00e5ff] to-transparent shadow-[0_0_12px_#00e5ff] animate-scanline pointer-events-none" />

              {/* Center Face Reticle Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className={`w-44 h-56 sm:w-52 sm:h-64 border-2 border-dashed rounded-full flex items-center justify-center transition-all duration-300 ${
                  scanStatus === 'SCANNING' ? 'border-amber-400 animate-pulse scale-105' :
                  scanStatus === 'SUCCESS' ? 'border-emerald-400 scale-105' :
                  scanStatus === 'ERROR' ? 'border-red-400' :
                  'border-cyan-400/60'
                }`}>
                  <div className="w-4 h-4 border-t-2 border-l-2 border-cyan-400 absolute top-2 left-6" />
                  <div className="w-4 h-4 border-t-2 border-r-2 border-cyan-400 absolute top-2 right-6" />
                  <div className="w-4 h-4 border-b-2 border-l-2 border-cyan-400 absolute bottom-2 left-6" />
                  <div className="w-4 h-4 border-b-2 border-r-2 border-cyan-400 absolute bottom-2 right-6" />
                </div>
              </div>

              {/* Success Result Overlay */}
              {scanStatus === 'SUCCESS' && punchResult && (
                <div className="absolute inset-0 z-30 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-200">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>

                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold font-mono uppercase mb-2 ${
                    punchResult.action === 'CHECK_IN'
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'bg-blue-600 text-white shadow-md'
                  }`}>
                    {`✓ PUNCH #${punchResult.punch_number || 1}: ${punchResult.action === 'CHECK_IN' ? 'CHECKED IN' : 'CHECKED OUT'}`}
                  </span>

                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    {punchResult.employee_name}
                  </h3>

                  <p className="text-xs text-slate-300 font-mono mt-1">
                    Badge ID: <span className="text-cyan-400 font-bold">{punchResult.employee_code}</span> • {punchResult.department}
                  </p>

                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-slate-300">
                    <Building2 className="w-3.5 h-3.5 text-blue-400" />
                    <span className="font-semibold text-white">{punchResult.organization_name}</span>
                    <span className="text-slate-500">•</span>
                    <span className={`font-bold font-mono text-[11px] ${
                      punchResult.shift_status === 'LATE' ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {punchResult.shift_status}
                    </span>
                    {punchResult.employment_type && punchResult.employment_type !== 'FULL_TIME' && (
                      <>
                        <span className="text-slate-500">•</span>
                        <span className="font-mono text-[10px] text-cyan-400 font-semibold">
                          {punchResult.employment_type.replace('_', ' ')}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="mt-4 text-xs font-mono text-slate-400">
                    Next employee in <span className="text-cyan-400 font-bold text-sm">{countdown}s</span>...
                  </div>
                </div>
              )}

              {/* Scanning Overlay */}
              {scanStatus === 'SCANNING' && (
                <div className="absolute inset-0 z-30 bg-slate-950/70 backdrop-blur-xs flex flex-col items-center justify-center text-center p-4">
                  <RefreshCw className="w-10 h-10 text-cyan-400 animate-spin mb-3" />
                  <div className="text-base font-bold text-white tracking-wide">
                    Verifying Face Biometrics...
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-1">
                    Matching against enrolled organization records
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Big Trigger Punch Button */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={triggerPunch}
                disabled={scanStatus === 'SCANNING'}
                className="w-full sm:flex-1 py-3.5 px-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-800 disabled:opacity-60 text-white rounded-xl text-sm font-black shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <Camera className="w-5 h-5" />
                <span>PUNCH ATTENDANCE NOW</span>
                <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded ml-2 font-normal hidden sm:inline">
                  OR PRESS SPACE
                </span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </div>

          {/* Right Column: Live Punch Stream Feed (4 Cols) */}
          <div className="lg:col-span-4 bg-slate-50 rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Recent Gate Punches
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 font-bold">LIVE FEED</span>
              </div>

              {recentPunches.length > 0 ? (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {recentPunches.map((p) => {
                    const isIn = p.is_in ?? (p.operation?.includes('IN') || p.action === 'CHECK_IN');
                    return (
                      <div key={p.id || p.time} className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-xs shrink-0 ${
                            isIn ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {p.avatar || 'EM'}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">
                              {p.employee_name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate flex items-center gap-1.5 mt-0.5">
                              <span>{p.employee_code} • {p.department}</span>
                              <span className="text-slate-300">•</span>
                              <span className="inline-flex items-center gap-0.5 text-emerald-600 font-bold">
                                <MapPin className="w-2.5 h-2.5 shrink-0" />
                                <span>{p.entry_distance || (p.distance_meters != null ? `${Math.round(p.distance_meters)}m` : '0m (On-Site)')}</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`inline-block text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            isIn ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {isIn ? 'PUNCH IN' : 'PUNCH OUT'}
                          </span>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            {p.time}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <Camera className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-semibold text-slate-600">No punches recorded yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Look at the camera and click Punch Attendance</p>
                </div>
              )}
            </div>

            {/* Instruction Footer */}
            <div className="pt-3 mt-3 border-t border-slate-200 text-[11px] text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Biometric verification syncs dynamically with your organisation admin UI.</span>
            </div>
          </div>
        </div>

        {/* Hidden Canvas for Frame Extraction */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
};
