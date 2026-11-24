import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Calendar,
  Clock,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Briefcase,
  RefreshCw,
  Filter,
} from 'lucide-react';
import { attendanceApi } from '../api';

export interface EmployeeAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: any;
}

export const EmployeeAttendanceModal: React.FC<EmployeeAttendanceModalProps> = ({
  isOpen,
  onClose,
  employee,
}) => {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && employee?.id) {
      fetchAttendanceHistory();
    }
  }, [isOpen, employee?.id]);

  const fetchAttendanceHistory = async () => {
    setLoading(true);
    try {
      const res = await attendanceApi.getRoster();
      const allRoster = res.roster || [];
      const empRecords = allRoster.filter(
        (r: any) => r.employee_id === employee.id || r.employee_code === employee.employee_code
      );
      setRecords(empRecords);
    } catch (err) {
      console.error('Failed to load employee attendance history', err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const fullName =
    `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim() ||
    employee?.employee_name ||
    employee?.name ||
    'Employee';

  if (!isOpen || !employee) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {fullName}
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                {employee.employee_code || 'EMP'} • {employee.department || 'Operations'} • {employee.designation || 'Staff'}
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

        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              Loading attendance history...
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No attendance logs found for this employee yet.
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Punch-In</th>
                  <th className="p-3">Punch-Out</th>
                  <th className="p-3">Hours</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {records.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-slate-800 font-bold">{r.date || 'Today'}</td>
                    <td className="p-3 font-mono text-blue-600 font-bold">{r.check_in || '—'}</td>
                    <td className="p-3 font-mono text-slate-700">{r.check_out || '—'}</td>
                    <td className="p-3 font-mono text-slate-600">{r.work_hours ? `${r.work_hours}h` : '—'}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {r.status || 'PRESENT'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-3.5 border-t border-slate-100 flex items-center justify-end bg-slate-50/70 shrink-0">
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
