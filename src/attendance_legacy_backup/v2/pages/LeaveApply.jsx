import React, { useState, useEffect } from 'react';
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
  FileText, 
  Inbox, 
  Check, 
  X,
  Phone
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

export const LeaveApply = () => {
  const { user, organization } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState('PL'); // 'PL', 'CL', 'SL', 'LOP'
  const [durationMode, setDurationMode] = useState('FULL'); // 'FULL' or 'HALF'
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [leaveHistory, setLeaveHistory] = useState([]);

  const isEmployee = user?.role === 'employee';
  const isAdmin = !isEmployee;

  useEffect(() => {
    fetchLeaves();
  }, []);

  const fetchLeaves = async () => {
    setLoading(true);
    try {
      const [leavesRes, empsRes] = await Promise.all([
        api.get('/leaves'),
        api.get('/employees/').catch(() => ({ data: [] }))
      ]);
      setLeaveHistory(leavesRes.data || []);
      const empList = empsRes.data || [];
      setEmployees(empList);
      if (empList.length > 0 && !selectedEmployeeId) {
        setSelectedEmployeeId(empList[0].id);
      }
    } catch (err) {
      console.error('Failed to load leave history', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (leaveId, status) => {
    setUpdatingId(leaveId);
    try {
      const res = await api.patch(`/leaves/${leaveId}/status`, { status });
      setLeaveHistory(prev => prev.map(item => item.id === leaveId ? { ...item, ...res.data } : item));
      setStatusMessage(`Leave request marked as ${status === 'APPROVED' ? 'Approved' : 'Rejected'}.`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || `Failed to ${status.toLowerCase()} leave request.`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMessage('Please specify a reason for taking absence.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    try {
      const payload = {
        category: selectedCategory,
        from_date: fromDate,
        to_date: toDate,
        duration_mode: durationMode,
        reason: reason.trim(),
        contact_phone: contactPhone || null
      };
      if (isAdmin && selectedEmployeeId) {
        payload.employee_id = selectedEmployeeId;
      }
      const res = await api.post('/leaves', payload);

      setLeaveHistory(prev => [res.data, ...prev]);
      setStatusMessage('Leave application submitted successfully.');
      setTimeout(() => setStatusMessage(''), 4000);
      setReason('');
      setContactPhone('');
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Failed to submit leave application.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = () => {
    setReason('');
    setContactPhone('');
    setSelectedCategory('PL');
    setDurationMode('FULL');
  };

  // Build reactive employee map so edited names/details dynamically cascade
  const empMap = React.useMemo(() => {
    const map = {};
    (employees || []).forEach(e => {
      map[e.id] = e;
      if (e.employee_code) map[e.employee_code] = e;
    });
    return map;
  }, [employees]);

  const enrichedHistory = React.useMemo(() => {
    return leaveHistory.map(item => {
      const emp = (item.employee_id && empMap[item.employee_id]) || (item.emp_code && empMap[item.emp_code]) || null;
      return {
        ...item,
        name: emp ? `${emp.first_name} ${emp.last_name}` : (item.name || 'Employee'),
        emp_code: emp ? emp.employee_code : (item.emp_code || item.empCode || 'STAFF'),
        department: emp ? emp.department : (item.department || 'Operations')
      };
    });
  }, [leaveHistory, empMap]);

  // Role-filtered leave records
  const roleFilteredLeaves = React.useMemo(() => {
    if (!isEmployee) return enrichedHistory;
    return enrichedHistory.filter(item => {
      if (user?.employee_id && item.employee_id === user.employee_id) return true;
      if (user?.employee_code && (item.emp_code === user.employee_code || item.empCode === user.employee_code)) return true;
      if (user?.email && item.email === user.email) return true;
      if (user?.name && item.name && item.name.toLowerCase() === user.name.toLowerCase()) return true;
      return false;
    });
  }, [enrichedHistory, isEmployee, user]);

  // Filtered by search and category filter
  const filteredHistory = React.useMemo(() => {
    return roleFilteredLeaves.filter(item => {
      const name = item.name || '';
      const code = item.emp_code || item.empCode || '';
      const res = item.reason || '';
      const cat = item.category || '';
      const catCode = item.category_code || item.categoryCode || '';
      const q = searchQuery.toLowerCase();
      const matchesSearch = name.toLowerCase().includes(q) || 
                            code.toLowerCase().includes(q) || 
                            res.toLowerCase().includes(q) || 
                            cat.toLowerCase().includes(q);

      const matchesCat = categoryFilter === 'ALL' || catCode === categoryFilter || cat.toLowerCase().includes(categoryFilter.toLowerCase());
      return matchesSearch && matchesCat;
    });
  }, [roleFilteredLeaves, searchQuery, categoryFilter]);

  // Dynamic KPI calculations
  const myLeaves = roleFilteredLeaves;
  const usedPL = myLeaves.filter(l => (l.category_code === 'PL' || (l.category || '').includes('Paid')) && ((l.status || '').toLowerCase().includes('approved'))).length;
  const usedCL = myLeaves.filter(l => (l.category_code === 'CL' || (l.category || '').includes('Casual')) && ((l.status || '').toLowerCase().includes('approved'))).length;
  const usedSL = myLeaves.filter(l => (l.category_code === 'SL' || (l.category || '').includes('Sick')) && ((l.status || '').toLowerCase().includes('approved'))).length;
  const usedLOP = myLeaves.filter(l => (l.category_code === 'LOP' || (l.category || '').includes('Unpaid')) && ((l.status || '').toLowerCase().includes('approved'))).length;

  const totalRequests = roleFilteredLeaves.length;
  const pendingRequests = roleFilteredLeaves.filter(l => (l.status || '').toLowerCase().includes('pending')).length;
  const approvedRequests = roleFilteredLeaves.filter(l => (l.status || '').toLowerCase().includes('approved')).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {isEmployee ? 'Leave Application & Status' : 'Leave Application & Approvals'}
          </h1>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 4 Clean Leave Balance / Status Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isEmployee ? (
          <>
            {/* Card 1: Paid Leave (PL) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  PAID LEAVE (PL)
                </span>
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {Math.max(0, 12 - usedPL)} <span className="text-xs font-medium text-slate-500">Days Available</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Allocated: 12 days</span>
                <span className="font-bold text-emerald-600">{usedPL} used</span>
              </div>
            </div>

            {/* Card 2: Casual Leave (CL) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  CASUAL LEAVE (CL)
                </span>
                <div className="w-7 h-7 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {Math.max(0, 5 - usedCL)} <span className="text-xs font-medium text-slate-500">Days Available</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Allocated: 5 days</span>
                <span className="font-bold text-cyan-700">{usedCL} used</span>
              </div>
            </div>

            {/* Card 3: Sick Leave (SL) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  SICK LEAVE (SL)
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <Briefcase className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {Math.max(0, 7 - usedSL)} <span className="text-xs font-medium text-slate-500">Days Available</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Allocated: 7 days</span>
                <span className="font-bold text-emerald-700">{usedSL} used</span>
              </div>
            </div>

            {/* Card 4: Unpaid Leave (LOP) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  LOSS OF PAY (LOP)
                </span>
                <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  <AlertCircle className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <div className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight">
                  {usedLOP} <span className="text-xs font-medium text-slate-500">Days Incurred</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-rose-600 font-semibold">
                Deducted from monthly payroll
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Admin Card 1: Total Requests */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  TOTAL REQUESTS
                </span>
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  {totalRequests}
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                All-time submitted leaves
              </div>
            </div>

            {/* Admin Card 2: Pending Approvals */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  PENDING APPROVAL
                </span>
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <div className="text-2xl sm:text-3xl font-black text-amber-600 tracking-tight">
                  {pendingRequests}
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-amber-700 font-semibold">
                Awaiting administrator review
              </div>
            </div>

            {/* Admin Card 3: Approved Leaves */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  APPROVED LEAVES
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <div className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tight">
                  {approvedRequests}
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-emerald-700 font-semibold">
                Reconciled with timecards
              </div>
            </div>

            {/* Admin Card 4: Unpaid Absences (LOP) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  LOP INCURRED
                </span>
                <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  <AlertCircle className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <div className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight">
                  {leaveHistory.filter(l => (l.category_code || l.categoryCode) === 'LOP').length}
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-rose-600 font-semibold">
                Impacts monthly payroll
              </div>
            </div>
          </>
        )}
      </div>

      {/* Dual Column Layout: Form Left, History Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Apply for Leave Form */}
        <div className="lg:col-span-5 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Apply for Leave
              </h2>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              {user?.employee_code || (user?.employee_id ? `EMP-${user.employee_id.slice(0,4)}` : 'STAFF')}
            </span>
          </div>

          <form onSubmit={handleSubmitLeave} className="space-y-4">
            {isAdmin && employees.length > 0 && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Employee Selection *
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} ({emp.employee_code || 'EMP'}) — {emp.department || 'General'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isEmployee && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                    {(user?.name || 'EM').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-xs sm:text-sm">{user?.name || 'Employee'}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {user?.employee_code || 'EMP'} • {user?.email || 'Active Staff'}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                  Applicant
                </span>
              </div>
            )}

            {/* Leave Category selection pills */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Leave Category *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('PL')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedCategory === 'PL' 
                      ? 'border-blue-500 bg-blue-50/60 shadow-sm ring-1 ring-blue-500' 
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-xs text-slate-900">
                    <span>Paid Leave (PL)</span>
                    {selectedCategory === 'PL' && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Salary protected</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedCategory('CL')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedCategory === 'CL' 
                      ? 'border-cyan-500 bg-cyan-50/60 shadow-sm ring-1 ring-cyan-500' 
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-xs text-slate-900">
                    <span>Casual Leave (CL)</span>
                    {selectedCategory === 'CL' && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600" />}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Short-notice / Personal</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedCategory('SL')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedCategory === 'SL' 
                      ? 'border-emerald-500 bg-emerald-50/60 shadow-sm ring-1 ring-emerald-500' 
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-xs text-slate-900">
                    <span>Sick Leave (SL)</span>
                    {selectedCategory === 'SL' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Medical provision</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedCategory('LOP')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedCategory === 'LOP' 
                      ? 'border-rose-400 bg-rose-50/60 shadow-sm ring-1 ring-rose-400' 
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-xs text-slate-900">
                    <span>Unpaid (LOP)</span>
                    {selectedCategory === 'LOP' && <AlertCircle className="w-3.5 h-3.5 text-rose-600" />}
                  </div>
                  <div className="text-[10px] text-rose-600 font-medium mt-0.5">Payroll deduction</div>
                </button>
              </div>
            </div>

            {/* Dates row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  FROM DATE *
                </label>
                <input
                  type="date"
                  required
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  TO DATE *
                </label>
                <input
                  type="date"
                  required
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Duration type */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-xs font-bold text-slate-700">Duration</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="duration"
                    checked={durationMode === 'FULL'}
                    onChange={() => setDurationMode('FULL')}
                    className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  Full Day
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="duration"
                    checked={durationMode === 'HALF'}
                    onChange={() => setDurationMode('HALF')}
                    className="text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  Half Day
                </label>
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Reason for Leave *
              </label>
              <textarea
                rows="2"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Specify the reason for taking absence..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Contact during leave */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                CONTACT NUMBER DURING LEAVE (OPTIONAL)
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="+91 98765 43210"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleClear}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-[#0052cc] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Leave Request History */}
        <div className="lg:col-span-7 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isEmployee ? 'My Leave Request History' : 'Leave Request Ledger'}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search entries..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-36 sm:w-44"
                />
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                <option value="PL">Paid Leave</option>
                <option value="CL">Casual Leave</option>
                <option value="SL">Sick Leave</option>
                <option value="LOP">Unpaid (LOP)</option>
              </select>
            </div>
          </div>

          {/* History List Table */}
          <div className="overflow-x-auto mt-2">
            {filteredHistory.length > 0 ? (
              <table className="w-full text-left text-xs text-slate-600 border-collapse min-w-[550px]">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-2.5 px-3">EMPLOYEE</th>
                    <th className="py-2.5 px-3">LEAVE DETAILS</th>
                    <th className="py-2.5 px-3">REASON</th>
                    <th className="py-2.5 px-3">STATUS</th>
                    <th className="py-2.5 px-3">PAYROLL EFFECT</th>
                    <th className="py-2.5 px-3 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.map((item) => {
                    const empName = item.name || 'Employee';
                    const empCode = item.emp_code || item.empCode || 'STAFF';
                    const initials = empName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
                    const catCode = item.category_code || item.categoryCode || 'PL';

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Employee */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                              {initials}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{empName}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{empCode}</div>
                            </div>
                          </div>
                        </td>

                        {/* Details */}
                        <td className="py-3 px-3">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold font-mono mb-1 ${
                            catCode === 'PL' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            catCode === 'CL' ? 'bg-cyan-50 text-cyan-700 border border-cyan-200' :
                            catCode === 'SL' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {item.category || 'Leave'}
                          </span>
                          <div className="font-bold text-slate-800 text-[11px]">{item.dates}</div>
                          <div className="text-[10px] text-slate-400">{item.days}</div>
                        </td>

                        {/* Reason */}
                        <td className="py-3 px-3 text-slate-700 max-w-[160px] truncate">
                          {item.reason}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                            (item.status || '').toLowerCase().includes('approved')
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : (item.status || '').toLowerCase().includes('rejected')
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              (item.status || '').toLowerCase().includes('approved') ? 'bg-emerald-500' : 
                              (item.status || '').toLowerCase().includes('rejected') ? 'bg-rose-500' : 'bg-amber-500'
                            }`} />
                            {item.status || 'Pending Review'}
                          </span>
                        </td>

                        {/* Payroll Effect */}
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 text-slate-700 font-medium text-[11px]">
                            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            {item.payroll_effect || item.payrollEffect || 'Salary Protected'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {isAdmin && ((item.status || '').toLowerCase().includes('pending') || !item.status) ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={updatingId === item.id}
                                onClick={() => handleUpdateStatus(item.id, 'APPROVED')}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Approve Leave"
                              >
                                <Check className="w-3 h-3 stroke-[2.5]" />
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                disabled={updatingId === item.id}
                                onClick={() => handleUpdateStatus(item.id, 'REJECTED')}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Reject Leave"
                              >
                                <X className="w-3 h-3 stroke-[2.5]" />
                                <span>Reject</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-400">
                              {item.approved_by || ((item.status || '').toLowerCase().includes('approved') ? 'Approved' : 'Recorded')}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="py-12 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Inbox className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">
                  {isEmployee ? 'No leave requests submitted yet' : 'No leave records found'}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {isEmployee 
                    ? 'Submit a leave application using the form on the left. All submissions will be audited and tracked here.'
                    : 'No leave applications matching your current filter criteria.'}
                </p>
              </div>
            )}
          </div>

          {/* Table Footer */}
          <div className="pt-4 mt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
            <div>Showing {filteredHistory.length} record(s)</div>
          </div>
        </div>
      </div>
    </div>
  );
};
