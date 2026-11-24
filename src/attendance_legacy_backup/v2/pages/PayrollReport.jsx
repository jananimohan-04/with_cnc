import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  CreditCard, 
  Download, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Award, 
  Banknote, 
  ShieldCheck, 
  Printer, 
  FileSpreadsheet, 
  ArrowUpRight, 
  TrendingUp, 
  AlertCircle,
  UserCheck,
  UserPlus,
  Inbox,
  Search,
  Save,
  RotateCcw,
  Edit3,
  Send,
  FileText,
  X,
  Plus,
  Trash2,
  Users,
  RefreshCw,
  FileDown,
  ArrowLeft,
  ChevronDown,
  Building2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { downloadFromServer } from '../utils/api';

// Number to Indian English words converter (e.g. 94 -> 'Ninety Four Rupees Only')
function numberToIndianWords(num) {
  if (num == null || isNaN(num)) return "Zero Rupees Only";
  const val = Math.round(Number(num) * 100) / 100;
  if (val < 0) return `Minus ${numberToIndianWords(-val)}`;
  let rupees = Math.floor(val);
  const paise = Math.round((val - rupees) * 100);

  if (rupees === 0 && paise === 0) return "Zero Rupees Only";

  const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
                 "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function convertTwoDigits(n) {
    if (n < 20) return units[n];
    const rem = n % 10;
    return tens[Math.floor(n / 10)] + (rem > 0 ? ` ${units[rem]}` : "");
  }

  function convertThreeDigits(n) {
    let res = "";
    const h = Math.floor(n / 100);
    const rem = n % 100;
    if (h > 0) {
      res += `${units[h]} Hundred`;
      if (rem > 0) res += " and ";
    }
    if (rem > 0) {
      res += convertTwoDigits(rem);
    }
    return res;
  }

  const parts = [];
  const crores = Math.floor(rupees / 10000000);
  rupees %= 10000000;
  if (crores > 0) parts.push(`${convertThreeDigits(crores)} Crore`);

  const lakhs = Math.floor(rupees / 100000);
  rupees %= 100000;
  if (lakhs > 0) parts.push(`${convertTwoDigits(lakhs)} Lakh`);

  const thousands = Math.floor(rupees / 1000);
  rupees %= 1000;
  if (thousands > 0) parts.push(`${convertTwoDigits(thousands)} Thousand`);

  if (rupees > 0) parts.push(convertThreeDigits(rupees));

  const rupeesStr = parts.join(" ").trim() || "Zero";
  let result = `${rupeesStr} Rupees`;
  if (paise > 0) {
    result += ` and ${convertTwoDigits(paise)} Paise`;
  }
  return `${result} Only`;
}

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' }
];

const YEARS = (() => {
  const currentYear = new Date().getFullYear();
  const list = [];
  for (let y = currentYear - 6; y <= currentYear + 6; y++) {
    list.push(y);
  }
  return list;
})();

const formatCycleDisplay = (cycle) => {
  if (!cycle) return '';
  try {
    const parts = cycle.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!y || !m) return cycle;
    const d = new Date(y, m - 1, 1);
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  } catch {
    return cycle;
  }
};

export const PayrollReport = () => {
  const { user, organization } = useAuth();
  const isEmployee = user?.role === 'employee' || user?.role === 'staff';

  const [selectedCycle, setSelectedCycle] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [selectedYear, selectedMonth] = useMemo(() => {
    const parts = (selectedCycle || '').split('-');
    const now = new Date();
    return [
      parts[0] || String(now.getFullYear()),
      parts[1] || String(now.getMonth() + 1).padStart(2, '0')
    ];
  }, [selectedCycle]);

  // View Mode: 'individual' (Employee Ledger) or 'register' (Master Register)
  const [activeTab, setActiveTab] = useState('individual');

  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [financialEntries, setFinancialEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [payoutApproved, setPayoutApproved] = useState(false);

  // Master Register State
  const [payrollRegister, setPayrollRegister] = useState([]);
  const [loadingRegister, setLoadingRegister] = useState(false);
  const [registerSearch, setRegisterSearch] = useState('');
  const [batchDisbursing, setBatchDisbursing] = useState(false);
  const [batchDisburseSuccess, setBatchDisburseSuccess] = useState('');

  // Payout history & slip modal
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [slipModalOpen, setSlipModalOpen] = useState(false);

  // Employee search query
  const [searchQuery, setSearchQuery] = useState('');

  // Compensation structure state
  const [baseSalary, setBaseSalary] = useState(40000);
  const [hourlyRate, setHourlyRate] = useState(250);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [performanceBonus, setPerformanceBonus] = useState(0);
  const [advanceDeduction, setAdvanceDeduction] = useState(0);
  const [statutoryDeductions, setStatutoryDeductions] = useState(3000);

  // Manual Adjustments Form State
  const [newFinType, setNewFinType] = useState('BONUS');
  const [newFinAmount, setNewFinAmount] = useState('');
  const [newFinReason, setNewFinReason] = useState('');
  const [addingFinEntry, setAddingFinEntry] = useState(false);

  const [savingPayroll, setSavingPayroll] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  const [disbursing, setDisbursing] = useState(false);
  const [payoutSuccess, setPayoutSuccess] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  // When cycle changes, reload attendance, financial entries, and register
  useEffect(() => {
    if (selectedEmployeeId) {
      fetchEmployeeAttendance(selectedEmployeeId, selectedCycle);
      fetchFinancialEntries(selectedEmployeeId, selectedCycle);
    }
    if (activeTab === 'register' && !isEmployee) {
      fetchPayrollRegister(selectedCycle);
    }
  }, [selectedCycle]);

  // When activeTab changes to register, fetch master register
  useEffect(() => {
    if (activeTab === 'register' && !isEmployee) {
      fetchPayrollRegister(selectedCycle);
    }
  }, [activeTab]);

  const fetchPayrollRegister = async (cycle) => {
    setLoadingRegister(true);
    try {
      const res = await api.get(`/payroll/register?cycle=${cycle}`);
      setPayrollRegister(res.data || []);
    } catch (err) {
      console.error('Failed to load payroll register', err);
      setPayrollRegister([]);
    } finally {
      setLoadingRegister(false);
    }
  };

  const fetchFinancialEntries = async (empId, cycle) => {
    try {
      const res = await api.get(`/financial-entries?employee_id=${empId}&cycle=${cycle}`);
      setFinancialEntries(res.data || []);
    } catch (err) {
      setFinancialEntries([]);
    }
  };

  const fetchPayoutHistory = async (empId) => {
    try {
      const url = isEmployee ? '/salary-payouts/history' : `/salary-payouts/history?employee_id=${empId || ''}`;
      const res = await api.get(url);
      setPayoutHistory(res.data || []);
    } catch (e) {
      setPayoutHistory([]);
    }
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      if (isEmployee) {
        // Fetch caller's own employee profile directly
        const [myEmpRes, advRes] = await Promise.all([
          api.get('/employees/me').catch(async () => {
            const fallback = await api.get('/employees/').catch(() => ({ data: [] }));
            return { data: Array.isArray(fallback.data) ? fallback.data[0] : fallback.data };
          }),
          api.get('/advances').catch(() => ({ data: [] }))
        ]);

        let myEmp = myEmpRes.data;
        if (!myEmp && user) {
          const nameParts = (user.name || 'Employee').split(' ');
          myEmp = {
            id: user.employee_id || user.id || 'EMP-ME',
            first_name: nameParts[0] || 'Employee',
            last_name: nameParts.slice(1).join(' ') || '',
            employee_code: user.employee_code || 'EMP',
            email: user.email,
            department: user.department || 'Operations',
            base_salary: 40000,
            hourly_rate: 250,
            statutory_deductions: 3000
          };
        }

        if (myEmp) {
          setEmployees([myEmp]);
          setSelectedEmployeeId(myEmp.id);
          fetchEmployeeAttendance(myEmp.id, selectedCycle);
          fetchFinancialEntries(myEmp.id, selectedCycle);
          fetchPayoutHistory(myEmp.id);
        }
        setAdvances(advRes.data || []);
      } else {
        const [empRes, advRes] = await Promise.all([
          api.get('/employees/').catch(() => ({ data: [] })),
          api.get('/advances').catch(() => ({ data: [] }))
        ]);

        const empList = empRes.data || [];
        setEmployees(empList);
        setAdvances(advRes.data || []);

        if (empList.length > 0) {
          const initialEmp = empList[0];
          setSelectedEmployeeId(initialEmp.id);
          fetchEmployeeAttendance(initialEmp.id, selectedCycle);
          fetchFinancialEntries(initialEmp.id, selectedCycle);
          fetchPayoutHistory(initialEmp.id);
        }
      }
    } catch (err) {
      console.error('Failed to load payroll report data', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeeAttendance = async (empId, cycle) => {
    try {
      const parts = (cycle || '2026-09').split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const lastDay = new Date(y, m, 0).getDate();
      const startDate = `${cycle}-01`;
      const endDate = `${cycle}-${String(lastDay).padStart(2, '0')}`;

      const res = await api.get(`/attendance/history?employee_id=${empId}&start_date=${startDate}&end_date=${endDate}`).catch(async () => {
        const fallback = await api.get(`/attendance/history?employee_id=${empId}`).catch(async () => {
          const todayRes = await api.get('/attendance/today');
          const list = (todayRes.data?.records || []).filter(r => r.employee_id === empId);
          return { data: list };
        });
        return fallback;
      });
      setAttendanceRecords(res.data || []);
    } catch (err) {
      setAttendanceRecords([]);
    }
  };

  const handleEmployeeSelect = (empId) => {
    setSelectedEmployeeId(empId);
    fetchEmployeeAttendance(empId, selectedCycle);
    fetchFinancialEntries(empId, selectedCycle);
    fetchPayoutHistory(empId);
  };

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId) || employees[0] || (isEmployee && user ? {
    id: user.employee_id || user.id,
    first_name: (user.name || 'Employee').split(' ')[0],
    last_name: (user.name || '').split(' ').slice(1).join(' '),
    employee_code: user.employee_code || 'EMP',
    email: user.email,
    department: user.department || 'Operations',
    base_salary: 40000,
    hourly_rate: 250,
    statutory_deductions: 3000
  } : null);

  // Helper to accurately extract worked hours from punch records
  const extractHours = useCallback((r) => {
    if (r.total_hours != null && Number(r.total_hours) > 0) return Number(r.total_hours);
    if (r.punches && r.punches.length >= 2) {
      let secs = 0;
      let lastIn = null;
      for (const p of r.punches) {
        const action = (p.action || p.punch_type || p.type || '').toUpperCase();
        let ts = p.timestamp || p.time;
        if (ts && typeof ts === 'string' && ts.length <= 8 && ts.includes(':')) {
          ts = `${r.date || '2026-09-01'}T${ts}`;
        }
        const dt = ts ? new Date(ts) : null;
        if (dt && !isNaN(dt.getTime())) {
          if (action === 'CHECK_IN' || action === 'IN' || action === 'CHECKIN') {
            lastIn = dt;
          } else if ((action === 'CHECK_OUT' || action === 'OUT' || action === 'CHECKOUT') && lastIn) {
            const diff = (dt - lastIn) / 1000;
            if (diff > 0) secs += diff;
            lastIn = null;
          }
        }
      }
      if (secs > 0) return Math.round((secs / 3600) * 100) / 100;
    }
    if (r.check_in && r.check_out) {
      const diff = (new Date(r.check_out) - new Date(r.check_in)) / 1000 / 3600;
      if (diff > 0) return Math.round(diff * 100) / 100;
    }
    return 0;
  }, []);

  // Synchronize compensation fields whenever selected employee, attendance, advances, or cycle change
  useEffect(() => {
    if (!selectedEmployee) return;

    const hRate = selectedEmployee.hourly_rate != null ? Number(selectedEmployee.hourly_rate) : 250;
    const statDed = selectedEmployee.statutory_deductions != null ? Number(selectedEmployee.statutory_deductions) : 3000;

    const presentDaysCount = attendanceRecords.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length;
    const halfDaysCount = attendanceRecords.filter(r => r.status === 'HALF_DAY').length;
    const effectivePresentDays = presentDaysCount + (0.5 * halfDaysCount);
    const totalHours = attendanceRecords.reduce((acc, curr) => acc + extractHours(curr), 0);
    const autoOT = Math.max(0, totalHours > 0 ? Math.round((totalHours - (effectivePresentDays * 8)) * 10) / 10 : 0);
    const autoBonus = effectivePresentDays >= 20 ? 2500 : 0;

    const empAdvances = advances.filter(a => a.employee_id === selectedEmployee.id);
    const autoAdvance = empAdvances.reduce((acc, curr) => acc + (Number(curr.next_deduction || curr.nextDeduction) || 0), 0);

    // Automatic calculation: punch hours * hourly rate
    const autoCalculatedBase = Math.round(totalHours * hRate);

    setBaseSalary(autoCalculatedBase);
    setHourlyRate(hRate);
    setStatutoryDeductions(statDed);
    setOvertimeHours(autoOT);
    setPerformanceBonus(autoBonus);
    setAdvanceDeduction(autoAdvance);
    setPayoutApproved(false);
    setSaveSuccess('');
    setSaveError('');
  }, [selectedEmployeeId, attendanceRecords, advances, selectedCycle, extractHours]);

  // Handle hourly rate adjustment and auto-recalculate base salary
  const handleHourlyRateChange = (newRateVal) => {
    const val = Number(newRateVal) || 0;
    setHourlyRate(newRateVal);
    const totalHours = attendanceRecords.reduce((acc, curr) => acc + extractHours(curr), 0);
    setBaseSalary(Math.round(totalHours * val));
  };

  // Filtered employees based on search input
  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;
    const term = searchQuery.toLowerCase();
    return employees.filter(e => 
      `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase().includes(term) ||
      (e.employee_code || '').toLowerCase().includes(term) ||
      (e.department || '').toLowerCase().includes(term) ||
      (e.email || '').toLowerCase().includes(term)
    );
  }, [employees, searchQuery]);

  // Reset editable inputs back to computed defaults
  const handleResetDefaults = () => {
    if (!selectedEmployee) return;
    const hRate = selectedEmployee.hourly_rate != null ? Number(selectedEmployee.hourly_rate) : 250;
    const statDed = selectedEmployee.statutory_deductions != null ? Number(selectedEmployee.statutory_deductions) : 3000;

    const presentDaysCount = attendanceRecords.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length;
    const halfDaysCount = attendanceRecords.filter(r => r.status === 'HALF_DAY').length;
    const effectivePresentDays = presentDaysCount + (0.5 * halfDaysCount);
    const totalHours = attendanceRecords.reduce((acc, curr) => acc + extractHours(curr), 0);
    const autoOT = Math.max(0, totalHours > 0 ? Math.round((totalHours - (effectivePresentDays * 8)) * 10) / 10 : 0);
    const autoBonus = effectivePresentDays >= 20 ? 2500 : 0;

    const empAdvances = advances.filter(a => a.employee_id === selectedEmployee.id);
    const autoAdvance = empAdvances.reduce((acc, curr) => acc + (Number(curr.next_deduction || curr.nextDeduction) || 0), 0);

    const autoCalculatedBase = Math.round(totalHours * hRate);

    setBaseSalary(autoCalculatedBase);
    setHourlyRate(hRate);
    setStatutoryDeductions(statDed);
    setOvertimeHours(autoOT);
    setPerformanceBonus(autoBonus);
    setAdvanceDeduction(autoAdvance);
  };

  // Save current salary structure into database for selected employee
  const handleSavePayrollStructure = async () => {
    if (!selectedEmployee) return;
    setSavingPayroll(true);
    setSaveSuccess('');
    setSaveError('');
    try {
      const payload = {
        base_salary: Number(baseSalary) || 0,
        hourly_rate: Number(hourlyRate) || 0,
        daily_wage_rate: Math.round((Number(hourlyRate) || 0) * 8),
        half_day_salary: Math.round((Number(hourlyRate) || 0) * 4),
        statutory_deductions: Number(statutoryDeductions) || 0
      };
      await api.put(`/employees/${selectedEmployee.id}`, payload);

      setEmployees(prev => prev.map(e => e.id === selectedEmployee.id ? { ...e, ...payload } : e));
      setSaveSuccess(`Payroll compensation settings for ${selectedEmployee.first_name} ${selectedEmployee.last_name} saved to database.`);
      setTimeout(() => setSaveSuccess(''), 4000);
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Failed to persist payroll settings to database.');
    } finally {
      setSavingPayroll(false);
    }
  };

  // Add Manual Financial Entry (Bonus, Deduction, Reimbursement)
  const handleAddFinancialEntry = async (e) => {
    e.preventDefault();
    if (!newFinAmount || Number(newFinAmount) <= 0) {
      alert("Please enter a valid amount greater than 0.");
      return;
    }
    if (!selectedEmployee) return;

    setAddingFinEntry(true);
    try {
      const payload = {
        employee_id: selectedEmployee.id,
        type: newFinType,
        amount: Number(newFinAmount),
        cycle: selectedCycle,
        reason: newFinReason.trim()
      };
      await api.post('/financial-entries', payload);
      setNewFinAmount('');
      setNewFinReason('');
      fetchFinancialEntries(selectedEmployee.id, selectedCycle);
      setSaveSuccess(`Added ${newFinType} adjustment of ₹${Number(newFinAmount).toLocaleString('en-IN')}.`);
      setTimeout(() => setSaveSuccess(''), 4000);
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to add manual adjustment.");
    } finally {
      setAddingFinEntry(false);
    }
  };

  const handleDeleteFinancialEntry = async (entryId) => {
    if (!window.confirm("Remove this financial adjustment?")) return;
    try {
      await api.delete(`/financial-entries/${entryId}`);
      if (selectedEmployee) {
        fetchFinancialEntries(selectedEmployee.id, selectedCycle);
      }
    } catch (err) {
      alert("Failed to delete adjustment entry.");
    }
  };

  // Attendance metrics
  const presentDays = attendanceRecords.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length;
  const halfDaysCount = attendanceRecords.filter(r => r.status === 'HALF_DAY').length;
  const effectivePresentDays = presentDays + (0.5 * halfDaysCount);

  // Manual day salary records vs hourly records
  const manualSalaryRecords = attendanceRecords.filter(r => r.mode === 'Salary' || (r.manual_salary != null && Number(r.manual_salary) > 0));
  const hourlyRecords = attendanceRecords.filter(r => !manualSalaryRecords.includes(r));
  const standardPresentDays = hourlyRecords.filter(r => r.status === 'PRESENT' || r.status === 'LATE').length;
  const standardHalfDaysCount = hourlyRecords.filter(r => r.status === 'HALF_DAY').length;
  const hourlyLoggedHours = Math.round(hourlyRecords.reduce((acc, curr) => acc + extractHours(curr), 0) * 10) / 10;
  const directManualSalaries = Math.round(manualSalaryRecords.reduce((acc, curr) => acc + (Number(curr.manual_salary) || 0), 0));
  const totalLoggedHours = Math.round(attendanceRecords.reduce((acc, curr) => acc + extractHours(curr), 0) * 10) / 10;

  const paidLeavesCount = attendanceRecords.filter(r => r.status === 'LEAVE').length;
  const workingDaysCount = presentDays + halfDaysCount;
  const leaveDaysCount = Math.max(0, 26 - workingDaysCount);

  // Manual financial entry totals
  const manualBonuses = financialEntries.filter(e => e.type === 'BONUS').reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const manualReimbursements = financialEntries.filter(e => e.type === 'REIMBURSEMENT').reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const manualDeductions = financialEntries.filter(e => e.type === 'DEDUCTION').reduce((acc, c) => acc + (Number(c.amount) || 0), 0);

  // Employment Type & Multi-Model Basis
  const empType = selectedEmployee?.employment_type || 'FULL_TIME';

  // Dynamic calculations based on state variables
  const numBaseSalary = Number(baseSalary) || 0;
  const numHourlyRate = Number(hourlyRate) || 0;
  const numOvertimeHours = Number(overtimeHours) || 0;
  const numPerformanceBonus = Number(performanceBonus) || 0;
  const numAdvanceDeduction = Number(advanceDeduction) || 0;
  const numStatutoryDeductions = Number(statutoryDeductions) || 0;

  // Multi-Model Calculation Logic
  let earnedBasePay = numBaseSalary;
  let calculationBasis = '';
  let effectiveHourlyRate = numHourlyRate;
  let effectiveDailyRate = selectedEmployee?.daily_wage_rate || Math.round(effectiveHourlyRate * 8);
  let effectiveHalfDaySalary = selectedEmployee?.half_day_salary || Math.round(effectiveDailyRate / 2);
  let absentDays = 0;
  let lossOfPay = 0;

  if (empType === 'PART_TIME') {
    effectiveHourlyRate = numHourlyRate || (numBaseSalary > 0 ? Math.round(numBaseSalary / 160) : 250);
    earnedBasePay = Math.round(hourlyLoggedHours * effectiveHourlyRate) + directManualSalaries;
    calculationBasis = directManualSalaries > 0 
      ? `${hourlyLoggedHours.toFixed(1)} hrs logged × ₹${effectiveHourlyRate}/hr + ₹${directManualSalaries.toLocaleString('en-IN')} manual salary`
      : `${totalLoggedHours.toFixed(1)} hrs logged × ₹${effectiveHourlyRate}/hr (Hourly Part-Time Basis)`;
  } else if (empType === 'DAILY_WAGE') {
    effectiveDailyRate = selectedEmployee?.daily_wage_rate || (numBaseSalary > 0 ? Math.round(numBaseSalary / 26) : 650);
    effectiveHalfDaySalary = selectedEmployee?.half_day_salary || Math.round(effectiveDailyRate / 2);
    earnedBasePay = Math.round((standardPresentDays * effectiveDailyRate) + (standardHalfDaysCount * effectiveHalfDaySalary)) + directManualSalaries;
    calculationBasis = standardHalfDaysCount > 0
      ? `${standardPresentDays} Full Days (@₹${effectiveDailyRate}) + ${standardHalfDaysCount} Half-Days (@₹${effectiveHalfDaySalary})` + (directManualSalaries > 0 ? ` + ₹${directManualSalaries.toLocaleString('en-IN')} manual salary` : '')
      : `${standardPresentDays} Days Present × ₹${effectiveDailyRate}/day (Daily Wage Basis)` + (directManualSalaries > 0 ? ` + ₹${directManualSalaries.toLocaleString('en-IN')} manual salary` : '');
  } else if (empType === 'FIELD_WORKER') {
    if (totalLoggedHours > 0 || directManualSalaries > 0) {
      earnedBasePay = Math.round(hourlyLoggedHours * effectiveHourlyRate) + directManualSalaries;
      calculationBasis = `${hourlyLoggedHours.toFixed(1)} hrs logged × ₹${effectiveHourlyRate}/hr` + (directManualSalaries > 0 ? ` + ₹${directManualSalaries.toLocaleString('en-IN')} manual salary` : '');
    } else {
      earnedBasePay = numBaseSalary;
      calculationBasis = `Field Worker Base Pay: ₹${numBaseSalary.toLocaleString('en-IN')} (Includes designated client project site visits)`;
    }
  } else {
    // Standard Office / FULL_TIME:
    const autoBaseFromHours = Math.round(hourlyLoggedHours * effectiveHourlyRate);
    const totalAutoBase = autoBaseFromHours + directManualSalaries;
    if (hourlyLoggedHours > 0 || directManualSalaries > 0) {
      if (numBaseSalary === totalAutoBase || Math.abs(numBaseSalary - totalAutoBase) < 1) {
        earnedBasePay = totalAutoBase;
        if (directManualSalaries > 0 && hourlyLoggedHours > 0) {
          calculationBasis = `${hourlyLoggedHours.toFixed(1)} hrs logged (@₹${effectiveHourlyRate}/hr = ₹${autoBaseFromHours.toLocaleString('en-IN')}) + ₹${directManualSalaries.toLocaleString('en-IN')} manual day salary = ₹${earnedBasePay.toLocaleString('en-IN')}.00`;
        } else if (directManualSalaries > 0) {
          calculationBasis = `₹${directManualSalaries.toLocaleString('en-IN')}.00 (from ${manualSalaryRecords.length} manual day salary override${manualSalaryRecords.length > 1 ? 's' : ''})`;
        } else {
          calculationBasis = `${hourlyLoggedHours.toFixed(1)} hrs logged × ₹${effectiveHourlyRate}/hr = ₹${earnedBasePay.toLocaleString('en-IN')}.00 (Automatic Punch Basis)`;
        }
      } else {
        earnedBasePay = numBaseSalary;
        calculationBasis = `Manual Base: ₹${numBaseSalary.toLocaleString('en-IN')}.00 (Auto: ${hourlyLoggedHours.toFixed(1)}h × ₹${effectiveHourlyRate} + ₹${directManualSalaries} = ₹${totalAutoBase.toLocaleString('en-IN')})`;
      }
    } else {
      earnedBasePay = numBaseSalary;
      calculationBasis = numBaseSalary > 0 
        ? `Fixed Monthly ₹${numBaseSalary.toLocaleString('en-IN')} (Awaiting cycle punches)`
        : `₹0.00 (No punches logged for this cycle)`;
    }
  }

  const overtimePay = Math.round(numOvertimeHours * (effectiveHourlyRate || 250) * 1.5);
  const totalIncentive = Math.round(numPerformanceBonus + manualBonuses);
  const totalAllowance = Math.round(manualReimbursements);
  const grossPay = Math.round(earnedBasePay + overtimePay + totalIncentive + totalAllowance);
  const effectiveStatutory = Math.min(numStatutoryDeductions, grossPay);
  const totalDeductions = Math.round(numAdvanceDeduction + effectiveStatutory + manualDeductions);
  const netTakeHome = Math.max(0, grossPay - totalDeductions);
  const netPayWords = numberToIndianWords(netTakeHome);

  // Disburse Single Employee Salary
  const handleDisburseSalary = async () => {
    if (!selectedEmployee) return;
    setDisbursing(true);
    setSaveSuccess('');
    setSaveError('');
    try {
      const cycleDisplay = formatCycleDisplay(selectedCycle);

      const payload = {
        employee_id: selectedEmployee.id,
        cycle: cycleDisplay,
        amount: netTakeHome,
        base_salary: earnedBasePay,
        basic_salary: earnedBasePay,
        overtime_pay: overtimePay,
        performance_bonus: totalIncentive,
        incentive: totalIncentive,
        allowance: totalAllowance,
        others_earnings: overtimePay,
        advance_deduction: numAdvanceDeduction,
        advance_repayment: numAdvanceDeduction,
        statutory_deductions: numStatutoryDeductions,
        paid_salary: numStatutoryDeductions,
        other_deductions: manualDeductions,
        total_earnings: grossPay,
        total_deductions: totalDeductions,
        net_salary: netTakeHome,
        net_pay: netTakeHome,
        net_pay_words: netPayWords,
        employment_type: empType,
        calculation_basis: calculationBasis,
        logged_hours: totalLoggedHours,
        hourly_rate: effectiveHourlyRate,
        hours_salary: effectiveHourlyRate,
        day_salary: effectiveDailyRate,
        half_day_salary: effectiveHalfDaySalary,
        days_present: presentDays,
        half_days: halfDaysCount,
        leave_days: leaveDaysCount,
        working_days: workingDaysCount
      };
      await api.post('/notifications/disburse-salary', payload);
      setPayoutSuccess(true);
      setSaveSuccess(`Salary of ₹${netTakeHome.toLocaleString('en-IN')}.00 successfully credited to ${selectedEmployee.first_name} ${selectedEmployee.last_name}. Notification dispatched.`);
      fetchPayoutHistory(selectedEmployee.id);
      setTimeout(() => setPayoutSuccess(false), 5000);
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Failed to disburse salary.');
    } finally {
      setDisbursing(false);
    }
  };

  // Batch Disburse All Pending Employees in Cycle
  const handleBatchDisburse = async () => {
    if (!window.confirm(`Are you sure you want to execute batch salary disbursement for all pending staff for cycle ${selectedCycle}?`)) {
      return;
    }
    setBatchDisbursing(true);
    setBatchDisburseSuccess('');
    try {
      const res = await api.post(`/payroll/batch-disburse?cycle=${selectedCycle}`);
      setBatchDisburseSuccess(res.data?.message || 'Batch disbursement completed successfully.');
      fetchPayrollRegister(selectedCycle);
      if (selectedEmployee) {
        fetchPayoutHistory(selectedEmployee.id);
      }
      setTimeout(() => setBatchDisburseSuccess(''), 6000);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to execute batch disbursement.');
    } finally {
      setBatchDisbursing(false);
    }
  };

  // Download Bank NEFT Advice Sheet as CSV
  const handleDownloadBankAdvice = async () => {
    try {
      const res = await api.get(`/payroll/bank-advice?cycle=${selectedCycle}`);
      const data = res.data || [];
      if (data.length === 0) {
        alert("No employee records found for bank advice.");
        return;
      }
      const headers = ["Employee Code", "Employee Name", "Account Holder Name", "Bank Name", "Account Number", "IFSC Code", "UPI Number", "Net Payable (INR)", "Payment Cycle", "Status"];
      const rows = data.map(d => [
        d.employee_code,
        `"${(d.employee_name || '').replace(/"/g, '""')}"`,
        `"${(d.account_holder_name || '').replace(/"/g, '""')}"`,
        `"${(d.bank_name || '').replace(/"/g, '""')}"`,
        `"${(d.account_number || '').replace(/"/g, '""')}"`,
        `"${(d.ifsc_code || '').replace(/"/g, '""')}"`,
        `"${(d.upi_number || '').replace(/"/g, '""')}"`,
        d.net_payable,
        d.cycle,
        d.status
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `argus_bank_advice_${selectedCycle}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to download bank advice", err);
      alert("Failed to generate bank advice sheet.");
    }
  };

  // Filtered attendance records
  const filteredLogs = attendanceRecords.filter(log => {
    if (activeFilter === 'Paid Leaves') return log.status === 'LEAVE';
    if (activeFilter === 'Overtime') return (log.total_hours || 0) > 8;
    return true;
  });

  // Filtered Register Records
  const filteredRegister = useMemo(() => {
    if (!registerSearch.trim()) return payrollRegister;
    const term = registerSearch.toLowerCase();
    return payrollRegister.filter(r => 
      (r.employee_name || '').toLowerCase().includes(term) ||
      (r.employee_code || '').toLowerCase().includes(term) ||
      (r.department || '').toLowerCase().includes(term)
    );
  }, [payrollRegister, registerSearch]);

  const pendingRegisterCount = payrollRegister.filter(r => r.payout_status !== 'PAID').length;

  // Construct active slip object for live preview
  const livePreviewSlip = useMemo(() => {
    if (!selectedEmployee) return null;
    const parts = (selectedCycle || '2026-09').split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const daysInMonth = new Date(y, m, 0).getDate();

    const hoursInt = Math.floor(totalLoggedHours);
    const minsInt = Math.round((totalLoggedHours - hoursInt) * 60);
    const formattedHrs = `${String(hoursInt).padStart(2, '0')}:${String(minsInt).padStart(2, '0')}`;

    const dailyBreakdown = attendanceRecords.map(r => {
      const hrs = extractHours(r);
      const manualSal = (r.mode === 'Salary' || (r.manual_salary != null && Number(r.manual_salary) > 0)) ? Number(r.manual_salary) : 0;
      let earned = 0;
      let rateLabel = '';
      if (manualSal > 0) {
        earned = manualSal;
        rateLabel = 'Manual Day Wage';
      } else if (empType === 'DAILY_WAGE') {
        const isHalf = r.status === 'HALF_DAY';
        earned = isHalf ? effectiveHalfDaySalary : effectiveDailyRate;
        rateLabel = isHalf ? `₹${effectiveHalfDaySalary} (Half-Day)` : `₹${effectiveDailyRate}`;
      } else {
        earned = Math.round(hrs * effectiveHourlyRate);
        rateLabel = `₹${effectiveHourlyRate}/hr`;
      }
      return {
        id: r.id,
        date: r.date,
        shift: r.shift || (r.shift_start ? `${r.shift_start} - ${r.shift_end}` : 'Regular Shift'),
        check_in_time: r.check_in_time || (r.check_in ? strTime(r.check_in) : '—'),
        check_out_time: r.check_out_time || (r.check_out ? strTime(r.check_out) : '—'),
        hours: hrs,
        status: r.status,
        mode: r.mode,
        rate_label: rateLabel,
        daily_earned: earned
      };
    });

    return {
      id: `PREVIEW-${selectedEmployee.employee_code || 'EMP'}`,
      employee_name: `${selectedEmployee.first_name || ''} ${selectedEmployee.last_name || ''}`.trim(),
      employee_code: selectedEmployee.employee_code || 'EMP',
      aadhar_number: selectedEmployee.aadhar_number || selectedEmployee.employee_code || '—',
      designation: selectedEmployee.designation || selectedEmployee.department || 'Production',
      phone: selectedEmployee.phone || '—',
      cycle: selectedCycle,
      total_days_of_month: daysInMonth,
      total_working_hours_formatted: formattedHrs,
      logged_hours: totalLoggedHours,
      hours_salary: effectiveHourlyRate,
      day_salary: effectiveDailyRate,
      half_day_salary: effectiveHalfDaySalary,
      working_days: workingDaysCount,
      leave_days: leaveDaysCount,
      basic_salary: earnedBasePay,
      allowance: totalAllowance,
      incentive: totalIncentive,
      others_earnings: overtimePay,
      total_earnings: grossPay,
      paid_salary: numStatutoryDeductions,
      advance_repayment: numAdvanceDeduction,
      other_deductions: manualDeductions,
      total_deductions: totalDeductions,
      net_pay: netTakeHome,
      net_pay_words: netPayWords,
      calculation_basis: calculationBasis,
      daily_breakdown: dailyBreakdown,
      status: 'PREVIEW'
    };
  }, [
    selectedEmployee, selectedCycle, totalLoggedHours, effectiveHourlyRate, effectiveDailyRate, 
    effectiveHalfDaySalary, workingDaysCount, leaveDaysCount, earnedBasePay, totalAllowance, 
    totalIncentive, overtimePay, grossPay, numStatutoryDeductions, numAdvanceDeduction, 
    manualDeductions, totalDeductions, netTakeHome, netPayWords, calculationBasis, attendanceRecords, empType
  ]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header with Duration (Month-Year) Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {isEmployee ? 'My Salary & Payslip Details' : 'Workforce Payroll & Attendance Engine'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Duration Selector (Month-Year) */}
          <div className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-sm">
            <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-slate-500 font-bold">Duration:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedCycle(`${selectedYear}-${e.target.value}`)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer pr-1"
              aria-label="Select Duration Month"
            >
              {MONTHS.map(m => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedCycle(`${e.target.value}-${selectedMonth}`)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer pr-1 border-l border-slate-200 pl-2"
              aria-label="Select Duration Year"
            >
              {YEARS.map(y => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Admin Tab Switcher: Individual Ledger vs Master Payroll Register */}
      {!isEmployee && (
        <div className="flex flex-wrap items-center gap-2 p-1 bg-slate-100/90 rounded-2xl w-fit border border-slate-200/80">
          <button
            type="button"
            onClick={() => setActiveTab('individual')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'individual'
                ? 'bg-white text-blue-700 shadow-sm font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Employee Salary Ledger (Individual)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('register')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'register'
                ? 'bg-white text-blue-700 shadow-sm font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Master Payroll Register (All Staff)</span>
            {pendingRegisterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-mono font-extrabold">
                {pendingRegisterCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Employee Search & Select Control Bar - Below Toggle */}
      {!isEmployee && activeTab === 'individual' && employees.length > 0 && (
        <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-3 animate-in fade-in duration-150">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee by name, code, or department..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
              >
                ×
              </button>
            )}
          </div>

          <div className="w-full md:w-80">
            <select
              value={selectedEmployeeId}
              onChange={(e) => handleEmployeeSelect(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
            >
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.employee_code || 'EMP'}) — {emp.department || 'General'}
                  </option>
                ))
              ) : (
                <option value="" disabled>No matching employees found</option>
              )}
            </select>
          </div>

          <div className="text-[11px] text-slate-400 font-mono shrink-0 pr-1">
            {filteredEmployees.length} of {employees.length} employees
          </div>
        </div>
      )}

      {/* Save Success / Error Alerts */}
      {saveSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {saveError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {batchDisburseSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{batchDisburseSuccess}</span>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-xs font-bold text-slate-700">Loading payroll &amp; compensation records...</div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW MODE 1: MASTER PAYROLL REGISTER (ALL STAFF) */}
      {/* ------------------------------------------------------------- */}
      {!loading && !isEmployee && activeTab === 'register' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                  Monthly Master Payroll Register — {selectedCycle}
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Full organization salary reconciliation, attendance audit, and one-click batch disbursement
                </p>
              </div>

              {/* Action Buttons: Batch Disburse, Export CSV/Excel, Bank Advice */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchPayrollRegister(selectedCycle)}
                  disabled={loadingRegister}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loadingRegister ? 'animate-spin' : ''}`} />
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={handleDownloadBankAdvice}
                  className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-800 flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  Bank Advice (NEFT)
                </button>

                <button
                  type="button"
                  onClick={() => downloadFromServer(`/reports/export-payroll-csv?cycle=${encodeURIComponent(selectedCycle)}`, `payroll_${selectedCycle}.csv`).catch((e) => alert(e?.response?.data?.detail || 'Export failed.'))}
                  className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-800 flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  Export CSV
                </button>

                <button
                  type="button"
                  onClick={() => downloadFromServer(`/reports/export-payroll-excel?cycle=${encodeURIComponent(selectedCycle)}`, `payroll_${selectedCycle}.xlsx`).catch((e) => alert(e?.response?.data?.detail || 'Export failed.'))}
                  className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-800 flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-teal-600" />
                  Export Excel
                </button>

                <button
                  type="button"
                  onClick={handleBatchDisburse}
                  disabled={batchDisbursing || pendingRegisterCount === 0}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all ${
                    pendingRegisterCount === 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  {batchDisbursing ? 'Processing Batch...' : `Batch Disburse (${pendingRegisterCount} Pending)`}
                </button>
              </div>
            </div>

            {/* Search Input for Register */}
            <div className="relative pt-2">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-5 pointer-events-none" />
              <input
                type="text"
                value={registerSearch}
                onChange={(e) => setRegisterSearch(e.target.value)}
                placeholder="Filter register by staff name, code, or department..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Master Register Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              {loadingRegister ? (
                <div className="p-12 text-center">
                  <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <div className="text-xs font-bold text-slate-700">Computing workforce payroll for {selectedCycle}...</div>
                </div>
              ) : filteredRegister.length > 0 ? (
                <table className="w-full text-left text-xs text-slate-600 border-collapse min-w-[980px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/75 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">EMPLOYEE</th>
                      <th className="py-3 px-4">DEPT / MODEL</th>
                      <th className="py-3 px-4 text-center">DAYS (WORK/LEAVE)</th>
                      <th className="py-3 px-4 text-center">HOURS / OT</th>
                      <th className="py-3 px-4 text-right">BASIC SALARY</th>
                      <th className="py-3 px-4 text-right">ALLOWANCE</th>
                      <th className="py-3 px-4 text-right">INCENTIVE</th>
                      <th className="py-3 px-4 text-right">DEDUCTIONS</th>
                      <th className="py-3 px-4 text-right font-bold text-slate-900">NET PAY</th>
                      <th className="py-3 px-4 text-center">STATUS</th>
                      <th className="py-3 px-4 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRegister.map((row) => (
                      <tr key={row.employee_id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-extrabold text-slate-900">{row.employee_name}</div>
                          <div className="text-[10px] font-mono text-slate-400">{row.employee_code}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-slate-800">{row.department}</div>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-600">
                            {row.employment_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className="font-bold text-slate-900">{row.working_days}</span>
                          <span className="text-slate-400"> / </span>
                          <span className="text-amber-700 font-bold">{row.leave_days}</span>
                          <div className="text-[10px] text-slate-400 font-mono">Pres: {row.days_present} (0.5d: {row.half_days})</div>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-800">{row.total_logged_hours}h</span>
                          {row.overtime_hours > 0 && (
                            <div className="text-[10px] font-mono font-bold text-teal-600">+{row.overtime_hours}h OT</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                          ₹{row.basic_salary?.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700 whitespace-nowrap">
                          ₹{row.allowance?.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-blue-700 whitespace-nowrap">
                          ₹{row.incentive?.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-red-600 whitespace-nowrap">
                          -₹{row.total_deductions?.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-sm text-slate-900 whitespace-nowrap">
                          ₹{row.net_pay?.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-bold text-[10px] border ${
                            row.payout_status === 'PAID'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${row.payout_status === 'PAID' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            {row.payout_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSlip(row);
                              setSlipModalOpen(true);
                            }}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                          >
                            <FileText className="w-3 h-3" />
                            Payslip
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-12 px-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mb-1">
                    No records found in register for {selectedCycle}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Ensure employees are active and attendance logs have been synced for this billing cycle.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* VIEW MODE 2: INDIVIDUAL EMPLOYEE SALARY LEDGER */}
      {/* ------------------------------------------------------------- */}
      {!loading && (isEmployee || activeTab === 'individual') && (
        <>
          {/* No Employees State (Admin Only) */}
          {!isEmployee && employees.length === 0 && (
            <div className="p-6 bg-white border border-slate-200 rounded-2xl text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <UserPlus className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                No employees enrolled in {organization?.name || 'your organisation'} yet
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Payroll and attendance calculations generate automatically once employees are added.
              </p>
              <Link
                to="/attendance/enrollment"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0052cc] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm"
              >
                <UserPlus className="w-4 h-4" />
                Enroll First Employee
              </Link>
            </div>
          )}

          {selectedEmployee && (
            <>
              {/* Employee Search & Selector Card */}
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Employee Info Header */}
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-700 font-extrabold flex items-center justify-center text-lg border border-blue-200 shadow-sm shrink-0">
                      {selectedEmployee.first_name?.[0]}{selectedEmployee.last_name?.[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-lg font-extrabold text-slate-900">
                          {selectedEmployee.first_name} {selectedEmployee.last_name}
                        </h2>
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono font-bold text-[10px] border border-blue-200">
                          {selectedEmployee.employee_code || 'EMP'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono font-bold text-[10px] border border-emerald-200">
                          Active Workforce
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 font-medium flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>Department: <span className="font-bold text-slate-800">{selectedEmployee.department || 'Operations'}</span></span>
                        <span>•</span>
                        <span>Designation: <span className="font-bold text-slate-800">{selectedEmployee.designation || 'Staff'}</span></span>
                        <span>•</span>
                        <span>Email: <span className="font-bold text-slate-800">{selectedEmployee.email || 'N/A'}</span></span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons: Preview Slip & Exports */}
                  <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSlip(livePreviewSlip);
                        setSlipModalOpen(true);
                      }}
                      className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Preview Payslip
                    </button>

                    {!isEmployee && (
                      <button
                        type="button"
                        onClick={() => downloadFromServer(`/reports/export-payroll-csv?cycle=${encodeURIComponent(selectedCycle)}`, `payroll_${selectedCycle}.csv`).catch((e) => alert(e?.response?.data?.detail || 'Export failed.'))}
                        className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                        Export CSV
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSlip(livePreviewSlip);
                        setSlipModalOpen(true);
                      }}
                      className="px-4 py-2 bg-[#0052cc] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {isEmployee ? 'Print Statement' : 'Generate Payslip'}
                    </button>
                  </div>
                </div>
              </div>

              {/* 5 KPI Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                {/* Card 1: Attendance */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                      ATTENDANCE RECORD
                    </span>
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-black text-slate-900 tracking-tight flex items-baseline flex-wrap gap-1">
                      <span>{presentDays}</span>
                      <span className="text-xs font-medium text-slate-500">Days Present</span>
                      {halfDaysCount > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-mono font-bold border border-amber-200">
                          +{halfDaysCount} Half-Day
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono border-t border-slate-100 pt-1 flex justify-between">
                    <span className="text-emerald-700 font-bold">Working: {workingDaysCount}d</span>
                    <span>Logged: {totalLoggedHours.toFixed(1)}h</span>
                  </div>
                </div>

                {/* Card 2: Performance Bonus & Allowance */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                      INCENTIVES &amp; ALLOWANCE
                    </span>
                    <Award className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-black text-slate-900 tracking-tight font-mono">
                      ₹{(totalIncentive + totalAllowance).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono border-t border-slate-100 pt-1 flex justify-between">
                    <span className="text-blue-600 font-bold">Inc: ₹{totalIncentive}</span>
                    <span className="text-indigo-600 font-bold">Allow: ₹{totalAllowance}</span>
                  </div>
                </div>

                {/* Card 3: Approved Overtime */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                      OVERTIME LOGGED
                    </span>
                    <Clock className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-black text-teal-700 tracking-tight font-mono">
                      +{numOvertimeHours} <span className="text-xs font-medium text-slate-500">Extra Hours</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono border-t border-slate-100 pt-1 flex justify-between">
                    <span>1.5x Multiplier</span>
                    <span className="text-teal-700 font-bold font-mono">+₹{overtimePay.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Card 4: Advance & Deductions */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                      TOTAL DEDUCTIONS
                    </span>
                    <Banknote className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="my-2">
                    <div className="text-xl font-black text-red-600 tracking-tight font-mono">
                      -₹{totalDeductions.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono border-t border-slate-100 pt-1 flex justify-between">
                    <span>Adv: -₹{numAdvanceDeduction}</span>
                    <span>PF: -₹{numStatutoryDeductions}</span>
                  </div>
                </div>

                {/* Card 5: Total Net Salary */}
                <div className="bg-[#0052cc] text-white p-4 rounded-2xl shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-200">
                      TOTAL NET PAY
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-white/20 text-white text-[9px] font-bold font-mono">
                      {selectedCycle}
                    </span>
                  </div>
                  <div className="my-2">
                    <div className="text-2xl font-black tracking-tight font-mono">
                      ₹{netTakeHome.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="text-[10px] text-blue-100 font-mono border-t border-white/20 pt-1 flex justify-between">
                    <span>Gross: ₹{grossPay.toLocaleString('en-IN')}</span>
                    <span className="font-bold text-emerald-300">Direct Deposit</span>
                  </div>
                </div>
              </div>

              {/* Monthly Salary Calculation Breakdown Grid */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-7">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-blue-600" />
                      <h2 className="text-base font-bold text-slate-900">
                        Monthly Salary Calculation Breakdown ({selectedCycle})
                      </h2>
                    </div>
                  </div>

                  {!isEmployee ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetDefaults}
                        title="Reset to calculated defaults"
                        className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        Reset
                      </button>

                      <button
                        type="button"
                        onClick={handleSavePayrollStructure}
                        disabled={savingPayroll}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {savingPayroll ? 'Saving...' : 'Save Settings'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setPayoutApproved(true)}
                        className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {payoutApproved ? 'Payout Authorized' : 'Approve Payout'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-200">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Verified Structure
                      </span>
                    </div>
                  )}
                </div>

                {/* Multi-Model Payroll Calculation Formula Banner */}
                <div className="my-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider ${
                      empType === 'PART_TIME' ? 'bg-blue-100 text-blue-800' :
                      empType === 'DAILY_WAGE' ? 'bg-amber-100 text-amber-900' :
                      empType === 'FIELD_WORKER' ? 'bg-purple-100 text-purple-900' :
                      'bg-emerald-100 text-emerald-800'
                    }`}>
                      {empType.replace('_', ' ')} BASIS
                    </span>
                    <div>
                      <div className="font-bold text-slate-800">
                        Active Calculation Formula: <span className="font-mono text-blue-700">{calculationBasis}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Calculated Base Earned: <strong className="text-slate-800">₹{earnedBasePay.toLocaleString('en-IN')}.00</strong>
                        {absentDays > 0 && empType === 'FULL_TIME' && (
                          <span className="text-red-600 font-medium"> ({absentDays} unpaid absent days prorated deduction)</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Earned Gross Pay</span>
                    <span className="text-base font-black font-mono text-slate-900">₹{grossPay.toLocaleString('en-IN')}.00</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2 items-start">
                  {/* Left Columns: Earnings & Deductions Inputs */}
                  <div className="lg:col-span-8 space-y-6">
                    {/* Section 1: Earnings & Entitlements */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
                          {isEmployee ? 'EARNINGS & ENTITLEMENTS (READ-ONLY)' : 'EARNINGS & ENTITLEMENTS (EDITABLE)'}
                        </h3>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {isEmployee ? 'Current active cycle calculation' : 'Live calculation enabled'}
                        </span>
                      </div>
                      
                      <div className="space-y-3">
                        {/* Hourly Base Rate (Primary Basis) */}
                        <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-blue-950">Standard Hourly Rate (₹/hr)</span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-600 text-white uppercase tracking-wider">
                                PRIMARY BASIS
                              </span>
                            </div>
                            <div className="text-[10px] text-blue-700 font-mono">
                              Automatically multiplies logged punch hours ({totalLoggedHours.toFixed(1)}h) to compute earned basic pay
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-blue-700">₹</span>
                            <input
                              type="number"
                              min="0"
                              step="10"
                              disabled={isEmployee}
                              value={hourlyRate}
                              onChange={(e) => handleHourlyRateChange(e.target.value)}
                              className={`w-32 px-2.5 py-1.5 border rounded-lg text-xs font-mono font-bold text-slate-900 text-right ${
                                isEmployee ? 'bg-slate-100 border-slate-200 cursor-not-allowed' : 'bg-white border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500'
                              }`}
                            />
                            <span className="text-[10px] font-mono text-slate-500">/hr</span>
                          </div>
                        </div>

                        {/* Base Monthly Salary */}
                        <div className="p-3.5 bg-slate-50/80 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900">Earned Basic Salary (₹)</span>
                              {numBaseSalary === Math.round(totalLoggedHours * effectiveHourlyRate) ? (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                                  PUNCH AUTO-CALCULATED
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-900 uppercase tracking-wider">
                                  MANUAL OVERRIDE
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {totalLoggedHours > 0 
                                ? `Auto: ${totalLoggedHours.toFixed(1)}h logged × ₹${effectiveHourlyRate}/hr = ₹${Math.round(totalLoggedHours * effectiveHourlyRate).toLocaleString('en-IN')}`
                                : 'Editable base monthly salary (auto-calculated from attendance punch hours)'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-slate-500">₹</span>
                            <input
                              type="number"
                              min="0"
                              step="500"
                              disabled={isEmployee}
                              value={baseSalary}
                              onChange={(e) => setBaseSalary(e.target.value)}
                              className={`w-32 px-2.5 py-1.5 border rounded-lg text-xs font-mono font-bold text-slate-900 text-right ${
                                isEmployee ? 'bg-slate-100 border-slate-200 cursor-not-allowed' : 'bg-white border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'
                              }`}
                            />
                          </div>
                        </div>

                        {/* Approved Overtime */}
                        <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold text-emerald-900">Approved Overtime Hours</div>
                            <div className="text-[10px] text-emerald-700 font-mono">
                              1.5x Multiplier = ₹{Math.round(numHourlyRate * 1.5)}/hr • Total: ₹{overtimePay.toLocaleString('en-IN')}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              disabled={isEmployee}
                              value={overtimeHours}
                              onChange={(e) => setOvertimeHours(e.target.value)}
                              className={`w-24 px-2.5 py-1.5 border rounded-lg text-xs font-mono font-bold text-emerald-900 text-right ${
                                isEmployee ? 'bg-white/80 border-emerald-200 cursor-not-allowed' : 'bg-white border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500'
                              }`}
                            />
                            <span className="text-[10px] font-mono text-emerald-700">hrs</span>
                            <span className="text-xs font-mono font-bold text-emerald-800 ml-2">
                              +₹{overtimePay.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>

                        {/* Performance Bonus & Incentives */}
                        <div className="p-3.5 bg-blue-50/50 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold text-blue-900">Performance &amp; Punctuality Incentive</div>
                            <div className="text-[10px] text-blue-700 font-mono">
                              Auto: ₹{numPerformanceBonus} {manualBonuses > 0 && `• Manual: +₹${manualBonuses}`} • Total: ₹{totalIncentive}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-blue-600">₹</span>
                            <input
                              type="number"
                              min="0"
                              step="100"
                              disabled={isEmployee}
                              value={performanceBonus}
                              onChange={(e) => setPerformanceBonus(e.target.value)}
                              className={`w-32 px-2.5 py-1.5 border rounded-lg text-xs font-mono font-bold text-blue-900 text-right ${
                                isEmployee ? 'bg-white/80 border-blue-200 cursor-not-allowed' : 'bg-white border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500'
                              }`}
                            />
                          </div>
                        </div>

                        {/* Allowances & Reimbursements */}
                        <div className="p-3.5 bg-teal-50/50 border border-teal-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold text-teal-900">Allowances &amp; Reimbursements</div>
                            <div className="text-[10px] text-teal-700 font-mono">Summed from travel/food/site expenses in Manual Adjustments</div>
                          </div>
                          <div className="flex items-center gap-2 font-mono font-bold text-teal-800 text-xs">
                            +₹{totalAllowance.toLocaleString('en-IN')}.00
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Deductions & Recoveries */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
                          {isEmployee ? 'DEDUCTIONS & RECOVERIES (READ-ONLY)' : 'DEDUCTIONS & RECOVERIES (EDITABLE)'}
                        </h3>
                        <span className="text-[10px] text-slate-400 font-mono">Deducted from gross pay</span>
                      </div>

                      <div className="space-y-3">
                        {/* Advance Salary Deduction */}
                        <div className="p-3.5 bg-red-50/40 border border-red-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold text-red-900">Advance Salary Installment Recovery</div>
                            <div className="text-[10px] text-red-700 font-mono">Auto-scheduled amortization for {selectedCycle}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-red-600">-₹</span>
                            <input
                              type="number"
                              min="0"
                              step="500"
                              disabled={isEmployee}
                              value={advanceDeduction}
                              onChange={(e) => setAdvanceDeduction(e.target.value)}
                              className={`w-32 px-2.5 py-1.5 border rounded-lg text-xs font-mono font-bold text-red-900 text-right ${
                                isEmployee ? 'bg-white/80 border-red-200 cursor-not-allowed' : 'bg-white border-red-300 focus:outline-none focus:ring-2 focus:ring-red-500'
                              }`}
                            />
                          </div>
                        </div>

                        {/* Statutory Deductions */}
                        <div className="p-3.5 bg-slate-50/80 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold text-slate-800">Paid Salary (PF &amp; Taxes)</div>
                            <div className="text-[10px] text-slate-500 font-mono">Provident Fund, Professional Tax &amp; TDS estimate</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-red-600">-₹</span>
                            <input
                              type="number"
                              min="0"
                              step="100"
                              disabled={isEmployee}
                              value={statutoryDeductions}
                              onChange={(e) => setStatutoryDeductions(e.target.value)}
                              className={`w-32 px-2.5 py-1.5 border rounded-lg text-xs font-mono font-bold text-slate-900 text-right ${
                                isEmployee ? 'bg-slate-100 border-slate-200 cursor-not-allowed' : 'bg-white border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500'
                              }`}
                            />
                          </div>
                        </div>

                        {/* Other Manual Deductions */}
                        {manualDeductions > 0 && (
                          <div className="p-3.5 bg-red-50/40 border border-red-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-bold text-red-900">Other Deductions (Penalties / Disciplinary)</div>
                              <div className="text-[10px] text-red-700 font-mono">Configured via Manual Adjustments table below</div>
                            </div>
                            <div className="flex items-center gap-2 font-mono font-bold text-red-600 text-xs">
                              -₹{manualDeductions.toLocaleString('en-IN')}.00
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Section 3: Manual Adjustments for Money (Admin Only) */}
                    {!isEmployee && (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                          <div>
                            <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                              <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                              Manual Money Adjustments ({selectedCycle})
                            </h3>
                            <p className="text-[10px] text-slate-500">
                              Add bonuses, deductions, or expense reimbursements for this employee
                            </p>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400">
                            {financialEntries.length} entries
                          </span>
                        </div>

                        {/* Add Adjustment Form */}
                        <form onSubmit={handleAddFinancialEntry} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                          <div className="sm:col-span-3">
                            <label className="text-[10px] font-bold text-slate-600 block mb-1">Type</label>
                            <select
                              value={newFinType}
                              onChange={(e) => setNewFinType(e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                            >
                              <option value="BONUS">Bonus (Incentive)</option>
                              <option value="REIMBURSEMENT">Reimbursement (Allowance)</option>
                              <option value="DEDUCTION">Deduction (Penalty)</option>
                            </select>
                          </div>

                          <div className="sm:col-span-3">
                            <label className="text-[10px] font-bold text-slate-600 block mb-1">Amount (₹)</label>
                            <input
                              type="number"
                              min="1"
                              step="10"
                              value={newFinAmount}
                              onChange={(e) => setNewFinAmount(e.target.value)}
                              placeholder="e.g. 1500"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                          </div>

                          <div className="sm:col-span-4">
                            <label className="text-[10px] font-bold text-slate-600 block mb-1">Reason / Description</label>
                            <input
                              type="text"
                              value={newFinReason}
                              onChange={(e) => setNewFinReason(e.target.value)}
                              placeholder="e.g. Client visit travel allowance"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <button
                              type="submit"
                              disabled={addingFinEntry}
                              className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-xs font-bold shadow-sm flex items-center justify-center gap-1 cursor-pointer transition-all"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Add
                            </button>
                          </div>
                        </form>

                        {/* Adjustments Table */}
                        {financialEntries.length > 0 ? (
                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase text-slate-500">
                                  <th className="py-2 px-3">Type</th>
                                  <th className="py-2 px-3">Description</th>
                                  <th className="py-2 px-3 text-right">Amount (₹)</th>
                                  <th className="py-2 px-3 text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {financialEntries.map(entry => (
                                  <tr key={entry.id} className="hover:bg-slate-50/50">
                                    <td className="py-2 px-3 whitespace-nowrap">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                        entry.type === 'BONUS' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                        entry.type === 'REIMBURSEMENT' ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                                        'bg-red-50 text-red-700 border border-red-200'
                                      }`}>
                                        {entry.type}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 font-medium text-slate-800">
                                      {entry.reason || 'Manual Adjustment'}
                                    </td>
                                    <td className={`py-2 px-3 font-mono font-bold text-right ${
                                      entry.type === 'DEDUCTION' ? 'text-red-600' : 'text-emerald-700'
                                    }`}>
                                      {entry.type === 'DEDUCTION' ? '-' : '+'}₹{Number(entry.amount).toLocaleString('en-IN')}
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteFinancialEntry(entry.id)}
                                        className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                                        title="Delete entry"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-center py-2 text-[11px] text-slate-400 font-medium">
                            No manual financial adjustments logged for {selectedCycle}.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column: PAYROLL SUMMARY TICKET */}
                  <div className="lg:col-span-4 bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-600">
                        PAYROLL SUMMARY TICKET
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{selectedEmployee.employee_code || 'EMP'}</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Contract Monthly Base:</span>
                        <span className="font-mono font-bold text-slate-800">₹{numBaseSalary.toLocaleString('en-IN')}.00</span>
                      </div>
                      {lossOfPay > 0 && (
                        <div className="flex justify-between text-red-600">
                          <span>Attendance LOP (-{absentDays}d):</span>
                          <span className="font-mono font-bold">-₹{lossOfPay.toLocaleString('en-IN')}.00</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-800 font-semibold border-t border-slate-100 pt-1">
                        <span>Earned Base Pay:</span>
                        <span className="font-mono font-bold">₹{earnedBasePay.toLocaleString('en-IN')}.00</span>
                      </div>
                      <div className="flex justify-between text-emerald-700">
                        <span>Overtime (+{numOvertimeHours} hrs):</span>
                        <span className="font-mono font-bold">+₹{overtimePay.toLocaleString('en-IN')}.00</span>
                      </div>
                      <div className="flex justify-between text-blue-700">
                        <span>Performance Incentive:</span>
                        <span className="font-mono font-bold">+₹{totalIncentive.toLocaleString('en-IN')}.00</span>
                      </div>
                      <div className="flex justify-between text-teal-700">
                        <span>Allowances &amp; Reimb.:</span>
                        <span className="font-mono font-bold">+₹{totalAllowance.toLocaleString('en-IN')}.00</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-2">
                        <span>Total Gross Payable:</span>
                        <span className="font-mono">₹{grossPay.toLocaleString('en-IN')}.00</span>
                      </div>

                      <div className="pt-2 border-t border-slate-200 space-y-1.5">
                        <div className="flex justify-between text-red-600">
                          <span>Advance Salary Recovery:</span>
                          <span className="font-mono font-bold">-₹{numAdvanceDeduction.toLocaleString('en-IN')}.00</span>
                        </div>
                        <div className="flex justify-between text-red-600">
                          <span>Paid Salary (PF &amp; Taxes):</span>
                          <span className="font-mono font-bold">-₹{effectiveStatutory.toLocaleString('en-IN')}.00</span>
                        </div>
                        {manualDeductions > 0 && (
                          <div className="flex justify-between text-red-600">
                            <span>Other Deductions:</span>
                            <span className="font-mono font-bold">-₹{manualDeductions.toLocaleString('en-IN')}.00</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-slate-700">
                          <span>Total Deductions:</span>
                          <span className="font-mono text-red-600">-₹{totalDeductions.toLocaleString('en-IN')}.00</span>
                        </div>
                      </div>
                    </div>

                    {/* Net Take-Home Highlight Card */}
                    <div className="p-4 bg-white border-2 border-blue-500/80 rounded-xl shadow-sm text-center space-y-3">
                      <div>
                        <div className="text-[10px] font-mono uppercase font-bold text-slate-400">
                          Net Take-Home Pay
                        </div>
                        <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
                          ₹{netTakeHome.toLocaleString('en-IN')}.00
                        </div>
                        <div className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {isEmployee ? `Calculated for ${selectedCycle}` : 'Ready for Disbursement'}
                        </div>
                      </div>

                      {!isEmployee ? (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={handleDisburseSalary}
                            disabled={disbursing || payoutSuccess}
                            className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
                              payoutSuccess
                                ? 'bg-emerald-600 text-white'
                                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white active:scale-95 disabled:opacity-75'
                            }`}
                          >
                            {payoutSuccess ? (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                Salary Credited &amp; Notified
                              </>
                            ) : (
                              <>
                                <Send className="w-4 h-4" />
                                {disbursing ? 'Processing Credit...' : 'Disburse & Credit Salary'}
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSlip(livePreviewSlip);
                              setSlipModalOpen(true);
                            }}
                            className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <FileText className="w-3.5 h-3.5 text-blue-600" />
                            Preview Official Payslip
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center gap-2">
                            <Banknote className="w-4 h-4 text-emerald-600" />
                            <span>Estimated Current Payout</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSlip(livePreviewSlip);
                              setSlipModalOpen(true);
                            }}
                            className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 text-blue-600" />
                            View Current Payslip
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Daily Attendance Log */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Daily Attendance Log — {selectedEmployee.first_name} {selectedEmployee.last_name} ({selectedCycle})
                    </h2>
                  </div>

                  <div className="inline-flex rounded-lg p-0.5 bg-slate-100 text-xs font-semibold text-slate-600">
                    {['All', 'Overtime'].map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setActiveFilter(filter)}
                        className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                          activeFilter === filter ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {filteredLogs.length > 0 ? (
                    <table className="w-full text-left text-xs text-slate-600 border-collapse min-w-[760px]">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4">DATE</th>
                          <th className="py-3 px-4">CHECK-IN</th>
                          <th className="py-3 px-4">CHECK-OUT</th>
                          <th className="py-3 px-4">HOURS LOGGED</th>
                          <th className="py-3 px-4 text-right">DAILY EARNED (₹)</th>
                          <th className="py-3 px-4">ATTENDANCE STATUS</th>
                          <th className="py-3 px-4">VERIFICATION MODE</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredLogs.map((log, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                              {log.date}
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                              {log.check_in_time || (log.check_in ? strTime(log.check_in) : '--:--')}
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                              {log.check_out_time || (log.check_out ? strTime(log.check_out) : '--:--')}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-slate-900">
                              {log.total_hours || 0} hrs
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              {(() => {
                                const hrs = extractHours(log);
                                const manualSal = (log.mode === 'Salary' || (log.manual_salary != null && Number(log.manual_salary) > 0)) ? Number(log.manual_salary) : 0;
                                let earned = 0;
                                let sub = '';
                                if (manualSal > 0) {
                                  earned = manualSal;
                                  sub = 'Manual Day Wage';
                                } else if (empType === 'DAILY_WAGE') {
                                  const isHalf = log.status === 'HALF_DAY';
                                  earned = isHalf ? effectiveHalfDaySalary : effectiveDailyRate;
                                  sub = isHalf ? 'Half-Day Rate' : 'Daily Wage';
                                } else {
                                  earned = Math.round(hrs * effectiveHourlyRate);
                                  sub = `@₹${effectiveHourlyRate}/hr`;
                                }
                                return (
                                  <div>
                                    <span className="font-mono font-bold text-emerald-700">₹{earned.toLocaleString('en-IN')}</span>
                                    <span className="block text-[10px] text-slate-400 font-mono font-normal">{sub}</span>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-bold text-[10px] border ${
                                log.status === 'HALF_DAY' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                log.status === 'LATE' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                log.status === 'ABSENT' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  log.status === 'HALF_DAY' ? 'bg-amber-500' :
                                  log.status === 'LATE' ? 'bg-orange-500' :
                                  log.status === 'ABSENT' ? 'bg-rose-500' :
                                  'bg-emerald-500'
                                }`} />
                                {log.status === 'HALF_DAY' ? 'HALF-DAY (0.5d)' : (log.status || 'PRESENT')}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-700 text-[11px] font-mono">
                              {log.verification_mode || 'FACE_KIOSK'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-12 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                        <Inbox className="w-6 h-6" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-800 mb-1">
                        No attendance logs recorded for this employee in {selectedCycle}
                      </h3>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        When this employee punches in via Kiosk or Manual Entry, their shift records will appear here.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Salary Payout History & Historical Payslips */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">
                        {isEmployee ? 'My Salary Payout History & Official Payslips' : `Disbursed Salary History — ${selectedEmployee.first_name} ${selectedEmployee.last_name}`}
                      </h2>
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono font-bold text-[10px] border border-blue-200">
                        {payoutHistory.length} records
                      </span>
                    </div>
                  </div>

                  {selectedEmployee && (
                    <div className="text-xs text-slate-500 font-mono">
                      Employee Ref: <span className="font-bold text-slate-800">{selectedEmployee.employee_code || 'EMP'}</span>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  {payoutHistory.length > 0 ? (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-mono uppercase text-slate-500 font-bold">
                          <th className="py-3 px-4">Payout ID / Date</th>
                          <th className="py-3 px-4">Billing Cycle</th>
                          <th className="py-3 px-4">Gross Earnings</th>
                          <th className="py-3 px-4">Deductions</th>
                          <th className="py-3 px-4">Net Credited Pay</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Official Payslip</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {payoutHistory.map((payout) => {
                          const gross = Number(payout.base_salary || payout.basic_salary || 0) + 
                                        Number(payout.overtime_pay || payout.others_earnings || 0) + 
                                        Number(payout.bonus || payout.incentive || 0) + 
                                        Number(payout.allowance || 0);
                          const deds = Number(payout.advance_deduction || payout.advance_repayment || 0) + 
                                       Number(payout.statutory_deductions || payout.paid_salary || 0) + 
                                       Number(payout.other_deductions || 0);
                          const net = Number(payout.net_pay != null ? payout.net_pay : (payout.net_salary != null ? payout.net_salary : payout.amount));
                          const payDate = payout.disbursed_at || payout.created_at;

                          return (
                            <tr key={payout.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <div className="font-mono font-bold text-slate-900">{payout.id}</div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {payDate ? new Date(payDate).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                                </div>
                              </td>
                              <td className="py-3.5 px-4 font-bold text-slate-800 whitespace-nowrap">
                                {payout.cycle || 'Monthly Settlement'}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <span className="font-mono font-bold text-slate-800">₹{gross.toLocaleString('en-IN')}.00</span>
                                <div className="text-[10px] text-emerald-600 font-mono">Base: ₹{(payout.basic_salary || payout.base_salary || 0).toLocaleString('en-IN')}</div>
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <span className="font-mono font-bold text-red-600">-₹{deds.toLocaleString('en-IN')}.00</span>
                                {Number(payout.advance_deduction || payout.advance_repayment || 0) > 0 && (
                                  <div className="text-[10px] text-red-500 font-mono">Adv: -₹{(payout.advance_deduction || payout.advance_repayment || 0).toLocaleString('en-IN')}</div>
                                )}
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap font-mono font-bold text-emerald-700 text-sm">
                                ₹{net.toLocaleString('en-IN')}.00
                              </td>
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-mono font-bold text-[10px] border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  {payout.status || 'PAID'}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedSlip(payout);
                                    setSlipModalOpen(true);
                                  }}
                                  className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  View Payslip
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="py-12 px-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                        <FileText className="w-6 h-6" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-800 mb-1">
                        No historical salary disbursements on record
                      </h3>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ------------------------------------------------------------- */}
      {/* OFFICIAL PRINTABLE PAYSLIP MODAL (FAITHFUL TO REFERENCE IMAGE) */}
      {/* ------------------------------------------------------------- */}
      {slipModalOpen && selectedSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl border border-slate-300 overflow-hidden my-auto max-h-[95vh] flex flex-col">
            {/* Modal Actions Bar (hidden on print) */}
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold font-mono tracking-wider uppercase">Official Monthly Payslip</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1 bg-[#0070ba] hover:bg-[#005da3] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1 bg-[#0070ba] hover:bg-[#005da3] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSlipModalOpen(false);
                    setSelectedSlip(null);
                  }}
                  className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Sheet Body (Strictly matching reference image layout) */}
            <div className="p-4 sm:p-8 bg-white overflow-y-auto flex-1 font-sans text-slate-900 text-xs">
              {/* Dynamic Company Header from Settings */}
              <div className="text-center space-y-1 mb-3">
                {organization?.logo_url && (
                  <div className="flex justify-center mb-1">
                    <img
                      src={organization.logo_url}
                      alt={organization?.name || 'Company Logo'}
                      className="h-12 max-w-[180px] object-contain"
                    />
                  </div>
                )}
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#002b80] uppercase">
                  {organization?.name || 'ARGUS TECHNOLOGIES'}
                </h1>
                <p className="text-[11px] sm:text-xs text-[#3b5998] font-medium max-w-xl mx-auto">
                  {organization?.address || 'Corporate Headquarters & Registered Office'}
                </p>
                {((organization?.phone) || (organization?.contact_email || organization?.email) || (organization?.website) || (organization?.gstin)) && (
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500 font-mono">
                    {(organization?.phone) && (
                      <span>Phone: <strong className="text-slate-700">{organization.phone}</strong></span>
                    )}
                    {(organization?.contact_email || organization?.email) && (
                      <span>Email: <strong className="text-slate-700">{organization.contact_email || organization.email}</strong></span>
                    )}
                    {organization?.website && (
                      <span>Web: <strong className="text-slate-700">{organization.website}</strong></span>
                    )}
                    {organization?.gstin && (
                      <span>GSTIN: <strong className="text-slate-700">{organization.gstin}</strong></span>
                    )}
                  </div>
                )}
                <h2 className="text-sm font-bold text-slate-900 pt-1">
                  Monthly Payslip
                </h2>
              </div>

              {/* Solid Blue PAYSLIP Title Bar */}
              <div className="bg-[#0070ba] text-white font-extrabold text-center py-1.5 tracking-wider text-sm uppercase shadow-sm">
                PAYSLIP
              </div>

              {/* Two-Column Metadata Table */}
              <div className="border border-slate-300 divide-y divide-slate-300 text-xs">
                {/* Row 1 */}
                <div className="grid grid-cols-12 divide-x divide-slate-300">
                  <div className="col-span-3 p-2 bg-slate-50/70 font-semibold text-slate-700">Employee Name</div>
                  <div className="col-span-3 p-2 font-bold text-slate-900">
                    {selectedSlip.employee_name || `${selectedEmployee?.first_name || ''} ${selectedEmployee?.last_name || ''}`.trim()}
                  </div>
                  <div className="col-span-3 p-2 bg-slate-50/70 font-semibold text-slate-700">Hours Salary</div>
                  <div className="col-span-3 p-2 font-mono font-bold text-slate-900">
                    ₹{selectedSlip.hours_salary != null ? selectedSlip.hours_salary : (selectedSlip.hourly_rate != null ? selectedSlip.hourly_rate : effectiveHourlyRate)}
                  </div>
                </div>

                {/* Row 2 */}
                <div className="grid grid-cols-12 divide-x divide-slate-300">
                  <div className="col-span-3 p-2 bg-slate-50/70 font-semibold text-slate-700">Employee ID</div>
                  <div className="col-span-3 p-2 font-mono font-bold text-slate-900">
                    {selectedSlip.aadhar_number || selectedEmployee?.aadhar_number || selectedSlip.employee_code || selectedEmployee?.employee_code || 'EMP'}
                  </div>
                  <div className="col-span-3 p-2 bg-slate-50/70 font-semibold text-slate-700">Day Salary</div>
                  <div className="col-span-3 p-2 font-mono font-bold text-slate-900">
                    ₹{selectedSlip.day_salary != null ? selectedSlip.day_salary : effectiveDailyRate}
                  </div>
                </div>

                {/* Row 3 */}
                <div className="grid grid-cols-12 divide-x divide-slate-300">
                  <div className="col-span-3 p-2 bg-slate-50/70 font-semibold text-slate-700">Designation</div>
                  <div className="col-span-3 p-2 font-bold text-slate-900">
                    {selectedSlip.designation || selectedEmployee?.designation || selectedEmployee?.department || 'Production'}
                  </div>
                  <div className="col-span-3 p-2 bg-slate-50/70 font-semibold text-slate-700">Half Day Salary</div>
                  <div className="col-span-3 p-2 font-mono font-bold text-slate-900">
                    ₹{selectedSlip.half_day_salary != null ? selectedSlip.half_day_salary : effectiveHalfDaySalary}
                  </div>
                </div>

                {/* Row 4 */}
                <div className="grid grid-cols-12 divide-x divide-slate-300">
                  <div className="col-span-3 p-2 bg-slate-50/70 font-semibold text-slate-700">Phone Number</div>
                  <div className="col-span-3 p-2 font-mono font-bold text-slate-900">
                    {selectedSlip.phone || selectedEmployee?.phone || '—'}
                  </div>
                  <div className="col-span-3 p-2 bg-slate-50/70 font-semibold text-slate-700">Working Days</div>
                  <div className="col-span-3 p-2 font-bold text-slate-900">
                    {selectedSlip.working_days != null ? selectedSlip.working_days : workingDaysCount}
                  </div>
                </div>

                {/* Row 5 */}
                <div className="grid grid-cols-12 divide-x divide-slate-300">
                  <div className="col-span-3 p-2 bg-slate-50/70 font-semibold text-slate-700">Year &amp; Month</div>
                  <div className="col-span-3 p-2 font-mono font-bold text-slate-900">
                    {selectedSlip.cycle_code || selectedSlip.cycle || selectedCycle}
                  </div>
                  <div className="col-span-3 p-2 bg-slate-50/70 font-semibold text-slate-700">Leave Days</div>
                  <div className="col-span-3 p-2 font-bold text-slate-900">
                    {selectedSlip.leave_days != null ? selectedSlip.leave_days : leaveDaysCount}
                  </div>
                </div>

                {/* Row 6 */}
                <div className="grid grid-cols-12 divide-x divide-slate-300">
                  <div className="col-span-3 p-2 bg-slate-50/70 font-semibold text-slate-700">Total Working Hours</div>
                  <div className="col-span-3 p-2 font-mono font-bold text-slate-900">
                    {selectedSlip.total_working_hours_formatted || (selectedSlip.logged_hours != null ? `${Math.floor(selectedSlip.logged_hours)}:${String(Math.round((selectedSlip.logged_hours % 1) * 60)).padStart(2, '0')}` : `${Math.floor(totalLoggedHours)}:${String(Math.round((totalLoggedHours % 1) * 60)).padStart(2, '0')}`)}
                  </div>
                  <div className="col-span-3 p-2 bg-slate-50/70 font-semibold text-slate-700">Total Days of this Month</div>
                  <div className="col-span-3 p-2 font-bold text-slate-900">
                    {selectedSlip.total_days_of_month || 30}
                  </div>
                </div>
              </div>

              {/* EARNINGS vs DEDUCTION Table */}
              <div className="border-x border-b border-slate-300 divide-y divide-slate-300 text-xs">
                {/* Headers */}
                <div className="grid grid-cols-12 divide-x divide-slate-300 bg-[#003870] text-white font-extrabold text-center uppercase tracking-wider text-[11px]">
                  <div className="col-span-6 py-2">EARNINGS</div>
                  <div className="col-span-6 py-2">DEDUCTION</div>
                </div>

                {/* Row 1 */}
                <div className="grid grid-cols-12 divide-x divide-slate-300">
                  <div className="col-span-4 p-2 font-medium text-slate-700">Basic Salary</div>
                  <div className="col-span-2 p-2 font-mono font-bold text-slate-900 text-right">
                    ₹{selectedSlip.basic_salary != null ? selectedSlip.basic_salary : (selectedSlip.base_salary != null ? selectedSlip.base_salary : earnedBasePay)}
                  </div>
                  <div className="col-span-4 p-2 font-medium text-slate-700">Paid Salary</div>
                  <div className="col-span-2 p-2 font-mono font-bold text-slate-900 text-right">
                    ₹{selectedSlip.paid_salary != null ? selectedSlip.paid_salary : (selectedSlip.statutory_deductions != null ? selectedSlip.statutory_deductions : numStatutoryDeductions)}
                  </div>
                </div>

                {/* Row 2 */}
                <div className="grid grid-cols-12 divide-x divide-slate-300">
                  <div className="col-span-4 p-2 font-medium text-slate-700">Allowance</div>
                  <div className="col-span-2 p-2 font-mono font-bold text-slate-900 text-right">
                    ₹{selectedSlip.allowance != null ? selectedSlip.allowance : totalAllowance}
                  </div>
                  <div className="col-span-4 p-2 font-medium text-slate-700">Advance Repayment</div>
                  <div className="col-span-2 p-2 font-mono font-bold text-slate-900 text-right">
                    ₹{selectedSlip.advance_repayment != null ? selectedSlip.advance_repayment : (selectedSlip.advance_deduction != null ? selectedSlip.advance_deduction : numAdvanceDeduction)}
                  </div>
                </div>

                {/* Row 3 */}
                <div className="grid grid-cols-12 divide-x divide-slate-300">
                  <div className="col-span-4 p-2 font-medium text-slate-700">Incentive</div>
                  <div className="col-span-2 p-2 font-mono font-bold text-slate-900 text-right">
                    ₹{selectedSlip.incentive != null ? selectedSlip.incentive : (selectedSlip.bonus != null ? selectedSlip.bonus : totalIncentive)}
                  </div>
                  <div className="col-span-4 p-2 font-medium text-slate-700">Other Deductions</div>
                  <div className="col-span-2 p-2 font-mono font-bold text-slate-900 text-right">
                    ₹{selectedSlip.other_deductions != null ? selectedSlip.other_deductions : manualDeductions}
                  </div>
                </div>

                {/* Row 4 */}
                <div className="grid grid-cols-12 divide-x divide-slate-300">
                  <div className="col-span-4 p-2 font-medium text-slate-700">Others Earnings</div>
                  <div className="col-span-2 p-2 font-mono font-bold text-slate-900 text-right">
                    ₹{selectedSlip.others_earnings != null ? selectedSlip.others_earnings : (selectedSlip.overtime_pay != null ? selectedSlip.overtime_pay : overtimePay)}
                  </div>
                  <div className="col-span-4 p-2 bg-slate-50/30"></div>
                  <div className="col-span-2 p-2 bg-slate-50/30"></div>
                </div>

                {/* Summary Row 1: TOTAL EARNINGS */}
                <div className="grid grid-cols-12 divide-x divide-slate-300 bg-slate-50/80">
                  <div className="col-span-6 p-2 font-extrabold text-slate-900 uppercase">
                    TOTAL EARNINGS
                  </div>
                  <div className="col-span-6 p-2 font-mono font-extrabold text-slate-900 text-left pl-3">
                    ₹{selectedSlip.total_earnings != null ? selectedSlip.total_earnings : grossPay}
                  </div>
                </div>

                {/* Summary Row 2: TOTAL DEDUCTION */}
                <div className="grid grid-cols-12 divide-x divide-slate-300 bg-slate-50/80">
                  <div className="col-span-6 p-2 font-extrabold text-slate-900 uppercase">
                    TOTAL DEDUCTION
                  </div>
                  <div className="col-span-6 p-2 font-mono font-extrabold text-slate-900 text-left pl-3">
                    ₹{selectedSlip.total_deductions != null ? selectedSlip.total_deductions : totalDeductions}
                  </div>
                </div>
              </div>

              {/* Large NET PAY Box */}
              <div className="border-x border-b border-slate-300 p-3 text-center bg-slate-50/40">
                <div className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-mono">
                  NET PAY : ₹{selectedSlip.net_pay != null ? selectedSlip.net_pay : (selectedSlip.net_salary != null ? selectedSlip.net_salary : (selectedSlip.amount != null ? selectedSlip.amount : netTakeHome))}
                </div>
              </div>

              {/* Pale Yellow NET PAY IN WORDS Box */}
              <div className="border-x border-b border-[#e2d8b3] bg-[#fffbf0] p-3 text-center">
                <div className="text-xs sm:text-sm font-bold text-[#003870] font-sans">
                  NET PAY IN WORDS: {selectedSlip.net_pay_words || numberToIndianWords(selectedSlip.net_pay != null ? selectedSlip.net_pay : (selectedSlip.net_salary != null ? selectedSlip.net_salary : (selectedSlip.amount != null ? selectedSlip.amount : netTakeHome)))}
                </div>
              </div>

              {/* Auto-Generation & Legal Subtext */}
              <div className="border-x border-b border-slate-300 p-2 text-center text-[10px] text-slate-500 italic space-y-0.5 bg-white">
                <div>** Net Pay = Total Earnings - Total Deduction</div>
                <div>"Payslip is auto-generated and valid without the need for a signature."</div>
              </div>

              {/* Daily Punch Hours & Salary Breakdown Annexure */}
              {((selectedSlip.daily_breakdown && selectedSlip.daily_breakdown.length > 0) || (attendanceRecords && attendanceRecords.length > 0)) && (
                <div className="border-x border-b border-slate-300">
                  <div className="bg-[#003870] text-white px-3 py-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px] font-extrabold uppercase tracking-wider">
                    <span>DAILY PUNCH HOURS &amp; WAGE BREAKDOWN ANNEXURE</span>
                    <span className="text-[10px] font-mono text-blue-200 normal-case">
                      Formula: {selectedSlip.calculation_basis || calculationBasis}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100/90 text-[10px] font-mono uppercase text-slate-700 font-bold border-b border-slate-300">
                          <th className="py-2 px-3">Date &amp; Day</th>
                          <th className="py-2 px-3">Shift Timing</th>
                          <th className="py-2 px-3 font-mono">Punch-In</th>
                          <th className="py-2 px-3 font-mono">Punch-Out</th>
                          <th className="py-2 px-3 text-right font-mono">Logged Hours</th>
                          <th className="py-2 px-3 text-right">Applied Rate</th>
                          <th className="py-2 px-3 text-right font-mono font-bold">Daily Earned (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {(selectedSlip.daily_breakdown && selectedSlip.daily_breakdown.length > 0
                          ? selectedSlip.daily_breakdown
                          : (attendanceRecords || []).map(r => {
                              const hrs = extractHours(r);
                              const manualSal = (r.mode === 'Salary' || (r.manual_salary != null && Number(r.manual_salary) > 0)) ? Number(r.manual_salary) : 0;
                              let earned = 0;
                              let rateLabel = '';
                              if (manualSal > 0) {
                                earned = manualSal;
                                rateLabel = 'Manual Day Wage';
                              } else if (empType === 'DAILY_WAGE') {
                                const isHalf = r.status === 'HALF_DAY';
                                earned = isHalf ? effectiveHalfDaySalary : effectiveDailyRate;
                                rateLabel = isHalf ? `₹${effectiveHalfDaySalary} (Half-Day)` : `₹${effectiveDailyRate}`;
                              } else {
                                earned = Math.round(hrs * effectiveHourlyRate);
                                rateLabel = `₹${effectiveHourlyRate}/hr`;
                              }
                              return {
                                date: r.date,
                                shift: r.shift || (r.shift_start ? `${r.shift_start} - ${r.shift_end}` : 'Regular Shift'),
                                check_in_time: r.check_in_time || (r.check_in ? strTime(r.check_in) : '—'),
                                check_out_time: r.check_out_time || (r.check_out ? strTime(r.check_out) : '—'),
                                hours: hrs,
                                rate_label: rateLabel,
                                daily_earned: earned
                              };
                            })
                        ).map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-3 font-bold text-slate-800 whitespace-nowrap">
                              {item.date} {item.day_name && <span className="text-[10px] text-slate-400 font-normal">({item.day_name.slice(0, 3)})</span>}
                            </td>
                            <td className="py-1.5 px-3 text-slate-600">
                              {item.shift || 'Regular Shift'}
                            </td>
                            <td className="py-1.5 px-3 font-mono font-bold text-blue-600">
                              {item.check_in_time || '—'}
                            </td>
                            <td className="py-1.5 px-3 font-mono font-bold text-slate-700">
                              {item.check_out_time || '—'}
                            </td>
                            <td className="py-1.5 px-3 font-mono font-bold text-slate-900 text-right">
                              {item.hours != null ? `${Number(item.hours).toFixed(1)}h` : '0.0h'}
                            </td>
                            <td className="py-1.5 px-3 text-right text-slate-600 text-[10px] font-mono">
                              {item.rate_label}
                            </td>
                            <td className="py-1.5 px-3 font-mono font-bold text-emerald-700 text-right">
                              ₹{Number(item.daily_earned || 0).toLocaleString('en-IN')}.00
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-bold">
                        <tr>
                          <td colSpan={4} className="py-2 px-3 uppercase text-[10px] text-slate-600 font-mono">
                            Subtotal Punch Hours &amp; Earned Wage:
                          </td>
                          <td className="py-2 px-3 font-mono text-right text-slate-900">
                            {selectedSlip.daily_breakdown && selectedSlip.daily_breakdown.length > 0
                              ? selectedSlip.daily_breakdown.reduce((acc, i) => acc + (Number(i.hours) || 0), 0).toFixed(1)
                              : totalLoggedHours.toFixed(1)}h
                          </td>
                          <td></td>
                          <td className="py-2 px-3 font-mono text-right text-emerald-800 font-black">
                            ₹{Number(selectedSlip.basic_salary != null ? selectedSlip.basic_salary : (selectedSlip.base_salary != null ? selectedSlip.base_salary : earnedBasePay)).toLocaleString('en-IN')}.00
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Dark Slate/Blue Footer Bar */}
              <div className="bg-[#38536e] text-white text-center py-2 text-[11px] font-bold tracking-wide">
                ** This document has been automatically generated by ARGUS **
              </div>

              {/* Bottom Action Buttons (Hidden during printing) */}
              <div className="flex justify-center gap-3 pt-5 print:hidden">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-5 py-2 bg-[#0070ba] hover:bg-[#005da3] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-5 py-2 bg-[#0070ba] hover:bg-[#005da3] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSlipModalOpen(false);
                    setSelectedSlip(null);
                  }}
                  className="px-5 py-2 bg-[#0070ba] hover:bg-[#005da3] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function strTime(isoOrTimeStr) {
  if (!isoOrTimeStr) return '--:--';
  if (typeof isoOrTimeStr === 'string' && !isoOrTimeStr.includes('T')) {
    return isoOrTimeStr;
  }
  try {
    const d = new Date(isoOrTimeStr);
    if (isNaN(d.getTime())) return String(isoOrTimeStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return String(isoOrTimeStr);
  }
}
