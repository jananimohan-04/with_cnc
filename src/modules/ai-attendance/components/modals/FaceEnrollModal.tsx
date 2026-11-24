import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, Check, ShieldCheck, RefreshCw } from 'lucide-react';
import { extract128VectorFromCanvas } from '../../engine/faceVectorEngine';
import { employeeService } from '../../services/employeeService';
import type { AttendanceEmployee } from '../../types/employee.types';

interface Props {
  employee: AttendanceEmployee;
  onClose: () => void;
  onSuccess: () => void;
}

export const FaceEnrollModal: React.FC<Props> = ({ employee, onClose, onSuccess }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [samples, setSamples] = useState<number[][]>([]);
  const [streamActive, setStreamActive] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let activeStream: MediaStream | null = null;
    async function startCam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        });
        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setStreamActive(true);
        }
      } catch (err) {
        console.error('Camera enrollment error:', err);
      }
    }
    startCam();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleCaptureSample = () => {
    if (!videoRef.current) return;
    const vec = extract128VectorFromCanvas(videoRef.current);
    setSamples((prev) => [...prev, vec]);
  };

  const handleSaveEnrollment = async () => {
    if (samples.length === 0) return;
    try {
      setSaving(true);
      await employeeService.saveFaceEmbeddings(employee.id, samples);
      alert(`Successfully saved ${samples.length} face vector samples for ${employee.employee_name}!`);
      onSuccess();
    } catch (err) {
      alert('Failed to save biometric enrollment: ' + String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[1055] backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Biometric Face Enrollment</h3>
            <p className="text-xs text-slate-400">
              Staff: <span className="text-amber-400 font-semibold">{employee.employee_name}</span> ({employee.employee_code})
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Reticle */}
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-800">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover -scale-x-100" />
          <div className="absolute w-44 h-44 rounded-full border-2 border-dashed border-amber-400/80 pointer-events-none animate-pulse" />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>Captured Samples: <strong className="text-amber-400">{samples.length} / 3</strong></span>
          <span className="text-emerald-400 flex items-center gap-1 font-mono text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Zero Image Storage (128-d Vector)</span>
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleCaptureSample}
            disabled={!streamActive}
            className="flex-1 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow transition-all cursor-pointer disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
            <span>Capture Angle ({samples.length + 1})</span>
          </button>

          <button
            type="button"
            onClick={handleSaveEnrollment}
            disabled={samples.length === 0 || saving}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs flex items-center gap-1.5 shadow disabled:opacity-40 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Biometrics'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
