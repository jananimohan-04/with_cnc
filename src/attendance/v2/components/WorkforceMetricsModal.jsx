import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  Search, 
  Download, 
  Building2, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  Users, 
  CheckCircle2, 
  Phone, 
  Mail, 
  Shield, 
  ExternalLink,
  Edit2,
  CalendarCheck2,
  UserX
} from 'lucide-react';

export const WorkforceMetricsModal = ({
  isOpen,
  onClose,
  initialTab = 'TOTAL', // 'TOTAL' | 'ON_TIME' | 'LATE' | 'ABSENT'
  employees = [],
  records = [],
  leaves = [],
  onEditEmployee
}) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All Departments');

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSearchQuery('');
      setSelectedDept('All Departments');
    }
  }, [isOpen, initialTab]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Today's date string in YYYY-MM-DD
  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Quick lookup map: employee_id -> attendance record
  const recordMap = useMemo(() => {
    const map = new Map();
    (records || []).forEach(r => {
      if (r.employee_id) map.set(r.employee_id, r);
    });
    return map;
  }, [records]);

  // Quick lookup map: employee_id -> active approved leave for today
  const leaveMap = useMemo(() => {
    const map = new Map();
    (leaves || []).forEach(l => {
      if (
        l.employee_id && 
        (l.status === 'APPROVED' || l.status === 'PENDING') &&
        l.from_date <= todayStr && 
        todayStr <= l.to_date
      ) {
        map.set(l.employee_id, l);
      }
    });
    return map;
  }, [leaves, todayStr]);

  // Format time helpers
  const formatTime = (timeVal) => {
    if (!timeVal || timeVal === '—') return '—';
    if (typeof timeVal === 'string' && timeVal.includes('T')) {
      try {
        return new Date(timeVal).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch {
        return timeVal;
      }
    }
    return timeVal;
  };

  const calculateDelay = (checkIn, shiftStart = '09:00') => {
    if (!checkIn) return 'Late';
    try {
      let checkInHours, checkInMins;
      if (typeof checkIn === 'string' && checkIn.includes('T')) {
        const d = new Date(checkIn);
        checkInHours = d.getHours();
        checkInMins = d.getMinutes();
      } else if (typeof checkIn === 'string' && checkIn.includes(':')) {
        const parts = checkIn.trim().split(':');
        checkInHours = parseInt(parts[0], 10);
        checkInMins = parseInt(parts[1], 10);
        if (checkIn.toLowerCase().includes('pm') && checkInHours < 12) checkInHours += 12;
        if (checkIn.toLowerCase().includes('am') && checkInHours === 12) checkInHours = 0;
      } else {
        return 'Grace Exceeded';
      }

      let startHours = 9, startMins = 0;
      if (shiftStart && shiftStart.includes(':')) {
        const sp = shiftStart.split(':');
        startHours = parseInt(sp[0], 10);
        startMins = parseInt(sp[1], 10);
      }

      const checkInTotal = checkInHours * 60 + checkInMins;
      const startTotal = startHours * 60 + startMins;
      const diff = checkInTotal - startTotal;

      if (diff > 0) {
        if (diff >= 60) {
          const h = Math.floor(diff / 60);
          const m = diff % 60;
          return `${h}h ${m}m late`;
        }
        return `${diff} mins late`;
      }
      return 'Grace Exceeded';
    } catch {
      return 'Late';
    }
  };

  // 1. Process Total Workforce Data
  const totalWorkforceItems = useMemo(() => {
    return (employees || []).map(emp => {
      const fn = emp.first_name || '';
      const ln = emp.last_name || '';
      const name = `${fn} ${ln}`.trim() || emp.name || 'Unnamed Employee';
      const rec = recordMap.get(emp.id);
      const leave = leaveMap.get(emp.id);

      let statusType = 'ABSENT';
      let statusLabel = 'ABSENT';
      let checkInDisplay = '—';
      let checkOutDisplay = '—';

      if (rec) {
        checkInDisplay = formatTime(rec.check_in_time || rec.check_in);
        checkOutDisplay = formatTime(rec.check_out_time || rec.check_out);
        if (rec.status === 'HALF_DAY' || rec.shift_status?.includes('HALF-DAY')) {
          statusType = 'HALF_DAY';
          statusLabel = 'HALF-DAY';
        } else if (rec.shift_status?.includes('LATE') || rec.status === 'LATE') {
          statusType = 'LATE';
          statusLabel = 'LATE';
        } else {
          statusType = 'ON_TIME';
          statusLabel = 'ON-TIME';
        }
      } else if (leave) {
        statusType = 'ON_LEAVE';
        statusLabel = leave.status === 'APPROVED' 
          ? `LEAVE: ${leave.category || 'Approved'}` 
          : `PENDING LEAVE: ${leave.category || 'Leave'}`;
      }

      return {
        id: emp.id,
        rawEmployee: emp,
        name,
        code: emp.employee_code || '—',
        department: emp.department || 'General',
        designation: emp.designation || 'Staff',
        email: emp.email || '—',
        phone: emp.phone || '—',
        shift: emp.assigned_shift || `${emp.shift_start || '09:00'} – ${emp.shift_end || '17:30'}`,
        shiftStart: emp.shift_start || '09:00',
        shiftEnd: emp.shift_end || '17:30',
        statusType,
        statusLabel,
        checkInDisplay,
        checkOutDisplay,
        avatarInit: (name.split(' ').map(p => p[0]).join('')).slice(0, 2).toUpperCase()
      };
    });
  }, [employees, recordMap, leaveMap]);

  // 2. Process On-Time Arrivals Data
  const onTimeItems = useMemo(() => {
    return totalWorkforceItems.filter(item => item.statusType === 'ON_TIME');
  }, [totalWorkforceItems]);

  // 3. Process Late Arrivals Data
  const lateItems = useMemo(() => {
    return totalWorkforceItems
      .filter(item => item.statusType === 'LATE')
      .map(item => {
        const rec = recordMap.get(item.id);
        const delay = calculateDelay(rec?.check_in_time || rec?.check_in, item.shiftStart);
        return {
          ...item,
          delay
        };
      });
  }, [totalWorkforceItems, recordMap]);

  // 4. Process Absent / On Leave Data
  const absentItems = useMemo(() => {
    return totalWorkforceItems
      .filter(item => item.statusType === 'ABSENT' || item.statusType === 'ON_LEAVE')
      .map(item => {
        const leave = leaveMap.get(item.id);
        let leaveReason = 'No check-in record for today';
        if (leave) {
          leaveReason = `${leave.status === 'APPROVED' ? 'Approved' : 'Pending'}: ${leave.category || 'Leave'}${leave.reason ? ` (${leave.reason})` : ''}`;
        }
        return {
          ...item,
          leaveReason
        };
      });
  }, [totalWorkforceItems, leaveMap]);

  // Current active list
  const currentItems = useMemo(() => {
    switch (activeTab) {
      case 'ON_TIME': return onTimeItems;
      case 'LATE': return lateItems;
      case 'ABSENT': return absentItems;
      case 'TOTAL':
      default:
        return totalWorkforceItems;
    }
  }, [activeTab, totalWorkforceItems, onTimeItems, lateItems, absentItems]);

  // Filtered by Search & Department
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return currentItems.filter(item => {
      const matchesDept = selectedDept === 'All Departments' || item.department.toLowerCase() === selectedDept.toLowerCase();
      const matchesQuery = !q || 
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.department.toLowerCase().includes(q) ||
        item.email.toLowerCase().includes(q) ||
        item.designation.toLowerCase().includes(q);
      return matchesDept && matchesQuery;
    });
  }, [currentItems, searchQuery, selectedDept]);

  // Distinct Departments for current list
  const departmentsList = useMemo(() => {
    const set = new Set();
    currentItems.forEach(i => {
      if (i.department) set.add(i.department.trim());
    });
    return ['All Departments', ...Array.from(set)];
  }, [currentItems]);

  // Export CSV Handler
  const handleExportCSV = () => {
    let headers = [];
    let rows = [];

    if (activeTab === 'TOTAL') {
      headers = ['Employee Name', 'Employee Code', 'Department', 'Designation', 'Email', 'Phone', 'Assigned Shift', 'Status', 'Punch-In', 'Punch-Out'];
      rows = filteredItems.map(i => [
        `"${i.name}"`, `"${i.code}"`, `"${i.department}"`, `"${i.designation}"`, `"${i.email}"`, `"${i.phone}"`, `"${i.shift}"`, `"${i.statusLabel}"`, `"${i.checkInDisplay}"`, `"${i.checkOutDisplay}"`
      ]);
    } else if (activeTab === 'ON_TIME') {
      headers = ['Employee Name', 'Employee Code', 'Department', 'Punch-In Time', 'Shift Start', 'Punctuality Status', 'Punch-Out Time'];
      rows = filteredItems.map(i => [
        `"${i.name}"`, `"${i.code}"`, `"${i.department}"`, `"${i.checkInDisplay}"`, `"${i.shiftStart}"`, '"ON-TIME"', `"${i.checkOutDisplay}"`
      ]);
    } else if (activeTab === 'LATE') {
      headers = ['Employee Name', 'Employee Code', 'Department', 'Punch-In Time', 'Shift Start', 'Delay Duration', 'Punch-Out Time'];
      rows = filteredItems.map(i => [
        `"${i.name}"`, `"${i.code}"`, `"${i.department}"`, `"${i.checkInDisplay}"`, `"${i.shiftStart}"`, `"${i.delay}"`, `"${i.checkOutDisplay}"`
      ]);
    } else if (activeTab === 'ABSENT') {
      headers = ['Employee Name', 'Employee Code', 'Department', 'Designation', 'Shift Hours', 'Absence / Leave Status', 'Email', 'Phone'];
      rows = filteredItems.map(i => [
        `"${i.name}"`, `"${i.code}"`, `"${i.department}"`, `"${i.designation}"`, `"${i.shift}"`, `"${i.leaveReason}"`, `"${i.email}"`, `"${i.phone}"`
      ]);
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${activeTab.toLowerCase()}_workforce_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shadow-2xs ${
              activeTab === 'TOTAL' ? 'bg-blue-600 text-white' :
              activeTab === 'ON_TIME' ? 'bg-emerald-600 text-white' :
              activeTab === 'LATE' ? 'bg-amber-500 text-white' :
              'bg-red-600 text-white'
            }`}>
              {activeTab === 'TOTAL' && <Building2 className="w-5 h-5" />}
              {activeTab === 'ON_TIME' && <Clock className="w-5 h-5" />}
              {activeTab === 'LATE' && <AlertTriangle className="w-5 h-5" />}
              {activeTab === 'ABSENT' && <UserX className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight">
                  {activeTab === 'TOTAL' && 'Total Workforce Roster'}
                  {activeTab === 'ON_TIME' && 'On-Time Arrivals & Timings'}
                  {activeTab === 'LATE' && 'Late Arrivals & Delay Tracking'}
                  {activeTab === 'ABSENT' && 'Absent & On-Leave Workforce'}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                  activeTab === 'TOTAL' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                  activeTab === 'ON_TIME' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  activeTab === 'LATE' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                  'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {filteredItems.length} {filteredItems.length === 1 ? 'Employee' : 'Employees'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                {activeTab === 'TOTAL' && 'All enrolled active staff members across your organisation'}
                {activeTab === 'ON_TIME' && 'Employees who checked in punctually within scheduled shift window'}
                {activeTab === 'LATE' && 'Employees who punched in after scheduled shift grace duration'}
                {activeTab === 'ABSENT' && 'Unaccounted employees without check-in and approved leave records'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close modal (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection Bar */}
        <div className="flex items-center gap-1.5 px-5 py-2.5 bg-slate-100/60 border-b border-slate-200/80 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('TOTAL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'TOTAL'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Total Workforce</span>
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold ${
              activeTab === 'TOTAL' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {totalWorkforceItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ON_TIME')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'ON_TIME'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>On-Time Arrivals</span>
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold ${
              activeTab === 'ON_TIME' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {onTimeItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('LATE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'LATE'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Late Arrivals</span>
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold ${
              activeTab === 'LATE' ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {lateItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ABSENT')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'ABSENT'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            <span>Absent / On Leave</span>
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold ${
              activeTab === 'ABSENT' ? 'bg-red-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {absentItems.length}
            </span>
          </button>
        </div>

        {/* Filter Toolbar inside Modal */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 px-5 py-3 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-2 flex-1">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by name, code, dept, email..."
                className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Department Dropdown */}
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[160px]"
            >
              {departmentsList.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportCSV}
            className="py-1.5 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>CSV EXPORT</span>
          </button>
        </div>

        {/* Content Table / Card Area */}
        <div className="overflow-x-auto overflow-y-auto flex-1 p-0 divide-y divide-slate-100">
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <Users className="w-10 h-10 text-slate-300 stroke-1" />
              <p className="text-sm font-bold text-slate-700">No employees match this category or filter.</p>
              <p className="text-xs text-slate-400 max-w-sm">
                Try clearing your search query or selecting another department filter above.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-600 min-w-[700px]">
              <thead className="bg-slate-50/90 text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider sticky top-0 z-10 border-b border-slate-200 shadow-2xs">
                {activeTab === 'TOTAL' && (
                  <tr>
                    <th className="p-3.5">EMPLOYEE & CODE</th>
                    <th className="p-3.5">DEPARTMENT & ROLE</th>
                    <th className="p-3.5">CONTACT DETAILS</th>
                    <th className="p-3.5">ASSIGNED SHIFT</th>
                    <th className="p-3.5">TODAY'S STATUS</th>
                    <th className="p-3.5 text-right">ACTION</th>
                  </tr>
                )}
                {activeTab === 'ON_TIME' && (
                  <tr>
                    <th className="p-3.5">EMPLOYEE & CODE</th>
                    <th className="p-3.5">DEPARTMENT</th>
                    <th className="p-3.5">PUNCH-IN TIME</th>
                    <th className="p-3.5">SHIFT SCHEDULE</th>
                    <th className="p-3.5">PUNCTUALITY</th>
                    <th className="p-3.5">PUNCH-OUT / SHIFT</th>
                  </tr>
                )}
                {activeTab === 'LATE' && (
                  <tr>
                    <th className="p-3.5">EMPLOYEE & CODE</th>
                    <th className="p-3.5">DEPARTMENT</th>
                    <th className="p-3.5">PUNCH-IN TIME</th>
                    <th className="p-3.5">SHIFT START</th>
                    <th className="p-3.5">DELAY DURATION</th>
                    <th className="p-3.5">PUNCH-OUT / SHIFT</th>
                  </tr>
                )}
                {activeTab === 'ABSENT' && (
                  <tr>
                    <th className="p-3.5">EMPLOYEE & CODE</th>
                    <th className="p-3.5">DEPARTMENT & ROLE</th>
                    <th className="p-3.5">ASSIGNED SHIFT</th>
                    <th className="p-3.5">ABSENCE / LEAVE STATUS</th>
                    <th className="p-3.5">CONTACT EMPLOYEE</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Common Column 1: Employee & Code */}
                    <td className="p-3.5 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg text-white font-bold text-xs flex items-center justify-center shrink-0 ${
                        item.statusType === 'ON_TIME' ? 'bg-emerald-600' :
                        item.statusType === 'LATE' ? 'bg-amber-600' :
                        item.statusType === 'ON_LEAVE' ? 'bg-purple-600' :
                        'bg-slate-800'
                      }`}>
                        {item.avatarInit}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-xs">{item.name}</div>
                        <div className="text-[10px] font-mono text-slate-400 font-semibold">{item.code}</div>
                      </div>
                    </td>

                    {/* View Specific Columns */}
                    {activeTab === 'TOTAL' && (
                      <>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-800">{item.department}</div>
                          <div className="text-[10px] text-slate-400">{item.designation}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1 text-[11px] text-slate-700">
                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[150px]">{item.email}</span>
                          </div>
                          {item.phone && item.phone !== '—' && (
                            <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400 mt-0.5">
                              <Phone className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                              <span>{item.phone}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span className="font-mono text-xs font-semibold text-slate-700">{item.shift}</span>
                        </td>
                        <td className="p-3.5">
                          {item.statusType === 'ON_TIME' && (
                            <span className="px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] font-mono font-bold">
                              PRESENT • ON-TIME ({item.checkInDisplay})
                            </span>
                          )}
                          {item.statusType === 'HALF_DAY' && (
                            <span className="px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[10px] font-mono font-bold">
                              HALF-DAY (0.5d) ({item.checkInDisplay})
                            </span>
                          )}
                          {item.statusType === 'LATE' && (
                            <span className="px-2 py-0.5 rounded border border-orange-300 bg-orange-50 text-orange-800 text-[10px] font-mono font-bold">
                              PRESENT • LATE ({item.checkInDisplay})
                            </span>
                          )}
                          {item.statusType === 'ON_LEAVE' && (
                            <span className="px-2 py-0.5 rounded border border-purple-200 bg-purple-50 text-purple-700 text-[10px] font-mono font-bold">
                              {item.statusLabel}
                            </span>
                          )}
                          {item.statusType === 'ABSENT' && (
                            <span className="px-2 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 text-[10px] font-mono font-bold">
                              ABSENT
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right">
                          {onEditEmployee && (
                            <button
                              onClick={() => {
                                onClose();
                                onEditEmployee(item.rawEmployee);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          )}
                        </td>
                      </>
                    )}

                    {activeTab === 'ON_TIME' && (
                      <>
                        <td className="p-3.5">
                          <span className="font-bold text-slate-800">{item.department}</span>
                        </td>
                        <td className="p-3.5 font-mono text-xs font-bold text-emerald-700">
                          {item.checkInDisplay}
                        </td>
                        <td className="p-3.5 font-mono text-xs text-slate-600">
                          {item.shiftStart} AM
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono font-bold flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>ON-TIME</span>
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-xs text-slate-700">
                          {item.checkOutDisplay !== '—' ? (
                            item.checkOutDisplay
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold font-mono">
                              ACTIVE (IN SHIFT)
                            </span>
                          )}
                        </td>
                      </>
                    )}

                    {activeTab === 'LATE' && (
                      <>
                        <td className="p-3.5">
                          <span className="font-bold text-slate-800">{item.department}</span>
                        </td>
                        <td className="p-3.5 font-mono text-xs font-bold text-amber-700">
                          {item.checkInDisplay}
                        </td>
                        <td className="p-3.5 font-mono text-xs text-slate-600">
                          {item.shiftStart} AM
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-mono font-bold flex items-center gap-1 w-fit">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>{item.delay}</span>
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-xs text-slate-700">
                          {item.checkOutDisplay !== '—' ? (
                            item.checkOutDisplay
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-mono font-bold">
                              ACTIVE (IN SHIFT)
                            </span>
                          )}
                        </td>
                      </>
                    )}

                    {activeTab === 'ABSENT' && (
                      <>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-800">{item.department}</div>
                          <div className="text-[10px] text-slate-400">{item.designation}</div>
                        </td>
                        <td className="p-3.5 font-mono text-xs text-slate-700">
                          {item.shift}
                        </td>
                        <td className="p-3.5">
                          {item.statusType === 'ON_LEAVE' ? (
                            <span className="px-2 py-1 rounded bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-mono font-bold flex items-center gap-1 w-fit">
                              <CalendarCheck2 className="w-3 h-3 text-purple-600" />
                              <span>{item.leaveReason}</span>
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded bg-red-50 border border-red-200 text-red-700 text-[10px] font-mono font-bold flex items-center gap-1 w-fit">
                              <UserX className="w-3 h-3 text-red-600" />
                              <span>Unaccounted Absent (No Punch)</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-2">
                            {item.email && item.email !== '—' && (
                              <a
                                href={`mailto:${item.email}`}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 text-slate-500 transition-colors"
                                title={`Email ${item.email}`}
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </a>
                            )}
                            {item.phone && item.phone !== '—' && (
                              <a
                                href={`tel:${item.phone}`}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 text-slate-500 transition-colors"
                                title={`Call ${item.phone}`}
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <span className="text-[11px] text-slate-400 font-mono">
                              {item.phone !== '—' ? item.phone : item.email}
                            </span>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div>
            Showing <strong className="text-slate-800">{filteredItems.length}</strong> of {currentItems.length} records in this view
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
