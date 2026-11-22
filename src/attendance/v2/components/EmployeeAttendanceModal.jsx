import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { 
  X, 
  Calendar, 
  Clock, 
  Download, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Building2, 
  Briefcase, 
  RefreshCw,
  Filter,
  UserCheck
} from 'lucide-react';

export const EmployeeAttendanceModal = ({ isOpen, onClose, employee }) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch employee attendance history when modal opens
  useEffect(() => {
    if (isOpen && employee?.id) {
      fetchAttendanceHistory();
    }
  }, [isOpen, employee?.id]);

  const fetchAttendanceHistory = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/attendance/history?employee_id=${employee.id}`);
      setRecords(res.data || []);
    } catch (err) {
      console.error('Failed to load employee attendance history', err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const monthsList = [
    { value: 'ALL', label: 'All Months' },
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  const currentYearNum = new Date().getFullYear();
  const yearsList = ['ALL'];
  for (let y = currentYearNum + 2; y >= 2022; y--) {
    yearsList.push(String(y));
  }

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const recDate = r.date || (r.check_in ? r.check_in.split('T')[0] : '');
      if (selectedYear !== 'ALL' && recDate) {
        if (!recDate.startsWith(selectedYear)) return false;
      }
      if (selectedMonth !== 'ALL' && recDate) {
        const parts = recDate.split('-');
        if (parts[1] !== selectedMonth) return false;
      }

      if (statusFilter !== 'ALL') {
        if (statusFilter === 'LATE' && !(r.status === 'LATE' || String(r.shift_status || '').toUpperCase().includes('LATE'))) {
          return false;
        }
        if (statusFilter === 'PRESENT' && (r.status !== 'PRESENT' && r.status !== 'LATE')) {
          return false;
        }
        if (statusFilter === 'HALF_DAY' && r.status !== 'HALF_DAY') {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const dateMatch = recDate.toLowerCase().includes(q);
        const shiftMatch = String(r.shift || '').toLowerCase().includes(q);
        const statusMatch = String(r.status || '').toLowerCase().includes(q);
        const reasonMatch = String(r.reason || '').toLowerCase().includes(q);
        if (!dateMatch && !shiftMatch && !statusMatch && !reasonMatch) return false;
      }

      return true;
    });
  }, [records, selectedYear, selectedMonth, statusFilter, searchQuery]);

  // Compute KPI statistics over the filtered set
  const stats = useMemo(() => {
    const total = filteredRecords.length;
    let presentCount = 0;
    let lateCount = 0;
    let halfDayCount = 0;
    let totalHours = 0;

    filteredRecords.forEach(r => {
      const isLate = r.status === 'LATE' || String(r.shift_status || '').toUpperCase().includes('LATE');
      if (isLate) lateCount++;

      if (r.status === 'HALF_DAY') {
        halfDayCount++;
      } else if (r.status === 'PRESENT' || isLate || (r.check_in && r.check_in !== '—')) {
        presentCount++;
      }

      const hrs = parseFloat(r.total_hours || (typeof r.hours === 'number' ? r.hours : 0));
      if (!isNaN(hrs)) totalHours += hrs;
    });

    const onTimeCount = Math.max(0, presentCount - lateCount);
    const onTimeRate = presentCount > 0 ? Math.round((onTimeCount / presentCount) * 100) : 0;

    return {
      total,
      presentCount,
      onTimeCount,
      lateCount,
      halfDayCount,
      totalHours: Math.round(totalHours * 10) / 10,
      onTimeRate
    };
  }, [filteredRecords]);

  // Export filtered attendance records as CSV
  const handleExportCSV = () => {
    if (filteredRecords.length === 0) {
      alert('No attendance records to export for this selection.');
      return;
    }

    const headers = ['Date', 'Day', 'Employee Name', 'Employee Code', 'Department', 'Shift', 'Punch In', 'Punch Out', 'Worked Hours', 'Arrival Status', 'Day Status', 'Verification Mode', 'Notes/Reason'];
    const rows = filteredRecords.map(r => {
      const d = r.date ? new Date(r.date) : (r.check_in ? new Date(r.check_in) : null);
      const dayName = d && !isNaN(d) ? d.toLocaleDateString('en-US', { weekday: 'short' }) : '—';
      const isLate = r.status === 'LATE' || String(r.shift_status || '').toUpperCase().includes('LATE');
      const arrival = isLate ? 'LATE' : 'ON-TIME';
      const hoursStr = r.hours || `${r.total_hours || 0} hrs`;

      return [
        `"${r.date || ''}"`,
        `"${dayName}"`,
        `"${r.employee_name || `${employee?.first_name} ${employee?.last_name}`.trim()}"`,
        `"${r.employee_code || employee?.employee_code || ''}"`,
        `"${r.department || employee?.department || ''}"`,
        `"${(r.shift || employee?.assigned_shift || '').replace(/"/g, '""')}"`,
        `"${r.check_in_time || (r.check_in ? r.check_in.split('T')[1]?.slice(0, 5) : '') || '—'}"`,
        `"${r.check_out_time || (r.check_out ? r.check_out.split('T')[1]?.slice(0, 5) : '') || '—'}"`,
        `"${hoursStr}"`,
        `"${arrival}"`,
        `"${r.status || 'PRESENT'}"`,
        `"${r.verification_mode || 'KIOSK_BIOMETRIC'}"`,
        `"${(r.reason || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${employee?.employee_code || 'Employee'}_Attendance_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen || !employee) return null;

  const fullName = `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || 'Employee';
  const initials = ((employee.first_name?.[0] || '') + (employee.last_name?.[0] || '')).toUpperCase() || 'EM';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] my-auto">
        
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-slate-800 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-900 truncate tracking-tight">
                  {fullName}
                </h2>
                <span className="font-mono text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-xs font-bold">
                  {employee.employee_code || 'EMP'}
                </span>
                {employee.has_biometric ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    128-D Enrolled
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    Pending Biometrics
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {employee.department || 'Operations'}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  {employee.designation || 'Staff'}
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-600">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {employee.assigned_shift || 'General Shift (09:00 AM – 05:30 PM)'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCSV}
              title="Export Employee Attendance Log"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Total Logged */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Total Logs</span>
              <span className="text-2xl font-black text-slate-900 mt-1 block">{stats.total}</span>
              <span className="text-[10px] font-semibold text-slate-400">Punched sessions</span>
            </div>

            {/* Present Days */}
            <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">Present Days</span>
              <span className="text-2xl font-black text-emerald-700 mt-1 block">{stats.presentCount}</span>
              <span className="text-[10px] font-semibold text-emerald-600">Active full days</span>
            </div>

            {/* On-Time Arrivals */}
            <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block">On-Time</span>
              <span className="text-2xl font-black text-blue-700 mt-1 block">{stats.onTimeCount}</span>
              <span className="text-[10px] font-semibold text-blue-600">{stats.onTimeRate}% punctuality</span>
            </div>

            {/* Late Arrivals */}
            <div className="bg-amber-50/60 p-3.5 rounded-xl border border-amber-200/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">Late Arrivals</span>
              <span className="text-2xl font-black text-amber-600 mt-1 block">{stats.lateCount}</span>
              <span className="text-[10px] font-semibold text-amber-700">Grace exceeded</span>
            </div>

            {/* Half Days */}
            <div className="bg-purple-50/60 p-3.5 rounded-xl border border-purple-200/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 block">Half-Day</span>
              <span className="text-2xl font-black text-purple-700 mt-1 block">{stats.halfDayCount}</span>
              <span className="text-[10px] font-semibold text-purple-600">Short shifts</span>
            </div>

            {/* Total Worked Hours */}
            <div className="bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-200/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 block">Total Hours</span>
              <span className="text-2xl font-black text-indigo-700 mt-1 block">{stats.totalHours}</span>
              <span className="text-[10px] font-semibold text-indigo-600 font-mono">Cumulative hrs</span>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Duration: Month & Year */}
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[11px] font-bold uppercase text-slate-500">Duration:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  {monthsList.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  {yearsList.map(y => (
                    <option key={y} value={y}>{y === 'ALL' ? 'All Years' : y}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter Pills */}
              <div className="inline-flex bg-slate-100 p-0.5 rounded-lg text-[10px] font-bold">
                {['ALL', 'PRESENT', 'LATE', 'HALF_DAY'].map(st => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                      statusFilter === st
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st === 'HALF_DAY' ? 'HALF-DAY' : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Search */}
            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search date, shift, status..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Attendance Log Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 min-w-[650px]">
                <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-3">DATE &amp; DAY</th>
                    <th className="p-3">SCHEDULED SHIFT</th>
                    <th className="p-3">PUNCH-IN</th>
                    <th className="p-3">PUNCH-OUT</th>
                    <th className="p-3">HOURS</th>
                    <th className="p-3">ARRIVAL</th>
                    <th className="p-3">STATUS</th>
                    <th className="p-3">SOURCE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                          <p className="text-xs font-semibold text-slate-600">Loading attendance reports...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Calendar className="w-7 h-7 text-slate-300 stroke-1" />
                          <p className="text-xs font-bold text-slate-700">No attendance records found.</p>
                          <p className="text-[11px] text-slate-400 max-w-sm">
                            No logs logged for this employee under the selected duration and filters.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((rec) => {
                      const d = rec.date ? new Date(rec.date) : (rec.check_in ? new Date(rec.check_in) : null);
                      const formattedDate = rec.date || (d && !isNaN(d) ? d.toISOString().split('T')[0] : '—');
                      const dayName = d && !isNaN(d) ? d.toLocaleDateString('en-US', { weekday: 'short' }) : '';
                      const isLate = rec.status === 'LATE' || String(rec.shift_status || '').toUpperCase().includes('LATE');
                      const isManual = rec.verification_mode === 'MANUAL_OVERRIDE' || rec.mode === 'Salary' || rec.mode === 'Hours';

                      return (
                        <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* Date & Day */}
                          <td className="p-3 font-mono font-semibold text-slate-900">
                            <div className="text-xs">{formattedDate}</div>
                            {dayName && <div className="text-[10px] text-slate-400 font-bold uppercase">{dayName}</div>}
                          </td>

                          {/* Scheduled Shift */}
                          <td className="p-3 text-[11px] text-slate-600 max-w-[180px] truncate">
                            {rec.shift || employee.assigned_shift || 'General Shift'}
                          </td>

                          {/* Punch In */}
                          <td className="p-3 font-mono text-xs font-bold text-blue-600">
                            {rec.check_in_time || (rec.check_in ? (rec.check_in.includes('T') ? rec.check_in.split('T')[1]?.slice(0, 5) : rec.check_in) : '—')}
                          </td>

                          {/* Punch Out */}
                          <td className="p-3 font-mono text-xs font-bold text-slate-700">
                            {rec.check_out_time || (rec.check_out ? (rec.check_out.includes('T') ? rec.check_out.split('T')[1]?.slice(0, 5) : rec.check_out) : '—')}
                          </td>

                          {/* Worked Hours */}
                          <td className="p-3 font-mono text-xs font-semibold text-slate-700">
                            {rec.hours || `${rec.total_hours != null ? rec.total_hours : 0} hrs`}
                          </td>

                          {/* Arrival Status */}
                          <td className="p-3">
                            {isLate ? (
                              <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-mono font-bold">
                                LATE
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono font-bold">
                                ON-TIME
                              </span>
                            )}
                          </td>

                          {/* Day Status */}
                          <td className="p-3">
                            {rec.status === 'HALF_DAY' ? (
                              <span className="px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-800 text-[10px] font-mono font-bold">
                                HALF-DAY
                              </span>
                            ) : (rec.status === 'PRESENT' || rec.status === 'LATE' || rec.check_in) ? (
                              <span className="px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 text-[10px] font-mono font-bold">
                                PRESENT
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 text-[10px] font-mono font-bold">
                                ABSENT
                              </span>
                            )}
                          </td>

                          {/* Verification Source */}
                          <td className="p-3">
                            {isManual ? (
                              <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[9px] font-mono font-bold">
                                MANUAL OVERRIDE
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[9px] font-mono font-bold">
                                KIOSK BIOMETRIC
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Bottom Pagination / Summary */}
            <div className="border-t border-slate-100 p-3 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500 font-medium">
              <div>
                Showing <strong className="text-slate-800">{filteredRecords.length}</strong> log entries for this employee
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-400 font-medium">
            Reports synced with biometric cloud records
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            Close Report
          </button>
        </div>

      </div>
    </div>
  );
};
