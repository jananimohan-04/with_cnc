import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
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
  DollarSign, 
  ShieldCheck, 
  ScrollText,
  AlertCircle
} from 'lucide-react';

export const MonthlyPayslip = () => {
  const { organization } = useAuth();

  // State
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedCycle, setSelectedCycle] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const [loading, setLoading] = useState(false);
  const [disbursing, setDisbursing] = useState(false);
  const [payslipData, setPayslipData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successToast, setSuccessToast] = useState('');
  const [generated, setGenerated] = useState(false);

  // Disburse Monthly Payslip & Settle Active Advance
  const handleDisburse = async () => {
    if (!payslipData || !selectedEmployeeId) return;
    const advDed = Number(payslipData.advance_repayment || payslipData.advance_deduction || 0);
    const confirmMsg = advDed > 0
      ? `Disburse monthly payslip for ${payslipData.employee_name}? This will mark salary as PAID and settle ₹${advDed.toLocaleString('en-IN')} against active salary advance.`
      : `Disburse monthly payslip for ${payslipData.employee_name}? This will mark salary as PAID.`;

    if (!window.confirm(confirmMsg)) return;

    setDisbursing(true);
    setErrorMsg('');
    try {
      await api.post('/payroll/disburse', {
        employee_ids: [selectedEmployeeId],
        cycle: selectedCycle
      });
      setSuccessToast(`Payslip disbursed successfully! ${advDed > 0 ? `₹${advDed.toLocaleString('en-IN')} advance deduction settled.` : ''}`);
      setTimeout(() => setSuccessToast(''), 6000);
      await handleGenerate(selectedEmployeeId, selectedCycle);
    } catch (err) {
      console.error('Failed to disburse payslip', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to disburse payslip.');
    } finally {
      setDisbursing(false);
    }
  };

  // Fetch employees list
  const fetchEmployees = async () => {
    try {
      const res = await api.get('/employees');
      const emps = res.data || [];
      setEmployees(emps);
      if (emps.length > 0 && !selectedEmployeeId) {
        setSelectedEmployeeId(emps[0].id);
      }
    } catch (err) {
      console.error('Failed to load employees', err);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Generate Payslip Handler
  const handleGenerate = async (empId = selectedEmployeeId, cycle = selectedCycle) => {
    if (!empId) {
      setErrorMsg('Please select an employee.');
      return;
    }
    if (!cycle) {
      setErrorMsg('Please select month and year.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.get(`/payroll/compute/${empId}?cycle=${cycle}`);
      setPayslipData(res.data);
      setGenerated(true);
    } catch (err) {
      console.error('Failed to compute monthly payslip', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to generate monthly payslip for selected employee.');
      setPayslipData(null);
    } finally {
      setLoading(false);
    }
  };

  // Update button handler (Reference Image 1: Yellow Update button)
  const handleUpdate = () => {
    if (selectedEmployeeId && selectedCycle) {
      handleGenerate();
    } else {
      fetchEmployees();
    }
  };

  // Convert cycle to display format e.g. "September 2026"
  const cycleDisplay = useMemo(() => {
    if (!selectedCycle) return '';
    try {
      const [year, month] = selectedCycle.split('-');
      const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return selectedCycle;
    }
  }, [selectedCycle]);

  // Export Payslip data as CSV
  const handleExportCSV = () => {
    if (!payslipData) return;
    const p = payslipData;
    const lines = [
      `"MONTHLY PAYSLIP - ${organization?.name || 'ARGUS TECHNOLOGIES'}"`,
      `"Cycle","${p.cycle_display || cycleDisplay}"`,
      `"Employee Name","${p.employee_name}"`,
      `"Employee Code","${p.employee_code}"`,
      `"Department","${p.department}"`,
      `"Designation","${p.designation}"`,
      '',
      '"EARNINGS","AMOUNT (INR)","DEDUCTIONS","AMOUNT (INR)"',
      `"Basic / Earned Pay","${p.basic_salary}","Statutory Deductions (PF/ESI)","${p.paid_salary}"`,
      `"Allowances","${p.allowance}","Advance Repayment","${p.advance_repayment}"`,
      `"Incentive / Bonus","${p.incentive}","Other Deductions","${p.other_deductions}"`,
      `"Other Earnings","${p.others_earnings}","",""`,
      `"TOTAL GROSS EARNINGS","${p.total_earnings}","TOTAL DEDUCTIONS","${p.total_deductions}"`,
      '',
      `"NET PAYABLE SALARY","${p.net_pay}"`,
      `"Amount in Words","${p.net_pay_words}"`
    ];

    const csvContent = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Payslip_${p.employee_code}_${selectedCycle}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto w-full font-sans text-slate-800">
      
      {/* ------------------------------------------------------------- */}
      {/* TOP HEADER SECTION (MATCHING IMAGE 1) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#f0f3f8] px-6 py-3.5 rounded-t-lg border-b-2 border-slate-300 flex items-center justify-between shadow-sm print:hidden">
        <h1 className="text-lg md:text-xl font-black text-[#1e3a5f] tracking-wide uppercase">
          MONTHLY PAYSLIP
        </h1>

        {/* Yellow Update button (Matching Image 1) */}
        <button
          type="button"
          onClick={handleUpdate}
          disabled={loading}
          className="px-4 py-1.5 bg-[#f1c40f] hover:bg-[#e2b70b] active:bg-[#d4ab09] text-slate-900 text-xs font-bold rounded shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Update</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SELECTOR BAR (MATCHING IMAGE 1) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-center gap-6 text-sm text-slate-800 print:hidden">
        
        {/* Select Employee Name */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <label className="font-semibold text-slate-700 whitespace-nowrap text-xs sm:text-sm">
            Select Employee Name:
          </label>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs sm:text-sm font-medium focus:outline-none focus:border-blue-500 min-w-[200px]"
          >
            {employees.length === 0 ? (
              <option value="">Loading employees...</option>
            ) : (
              employees.map(emp => {
                const name = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || emp.name;
                return (
                  <option key={emp.id} value={emp.id}>
                    {name} ({emp.employee_code})
                  </option>
                );
              })
            )}
          </select>
        </div>

        {/* Month & Year Picker */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <label className="font-semibold text-slate-700 whitespace-nowrap text-xs sm:text-sm">
            Month & Year:
          </label>
          <div className="relative">
            <input
              type="month"
              value={selectedCycle}
              onChange={(e) => setSelectedCycle(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs sm:text-sm font-medium focus:outline-none focus:border-blue-500 cursor-pointer min-w-[170px]"
            />
          </div>
        </div>

        {/* GENERATE Blue Button (Matching Image 1) */}
        <div>
          <button
            type="button"
            onClick={() => handleGenerate()}
            disabled={loading}
            className="px-6 py-2 bg-[#0070ba] hover:bg-[#005da3] active:bg-[#004f8c] text-white text-xs sm:text-sm font-bold rounded shadow-sm transition-colors uppercase tracking-wider flex items-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <span>GENERATE</span>
            )}
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successToast && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold rounded-lg flex items-center gap-2 print:hidden animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Error Message Notification */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg flex items-center gap-2 print:hidden animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* ACTION CONTROLS FOR GENERATED PAYSLIP (PRINT, PDF, CSV, DISBURSE) */}
      {/* ------------------------------------------------------------- */}
      {generated && payslipData && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span className="text-xs font-bold text-slate-800">
              Payslip generated for <strong className="text-blue-700">{payslipData.employee_name}</strong> ({payslipData.employee_code}) • {payslipData.cycle_display || cycleDisplay}
            </span>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-1.5 bg-[#0070ba] hover:bg-[#005da3] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Download PDF</span>
            </button>

            {payslipData.payout_status === 'PAID' ? (
              <div className="px-3.5 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Disbursed</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDisburse}
                disabled={disbursing}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                title="Finalize payout and settle advance deduction"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{disbursing ? 'Disbursing...' : 'Disburse'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* A4 PHYSICAL CANVAS CONTAINER (EXACTLY 210mm WIDTH, MULTI-SHEET) */}
      {/* ------------------------------------------------------------- */}
      {generated && payslipData ? (
        <div className="flex flex-col items-center gap-8 py-2">
          
          {/* ========================================================= */}
          {/* SHEET 1: OFFICIAL MONTHLY PAY STATEMENT (A4 SIZE) */}
          {/* ========================================================= */}
          <div 
            className="a4-sheet bg-white border border-slate-300 shadow-2xl p-8 sm:p-12 w-full max-w-[210mm] min-h-[297mm] flex flex-col justify-between font-sans text-slate-900 text-xs box-border relative print:border-none print:shadow-none print:m-0 print:p-8"
            style={{ minHeight: '297mm' }}
          >
            <div>
              {/* Dynamic Organization Header from Settings */}
              <div className="text-center space-y-1.5 border-b-2 border-slate-800 pb-4">
                {organization?.logo_url && (
                  <div className="flex justify-center mb-1.5">
                    <img
                      src={organization.logo_url}
                      alt={organization?.name || 'Company Logo'}
                      className="h-12 max-w-[200px] object-contain"
                    />
                  </div>
                )}
                <h1 className="text-2xl font-black tracking-tight text-[#002b80] uppercase">
                  {organization?.name || 'ARGUS TECHNOLOGIES'}
                </h1>
                <p className="text-xs text-slate-600 max-w-xl mx-auto">
                  {organization?.address || 'Corporate Headquarters & Registered Office'}
                </p>
                {((organization?.phone) || (organization?.contact_email || organization?.email) || (organization?.website) || (organization?.gstin)) && (
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500 font-mono pt-1">
                    {(organization?.phone) && (
                      <span>Phone: <strong className="text-slate-800">{organization.phone}</strong></span>
                    )}
                    {(organization?.contact_email || organization?.email) && (
                      <span>Email: <strong className="text-slate-800">{organization.contact_email || organization.email}</strong></span>
                    )}
                    {organization?.website && (
                      <span>Web: <strong className="text-slate-800">{organization.website}</strong></span>
                    )}
                    {organization?.gstin && (
                      <span>GSTIN: <strong className="text-slate-800">{organization.gstin}</strong></span>
                    )}
                  </div>
                )}

                <div className="mt-2 py-1 bg-slate-100 rounded text-center">
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
                    PAYSLIP FOR THE MONTH OF {payslipData.cycle_display?.toUpperCase() || cycleDisplay.toUpperCase()}
                  </h2>
                </div>
              </div>

              {/* Employee & Bank Details Grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 py-3.5 border-b border-slate-300 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Employee Name:</span>
                    <span className="font-bold text-slate-900">{payslipData.employee_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Employee Code:</span>
                    <span className="font-mono font-bold text-blue-700">{payslipData.employee_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Department:</span>
                    <span className="font-semibold text-slate-800">{payslipData.department}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Designation:</span>
                    <span className="font-semibold text-slate-800">{payslipData.designation}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Bank Name:</span>
                    <span className="font-bold text-slate-900">{payslipData.banking?.bank_name || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Account Number:</span>
                    <span className="font-mono font-bold text-slate-900">{payslipData.banking?.account_number || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">IFSC Code:</span>
                    <span className="font-mono font-semibold text-slate-800">{payslipData.banking?.ifsc_code || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">UPI / Mobile:</span>
                    <span className="font-mono text-slate-800">{payslipData.banking?.upi_number || payslipData.phone || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Attendance & Working Days Summary Strip */}
              <div className="py-2.5 border-b border-slate-300">
                <div className="text-[10px] font-mono font-bold uppercase text-slate-500 tracking-wider mb-1.5">
                  Attendance & Shift Statistics
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center text-xs">
                  <div className="p-1.5 bg-slate-50 border border-slate-200 rounded">
                    <div className="text-[10px] text-slate-400">Total Days</div>
                    <div className="font-mono font-bold text-slate-900">{payslipData.total_days_of_month || 30}</div>
                  </div>
                  <div className="p-1.5 bg-slate-50 border border-slate-200 rounded">
                    <div className="text-[10px] text-slate-400">Working Days</div>
                    <div className="font-mono font-bold text-slate-900">{payslipData.total_working_days || 26}</div>
                  </div>
                  <div className="p-1.5 bg-emerald-50 border border-emerald-200 rounded">
                    <div className="text-[10px] text-emerald-700 font-semibold">Present</div>
                    <div className="font-mono font-bold text-emerald-800">{payslipData.days_present || 0}</div>
                  </div>
                  <div className="p-1.5 bg-purple-50 border border-purple-200 rounded">
                    <div className="text-[10px] text-purple-700 font-semibold">Half-Days</div>
                    <div className="font-mono font-bold text-purple-800">{payslipData.half_days || 0}</div>
                  </div>
                  <div className="p-1.5 bg-blue-50 border border-blue-200 rounded">
                    <div className="text-[10px] text-blue-700 font-semibold">Logged Hours</div>
                    <div className="font-mono font-bold text-blue-800">{payslipData.total_logged_hours || 0}h</div>
                  </div>
                  <div className="p-1.5 bg-amber-50 border border-amber-200 rounded">
                    <div className="text-[10px] text-amber-700 font-semibold">Overtime</div>
                    <div className="font-mono font-bold text-amber-800">{payslipData.overtime_hours || 0}h</div>
                  </div>
                  <div className="p-1.5 bg-rose-50 border border-rose-200 rounded">
                    <div className="text-[10px] text-rose-700 font-semibold">LOP Days</div>
                    <div className="font-mono font-bold text-rose-800">{payslipData.lop_days || 0}</div>
                  </div>
                </div>
              </div>

              {/* Earnings & Deductions Dual Statement Table */}
              <div className="py-3 border-b-2 border-slate-800">
                <table className="w-full text-left text-xs border border-slate-300">
                  <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <tr>
                      <th className="p-2.5 border-r border-slate-300 w-1/2 uppercase font-mono tracking-wider">
                        Earnings (Income)
                      </th>
                      <th className="p-2.5 w-1/2 uppercase font-mono tracking-wider">
                        Deductions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      {/* Earnings Column */}
                      <td className="p-2.5 border-r border-slate-300 align-top space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-700">Basic / Earned Salary:</span>
                          <span className="font-mono font-bold text-slate-900">
                            ₹{Number(payslipData.basic_salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-700">Special Allowances:</span>
                          <span className="font-mono font-semibold text-slate-800">
                            ₹{Number(payslipData.allowance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-700">Incentive / Bonus:</span>
                          <span className="font-mono font-semibold text-slate-800">
                            ₹{Number(payslipData.incentive || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-700">Other Earnings:</span>
                          <span className="font-mono font-semibold text-slate-800">
                            ₹{Number(payslipData.others_earnings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </td>

                      {/* Deductions Column */}
                      <td className="p-2.5 align-top space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-slate-700">Statutory Deductions (PF/ESI/PT):</span>
                          <span className="font-mono font-bold text-slate-900">
                            ₹{Number(payslipData.paid_salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-700">Advance Deduction:</span>
                          <span className="font-mono font-semibold text-slate-800">
                            ₹{Number(payslipData.advance_repayment || payslipData.advance_deduction || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-700">Other Deductions:</span>
                          <span className="font-mono font-semibold text-slate-800">
                            ₹{Number(payslipData.other_deductions || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Subtotal Row */}
                    <tr className="bg-slate-50 font-bold border-t border-slate-300">
                      <td className="p-2.5 border-r border-slate-300">
                        <div className="flex justify-between items-center text-slate-900">
                          <span>Total Gross Earnings:</span>
                          <span className="font-mono text-emerald-800 text-sm">
                            ₹{Number(payslipData.total_earnings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </td>
                      <td className="p-2.5">
                        <div className="flex justify-between items-center text-slate-900">
                          <span>Total Deductions:</span>
                          <span className="font-mono text-amber-800 text-sm">
                            ₹{Number(payslipData.total_deductions || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Net Payable Highlight Banner */}
              <div className="mt-3.5 p-3.5 bg-[#f0f8ff] border-2 border-[#0070ba] rounded-lg flex flex-col sm:flex-row items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-mono uppercase font-bold text-blue-800 tracking-wider">
                    Net Payable Salary
                  </div>
                  <div className="text-xs text-slate-700 italic mt-0.5">
                    ({payslipData.net_pay_words || 'Rupees Zero Only'})
                  </div>
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-[#002b80]">
                  ₹{Number(payslipData.net_pay || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Bottom Signatures & Footer (Affixed to bottom of Sheet 1) */}
            <div className="pt-8 border-t border-slate-300 mt-6">
              <div className="flex justify-between items-end pb-4 text-xs text-slate-600">
                <div className="space-y-1 text-center">
                  <div className="w-44 border-b border-slate-400 mb-1"></div>
                  <span className="font-bold text-slate-800">Employee Signature</span>
                </div>
                <div className="space-y-1 text-center">
                  <div className="w-44 border-b border-slate-400 mb-1"></div>
                  <span className="font-bold text-slate-800">Authorized Signatory / Seal</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 pt-2 border-t border-slate-100">
                <span>Argus AI Biometric & Payroll Suite • Confidential</span>
                <span>Page 1 of {((payslipData.daily_breakdown?.length > 0) || (payslipData.payment_entries?.length > 0)) ? '2' : '1'}</span>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* SHEET 2: ITEMISED ANNEXURE & PAYMENT ENTRY LOG (A4 SIZE) */}
          {/* Automatically added if daily punches or payment entries exist */}
          {/* ========================================================= */}
          {((payslipData.daily_breakdown && payslipData.daily_breakdown.length > 0) || (payslipData.payment_entries && payslipData.payment_entries.length > 0)) && (
            <div 
              className="a4-sheet bg-white border border-slate-300 shadow-2xl p-8 sm:p-12 w-full max-w-[210mm] min-h-[297mm] flex flex-col justify-between font-sans text-slate-900 text-xs box-border relative print:border-none print:shadow-none print:m-0 print:p-8"
              style={{ minHeight: '297mm' }}
            >
              <div>
                {/* Annexure Top Banner */}
                <div className="border-b-2 border-slate-800 pb-3 flex justify-between items-center">
                  <div>
                    <h2 className="text-base font-black text-[#002b80] uppercase">
                      {organization?.name || 'ARGUS TECHNOLOGIES'} — ANNEXURE
                    </h2>
                    <p className="text-[11px] text-slate-600 font-mono">
                      Itemized Punch-to-Wage Breakdown & Payment Entries for {payslipData.cycle_display || cycleDisplay}
                    </p>
                  </div>
                  <div className="text-right font-mono text-[11px]">
                    <div className="font-bold text-slate-900">{payslipData.employee_name}</div>
                    <div className="text-blue-700">{payslipData.employee_code}</div>
                  </div>
                </div>

                {/* Section A: Manual Payment Entries (From Payment Entry Tab) */}
                {payslipData.payment_entries && payslipData.payment_entries.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                      <span>Manual Payment Entries Logged in Month</span>
                    </h3>
                    <table className="w-full text-left text-[11px] border border-slate-200">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase font-mono">
                        <tr>
                          <th className="p-2 border-b">Date</th>
                          <th className="p-2 border-b">Reason</th>
                          <th className="p-2 border-b">Payment Type</th>
                          <th className="p-2 border-b">Bank / Reference</th>
                          <th className="p-2 border-b text-right">Amount (INR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {payslipData.payment_entries.map((pe, idx) => {
                          const isDed = pe.reason === 'Advance Repayment' || pe.reason === 'Other Deductions';
                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-2 font-mono">{pe.date || '—'}</td>
                              <td className="p-2 font-semibold">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                  isDed ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
                                }`}>
                                  {pe.reason}
                                </span>
                              </td>
                              <td className="p-2">{pe.payment_type || 'UPI'}</td>
                              <td className="p-2 text-slate-600">{pe.bank || '—'}</td>
                              <td className={`p-2 text-right font-mono font-bold ${isDed ? 'text-amber-700' : 'text-emerald-700'}`}>
                                {isDed ? '-' : '+'} ₹{Number(pe.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Section B: Daily Attendance & Punches Breakdown */}
                {payslipData.daily_breakdown && payslipData.daily_breakdown.length > 0 && (
                  <div className="mt-5 space-y-2">
                    <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                      <span>Daily Attendance & Punch Hours Breakdown</span>
                    </h3>
                    <table className="w-full text-left text-[11px] border border-slate-200">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase font-mono">
                        <tr>
                          <th className="p-1.5 border-b">Date</th>
                          <th className="p-1.5 border-b">Day</th>
                          <th className="p-1.5 border-b">In</th>
                          <th className="p-1.5 border-b">Out</th>
                          <th className="p-1.5 border-b text-center">Hours</th>
                          <th className="p-1.5 border-b">Status</th>
                          <th className="p-1.5 border-b text-right">Day Earned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {payslipData.daily_breakdown.slice(0, 28).map((d, idx) => (
                          <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/60' : ''}>
                            <td className="p-1.5 font-mono">{d.date}</td>
                            <td className="p-1.5 text-slate-500">{d.day_name?.slice(0, 3)}</td>
                            <td className="p-1.5 font-mono text-blue-700">{d.check_in_time}</td>
                            <td className="p-1.5 font-mono">{d.check_out_time}</td>
                            <td className="p-1.5 text-center font-mono font-bold">{d.hours}h</td>
                            <td className="p-1.5 font-semibold">
                              <span className={`px-1 py-0.5 rounded text-[9px] ${
                                d.status === 'HALF_DAY' ? 'bg-purple-50 text-purple-700' : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                {d.status}
                              </span>
                            </td>
                            <td className="p-1.5 text-right font-mono font-bold text-slate-800">
                              ₹{Number(d.daily_earned || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Bottom Sign-off for Sheet 2 */}
              <div className="pt-6 border-t border-slate-200 mt-6 flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span>Argus AI Biometric & Geofence Intelligence • End of Statement</span>
                <span>Page 2 of 2</span>
              </div>
            </div>
          )}

        </div>
      ) : (
        /* Empty State before Generation */
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3 shadow-sm print:hidden">
          <ScrollText className="w-12 h-12 text-slate-300 stroke-1 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No Payslip Generated Yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Select an employee from the dropdown above, pick the month & year, and click the blue <strong className="text-blue-600">GENERATE</strong> button to view the official A4 payslip.
          </p>
        </div>
      )}

    </div>
  );
};
