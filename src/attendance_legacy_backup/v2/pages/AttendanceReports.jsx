import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { 
  FileSpreadsheet, 
  Search, 
  Calendar, 
  Filter, 
  Download, 
  Printer, 
  RefreshCw, 
  X, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Users, 
  Building2, 
  FileText,
  ChevronDown
} from 'lucide-react';

export const AttendanceReports = () => {
  const { organization } = useAuth();

  // Primary Data State
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDept, setSelectedDept] = useState('All Departments');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedMode, setSelectedMode] = useState('ALL');
  const [activeDatePreset, setActiveDatePreset] = useState('all');

  // PDF Preview & Print Modal
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Initial Data Fetch
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch both all attendance records (without 500 limit) and master employees
      const [historyRes, empRes] = await Promise.all([
        api.get('/attendance/history'),
        api.get('/employees')
      ]);
      setRecords(historyRes.data || []);
      setEmployees(empRes.data || []);
    } catch (err) {
      console.error('Failed to load attendance report data', err);
      setRecords([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Master Employee Map for dynamic metadata enrichment
  const empMap = useMemo(() => {
    const map = new Map();
    (employees || []).forEach(e => {
      if (e.id) map.set(e.id, e);
      if (e.employee_code) map.set(e.employee_code, e);
    });
    return map;
  }, [employees]);

  // Dynamic unique departments list
  const departmentsList = useMemo(() => {
    const depts = new Set();
    (employees || []).forEach(e => {
      if (e.department && e.department.trim()) depts.add(e.department.trim());
    });
    (records || []).forEach(r => {
      if (r.department && r.department.trim()) depts.add(r.department.trim());
    });
    return ['All Departments', ...Array.from(depts).sort()];
  }, [employees, records]);

  // Quick Date Range Preset Handler
  const handleApplyDatePreset = (presetKey) => {
    setActiveDatePreset(presetKey);
    const now = new Date();
    const formatDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (presetKey === 'all') {
      setStartDate('');
      setEndDate('');
      return;
    }

    if (presetKey === 'today') {
      const todayStr = formatDate(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
      return;
    }

    if (presetKey === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const yStr = formatDate(yesterday);
      setStartDate(yStr);
      setEndDate(yStr);
      return;
    }

    if (presetKey === 'week') {
      const firstDay = new Date(now);
      const dayOfWeek = now.getDay(); // 0 is Sunday
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday
      firstDay.setDate(diff);
      setStartDate(formatDate(firstDay));
      setEndDate(formatDate(now));
      return;
    }

    if (presetKey === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(formatDate(firstDay));
      setEndDate(formatDate(now));
      return;
    }

    if (presetKey === 'last_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(formatDate(firstDay));
      setEndDate(formatDate(lastDay));
      return;
    }

    if (presetKey === 'year') {
      const firstDay = new Date(now.getFullYear(), 0, 1);
      setStartDate(formatDate(firstDay));
      setEndDate(formatDate(now));
      return;
    }
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setSelectedDept('All Departments');
    setSelectedStatus('ALL');
    setSelectedMode('ALL');
    setActiveDatePreset('all');
  };

  // Filtered records computation
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const recDate = r.date || (r.check_in ? r.check_in.split('T')[0] : '');

      // Start & End Date filtering
      if (startDate && recDate && recDate < startDate) return false;
      if (endDate && recDate && recDate > endDate) return false;

      // Department filter
      if (selectedDept !== 'All Departments') {
        const emp = empMap.get(r.employee_id) || empMap.get(r.employee_code);
        const dept = r.department || emp?.department || '';
        if (dept.toLowerCase() !== selectedDept.toLowerCase()) return false;
      }

      // Status filter
      if (selectedStatus !== 'ALL') {
        const isLate = r.status === 'LATE' || String(r.shift_status || '').toUpperCase().includes('LATE');
        if (selectedStatus === 'LATE' && !isLate) return false;
        if (selectedStatus === 'PRESENT' && (r.status !== 'PRESENT' && !isLate)) return false;
        if (selectedStatus === 'HALF_DAY' && r.status !== 'HALF_DAY') return false;
        if (selectedStatus === 'ABSENT' && r.status !== 'ABSENT') return false;
      }

      // Mode filter
      if (selectedMode !== 'ALL') {
        const mode = r.verification_mode || 'FACE_KIOSK';
        if (mode !== selectedMode) return false;
      }

      // Live search query matching across name, code, dept, shift, reason
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const emp = empMap.get(r.employee_id) || empMap.get(r.employee_code);
        const empName = (r.employee_name || (emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() : '')).toLowerCase();
        const empCode = (r.employee_code || emp?.employee_code || '').toLowerCase();
        const dept = (r.department || emp?.department || '').toLowerCase();
        const shift = String(r.shift || emp?.assigned_shift || '').toLowerCase();
        const status = String(r.status || '').toLowerCase();
        const mode = String(r.verification_mode || '').toLowerCase();
        const dist = String(r.entry_distance || '').toLowerCase();

        const match = empName.includes(q) || 
                      empCode.includes(q) || 
                      dept.includes(q) || 
                      shift.includes(q) || 
                      status.includes(q) || 
                      mode.includes(q) ||
                      dist.includes(q) ||
                      recDate.includes(q);

        if (!match) return false;
      }

      return true;
    });
  }, [records, startDate, endDate, selectedDept, selectedStatus, selectedMode, searchQuery, empMap]);

  // Aggregate KPI summary
  const summaryKPI = useMemo(() => {
    const total = filteredRecords.length;
    let presentCount = 0;
    let lateCount = 0;
    let halfDayCount = 0;
    let absentCount = 0;
    let totalWorkedHours = 0;

    filteredRecords.forEach(r => {
      const isLate = r.status === 'LATE' || String(r.shift_status || '').toUpperCase().includes('LATE');
      if (isLate) lateCount++;

      if (r.status === 'HALF_DAY') {
        halfDayCount++;
      } else if (r.status === 'ABSENT') {
        absentCount++;
      } else if (r.status === 'PRESENT' || isLate || (r.check_in && r.check_in !== '—')) {
        presentCount++;
      }

      const hrs = parseFloat(r.total_hours || (typeof r.hours === 'number' ? r.hours : 0));
      if (!isNaN(hrs)) totalWorkedHours += hrs;
    });

    const onTimeArrivals = Math.max(0, presentCount - lateCount);
    const onTimeRate = presentCount > 0 ? Math.round((onTimeArrivals / presentCount) * 100) : 0;

    return {
      totalRecords: total,
      presentCount,
      onTimeArrivals,
      onTimeRate,
      lateCount,
      halfDayCount,
      absentCount,
      totalWorkedHours: Math.round(totalWorkedHours * 10) / 10
    };
  }, [filteredRecords]);

  // Export CSV handler
  const handleExportCSV = () => {
    if (filteredRecords.length === 0) {
      alert('No attendance records available to export for the active filters.');
      return;
    }

    const headers = [
      'Date',
      'Day',
      'Employee Name',
      'Employee Code',
      'Department',
      'Scheduled Shift',
      'Punch In',
      'Punch Out',
      'Worked Hours',
      'Entry Distance',
      'Arrival Status',
      'Day Status',
      'Verification Mode',
      'Notes'
    ];

    const rows = filteredRecords.map(r => {
      const recDate = r.date || (r.check_in ? r.check_in.split('T')[0] : '');
      const d = recDate ? new Date(recDate) : null;
      const dayName = d && !isNaN(d) ? d.toLocaleDateString('en-US', { weekday: 'short' }) : '—';
      const emp = empMap.get(r.employee_id) || empMap.get(r.employee_code);
      const name = r.employee_name || (emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() : 'Employee');
      const code = r.employee_code || emp?.employee_code || '';
      const dept = r.department || emp?.department || '';
      const shift = r.shift || emp?.assigned_shift || 'General Shift';

      const punchIn = r.check_in_time || (r.check_in ? (r.check_in.includes('T') ? new Date(r.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : r.check_in) : '—');
      const punchOut = r.check_out_time || (r.check_out ? (r.check_out.includes('T') ? new Date(r.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : r.check_out) : '—');
      const hours = r.total_hours != null ? `${r.total_hours} hrs` : (r.hours != null ? `${r.hours} hrs` : '—');

      const isLate = r.status === 'LATE' || String(r.shift_status || '').toUpperCase().includes('LATE');
      const arrival = isLate ? 'LATE' : 'ON-TIME';
      const distance = r.entry_distance || (r.distance_meters != null ? `${Math.round(r.distance_meters)}m` : '0m (On-Site)');

      return [
        `"${recDate}"`,
        `"${dayName}"`,
        `"${name.replace(/"/g, '""')}"`,
        `"${code}"`,
        `"${dept.replace(/"/g, '""')}"`,
        `"${shift.replace(/"/g, '""')}"`,
        `"${punchIn}"`,
        `"${punchOut}"`,
        `"${hours}"`,
        `"${distance.replace(/"/g, '""')}"`,
        `"${arrival}"`,
        `"${r.status || 'PRESENT'}"`,
        `"${r.verification_mode || 'FACE_KIOSK'}"`,
        `"${(r.reason || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const startPart = startDate || 'All';
    const endPart = endDate || 'All';
    link.setAttribute('download', `Attendance_Report_${startPart}_to_${endPart}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto w-full">
      {/* ------------------------------------------------------------- */}
      {/* HEADER SECTION */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                ATTENDANCE REPORTS
                <span className="text-[11px] font-mono font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                  {summaryKPI.totalRecords} Records Found
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Comprehensive historical logs across all years, months, and days with filters, live distance metrics, and audit exports.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls: Refresh, Export CSV, Export PDF */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            title="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-[#0070ba] hover:bg-[#005da3] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SUMMARY KPI CARDS */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase font-mono tracking-wider">Total Records</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {summaryKPI.totalRecords}
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
            Matching current filter
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase font-mono tracking-wider">On-Time Arrival</span>
            <Clock className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-indigo-600 font-mono">
            {summaryKPI.onTimeRate}%
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
            {summaryKPI.onTimeArrivals} on-time arrivals
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase font-mono tracking-wider">Logged Hours</span>
            <Clock className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-2xl font-black text-cyan-700 font-mono">
            {summaryKPI.totalWorkedHours}h
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
            Total cumulative hours
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase font-mono tracking-wider">Late / Half-Day</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 font-mono">
            {summaryKPI.lateCount} <span className="text-sm font-normal text-slate-400 font-sans">/ {summaryKPI.halfDayCount}</span>
          </div>
          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
            {summaryKPI.lateCount} late • {summaryKPI.halfDayCount} half-day
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* FILTER CONTROLS & TOOLBAR */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        {/* Preset Range Pills */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-500 font-mono uppercase mr-1">Date Range:</span>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'week', label: 'This Week' },
              { id: 'month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'year', label: 'This Year' }
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleApplyDatePreset(p.id)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeDatePreset === p.id 
                    ? 'bg-blue-600 text-white shadow-xs' 
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {(startDate || endDate || searchQuery || selectedDept !== 'All Departments' || selectedStatus !== 'ALL' || selectedMode !== 'ALL') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1 rounded-lg transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Detailed Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
          {/* Live Search */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, code, dept, shift..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Start Date Picker */}
          <div>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActiveDatePreset('custom');
                }}
                className="w-full pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500"
                title="Start Date"
              />
            </div>
          </div>

          {/* End Date Picker */}
          <div>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActiveDatePreset('custom');
                }}
                className="w-full pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500"
                title="End Date"
              />
            </div>
          </div>

          {/* Department Filter */}
          <div>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500"
            >
              {departmentsList.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late Arrival</option>
              <option value="HALF_DAY">Half-Day</option>
              <option value="ABSENT">Absent</option>
            </select>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* ATTENDANCE DATA TABLE (STRICTLY READ-ONLY - NO EDIT OR DELETE) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 min-w-[950px]">
            <thead className="bg-slate-50/80 text-[10px] text-slate-500 uppercase font-mono font-bold tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-3.5">DATE & DAY</th>
                <th className="p-3.5">EMPLOYEE & CODE</th>
                <th className="p-3.5">DEPARTMENT</th>
                <th className="p-3.5">SCHEDULED SHIFT</th>
                <th className="p-3.5">PUNCH-IN</th>
                <th className="p-3.5">PUNCH-OUT</th>
                <th className="p-3.5">WORKED HOURS</th>
                <th className="p-3.5">ENTRY DISTANCE</th>
                <th className="p-3.5">ARRIVAL STATUS</th>
                <th className="p-3.5">DAY STATUS</th>
                <th className="p-3.5">VERIFICATION MODE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={11} className="p-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-7 h-7 text-blue-500 animate-spin" />
                      <p className="text-xs font-bold text-slate-700">Loading comprehensive attendance records...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Clock className="w-8 h-8 text-slate-300 stroke-1" />
                      <p className="text-xs font-bold text-slate-700">No attendance logs found matching active criteria.</p>
                      <p className="text-[11px] text-slate-400 max-w-sm">
                        Try adjusting the date range, department selection, or clearing the search query.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => {
                  const recDate = rec.date || (rec.check_in ? rec.check_in.split('T')[0] : '—');
                  const d = recDate && recDate !== '—' ? new Date(recDate) : null;
                  const dayName = d && !isNaN(d) ? d.toLocaleDateString('en-US', { weekday: 'short' }) : '—';

                  const emp = empMap.get(rec.employee_id) || empMap.get(rec.employee_code);
                  const name = rec.employee_name || (emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() : 'Employee');
                  const code = rec.employee_code || emp?.employee_code || 'EMP';
                  const initials = ((emp?.first_name?.[0] || name[0] || '') + (emp?.last_name?.[0] || '')).toUpperCase() || 'EM';
                  const dept = rec.department || emp?.department || 'Operations';
                  const shift = rec.shift || emp?.assigned_shift || 'General Shift';

                  const punchInStr = rec.check_in_time || (rec.check_in ? (
                    typeof rec.check_in === 'string' && rec.check_in.includes('T')
                      ? new Date(rec.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : rec.check_in
                  ) : '—');

                  const punchOutStr = rec.check_out_time || (rec.check_out ? (
                    typeof rec.check_out === 'string' && rec.check_out.includes('T')
                      ? new Date(rec.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : rec.check_out
                  ) : (rec.status === 'PRESENT' && (!rec.date || rec.date === new Date().toISOString().split('T')[0])) ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold font-mono">
                      ACTIVE (IN SHIFT)
                    </span>
                  ) : '—');

                  const hoursStr = rec.total_hours != null ? `${rec.total_hours} hrs` : (rec.hours != null ? `${rec.hours} hrs` : '—');
                  const isLate = rec.status === 'LATE' || String(rec.shift_status || '').toUpperCase().includes('LATE');

                  return (
                    <tr key={rec.id || `${rec.employee_id}_${recDate}`} className="hover:bg-slate-50/80 transition-colors">
                      {/* Date & Day */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-900 text-xs">{recDate}</div>
                        <div className="text-[10px] text-slate-400 font-semibold">{dayName}</div>
                      </td>

                      {/* Employee & Code */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 text-white font-bold text-[11px] flex items-center justify-center shrink-0">
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs">{name}</div>
                            <div className="text-[10px] font-mono text-slate-400 font-semibold">{code}</div>
                          </div>
                        </div>
                      </td>

                      {/* Department */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="text-slate-700 font-medium">{dept}</span>
                      </td>

                      {/* Scheduled Shift */}
                      <td className="p-3.5 whitespace-nowrap text-slate-600 text-[11px] max-w-[200px] truncate" title={shift}>
                        {shift}
                      </td>

                      {/* Punch-In */}
                      <td className="p-3.5 whitespace-nowrap font-mono text-xs font-bold text-blue-600">
                        {punchInStr}
                      </td>

                      {/* Punch-Out */}
                      <td className="p-3.5 whitespace-nowrap font-mono text-xs text-slate-700">
                        {punchOutStr}
                      </td>

                      {/* Worked Hours */}
                      <td className="p-3.5 whitespace-nowrap font-mono text-xs font-semibold text-slate-800">
                        {hoursStr}
                      </td>

                      {/* Entry Distance */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <MapPin className={`w-3.5 h-3.5 shrink-0 ${
                            (rec.distance_meters != null && rec.distance_meters > 200) || (rec.entry_distance && rec.entry_distance.includes('Off-Site'))
                              ? 'text-amber-500'
                              : 'text-emerald-500'
                          }`} />
                          <span className={`text-[10px] font-mono font-bold ${
                            (rec.distance_meters != null && rec.distance_meters > 200) || (rec.entry_distance && rec.entry_distance.includes('Off-Site'))
                              ? 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200'
                              : 'text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200'
                          }`}>
                            {rec.entry_distance || (rec.distance_meters != null ? `${Math.round(rec.distance_meters)}m` : '0m (On-Site)')}
                          </span>
                        </div>
                      </td>

                      {/* Arrival Status */}
                      <td className="p-3.5 whitespace-nowrap">
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
                      <td className="p-3.5 whitespace-nowrap">
                        {rec.status === 'HALF_DAY' ? (
                          <span className="px-2 py-0.5 rounded bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-mono font-bold">
                            HALF-DAY
                          </span>
                        ) : rec.status === 'ABSENT' ? (
                          <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-mono font-bold">
                            ABSENT
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-mono font-bold">
                            {rec.status || 'PRESENT'}
                          </span>
                        )}
                      </td>

                      {/* Verification Mode */}
                      <td className="p-3.5 whitespace-nowrap font-mono text-[10px] text-slate-500">
                        {rec.verification_mode || 'FACE_KIOSK'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>Showing {filteredRecords.length} of {records.length} total attendance records across all years/months</span>
          <span>Argus AI Biometric & Geofence Intelligence</span>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* OFFICIAL PRINTABLE PDF MODAL */}
      {/* ------------------------------------------------------------- */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-300 overflow-hidden my-auto max-h-[95vh] flex flex-col">
            
            {/* Modal Actions Bar (Hidden when printing) */}
            <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold font-mono tracking-wider uppercase">
                  Official Attendance Audit Document
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 bg-[#0070ba] hover:bg-[#005da3] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print / Save PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div className="p-6 sm:p-10 bg-white overflow-y-auto flex-1 font-sans text-slate-900 text-xs space-y-6">
              {/* Dynamic Organization Header */}
              <div className="text-center space-y-1.5 border-b border-slate-200 pb-5">
                {organization?.logo_url && (
                  <div className="flex justify-center mb-1.5">
                    <img
                      src={organization.logo_url}
                      alt={organization?.name || 'Company Logo'}
                      className="h-12 max-w-[200px] object-contain"
                    />
                  </div>
                )}
                <h1 className="text-2xl font-black tracking-tight text-[#002b80] uppercase">
                  {organization?.name || 'ARGUS TECHNOLOGIES'}
                </h1>
                <p className="text-xs text-slate-600 max-w-xl mx-auto">
                  {organization?.address || 'Corporate Headquarters & Registered Office'}
                </p>
                {((organization?.phone) || (organization?.contact_email || organization?.email) || (organization?.website) || (organization?.gstin)) && (
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500 font-mono pt-1">
                    {(organization?.phone) && (
                      <span>Phone: <strong className="text-slate-800">{organization.phone}</strong></span>
                    )}
                    {(organization?.contact_email || organization?.email) && (
                      <span>Email: <strong className="text-slate-800">{organization.contact_email || organization.email}</strong></span>
                    )}
                    {organization?.website && (
                      <span>Web: <strong className="text-slate-800">{organization.website}</strong></span>
                    )}
                    {organization?.gstin && (
                      <span>GSTIN: <strong className="text-slate-800">{organization.gstin}</strong></span>
                    )}
                  </div>
                )}
              </div>

              {/* Document Subheader / Metadata */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-slate-900 text-sm">ATTENDANCE AUDIT REPORT</div>
                  <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                    Scope: {startDate || 'Beginning of time'} to {endDate || 'Present'} • Department: {selectedDept}
                  </div>
                </div>
                <div className="sm:text-right font-mono text-[11px] text-slate-500">
                  <div>Generated: {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
                  <div>Status Filter: {selectedStatus} • Records: {summaryKPI.totalRecords}</div>
                </div>
              </div>

              {/* KPI Strip */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] text-slate-500 uppercase font-bold font-mono">Total Records</div>
                  <div className="text-base font-black text-slate-900 font-mono">{summaryKPI.totalRecords}</div>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] text-slate-500 uppercase font-bold font-mono">Present Logs</div>
                  <div className="text-base font-black text-emerald-600 font-mono">{summaryKPI.presentCount}</div>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] text-slate-500 uppercase font-bold font-mono">On-Time Arrival</div>
                  <div className="text-base font-black text-blue-600 font-mono">{summaryKPI.onTimeRate}%</div>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] text-slate-500 uppercase font-bold font-mono">Total Hours</div>
                  <div className="text-base font-black text-slate-900 font-mono">{summaryKPI.totalWorkedHours}h</div>
                </div>
              </div>

              {/* Printable Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 text-slate-700 font-mono font-bold uppercase border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Employee</th>
                      <th className="p-2.5">Code</th>
                      <th className="p-2.5">Dept</th>
                      <th className="p-2.5">Punch-In</th>
                      <th className="p-2.5">Punch-Out</th>
                      <th className="p-2.5">Hours</th>
                      <th className="p-2.5">Distance</th>
                      <th className="p-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredRecords.map((r, i) => {
                      const recDate = r.date || (r.check_in ? r.check_in.split('T')[0] : '—');
                      const emp = empMap.get(r.employee_id) || empMap.get(r.employee_code);
                      const name = r.employee_name || (emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() : 'Employee');
                      const code = r.employee_code || emp?.employee_code || '';
                      const dept = r.department || emp?.department || '';
                      const punchIn = r.check_in_time || (r.check_in ? r.check_in.split('T')[1]?.slice(0, 5) : '—');
                      const punchOut = r.check_out_time || (r.check_out ? r.check_out.split('T')[1]?.slice(0, 5) : '—');
                      const hours = r.total_hours != null ? `${r.total_hours}h` : '—';
                      const dist = r.entry_distance || (r.distance_meters != null ? `${Math.round(r.distance_meters)}m` : '0m');

                      return (
                        <tr key={i} className={i % 2 === 1 ? 'bg-slate-50/50' : ''}>
                          <td className="p-2.5 font-mono">{recDate}</td>
                          <td className="p-2.5 font-semibold text-slate-900">{name}</td>
                          <td className="p-2.5 font-mono text-slate-600">{code}</td>
                          <td className="p-2.5">{dept}</td>
                          <td className="p-2.5 font-mono font-bold text-blue-600">{punchIn}</td>
                          <td className="p-2.5 font-mono">{punchOut}</td>
                          <td className="p-2.5 font-mono font-bold">{hours}</td>
                          <td className="p-2.5 font-mono text-[10px]">{dist}</td>
                          <td className="p-2.5 font-bold font-mono">
                            {r.status || 'PRESENT'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Report Sign-off Footer */}
              <div className="pt-6 border-t border-slate-200 flex justify-between items-end text-[11px] text-slate-500 font-mono">
                <div>
                  <p>Certified by Argus AI Automated Attendance & Geofence System</p>
                  <p className="text-[10px] text-slate-400">Tamper-evident multi-factor biometric log</p>
                </div>
                <div className="text-right">
                  <div className="border-t border-slate-400 w-44 pt-1 text-center font-bold text-slate-700">
                    Authorized Signatory
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
