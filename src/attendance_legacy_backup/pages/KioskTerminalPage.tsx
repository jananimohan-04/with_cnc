import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  ArrowRight,
  ShieldCheck,
  MapPin,
  Maximize2,
  Minimize2,
  Sparkles,
  UserCheck,
  Building2,
  Activity,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { attendanceApi, KioskPunchResult } from '../api';
import { extract128VectorFromCanvas } from '../engine/faceMeshEngine';
import { getRandomChallenge, LivenessChallenge, evaluateLivenessQuality } from '../engine/livenessDetector';
import { playSuccessChime, playWarningChime, speakGreeting } from '../engine/audioChime';
import { useAuth } from '@/contexts/AuthContext';

export function KioskTerminalPage() {
  const { company } = useAuth();
  const companyId = company?.id || '';

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [punchMode, setPunchMode] = useState<'AUTO' | 'CHECK_IN' | 'CHECK_OUT'>('AUTO');
  const [isScanning, setIsScanning] = useState(false);
  const [lastResult, setLastResult] = useState<KioskPunchResult | null>(null);
  const [recentPunches, setRecentPunches] = useState<any[]>([]);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>({
    type: 'info',
    text: 'Center your face inside the guide oval to clock in or out.',
  });
  const [challenge, setChallenge] = useState<LivenessChallenge>(getRandomChallenge());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scanCooldown, setScanCooldown] = useState(false);

  // Digital clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchRecentPunches = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await attendanceApi.getKioskStream(companyId);
      if (res.data && Array.isArray(res.data)) {
        setRecentPunches(res.data);
      }
    } catch {
      // silent
    }
  }, [companyId]);

  useEffect(() => {
    fetchRecentPunches();
    const interval = setInterval(fetchRecentPunches, 8000);
    return () => clearInterval(interval);
  }, [fetchRecentPunches]);

  // Web camera initialization
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraActive(true);
        };
      }
    } catch (err: any) {
      console.error('Camera stream error:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : 'Could not access optical camera. Please ensure a webcam or camera is connected.'
      );
      setCameraActive(false);
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startCamera]);

  // Capture & Verify Face Frame
  const triggerScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isScanning || scanCooldown || !cameraActive) return;
    if (!companyId) {
      setFeedbackMsg({ type: 'error', text: 'No active company selected.' });
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Extract 128-d vector client-side
    const extraction = extract128VectorFromCanvas(canvas);
    if (!extraction.quality.faceDetected) {
      setFeedbackMsg({
        type: 'info',
        text: 'No face clearly detected. Please position your face inside the guide oval.',
      });
      return;
    }

    // Liveness sharpness filter
    const liveness = evaluateLivenessQuality(extraction.quality.sharpness, extraction.quality.brightness);
    if (!liveness.passed) {
      setFeedbackMsg({
        type: 'error',
        text: liveness.reason || 'Frame quality low. Please hold steady in good lighting.',
      });
      return;
    }

    setIsScanning(true);
    setFeedbackMsg({ type: 'info', text: 'Analyzing face biometric signature…' });

    try {
      const punchRes = await attendanceApi.punchKiosk({
        company_id: companyId,
        vector: extraction.vector,
        punch_type: punchMode,
        kiosk_id: 'tablet-kiosk-main',
      });

      // Successful punch!
      playSuccessChime();
      speakGreeting(`Welcome ${punchRes.employee.first_name}, ${punchRes.action === 'CHECK_IN' ? 'Check In' : 'Check Out'} confirmed.`);

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
      });

      setLastResult(punchRes);
      setFeedbackMsg({
        type: 'success',
        text: punchRes.message,
      });

      // Add to recent punches
      const newEntry = {
        id: 'p-' + Date.now(),
        employee_name: `${punchRes.employee.first_name} ${punchRes.employee.last_name}`,
        employee_code: punchRes.employee.employee_code,
        department: punchRes.employee.department || 'Operations',
        time: punchRes.time,
        operation: punchRes.action === 'CHECK_IN' ? 'PUNCH [IN]' : 'PUNCH [OUT]',
        is_in: punchRes.action === 'CHECK_IN',
        avatar: `${punchRes.employee.first_name[0]}${punchRes.employee.last_name[0] || ''}`.toUpperCase(),
        entry_distance: '0m (On-Site)',
        distance_meters: 0,
      };
      setRecentPunches((prev) => [newEntry, ...prev.slice(0, 9)]);

      // 4-second cooldown before next scan
      setScanCooldown(true);
      setTimeout(() => {
        setLastResult(null);
        setScanCooldown(false);
        setChallenge(getRandomChallenge());
        setFeedbackMsg({ type: 'info', text: 'Next employee: Please face the camera to clock in or out.' });
        fetchRecentPunches();
      }, 4000);
    } catch (err: any) {
      playWarningChime();
      const msg = err.message || 'Face not recognized. Ensure you are enrolled.';
      setFeedbackMsg({ type: 'error', text: msg });
    } finally {
      setIsScanning(false);
    }
  }, [cameraActive, companyId, isScanning, punchMode, scanCooldown, fetchRecentPunches]);

  // Automated scanning loop every 1.8 seconds when active
  useEffect(() => {
    if (!cameraActive || scanCooldown || isScanning) return;
    const interval = setInterval(() => {
      triggerScan();
    }, 1800);
    return () => clearInterval(interval);
  }, [cameraActive, isScanning, scanCooldown, triggerScan]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-between selection:bg-blue-600 selection:text-white relative overflow-hidden">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Kiosk Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/90 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-lg shadow-lg shadow-blue-500/30">
            A
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Argus AI Attendance Kiosk
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                LIVE TERMINAL
              </span>
            </h1>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-500" />
              {company?.company_name || 'Argus Technologies'} &bull; Terminal 01 (Main Gate)
            </p>
          </div>
        </div>

        {/* Live Clock & Fullscreen Toggle */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-mono font-bold tracking-tight text-white flex items-center gap-2 justify-end">
              <Clock className="w-5 h-5 text-blue-500 animate-pulse" />
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-xs text-slate-400">
              {currentTime.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Kiosk Center Area with Split View: Camera (Left) + Recent Stream (Right) */}
      <main className="flex-1 flex flex-col xl:flex-row items-center justify-center p-4 xl:p-8 gap-6 relative z-10 max-w-7xl mx-auto w-full">
        {/* Left: Camera Scanner Box */}
        <div className="w-full max-w-xl flex flex-col items-center">
          {/* Mode Switcher Tabs */}
          <div className="mb-4 inline-flex items-center gap-1.5 p-1 rounded-2xl bg-slate-800/80 border border-slate-700/60 shadow-xl backdrop-blur-md">
            {(['AUTO', 'CHECK_IN', 'CHECK_OUT'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setPunchMode(mode)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  punchMode === mode
                    ? mode === 'CHECK_IN'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                      : mode === 'CHECK_OUT'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-white text-slate-900 shadow-lg'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                {mode === 'AUTO' ? '⚡ Auto Shift' : mode === 'CHECK_IN' ? '🟢 Clock IN' : '🔴 Clock OUT'}
              </button>
            ))}
          </div>

          {/* Camera Viewfinder Box with Target Reticle */}
          <div className="relative w-full aspect-[4/3] rounded-3xl overflow-hidden bg-slate-950 border-2 border-slate-800 shadow-2xl flex items-center justify-center">
            {cameraError ? (
              <div className="p-6 text-center max-w-sm">
                <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
                <h3 className="text-base font-bold text-white mb-1">Camera Offline</h3>
                <p className="text-xs text-slate-400 mb-4">{cameraError}</p>
                <button
                  onClick={startCamera}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-600 text-white text-xs font-bold transition-all flex items-center gap-2 mx-auto cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reconnect Camera
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />

                {/* Facial Target Oval Reticle Overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div
                    className={`w-60 h-72 rounded-[48%] border-2 transition-all duration-300 relative flex items-center justify-center ${
                      lastResult
                        ? 'border-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.5)] bg-emerald-500/10'
                        : isScanning
                        ? 'border-blue-400 shadow-[0_0_30px_rgba(251,146,60,0.4)] animate-pulse'
                        : 'border-white/40 shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                    }`}
                  >
                    {/* Corner Guides */}
                    <span className="absolute top-2 left-6 w-5 h-5 border-t-2 border-l-2 border-current rounded-tl" />
                    <span className="absolute top-2 right-6 w-5 h-5 border-t-2 border-r-2 border-current rounded-tr" />
                    <span className="absolute bottom-2 left-6 w-5 h-5 border-b-2 border-l-2 border-current rounded-bl" />
                    <span className="absolute bottom-2 right-6 w-5 h-5 border-b-2 border-r-2 border-current rounded-br" />

                    {/* Central scan beam */}
                    {isScanning && (
                      <div className="absolute inset-x-4 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-bounce" />
                    )}
                  </div>
                </div>

                {/* Dynamic Liveness Challenge Pill */}
                <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
                  <div className="px-3 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/80 text-xs font-medium text-slate-200 flex items-center gap-2 shadow-lg">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>{challenge.instruction}</span>
                  </div>
                </div>

                {/* Instant Success Modal Popup (4s cooldown) */}
                {lastResult && (
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-200">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mb-3 shadow-xl shadow-emerald-500/20">
                      <CheckCircle2 className="w-10 h-10" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1">
                      {lastResult.action === 'CHECK_IN' ? '🟢 Clocked IN' : '🔴 Clocked OUT'}
                    </span>
                    <h2 className="text-2xl font-extrabold text-white mb-0.5">
                      {lastResult.employee.first_name} {lastResult.employee.last_name}
                    </h2>
                    <p className="text-xs text-slate-400 mb-3">
                      ID: {lastResult.employee.employee_code} &bull; {lastResult.employee.department}
                    </p>

                    <div className="inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase">Time</span>
                        <span className="font-mono font-bold text-white">{lastResult.time}</span>
                      </div>
                      <div className="h-6 w-px bg-slate-800" />
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase">Total Today</span>
                        <span className="font-mono font-bold text-blue-500">{lastResult.total_hours} hrs</span>
                      </div>
                      <div className="h-6 w-px bg-slate-800" />
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase">Match Score</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {Math.round(lastResult.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bottom Live Feedback Bar */}
          <div className="mt-4 w-full">
            <div
              className={`p-3 rounded-2xl border text-xs font-medium text-center transition-all ${
                feedbackMsg?.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : feedbackMsg?.type === 'error'
                  ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                  : 'bg-slate-800/60 border-slate-700/80 text-slate-300'
              }`}
            >
              {feedbackMsg?.text}
            </div>
          </div>
        </div>

        {/* Right: Recent Punches Stream Box */}
        <div className="w-full xl:w-80 bg-slate-800/70 border border-slate-700/80 rounded-3xl p-4 shadow-xl backdrop-blur-md flex flex-col h-full max-h-[500px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-700/70">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Live Punch Stream
              </h3>
            </div>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              Real-time
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-700/50 mt-2 pr-1 space-y-1">
            {recentPunches.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs italic">
                Awaiting first biometric punch today...
              </div>
            ) : (
              recentPunches.map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center shrink-0 text-[11px] ${
                        p.is_in
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-blue-600/20 text-blue-500 border border-blue-500/30'
                      }`}
                    >
                      {p.avatar || 'EM'}
                    </div>
                    <div className="min-w-0 truncate">
                      <div className="font-bold text-slate-200 truncate">{p.employee_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {p.employee_code} &bull; {p.department}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono text-[11px] text-slate-300 font-semibold">{p.time}</div>
                    <div
                      className={`text-[9px] font-bold uppercase tracking-wider ${
                        p.is_in ? 'text-emerald-400' : 'text-blue-500'
                      }`}
                    >
                      {p.operation || (p.is_in ? 'IN' : 'OUT')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Bottom Kiosk Footer */}
      <footer className="px-6 py-3 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Biometric Sensor Active &bull; 128-d Vector Inference &bull; Anti-Spoofing Enabled</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/attendance/dashboard"
            className="hover:text-white transition-colors flex items-center gap-1 text-slate-400"
          >
            Admin Dashboard <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </footer>
    </div>
  );
}
