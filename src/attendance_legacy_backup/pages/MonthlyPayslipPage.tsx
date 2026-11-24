import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  Printer,
  Download,
  RefreshCw,
  Calendar,
  User,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  AlertCircle,
  ScrollText,
  IndianRupee,
  ShieldCheck,
} from 'lucide-react';
import { attendanceApi, AttendanceEmployee } from '../api';
import { useAuth } from '@/contexts/AuthContext';

export function MonthlyPayslipPage() {
  const { company } = useAuth();
  const companyId = company?.id || '';
  const companyName = (company as any)?.company_name || (company as any)?.name || 'Argus Technologies';

  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedCycle, setSelectedCycle] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const [loading, setLoading] = useState(false);
  const [disbursing, setDisbursing] = useState(false);
  const [payslipData, setPayslipData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successToast, setSuccessToast] = useState('');
  const payslipRef = useRef<HTMLDivElement>(null);

  const fetchEmployees = async () => {
    try {
      const res = await attendanceApi.getEmployees(companyId);
      const emps = res.employees || [];
      setEmployees(emps);
      if (emps.length > 0 && !selectedEmployeeId) {
        setSelectedEmployeeId(emps[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load employees for payslip', err);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [companyId]);

  const handleGenerate = async (empId = selectedEmployeeId, cycle = selectedCycle) => {
    if (!empId) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await attendanceApi.getPayslip(empId, cycle, companyId);
      setPayslipData(res.data);
    } catch (err: any) {
      console.error('Failed to generate payslip', err);
      setErrorMsg(err.message || 'Failed to generate monthly payslip.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEmployeeId) {
      handleGenerate(selectedEmployeeId, selectedCycle);
    }
  }, [selectedEmployeeId, selectedCycle]);

  const handleDisburse = async () => {
    if (!payslipData || !selectedEmployeeId) return;
    const advDed = Number(payslipData.advance_repayment || 0);
    const confirmMsg =
      advDed > 0
        ? `Disburse monthly payslip for ${payslipData.employee_name}? This will mark salary as PAID and settle ₹${advDed.toLocaleString('en-IN')} against active salary advance.`
        : `Disburse monthly payslip for ${payslipData.employee_name}? This will mark salary as PAID.`;

    if (!window.confirm(confirmMsg)) return;

    setDisbursing(true);
    setErrorMsg('');
    try {
      await attendanceApi.disbursePayslip({
        employee_ids: [selectedEmployeeId],
        cycle: selectedCycle,
      });
      setSuccessToast(`Payslip disbursed successfully! ${advDed > 0 ? `₹${advDed.toLocaleString('en-IN')} advance deduction settled.` : ''}`);
      setTimeout(() => setSuccessToast(''), 6000);
      setPayslipData((prev: any) => ({ ...prev, is_disbursed: true }));
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to disburse payslip.');
    } finally {
      setDisbursing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <ScrollText className="w-7 h-7 text-indigo-600" />
            Monthly Salary Payslip
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Automated biometric payroll calculation with shift hours, overtime, and advance settlements
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {payslipData && (
            <>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Payslip</span>
              </button>

              <button
                type="button"
                onClick={handleDisburse}
                disabled={disbursing || payslipData.is_disbursed}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/25 transition-all disabled:opacity-50 cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>{payslipData.is_disbursed ? 'Disbursed (Paid)' : disbursing ? 'Disbursing...' : 'Disburse Salary'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {successToast && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fadeIn print:hidden">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2 print:hidden">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Selector Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Select Employee
            </label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name} ({emp.employee_code}) - {emp.department}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Payroll Month Cycle
            </label>
            <input
              type="month"
              value={selectedCycle}
              onChange={(e) => setSelectedCycle(e.target.value)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleGenerate()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Recalculate</span>
        </button>
      </div>

      {/* Printable Payslip Card */}
      {loading ? (
        <div className="p-16 text-center text-slate-400 font-mono text-xs">
          Computing biometric attendance ledger and calculating salary...
        </div>
      ) : !payslipData ? (
        <div className="p-16 text-center text-slate-400 italic text-xs">
          Select an employee and payroll cycle above to generate payslip.
        </div>
      ) : (
        <div
          ref={payslipRef}
          className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-sm max-w-4xl mx-auto space-y-8"
        >
          {/* Company & Payslip Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {companyName}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  CONFIDENTIAL
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Corporate Workplace Timekeeping &amp; Biometric Payroll Division
              </p>
            </div>

            <div className="text-left sm:text-right">
              <div className="text-xs font-bold uppercase tracking-widest text-indigo-600">
                SALARY PAYSLIP
              </div>
              <div className="text-sm font-black text-slate-800 mt-0.5">
                Cycle: {payslipData.cycle}
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                Ref: PS-{payslipData.employee_code}-{payslipData.cycle.replace('-', '')}
              </div>
            </div>
          </div>

          {/* Employee Meta Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-50/70 border border-slate-200 text-xs">
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-400">Employee Name</div>
              <div className="font-bold text-slate-900 mt-0.5">{payslipData.employee_name}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-400">Employee Code</div>
              <div className="font-bold text-slate-900 font-mono mt-0.5">{payslipData.employee_code}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-400">Department</div>
              <div className="font-bold text-slate-900 mt-0.5">{payslipData.department}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-400">Designation</div>
              <div className="font-bold text-slate-900 mt-0.5">{payslipData.designation}</div>
            </div>
          </div>

          {/* Attendance Stats Row */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
            <div className="p-3 rounded-2xl border border-slate-100 bg-white">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Working Days</div>
              <div className="text-base font-black text-slate-800 mt-0.5">{payslipData.working_days}</div>
            </div>
            <div className="p-3 rounded-2xl border border-emerald-100 bg-emerald-50/40">
              <div className="text-[10px] font-bold text-emerald-700 uppercase">Days Present</div>
              <div className="text-base font-black text-emerald-800 mt-0.5">{payslipData.present_days}</div>
            </div>
            <div className="p-3 rounded-2xl border border-amber-100 bg-amber-50/40">
              <div className="text-[10px] font-bold text-amber-700 uppercase">Late Arrivals</div>
              <div className="text-base font-black text-amber-800 mt-0.5">{payslipData.late_days}</div>
            </div>
            <div className="p-3 rounded-2xl border border-blue-100 bg-blue-50/40">
              <div className="text-[10px] font-bold text-blue-700 uppercase">Half Days</div>
              <div className="text-base font-black text-blue-800 mt-0.5">{payslipData.half_days}</div>
            </div>
            <div className="p-3 rounded-2xl border border-indigo-100 bg-indigo-50/40">
              <div className="text-[10px] font-bold text-indigo-700 uppercase">Total Hours</div>
              <div className="text-base font-black text-indigo-800 mt-0.5">{payslipData.total_hours}h</div>
            </div>
            <div className="p-3 rounded-2xl border border-violet-100 bg-violet-50/40">
              <div className="text-[10px] font-bold text-violet-700 uppercase">Overtime</div>
              <div className="text-base font-black text-violet-800 mt-0.5">{payslipData.overtime_hours}h</div>
            </div>
          </div>

          {/* Earnings vs Deductions Table */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Earnings */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 uppercase border-b border-slate-200">
                1. Earnings &amp; Allowances
              </div>
              <div className="p-4 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Basic Earned Salary</span>
                  <span className="font-mono font-bold text-slate-800">
                    ₹{payslipData.basic_earned.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Overtime Earnings ({payslipData.overtime_hours}h)</span>
                  <span className="font-mono font-bold text-slate-800">
                    ₹{payslipData.overtime_pay.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Daily Wage Benchmark</span>
                  <span className="font-mono text-slate-500">
                    ₹{payslipData.daily_wage.toLocaleString('en-IN')} / day
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-between font-bold text-slate-900">
                  <span>Gross Earnings</span>
                  <span className="font-mono text-emerald-700">
                    ₹{payslipData.gross_earnings.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Deductions */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 uppercase border-b border-slate-200">
                2. Deductions &amp; Recoveries
              </div>
              <div className="p-4 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Advance Money Repayment</span>
                  <span className="font-mono font-bold text-rose-700">
                    ₹{payslipData.advance_repayment.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Late Penalty &amp; Loss of Pay</span>
                  <span className="font-mono text-slate-400">₹0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Statutory Deductions (PT/TDS)</span>
                  <span className="font-mono text-slate-400">₹0</span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-between font-bold text-slate-900">
                  <span>Total Deductions</span>
                  <span className="font-mono text-rose-700">
                    ₹{payslipData.advance_repayment.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Net Payable Highlight Card */}
          <div className="p-5 rounded-2xl bg-indigo-50/60 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-indigo-900 uppercase tracking-wide">
                NET PAYABLE SALARY
              </div>
              <div className="text-[11px] text-indigo-600 mt-0.5">
                Calculated: Gross Earnings minus Advance Repayments
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-indigo-700 font-mono">
              ₹{payslipData.net_payable.toLocaleString('en-IN')}
            </div>
          </div>

          {/* Signatures Footer */}
          <div className="pt-8 flex justify-between items-end border-t border-slate-200 text-xs text-slate-400">
            <div>
              <p className="font-semibold text-slate-600">Employee Signature</p>
              <div className="w-36 border-b border-slate-300 mt-8" />
            </div>

            <div className="text-right">
              <p className="font-semibold text-slate-600">Authorized Signatory</p>
              <div className="w-36 border-b border-slate-300 mt-8 ml-auto" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
