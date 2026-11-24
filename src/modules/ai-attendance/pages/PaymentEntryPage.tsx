import React, { useState, useEffect } from 'react';
import { Plus, CreditCard, ArrowRight, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { paymentService } from '../services/paymentService';
import { employeeService } from '../services/employeeService';
import type { PaymentRecord } from '../types/payment.types';
import type { AttendanceEmployee } from '../types/employee.types';

interface Props {
  companyId: string;
}

export const PaymentEntryPage: React.FC<Props> = ({ companyId }) => {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [employeeId, setEmployeeId] = useState('');
  const [amount, setAmount] = useState(5000);
  const [paymentType, setPaymentType] = useState<'SALARY' | 'ADVANCE' | 'INCENTIVE' | 'BONUS'>('SALARY');
  const [paymentMode, setPaymentMode] = useState<'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | 'UPI'>('BANK_TRANSFER');
  const [refNo, setRefNo] = useState('');
  const [notes, setNotes] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [pays, emps] = await Promise.all([
        paymentService.getPayments(companyId),
        employeeService.getEmployees(companyId),
      ]);
      setPayments(pays);
      setEmployees(emps);
      if (emps.length) setEmployeeId(emps[0].id);
    } catch (err) {
      console.error('Error loading payments:', err);
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
      await paymentService.createPayment(companyId, {
        employee_id: employeeId,
        employee_name: selEmp.employee_name,
        employee_code: selEmp.employee_code,
        amount: Number(amount),
        payment_type: paymentType,
        payment_mode: paymentMode,
        reference_no: refNo,
        notes,
      });
      setShowModal(false);
      loadData();
    } catch (err) {
      alert('Failed to record payment: ' + String(err));
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Direct Sub-Page Navigation matching Argus spec */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white">Payment Management Entry</h2>
          <p className="text-xs text-slate-400">
            Disburse employee compensation, bonuses, and salary credits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/attendance/advance-management')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <span>Advance Management</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => navigate('/attendance/balance-report')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <span>Balance Report</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Payment</span>
          </button>
        </div>
      </div>

      {/* Payment Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Txn ID</th>
                <th className="py-3 px-3">Staff Code</th>
                <th className="py-3 px-3">Staff Name</th>
                <th className="py-3 px-3">Payment Category</th>
                <th className="py-3 px-3">Payment Mode</th>
                <th className="py-3 px-3">Amount</th>
                <th className="py-3 px-3">Ref / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-slate-400 font-mono">
                    Loading payments...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-slate-400">
                    No payment entries logged yet. Click "Add Payment" to record a disbursement.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 font-mono text-slate-300">{p.payment_date}</td>
                    <td className="py-3 px-3 font-mono text-amber-400 font-bold">{p.id}</td>
                    <td className="py-3 px-3 font-mono text-slate-400">{p.employee_code}</td>
                    <td className="py-3 px-3 font-bold text-white">{p.employee_name}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        {p.payment_type}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400">{p.payment_mode}</td>
                    <td className="py-3 px-3 font-mono text-emerald-400 font-bold text-sm">
                      ₹{p.amount.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3 text-slate-400">{p.reference_no || p.notes || '--'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <h3 className="text-base font-bold text-white">Record Payment Entry</h3>
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
                  <label className="text-slate-400 block mb-1 font-semibold">Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Payment Category</label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  >
                    <option value="SALARY">Salary Disbursal</option>
                    <option value="ADVANCE">Advance Release</option>
                    <option value="INCENTIVE">Incentive / Performance</option>
                    <option value="BONUS">Bonus</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white"
                  >
                    <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                    <option value="UPI">UPI Payment</option>
                    <option value="CASH">Cash in Hand</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Txn Reference No</label>
                  <input
                    type="text"
                    value={refNo}
                    onChange={(e) => setRefNo(e.target.value)}
                    placeholder="e.g. UTR10293847"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono"
                  />
                </div>
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
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
