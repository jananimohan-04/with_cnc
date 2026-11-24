import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, Clock, Edit3 } from 'lucide-react';
import { attendanceService } from '../services/attendanceService';
import { employeeService } from '../services/employeeService';
import type { AttendanceRecord } from '../types/attendance.types';
import type { AttendanceEmployee } from '../types/employee.types';
import { ManualEntryModal } from '../components/modals/ManualEntryModal';

interface Props {
  companyId: string;
}

export const ManualEntryPage: React.FC<Props> = ({ companyId }) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [allRecs, empList] = await Promise.all([
        attendanceService.getAttendanceRecords(companyId),
        employeeService.getEmployees(companyId),
      ]);
      // Filter for manual punch records
      const manualOnly = allRecs.filter(
        (r) => r.punch_mode === 'MANUAL' || r.shift_status === 'MANUAL_OVERRIDE' || r.remarks
      );
      setRecords(manualOnly);
      setEmployees(empList);
    } catch (err) {
      console.error('Failed to load manual entries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const filtered = records.filter(
    (r) =>
      r.employee_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.employee_code?.toLowerCase().includes(search.toLowerCase()) ||
      r.remarks?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white">Manual Entry & Punch Overrides</h2>
          <p className="text-xs text-slate-400">
            Supervisor manual corrections, client site visits, and missed biometric punch approvals.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Manual Entry</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search manual entries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Code</th>
                <th className="py-3 px-3">Staff Name</th>
                <th className="py-3 px-3">Punch In</th>
                <th className="py-3 px-3">Punch Out</th>
                <th className="py-3 px-3">Total Hours</th>
                <th className="py-3 px-3">Reason / Remarks</th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-slate-400 font-mono">
                    Loading manual entry records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-slate-400">
                    No manual overrides on record. Click "Add Manual Entry" to record a correction.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 font-mono text-slate-300">{r.log_date}</td>
                    <td className="py-3 px-3 font-mono font-bold text-amber-400">{r.employee_code}</td>
                    <td className="py-3 px-3 font-bold text-white">{r.employee_name}</td>
                    <td className="py-3 px-3 font-mono text-emerald-400 font-bold">{r.check_in_time || '--'}</td>
                    <td className="py-3 px-3 font-mono text-slate-400">{r.check_out_time || '--'}</td>
                    <td className="py-3 px-3 font-mono text-white">{r.total_hours} hrs</td>
                    <td className="py-3 px-3 text-slate-300 max-w-xs truncate">{r.remarks || 'Authorized Override'}</td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        MANUAL OVERRIDE
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <ManualEntryModal
          companyId={companyId}
          employees={employees}
          onClose={() => setIsModalOpen(false)}
          onSaved={() => {
            setIsModalOpen(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
};
