import React, { useState, useEffect } from 'react';
import { Plus, ArrowLeft, Search, HandCoins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { paymentService } from '../services/paymentService';
import { employeeService } from '../services/employeeService';
import type { AdvanceRecord } from '../types/payment.types';
import type { AttendanceEmployee } from '../types/employee.types';

interface Props {
  companyId: string;
}

export const AdvanceManagementPage: React.FC<Props> = ({ companyId }) => {
  const navigate = useNavigate();
  const [advances, setAdvances] = useState<AdvanceRecord[]>([]);
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [employeeId, setEmployeeId] = useState('');
  const [amount, setAmount] = useState(10000);
  const [monthlyDeduction, setMonthlyDeduction] = useState(2500);
  const [reason, setReason] = useState('Medical / Emergency Advance');

  const loadData = async () => {
    try {
      setLoading(true);
      const [advList, empList] = await Promise.all([
        paymentService.getAdvances(companyId),
        employeeService.getEmployees(companyId),
      ]);
      setAdvances(advList);
      setEmployees(empList);
      if (empList.length) setEmployeeId(empList[0].id);
    } catch (err) {
      console.error('Error loading advances:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [companyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const selEmp = employees.find((x) => x.id === employeeId);
    if (!selEmp) return;

    try {
      await paymentService.createAdvance(companyId, {
        employee_id: employeeId,
        employee_name: selEmp.employee_name,
        employee_code: selEmp.employee_code,
        amount: Number(amount),
        monthly_deduction: Number(monthlyDeduction),
        reason,
      });
      setShowModal(false);
      loadData();
    } catch (err) {
      alert('Failed to grant advance: ' + String(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={() => navigate('/attendance/payment-entry')}
            className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-semibold mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>← Back to Payment Entry</span>
          </button>
          <h2 className="text-xl font-black text-white">Employee Salary Advance Management</h2>
          <p className="text-xs text-slate-400">
            Grant advances, track recovery installments, and inspect outstanding employee loan balances.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Grant Advance</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Advance ID</th>
                <th className="py-3 px-3">Staff Code</th>
                <th className="py-3 px-3">Staff Name</th>
                <th className="py-3 px-3">Total Granted</th>
                <th className="py-3 px-3">Monthly Recovery</th>
                <th className="py-3 px-3">Repaid Amount</th>
                <th className="py-3 px-3">Remaining Balance</th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-xs text-slate-400 font-mono">
                    Loading advance ledger...
                  </td>
                </tr>
              ) : advances.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-xs text-slate-400">
                    No active advances found. Click "Grant Advance" to issue an installment.
                  </td>
                </tr>
              ) : (
                advances.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 font-mono text-slate-300">{a.advance_date}</td>
                    <td className="py-3 px-3 font-mono text-amber-400 font-bold">{a.id}</td>
                    <td className="py-3 px-3 font-mono text-slate-400">{a.employee_code}</td>
                    <td className="py-3 px-3 font-bold text-white">{a.employee_name}</td>
                    <td className="py-3 px-3 font-mono text-white">₹{a.amount.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-3 font-mono text-slate-400">₹{a.monthly_deduction.toLocaleString('en-IN')}/mo</td>
                    <td className="py-3 px-3 font-mono text-emerald-400">₹{a.repaid_amount.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-3 font-mono text-rose-400 font-bold">
                      ₹{a.remaining_balance.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        a.status === 'ACTIVE'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grant Advance Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <h3 className="text-base font-bold text-white">Issue Salary Advance</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Staff Member *</label>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.employee_name} ({emp.employee_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Total Advance (₹) *</label>
                  <input
                    type="number"
                    required
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Monthly Deduction (₹)</label>
                  <input
                    type="number"
                    required
                    value={monthlyDeduction}
                    onChange={(e) => setMonthlyDeduction(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Reason for Advance</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold shadow"
                >
                  Issue Advance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
