import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Building2,
  Clock,
  AlertTriangle,
  Calendar,
  Download,
  Search,
  RefreshCw,
  ArrowUpRight,
  MapPin,
  Camera,
  UserPlus,
  Edit2,
  Trash2,
  Eye,
  Check,
  X,
  ExternalLink,
  BarChart3,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { attendanceApi, AttendanceRosterItem, AttendanceEmployee } from '../api';
import { WorkforceMetricsModal } from '../components/WorkforceMetricsModal';
import { RevokeAccessModal } from '../components/RevokeAccessModal';
import { EmployeeAttendanceModal } from '../components/EmployeeAttendanceModal';
import { useAuth } from '@/contexts/AuthContext';

export function AttendanceDashboard() {
  const { company } = useAuth();
  const companyId = company?.id || '';

  const [timeRange, setTimeRange] = useState<'TODAY' | 'WEEKLY' | 'MONTHLY'>('TODAY');
  const [selectedDept, setSelectedDept] = useState('All Departments');
  const [searchQuery, setSearchQuery] = useState('');

  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [records, setRecords] = useState<AttendanceRosterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clientDate, setClientDate] = useState(new Date().toISOString().split('T')[0]);

  // Modals state
  const [metricsModalOpen, setMetricsModalOpen] = useState(false);
  const [activeMetricTab, setActiveMetricTab] = useState<'TOTAL' | 'ON_TIME' | 'LATE' | 'ABSENT'>('TOTAL');
  const [employeeToDelete, setEmployeeToDelete] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedEmpForHistory, setSelectedEmpForHistory] = useState<any | null>(null);

  // Edit Employee State
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
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
    assigned_shift: 'General Shift (09:00 AM – 05:30 PM • 8.5h)',
    shift_start: '09:00',
    shift_end: '17:30',
  });
  const [editSaving, setEditSaving] = useState(false);

  const fetchData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    try {
      const [rosterRes, empRes] = await Promise.all([
        attendanceApi.getRoster(clientDate, companyId).catch(() => ({ roster: [], metrics: {} as any })),
        attendanceApi.getEmployees(companyId).catch(() => ({ employees: [] })),
      ]);
      setRecords((rosterRes as any).roster || []);
      setEmployees((empRes as any).employees || []);
    } catch (err) {
      console.error('Failed to load attendance dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [clientDate, companyId]);

  const handleOpenMetricsModal = (tab: 'TOTAL' | 'ON_TIME' | 'LATE' | 'ABSENT' = 'TOTAL') => {
    setActiveMetricTab(tab);
    setMetricsModalOpen(true);
  };

  const handleOpenEdit = (emp: any) => {
    setEditingEmployee(emp);
    setEditFormData({
      first_name: emp.first_name || '',
      last_name: emp.last_name || '',
      employee_code: emp.employee_code || '',
      email: emp.email || '',
      department: emp.department || 'Operations',
      designation: emp.designation || 'Staff',
      phone: emp.phone || '',
      hourly_rate: emp.hourly_rate ?? 250,
      daily_wage_rate: emp.daily_wage_rate ?? 600,
      half_day_salary: emp.half_day_salary ?? 300,
      assigned_shift: emp.assigned_shift || 'General Shift (09:00 AM – 05:30 PM • 8.5h)',
      shift_start: emp.shift_start || '09:00',
      shift_end: emp.shift_end || '17:30',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setEditSaving(true);
    try {
      await attendanceApi.saveEmployee({
        id: editingEmployee.id,
        ...editFormData,
      });
      setEditingEmployee(null);
      await fetchData(true);
    } catch (err) {
      console.error('Failed to update employee details', err);
    } finally {
      setEditSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!employeeToDelete) return;
    setDeleteLoading(true);
    try {
      await attendanceApi.deleteEmployee(employeeToDelete.id);
      setEmployeeToDelete(null);
      await fetchData(true);
    } catch (err) {
      console.error('Failed to delete employee', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (records.length === 0) return;
    const headers = ['Employee Name', 'Code', 'Department', 'Shift', 'Punch In', 'Punch Out', 'Hours', 'Status'];
    const rows = records.map((r) => [
      `"${r.name}"`,
      `"${r.employee_code}"`,
      `"${r.department}"`,
      `"${r.shift}"`,
      `"${r.check_in_time || ''}"`,
      `"${r.check_out_time || ''}"`,
      `"${r.total_hours || 0}"`,
      `"${r.status}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Attendance_Report_${clientDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Metrics computation
  const totalRoster = employees.length > 0 ? employees.length : records.length;
  const presentCount = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'HALF_DAY').length;
  const lateCount = records.filter((r) => r.status === 'LATE' || r.shift_status?.includes('LATE')).length;
  const absentCount = Math.max(0, totalRoster - presentCount);

  const presentRate = totalRoster > 0 ? ((presentCount / totalRoster) * 100).toFixed(1) : '0.0';
  const onTimeRate = totalRoster > 0 ? (((presentCount - lateCount) / totalRoster) * 100).toFixed(1) : '0.0';
  const lateRate = totalRoster > 0 ? ((lateCount / totalRoster) * 100).toFixed(1) : '0.0';
  const absentRate = totalRoster > 0 ? ((absentCount / totalRoster) * 100).toFixed(1) : '0.0';

  // Departments list
  const registeredDepartments = useMemo(() => {
    const depts = new Set<string>();
    employees.forEach((emp) => {
      if (emp.department && emp.department.trim()) depts.add(emp.department.trim());
    });
    records.forEach((rec) => {
      if (rec.department && rec.department.trim()) depts.add(rec.department.trim());
    });
    return ['All Departments', ...Array.from(depts)];
  }, [employees, records]);

  // Department attendance stats
  const departmentStats = useMemo(() => {
    if (employees.length === 0) return [];
    const deptMap: Record<string, { total: number; present: number }> = {};
    employees.forEach((emp) => {
      const dept = emp.department || 'General';
      if (!deptMap[dept]) deptMap[dept] = { total: 0, present: 0 };
      deptMap[dept].total += 1;
    });
    records.forEach((rec) => {
      const dept = rec.department || 'General';
      if (deptMap[dept] && (rec.status === 'PRESENT' || rec.status === 'LATE' || rec.status === 'HALF_DAY')) {
        deptMap[dept].present += 1;
      }
    });
    return Object.entries(deptMap).map(([dept, data]) => ({
      department: dept,
      total: data.total,
      present: data.present,
      pct: data.total > 0 ? Math.round((data.present / data.total) * 100) : 0,
    }));
  }, [employees, records]);

  // Filtered live records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchesDept = selectedDept === 'All Departments' || r.department?.toLowerCase() === selectedDept.toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        r.name?.toLowerCase().includes(q) ||
        r.employee_code?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q);
      return matchesDept && matchesQuery;
    });
  }, [records, selectedDept, searchQuery]);

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 uppercase">
              ANALYTICS ATTENDANCE DASHBOARD
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Real-time biometric facial recognition attendance monitoring for Argus Technologies
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <input
            type="date"
            value={clientDate}
            onChange={(e) => setClientDate(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => fetchData()}
            disabled={loading || refreshing}
            className="py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh dashboard data"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${refreshing || loading ? 'animate-spin' : ''}`} />
            <span>REFRESH</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>CSV EXPORT</span>
          </button>
          <a
            href="/attendance/kiosk"
            target="_blank"
            rel="noopener noreferrer"
            className="py-2 px-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-1.5 transition-all"
          >
            <Camera className="w-3.5 h-3.5 text-blue-400" />
            <span>Launch Kiosk</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
          <a
            href="/attendance/enroll"
            className="py-2 px-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm shadow-blue-500/25 flex items-center justify-center gap-1.5 transition-all"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Enroll Face</span>
          </a>
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
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${presentRate}%` }} />
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
              <span className="text-3xl font-black text-emerald-600">{Math.max(0, presentCount - lateCount)}</span>
              <span className="text-xs text-slate-400 font-semibold">/ {presentCount} active</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-semibold mb-2">
              <span className="text-slate-500">Punctual Check-ins</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-mono font-bold">
                {onTimeRate}% Rate
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${onTimeRate}%` }} />
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
              <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${lateRate}%` }} />
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
              <div className="bg-red-500 h-full rounded-full transition-all duration-500" style={{ width: `${absentRate}%` }} />
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-red-600 group-hover:text-red-700">
            <span>View absent &amp; on-leave staff</span>
            <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Time Range Pills */}
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 uppercase">
            <span>RANGE:</span>
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg">
              {(['TODAY', 'WEEKLY', 'MONTHLY'] as const).map((range) => (
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
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Search Input */}
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

      {/* Main Attendance Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 min-w-[750px]">
            <thead className="bg-slate-50/80 text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-3.5">EMPLOYEE &amp; ID</th>
                <th className="p-3.5">PUNCH-IN</th>
                <th className="p-3.5">PUNCH-OUT</th>
                <th className="p-3.5">DEPT</th>
                <th className="p-3.5">ENTRY DISTANCE</th>
                <th className="p-3.5">SHIFT STATUS</th>
                <th className="p-3.5">STATUS</th>
                <th className="p-3.5 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400 bg-white">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <Clock className="w-8 h-8 text-slate-300 stroke-1" />
                      <p className="text-xs font-bold text-slate-700">
                        No attendance records logged for today.
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Live punches from the attendance kiosk will appear here in real-time as employees verify their face.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => {
                  const emp = employees.find((e) => e.id === rec.employee_id);
                  const isLate = rec.status === 'LATE' || rec.shift_status?.includes('LATE');
                  return (
                    <tr key={rec.employee_id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Employee & ID */}
                      <td className="p-3.5 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {rec.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-xs">{rec.name}</div>
                          <div className="text-[10px] font-mono text-slate-400 font-semibold">
                            {rec.employee_code}
                          </div>
                        </div>
                      </td>

                      {/* Punch In */}
                      <td className="p-3.5 font-mono text-xs font-bold text-blue-600">
                        {rec.check_in_time || '—'}
                      </td>

                      {/* Punch Out */}
                      <td className="p-3.5 font-mono text-xs text-slate-700">
                        {rec.check_out_time || (rec.is_currently_in ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold font-mono">
                            ACTIVE (IN SHIFT)
                          </span>
                        ) : (
                          '—'
                        ))}
                      </td>

                      {/* Dept */}
                      <td className="p-3.5 text-xs text-slate-700">{rec.department}</td>

                      {/* Entry Distance */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <MapPin className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                          <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            0m (On-Site)
                          </span>
                        </div>
                      </td>

                      {/* Shift Status */}
                      <td className="p-3.5">
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

                      {/* Status */}
                      <td className="p-3.5">
                        {rec.status === 'HALF_DAY' ? (
                          <span className="px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[10px] font-mono font-bold">
                            HALF-DAY
                          </span>
                        ) : rec.status === 'PRESENT' || rec.status === 'LATE' || rec.check_in_time ? (
                          <span className="px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50/60 text-emerald-800 text-[10px] font-mono font-bold">
                            PRESENT
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 text-[10px] font-mono font-bold">
                            ABSENT
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedEmpForHistory(emp || { id: rec.employee_id, employee_name: rec.name, employee_code: rec.employee_code, department: rec.department })}
                            className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                            title="View punch logs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(emp || { id: rec.employee_id, first_name: rec.name.split(' ')[0], last_name: rec.name.split(' ').slice(1).join(' '), employee_code: rec.employee_code, department: rec.department })}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                            title="Edit Personnel"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEmployeeToDelete(emp || { id: rec.employee_id, first_name: rec.name.split(' ')[0], last_name: rec.name.split(' ').slice(1).join(' '), employee_code: rec.employee_code, department: rec.department })}
                            className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                            title="Revoke Biometric Access"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Footer */}
        <div className="border-t border-slate-100 p-3.5 flex items-center justify-between text-xs text-slate-500 font-medium">
          <div>
            Showing <strong className="text-slate-800">1 to {filteredRecords.length}</strong> of {totalRoster} punch logs
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
            {departmentStats.map((ds) => (
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

      {/* Edit Employee Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 my-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Edit Employee Details</h3>
                  <p className="text-[11px] text-slate-500 font-mono">ID: {editingEmployee.id}</p>
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

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={editFormData.first_name}
                    onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">Last Name</label>
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
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">Employee Code</label>
                  <input
                    type="text"
                    required
                    value={editFormData.employee_code}
                    onChange={(e) => setEditFormData({ ...editFormData, employee_code: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">Department</label>
                  <input
                    type="text"
                    value={editFormData.department}
                    onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">Designation</label>
                  <input
                    type="text"
                    value={editFormData.designation}
                    onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">Phone</label>
                  <input
                    type="text"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Workforce Metrics Drill-Down Modal */}
      <WorkforceMetricsModal
        isOpen={metricsModalOpen}
        onClose={() => setMetricsModalOpen(false)}
        initialTab={activeMetricTab}
        employees={employees}
        records={records}
        onEditEmployee={handleOpenEdit}
      />

      {/* Revoke Access Modal */}
      <RevokeAccessModal
        isOpen={!!employeeToDelete}
        employee={employeeToDelete}
        onClose={() => setEmployeeToDelete(null)}
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
      />

      {/* Employee Attendance History Modal */}
      <EmployeeAttendanceModal
        isOpen={!!selectedEmpForHistory}
        employee={selectedEmpForHistory}
        onClose={() => setSelectedEmpForHistory(null)}
      />
    </div>
  );
}
