import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarDays,
  Plus,
  Calendar,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  User,
  Briefcase,
  Search,
  Filter,
  Check,
  X,
  Phone,
  RefreshCw,
} from 'lucide-react';
import { attendanceApi, AttendanceEmployee } from '../api';
import { useAuth } from '@/contexts/AuthContext';

export function LeaveApplyPage() {
  const { company } = useAuth();
  const companyId = company?.id || '';

  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('CL');
  const [durationMode, setDurationMode] = useState<'FULL' | 'HALF'>('FULL');
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [empRes, leaveRes] = await Promise.all([
        attendanceApi.getEmployees(companyId).catch(() => ({ employees: [] })),
        attendanceApi.getLeaves(companyId).catch(() => ({ data: [] })),
      ]);

      const emps = empRes.employees || [];
      setEmployees(emps);
      if (emps.length > 0 && !selectedEmployeeId) {
        setSelectedEmployeeId(emps[0].id);
      }
      setLeaves(leaveRes.data || []);
    } catch (err: any) {
      console.error('Failed to load leave data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      setErrorMessage('Please select an employee.');
      return;
    }
    if (!reason.trim()) {
      setErrorMessage('Please provide a reason for the leave.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    try {
      const res = await attendanceApi.applyLeave({
        company_id: companyId,
        employee_id: selectedEmployeeId,
        leave_category: selectedCategory,
        duration_mode: durationMode,
        from_date: fromDate,
        to_date: toDate,
        reason: reason.trim(),
        contact_phone: contactPhone.trim(),
      });

      setLeaves((prev) => [res.data, ...prev]);
      setStatusMessage('Leave application submitted successfully.');
      setReason('');
      setContactPhone('');
      setTimeout(() => setStatusMessage(''), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit leave application.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (leaveId: string, status: 'APPROVED' | 'REJECTED') => {
    setUpdatingId(leaveId);
    try {
      const res = await attendanceApi.updateLeaveStatus(leaveId, status);
      setLeaves((prev) =>
        prev.map((item) => (item.id === leaveId ? { ...item, status, reviewed_at: new Date().toISOString() } : item))
      );
      setStatusMessage(`Leave request marked as ${status === 'APPROVED' ? 'Approved' : 'Rejected'}.`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to ${status.toLowerCase()} leave request.`);
    } finally {
      setUpdatingId(null);
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

  const filteredLeaves = useMemo(() => {
    return leaves
      .map((l) => {
        const emp = empMap.get(l.employee_id);
        return {
          ...l,
          employee_name: emp ? `${emp.first_name} ${emp.last_name}` : l.employee_name || 'Staff',
          employee_code: emp ? emp.employee_code : l.employee_code || 'EMP',
          department: emp ? emp.department : l.department || 'Operations',
        };
      })
      .filter((l) => {
        if (categoryFilter !== 'ALL' && l.leave_category !== categoryFilter) return false;
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;
        return (
          l.employee_name.toLowerCase().includes(q) ||
          l.employee_code.toLowerCase().includes(q) ||
          (l.reason || '').toLowerCase().includes(q)
        );
      });
  }, [leaves, empMap, categoryFilter, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <CalendarDays className="w-7 h-7 text-blue-600" />
            Leave Management &amp; Approvals
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Apply, review, and track employee leaves with policy quotas and supervisor sign-offs
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

      {statusMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Quota KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Casual Leave (CL)</div>
          <div className="text-2xl font-black text-slate-900 mt-1">12 <span className="text-xs font-medium text-slate-400">/ yr</span></div>
          <div className="text-[10px] text-emerald-600 font-bold mt-1">Standard Paid Allowance</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sick Leave (SL)</div>
          <div className="text-2xl font-black text-slate-900 mt-1">8 <span className="text-xs font-medium text-slate-400">/ yr</span></div>
          <div className="text-[10px] text-blue-600 font-bold mt-1">Medical Certificate Req.</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Privilege Leave (PL)</div>
          <div className="text-2xl font-black text-slate-900 mt-1">15 <span className="text-xs font-medium text-slate-400">/ yr</span></div>
          <div className="text-[10px] text-violet-600 font-bold mt-1">Earned / Annual Leave</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Loss of Pay (LOP)</div>
          <div className="text-2xl font-black text-slate-900 mt-1">Unpaid</div>
          <div className="text-[10px] text-amber-600 font-bold mt-1">Salary Deducted</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Application Form */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Submit Leave Request</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Select employee, dates, and leave category
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Employee *
              </label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.employee_code}) - {emp.department}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="CL">Casual Leave (CL)</option>
                  <option value="SL">Sick Leave (SL)</option>
                  <option value="PL">Privilege Leave (PL)</option>
                  <option value="LOP">Loss of Pay (LOP)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Duration
                </label>
                <select
                  value={durationMode}
                  onChange={(e) => setDurationMode(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="FULL">Full Day</option>
                  <option value="HALF">Half Day</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  From Date
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  To Date
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Reason *
              </label>
              <textarea
                rows={2}
                placeholder="Reason for leave..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Emergency Contact Phone
              </label>
              <input
                type="tel"
                placeholder="e.g. +91 98765 43210"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-500/25 transition-all disabled:opacity-50"
            >
              {submitting ? 'Submitting Application...' : 'Apply Leave Request'}
            </button>
          </form>
        </div>

        {/* Right Leave Approvals Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Leave Applications &amp; History</span>
              </h2>
              <p className="text-[11px] text-slate-500">
                Supervisor approval workflow and status tracking
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50 focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="CL">CL</option>
                <option value="SL">SL</option>
                <option value="PL">PL</option>
                <option value="LOP">LOP</option>
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search staff..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-36 sm:w-44"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                <tr>
                  <th className="px-3 py-2.5 rounded-l-lg">Staff Member</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Date Span</th>
                  <th className="px-3 py-2.5">Reason</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 rounded-r-lg text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredLeaves.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400 italic">
                      No leave applications found.
                    </td>
                  </tr>
                ) : (
                  filteredLeaves.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-900">{item.employee_name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{item.employee_code} &bull; {item.department}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {item.leave_category} &bull; {item.duration_mode}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] whitespace-nowrap">
                        {item.from_date} &rarr; {item.to_date}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 max-w-xs truncate" title={item.reason}>
                        {item.reason}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            item.status === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : item.status === 'REJECTED'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {item.status || 'PENDING'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {item.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(item.id, 'APPROVED')}
                              disabled={updatingId === item.id}
                              className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow-2xs"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(item.id, 'REJECTED')}
                              disabled={updatingId === item.id}
                              className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold shadow-2xs"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">Reviewed</span>
                        )}
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
