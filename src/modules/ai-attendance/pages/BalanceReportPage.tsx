import React, { useState, useEffect } from 'react';
import { Scale, ArrowLeft, Search, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { paymentService } from '../services/paymentService';
import type { BalanceSummary } from '../types/payment.types';

interface Props {
  companyId: string;
}

export const BalanceReportPage: React.FC<Props> = ({ companyId }) => {
  const navigate = useNavigate();
  const [balances, setBalances] = useState<BalanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await paymentService.getBalanceSummary(companyId);
        setBalances(data);
      } catch (err) {
        console.error('Failed to load balance summary:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [companyId]);

  const filtered = balances.filter(
    (b) =>
      b.employee_name.toLowerCase().includes(search.toLowerCase()) ||
      b.employee_code.toLowerCase().includes(search.toLowerCase()) ||
      b.department.toLowerCase().includes(search.toLowerCase())
  );

  // Totals for sticky bottom bar matching Argus spec
  const totalBase = filtered.reduce((s, b) => s + b.base_salary, 0);
  const totalAdv = filtered.reduce((s, b) => s + b.current_advance_balance, 0);
  const totalPayable = filtered.reduce((s, b) => s + b.pending_salary_payable, 0);
  const totalNet = filtered.reduce((s, b) => s + b.net_balance, 0);

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
          <h2 className="text-xl font-black text-white">Workforce Balance Ledger Summary</h2>
          <p className="text-xs text-slate-400">
            Real-time balance computation factoring base salary, cumulative advances, and pending dues.
          </p>
        </div>

        <button
          onClick={() => {
            const csv = filtered.map(b => `${b.employee_code},${b.employee_name},${b.department},${b.base_salary},${b.current_advance_balance},${b.pending_salary_payable},${b.net_balance}`).join('\n');
            const blob = new Blob([`Code,Name,Department,Base Salary,Advance Balance,Payable,Net Balance\n${csv}`], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `workforce_balance_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Balance Sheet</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">#</th>
                <th className="py-3 px-3">Code</th>
                <th className="py-3 px-3">Staff Name</th>
                <th className="py-3 px-3">Department</th>
                <th className="py-3 px-3">Base Salary</th>
                <th className="py-3 px-3">Advance Balance</th>
                <th className="py-3 px-3">Salary Payable</th>
                <th className="py-3 px-3">Net Due Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-slate-400 font-mono">
                    Computing ledger balances...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-slate-400">
                    No balance entries found.
                  </td>
                </tr>
              ) : (
                filtered.map((b, idx) => (
                  <tr key={b.employee_id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="py-3 px-3 font-mono font-bold text-amber-400">{b.employee_code}</td>
                    <td className="py-3 px-3 font-bold text-white">{b.employee_name}</td>
                    <td className="py-3 px-3">{b.department}</td>
                    <td className="py-3 px-3 font-mono text-white">₹{b.base_salary.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-3 font-mono text-rose-400 font-bold">₹{b.current_advance_balance.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-3 font-mono text-amber-400">₹{b.pending_salary_payable.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                      ₹{b.net_balance.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Sticky Totals Bar matching Argus CNC spec */}
        <div className="bg-slate-950 p-4 border-t-2 border-slate-700 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
          <span className="font-bold text-white uppercase tracking-wider">Workforce Totals:</span>
          <div className="flex items-center gap-6">
            <div>
              <span className="text-slate-400 block text-[10px]">TOTAL BASE SALARY</span>
              <span className="text-white font-bold">₹{totalBase.toLocaleString('en-IN')}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">TOTAL ADVANCE BALANCE</span>
              <span className="text-rose-400 font-bold">₹{totalAdv.toLocaleString('en-IN')}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">TOTAL PAYABLE</span>
              <span className="text-amber-400 font-bold">₹{totalPayable.toLocaleString('en-IN')}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">TOTAL NET DUE</span>
              <span className="text-emerald-400 font-bold text-sm">₹{totalNet.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
