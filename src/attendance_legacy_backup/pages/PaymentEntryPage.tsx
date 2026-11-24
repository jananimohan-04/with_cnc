import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Calendar,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  IndianRupee,
  RefreshCw,
  Building2,
  FileSpreadsheet,
} from 'lucide-react';
import { attendanceApi, AttendanceEmployee } from '../api';
import { useAuth } from '@/contexts/AuthContext';

export function PaymentEntryPage() {
  const { company } = useAuth();
  const companyId = company?.id || '';

  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('ALL');

  const [formData, setFormData] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    bank: 'Company Treasury (Cash/Bank)',
    payment_type: 'UPI',
    reason: 'Advance Payment',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [empRes, finRes] = await Promise.all([
        attendanceApi.getEmployees(companyId).catch(() => ({ employees: [] })),
        attendanceApi.getFinancialEntries(companyId).catch(() => ({ data: [] })),
      ]);

      const emps = empRes.employees || [];
      setEmployees(emps);
      if (emps.length > 0 && !formData.employee_id) {
        setFormData((prev) => ({ ...prev, employee_id: emps[0].id }));
      }
      setEntries(finRes.data || []);
    } catch (err: any) {
      console.error('Failed to load financial entries', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [companyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employee_id) {
      setErrorMessage('Please select an employee.');
      return;
    }
    const amt = parseFloat(formData.amount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMessage('Please enter a valid amount.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    try {
      const res = await attendanceApi.createFinancialEntry({
        company_id: companyId,
        employee_id: formData.employee_id,
        date: formData.date,
        amount: amt,
        payment_type: formData.payment_type,
        bank: formData.bank,
        reason: formData.reason,
      });

      setEntries((prev) => [res.data, ...prev]);
      setStatusMessage(`Payment entry of ₹${amt.toLocaleString('en-IN')} recorded successfully.`);
      setFormData((prev) => ({ ...prev, amount: '' }));
      setTimeout(() => setStatusMessage(''), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to record payment entry.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this payment transaction record?')) return;
    try {
      await attendanceApi.deleteFinancialEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setStatusMessage('Entry removed.');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete entry.');
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

  const filteredEntries = useMemo(() => {
    return entries
      .map((entry) => {
        const emp = empMap.get(entry.employee_id);
        return {
          ...entry,
          employee_name: emp ? `${emp.first_name} ${emp.last_name}` : entry.employee_name || 'Staff',
          employee_code: emp ? emp.employee_code : entry.employee_code || 'EMP',
          department: emp ? emp.department : entry.department || 'Operations',
        };
      })
      .filter((entry) => {
        if (filterEmployee !== 'ALL' && entry.employee_id !== filterEmployee) return false;
        const q = searchTerm.toLowerCase().trim();
        if (!q) return true;
        return (
          entry.employee_name.toLowerCase().includes(q) ||
          entry.employee_code.toLowerCase().includes(q) ||
          (entry.reason || '').toLowerCase().includes(q)
        );
      });
  }, [entries, empMap, filterEmployee, searchTerm]);

  const totalAdvanceAmount = useMemo(() => {
    return filteredEntries
      .filter((e) => (e.reason || '').includes('Advance'))
      .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  }, [filteredEntries]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <CreditCard className="w-7 h-7 text-emerald-600" />
            Payment &amp; Advance Money Entry
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Record employee salary advances, daily wage disbursements, and expense reimbursements
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Recorded Entries</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{filteredEntries.length}</div>
          <div className="text-[10px] text-slate-500 font-medium mt-1">Financial transactions logged</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Active Advance Given</div>
          <div className="text-2xl font-black text-amber-600 mt-1">₹{totalAdvanceAmount.toLocaleString('en-IN')}</div>
          <div className="text-[10px] text-amber-600 font-bold mt-1">Settled automatically in monthly payslip</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Disbursement Status</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">Ready</div>
          <div className="text-[10px] text-emerald-600 font-bold mt-1">Synced to payroll engine</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Log Advance or Payment</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Record transaction details with date and payment mode
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Employee *
              </label>
              <select
                value={formData.employee_id}
                onChange={(e) => setFormData((prev) => ({ ...prev, employee_id: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
                  Transaction Date
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  placeholder="e.g. 5000"
                  value={formData.amount}
                  onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Payment Mode
                </label>
                <select
                  value={formData.payment_type}
                  onChange={(e) => setFormData((prev) => ({ ...prev, payment_type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="UPI">UPI Transfer</option>
                  <option value="Bank">Bank NEFT/IMPS</option>
                  <option value="Cash">Cash Handover</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                  Category / Reason
                </label>
                <select
                  value={formData.reason}
                  onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="Advance Payment">Salary Advance</option>
                  <option value="Overtime Payment">Overtime Bonus</option>
                  <option value="Food & Travel Reimbursement">Travel Expense</option>
                  <option value="Festival Bonus">Festival Bonus</option>
                  <option value="Other">Other Payout</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-500/25 transition-all disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Saving Transaction...' : 'Save Payment Entry'}
            </button>
          </form>
        </div>

        {/* Right Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-emerald-600" />
                <span>Transaction History</span>
              </h2>
              <p className="text-[11px] text-slate-500">
                Log of advances and disbursements
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-slate-50 focus:outline-none max-w-[130px] truncate"
              >
                <option value="ALL">All Staff</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search entries..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 w-32 sm:w-40"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                <tr>
                  <th className="px-3 py-2.5 rounded-l-lg">Staff Member</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Mode</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Amount</th>
                  <th className="px-3 py-2.5 rounded-r-lg text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400 italic">
                      No payment or advance entries found.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-900">{e.employee_name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{e.employee_code} &bull; {e.department}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-800 whitespace-nowrap">
                        {e.date}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {e.payment_type || 'UPI'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 truncate max-w-xs">
                        {e.reason || 'Advance Payment'}
                      </td>
                      <td className="px-3 py-2.5 font-black text-slate-900 font-mono">
                        ₹{(parseFloat(e.amount) || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(e.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
