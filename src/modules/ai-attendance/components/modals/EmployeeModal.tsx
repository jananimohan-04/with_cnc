import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  Plus,
  Trash2,
  Settings,
  Volume2,
  VolumeX,
  Check,
  User,
  ArrowUpRight,
} from 'lucide-react';
import { employeeService } from '../../services/employeeService';
import type { AttendanceEmployee } from '../../types/employee.types';

interface Props {
  companyId: string;
  employee: AttendanceEmployee | null;
  onClose: () => void;
  onSaved: () => void;
}

// 12 Industrial Default Departments & Designations from original application
const DEPARTMENT_DESIGNATION_MAP: Record<string, string[]> = {
  Production: [
    'CNC Operator',
    'VMC Operator',
    'VMC Setter',
    'Machine Setter',
    'Production Supervisor',
    'Production Engineer',
    'Production Manager',
    'Plant In-Charge',
  ],
  'Quality Control': [
    'Quality Inspector',
    'QC Engineer',
    'CMM Operator',
    'Quality Supervisor',
    'Quality Manager',
  ],
  Maintenance: [
    'Maintenance Technician',
    'Electrical Technician',
    'Maintenance Engineer',
    'Maintenance Supervisor',
    'Maintenance Manager',
  ],
  'Tool Room & Die Shop': [
    'Tool Maker',
    'EDM Operator',
    'Wire Cut Operator',
    'Tool Room Engineer',
    'Tool Room In-Charge',
  ],
  'Stores & Inventory': [
    'Store Helper',
    'Store Keeper',
    'Inventory Executive',
    'Store Supervisor',
    'Store Manager',
  ],
  'Purchase & Procurement': [
    'Purchase Assistant',
    'Purchase Executive',
    'Senior Purchase Executive',
    'Purchase Manager',
  ],
  'Sales & Field Operations': [
    'Field Sales Executive',
    'Sales Engineer',
    'Business Development Executive',
    'Field Service Technician',
    'Area Sales Manager',
  ],
  'Accounts & Finance': [
    'Accounts Assistant',
    'Accountant',
    'Billing Executive',
    'Senior Accountant',
    'Accounts Manager',
  ],
  'Human Resources': [
    'HR Assistant',
    'HR Executive',
    'Recruiter',
    'Admin Executive',
    'HR Manager',
  ],
  'Security & Facility': [
    'Security Guard',
    'Head Guard',
    'Security Supervisor',
    'Facility Executive',
    'Facility Manager',
  ],
  'Design & Engineering': [
    'CAD Draughtsman',
    'Design Engineer',
    'CAM Programmer',
    'R&D Engineer',
    'Engineering Manager',
  ],
  'Administration & Management': [
    'Office Assistant',
    'Receptionist',
    'Operations Executive',
    'General Manager',
    'Managing Director',
  ],
};

const DEFAULT_DEPARTMENTS = Object.keys(DEPARTMENT_DESIGNATION_MAP);

interface DocItem {
  id: string;
  name: string;
  fileName: string;
}

export const EmployeeModal: React.FC<Props> = ({ companyId, employee, onClose, onSaved }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);

  // Section 01: Personal Details
  const initialName = employee ? `${employee.first_name || ''} ${employee.last_name || ''}`.trim() : '';
  const [employeeName, setEmployeeName] = useState(initialName);
  const [mobileNumber, setMobileNumber] = useState(employee?.phone || '');
  const [emailId, setEmailId] = useState(employee?.email || '');
  const [emailRequired, setEmailRequired] = useState(true);
  const [dateOfBirth, setDateOfBirth] = useState<string>((employee?.profile as any)?.date_of_birth || '');
  const [aadharNumber, setAadharNumber] = useState<string>((employee?.profile as any)?.aadhaar_number || '');
  const [emergencyContact, setEmergencyContact] = useState<string>((employee?.profile as any)?.emergency_contact || '');

  // Section 02: Employment Details
  const [department, setDepartment] = useState<string>(employee?.department || 'Production');
  const [designation, setDesignation] = useState<string>(employee?.designation || 'CNC Operator');
  const [employeeStatus, setEmployeeStatus] = useState<'Active' | 'Inactive'>(
    employee ? (employee.is_active ? 'Active' : 'Inactive') : 'Active'
  );
  const [employeeType, setEmployeeType] = useState<string>(
    (employee?.employment_type as string) === 'FIELD_WORKER' || (employee?.profile as any)?.employee_type === 'field_worker'
      ? 'field_worker'
      : 'standard'
  );
  const [branchId, setBranchId] = useState<string>((employee?.profile as any)?.branch_id || 'HOME');
  const [joiningDate, setJoiningDate] = useState<string>((employee?.profile as any)?.joining_date || '');

  // Section 03: Salary & Payroll
  const [salaryType, setSalaryType] = useState<'daily' | 'hourly' | 'half_day'>(
    (employee?.profile as any)?.salary_type || 'daily'
  );
  const [hourlySalary, setHourlySalary] = useState<string>(
    String(employee?.hourly_rate || (employee?.profile as any)?.hourly_salary || '150.50')
  );
  const [daySalary, setDaySalary] = useState<string>(
    String((employee?.profile as any)?.day_salary || employee?.day_salary || '1000')
  );
  const [halfDaySalary, setHalfDaySalary] = useState<string>(
    String((employee?.profile as any)?.half_day_salary || '500')
  );

  // Section 04: Shift & Overtime
  const [noShift, setNoShift] = useState<boolean>(Boolean((employee?.profile as any)?.no_shift));
  const [shiftStart, setShiftStart] = useState<string>(employee?.shift_start || '09:00 AM');
  const [shiftEnd, setShiftEnd] = useState<string>(employee?.shift_end || '05:00 PM');
  const [shiftHours, setShiftHours] = useState<string>((employee?.profile as any)?.shift_hours || '08:00');
  const [calculateOvertime, setCalculateOvertime] = useState<boolean>(
    Boolean((employee?.profile as any)?.calculate_overtime)
  );

  // Section 05: Bank Details
  const [accountHolderName, setAccountHolderName] = useState<string>(
    (employee?.profile as any)?.account_holder_name || ''
  );
  const [accountNumber, setAccountNumber] = useState<string>(
    (employee?.profile as any)?.account_number || ''
  );
  const [ifscCode, setIfscCode] = useState<string>((employee?.profile as any)?.ifsc_code || '');
  const [bankBranch, setBankBranch] = useState<string>((employee?.profile as any)?.bank_name || '');
  const [upiNumber, setUpiNumber] = useState<string>((employee?.profile as any)?.upi_number || '');

  // Section 06: Photo & Documents
  const [photoUrl, setPhotoUrl] = useState<string>(employee?.avatar_url || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocItem[]>(() => {
    const existing = (employee?.profile as any)?.documents;
    if (Array.isArray(existing) && existing.length > 0) {
      return existing.map((d: any, idx: number) => ({
        id: `doc-${idx}`,
        name: d.name || 'Document',
        fileName: d.fileName || 'document.pdf',
      }));
    }
    return [];
  });

  // Section 07: Attendance & Geofencing
  const [geofenceValidation, setGeofenceValidation] = useState<boolean>(
    (employee?.profile as any)?.geofence_validation !== false
  );

  // Section 08: Permissions
  const [permPunchAttendance, setPermPunchAttendance] = useState<boolean>(
    (employee?.profile as any)?.portal_permissions?.punch_attendance !== false
  );
  const [permAttendanceHistory, setPermAttendanceHistory] = useState<boolean>(
    (employee?.profile as any)?.portal_permissions?.attendance_history !== false
  );
  const [permMonthlyPayslip, setPermMonthlyPayslip] = useState<boolean>(
    (employee?.profile as any)?.portal_permissions?.monthly_payslip !== false
  );
  const [permEmployeeCredentials, setPermEmployeeCredentials] = useState<boolean>(
    (employee?.profile as any)?.portal_permissions?.employee_credentials !== false
  );
  const [permLeavePermission, setPermLeavePermission] = useState<boolean>(
    (employee?.profile as any)?.portal_permissions?.leave_permission !== false
  );

  // Camera modal state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Update designations when department changes
  const availableDesignations = DEPARTMENT_DESIGNATION_MAP[department] || [
    'Staff',
    'Associate',
    'Executive',
    'Manager',
  ];

  const handleSelectDepartment = (dept: string) => {
    setDepartment(dept);
    const desigs = DEPARTMENT_DESIGNATION_MAP[dept] || ['Associate'];
    if (!desigs.includes(designation)) {
      setDesignation(desigs[0] || 'Associate');
    }
  };

  // Document management
  const handleAddDocumentRow = () => {
    setDocuments((prev) => [
      ...prev,
      { id: `doc-${Date.now()}`, name: '', fileName: 'No file chosen' },
    ]);
  };

  const handleUpdateDocName = (id: string, name: string) => {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, name } : d)));
  };

  const handleDocFileSelect = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const fileName = e.target.files[0].name;
      setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, fileName } : d)));
    }
  };

  const handleRemoveDocRow = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  // Photo file upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotoUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Webcam camera capture
  const handleStartCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      alert('Unable to access camera: ' + String(err));
      setIsCameraActive(false);
    }
  };

  const handleCaptureSnapshot = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setPhotoUrl(dataUrl);
      }
      handleStopCamera();
    }
  };

  const handleStopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
    }
    setIsCameraActive(false);
  };

  // Reset form
  const handleReset = () => {
    if (!window.confirm('Reset all fields to default values?')) return;
    setEmployeeName('');
    setMobileNumber('');
    setEmailId('');
    setDateOfBirth('');
    setAadharNumber('');
    setEmergencyContact('');
    setDepartment('Production');
    setDesignation('CNC Operator');
    setEmployeeStatus('Active');
    setEmployeeType('standard');
    setSalaryType('daily');
    setHourlySalary('150.50');
    setDaySalary('1000');
    setHalfDaySalary('500');
    setNoShift(false);
    setShiftStart('09:00 AM');
    setShiftEnd('05:00 PM');
    setShiftHours('08:00');
    setCalculateOvertime(false);
    setAccountHolderName('');
    setAccountNumber('');
    setIfscCode('');
    setBankBranch('');
    setUpiNumber('');
    setPhotoUrl('');
    setDocuments([]);
    setGeofenceValidation(true);
  };

  // Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!employeeName.trim()) {
      alert('Please enter employee name.');
      return;
    }
    if (!mobileNumber.trim()) {
      alert('Please enter mobile number.');
      return;
    }
    if (emailRequired && !emailId.trim()) {
      alert('Email ID is required while Email toggle is ON.');
      return;
    }

    try {
      setIsSubmitting(true);

      const nameParts = employeeName.trim().split(' ');
      const firstName = nameParts[0] || 'Employee';
      const lastName = nameParts.slice(1).join(' ') || '';

      const employeeCode =
        employee?.employee_code ||
        `EMP-${Math.floor(100000 + Math.random() * 900000)}`;

      const payload: Partial<AttendanceEmployee> = {
        company_id: companyId,
        employee_code: employeeCode,
        first_name: firstName,
        last_name: lastName,
        email: emailId.trim() || null,
        phone: mobileNumber.trim() || null,
        department,
        designation,
        employment_type: (employeeType === 'field_worker' ? 'CONTRACT' : 'FULL_TIME') as any,
        shift_type: noShift ? ('FLEXIBLE' as any) : ('FIXED' as any),
        shift_start: shiftStart,
        shift_end: shiftEnd,
        hourly_rate: Number(hourlySalary) || 150.5,
        is_active: employeeStatus === 'Active',
        avatar_url: photoUrl || null,
        profile: {
          ...(employee?.profile || {}),
          full_name: employeeName.trim(),
          date_of_birth: dateOfBirth,
          aadhaar_number: aadharNumber,
          emergency_contact: emergencyContact,
          branch_id: branchId,
          joining_date: joiningDate,
          salary_type: (salaryType === 'hourly' ? 'HOURLY' : salaryType === 'half_day' ? 'DAILY' : 'DAILY') as any,
          hourly_salary: Number(hourlySalary) || 0,
          day_salary: Number(daySalary) || 0,
          half_day_salary: Number(halfDaySalary) || 0,
          no_shift: noShift,
          shift_hours: shiftHours,
          calculate_overtime: calculateOvertime,
          account_holder_name: accountHolderName,
          account_number: accountNumber,
          ifsc_code: ifscCode,
          bank_name: bankBranch,
          upi_number: upiNumber,
          documents: documents.map((d) => ({
            name: d.name,
            url: d.fileName,
            uploaded_at: new Date().toISOString(),
          })) as any,
          geofence_validation: geofenceValidation,
          portal_permissions: {
            punch_attendance: permPunchAttendance,
            attendance_history: permAttendanceHistory,
            monthly_payslip: permMonthlyPayslip,
            employee_credentials: permEmployeeCredentials,
            leave_permission: permLeavePermission,
          },
        },
      };

      if (employee?.id) {
        await employeeService.updateEmployee(employee.id, payload);
      } else {
        await employeeService.createEmployee(payload);
      }

      onSaved();
    } catch (err) {
      alert('Error saving employee profile: ' + String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="emp-modal-overlay fixed inset-0 bg-slate-900/65 z-[1055] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in">
      <div className="modal-box-employee-entry w-full max-w-4xl max-h-[84vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="emp-modal-header flex-shrink-0">
          <div className="emp-modal-header-left">
            <div className="emp-modal-title-row">
              <h2 className="modal-header-title">Employee Details Entry</h2>
              <span className="emp-pill emp-pill-gray">
                {employee ? 'EDIT PROFILE' : 'NEW EMPLOYEE'}
              </span>
            </div>
            <div className="emp-modal-subtitle">
              Fields marked <span className="text-rose-500 font-bold">*</span> are required. Optional details can be added later.
            </div>
          </div>
          <div className="emp-modal-header-right">
            <button
              type="button"
              onClick={() => setAudioEnabled(!audioEnabled)}
              className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {audioEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Audio: On</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-rose-500" />
                  <span>Audio: Off</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 text-2xl font-bold leading-none p-1 rounded-md"
              title="Close modal"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="emp-modal-body">
            {/* ================= SECTION 01: Personal Details ================= */}
            <div className="emp-section-card">
              <div className="emp-section-header">
                <div className="emp-section-header-left">
                  <span className="emp-section-num">01</span>
                  <div>
                    <div className="emp-section-title">Personal Details</div>
                    <div className="emp-section-subtitle">Basic employee information and contact details</div>
                  </div>
                </div>
              </div>

              <div className="emp-section-grid emp-grid-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">
                    Employee Name<span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">
                    Mobile Number<span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="Enter mobile number"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">
                    Email ID{emailRequired && <span className="text-rose-500">*</span>}
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="email"
                      required={emailRequired}
                      value={emailId}
                      onChange={(e) => setEmailId(e.target.value)}
                      placeholder="Email ID (e.g. employee@company.co"
                      className="w-full h-9 pl-3 pr-16 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                    />
                    <div className="absolute right-2 flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-emerald-600 tracking-wider">
                        {emailRequired ? 'ON' : 'OFF'}
                      </span>
                      <label className="email-switch">
                        <input
                          type="checkbox"
                          checked={emailRequired}
                          onChange={(e) => setEmailRequired(e.target.checked)}
                        />
                        <span className="email-slider" />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">Date of Birth</label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">Aadhaar Number</label>
                  <input
                    type="text"
                    value={aadharNumber}
                    onChange={(e) => setAadharNumber(e.target.value)}
                    placeholder="12-digit Aadhaar number"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">Emergency Contact</label>
                  <input
                    type="text"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    placeholder="Emergency mobile number"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* ================= SECTION 02: Employment Details ================= */}
            <div className="emp-section-card">
              <div className="emp-section-header">
                <div className="emp-section-header-left">
                  <span className="emp-section-num">02</span>
                  <div>
                    <div className="emp-section-title">Employment Details</div>
                    <div className="emp-section-subtitle">Department, role, employee status, and joining date</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => alert('Manage Departments & Designations: You can add new options directly below.')}
                  className="btn-manage-masters"
                >
                  <Settings className="w-3.5 h-3.5 text-blue-700" />
                  <span>Manage Departments &amp; Designations</span>
                </button>
              </div>

              <div className="emp-section-grid emp-grid-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">
                    Department<span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={department}
                    onChange={(e) => handleSelectDepartment(e.target.value)}
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                    required
                  >
                    {DEFAULT_DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-slate-500">
                    Choose from default list or select a pill below
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">
                    Designation<span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                    required
                  >
                    {availableDesignations.map((des) => (
                      <option key={des} value={des}>
                        {des}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-slate-500">Only related designations appear</span>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">
                    Employee Status<span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={employeeStatus}
                    onChange={(e) => setEmployeeStatus(e.target.value as any)}
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  >
                    <option value="Active">Active (Counts towards Quota)</option>
                    <option value="Inactive">Inactive (Unlimited / Quota Exempt)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">
                    Employee Type<span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={employeeType}
                    onChange={(e) => setEmployeeType(e.target.value)}
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  >
                    <option value="standard">Standard Employee (Office / Industrial)</option>
                    <option value="field_worker">🏃 Field Worker (GPS Tracked / Site Visits)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">Assigned Branch Location</label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  >
                    <option value="HOME">🏠 Home Branch (Head Office / Initial Company)</option>
                    <option value="BRANCH-1">📍 Plant 1 - Ambattur Hub</option>
                    <option value="BRANCH-2">📍 Plant 2 - Oragadam Facility</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">Joining Date</label>
                  <input
                    type="date"
                    value={joiningDate}
                    onChange={(e) => setJoiningDate(e.target.value)}
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Smart Department → Designation Mapping Interactive Card */}
              <div className="smart-dept-desig-card is-active-dept">
                <div className="smart-card-header">
                  <div className="smart-card-icon">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="smart-card-title">Smart Department &rarr; Designation Mapping</div>
                    <div className="smart-card-subtitle">
                      Select a department below to automatically link its job roles.
                    </div>
                  </div>
                </div>
                <div className="smart-card-pills-row">
                  {DEFAULT_DEPARTMENTS.slice(0, 5).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleSelectDepartment(d)}
                      className={`smart-pill ${department === d ? 'is-selected' : ''}`}
                    >
                      {d}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const other = DEFAULT_DEPARTMENTS.find((d) => d !== department) || 'Maintenance';
                      handleSelectDepartment(other);
                    }}
                    className="smart-pill smart-pill-more"
                  >
                    +{DEFAULT_DEPARTMENTS.length - 5} more departments
                  </button>
                </div>
              </div>
            </div>

            {/* ================= SECTION 03: Salary & Payroll ================= */}
            <div className="emp-section-card">
              <div className="emp-section-header">
                <div className="emp-section-header-left">
                  <span className="emp-section-num">03</span>
                  <div>
                    <div className="emp-section-title">Salary &amp; Payroll</div>
                    <div className="emp-section-subtitle">Configure salary calculation and payroll rates</div>
                  </div>
                </div>
                <span className="emp-pill emp-pill-green">
                  {salaryType === 'daily'
                    ? 'DAY BASED'
                    : salaryType === 'hourly'
                      ? 'HOURLY BASED'
                      : 'HALF-DAY BASED'}
                </span>
              </div>

              <div className="emp-section-grid emp-grid-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">
                    Salary Basis / Type<span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={salaryType}
                    onChange={(e) => setSalaryType(e.target.value as any)}
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                    required
                  >
                    <option value="daily">Day-Based</option>
                    <option value="hourly">Hourly-Based</option>
                    <option value="half_day">Half-Day-Based</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">
                    Hourly Salary<span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={hourlySalary}
                    onChange={(e) => setHourlySalary(e.target.value)}
                    placeholder="e.g. 150.50"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">Day Salary</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={daySalary}
                    onChange={(e) => setDaySalary(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">Half Day Salary</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={halfDaySalary}
                    onChange={(e) => setHalfDaySalary(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* ================= SECTION 04: Shift & Overtime ================= */}
            <div className="emp-section-card">
              <div className="emp-section-header">
                <div className="emp-section-header-left">
                  <span className="emp-section-num">04</span>
                  <div>
                    <div className="emp-section-title">Shift &amp; Overtime</div>
                    <div className="emp-section-subtitle">Control working schedule and overtime calculations</div>
                  </div>
                </div>
                <span className="emp-pill emp-pill-gray">
                  {noShift ? 'PUNCH HOURS ONLY' : 'STANDARD SHIFT'}
                </span>
              </div>

              <div className="emp-section-stack">
                {/* No Fixed Shift Banner */}
                <div className="emp-inner-card">
                  <label className="emp-inner-card-label">
                    <div>
                      <div className="emp-inner-card-title">No Fixed Shift (Punch Hours Only)</div>
                      <div className="emp-inner-card-desc">
                        When enabled, shift timings are not required. Pay is calculated from actual attendance punch hours using the hourly salary rate.
                      </div>
                    </div>
                    <div className="emp-switch-wrapper">
                      <span className="emp-switch-state-text">{noShift ? 'ON' : 'OFF'}</span>
                      <label className="email-switch">
                        <input
                          type="checkbox"
                          checked={noShift}
                          onChange={(e) => setNoShift(e.target.checked)}
                        />
                        <span className="email-slider" />
                      </label>
                    </div>
                  </label>
                </div>

                {/* Shift Hours Grid */}
                <div className="emp-section-grid emp-grid-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-700">Shift Start</label>
                    <input
                      type="text"
                      disabled={noShift}
                      value={shiftStart}
                      onChange={(e) => setShiftStart(e.target.value)}
                      placeholder="09:00 AM"
                      className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-700">Shift End</label>
                    <input
                      type="text"
                      disabled={noShift}
                      value={shiftEnd}
                      onChange={(e) => setShiftEnd(e.target.value)}
                      placeholder="05:00 PM"
                      className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-700">Shift Hours</label>
                    <input
                      type="text"
                      disabled={noShift}
                      value={shiftHours}
                      onChange={(e) => setShiftHours(e.target.value)}
                      placeholder="08:00"
                      className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                </div>

                {/* Overtime Toggle */}
                <div className="emp-inner-card">
                  <label className="emp-inner-card-label">
                    <div>
                      <div className="emp-inner-card-title">Calculate Overtime Past Shift Hours</div>
                      <div className="emp-inner-card-desc">
                        Not applicable while No Fixed Shift is enabled. With a fixed shift, extra hours can be calculated as overtime.
                      </div>
                    </div>
                    <div className="emp-switch-wrapper">
                      <span className="emp-switch-state-text">{calculateOvertime ? 'ON' : 'OFF'}</span>
                      <label className="email-switch">
                        <input
                          type="checkbox"
                          checked={calculateOvertime}
                          disabled={noShift}
                          onChange={(e) => setCalculateOvertime(e.target.checked)}
                        />
                        <span className="email-slider" />
                      </label>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* ================= SECTION 05: Bank Details ================= */}
            <div className="emp-section-card">
              <div className="emp-section-header">
                <div className="emp-section-header-left">
                  <span className="emp-section-num">05</span>
                  <div>
                    <div className="emp-section-title">Bank Details</div>
                    <div className="emp-section-subtitle">Salary payment and bank transfer information</div>
                  </div>
                </div>
                <span className="emp-pill emp-pill-gray">OPTIONAL</span>
              </div>

              <div className="emp-section-grid emp-grid-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">Account Holder Name</label>
                  <input
                    type="text"
                    value={accountHolderName}
                    onChange={(e) => setAccountHolderName(e.target.value)}
                    placeholder="Name as per bank records"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">Account Number</label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="Enter account number"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">IFSC Code</label>
                  <input
                    type="text"
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value)}
                    placeholder="E.G. SBIN0001234"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">Branch Name</label>
                  <input
                    type="text"
                    value={bankBranch}
                    onChange={(e) => setBankBranch(e.target.value)}
                    placeholder="Bank branch name (optional)"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700">UPI Number / ID</label>
                  <input
                    type="text"
                    value={upiNumber}
                    onChange={(e) => setUpiNumber(e.target.value)}
                    placeholder="Mobile number or UPI ID"
                    className="w-full h-9 px-3 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* ================= SECTION 06: Photo & Documents ================= */}
            <div className="emp-section-card">
              <div className="emp-section-header">
                <div className="emp-section-header-left">
                  <span className="emp-section-num">06</span>
                  <div>
                    <div className="emp-section-title">Photo &amp; Documents</div>
                    <div className="emp-section-subtitle">Register employee face and attach identity or employment proofs</div>
                  </div>
                </div>
              </div>

              <div className="emp-section-stack">
                {/* Photo & Face Capture Box */}
                <div className="emp-face-box">
                  <div className="emp-face-left">
                    <div className="emp-face-icon-wrap">
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt="Face Preview"
                          className="w-full h-full object-cover rounded-md"
                        />
                      ) : (
                        <User className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                    <div>
                      <div className="emp-face-title">Employee Face &amp; Photo</div>
                      <div className="emp-face-desc">Upload an image or capture a face photo</div>
                    </div>
                  </div>

                  <div className="emp-face-right">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-emp-action"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-700" />
                      <span>Upload Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStartCamera}
                      className="btn-emp-action"
                    >
                      <Camera className="w-3.5 h-3.5 text-slate-700" />
                      <span>Capture Face</span>
                    </button>
                  </div>
                </div>

                {/* Documents Section */}
                <div className="emp-docs-section">
                  <div className="emp-docs-header">
                    <div>
                      <div className="emp-docs-title">
                        Employee Documents <span className="text-slate-400 font-normal">(Optional)</span>
                      </div>
                      <div className="emp-docs-subtitle">
                        Aadhaar, certificates, employment records (PDF, DOCX, JPG, PNG)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddDocumentRow}
                      className="btn-emp-add-doc"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Document</span>
                    </button>
                  </div>

                  <div className="emp-docs-container">
                    {documents.map((doc) => (
                      <div key={doc.id} className="doc-entry-row">
                        <input
                          type="text"
                          value={doc.name}
                          onChange={(e) => handleUpdateDocName(doc.id, e.target.value)}
                          placeholder="Document Name (e.g. Aadhar Card)"
                          className="doc-title-input h-8 px-2.5 text-xs bg-white border border-slate-300 rounded focus:border-blue-600 focus:outline-none"
                        />
                        <label className="btn-emp-action cursor-pointer text-xs py-1.5 px-3">
                          <Upload className="w-3 h-3 text-slate-600" />
                          <span>Choose File</span>
                          <input
                            type="file"
                            onChange={(e) => handleDocFileSelect(doc.id, e)}
                            className="hidden"
                          />
                        </label>
                        <span className="text-xs text-slate-500 truncate max-w-[200px]">
                          {doc.fileName}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDocRow(doc.id)}
                          className="btn-doc-remove"
                          title="Remove document row"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ================= SECTION 07: Attendance & Geofencing ================= */}
            <div className="emp-section-card">
              <div className="emp-section-header">
                <div className="emp-section-header-left">
                  <span className="emp-section-num">07</span>
                  <div>
                    <div className="emp-section-title">Attendance &amp; Geofencing</div>
                    <div className="emp-section-subtitle">Set the location validation rule for this employee</div>
                  </div>
                </div>
                <span className={`emp-pill ${geofenceValidation ? 'emp-pill-green' : 'emp-pill-gray'}`}>
                  {geofenceValidation ? 'VALIDATION ON' : 'VALIDATION OFF'}
                </span>
              </div>

              <div className="emp-inner-card">
                <label className="emp-geofence-label">
                  <input
                    type="checkbox"
                    checked={geofenceValidation}
                    onChange={(e) => setGeofenceValidation(e.target.checked)}
                    className="emp-checkbox mt-0.5"
                  />
                  <div>
                    <div className="emp-inner-card-title">Apply Geofence Validation</div>
                    <div className="emp-inner-card-desc">
                      When enabled, attendance within the allowed geofence radius is marked <strong>Proper</strong>, and outside the radius is marked <strong>Improper</strong>. When disabled, attendance is marked <strong>Proper</strong> without checking distance.
                    </div>
                    <div className="emp-geofence-caption">
                      {geofenceValidation ? 'Enabled — Validate Employee Location' : 'Disabled — Geofencing Skipped'}
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* ================= SECTION 08: Employee Portal Permissions ================= */}
            <div className="emp-section-card">
              <div className="emp-section-header">
                <div className="emp-section-header-left">
                  <span className="emp-section-num">08</span>
                  <div>
                    <div className="emp-section-title">Employee Portal Permissions</div>
                    <div className="emp-section-subtitle">Choose which modules this employee can access</div>
                  </div>
                </div>
              </div>

              <div className="emp-perms-grid">
                <label className="emp-perm-card">
                  <input
                    type="checkbox"
                    checked={permPunchAttendance}
                    onChange={(e) => setPermPunchAttendance(e.target.checked)}
                    className="emp-checkbox"
                  />
                  <span className="emp-perm-label">Punch Attendance</span>
                </label>

                <label className="emp-perm-card">
                  <input
                    type="checkbox"
                    checked={permAttendanceHistory}
                    onChange={(e) => setPermAttendanceHistory(e.target.checked)}
                    className="emp-checkbox"
                  />
                  <span className="emp-perm-label">Attendance History</span>
                </label>

                <label className="emp-perm-card">
                  <input
                    type="checkbox"
                    checked={permMonthlyPayslip}
                    onChange={(e) => setPermMonthlyPayslip(e.target.checked)}
                    className="emp-checkbox"
                  />
                  <span className="emp-perm-label">Monthly Payslip</span>
                </label>

                <label className="emp-perm-card">
                  <input
                    type="checkbox"
                    checked={permEmployeeCredentials}
                    onChange={(e) => setPermEmployeeCredentials(e.target.checked)}
                    className="emp-checkbox"
                  />
                  <span className="emp-perm-label">Employee Credentials</span>
                </label>

                <label className="emp-perm-card">
                  <input
                    type="checkbox"
                    checked={permLeavePermission}
                    onChange={(e) => setPermLeavePermission(e.target.checked)}
                    className="emp-checkbox"
                  />
                  <span className="emp-perm-label">Leave &amp; Permissions</span>
                </label>
              </div>
            </div>
          </div>

          {/* Sticky Modal Footer */}
          <div className="emp-modal-footer">
            <div className="emp-footer-brand">
              ARGUS ATTENDANCE &bull; EMPLOYEE MANAGEMENT
            </div>
            <div className="emp-footer-actions">
              <button
                type="button"
                onClick={onClose}
                className="btn-emp-footer-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="btn-emp-footer-reset"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-emp-footer-submit"
              >
                <Check className="w-4 h-4" />
                <span>{isSubmitting ? 'Saving...' : 'Save Employee'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Camera Capture Modal Overlay */}
      {isCameraActive && (
        <div className="fixed inset-0 bg-black/80 z-[1150] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between">
              <div className="text-sm font-bold flex items-center gap-2">
                <Camera className="w-4 h-4 text-sky-400" />
                <span>Capture Employee Face</span>
              </div>
              <button
                type="button"
                onClick={handleStopCamera}
                className="text-white hover:text-slate-300 font-bold"
              >
                &times;
              </button>
            </div>
            <div className="p-4 flex flex-col items-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-64 bg-slate-900 rounded-lg object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex items-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={handleStopCamera}
                  className="px-4 py-2 border border-slate-300 rounded-md text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCaptureSnapshot}
                  className="px-5 py-2 bg-blue-600 text-white rounded-md text-xs font-bold hover:bg-blue-700 flex items-center gap-1.5"
                >
                  <Camera className="w-4 h-4" />
                  <span>Snap Photo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
