import React, { useState, useEffect, useRef } from 'react';
import { 
  FileEdit, 
  Download, 
  ShieldCheck, 
  Clock, 
  Calendar, 
  User, 
  AlertCircle, 
  CheckCircle2, 
  Search, 
  Filter, 
  Edit3, 
  Trash2, 
  Lock,
  IndianRupee,
  UserPlus,
  Inbox,
  ChevronDown,
  Check
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { downloadFromServer } from '../utils/api';

export const ManualEntry = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filterTab, setFilterTab] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [submittedMessage, setSubmittedMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const dropdownRef = useRef(null);

  const [formData, setFormData] = useState({
    employeeId: '',
    logDate: new Date().toISOString().split('T')[0],
    shift: 'General Shift (09:00 AM – 05:30 PM • 8.5h)',
    shiftStart: '09:00',
    shiftEnd: '17:30',
    mode: 'Hours',
    hours: 8.0,
    manualSalary: '',
    status: 'Permission',
    reason: '',
    confirmed: true
  });

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setEmployeeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      if (diffMins < 0) diffMins += 24 * 60; // Overnight
      return Math.round((diffMins / 60) * 10) / 10;
    } catch {
      return 8.5;
    }
  };

  const scheduledHours = calculateHours(formData.shiftStart, formData.shiftEnd);



  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [empRes, ovrRes] = await Promise.all([
        api.get('/employees/').catch(() => ({ data: [] })),
        api.get('/attendance/manual').catch(() => ({ data: [] }))
      ]);

      setEmployees(empRes.data || []);
      if (empRes.data && empRes.data.length > 0) {
        const first = empRes.data[0];
        setFormData(prev => ({
          ...prev,
          employeeId: first.id,
          shift: first.assigned_shift || prev.shift,
          shiftStart: first.shift_start || prev.shiftStart,
          shiftEnd: first.shift_end || prev.shiftEnd
        }));
      }
      setRecords(ovrRes.data || []);
    } catch (err) {
      console.error('Failed to load manual entry data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.employeeId) {
      setErrorMessage('Please select an employee first. If no employees are enrolled, add them under Employee Directory.');
      return;
    }
    if (!formData.confirmed) {
      setErrorMessage('Please confirm the compliance protocol before submitting.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    try {
      const shiftText = `Shift (${formatTime12h(formData.shiftStart)} – ${formatTime12h(formData.shiftEnd)} • ${scheduledHours}h)`;
      const payload = {
        employee_id: formData.employeeId,
        log_date: formData.logDate,
        shift: shiftText,
        shift_start: formData.shiftStart,
        shift_end: formData.shiftEnd,
        punch_in: formData.shiftStart,
        punch_out: formData.shiftEnd,
        mode: formData.mode,
        status: formData.status || 'Permission',
        reason: formData.reason,
      };

      if (formData.mode === 'Hours') {
        const numHours = parseFloat(formData.hours);
        if (isNaN(numHours) || numHours < 0) {
          setErrorMessage('Please enter valid working hours.');
          setSubmitting(false);
          return;
        }
        payload.hours = numHours;
      } else {
        const numSalary = parseFloat(formData.manualSalary);
        if (isNaN(numSalary) || numSalary < 0) {
          setErrorMessage('Please enter a valid salary amount for this day.');
          setSubmitting(false);
          return;
        }
        payload.manual_salary = numSalary;
        payload.hours = 8.0; // standard equivalent full day
      }

      const res = await api.post('/attendance/manual', payload);

      setRecords(prev => [res.data, ...prev]);
      setSubmittedMessage('Attendance override verified and synced to ledger in database.');
      setTimeout(() => setSubmittedMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Failed to submit manual override.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = () => {
    const firstEmp = employees.length > 0 ? employees[0] : null;
    setFormData({
      employeeId: firstEmp ? firstEmp.id : '',
      logDate: new Date().toISOString().split('T')[0],
      shift: firstEmp?.assigned_shift || 'Shift (09:00 AM – 05:30 PM • 8.5h)',
      shiftStart: firstEmp?.shift_start || '09:00',
      shiftEnd: firstEmp?.shift_end || '17:30',
      mode: 'Hours',
      hours: 8.0,
      manualSalary: '',
      status: 'Permission',
      reason: '',
      confirmed: true
    });
    setEmployeeDropdownOpen(false);
    setEmpSearchQuery('');
  };

  const empMap = React.useMemo(() => {
    const map = {};
    (employees || []).forEach(e => {
      map[e.id] = e;
      if (e.employee_code) map[e.employee_code] = e;
    });
    return map;
  }, [employees]);

  const filteredRecords = records.map(r => {
    const emp = (r.employee_id && empMap[r.employee_id]) || (r.employee_code && empMap[r.employee_code]) || null;
    return {
      ...r,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : (r.employee_name || r.name || 'Employee'),
      employee_code: emp ? emp.employee_code : (r.employee_code || r.empCode || 'EMP'),
      department: emp ? emp.department : (r.department || r.dept || 'Operations'),
    };
  }).filter(r => {
    const name = r.employee_name || '';
    const code = r.employee_code || '';
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          code.toLowerCase().includes(searchTerm.toLowerCase());
    if (filterTab === 'Pending Audit') return matchesSearch && (r.status_type === 'pending' || r.statusType === 'pending');
    return matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Manual Attendance Entry
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (records.length === 0) {
              alert('No manual override records to export yet.');
              return;
            }
            downloadFromServer('/reports/export-csv', 'attendance_report.csv').catch((e) => alert(e?.response?.data?.detail || 'Export failed.'));
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-bold shadow-sm transition-all self-start sm:self-auto cursor-pointer"
        >
          <Download className="w-4 h-4 text-slate-500" />
          Export Logs
        </button>
      </div>

      {submittedMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{submittedMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* No Employees Notice */}
      {!loading && employees.length === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <div className="text-xs font-bold text-amber-900">No employees enrolled in your organisation yet</div>
              <div className="text-[11px] text-amber-700">Enroll your workforce to enable facial recognition and manual punch corrections.</div>
            </div>
          </div>
          <Link
            to="/attendance/enrollment"
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm whitespace-nowrap self-start sm:self-auto"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Enroll First Employee
          </Link>
        </div>
      )}

      {/* Form Card: New Override Record */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-7">
        <div className="flex items-center gap-2.5 mb-6 pb-3 border-b border-slate-100">
          <div className="w-7 h-7 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
            <FileEdit className="w-4 h-4" />
          </div>
          <h2 className="text-base font-bold text-slate-900">
            New Override Record
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Employee Identification & Selection (Searchable Dropdown) */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Employee Identification &amp; Selection *
            </label>
            {employees.length > 0 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setEmployeeDropdownOpen(!employeeDropdownOpen)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 hover:border-blue-300 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between transition-colors cursor-pointer text-left shadow-sm"
                >
                  {(() => {
                    const selectedEmp = employees.find(e => e.id === formData.employeeId);
                    if (selectedEmp) {
                      return (
                        <div className="flex items-center gap-2.5 truncate">
                          <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {(selectedEmp.first_name?.[0] || 'E') + (selectedEmp.last_name?.[0] || '')}
                          </div>
                          <span className="font-semibold text-slate-900 truncate">
                            {selectedEmp.first_name} {selectedEmp.last_name}
                          </span>
                          <span className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-xs shrink-0">
                            {selectedEmp.employee_code || 'EMP'}
                          </span>
                          <span className="text-slate-400 text-xs truncate">
                            • {selectedEmp.department || 'General'}
                          </span>
                        </div>
                      );
                    }
                    return <span className="text-slate-400">Click to select or search employee...</span>;
                  })()}
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${employeeDropdownOpen ? 'rotate-180 text-blue-600' : ''}`} />
                </button>

                {/* Dropdown Floating Panel */}
                {employeeDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-40 p-2 space-y-2 animate-in fade-in zoom-in-95 duration-100">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        autoFocus
                        value={empSearchQuery}
                        onChange={(e) => setEmpSearchQuery(e.target.value)}
                        placeholder="Type to search employee name, badge ID, or department..."
                        className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
                      />
                    </div>

                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-50">
                      {employees.filter(e => {
                        if (!empSearchQuery.trim()) return true;
                        const q = empSearchQuery.toLowerCase();
                        const fullName = `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase();
                        const code = (e.employee_code || '').toLowerCase();
                        const dept = (e.department || '').toLowerCase();
                        return fullName.includes(q) || code.includes(q) || dept.includes(q);
                      }).length > 0 ? (
                        employees.filter(e => {
                          if (!empSearchQuery.trim()) return true;
                          const q = empSearchQuery.toLowerCase();
                          const fullName = `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase();
                          const code = (e.employee_code || '').toLowerCase();
                          const dept = (e.department || '').toLowerCase();
                          return fullName.includes(q) || code.includes(q) || dept.includes(q);
                        }).map(emp => {
                          const isSelected = emp.id === formData.employeeId;
                          return (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  employeeId: emp.id,
                                  shift: emp.assigned_shift || `Shift (${emp.shift_start || '09:00'} – ${emp.shift_end || '17:30'})`,
                                  shiftStart: emp.shift_start || '09:00',
                                  shiftEnd: emp.shift_end || '17:30'
                                }));
                                setEmployeeDropdownOpen(false);
                                setEmpSearchQuery('');
                              }}
                              className={`w-full p-2 rounded-lg flex items-center justify-between text-left transition-colors cursor-pointer ${
                                isSelected ? 'bg-blue-50/80 text-blue-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                                  {(emp.first_name?.[0] || 'E') + (emp.last_name?.[0] || '')}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-slate-900 truncate">
                                    {emp.first_name} {emp.last_name}
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-400 truncate">
                                    {emp.employee_code || 'EMP'} • {emp.department || 'General'}
                                  </div>
                                </div>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-4 text-center text-xs text-slate-400 font-medium">
                          No matching employees found for "{empSearchQuery}"
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full px-3.5 py-2.5 bg-slate-100 border border-dashed border-slate-300 rounded-xl text-xs text-slate-500 flex items-center justify-between">
                <span>No enrolled employees found.</span>
                <Link to="/attendance/enrollment" className="font-bold text-blue-600 hover:underline">
                  + Enroll Employee
                </Link>
              </div>
            )}
          </div>

          {/* Row 2: Date & Scheduled Shift Timings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Log Date *
              </label>
              <input
                type="date"
                required
                value={formData.logDate}
                onChange={(e) => setFormData({ ...formData, logDate: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Scheduled Shift Timings
                </label>
                <span className="text-[10px] text-blue-600 font-bold font-mono bg-blue-50 px-1.5 py-0.5 rounded">
                  {scheduledHours} hrs scheduled
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                    Shift Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.shiftStart}
                    onChange={(e) => setFormData(prev => ({ ...prev, shiftStart: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                    Shift End Time
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.shiftEnd}
                    onChange={(e) => setFormData(prev => ({ ...prev, shiftEnd: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Mode and Worked Hours or Daily Salary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Mode *
              </label>
              <div className="relative">
                <select
                  value={formData.mode}
                  onChange={(e) => setFormData(prev => ({ ...prev, mode: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-10 cursor-pointer"
                >
                  <option value="Hours">Hours (Enter worked hours)</option>
                  <option value="Salary">Salary (Enter day salary ₹)</option>
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </div>

            <div>
              {formData.mode === 'Hours' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                      Worked Hours *
                    </label>
                    <span className="text-[10px] font-mono text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {formData.hours || 0} hrs
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    required
                    placeholder="e.g. 8.0"
                    value={formData.hours}
                    onChange={(e) => setFormData(prev => ({ ...prev, hours: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                      <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                      Day Salary (₹) *
                    </label>
                    <span className="text-[10px] font-mono text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      ₹{Number(formData.manualSalary || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    placeholder="Enter salary for this day e.g. 650"
                    value={formData.manualSalary}
                    onChange={(e) => setFormData(prev => ({ ...prev, manualSalary: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Status dropdown */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Status *
            </label>
            <div className="relative">
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-10 cursor-pointer"
              >
                <option value="Permission">Permission</option>
                <option value="Improper">Improper</option>
                <option value="Others">Others</option>
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Justification / Exception Reason (Only text input) */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Justification / Exception Reason *
            </label>
            <input
              type="text"
              required
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Type justification reason (e.g. Hardware incident, On-site duty, Face scan failure verified by supervisor)..."
              className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
            />
          </div>

          {/* Row 5: Compliance Protocol Checkbox */}
          <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl flex items-start gap-3">
            <input
              type="checkbox"
              id="compliance-check"
              checked={formData.confirmed}
              onChange={(e) => setFormData({ ...formData, confirmed: e.target.checked })}
              className="mt-1 w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="compliance-check" className="text-xs text-slate-700 leading-relaxed cursor-pointer">
              I confirm that this attendance override adheres to regulatory protocol. Overriding this entry will directly calculate into the final monthly remuneration ledger in Indian Rupee (<span className="font-bold">₹ INR</span>) and notify the biometric governance compliance committee.
            </label>
          </div>

          {/* Row 6: Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Clear Form
            </button>
            <button
              type="submit"
              disabled={submitting || employees.length === 0}
              className="px-5 py-2 bg-[#0080ff] hover:bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <FileEdit className="w-3.5 h-3.5" />
              <span>{submitting ? 'Submitting Override...' : 'Submit Attendance Override'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Table Card: Recent Manual Attendance Adjustments */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Recent Manual Attendance Adjustments
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search employee or badge..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-56"
              />
            </div>

            {/* Filter Pills */}
            <div className="inline-flex rounded-lg p-0.5 bg-slate-100 text-xs font-semibold text-slate-600">
              {['All', 'Today', 'This Week', 'Pending Audit'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilterTab(tab)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                    filterTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              Filter
            </button>
          </div>
        </div>

        {/* Table Viewport */}
        <div className="overflow-x-auto">
          {filteredRecords.length > 0 ? (
            <table className="w-full text-left text-xs text-slate-600 border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">EMPLOYEE &amp; ID</th>
                  <th className="py-3 px-4">DATE</th>
                  <th className="py-3 px-4">MODE</th>
                  <th className="py-3 px-4">OVERRIDE VALUE</th>
                  <th className="py-3 px-4">TOTAL HOURS</th>
                  <th className="py-3 px-4">OVERRIDE REASON</th>
                  <th className="py-3 px-4">AUTHORIZED BY</th>
                  <th className="py-3 px-4">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record) => {
                  const empName = record.employee_name || record.name || 'Employee';
                  const empCode = record.employee_code || record.empCode || 'EMP';
                  const dept = record.department || record.dept || 'Operations';
                  const initials = empName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

                  return (
                    <tr key={record.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Employee */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{empName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {empCode} • {dept}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                        {record.date}
                      </td>

                      {/* Mode */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          record.mode === 'Salary'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          {record.mode || 'Hours'}
                        </span>
                      </td>

                      {/* Override Value */}
                      <td className="py-3.5 px-4 font-mono font-bold whitespace-nowrap">
                        {record.mode === 'Salary' || (record.manual_salary != null && Number(record.manual_salary) > 0) ? (
                          <span className="text-emerald-700 font-bold">₹{Number(record.manual_salary).toLocaleString('en-IN')}</span>
                        ) : (
                          <span className="text-blue-700 font-bold">
                            {record.hours != null ? `${record.hours} hrs` : (record.total_hours != null ? `${record.total_hours} hrs` : '8.0 hrs')}
                          </span>
                        )}
                      </td>

                      {/* Total Hours */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-bold text-[11px] border border-slate-200">
                          {record.total_hours != null ? `${record.total_hours} hrs` : (record.hours ? `${record.hours} hrs` : '8.0 hrs')}
                        </span>
                      </td>

                      {/* Reason */}
                      <td className="py-3.5 px-4">
                        <span className="flex items-center gap-1.5 font-medium text-slate-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                          {record.reason}
                        </span>
                      </td>

                      {/* Authorized By */}
                      <td className="py-3.5 px-4 text-[11px] leading-tight text-slate-700 whitespace-pre-line font-medium">
                        {record.authorized_by || record.authorizedBy || 'System Admin'}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono font-bold text-[10px] border ${
                          record.status === 'Permission' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                          record.status === 'Improper' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          record.status === 'Others' ? 'bg-slate-100 text-slate-700 border-slate-300' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            record.status === 'Permission' ? 'bg-indigo-500' :
                            record.status === 'Improper' ? 'bg-amber-500' :
                            record.status === 'Others' ? 'bg-slate-500' :
                            'bg-emerald-500'
                          }`} />
                          {record.status || 'Approved & Synced'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">
                No manual override records found
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Any manual attendance adjustments submitted above will appear here in your organisation's audit ledger.
              </p>
            </div>
          )}
        </div>

        {/* Table Footer */}
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span>Showing {filteredRecords.length} override records</span>
            <span className="hidden sm:inline text-slate-300">•</span>
          </div>
        </div>
      </div>
    </div>
  );
};
