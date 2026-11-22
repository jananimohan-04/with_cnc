import React, { useState, useEffect } from 'react';
import { 
  Banknote, 
  Plus, 
  Calendar, 
  Download, 
  Filter, 
  Search, 
  ArrowUpRight, 
  Clock, 
  PieChart, 
  CheckCircle2, 
  MoreVertical, 
  FileText, 
  X,
  User,
  IndianRupee,
  Layers,
  Inbox,
  UserPlus
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

export const AdvanceMoney = () => {
  const { user } = useAuth();
  const availableCycles = React.useMemo(() => {
    const list = [];
    const now = new Date();
    for (let i = -3; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      list.push(d.toLocaleString('en-US', { month: 'long', year: 'numeric' }));
    }
    return list;
  }, []);

  const [cycle, setCycle] = useState(() => new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }));
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [slipModalOpen, setSlipModalOpen] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState(null);

  const [employees, setEmployees] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [newAdvance, setNewAdvance] = useState({
    employeeId: '',
    amount: '',
    installments: 2,
    reason: ''
  });

  const isEmployee = user?.role === 'employee';
  const isAdmin = !isEmployee;

  // Find linked employee record for logged in user
  const myEmployee = React.useMemo(() => {
    return (employees || []).find(e => 
      (user?.employee_id && e.id === user.employee_id) ||
      (user?.employee_code && e.employee_code === user.employee_code) ||
      (user?.email && e.email === user.email)
    );
  }, [employees, user]);

  useEffect(() => {
    fetchInitialData();
    const interval = setInterval(() => {
      fetchInitialData(true);
    }, 6000);

    const onFocus = () => {
      fetchInitialData(true);
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [cycle]);

  const fetchInitialData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const [empRes, advRes] = await Promise.all([
        api.get('/employees/').catch(() => ({ data: [] })),
        api.get(`/advances?cycle=${encodeURIComponent(cycle)}`).catch(() => ({ data: [] }))
      ]);

      const empList = empRes.data || [];
      setEmployees(empList);
      if (empList.length > 0 && !isSilent) {
        const defaultEmp = isEmployee
          ? empList.find(e => e.email === user?.email || e.id === user?.employee_id) || empList[0]
          : empList[0];
        setNewAdvance(prev => ({ ...prev, employeeId: defaultEmp?.id || '' }));
      }
      setAdvances(advRes.data || []);
    } catch (err) {
      console.error('Failed to load advance money data', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  const handleIssueAdvance = async (e) => {
    e.preventDefault();
    const targetEmpId = isEmployee 
      ? (myEmployee?.id || user?.employee_id || user?.id || 'EMP-SELF')
      : newAdvance.employeeId;

    if (!targetEmpId || !newAdvance.amount) {
      setErrorMessage(isEmployee ? 'Please enter the advance amount.' : 'Please select an employee and enter the advance amount.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    try {
      const res = await api.post('/advances', {
        employee_id: targetEmpId,
        total_advance: parseFloat(newAdvance.amount),
        installments: parseInt(newAdvance.installments) || 2,
        reason: newAdvance.reason || (isAdmin ? 'Authorized Salary Advance' : 'Salary Advance Request'),
        cycle: cycle
      });

      setAdvances(prev => [res.data, ...prev]);
      setModalOpen(false);
      setStatusMessage(isAdmin 
        ? 'Salary advance issued and scheduled for payroll deduction.' 
        : 'Salary advance request submitted successfully for supervisor approval.');
      setTimeout(() => setStatusMessage(''), 4000);

      const defaultEmp = isEmployee
        ? myEmployee || employees.find(e => e.email === user?.email || e.id === user?.employee_id)
        : (employees.length > 0 ? employees[0] : null);

      setNewAdvance({
        employeeId: defaultEmp ? defaultEmp.id : '',
        amount: '',
        installments: 2,
        reason: ''
      });
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Failed to submit salary advance.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (advanceId, newStatus) => {
    try {
      const res = await api.patch(`/advances/${advanceId}/status`, { status: newStatus });
      setAdvances(prev => prev.map(a => a.id === advanceId ? { ...a, ...(res.data.record || res.data) } : a));
      setStatusMessage(`Advance status updated to ${newStatus === 'APPROVED' ? 'Approved & Disbursed' : 'Rejected'}.`);
      setTimeout(() => setStatusMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Failed to update advance status.');
      setTimeout(() => setErrorMessage(''), 4000);
    }
  };

  const openSlip = (adv) => {
    setSelectedSlip(adv);
    setSlipModalOpen(true);
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

  const enrichedAdvances = advances.map(a => {
    const emp = (a.employee_id && empMap[a.employee_id]) || (a.emp_code && empMap[a.emp_code]) || null;
    return {
      ...a,
      name: emp ? `${emp.first_name} ${emp.last_name}` : (a.name || 'Employee'),
      emp_code: emp ? emp.employee_code : (a.emp_code || a.empCode || 'EMP'),
      dept: emp ? emp.department : (a.dept || 'Operations')
    };
  });

  // Filter records: for employee, strictly show their own advances
  const roleFilteredAdvances = React.useMemo(() => {
    if (!isEmployee) return enrichedAdvances;
    return enrichedAdvances.filter(a => {
      if (user?.employee_id && a.employee_id === user.employee_id) return true;
      if (user?.employee_code && (a.emp_code === user.employee_code || a.empCode === user.employee_code)) return true;
      if (user?.email && a.email === user.email) return true;
      if (user?.name && a.name && a.name.toLowerCase() === user.name.toLowerCase()) return true;
      return false;
    });
  }, [enrichedAdvances, isEmployee, user]);

  // Dynamic KPI calculations from actual records
  const totalDisbursed = roleFilteredAdvances
    .filter(a => (a.approval_type || a.approvalType) === 'active' || (a.approval || '').includes('Approved'))
    .reduce((acc, curr) => acc + (Number(curr.total_advance || curr.totalAdvance) || 0), 0);
  const totalDeductions = roleFilteredAdvances
    .filter(a => (a.approval_type || a.approvalType) === 'active' || (a.approval || '').includes('Approved'))
    .reduce((acc, curr) => acc + (Number(curr.next_deduction || curr.nextDeduction) || 0), 0);
  const remainingBalance = roleFilteredAdvances
    .filter(a => (a.approval_type || a.approvalType) === 'active' || (a.approval || '').includes('Approved'))
    .reduce((acc, curr) => acc + (Number(curr.balance) || 0), 0);
  const activeCount = roleFilteredAdvances.filter(a => (a.approval_type || a.approvalType) === 'active' || (a.approval || '').includes('Approved')).length;
  const pendingCount = roleFilteredAdvances.filter(a => (a.approval_type || a.approvalType) === 'pending' || (a.approval || '').toLowerCase().includes('pending')).length;

  const filteredAdvances = roleFilteredAdvances.filter(a => {
    const name = a.name || '';
    const code = a.emp_code || a.empCode || '';
    const dept = a.dept || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase()) || 
           code.toLowerCase().includes(searchTerm.toLowerCase()) ||
           dept.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Title & Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {isEmployee ? 'Advance Money Request' : 'Advance Money Management'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Cycle Selector */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] uppercase font-mono text-slate-400">CYCLE:</span>
            <select
              value={cycle}
              onChange={(e) => setCycle(e.target.value)}
              className="bg-transparent border-none focus:outline-none font-bold text-slate-800 cursor-pointer"
            >
              {availableCycles.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0052cc] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {isEmployee ? 'Request Advance Money' : 'Issue Salary Advance'}
          </button>
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
          <CheckCircle2 className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 4 KPI Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Disbursed / My Active Advance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
              {isEmployee ? 'MY ACTIVE ADVANCE' : 'TOTAL DISBURSED (CYCLE)'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="my-3">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              ₹{totalDisbursed.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold w-fit">
            <span>{activeCount} Active {activeCount === 1 ? 'Advance' : 'Advances'}</span>
            <span className="text-slate-400 font-normal">in this cycle</span>
          </div>
        </div>

        {/* Card 2: Deductions */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
              {isEmployee ? 'UPCOMING DEDUCTION' : 'DEDUCTIONS (CURRENT CYCLE)'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="my-3">
            <div className="text-2xl sm:text-3xl font-black text-blue-600 tracking-tight">
              ₹{totalDeductions.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>To be auto-deducted at cycle cut</span>
          </div>
        </div>

        {/* Card 3: Remaining Advance Balance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
              {isEmployee ? 'REMAINING BALANCE' : 'REMAINING ADVANCE BALANCE'}
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="my-3">
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              ₹{remainingBalance.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="text-[11px] text-slate-500">
            {isEmployee ? 'Outstanding amount across remaining cycles' : 'Deferred to upcoming payroll cycles'}
          </div>
        </div>

        {/* Card 4: Request Status / Cycle Health */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <PieChart className="w-3.5 h-3.5 text-slate-400" />
              {isEmployee ? 'REQUEST STATUS' : 'CYCLE HEALTH'}
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {isEmployee ? (pendingCount > 0 ? 'PENDING' : 'ACTIVE') : 'ACTIVE'}
            </span>
          </div>

          <div className="my-2">
            <div className="text-sm font-bold text-slate-800">
              {isEmployee 
                ? (pendingCount > 0 ? `${pendingCount} Under Review` : activeCount > 0 ? 'Active Repayment' : 'No Active Advances')
                : `${advances.length} Active Records`}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              {isEmployee 
                ? (pendingCount > 0 ? 'Awaiting supervisor approval' : 'Direct payroll amortization')
                : '100% tenant reconciled'}
            </div>
          </div>

          <div className="text-[10px] text-slate-400 font-mono border-t border-slate-100 pt-1">
            {isEmployee ? 'Auto-reconciles on cycle cut' : 'Reconciliation Engine: Synchronous'}
          </div>
        </div>
      </div>

      {/* Admin Notice for Pending Advance Approvals */}
      {isAdmin && pendingCount > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            <div>
              <span className="font-bold">{pendingCount} Pending Advance Approval {pendingCount === 1 ? 'Request' : 'Requests'}</span>
              <span className="text-amber-700 ml-1.5 hidden sm:inline">— Action required to disburse or reject employee salary advances below.</span>
            </div>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-amber-200/80 text-amber-900 font-mono font-bold text-[10px]">
            ACTION REQUIRED
          </span>
        </div>
      )}

      {/* Table Card: Active Advance Register & Amortization */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isEmployee ? 'My Salary Advance Requests & Deductions' : 'Active Advance Register & Amortization'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={isEmployee ? "Search advances..." : "Search employee or ID..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-56"
              />
            </div>

            <button
              type="button"
              className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              title="Filter"
            >
              <Filter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => alert('Exporting register...')}
              className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              title="Export Register"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Table Data */}
        <div className="overflow-x-auto">
          {filteredAdvances.length > 0 ? (
            <table className="w-full text-left text-xs text-slate-600 border-collapse min-w-[850px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">EMPLOYEE</th>
                  <th className="py-3 px-4">TOTAL ADVANCE</th>
                  <th className="py-3 px-4">NEXT DEDUCTION</th>
                  <th className="py-3 px-4">REPAYMENT PROGRESS</th>
                  <th className="py-3 px-4">BALANCE</th>
                  <th className="py-3 px-4">APPROVAL</th>
                  <th className="py-3 px-4">CYCLE IMPACT</th>
                  <th className="py-3 px-4 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAdvances.map((adv) => {
                  const empName = adv.name || 'Employee';
                  const empCode = adv.emp_code || adv.empCode || 'EMP';
                  const dept = adv.dept || 'Operations';
                  const total = Number(adv.total_advance || adv.totalAdvance) || 0;
                  const nextDed = Number(adv.next_deduction || adv.nextDeduction) || 0;
                  const bal = Number(adv.balance) || 0;
                  const initials = empName.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

                  return (
                    <tr key={adv.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Employee */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{empName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {empCode} • {dept}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Total Advance */}
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        ₹{total.toLocaleString('en-IN')}
                      </td>

                      {/* Next Deduction */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-blue-600">
                          ₹{nextDed.toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {adv.instalment_text || adv.instalmentText || 'Instalment 1/2'}
                        </div>
                      </td>

                      {/* Repayment Progress Bar */}
                      <td className="py-3.5 px-4">
                        <div className="w-32">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                            <span>{adv.progress_text || adv.progressText || '0 of 2 mos'}</span>
                            <span className="font-bold">{adv.progress_percent || adv.progressPercent || 0}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[#0080ff] rounded-full transition-all"
                              style={{ width: `${adv.progress_percent || adv.progressPercent || 0}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Balance */}
                      <td className="py-3.5 px-4 font-bold text-slate-800">
                        ₹{bal.toLocaleString('en-IN')}
                      </td>

                      {/* Approval Status Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {((adv.approval_type || adv.approvalType) === 'active' || (adv.approval || '').toLowerCase().includes('approved')) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-mono font-bold text-[10px] border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            {adv.approval || 'Approved & Active'}
                          </span>
                        ) : ((adv.approval_type || adv.approvalType) === 'rejected' || (adv.approval || '').toLowerCase().includes('rejected')) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-mono font-bold text-[10px] border border-rose-200">
                            <X className="w-3 h-3 text-rose-600" />
                            {adv.approval || 'Rejected'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-mono font-bold text-[10px] border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            {adv.approval || 'Pending Approval'}
                          </span>
                        )}
                      </td>

                      {/* Cycle Impact */}
                      <td className="py-3.5 px-4 text-[11px] text-slate-600 font-medium">
                        {adv.cycle_impact || adv.cycleImpact || `Will deduct ₹${nextDed.toLocaleString('en-IN')} on cycle cut`}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isAdmin && ((adv.approval_type || adv.approvalType) === 'pending' || (adv.approval || '').toLowerCase().includes('pending')) && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(adv.id, 'APPROVED')}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors flex items-center gap-1 cursor-pointer"
                                title="Approve & Disburse Salary Advance"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(adv.id, 'REJECTED')}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                title="Reject Advance Request"
                              >
                                <X className="w-3 h-3" />
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => openSlip(adv)}
                            className="text-blue-600 hover:text-blue-800 font-bold text-xs hover:underline cursor-pointer ml-1"
                          >
                            Slip
                          </button>
                        </div>
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
                {isEmployee ? 'No salary advance requests for this cycle' : 'No active salary advances for this cycle'}
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                {isEmployee 
                  ? 'Submit a salary advance request using the button below for supervisor review.'
                  : 'Click the button below to disburse and schedule a salary advance for your enrolled staff.'}
              </p>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="px-4 py-2 bg-[#0052cc] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {isEmployee ? 'Request Advance Money' : 'Issue First Advance'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
          <div>
            Showing {filteredAdvances.length} {isEmployee ? 'personal advance entry(s)' : 'active advance entries'}
          </div>
        </div>
      </div>

      {/* Modal: Issue / Request Salary Advance */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-blue-600" />
                {isEmployee ? 'Request Salary Advance' : 'Issue Salary Advance'}
              </h3>
              <button 
                type="button" 
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleIssueAdvance} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  {isEmployee ? 'Applicant Profile' : 'Select Enrolled Employee *'}
                </label>
                {isEmployee ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                        {(user?.name || 'EM').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-xs sm:text-sm">
                          {user?.name || 'Employee'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {user?.employee_code || (user?.employee_id ? `EMP-${user.employee_id.slice(0,4)}` : 'STAFF')} • {user?.email || 'Active Employee'}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                      Applicant
                    </span>
                  </div>
                ) : employees.length > 0 ? (
                  <select
                    required
                    value={newAdvance.employeeId}
                    onChange={(e) => setNewAdvance({ ...newAdvance, employeeId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name} ({emp.employee_code || 'EMP'}) — {emp.department || 'General'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center justify-between">
                    <span>No enrolled employees found.</span>
                    <Link to="/attendance/enrollment" className="font-bold underline">
                      Enroll now
                    </Link>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Advance Amount (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="25000"
                    value={newAdvance.amount}
                    onChange={(e) => setNewAdvance({ ...newAdvance, amount: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Installment Months
                  </label>
                  <select
                    value={newAdvance.installments}
                    onChange={(e) => setNewAdvance({ ...newAdvance, installments: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value={1}>1 Month (100%)</option>
                    <option value={2}>2 Months (50%/mo)</option>
                    <option value={3}>3 Months (33%/mo)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Reason / Approval Reference
                </label>
                <textarea
                  rows="2"
                  placeholder="e.g. Medical urgency / Family support"
                  value={newAdvance.reason}
                  onChange={(e) => setNewAdvance({ ...newAdvance, reason: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || (!isEmployee && employees.length === 0)}
                  className="px-4 py-2 bg-[#0052cc] hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {submitting 
                    ? (isAdmin ? 'Authorizing...' : 'Submitting...') 
                    : (isAdmin ? 'Authorize Advance' : 'Submit Advance Request')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Advance Slip Preview */}
      {slipModalOpen && selectedSlip && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-slate-200 p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-[10px] font-mono uppercase font-bold text-slate-400">ARGUS ADVANCE RECEIPT</span>
              <button 
                type="button" 
                onClick={() => setSlipModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div className="text-center">
                <div className="text-xl font-black text-slate-900">
                  ₹{Number(selectedSlip.total_advance || selectedSlip.totalAdvance || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-xs text-slate-500 font-medium">Disbursed Salary Advance</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span className="text-slate-400">Employee:</span>
                  <span className="font-bold text-slate-800">{selectedSlip.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Badge ID:</span>
                  <span className="font-mono text-slate-800">{selectedSlip.emp_code || selectedSlip.empCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Next Deduction:</span>
                  <span className="font-bold text-blue-600">₹{Number(selectedSlip.next_deduction || selectedSlip.nextDeduction || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Remaining Balance:</span>
                  <span className="font-bold text-slate-900">₹{Number(selectedSlip.balance || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="font-bold text-emerald-700">{selectedSlip.approval || 'Approved & Active'}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                window.print();
                setSlipModalOpen(false);
              }}
              className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-sm cursor-pointer"
            >
              Print Official Slip
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
