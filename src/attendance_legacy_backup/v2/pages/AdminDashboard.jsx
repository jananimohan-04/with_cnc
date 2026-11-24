import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api, { downloadFromServer } from '../utils/api';
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS } from '../components/EnrollEmployeeModal';
import { RevokeAccessModal } from '../components/RevokeAccessModal';
import { WorkforceMetricsModal } from '../components/WorkforceMetricsModal';
import { 
  Users, 
  UserCheck, 
  Clock, 
  AlertTriangle, 
  Download, 
  Plus, 
  Search, 
  Building2, 
  Calendar, 
  FileSpreadsheet, 
  ShieldAlert, 
  CheckCircle2,
  Trash2,
  Edit2,
  Filter,
  BarChart3,
  TrendingUp,
  X,
  Check,
  RefreshCw,
  ArrowUpRight,
  MapPin
} from 'lucide-react';

export const AdminDashboard = () => {
  const { organization } = useAuth();
  const [timeRange, setTimeRange] = useState('TODAY'); // 'TODAY', 'WEEKLY', 'MONTHLY'
  const [selectedDept, setSelectedDept] = useState('All Departments');
  const [searchQuery, setSearchQuery] = useState('');

  const [todayData, setTodayData] = useState({ summary: {}, records: [] });
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // Workforce Metrics Drill-down Modal State
  const [metricsModalOpen, setMetricsModalOpen] = useState(false);
  const [activeMetricTab, setActiveMetricTab] = useState('TOTAL'); // 'TOTAL' | 'ON_TIME' | 'LATE' | 'ABSENT'

  // Revoke Biometric Access Confirmation Modal State
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Edit Employee Modal State
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editFormData, setEditFormData] = useState({
    first_name: '',
    last_name: '',
    employee_code: '',
    email: '',
    department: 'Operations',
    designation: 'Staff',
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
    assigned_shift: 'General Shift (09:00 AM – 05:30 PM • 8.5h)',
    shift_start: '09:00',
    shift_end: '17:30',
    permissions: DEFAULT_PERMISSIONS
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, 6000);

    const onFocus = () => {
      fetchDashboardData(true);
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const fetchDashboardData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const clientDate = new Date().toISOString().split('T')[0];
      const [attRes, empRes, leavesRes] = await Promise.all([
        api.get(`/attendance/today?client_date=${clientDate}`),
        api.get('/employees/'),
        api.get('/leaves').catch(() => ({ data: [] }))
      ]);
      setTodayData(attRes.data || { summary: {}, records: [] });
      setEmployees(empRes.data || []);
      setLeaves(leavesRes.data || []);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  const handleOpenMetricsModal = (tab = 'TOTAL') => {
    setActiveMetricTab(tab);
    setMetricsModalOpen(true);
  };

  const handleExportCSV = () => {
    downloadFromServer('/reports/export-csv', 'attendance_report.csv').catch((e) => alert(e?.response?.data?.detail || 'Export failed.'));
  };

  const handleExportExcel = () => {
    downloadFromServer('/reports/export-excel', 'attendance_report.xlsx').catch((e) => alert(e?.response?.data?.detail || 'Export failed.'));
  };

  const handleOpenEdit = (emp) => {
    setEditingEmployee(emp);
    setEditFormData({
      first_name: emp.first_name || '',
      last_name: emp.last_name || '',
      employee_code: emp.employee_code || '',
      email: emp.email || '',
      department: emp.department || 'Operations',
      designation: emp.designation || 'Staff',
      phone: emp.phone || '',
      hourly_rate: emp.hourly_rate != null ? emp.hourly_rate : 250,
      daily_wage_rate: emp.daily_wage_rate != null ? emp.daily_wage_rate : 600,
      half_day_salary: emp.half_day_salary != null ? emp.half_day_salary : ((emp.daily_wage_rate || 600) / 2),
      aadhar_number: emp.aadhar_number || '',
      emergency_contact: emp.emergency_contact || '',
      joining_date: emp.joining_date || '',
      account_holder_name: emp.account_holder_name || '',
      upi_number: emp.upi_number || '',
      bank_name: emp.bank_name || '',
      account_number: emp.account_number || '',
      ifsc_code: emp.ifsc_code || '',
      shift_hours: emp.shift_hours || '08:00',
      assigned_shift: emp.assigned_shift || 'General Shift (09:00 AM – 05:30 PM • 8.5h)',
      shift_start: emp.shift_start || '09:00',
      shift_end: emp.shift_end || '17:30',
      permissions: emp.permissions || DEFAULT_PERMISSIONS
    });
    setEditError('');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setEditSaving(true);
    setEditError('');
    try {
      await api.put(`/employees/${editingEmployee.id}`, editFormData);
      setEditingEmployee(null);
      await fetchDashboardData();
    } catch (err) {
      setEditError(err.response?.data?.detail || 'Failed to update employee details.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!employeeToDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/employees/${employeeToDelete.id}`);
      setEmployeeToDelete(null);
      await fetchDashboardData();
    } catch (err) {
      console.error('Failed to remove employee', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Real metrics computation (no mock fallbacks)
  const totalEmployees = todayData.summary?.total_employees ?? employees.length ?? 0;
  const totalRoster = totalEmployees;
  const presentCount = todayData.summary?.present ?? 0;
  const lateCount = todayData.summary?.late ?? 0;
  const absentCount = todayData.summary?.absent ?? Math.max(0, totalRoster - presentCount);

  const presentRate = totalRoster > 0 ? ((presentCount / totalRoster) * 100).toFixed(1) : '0.0';
  const onTimeRate = totalRoster > 0 ? (((presentCount - lateCount) / totalRoster) * 100).toFixed(1) : '0.0';
  const lateRate = totalRoster > 0 ? ((lateCount / totalRoster) * 100).toFixed(1) : '0.0';
  const absentRate = totalRoster > 0 ? ((absentCount / totalRoster) * 100).toFixed(1) : '0.0';

  // Active workforce IDs set
  const activeEmpIds = React.useMemo(() => new Set((employees || []).map(e => e.id)), [employees]);

  // Employee Map for dynamic name and detail enrichment
  const empMap = React.useMemo(() => {
    const map = new Map();
    (employees || []).forEach(e => map.set(e.id, e));
    return map;
  }, [employees]);

  // Live records enriched with current master data
  const records = React.useMemo(() => {
    const raw = todayData.records || [];
    return raw.map(r => {
      const emp = empMap.get(r.employee_id);
      if (emp) {
        const fn = emp.first_name || '';
        const ln = emp.last_name || '';
        const fullName = `${fn} ${ln}`.trim() || emp.name || r.employee_name;
        return {
          ...r,
          employee_name: fullName,
          employee_code: emp.employee_code || r.employee_code,
          department: emp.department || r.department
        };
      }
      return r;
    });
  }, [todayData.records, empMap]);

  // Filtering records by department & search
  const filteredRecords = records.filter(r => {
    const matchesDept = selectedDept === 'All Departments' || r.department?.toLowerCase() === selectedDept.toLowerCase();
    const query = searchQuery.toLowerCase();
    const matchesQuery = !query || 
      r.employee_name?.toLowerCase().includes(query) || 
      r.employee_code?.toLowerCase().includes(query) ||
      r.department?.toLowerCase().includes(query);
    return matchesDept && matchesQuery;
  });

  // Dynamic department attendance ratios based on actual enrolled employees
  const departmentStats = React.useMemo(() => {
    if (!employees || employees.length === 0) return [];
    const deptMap = {};
    employees.forEach(emp => {
      const dept = emp.department || 'General';
      if (!deptMap[dept]) deptMap[dept] = { total: 0, present: 0 };
      deptMap[dept].total += 1;
    });
    records.forEach(rec => {
      const dept = rec.department || 'General';
      if (deptMap[dept]) deptMap[dept].present += 1;
    });
    return Object.entries(deptMap).map(([dept, data]) => {
      const pct = data.total > 0 ? Math.round((data.present / data.total) * 100) : 0;
      return { dept, present: data.present, total: data.total, pct };
    });
  }, [employees, records]);

  // Distinct registered departments only (no hardcoding)
  const registeredDepartments = React.useMemo(() => {
    const depts = new Set();
    (employees || []).forEach(emp => {
      if (emp.department && emp.department.trim()) depts.add(emp.department.trim());
    });
    (records || []).forEach(rec => {
      if (rec.department && rec.department.trim()) depts.add(rec.department.trim());
    });
    return ['All Departments', ...Array.from(depts)];
  }, [employees, records]);

  return (
    <div className="space-y-6">
      {/* Top Banner Header: Title + Export (Matches Image 1) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 uppercase">
              ANALYTICS ATTENDANCE DASHBOARD
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => fetchDashboardData()}
            className="flex-1 sm:flex-none py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh dashboard data"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${loading ? 'animate-spin' : ''}`} />
            <span>REFRESH</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="flex-1 sm:flex-none py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>CSV EXPORT</span>
          </button>
        </div>
      </div>

      {/* 4 Stat Cards Row (Interactive Drill-downs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Workforce */}
        <div 
          onClick={() => handleOpenMetricsModal('TOTAL')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative flex flex-col justify-between cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-blue-400 group select-none"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-blue-600 transition-colors">
                TOTAL WORKFORCE
              </span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1 my-1">
              <span className="text-3xl font-black text-slate-900">{totalRoster}</span>
              <span className="text-xs text-slate-400 font-semibold">({presentCount} Active today)</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-semibold mb-2">
              <span className="text-emerald-700 font-bold">{presentCount} Present</span>
              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-mono font-bold">
                {presentRate}% Rate
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-blue-600 h-full rounded-full" style={{ width: `${presentRate}%` }} />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-blue-600 group-hover:text-blue-700">
            <span>View all employees &amp; details</span>
            <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </div>

        {/* Card 2: On-Time Arrivals */}
        <div 
          onClick={() => handleOpenMetricsModal('ON_TIME')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative flex flex-col justify-between cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-emerald-400 group select-none"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-emerald-600 transition-colors">
                ON-TIME ARRIVALS
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1 my-1">
              <span className="text-3xl font-black text-emerald-600">{presentCount - lateCount}</span>
              <span className="text-xs text-slate-400 font-semibold">/ {presentCount} active</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-semibold mb-2">
              <span className="text-slate-500">Punctual Check-ins</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-mono font-bold">
                {onTimeRate}% Rate
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${onTimeRate}%` }} />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-emerald-600 group-hover:text-emerald-700">
            <span>View punctual employees &amp; timings</span>
            <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </div>

        {/* Card 3: Late Arrivals */}
        <div 
          onClick={() => handleOpenMetricsModal('LATE')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative flex flex-col justify-between cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-amber-400 group select-none"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-amber-600 transition-colors">
                LATE ARRIVALS
              </span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1 my-1">
              <span className="text-3xl font-black text-amber-500">{lateCount}</span>
              <span className="text-xs text-slate-400 font-semibold">/ {presentCount} active</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-semibold mb-2">
              <span className="text-slate-500">Grace Exceeded</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-mono font-bold">
                {lateRate}% Rate
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-amber-500 h-full rounded-full" style={{ width: `${lateRate}%` }} />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-amber-600 group-hover:text-amber-700">
            <span>View late arrivals &amp; delay timings</span>
            <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </div>

        {/* Card 4: Absent / On Leave */}
        <div 
          onClick={() => handleOpenMetricsModal('ABSENT')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs relative flex flex-col justify-between cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-red-400 group select-none"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-red-600 transition-colors">
                ABSENT / ON LEAVE
              </span>
              <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-red-500 group-hover:bg-red-600 group-hover:text-white transition-colors">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1 my-1">
              <span className="text-3xl font-black text-red-500">{absentCount}</span>
              <span className="text-xs text-slate-400 font-semibold">/ {totalRoster} roster</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-semibold mb-2">
              <span className="text-slate-500">Unaccounted / Off</span>
              <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[10px] font-mono font-bold">
                {absentRate}% Rate
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-red-500 h-full rounded-full" style={{ width: `${absentRate}%` }} />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-red-600 group-hover:text-red-700">
            <span>View absent &amp; on-leave staff</span>
            <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar (Matches Image 1) */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Left: Range Pills & Department Dropdown */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Time Range Pills */}
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase">
            <span>RANGE:</span>
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg">
              {['TODAY', 'WEEKLY', 'MONTHLY'].map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    timeRange === range
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          {/* Department Select Dropdown */}
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase">
            <span>DEPT:</span>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              {registeredDepartments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Search Input + Clear */}
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, biometric ID, or badge..."
            className="w-full md:w-80 pl-9 pr-14 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-[10px] font-bold font-mono text-slate-400 hover:text-slate-700 bg-slate-200/70 px-1.5 py-0.5 rounded cursor-pointer"
            >
              CLEAR
            </button>
          )}
        </div>
      </div>

      {/* Main Attendance Data Table (Matches Image 1) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 min-w-[700px]">
            <thead className="bg-slate-50/80 text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-3.5">EMPLOYEE & ID</th>
                <th className="p-3.5">PUNCH-IN</th>
                <th className="p-3.5">PUNCH-OUT</th>
                <th className="p-3.5">DEPT</th>
                <th className="p-3.5">ENTRY DISTANCE</th>
                <th className="p-3.5">SHIFT STATUS</th>
                <th className="p-3.5">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Clock className="w-8 h-8 text-slate-300 stroke-1" />
                      <p className="text-xs font-bold text-slate-600">
                        No attendance records logged for today.
                      </p>
                      <p className="text-[11px] text-slate-400 max-w-sm">
                        Live punches from the attendance kiosk will appear here in real-time as employees verify their face.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                  {/* Employee & ID */}
                  <td className="p-3.5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold text-xs flex items-center justify-center shrink-0">
                      {rec.avatar_init || rec.employee_name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs">{rec.employee_name}</div>
                      <div className="text-[10px] font-mono text-slate-400 font-semibold">{rec.employee_code}</div>
                    </div>
                  </td>

                  {/* Punch In */}
                  <td className="p-3.5 font-mono text-xs font-bold text-blue-600">
                    {rec.check_in_time || (rec.check_in ? (typeof rec.check_in === 'string' && rec.check_in.includes('T') ? new Date(rec.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : rec.check_in) : '—')}
                  </td>

                  {/* Punch Out */}
                  <td className="p-3.5 font-mono text-xs text-slate-700">
                    {rec.check_out_time || (rec.check_out ? (
                      typeof rec.check_out === 'string' && rec.check_out.includes('T')
                        ? new Date(rec.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        : rec.check_out
                    ) : (
                      rec.status === 'PRESENT' ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold font-mono">
                          ACTIVE (IN SHIFT)
                        </span>
                      ) : '—'
                    ))}
                  </td>

                  {/* Dept */}
                  <td className="p-3.5 text-xs text-slate-700">
                    {rec.department}
                  </td>

                  {/* Entry Distance */}
                  <td className="p-3.5">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
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

                  {/* Shift Status: strictly 'LATE' or 'ON-TIME' */}
                  <td className="p-3.5">
                    {(rec.shift_status?.includes('LATE') || rec.status === 'LATE') ? (
                      <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-mono font-bold">
                        LATE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono font-bold">
                        ON-TIME
                      </span>
                    )}
                  </td>

                  {/* Status: 'PRESENT', 'HALF_DAY', or 'ABSENT' */}
                  <td className="p-3.5">
                    {rec.status === 'HALF_DAY' ? (
                      <span className="px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[10px] font-mono font-bold">
                        HALF-DAY
                      </span>
                    ) : (rec.status === 'PRESENT' || (rec.check_in && rec.check_in !== '—')) ? (
                      <span className="px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50/60 text-emerald-800 text-[10px] font-mono font-bold">
                        PRESENT
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 text-[10px] font-mono font-bold">
                        ABSENT
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Footer */}
        <div className="border-t border-slate-100 p-3.5 flex items-center justify-between text-xs text-slate-500 font-medium">
          <div>
            Showing <strong className="text-slate-800">1 to {filteredRecords.length}</strong> of {totalEmployees} punch logs
          </div>
          <div className="flex items-center gap-1">
            <button className="px-2.5 py-1 rounded border border-slate-200 text-slate-400 text-xs disabled:opacity-50" disabled>
              Previous
            </button>
            <button className="px-2.5 py-1 rounded bg-blue-50 border border-blue-200 text-blue-600 text-xs font-bold font-mono">
              1
            </button>
            <button className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 text-xs hover:bg-slate-50">
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Department Ratios */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Enrolled Department Attendance Ratios</h3>
            </div>
          </div>
          <span className="text-xs font-bold text-blue-600 font-mono bg-blue-50 px-2.5 py-1 rounded-md">
            {departmentStats.length} Registered Depts
          </span>
        </div>

        {departmentStats.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs font-mono">
            No registered departments found. Add employees to view attendance ratios.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {departmentStats.map(ds => (
              <div key={ds.department} className="p-3 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="truncate pr-2">{ds.department}</span>
                  <span className="font-mono text-blue-600">
                    {ds.present}/{ds.total} ({ds.pct}%)
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-blue-600 h-full rounded-full transition-all duration-300" 
                    style={{ width: `${ds.pct}%` }} 
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Employee Modal with Permissions */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 my-auto max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Edit Employee &amp; Permissions
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    ID: {editingEmployee.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {editError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{editError}</span>
                  </div>
                )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.first_name}
                    onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.last_name}
                    onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Employee Code
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.employee_code}
                    onChange={(e) => setEditFormData({ ...editFormData, employee_code: e.target.value })}
                    className="w-full text-xs font-mono font-bold text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.department}
                    onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.designation}
                    onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Salary & Compensation */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <label className="block text-xs font-bold text-slate-800">
                  Salary Structure (₹)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Hourly Salary *
                    </label>
                    <input
                      type="number"
                      step="10"
                      min="0"
                      value={editFormData.hourly_rate}
                      onChange={(e) => setEditFormData({ ...editFormData, hourly_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Day Salary *
                    </label>
                    <input
                      type="number"
                      step="50"
                      min="0"
                      value={editFormData.daily_wage_rate}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setEditFormData({ 
                          ...editFormData, 
                          daily_wage_rate: val,
                          half_day_salary: Math.round(val / 2)
                        });
                      }}
                      className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Half Day Salary *
                    </label>
                    <input
                      type="number"
                      step="25"
                      min="0"
                      value={editFormData.half_day_salary}
                      onChange={(e) => setEditFormData({ ...editFormData, half_day_salary: parseFloat(e.target.value) || 0 })}
                      className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Contact, Identity & Shift */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Mobile Number *
                  </label>
                  <input
                    type="text"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Number"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Emergency Contact
                  </label>
                  <input
                    type="text"
                    value={editFormData.emergency_contact}
                    onChange={(e) => setEditFormData({ ...editFormData, emergency_contact: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Number"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Aadhar Number
                  </label>
                  <input
                    type="text"
                    value={editFormData.aadhar_number}
                    onChange={(e) => setEditFormData({ ...editFormData, aadhar_number: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Number"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Joining Date
                  </label>
                  <input
                    type="date"
                    value={editFormData.joining_date}
                    onChange={(e) => setEditFormData({ ...editFormData, joining_date: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Shift Hours
                  </label>
                  <input
                    type="text"
                    value={editFormData.shift_hours}
                    onChange={(e) => setEditFormData({ ...editFormData, shift_hours: e.target.value })}
                    className="w-full text-xs font-mono font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Example 08:00"
                  />
                </div>
              </div>

              {/* Banking & UPI Details */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <label className="block text-xs font-bold text-slate-800">
                  Banking &amp; UPI Details
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={editFormData.account_holder_name}
                      onChange={(e) => setEditFormData({ ...editFormData, account_holder_name: e.target.value })}
                      className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="Account Holder Name"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      UPI Number / ID
                    </label>
                    <input
                      type="text"
                      value={editFormData.upi_number}
                      onChange={(e) => setEditFormData({ ...editFormData, upi_number: e.target.value })}
                      className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="UPI Number"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={editFormData.bank_name}
                      onChange={(e) => setEditFormData({ ...editFormData, bank_name: e.target.value })}
                      className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="Bank Name"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={editFormData.account_number}
                      onChange={(e) => setEditFormData({ ...editFormData, account_number: e.target.value })}
                      className="w-full text-xs font-mono font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="Account Number"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      value={editFormData.ifsc_code}
                      onChange={(e) => setEditFormData({ ...editFormData, ifsc_code: e.target.value.toUpperCase() })}
                      className="w-full text-xs font-mono font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="IFSC Code"
                    />
                  </div>
                </div>
              </div>

              {/* User Access & Permissions Checkboxes */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      User Access &amp; Permissions
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Select which sidebar tabs this employee can see in their portal.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setEditFormData(prev => ({ ...prev, permissions: ALL_PERMISSIONS.map(p => p.id) }))}
                      className="text-blue-600 hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => setEditFormData(prev => ({ ...prev, permissions: DEFAULT_PERMISSIONS }))}
                      className="text-slate-500 hover:underline cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {ALL_PERMISSIONS.map((perm) => {
                    const isChecked = (editFormData.permissions || []).includes(perm.id);
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
                            const current = editFormData.permissions || [];
                            if (e.target.checked) {
                              setEditFormData(prev => ({ ...prev, permissions: [...current, perm.id] }));
                            } else {
                              setEditFormData(prev => ({ ...prev, permissions: current.filter(p => p !== perm.id) }));
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

            {/* Modal Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="px-5 py-2 rounded-xl bg-[#0080ff] hover:bg-blue-600 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {editSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Update Profile</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revoke Biometric Access Confirmation Modal */}
      <RevokeAccessModal
        isOpen={!!employeeToDelete}
        employee={employeeToDelete}
        onClose={() => !deleteLoading && setEmployeeToDelete(null)}
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
      />

      {/* Workforce Metrics Drill-Down Modal */}
      <WorkforceMetricsModal
        isOpen={metricsModalOpen}
        onClose={() => setMetricsModalOpen(false)}
        initialTab={activeMetricTab}
        employees={employees}
        records={records}
        leaves={leaves}
        onEditEmployee={handleOpenEdit}
      />
    </div>
  );
};
