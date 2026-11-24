export interface AdvanceRecord {
  id: string;
  company_id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  amount: number;
  advance_date: string;
  reason: string;
  monthly_deduction: number;
  repaid_amount: number;
  remaining_balance: number;
  status: 'ACTIVE' | 'SETTLED' | 'CANCELLED';
  approved_by?: string;
  created_at: string;
}

export interface PaymentRecord {
  id: string;
  company_id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  amount: number;
  payment_date: string;
  payment_type: 'SALARY' | 'ADVANCE' | 'INCENTIVE' | 'BONUS' | 'REIMBURSEMENT';
  payment_mode: 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | 'UPI';
  reference_no?: string;
  notes?: string;
  created_at: string;
}

export interface BalanceSummary {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department: string;
  base_salary: number;
  total_advances: number;
  repaid_advances: number;
  current_advance_balance: number;
  pending_salary_payable: number;
  net_balance: number;
}

export interface PayslipData {
  id: string;
  company_id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department: string;
  designation: string;
  month: string;
  year: number;
  total_working_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  half_days: number;
  earnings: {
    basic: number;
    da: number;
    hra: number;
    conveyance: number;
    special_allowance: number;
    overtime_pay: number;
    gross_earnings: number;
  };
  deductions: {
    pf: number;
    esi: number;
    advance_deduction: number;
    professional_tax: number;
    total_deductions: number;
  };
  net_pay: number;
  net_pay_in_words: string;
}

export interface LeaveRequest {
  id: string;
  company_id: string;
  employee_id: string;
  employee_name?: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approved_by?: string;
  created_at: string;
}
