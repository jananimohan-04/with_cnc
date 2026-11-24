import React, { useState, useEffect } from 'react';
import { Receipt, Printer, Download } from 'lucide-react';
import { payslipService } from '../services/payslipService';
import { employeeService } from '../services/employeeService';
import type { PayslipData } from '../types/payment.types';
import type { AttendanceEmployee } from '../types/employee.types';

interface Props {
  companyId: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const MonthlyPayslipPage: React.FC<Props> = ({ companyId }) => {
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('November');
  const [selectedYear, setSelectedYear] = useState(2026);
  const [payslip, setPayslip] = useState<PayslipData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadEmps() {
      const emps = await employeeService.getEmployees(companyId);
      setEmployees(emps);
      if (emps.length) setSelectedEmployeeId(emps[0].id);
    }
    loadEmps();
  }, [companyId]);

  const handleGenerate = async () => {
    if (!selectedEmployeeId) return;
    try {
      setLoading(true);
      const data = await payslipService.generatePayslip(companyId, selectedEmployeeId, selectedMonth, selectedYear);
      setPayslip(data);
    } catch (err) {
      alert('Failed to generate payslip: ' + String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEmployeeId) {
      handleGenerate();
    }
  }, [selectedEmployeeId, selectedMonth, selectedYear]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-black text-white">Monthly Payslip Generation</h2>
          <p className="text-xs text-slate-400">
            Generate and export official ARGUS CNC™ 4-column itemized salary payslips with Indian words conversion.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            disabled={!payslip}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 disabled:opacity-50 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Payslip</span>
          </button>
        </div>
      </div>

      {/* Selector Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3 print:hidden">
        <div>
          <label className="text-[10px] text-slate-400 block mb-1 uppercase font-bold">Select Staff</label>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white"
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.employee_name} ({e.employee_code}) - {e.department}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 block mb-1 uppercase font-bold">Month</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white"
          >
            {MONTHS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-slate-400 block mb-1 uppercase font-bold">Year</label>
          <input
            type="number"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="w-24 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white font-mono"
          />
        </div>
      </div>

      {/* Official Argus CNC Payslip Document Card */}
      {payslip && (
        <div className="bg-white text-slate-900 rounded-2xl p-8 max-w-4xl mx-auto shadow-xl border border-slate-200 font-sans print:shadow-none print:border-none print:p-0">
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-slate-950">ARGUS CNC™</span>
                <span className="text-xs bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded">
                  OFFICIAL PAYSLIP
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">Precision Industrial Engineering & Advanced Manufacturing</p>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-slate-900 block">
                Pay Period: {payslip.month} {payslip.year}
              </span>
              <span className="text-xs font-mono text-slate-500">Ref: {payslip.id}</span>
            </div>
          </div>

          {/* Employee Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Employee Name</span>
              <span className="font-bold text-slate-900">{payslip.employee_name}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Employee Code</span>
              <span className="font-mono font-bold text-slate-900">{payslip.employee_code}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Department</span>
              <span className="font-semibold text-slate-800">{payslip.department}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Designation</span>
              <span className="font-semibold text-slate-800">{payslip.designation}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Total Working Days</span>
              <span className="font-mono font-semibold">{payslip.total_working_days}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Present Days</span>
              <span className="font-mono font-bold text-emerald-700">{payslip.present_days}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Half Days</span>
              <span className="font-mono font-semibold">{payslip.half_days}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Absent / Leaves</span>
              <span className="font-mono font-bold text-rose-700">{payslip.absent_days + payslip.leave_days}</span>
            </div>
          </div>

          {/* 4-Column Itemized Earnings vs Deductions Table matching Argus CNC spec */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 py-5 border-b-2 border-slate-900 text-xs">
            {/* Earnings Column */}
            <div>
              <h4 className="font-bold uppercase tracking-wider text-slate-900 text-[11px] pb-2 border-b border-slate-200 mb-2">
                Earnings Breakdown
              </h4>
              <div className="space-y-1.5 font-mono">
                <div className="flex justify-between py-1">
                  <span className="text-slate-700">Basic Pay</span>
                  <span className="font-semibold">₹{payslip.earnings.basic.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-700">Dearness Allowance (DA)</span>
                  <span className="font-semibold">₹{payslip.earnings.da.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-700">House Rent Allowance (HRA)</span>
                  <span className="font-semibold">₹{payslip.earnings.hra.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-700">Conveyance Allowance</span>
                  <span className="font-semibold">₹{payslip.earnings.conveyance.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-700">Special Allowance</span>
                  <span className="font-semibold">₹{payslip.earnings.special_allowance.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between py-2 border-t border-slate-200 font-bold text-slate-950">
                  <span>Gross Earnings (A)</span>
                  <span>₹{payslip.earnings.gross_earnings.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Deductions Column */}
            <div>
              <h4 className="font-bold uppercase tracking-wider text-slate-900 text-[11px] pb-2 border-b border-slate-200 mb-2">
                Statutory & Loan Deductions
              </h4>
              <div className="space-y-1.5 font-mono">
                <div className="flex justify-between py-1">
                  <span className="text-slate-700">Provident Fund (PF @ 12%)</span>
                  <span className="font-semibold">₹{payslip.deductions.pf.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-700">Employee State Insurance (ESI)</span>
                  <span className="font-semibold">₹{payslip.deductions.esi.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-700">Professional Tax (PT)</span>
                  <span className="font-semibold">₹{payslip.deductions.professional_tax.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-700">Salary Advance Recovery</span>
                  <span className="font-semibold">₹{payslip.deductions.advance_deduction.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between py-2 border-t border-slate-200 font-bold text-rose-700">
                  <span>Total Deductions (B)</span>
                  <span>₹{payslip.deductions.total_deductions.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Net Salary Summary */}
          <div className="py-5 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 -mx-8 px-8 border-b border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Net Payable Amount</span>
              <span className="text-2xl font-black text-slate-950 font-mono">
                ₹{payslip.net_pay.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-500 uppercase font-bold block">Amount In Words</span>
              <span className="text-xs font-bold text-slate-800 italic">{payslip.net_pay_in_words}</span>
            </div>
          </div>

          {/* Footer Note */}
          <div className="pt-6 flex items-center justify-between text-[10px] text-slate-500">
            <span>This is a computer-generated document authorized by ARGUS CNC™ Workforce Portal.</span>
            <span>Signatory: Authorized Officer</span>
          </div>
        </div>
      )}
    </div>
  );
};
