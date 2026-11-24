import { supabase } from './supabaseClient';
import type { AdvanceRecord, PaymentRecord, BalanceSummary } from '../types/payment.types';

export const paymentService = {
  async getAdvances(companyId: string): Promise<AdvanceRecord[]> {
    if (!companyId) return [];
    const { data, error } = await supabase
      .from('bi_attendance_advances')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[paymentService] getAdvances warning:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      company_id: row.company_id,
      employee_id: row.employee_id,
      employee_name: row.doc?.employee_name || 'Staff Member',
      employee_code: row.doc?.employee_code || '',
      amount: Number(row.doc?.amount) || 0,
      advance_date: row.doc?.advance_date || row.created_at?.slice(0, 10),
      reason: row.doc?.reason || 'Personal Advance',
      monthly_deduction: Number(row.doc?.monthly_deduction) || 0,
      repaid_amount: Number(row.doc?.repaid_amount) || 0,
      remaining_balance: Number(row.doc?.remaining_balance) || Number(row.doc?.amount) || 0,
      status: row.doc?.status || 'ACTIVE',
      approved_by: row.doc?.approved_by || 'Admin',
      created_at: row.created_at,
    }));
  },

  async createAdvance(companyId: string, advance: Partial<AdvanceRecord>): Promise<AdvanceRecord> {
    if (!advance.employee_id) throw new Error('Employee ID is required');
    const id = `ADV-${Date.now().toString(36).toUpperCase()}`;
    const doc = {
      employee_id: advance.employee_id,
      employee_name: advance.employee_name || 'Staff Member',
      employee_code: advance.employee_code || '',
      amount: Number(advance.amount) || 0,
      advance_date: advance.advance_date || new Date().toISOString().slice(0, 10),
      reason: advance.reason || 'Salary Advance',
      monthly_deduction: Number(advance.monthly_deduction) || 0,
      repaid_amount: 0,
      remaining_balance: Number(advance.amount) || 0,
      status: 'ACTIVE' as const,
      approved_by: advance.approved_by || 'Admin',
    };

    const { data, error } = await supabase
      .from('bi_attendance_advances')
      .insert({
        id,
        company_id: companyId,
        employee_id: advance.employee_id,
        doc,
      })
      .select()
      .single();

    if (error) throw error;
    return {
      ...doc,
      id: data.id,
      company_id: data.company_id,
      employee_id: data.employee_id,
      created_at: data.created_at,
    };
  },

  async getPayments(companyId: string): Promise<PaymentRecord[]> {
    if (!companyId) return [];
    const { data, error } = await supabase
      .from('bi_attendance_financial_entries')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[paymentService] getPayments warning:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      company_id: row.company_id,
      employee_id: row.employee_id,
      employee_name: row.doc?.employee_name || 'Staff Member',
      employee_code: row.doc?.employee_code || '',
      amount: Number(row.doc?.amount) || 0,
      payment_date: row.doc?.payment_date || row.created_at?.slice(0, 10),
      payment_type: row.doc?.payment_type || 'SALARY',
      payment_mode: row.doc?.payment_mode || 'BANK_TRANSFER',
      reference_no: row.doc?.reference_no || '',
      notes: row.doc?.notes || '',
      created_at: row.created_at,
    }));
  },

  async createPayment(companyId: string, payment: Partial<PaymentRecord>): Promise<PaymentRecord> {
    if (!payment.employee_id) throw new Error('Employee ID is required');
    const id = `PAY-${Date.now().toString(36).toUpperCase()}`;
    const doc = {
      employee_id: payment.employee_id,
      employee_name: payment.employee_name || 'Staff Member',
      employee_code: payment.employee_code || '',
      amount: Number(payment.amount) || 0,
      payment_date: payment.payment_date || new Date().toISOString().slice(0, 10),
      payment_type: (payment.payment_type || 'SALARY') as PaymentRecord['payment_type'],
      payment_mode: (payment.payment_mode || 'BANK_TRANSFER') as PaymentRecord['payment_mode'],
      reference_no: payment.reference_no || '',
      notes: payment.notes || '',
    };

    const { data, error } = await supabase
      .from('bi_attendance_financial_entries')
      .insert({
        id,
        company_id: companyId,
        employee_id: payment.employee_id,
        doc,
      })
      .select()
      .single();

    if (error) throw error;
    return {
      ...doc,
      id: data.id,
      company_id: data.company_id,
      employee_id: data.employee_id,
      created_at: data.created_at,
    };
  },

  async getBalanceSummary(companyId: string): Promise<BalanceSummary[]> {
    const [empRes, advRes, payRes] = await Promise.all([
      supabase.from('bi_attendance_employees').select('id, employee_code, first_name, last_name, department, profile').eq('company_id', companyId),
      supabase.from('bi_attendance_advances').select('*').eq('company_id', companyId),
      supabase.from('bi_attendance_financial_entries').select('*').eq('company_id', companyId),
    ]);

    const employees = empRes.data || [];
    const advances = advRes.data || [];
    const payments = payRes.data || [];

    return employees.map((emp) => {
      const empName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || emp.employee_code;
      const baseSalary = Number(emp.profile?.base_salary) || 25000;

      const empAdvances = advances.filter((a) => a.employee_id === emp.id || a.doc?.employee_id === emp.id);
      const totalAdv = empAdvances.reduce((sum, a) => sum + (Number(a.doc?.amount) || 0), 0);
      const repaidAdv = empAdvances.reduce((sum, a) => sum + (Number(a.doc?.repaid_amount) || 0), 0);
      const currentAdvBalance = totalAdv - repaidAdv;

      const empPayments = payments.filter((p) => p.employee_id === emp.id || p.doc?.employee_id === emp.id);
      const totalPaid = empPayments.reduce((sum, p) => sum + (Number(p.doc?.amount) || 0), 0);

      const pendingSalary = Math.max(0, baseSalary - totalPaid);
      const netBalance = pendingSalary - currentAdvBalance;

      return {
        employee_id: emp.id,
        employee_name: empName,
        employee_code: emp.employee_code,
        department: emp.department || 'General',
        base_salary: baseSalary,
        total_advances: totalAdv,
        repaid_advances: repaidAdv,
        current_advance_balance: currentAdvBalance,
        pending_salary_payable: pendingSalary,
        net_balance: netBalance,
      };
    });
  },
};
