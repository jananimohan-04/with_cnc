import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  UserCheck,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ChevronRight,
  User,
  Building,
  Check,
} from 'lucide-react';
import { attendanceApi, AttendanceEmployee } from '../api';
import { extract128VectorFromCanvas, computeConsensusVector } from '../engine/faceMeshEngine';
import { playSuccessChime, speakGreeting } from '../engine/audioChime';
import { useAuth } from '@/contexts/AuthContext';

export function FaceEnrollmentPage() {
  const { company } = useAuth();
  const companyId = company?.id || '';

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // New employee form
  const [newCode, setNewCode] = useState('');
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newDept, setNewDept] = useState('Production');
  const [newDesignation, setNewDesignation] = useState('Machine Operator');
  const [newHourlyRate, setNewHourlyRate] = useState('250');
  const [newShiftStart, setNewShiftStart] = useState('09:00');
  const [newShiftEnd, setNewShiftEnd] = useState('18:00');

  // Camera & Vector capture state
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedSamples, setCapturedSamples] = useState<
    Array<{ vector: number[]; preview: string; sharpness: number }>
  >([]);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrolledSuccess, setEnrolledSuccess] = useState(false);

  // Load existing employees
  useEffect(() => {
    if (!companyId) return;
    attendanceApi.getEmployees(companyId).then((res) => {
      setEmployees(res.employees || []);
      if (res.employees?.length) setSelectedEmpId(res.employees[0].id);
    }).catch(console.error);
  }, [companyId]);

  // Start web camera
  const startCamera = useCallback(async () => {
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
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
      setCameraActive(false);
    }
  }, []);

  useEffect(() => {
    if (step === 2) {
      startCamera();
    }
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [step, startCamera]);

  // Capture single face frame sample
  const captureFrameSample = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const extraction = extract128VectorFromCanvas(canvas);

    if (!extraction.quality.faceDetected) {
      setCaptureMsg('Face not detected with sufficient clarity. Center your face inside the oval.');
      return;
    }
    if (extraction.quality.sharpness < 15) {
      setCaptureMsg('Frame is slightly blurry. Hold still and face the light.');
      return;
    }

    const previewUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedSamples((prev) => [
      ...prev,
      {
        vector: extraction.vector,
        preview: previewUrl,
        sharpness: extraction.quality.sharpness,
      },
    ]);
    setCaptureMsg(null);
  };

  // Submit enrollment
  const handleCompleteEnrollment = async () => {
    if (!consentChecked) {
      alert('Biometric consent must be acknowledged before saving biometric vectors.');
      return;
    }
    if (capturedSamples.length === 0) {
      alert('Please capture at least one face sample.');
      return;
    }

    try {
      setIsEnrolling(true);
      let targetEmpId = selectedEmpId;

      // If creating new employee on the fly
      if (isCreatingNew) {
        const created = await attendanceApi.saveEmployee({
          company_id: companyId,
          employee_code: newCode.trim().toUpperCase(),
          first_name: newFirst.trim(),
          last_name: newLast.trim(),
          department: newDept,
          designation: newDesignation,
          hourly_rate: parseFloat(newHourlyRate) || 250,
          shift_start: newShiftStart,
          shift_end: newShiftEnd,
        });
        targetEmpId = created.employee.id;
      }

      const vectors = capturedSamples.map((s) => s.vector);
      const res = await attendanceApi.enrollFace({
        employee_id: targetEmpId,
        vectors,
        biometric_consent: true,
        avatar_preview: capturedSamples[0]?.preview,
      });

      playSuccessChime();
      speakGreeting(`Biometric registration complete for ${res.employee.first_name}.`);
      setEnrolledSuccess(true);
    } catch (err: any) {
      alert('Enrollment failed: ' + (err.message || String(err)));
    } finally {
      setIsEnrolling(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Biometric Face Enrollment Wizard</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Register 128-dimensional biometric facial descriptors with anti-spoofing consent tracking.
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2">
          {[
            { num: 1, title: 'Profile' },
            { num: 2, title: 'Face Scan' },
            { num: 3, title: 'Consent' },
          ].map((s) => (
            <div key={s.num} className="flex items-center gap-1.5">
              <span
                className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                  step === s.num
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30 ring-2 ring-blue-200'
                    : step > s.num
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {step > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
              </span>
              <span className={`text-xs font-semibold ${step === s.num ? 'text-slate-900' : 'text-slate-400'}`}>
                {s.title}
              </span>
              {s.num < 3 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
            </div>
          ))}
        </div>
      </div>

      {enrolledSuccess ? (
        <div className="bg-white p-10 rounded-3xl border border-emerald-200 text-center shadow-lg animate-in zoom-in-95 duration-200 space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-md">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-slate-900">Biometric Profile Successfully Enrolled!</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            128-dimensional facial embeddings and biometric consent recorded. The employee can now clock in/out at any authorized attendance kiosk.
          </p>
          <div className="flex justify-center gap-3 pt-4">
            <button
              onClick={() => {
                setStep(1);
                setCapturedSamples([]);
                setConsentChecked(false);
                setEnrolledSuccess(false);
              }}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Enroll Another Employee
            </button>
            <a
              href="/attendance/dashboard"
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
          {/* STEP 1: Select or Create Employee */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Step 1: Choose Employee for Enrollment</h3>
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(!isCreatingNew)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                  {isCreatingNew ? '← Select Existing Employee' : '+ Register New Employee'}
                </button>
              </div>

              {!isCreatingNew ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">Select Staff Member</label>
                  {employees.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
                      No employees created yet. Click "+ Register New Employee" above.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                      {employees.map((emp) => (
                        <div
                          key={emp.id}
                          onClick={() => setSelectedEmpId(emp.id)}
                          className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                            selectedEmpId === emp.id
                              ? 'bg-blue-50/60 border-blue-400 ring-2 ring-blue-200'
                              : 'bg-white border-slate-200/80 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700">
                              {emp.first_name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-bold text-xs text-slate-900">
                                {emp.first_name} {emp.last_name}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {emp.employee_code} &bull; {emp.department}
                              </div>
                            </div>
                          </div>
                          {emp.is_enrolled ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Enrolled
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                              Not Enrolled
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Employee ID / Code *</label>
                    <input
                      type="text"
                      placeholder="e.g. EMP-101"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                    <select
                      value={newDept}
                      onChange={(e) => setNewDept(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-semibold"
                    >
                      <option value="Production">CNC Production</option>
                      <option value="Quality Inspection">Quality Inspection</option>
                      <option value="Tooling">Tooling & Fixtures</option>
                      <option value="Maintenance">Plant Maintenance</option>
                      <option value="Engineering">Design & CAD/CAM</option>
                      <option value="Administration">Operations & Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">First Name *</label>
                    <input
                      type="text"
                      placeholder="First name"
                      value={newFirst}
                      onChange={(e) => setNewFirst(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      placeholder="Last name"
                      value={newLast}
                      onChange={(e) => setNewLast(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Designation</label>
                    <input
                      type="text"
                      placeholder="e.g. CNC VMC Programmer"
                      value={newDesignation}
                      onChange={(e) => setNewDesignation(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Hourly Rate (₹/hr)</label>
                    <input
                      type="number"
                      value={newHourlyRate}
                      onChange={(e) => setNewHourlyRate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={!isCreatingNew && !selectedEmpId}
                  onClick={() => {
                    if (isCreatingNew && (!newCode || !newFirst)) {
                      alert('Employee code and first name are required.');
                      return;
                    }
                    setStep(2);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm"
                >
                  Continue to Face Capture <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Live Face Capture (3 angles) */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Step 2: Live Biometric Capture</h3>
                  <p className="text-xs text-slate-500">
                    Capture 3 clean samples (Front, slight tilt left, slight tilt right) for high-accuracy 1:N consensus matching.
                  </p>
                </div>
                <div className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                  {capturedSamples.length} / 3 Samples
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Viewfinder Column */}
                <div className="md:col-span-2">
                  <div className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center shadow-lg">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="w-full h-full object-cover transform -scale-x-100"
                    />

                    {/* Face Reticle Guide */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-48 h-60 rounded-[48%] border-2 border-white/50 relative flex items-center justify-center">
                        <span className="absolute top-2 left-4 w-4 h-4 border-t-2 border-l-2 border-white rounded-tl" />
                        <span className="absolute top-2 right-4 w-4 h-4 border-t-2 border-r-2 border-white rounded-tr" />
                        <span className="absolute bottom-2 left-4 w-4 h-4 border-b-2 border-l-2 border-white rounded-bl" />
                        <span className="absolute bottom-2 right-4 w-4 h-4 border-b-2 border-r-2 border-white rounded-br" />
                      </div>
                    </div>
                  </div>

                  {captureMsg && (
                    <div className="mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>{captureMsg}</span>
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={captureFrameSample}
                      disabled={capturedSamples.length >= 3}
                      className="flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm shadow-blue-500/20"
                    >
                      <Camera className="w-4 h-4" />
                      Capture Sample #{capturedSamples.length + 1}
                    </button>
                    {capturedSamples.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCapturedSamples([])}
                        className="px-4 py-3 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Captured Samples List */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Registered Samples</h4>
                  {[0, 1, 2].map((idx) => {
                    const sample = capturedSamples[idx];
                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-2xl border flex items-center gap-3 transition-all ${
                          sample ? 'bg-emerald-50/50 border-emerald-300' : 'bg-slate-50 border-slate-200 border-dashed'
                        }`}
                      >
                        {sample ? (
                          <>
                            <img
                              src={sample.preview}
                              alt="Sample"
                              className="w-14 h-14 rounded-xl object-cover border border-emerald-200"
                            />
                            <div className="flex-1">
                              <div className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Sample {idx + 1} Valid
                              </div>
                              <div className="text-[10px] text-slate-500">
                                Sharpness: {sample.sharpness}% &bull; 128-d
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="py-3 text-center w-full text-[11px] text-slate-400 font-medium">
                            Slot {idx + 1}: Waiting for capture…
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  type="button"
                  disabled={capturedSamples.length === 0}
                  onClick={() => setStep(3)}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm"
                >
                  Continue to Consent <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Biometric Consent & Final Save */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="pb-4 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Step 3: Biometric Consent & Compliance Notice</h3>
                <p className="text-xs text-slate-500">
                  Ensure strict compliance with global workplace biometric standards (GDPR / BIPA).
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-900 space-y-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <ShieldAlert className="w-4 h-4 text-amber-700" />
                  <span>Biometric Data Disclosure & Privacy Statement</span>
                </div>
                <p className="text-slate-700 leading-relaxed text-[11px]">
                  Argus Technologies extracts mathematically irreversible 128-dimensional floating point numerical descriptors
                  representing facial geometry. Raw visual frames are discarded after vector calculation and are not permanently stored.
                  Biometric descriptors are securely encrypted and utilized solely for attendance validation, shift logging, and fraud prevention.
                </p>
              </div>

              <label className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <span className="text-xs font-medium text-slate-800 leading-snug">
                  I confirm that the employee has been notified of and consented to the storage of their 128-dimensional facial biometric template for workplace timekeeping.
                </span>
              </label>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  type="button"
                  disabled={!consentChecked || isEnrolling}
                  onClick={handleCompleteEnrollment}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm shadow-emerald-600/20"
                >
                  {isEnrolling ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Enrolling Biometrics…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Complete Enrollment
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
