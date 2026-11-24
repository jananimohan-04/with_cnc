import React, { useState, useRef, useEffect } from 'react';
import api, { extractErrorMessage } from '../utils/api';
import { faceVectorFromDataUrl } from '../utils/faceVector';
import { X, Camera, CheckCircle2, AlertCircle, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';

export const ALL_PERMISSIONS = [
  { id: '/admin', label: 'Employee Dashboard', desc: 'Self-service attendance & logs' },
  { id: '/kiosk', label: 'Attendance Capture', desc: 'Kiosk facial recognition' },
  { id: '/attendance-reports', label: 'Attendance Reports', desc: 'All employees attendance history, filters & PDF/CSV export' },
  { id: '/enrollment', label: 'Employee Directory', desc: 'Face registration & roster' },
  { id: '/manual-entry', label: 'Manual Entry', desc: 'Duty shifts & override logs' },
  { id: '/leave-apply', label: 'Leave Apply', desc: 'Leave applications & tracking' },
  { id: '/payment-entry', label: 'Payment Entry', desc: 'Manual money entry, allowances, incentives & repayment' },
  { id: '/monthly-payslip', label: 'Monthly Payslip', desc: 'Generate & download employee monthly payslip in A4' },
  { id: '/geofence', label: 'Live Map & Geofence', desc: 'Realtime map & geofence perimeter tracking' },
  { id: '/settings', label: 'Settings', desc: 'Organization configurations' }
];

export const DEFAULT_PERMISSIONS = ['/admin', '/kiosk', '/attendance-reports', '/leave-apply', '/payment-entry', '/payroll', '/monthly-payslip', '/geofence'];

const INITIAL_FORM_DATA = {
  employee_code: '',
  first_name: '',
  last_name: '',
  employee_name: '',
  email: '',
  department: 'Operations',
  designation: '',
  phone: '',
  hourly_rate: 250,
  daily_wage_rate: 600,
  half_day_salary: 300,
  aadhar_number: '',
  emergency_contact: '',
  joining_date: '',
  account_holder_name: '',
  upi_number: '',
  bank_name: '',
  account_number: '',
  ifsc_code: '',
  shift_hours: '08:00',
  employment_type: 'FULL_TIME',
  shift_type: 'FIXED',
  target_daily_hours: 8.5,
  assigned_shift: 'General Shift (09:00 AM – 05:30 PM • 8.5h)',
  shift_start: '09:00',
  shift_end: '17:30',
  base_salary: 40000,
  statutory_deductions: 3000,
  permissions: DEFAULT_PERMISSIONS
};

export const EnrollEmployeeModal = ({ isOpen, onClose, onEmployeeCreated }) => {
  const [step, setStep] = useState(1);
  
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  const handleNameChange = (nameVal) => {
    const parts = nameVal.trimStart().split(' ');
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';
    setFormData(prev => ({
      ...prev,
      employee_name: nameVal,
      first_name: firstName,
      last_name: lastName
    }));
  };

  const handleHourlyRateChange = (val) => {
    const num = parseFloat(val) || 0;
    const dailyWage = Math.round(num * 8);
    const halfDay = Math.round(dailyWage / 2);
    setFormData(prev => ({
      ...prev,
      hourly_rate: num,
      daily_wage_rate: dailyWage,
      half_day_salary: halfDay
    }));
  };

  const handleDailyWageChange = (val) => {
    const num = parseFloat(val) || 0;
    setFormData(prev => ({
      ...prev,
      daily_wage_rate: num,
      half_day_salary: Math.round(num / 2)
    }));
  };

  const handleResetForm = () => {
    setFormData(INITIAL_FORM_DATA);
    setError('');
  };

  const handleEmploymentTypeChange = (type) => {
    if (type === 'PART_TIME') {
      setFormData(prev => ({
        ...prev,
        employment_type: type,
        shift_type: 'FIXED',
        target_daily_hours: 4.0,
        base_salary: 20000,
        assigned_shift: 'Part-Time Shift (10:00 AM – 02:00 PM • 4.0h)',
        shift_start: '10:00',
        shift_end: '14:00'
      }));
    } else if (type === 'DAILY_WAGE') {
      setFormData(prev => ({
        ...prev,
        employment_type: type,
        shift_type: 'FLEXIBLE',
        target_daily_hours: 8.0,
        daily_wage_rate: 650,
        hourly_rate: 80,
        base_salary: 0,
        assigned_shift: 'Flexible Daily Wage Schedule (No Fixed Hours)',
        shift_start: '09:00',
        shift_end: '18:00'
      }));
    } else if (type === 'FIELD_WORKER') {
      setFormData(prev => ({
        ...prev,
        employment_type: type,
        shift_type: 'FLEXIBLE',
        target_daily_hours: 8.0,
        base_salary: 35000,
        hourly_rate: 220,
        assigned_shift: 'Field Worker Schedule (Multi-Site External Visits)',
        shift_start: '09:00',
        shift_end: '18:00'
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        employment_type: type,
        shift_type: 'FIXED',
        target_daily_hours: 8.5,
        base_salary: 40000,
        assigned_shift: 'General Shift (09:00 AM – 05:30 PM • 8.5h)',
        shift_start: '09:00',
        shift_end: '17:30'
      }));
    }
  };

  const formatTime12h = (time24) => {
    if (!time24) return '';
    try {
      const [h, m] = time24.split(':').map(Number);
      const suffix = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
    } catch {
      return time24;
    }
  };

  const calculateHours = (inTime, outTime) => {
    if (!inTime || !outTime) return 8.5;
    try {
      const [h1, m1] = inTime.split(':').map(Number);
      const [h2, m2] = outTime.split(':').map(Number);
      let diffMins = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (diffMins < 0) diffMins += 24 * 60;
      return Math.round((diffMins / 60) * 10) / 10;
    } catch {
      return 8.5;
    }
  };

  const handleCustomTimingChange = (newStart, newEnd) => {
    const start = newStart !== undefined ? newStart : formData.shift_start;
    const end = newEnd !== undefined ? newEnd : formData.shift_end;
    const hrs = calculateHours(start, end);
    const shiftDesc = `Custom Shift (${formatTime12h(start)} – ${formatTime12h(end)} • ${hrs}h)`;
    setFormData(prev => ({
      ...prev,
      shift_start: start,
      shift_end: end,
      assigned_shift: shiftDesc
    }));
  };

  const handleShiftChange = (shiftName) => {
    let start = '09:00';
    let end = '17:30';
    if (shiftName.includes('Morning')) {
      start = '06:00';
      end = '14:30';
    } else if (shiftName.includes('Evening')) {
      start = '14:00';
      end = '22:30';
    } else if (shiftName.includes('Night')) {
      start = '21:00';
      end = '05:30';
    } else if (shiftName.includes('10:00 AM')) {
      start = '10:00';
      end = '19:00';
    }
    setFormData(prev => ({
      ...prev,
      assigned_shift: shiftName,
      shift_start: start,
      shift_end: end
    }));
  };

  const [consentAgreed, setConsentAgreed] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [createdEmployee, setCreatedEmployee] = useState(null);
  const [samples, setSamples] = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 360, facingMode: 'user' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera error', err);
      setError('Could not access webcam. Please allow camera permissions.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    }
  };

  useEffect(() => {
    if (step === 3 && isOpen) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [step, isOpen]);

  if (!isOpen) return null;

  const handleInfoSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = { ...formData };
      if (!payload.first_name && payload.employee_name) {
        const parts = payload.employee_name.trim().split(' ');
        payload.first_name = parts[0];
        payload.last_name = parts.slice(1).join(' ');
      }
      payload.email = payload.email?.trim() || null;
      payload.designation = payload.designation?.trim() || payload.department || 'Production';
      const res = await api.post('/employees/', payload);
      setCreatedEmployee(res.data);
      setStep(2);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to create employee profile.'));
    }
  };

  const handleConsentSubmit = () => {
    if (!consentAgreed) {
      setError('Explicit biometric consent is required to proceed with facial enrollment.');
      return;
    }
    setError('');
    setStep(3);
  };

  const captureSingleFrame = () => {
    if (!videoRef.current || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 360;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const autoCapture3Samples = async () => {
    setCapturing(true);
    setError('');
    const captured = [];

    for (let i = 1; i <= 3; i++) {
      await new Promise(r => setTimeout(r, 600));
      const frame = captureSingleFrame();
      if (frame) {
        captured.push(frame);
        setSamples([...captured]);
      }
    }
    setCapturing(false);
  };

  const submitFaceEnrollment = async () => {
    if (samples.length < 1) {
      setError('Please capture at least 1-3 face sample frames.');
      return;
    }
    setEnrolling(true);
    setError('');
    try {
      // Face vectors are computed here in the browser; only the numbers are sent.
      const results = await Promise.all(samples.map((s) => faceVectorFromDataUrl(s)));
      const faceEmbeddings = results.filter((r) => r.vector).map((r) => r.vector);
      if (faceEmbeddings.length < 1) {
        const firstErr = results.find((r) => r.error);
        setError((firstErr && firstErr.error) || 'Facial vectorization failed. Ensure face is clear.');
        return;
      }
      await api.post('/employees/' + createdEmployee.id + '/enroll-face', {
        face_embeddings: faceEmbeddings,
        consent_given: true
      });
      setSuccessMsg('Biometric facial vectors saved securely!');
      setTimeout(() => {
        onEmployeeCreated();
        onClose();
      }, 1500);
    } catch (err) {
      setError(extractErrorMessage(err, 'Facial vectorization failed. Ensure face is clear.'));
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 relative my-auto max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4 sm:mb-5 pr-6">
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold ${
              step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>1</span>
            <div className={`h-1 flex-1 rounded ${step >= 2 ? 'bg-blue-600' : 'bg-slate-200'}`} />
            <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold ${
              step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>2</span>
            <div className={`h-1 flex-1 rounded ${step >= 3 ? 'bg-blue-600' : 'bg-slate-200'}`} />
            <span className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold ${
              step === 3 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}>3</span>
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900">
            {step === 1 && 'Employee Detail Entry'}
            {step === 2 && 'Step 2: Biometric Consent'}
            {step === 3 && 'Step 3: Face Vector Capture (3 Samples)'}
          </h3>
        </div>

        {error && (
          <div className="mb-3 sm:mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-3 sm:mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleInfoSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Row 1: Employee Name*, Designation*, Mobile Number* */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Employee Name<span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Name"
                  value={formData.employee_name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Designation<span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Type/Select Designation"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mobile Number<span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Number"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Row 2: Hourly Salary*, Day Salary*, Half Day Salary* */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hourly Salary<span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="10"
                  min="0"
                  required
                  placeholder="Amount"
                  value={formData.hourly_rate}
                  onChange={(e) => handleHourlyRateChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Day Salary<span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="50"
                  min="0"
                  required
                  placeholder="Amount"
                  value={formData.daily_wage_rate}
                  onChange={(e) => handleDailyWageChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Half Day Salary<span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="25"
                  min="0"
                  required
                  placeholder="Amount"
                  value={formData.half_day_salary}
                  onChange={(e) => setFormData({ ...formData, half_day_salary: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Row 3: Email ID, Aadhar Number, Emergency Contact */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email ID</label>
                <input
                  type="email"
                  placeholder="Email ID"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Aadhar Number</label>
                <input
                  type="text"
                  placeholder="Number"
                  maxLength={12}
                  value={formData.aadhar_number}
                  onChange={(e) => setFormData({ ...formData, aadhar_number: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Emergency Contact</label>
                <input
                  type="tel"
                  placeholder="Number"
                  value={formData.emergency_contact}
                  onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Row 4: Joining Date, Account Holder Name, UPI Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Joining Date</label>
                <input
                  type="date"
                  value={formData.joining_date}
                  onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Account Holder Name</label>
                <input
                  type="text"
                  placeholder="Account Holder Name"
                  value={formData.account_holder_name}
                  onChange={(e) => setFormData({ ...formData, account_holder_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">UPI Number</label>
                <input
                  type="text"
                  placeholder="UPI Number"
                  value={formData.upi_number}
                  onChange={(e) => setFormData({ ...formData, upi_number: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Row 5: Bank Name, Account Number, IFSC Code */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Name</label>
                <input
                  type="text"
                  placeholder="Bank Name"
                  value={formData.bank_name}
                  onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Account Number</label>
                <input
                  type="text"
                  placeholder="Account Number"
                  value={formData.account_number}
                  onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">IFSC Code</label>
                <input
                  type="text"
                  placeholder="IFSC Code"
                  value={formData.ifsc_code}
                  onChange={(e) => setFormData({ ...formData, ifsc_code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              {/* Row 6: Shift Hours, Optional ID, Optional Dept */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Shift Hours</label>
                <input
                  type="text"
                  placeholder="Example 08:00"
                  value={formData.shift_hours}
                  onChange={(e) => setFormData({ ...formData, shift_hours: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Employee Code / ID (Optional)</label>
                <input
                  type="text"
                  placeholder="Auto-assigned (ARG-104)"
                  value={formData.employee_code}
                  onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  placeholder="Operations"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Collapsible Advanced Shift & Worker Model Config */}
            <details className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 text-xs">
              <summary className="font-bold text-slate-700 cursor-pointer flex items-center justify-between select-none">
                <span>Advanced Worker Model, Shifts &amp; Permissions</span>
                <span className="text-[11px] font-normal text-blue-600">Configure Details ▾</span>
              </summary>
              <div className="pt-3 space-y-3">
                {/* Employment Type & Worker Model */}
                <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800">
                      Employment Type &amp; Worker Model
                    </label>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
                      {formData.employment_type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => handleEmploymentTypeChange('FULL_TIME')}
                      className={`px-2.5 py-2 rounded-lg text-xs font-semibold border transition-all text-center ${
                        formData.employment_type === 'FULL_TIME'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Full-Time
                      <span className="block text-[10px] font-normal opacity-80">8.5h Standard</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEmploymentTypeChange('PART_TIME')}
                      className={`px-2.5 py-2 rounded-lg text-xs font-semibold border transition-all text-center ${
                        formData.employment_type === 'PART_TIME'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Part-Time
                      <span className="block text-[10px] font-normal opacity-80">{formData.target_daily_hours || 4.0}h Target</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEmploymentTypeChange('DAILY_WAGE')}
                      className={`px-2.5 py-2 rounded-lg text-xs font-semibold border transition-all text-center ${
                        formData.employment_type === 'DAILY_WAGE'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Daily Wage
                      <span className="block text-[10px] font-normal opacity-80">Coolie / Flexible</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEmploymentTypeChange('FIELD_WORKER')}
                      className={`px-2.5 py-2 rounded-lg text-xs font-semibold border transition-all text-center ${
                        formData.employment_type === 'FIELD_WORKER'
                          ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Field Worker
                      <span className="block text-[10px] font-normal opacity-80">Client Sites / GPS</span>
                    </button>
                  </div>
                </div>

                {/* Explicit Shift Timing Pickers */}
                <div className="grid grid-cols-2 gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Shift Start Time
                    </label>
                    <input
                      type="time"
                      value={formData.shift_start}
                      onChange={(e) => handleCustomTimingChange(e.target.value, undefined)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Shift End Time
                    </label>
                    <input
                      type="time"
                      value={formData.shift_end}
                      onChange={(e) => handleCustomTimingChange(undefined, e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* User Access & Permissions */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-800">
                      User Access &amp; Permissions
                    </label>
                    <div className="flex items-center gap-2 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, permissions: ALL_PERMISSIONS.map(p => p.id) }))}
                        className="text-blue-600 hover:underline cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, permissions: DEFAULT_PERMISSIONS }))}
                        className="text-slate-500 hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {ALL_PERMISSIONS.map((perm) => {
                      const isChecked = (formData.permissions || []).includes(perm.id);
                      return (
                        <label
                          key={perm.id}
                          className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                            isChecked 
                              ? 'bg-blue-50/60 border-blue-200 text-slate-900' 
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const current = formData.permissions || [];
                              if (e.target.checked) {
                                setFormData(prev => ({ ...prev, permissions: [...current, perm.id] }));
                              } else {
                                setFormData(prev => ({ ...prev, permissions: current.filter(p => p !== perm.id) }));
                              }
                            }}
                            className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold">{perm.label}</div>
                            <div className="text-[10px] text-slate-400 truncate">{perm.desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </details>

            {/* Buttons: Submit & Reset */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                className="py-2.5 px-7 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                Submit
              </button>
              <button
                type="button"
                onClick={handleResetForm}
                className="py-2.5 px-7 bg-slate-600 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                Reset
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm mb-1">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                Biometric Data Processing Agreement
              </div>
              <p>
                In compliance with data protection laws, Argus AI Attendance captures mathematical vector representations (128-dimensional float embeddings) derived from facial features solely for time and attendance tracking.
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li><strong>No raw photos</strong> are stored on disk or server databases.</li>
                <li>Vectors cannot be reverse-engineered into photographic images.</li>
                <li>Data is securely isolated to your organization tenant.</li>
              </ul>
            </div>

            <label className="flex items-start gap-3 p-3 bg-blue-50/60 border border-blue-200 rounded-xl cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consentAgreed}
                onChange={(e) => setConsentAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <span className="text-xs font-medium text-slate-800">
                I acknowledge and grant explicit consent on behalf of {formData.first_name} {formData.last_name} for biometric vector enrollment.
              </span>
            </label>

            <button
              type="button"
              onClick={handleConsentSubmit}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors"
            >
              Proceed to Camera Capture
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="relative aspect-[4/3] bg-slate-900 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
              <canvas ref={canvasRef} className="hidden" />

              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-36 h-48 border-2 border-dashed border-white/70 rounded-[50%]" />
              </div>

              <div className="absolute bottom-2 left-2 bg-slate-900/80 px-2.5 py-1 rounded-lg text-[11px] text-white font-medium">
                Samples: {samples.length} / 3 captured
              </div>
            </div>

            {samples.length > 0 && (
              <div className="flex items-center gap-2 justify-center">
                {samples.map((s, idx) => (
                  <img
                    key={idx}
                    src={s}
                    alt="sample"
                    className="w-12 h-12 object-cover rounded-lg border-2 border-blue-500 shadow-sm"
                  />
                ))}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={autoCapture3Samples}
                disabled={capturing || enrolling}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <Camera className="w-4 h-4 text-blue-600" />
                {capturing ? 'Capturing 3 Samples...' : 'Auto-Capture 3 Samples'}
              </button>

              <button
                type="button"
                onClick={submitFaceEnrollment}
                disabled={samples.length < 1 || enrolling}
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {enrolling ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Vectorizing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Save Face Vector
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
