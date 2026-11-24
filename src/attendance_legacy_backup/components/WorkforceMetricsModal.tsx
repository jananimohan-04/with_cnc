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
  UserX,
  ArrowUpRight,
} from 'lucide-react';

export interface WorkforceMetricsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'TOTAL' | 'ON_TIME' | 'LATE' | 'ABSENT';
  employees?: any[];
  records?: any[];
  leaves?: any[];
  onEditEmployee?: (emp: any) => void;
}

export const WorkforceMetricsModal: React.FC<WorkforceMetricsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'TOTAL',
  employees = [],
  records = [],
  leaves = [],
  onEditEmployee,
}) => {
  const [activeTab, setActiveTab] = useState<'TOTAL' | 'ON_TIME' | 'LATE' | 'ABSENT'>(initialTab);
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const recordMap = useMemo(() => {
    const map = new Map<string, any>();
    (records || []).forEach((r) => {
      if (r.employee_id) map.set(r.employee_id, r);
    });
    return map;
  }, [records]);

  const leaveMap = useMemo(() => {
    const map = new Map<string, any>();
    (leaves || []).forEach((l) => {
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

  const formatTime = (timeVal: any) => {
    if (!timeVal || timeVal === '—') return '—';
    if (typeof timeVal === 'string' && timeVal.includes('T')) {
      try {
        return new Date(timeVal).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      } catch {
        return timeVal;
      }
    }
    return timeVal;
  };

  const calculateDelay = (checkIn: any, shiftStart = '09:00') => {
    if (!checkIn) return 'Grace Exceeded';
    try {
      let checkInHours = 9;
      let checkInMins = 0;
      if (typeof checkIn === 'string' && checkIn.includes('T')) {
        const d = new Date(checkIn);
        checkInHours = d.getHours();
        checkInMins = d.getMinutes();
      } else if (typeof checkIn === 'string' && checkIn.includes(':')) {
        const parts = checkIn.trim().split(':');
        checkInHours = parseInt(parts[0], 10);
        checkInMins = parseInt(parts[1], 10);
      }
      let startHours = 9;
      let startMins = 0;
      if (shiftStart && shiftStart.includes(':')) {
        const sp = shiftStart.split(':');
        startHours = parseInt(sp[0], 10);
        startMins = parseInt(sp[1], 10);
      }
      const diff = checkInHours * 60 + checkInMins - (startHours * 60 + startMins);
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

  // Process Total Workforce
  const totalWorkforceItems = useMemo(() => {
    return (employees || []).map((emp) => {
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
        statusLabel =
          leave.status === 'APPROVED'
            ? `LEAVE: ${leave.category || 'Approved'}`
            : `PENDING LEAVE: ${leave.category || 'Leave'}`;
      }

      return {
        id: emp.id,
        rawEmployee: emp,
        name,
        code: emp.employee_code || '—',
        department: emp.department || 'Operations',
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
        avatarInit: (name.split(' ').map((p: string) => p[0]).join('')).slice(0, 2).toUpperCase() || 'EM',
      };
    });
  }, [employees, recordMap, leaveMap]);

  const onTimeItems = useMemo(() => {
    return totalWorkforceItems.filter((item) => item.statusType === 'ON_TIME');
  }, [totalWorkforceItems]);

  const lateItems = useMemo(() => {
    return totalWorkforceItems
      .filter((item) => item.statusType === 'LATE')
      .map((item) => {
        const rec = recordMap.get(item.id);
        const delay = calculateDelay(rec?.check_in_time || rec?.check_in, item.shiftStart);
        return {
          ...item,
          delay,
        };
      });
  }, [totalWorkforceItems, recordMap]);

  const absentItems = useMemo(() => {
    return totalWorkforceItems
      .filter((item) => item.statusType === 'ABSENT' || item.statusType === 'ON_LEAVE')
      .map((item) => {
        const leave = leaveMap.get(item.id);
        let leaveReason = 'No check-in record for today';
        if (leave) {
          leaveReason = `${leave.status === 'APPROVED' ? 'Approved' : 'Pending'}: ${leave.category || 'Leave'}${
            leave.reason ? ` (${leave.reason})` : ''
          }`;
        }
        return {
          ...item,
          leaveReason,
        };
      });
  }, [totalWorkforceItems, leaveMap]);

  const currentItems = useMemo(() => {
    switch (activeTab) {
      case 'ON_TIME':
        return onTimeItems;
      case 'LATE':
        return lateItems;
      case 'ABSENT':
        return absentItems;
      case 'TOTAL':
      default:
        return totalWorkforceItems;
    }
  }, [activeTab, totalWorkforceItems, onTimeItems, lateItems, absentItems]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    totalWorkforceItems.forEach((item) => {
      if (item.department) set.add(item.department);
    });
    return ['All Departments', ...Array.from(set)];
  }, [totalWorkforceItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return currentItems.filter((item) => {
      const matchesDept = selectedDept === 'All Departments' || item.department.toLowerCase() === selectedDept.toLowerCase();
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.department.toLowerCase().includes(q) ||
        item.designation.toLowerCase().includes(q);
      return matchesDept && matchesQuery;
    });
  }, [currentItems, searchQuery, selectedDept]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Modal Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Workforce Metrics Drill-Down
              </h2>
              <p className="text-xs text-slate-500">
                Live biometric attendance status &amp; employee records
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection Row */}
        <div className="flex items-center border-b border-slate-200 px-4 sm:px-6 bg-white gap-2 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('TOTAL')}
            className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'TOTAL'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Total Workforce</span>
            <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-mono">
              {totalWorkforceItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ON_TIME')}
            className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ON_TIME'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>On-Time</span>
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-mono">
              {onTimeItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('LATE')}
            className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'LATE'
                ? 'border-amber-600 text-amber-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Late Arrivals</span>
            <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-mono">
              {lateItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ABSENT')}
            className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ABSENT'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Absent / Leave</span>
            <span className="px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] font-mono">
              {absentItems.length}
            </span>
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search employee name, code, dept..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="py-14 text-center text-slate-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <div className="text-xs font-bold text-slate-600">No matching employee records</div>
              <p className="text-[11px] text-slate-400 mt-0.5">Try adjusting your filters or search terms.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="p-3.5">Employee</th>
                  <th className="p-3.5">Department</th>
                  <th className="p-3.5">Shift</th>
                  <th className="p-3.5">Check-In</th>
                  <th className="p-3.5">Check-Out</th>
                  <th className="p-3.5">Status</th>
                  {activeTab === 'LATE' && <th className="p-3.5">Delay Duration</th>}
                  {activeTab === 'ABSENT' && <th className="p-3.5">Absence Detail</th>}
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item: any) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3.5 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                        {item.avatarInit}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-xs">{item.name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{item.code}</div>
                      </div>
                    </td>
                    <td className="p-3.5 text-slate-700">{item.department}</td>
                    <td className="p-3.5 font-mono text-[11px] text-slate-600">{item.shift}</td>
                    <td className="p-3.5 font-mono text-xs font-bold text-blue-600">
                      {item.checkInDisplay}
                    </td>
                    <td className="p-3.5 font-mono text-xs text-slate-700">
                      {item.checkOutDisplay}
                    </td>
                    <td className="p-3.5">
                      {item.statusType === 'ON_TIME' && (
                        <span className="px-2 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] font-mono font-bold">
                          ON-TIME
                        </span>
                      )}
                      {item.statusType === 'LATE' && (
                        <span className="px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[10px] font-mono font-bold">
                          LATE
                        </span>
                      )}
                      {item.statusType === 'HALF_DAY' && (
                        <span className="px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[10px] font-mono font-bold">
                          HALF-DAY
                        </span>
                      )}
                      {item.statusType === 'ABSENT' && (
                        <span className="px-2 py-0.5 rounded border border-red-200 bg-red-50 text-red-700 text-[10px] font-mono font-bold">
                          ABSENT
                        </span>
                      )}
                      {item.statusType === 'ON_LEAVE' && (
                        <span className="px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 text-[10px] font-mono font-bold">
                          ON LEAVE
                        </span>
                      )}
                    </td>
                    {activeTab === 'LATE' && (
                      <td className="p-3.5 font-mono font-bold text-amber-700 text-xs">
                        {item.delay}
                      </td>
                    )}
                    {activeTab === 'ABSENT' && (
                      <td className="p-3.5 text-[11px] text-slate-500">
                        {item.leaveReason}
                      </td>
                    )}
                    <td className="p-3.5 text-right">
                      {onEditEmployee && (
                        <button
                          type="button"
                          onClick={() => onEditEmployee(item.rawEmployee)}
                          className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                          title="Edit Employee"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-slate-100 flex items-center justify-between bg-slate-50/70 text-xs text-slate-500 shrink-0">
          <div>
            Showing <strong className="text-slate-800">{filteredItems.length}</strong> personnel in view
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs cursor-pointer hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
