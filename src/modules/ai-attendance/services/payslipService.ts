import { supabase } from './supabaseClient';
import type { PayslipData } from '../types/payment.types';

export function numberToIndianWords(n: number): string {
  if (n === null || n === undefined || isNaN(n)) return 'Zero Rupees Only';
  const val = Math.round(Number(n));
  if (val < 0) return `Minus ${numberToIndianWords(-val)}`;
  if (val === 0) return 'Zero Rupees Only';

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const two = (x: number): string => (x < 20 ? units[x] : tens[Math.floor(x / 10)] + (x % 10 > 0 ? ' ' + units[x % 10] : ''));
  const three = (x: number): string => {
    let r = '';
    const h = Math.floor(x / 100);
    const rem = x % 100;
    if (h > 0) r += units[h] + ' Hundred';
    if (rem > 0) r += (h > 0 ? ' and ' : '') + two(rem);
    return r;
  };

  let words = '';
  let crore = Math.floor(val / 10000000);
  let rem = val % 10000000;
  let lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  let thousand = Math.floor(rem / 1000);
  rem = rem % 1000;

  if (crore > 0) words += two(crore) + ' Crore ';
  if (lakh > 0) words += two(lakh) + ' Lakh ';
  if (thousand > 0) words += two(thousand) + ' Thousand ';
  if (rem > 0) words += three(rem);

  return (words.trim() + ' Rupees Only');
}

export const payslipService = {
  async generatePayslip(
    companyId: string,
    employeeId: string,
    month: string,
    year: number
  ): Promise<PayslipData> {
    const { data: emp, error: empErr } = await supabase
      .from('bi_attendance_employees')
      .select('*')
      .eq('id', employeeId)
      .single();

    if (empErr || !emp) throw new Error('Employee not found');

    const empName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || emp.employee_code;
    const baseSalary = Number(emp.profile?.base_salary) || 25000;

    // Fetch attendance records for this month
    const monthNum = new Date(`${month} 1, ${year}`).getMonth() + 1;
    const padMonth = String(monthNum).padStart(2, '0');
    const startDate = `${year}-${padMonth}-01`;
    const lastDay = new Date(year, monthNum, 0).getDate();
    const endDate = `${year}-${padMonth}-${String(lastDay).padStart(2, '0')}`;

    const { data: records } = await supabase
      .from('bi_attendance_records')
      .select('*')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .gte('log_date', startDate)
      .lte('log_date', endDate);

    const recList = records || [];
    const presentDays = recList.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
    const halfDays = recList.filter((r) => r.status === 'HALF_DAY').length;
    const leaveDays = recList.filter((r) => r.status === 'ON_LEAVE').length;
    const effectivePresent = presentDays + halfDays * 0.5;
    const absentDays = Math.max(0, lastDay - effectivePresent - leaveDays);

    // Earnings calculation
    const basic = Math.round(baseSalary * 0.50);
    const da = Math.round(baseSalary * 0.15);
    const hra = Math.round(baseSalary * 0.20);
    const conveyance = Math.round(baseSalary * 0.10);
    const special = Math.round(baseSalary * 0.05);
    const grossEarnings = basic + da + hra + conveyance + special;

    // Deductions calculation
    const pf = Math.round(basic * 0.12);
    const esi = grossEarnings <= 21000 ? Math.round(grossEarnings * 0.0075) : 0;
    const pTax = 200;
    const advanceDeduction = 0;
    const totalDeductions = pf + esi + pTax + advanceDeduction;

    const netPay = Math.max(0, grossEarnings - totalDeductions);

    return {
      id: `PS-${year}${padMonth}-${emp.employee_code}`,
      company_id: companyId,
      employee_id: emp.id,
      employee_name: empName,
      employee_code: emp.employee_code,
      department: emp.department || 'General',
      designation: emp.designation || 'Staff',
      month,
      year,
      total_working_days: lastDay,
      present_days: presentDays,
      absent_days: absentDays,
      leave_days: leaveDays,
      half_days: halfDays,
      earnings: {
        basic,
        da,
        hra,
        conveyance,
        special_allowance: special,
        overtime_pay: 0,
        gross_earnings: grossEarnings,
      },
      deductions: {
        pf,
        esi,
        advance_deduction: advanceDeduction,
        professional_tax: pTax,
        total_deductions: totalDeductions,
      },
      net_pay: netPay,
      net_pay_in_words: numberToIndianWords(netPay),
    };
  },
};
