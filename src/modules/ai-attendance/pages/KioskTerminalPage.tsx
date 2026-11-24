import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, CheckCircle2, AlertTriangle, ArrowLeft, ShieldCheck, Volume2, VolumeX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { extract128VectorFromCanvas, checkLiveness } from '../engine/faceVectorEngine';
import { findBestMatch } from '../engine/cosineSimilarity';
import { audioChime } from '../engine/audioChime';
import { employeeService } from '../services/employeeService';
import { attendanceService } from '../services/attendanceService';
import type { AttendanceEmployee } from '../types/employee.types';

interface KioskProps {
  companyId: string;
}

export const KioskTerminalPage: React.FC<KioskProps> = ({ companyId }) => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [streamActive, setStreamActive] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [lastMatch, setLastMatch] = useState<{
    name: string;
    code: string;
    action: string;
    time: string;
    confidence: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load enrolled employee face vectors
  useEffect(() => {
    async function loadEnrolled() {
      try {
        const list = await employeeService.getEmployees(companyId);
        const enrolled = list.filter((e) => e.face_embeddings && e.face_embeddings.length > 0 && e.is_active);
        setEmployees(enrolled);
      } catch (e) {
        console.error('Failed to load employees for kiosk:', e);
      }
    }
    loadEnrolled();
  }, [companyId]);

  // Start webcam
  const startCamera = useCallback(async () => {
    try {
      setErrorMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setStreamActive(true);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setErrorMessage('Camera access denied or unavailable. Please enable camera permissions.');
      setStreamActive(false);
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

  // Main recognition loop
  useEffect(() => {
    if (!streamActive || !scanning || employees.length === 0 || isProcessing) return;

    let prevFrame: ImageData | null = null;
    const interval = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current || isProcessing) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.readyState !== 4) return;

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const currFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Check temporal motion liveness
      const liveness = checkLiveness(prevFrame, currFrame);
      prevFrame = currFrame;
      if (!liveness.isLive) return;

      // Extract 128-d deep vector
      const liveVector = extract128VectorFromCanvas(video);

      // Match against company registered vectors
      const match = findBestMatch(
        liveVector,
        employees.map((e) => ({
          id: e.id,
          employee_name: e.employee_name || e.employee_code,
          employee_code: e.employee_code,
          face_embeddings: e.face_embeddings,
        })),
        0.70,
        0.08
      );

      if (match.matched && match.employee) {
        setIsProcessing(true);
        if (audioEnabled) audioChime.playSuccessChime();

        try {
          const res = await attendanceService.recordPunch(companyId, {
            employeeId: match.employee.id,
            confidence: match.confidence,
            verificationMode: 'FACE_AI',
            kioskId: 'tablet-terminal-1',
          });

          setLastMatch({
            name: match.employee.employee_name,
            code: match.employee.employee_code,
            action: res.action === 'CHECK_IN' ? 'CHECK-IN' : 'CHECK-OUT',
            time: new Date().toLocaleTimeString(),
            confidence: Math.round(match.confidence * 100),
          });

          // Pause briefly to display confirmation card
          setTimeout(() => {
            setIsProcessing(false);
          }, 3500);
        } catch (err) {
          console.error('Punch record error:', err);
          setIsProcessing(false);
        }
      }
    }, 700);

    return () => clearInterval(interval);
  }, [streamActive, scanning, employees, companyId, audioEnabled, isProcessing]);

  return (
    <div className="fixed inset-0 bg-slate-950 text-white flex flex-col z-50 overflow-hidden font-sans">
      {/* Top Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/attendance')}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-400">ARGUS CNC™</span>
              <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded font-mono font-bold">
                FACE AI TERMINAL
              </span>
            </div>
            <h2 className="text-sm font-semibold text-slate-200">Zero-Image Contactless Biometric Kiosk</h2>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            title={audioEnabled ? 'Mute audio chime' : 'Enable audio chime'}
          >
            {audioEnabled ? <Volume2 className="w-5 h-5 text-emerald-400" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
          </button>
          <div className="text-right">
            <span className="text-xs font-mono text-emerald-400 font-bold">● ONLINE</span>
            <p className="text-[11px] text-slate-400">{employees.length} Enrolled Profiles</p>
          </div>
        </div>
      </div>

      {/* Main Camera Area */}
      <div className="flex-1 relative flex items-center justify-center bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover -scale-x-100"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Circular Face Reticle Guide */}
        <div className="relative z-10 flex flex-col items-center">
          <div
            className={`w-72 h-72 sm:w-88 sm:h-88 rounded-full border-4 border-dashed transition-all duration-300 flex items-center justify-center ${
              isProcessing
                ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_50px_rgba(52,211,153,0.4)]'
                : 'border-amber-400/80 shadow-[0_0_40px_rgba(251,191,36,0.2)] animate-pulse'
            }`}
          >
            <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center text-white/40">
              <Camera className="w-6 h-6" />
            </div>
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-white/80 bg-black/60 px-4 py-1.5 rounded-full backdrop-blur-md">
            {isProcessing ? 'Verifying Identity...' : 'Please face the camera squarely'}
          </p>
        </div>

        {/* Confirmation Card Overlay upon Match */}
        {lastMatch && isProcessing && (
          <div className="absolute bottom-10 z-20 max-w-md w-full px-4 animate-in fade-in slide-in-from-bottom duration-300">
            <div className="bg-slate-900/95 border-2 border-emerald-400 rounded-3xl p-5 shadow-2xl backdrop-blur-xl flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-400 text-slate-950">
                    {lastMatch.action}
                  </span>
                  <span className="text-xs font-mono text-emerald-400">{lastMatch.time}</span>
                </div>
                <h3 className="text-base font-bold text-white truncate mt-1">{lastMatch.name}</h3>
                <p className="text-xs text-slate-400 font-mono">
                  ID: {lastMatch.code} • Confidence: {lastMatch.confidence}%
                </p>
              </div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="absolute top-6 z-20 max-w-md bg-rose-950/90 border border-rose-500 text-rose-200 px-4 py-3 rounded-2xl text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
