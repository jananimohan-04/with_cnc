import React, { useState, useEffect } from 'react';
import { BarChart3, Download, Search } from 'lucide-react';
import { employeeService } from '../services/employeeService';
import { payslipService } from '../services/payslipService';
import type { AttendanceEmployee } from '../types/employee.types';
import type { PayslipData } from '../types/payment.types';

interface Props {
  companyId: string;
}

export const SalaryReportPage: React.FC<Props> = ({ companyId }) => {
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [reports, setReports] = useState<PayslipData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('November');
  const [selectedYear, setSelectedYear] = useState(2026);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function loadSalarySheet() {
      try {
        setLoading(true);
        const emps = await employeeService.getEmployees(companyId);
        setEmployees(emps);

        const rows = await Promise.all(
          emps.map((e) => payslipService.generatePayslip(companyId, e.id, selectedMonth, selectedYear))
        );
        setReports(rows);
      } catch (err) {
        console.error('Failed to load salary reports:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSalarySheet();
  }, [companyId, selectedMonth, selectedYear]);

  const filtered = reports.filter(
    (r) =>
      r.employee_name.toLowerCase().includes(search.toLowerCase()) ||
      r.employee_code.toLowerCase().includes(search.toLowerCase()) ||
      r.department.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white">Monthly Salary Payroll Report</h2>
          <p className="text-xs text-slate-400">
            Comprehensive 14-column monthly payroll computation report with gross earnings, PF/ESI, and net disbursals.
          </p>
        </div>

        <button
          onClick={() => {
            const csv = filtered.map(r => `${r.employee_code},${r.employee_name},${r.department},${r.total_working_days},${r.present_days},${r.earnings.basic},${r.earnings.da},${r.earnings.hra},${r.earnings.gross_earnings},${r.deductions.pf},${r.deductions.esi},${r.deductions.total_deductions},${r.net_pay}`).join('\n');
            const blob = new Blob([`Code,Name,Department,Work Days,Present,Basic,DA,HRA,Gross,PF,ESI,Total Deductions,Net Pay\n${csv}`], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `salary_report_${selectedMonth}_${selectedYear}.csv`;
            a.click();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Payroll CSV</span>
        </button>
      </div>

      {/* 14-Column Monthly Salary Report Table matching Argus CNC spec */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Code</th>
                <th className="py-3 px-3">Staff Name</th>
                <th className="py-3 px-3">Dept</th>
                <th className="py-3 px-3">Work Days</th>
                <th className="py-3 px-3">Present</th>
                <th className="py-3 px-3">Basic</th>
                <th className="py-3 px-3">DA</th>
                <th className="py-3 px-3">HRA</th>
                <th className="py-3 px-3">Gross Earnings</th>
                <th className="py-3 px-3">PF</th>
                <th className="py-3 px-3">ESI</th>
                <th className="py-3 px-3">Deductions</th>
                <th className="py-3 px-3 font-bold text-emerald-400">Net Pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans font-mono">
              {loading ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-xs text-slate-400 font-mono">
                    Generating salary computation matrix...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-xs text-slate-400">
                    No payroll entries found for this pay period.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.employee_id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 font-bold text-amber-400">{r.employee_code}</td>
                    <td className="py-3 px-3 font-sans font-bold text-white">{r.employee_name}</td>
                    <td className="py-3 px-3 font-sans">{r.department}</td>
                    <td className="py-3 px-3 text-slate-400">{r.total_working_days}</td>
                    <td className="py-3 px-3 text-emerald-400 font-bold">{r.present_days}</td>
                    <td className="py-3 px-3">₹{r.earnings.basic.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-3">₹{r.earnings.da.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-3">₹{r.earnings.hra.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-3 font-bold text-white">₹{r.earnings.gross_earnings.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-3 text-slate-400">₹{r.deductions.pf.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-3 text-slate-400">₹{r.deductions.esi.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-3 text-rose-400">₹{r.deductions.total_deductions.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-3 font-bold text-emerald-400 text-sm">
                      ₹{r.net_pay.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
