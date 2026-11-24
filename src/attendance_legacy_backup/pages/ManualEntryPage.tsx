import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileEdit,
  Clock,
  Calendar,
  User,
  AlertCircle,
  CheckCircle2,
  Search,
  Filter,
  Check,
  ChevronDown,
  Building2,
  ShieldCheck,
  RefreshCw,
  Download,
} from 'lucide-react';
import { attendanceApi, AttendanceEmployee } from '../api';
import { useAuth } from '@/contexts/AuthContext';

export function ManualEntryPage() {
  const { company } = useAuth();
  const companyId = company?.id || '';

  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filterTab, setFilterTab] = useState<'All' | 'Manual Overrides'>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [submittedMessage, setSubmittedMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    confirmed: true,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setEmployeeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTime12h = (time24: string) => {
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

  const calculateHours = (inTime: string, outTime: string) => {
    if (!inTime || !outTime) return 8.5;
    try {
      const [h1, m1] = inTime.split(':').map(Number);
      const [h2, m2] = outTime.split(':').map(Number);
      let diffMins = h2 * 60 + m2 - (h1 * 60 + m1);
      if (diffMins < 0) diffMins += 24 * 60; // Overnight
      return Math.round((diffMins / 60) * 10) / 10;
    } catch {
      return 8.5;
    }
  };

  const scheduledHours = calculateHours(formData.shiftStart, formData.shiftEnd);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [empRes, manRes] = await Promise.all([
        attendanceApi.getEmployees(companyId).catch(() => ({ employees: [] })),
        attendanceApi.getManualRecords(companyId).catch(() => ({ data: [] })),
      ]);

      const emps = empRes.employees || [];
      setEmployees(emps);
      if (emps.length > 0 && !formData.employeeId) {
        setFormData((prev) => ({
          ...prev,
          employeeId: emps[0].id,
        }));
      }
      setRecords(manRes.data || []);
    } catch (err: any) {
      console.error('Failed to load manual entry data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employeeId) {
      setErrorMessage('Please select an employee first.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    try {
      const shiftText = `Shift (${formatTime12h(formData.shiftStart)} – ${formatTime12h(formData.shiftEnd)} • ${scheduledHours}h)`;
      const payload: any = {
        company_id: companyId,
        employee_id: formData.employeeId,
        log_date: formData.logDate,
        shift: shiftText,
        shift_start: formData.shiftStart,
        shift_end: formData.shiftEnd,
        punch_in: formatTime12h(formData.shiftStart),
        punch_out: formatTime12h(formData.shiftEnd),
        mode: formData.mode,
        status: formData.status || 'Permission',
        reason: formData.reason,
      };

      if (formData.mode === 'Hours') {
        payload.hours = parseFloat(String(formData.hours)) || 8.0;
      } else {
        payload.manual_salary = parseFloat(String(formData.manualSalary)) || 0;
        payload.hours = 8.0;
      }

      const res = await attendanceApi.submitManualEntry(payload);
      setRecords((prev) => [res.data, ...prev]);
      setSubmittedMessage('Attendance override verified and synced to ledger in database.');
      setTimeout(() => setSubmittedMessage(''), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit manual override.');
    } finally {
      setSubmitting(false);
    }
  };

  const empMap = useMemo(() => {
    const map = new Map<string, AttendanceEmployee>();
    employees.forEach((e) => {
      map.set(e.id, e);
      if (e.employee_code) map.set(e.employee_code, e);
    });
    return map;
  }, [employees]);

  const selectedEmp = empMap.get(formData.employeeId);

  const filteredRecords = useMemo(() => {
    return records
      .map((r) => {
        const emp = empMap.get(r.employee_id) || empMap.get(r.employee_code);
        return {
          ...r,
          employee_name: emp ? `${emp.first_name} ${emp.last_name}` : r.employee_name || 'Staff',
          employee_code: emp ? emp.employee_code : r.employee_code || 'EMP',
          department: emp ? emp.department : r.department || 'Operations',
        };
      })
      .filter((r) => {
        const name = r.employee_name || '';
        const code = r.employee_code || '';
        const matchesSearch =
          name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          code.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
      });
  }, [records, empMap, searchTerm]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <FileEdit className="w-7 h-7 text-blue-600" />
            Manual Attendance Entry
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Supervisor adjustment tool for off-site duties, forgotten punches &amp; authorized exceptions
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchData()}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-bold shadow-2xs transition-all self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {submittedMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{submittedMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Record Manual Adjustment</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Updates biometric attendance and re-evaluates work hours
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Employee Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Target Employee *
              </label>
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setEmployeeDropdownOpen((o) => !o)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-left text-xs font-bold text-slate-800 flex items-center justify-between hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <span className="truncate">
                    {selectedEmp
                      ? `${selectedEmp.first_name} ${selectedEmp.last_name} (${selectedEmp.employee_code}) - ${selectedEmp.department}`
                      : 'Choose an employee...'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                </button>

                {employeeDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-2 max-h-60 overflow-y-auto">
                    <input
                      type="text"
                      placeholder="Search employee..."
                      value={empSearchQuery}
                      onChange={(e) => setEmpSearchQuery(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 mb-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <div className="divide-y divide-slate-50">
                      {employees
                        .filter(
                          (e) =>
                            !empSearchQuery ||
                            `${e.first_name} ${e.last_name}`
                              .toLowerCase()
                              .includes(empSearchQuery.toLowerCase()) ||
                            e.employee_code.toLowerCase().includes(empSearchQuery.toLowerCase())
                        )
                        .map((emp) => (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => {
                              setFormData((prev) => ({ ...prev, employeeId: emp.id }));
                              setEmployeeDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 rounded-lg flex items-center justify-between"
                          >
                            <span className="font-semibold text-slate-800">
                              {emp.first_name} {emp.last_name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {emp.employee_code}
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Log Date *
              </label>
              <input
                type="date"
                value={formData.logDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, logDate: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Shift In & Out Times */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Check-In Time
                </label>
                <input
                  type="time"
                  value={formData.shiftStart}
                  onChange={(e) => setFormData((prev) => ({ ...prev, shiftStart: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Check-Out Time
                </label>
                <input
                  type="time"
                  value={formData.shiftEnd}
                  onChange={(e) => setFormData((prev) => ({ ...prev, shiftEnd: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Status & Hours */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Attendance Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                >
                  <option value="PRESENT">Present</option>
                  <option value="Permission">Permission</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="OVERTIME">Overtime</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Total Hours
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={formData.hours}
                  onChange={(e) => setFormData((prev) => ({ ...prev, hours: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Reason / Note *
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Field customer site visit, forgotten optical badge..."
                value={formData.reason}
                onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/25 transition-all disabled:opacity-50"
            >
              {submitting ? 'Submitting Override...' : 'Save & Sync Attendance'}
            </button>
          </form>
        </div>

        {/* Right Log Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Recent Manual Adjustments</span>
              </h2>
              <p className="text-[11px] text-slate-500">
                Audited punch logs with supervisor timestamps
              </p>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search staff or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-44 sm:w-56"
              />
            </div>
          </div>

          <div className="flex-1 overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                <tr>
                  <th className="px-3 py-2.5 rounded-l-lg">Staff Member</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Timings</th>
                  <th className="px-3 py-2.5">Hours</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 rounded-r-lg">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400 italic">
                      No manual adjustments recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-900">{r.employee_name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{r.employee_code} &bull; {r.department}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-800 whitespace-nowrap">
                        {r.log_date}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap">
                        {r.check_in_time || '—'} – {r.check_out_time || '—'}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">
                        {r.total_hours}h
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          {r.status || 'Override'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 max-w-xs truncate" title={r.remarks}>
                        {r.remarks || 'Supervisor adjustment'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
