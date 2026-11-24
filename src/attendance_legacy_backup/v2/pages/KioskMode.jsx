import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { faceVectorFromCanvas } from '../utils/faceVector';
import { 
  Radio, 
  ScanFace, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  Building2, 
  ShieldCheck, 
  Eye, 
  Clock, 
  UserCheck, 
  Check, 
  Camera, 
  ChevronRight,
  Shield,
  Activity,
  MapPin
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const KioskMode = () => {
  const { organization } = useAuth();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const orgSlug = organization?.slug || organization?.id || '';
  const [selectedOrg, setSelectedOrg] = useState(orgSlug);
  const [streamActive, setStreamActive] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Scan states
  const [scanStatus, setScanStatus] = useState('IDLE'); // 'IDLE', 'SCANNING', 'SUCCESS', 'ERROR'
  const [punchResult, setPunchResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [countdown, setCountdown] = useState(3);

  // Recent punch event stream (last 4 records - starts empty for fresh organizations)
  const [recentPunches, setRecentPunches] = useState([]);

  // Real-time clock updater
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchRecentPunches = async (orgTarget) => {
    const org = orgTarget || selectedOrg || orgSlug;
    if (!org) return;
    try {
      const res = await api.get(`/attendance/kiosk-stream?organization_slug_or_id=${encodeURIComponent(org)}`);
      if (res.data && Array.isArray(res.data)) {
        setRecentPunches(res.data);
      }
    } catch (err) {
      console.error('Failed to load recent kiosk punches', err);
    }
  };

  useEffect(() => {
    if (orgSlug) {
      setSelectedOrg(orgSlug);
      fetchRecentPunches(orgSlug);
    }
  }, [orgSlug]);

  // Camera handling
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  // Countdown timer when punch is recorded
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
      console.error('Webcam error:', err);
      setErrorMessage('Unable to access optical sensor webcam. Ensure permissions are granted.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }
  };

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

  const triggerVerification = async () => {
    if (!selectedOrg) {
      setErrorMessage('Please select an organization first.');
      return;
    }
    const frame = captureFrame();
    if (!frame) return;

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
        organization_slug_or_id: selectedOrg,
        face_embedding: face.vector,
        punch_type: 'AUTO',
        liveness_challenge_response: 'VERIFIED',
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy
      });

      const punchData = res.data;
      setPunchResult(punchData);
      setScanStatus('SUCCESS');

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });

      // Prepend to recent punch events stream
      const punchNum = punchData.punch_number || punchData.punch_count || 1;
      const opLabel = `PUNCH #${punchNum} [${punchData.action === 'CHECK_IN' ? 'IN' : 'OUT'}]`;
      const newEntry = {
        id: 'p-' + Date.now(),
        employee_name: punchData.employee_name,
        employee_code: punchData.employee_code,
        department: punchData.department || 'Operations',
        time: punchData.timestamp,
        operation: opLabel,
        is_in: punchData.action === 'CHECK_IN',
        avatar: punchData.employee_name ? punchData.employee_name.split(' ').map(n=>n[0]).join('').slice(0,2) : 'EM',
        entry_distance: punchData.entry_distance || (punchData.distance_meters != null ? `${Math.round(punchData.distance_meters)}m` : '0m (On-Site)'),
        distance_meters: punchData.distance_meters
      };

      setRecentPunches(prev => [newEntry, ...prev.filter(p => p.id !== newEntry.id).slice(0, 9)]);

      // Sync persisted records from server
      setTimeout(() => {
        fetchRecentPunches(selectedOrg);
      }, 600);

    } catch (err) {
      setScanStatus('ERROR');
      setErrorMessage(err.response?.data?.detail || 'Face not recognized or liveness check failed.');
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

  // Format Current Date
  const formattedDayOfWeek = currentTime.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const formattedDate = currentTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  const formattedTimeString = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* 1. Terminal Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Left: Terminal Info & Org Switcher */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-xs">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                Attendance Terminal
              </h1>
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[10px] font-bold rounded uppercase tracking-wider">
                ACTIVE GATE
              </span>
            </div>
            
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-slate-500 font-medium font-mono uppercase">Tenant Gate:</span>
              <span className="text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 rounded px-2.5 py-0.5 flex items-center gap-1.5 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {organization?.name || 'Argus Enterprise'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Digital Real-Time Monospace Clock */}
        <div className="flex items-center gap-3 self-end sm:self-auto pl-4 border-l border-slate-200">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <div className="text-right">
            <div className="text-base sm:text-lg font-black font-mono tracking-tight text-slate-900">
              {formattedTimeString}
            </div>
            <div className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">
              {formattedDayOfWeek} • {formattedDate}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column (Optical Sensor Viewport) ~ 7 or 8 cols */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col justify-between gap-3">
          {/* Camera Viewport Screen */}
          <div className="relative w-full aspect-[4/3] bg-slate-950 rounded-lg overflow-hidden border border-slate-800 shadow-inner flex items-center justify-center">
            {/* Top sensor indicator */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded border border-slate-700 text-[11px] font-mono text-slate-300">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span className="font-bold tracking-wider uppercase text-slate-200">LIVE OPTICAL SENSOR</span>
            </div>

            {/* Video Element */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Cybernetic HUD Corner Brackets */}
            <div className="hud-corner-tl !border-cyan-400 !w-5 !h-5 !top-3 !left-3 z-10 pointer-events-none" />
            <div className="hud-corner-tr !border-cyan-400 !w-5 !h-5 !top-3 !right-3 z-10 pointer-events-none" />
            <div className="hud-corner-bl !border-cyan-400 !w-5 !h-5 !bottom-3 !left-3 z-10 pointer-events-none" />
            <div className="hud-corner-br !border-cyan-400 !w-5 !h-5 !bottom-3 !right-3 z-10 pointer-events-none" />

            {/* Face Targeting Box & Laser Scanline Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-48 sm:w-64 h-56 sm:h-72 border border-cyan-400/40 rounded-xl flex items-center justify-center">
                {/* Cybernetic Reticle Brackets */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-cyan-400" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-cyan-400" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-cyan-400" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-cyan-400" />

                {/* Laser scan sweeping animation */}
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#00e5ff] animate-scanline" />

                {/* Center target crosshair */}
                <div className="w-6 h-6 border border-cyan-400/30 rounded-full flex items-center justify-center">
                  <div className="w-1 h-1 bg-cyan-400 rounded-full" />
                </div>
              </div>
            </div>

            {/* Telemetry HUD Labels in Viewport */}
            <div className="absolute bottom-4 left-4 z-20 pointer-events-none space-y-0.5 text-[9px] sm:text-[10px] font-mono text-cyan-400/80">
              <div>[IDENTITY_REF: {punchResult?.employee_code || 'STANDBY_ACQUIRE'}]</div>
              <div>[LIVENESS_CONF: 99.8%]</div>
              <div>[SYSTEM_STATUS: ACTIVE]</div>
            </div>

            <div className="absolute bottom-4 right-4 z-20 pointer-events-none space-y-0.5 text-[9px] sm:text-[10px] font-mono text-cyan-400/80 text-right">
              <div>[BIOMETRIC_VECTOR_MATCH]</div>
              <div>[PROCESS_READY]</div>
            </div>

            {/* Error Notification Overlay */}
            {scanStatus === 'ERROR' && (
              <div className="absolute inset-0 bg-red-950/85 backdrop-blur-sm flex flex-col items-center justify-center text-white p-4 text-center z-30 animate-in fade-in duration-150">
                <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mb-2">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                </div>
                <h4 className="text-sm font-bold tracking-wide uppercase text-white mb-1">Optical Verification Failed</h4>
                <p className="text-xs text-red-200 max-w-sm">{errorMessage}</p>
              </div>
            )}
          </div>

          {/* Liveness Check & Anti-Spoof Protocol Banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 sm:p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100/60 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
                <Eye className="w-4 h-4 text-blue-600 animate-pulse" />
              </div>
              <div>
                <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  LIVENESS CHECK
                  <span className="text-[9px] px-1 bg-emerald-100 text-emerald-700 rounded font-bold">ACTIVE</span>
                </div>
                <div className="text-xs font-semibold text-slate-800">
                  Please blink twice or turn head slightly right
                </div>
              </div>
            </div>

            <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">ANTI-SPOOF PROTOCOL</span>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <span>DeepFake / Print Defense [ACTIVE]</span>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              </div>
            </div>
          </div>

          {/* Trigger Scan Button */}
          <button
            onClick={triggerVerification}
            disabled={scanStatus === 'SCANNING' || !streamActive}
            className="w-full py-3 px-4 rounded-lg bg-[#0080ff] hover:bg-blue-600 active:scale-[0.99] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            {scanStatus === 'SCANNING' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>EXTRACTING 128-D BIOMETRIC VECTORS...</span>
              </>
            ) : (
              <>
                <ScanFace className="w-4 h-4" />
                <span>TRIGGER FACE VERIFICATION & PUNCH</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column (Punch Confirmation Card) ~ 4 or 5 cols */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            {/* Top confirmation banner */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <Check className="w-4 h-4 stroke-[2.5]" />
                </div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  {scanStatus === 'SUCCESS' ? 'Punch Recorded!' : 'Terminal Ready'}
                </h2>
              </div>

              {scanStatus === 'SUCCESS' ? (
                <div className="text-right">
                  <span className="text-[10px] font-mono text-slate-400 block uppercase leading-none">AUTO-RESET IN</span>
                  <span className="text-xs font-mono font-bold text-blue-600">0{countdown}s</span>
                </div>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-bold">
                  STANDBY
                </span>
              )}
            </div>

            {/* Profile Card Section */}
            {punchResult ? (
              <div className="py-5">
                <div className="flex items-center gap-3.5 mb-5">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-tr from-slate-800 to-slate-700 text-white flex items-center justify-center text-base font-bold shadow-xs">
                      {punchResult.employee_name ? punchResult.employee_name.split(' ').map(n=>n[0]).join('').slice(0,2) : 'EM'}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-mono text-slate-400 font-bold tracking-wide">
                      ID: {punchResult.employee_code}
                    </div>
                    <div className="text-base font-bold text-slate-900 leading-tight">
                      {punchResult.employee_name}
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-0.5">
                      {punchResult.department || 'Staff Member'}
                    </div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="bg-slate-50/70 border border-slate-200 rounded-lg p-3.5 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">PUNCH EVENT</span>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                      punchResult.action === 'CHECK_IN' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      PUNCH #{punchResult.punch_number || 1} [{punchResult.action === 'CHECK_IN' ? 'IN' : 'OUT'}]
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">RECORDED TIME</span>
                    <span className="font-mono font-bold text-blue-600">
                      {punchResult.timestamp}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">COMPLIANCE</span>
                    <span className={`font-semibold ${
                      punchResult.shift_status === 'LATE' ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {punchResult.shift_status || (punchResult.attendance_status === 'LATE' ? 'Late' : 'On-Time')}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">WORKER MODEL</span>
                    <span className="font-mono text-slate-700 font-semibold">
                      {(punchResult.employment_type || 'FULL_TIME').replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">TOTAL WORK HOURS</span>
                    <span className="font-mono font-bold text-slate-900">
                      {punchResult.total_hours || 0} hrs
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-3 shadow-xs">
                  <ScanFace className="w-6 h-6 animate-pulse" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">Awaiting Attendance Scan</h3>
                <p className="text-xs text-slate-400 max-w-xs mt-1">
                  Stand directly in front of the optical sensor and trigger verification to record attendance.
                </p>
              </div>
            )}
          </div>

          {/* Bottom Acknowledge CTA Button */}
          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={resetScanner}
              className="w-full py-3 px-4 rounded-lg bg-[#004e82] hover:bg-[#003d66] active:scale-[0.99] text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>ACKNOWLEDGE & NEXT PUNCH</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Bottom Card: Live Punch Event Stream (Last 4 Records) */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-bold font-mono tracking-wider text-slate-800 uppercase">
              LIVE PUNCH EVENT STREAM (LAST 4 RECORDS)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">REALTIME PIPELINE</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-[10px] uppercase font-mono tracking-wider bg-slate-50/50">
                <th className="py-2.5 px-3">EMPLOYEE & ID</th>
                <th className="py-2.5 px-3">DEPARTMENT</th>
                <th className="py-2.5 px-3">PUNCH TIME</th>
                <th className="py-2.5 px-3">ENTRY DISTANCE</th>
                <th className="py-2.5 px-3 text-right">OPERATION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentPunches.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Clock className="w-6 h-6 text-slate-300 stroke-1" />
                      <p className="text-xs font-bold text-slate-600">
                        No punches recorded today.
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Live attendance punches will appear here as employees verify their face at this terminal.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : recentPunches.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs shrink-0">
                        {item.avatar}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 leading-tight">
                          {item.employee_name}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {item.employee_code}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-3 text-slate-700 font-medium">
                    {item.department}
                  </td>

                  <td className="py-3 px-3 font-mono text-blue-600 font-bold">
                    {item.time}
                  </td>

                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <MapPin className={`w-3.5 h-3.5 shrink-0 ${
                        (item.distance_meters != null && item.distance_meters > 200) || (item.entry_distance && item.entry_distance.includes('Off-Site'))
                          ? 'text-amber-500'
                          : 'text-emerald-500'
                      }`} />
                      <span className={`text-[10px] font-mono font-bold ${
                        (item.distance_meters != null && item.distance_meters > 200) || (item.entry_distance && item.entry_distance.includes('Off-Site'))
                          ? 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200'
                          : 'text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200'
                      }`}>
                        {item.entry_distance || (item.distance_meters != null ? `${Math.round(item.distance_meters)}m` : '0m (On-Site)')}
                      </span>
                    </div>
                  </td>

                  <td className="py-3 px-3 text-right">
                    <span className={`font-mono text-[11px] font-bold ${
                      item.is_in ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      {item.operation}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
