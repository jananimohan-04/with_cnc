import { supabase } from './supabaseClient';
import type { LeaveRequest } from '../types/payment.types';

export interface OverallLeaveType {
  id: string;
  name: string;
  count: number;
  type: 'Days - Leave' | 'Hours - Permission';
}

export interface EmployeeCustomLeave {
  id: string;
  name: string;
  quota: number;
  type: 'Days - Leave' | 'Hours - Permission';
}

export interface PaidHoliday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
}

export const leaveService = {
  async getLeaves(companyId: string): Promise<LeaveRequest[]> {
    if (!companyId) return [];
    const { data, error } = await supabase
      .from('bi_attendance_leaves')
      .select('*, employee:bi_attendance_employees(first_name, last_name, employee_code)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[leaveService] getLeaves error:', error.message);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      company_id: row.company_id,
      employee_id: row.employee_id,
      employee_name: row.employee ? `${row.employee.first_name || ''} ${row.employee.last_name || ''}`.trim() : 'Staff Member',
      leave_type: row.leave_type || 'Casual Leave',
      start_date: row.start_date,
      end_date: row.end_date,
      days: Number(row.days) || 1,
      reason: row.reason || '',
      status: row.status || 'Pending',
      approved_by: row.approved_by || null,
      created_at: row.created_at,
    }));
  },

  async createLeaveRequest(companyId: string, leave: Partial<LeaveRequest>): Promise<LeaveRequest> {
    const payload = {
      company_id: companyId,
      employee_id: leave.employee_id,
      leave_type: leave.leave_type || 'Casual Leave',
      start_date: leave.start_date,
      end_date: leave.end_date,
      days: Number(leave.days) || 1,
      reason: leave.reason || '',
      status: 'Pending',
    };

    const { data, error } = await supabase
      .from('bi_attendance_leaves')
      .insert(payload)
      .select('*, employee:bi_attendance_employees(first_name, last_name, employee_code)')
      .single();

    if (error) throw error;
    return {
      ...data,
      employee_name: data.employee ? `${data.employee.first_name || ''} ${data.employee.last_name || ''}`.trim() : 'Staff Member',
    };
  },

  async updateLeaveStatus(id: string, status: 'Approved' | 'Rejected', approvedBy: string): Promise<boolean> {
    const { error } = await supabase
      .from('bi_attendance_leaves')
      .update({
        status,
        approved_by: approvedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
    return true;
  },

  async deleteLeaveRequest(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('bi_attendance_leaves')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  },

  async bulkDeleteLeaves(ids: string[]): Promise<boolean> {
    if (!ids.length) return true;
    const { error } = await supabase
      .from('bi_attendance_leaves')
      .delete()
      .in('id', ids);

    if (error) throw error;
    return true;
  },

  // ================= 1. Company Overall Leaves Policy =================
  async getCompanyOverallLeaves(companyId: string): Promise<OverallLeaveType[]> {
    if (!companyId) return [];
    try {
      const { data, error } = await supabase
        .from('bi_attendance_settings')
        .select('org_profile')
        .eq('company_id', companyId)
        .maybeSingle();

      if (!error && data?.org_profile?.company_overall_leaves) {
        const leaves = data.org_profile.company_overall_leaves as OverallLeaveType[];
        localStorage.setItem(`att_overall_leaves_${companyId}`, JSON.stringify(leaves));
        return leaves;
      }
    } catch (e) {
      console.warn('[leaveService] getCompanyOverallLeaves error:', e);
    }

    // Local fallback
    try {
      const cached = localStorage.getItem(`att_overall_leaves_${companyId}`);
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  },

  async saveCompanyOverallLeaves(companyId: string, leaves: OverallLeaveType[]): Promise<boolean> {
    if (!companyId) return false;
    localStorage.setItem(`att_overall_leaves_${companyId}`, JSON.stringify(leaves));

    try {
      const { data: existing } = await supabase
        .from('bi_attendance_settings')
        .select('id, org_profile')
        .eq('company_id', companyId)
        .maybeSingle();

      const updatedOrgProfile = {
        ...(existing?.org_profile || {}),
        company_overall_leaves: leaves,
      };

      if (existing?.id) {
        await supabase
          .from('bi_attendance_settings')
          .update({
            org_profile: updatedOrgProfile,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('bi_attendance_settings')
          .insert({
            company_id: companyId,
            org_profile: updatedOrgProfile,
          });
      }
      return true;
    } catch (e) {
      console.warn('[leaveService] saveCompanyOverallLeaves error:', e);
      return true; // cached locally
    }
  },

  // ================= 2. Employee Custom Leaves Quota =================
  async getEmployeeCustomLeaves(employeeId: string): Promise<EmployeeCustomLeave[]> {
    if (!employeeId) return [];
    try {
      const { data, error } = await supabase
        .from('bi_attendance_employees')
        .select('profile')
        .eq('id', employeeId)
        .maybeSingle();

      if (!error && data?.profile?.custom_leaves) {
        const list = data.profile.custom_leaves as EmployeeCustomLeave[];
        localStorage.setItem(`att_emp_custom_leaves_${employeeId}`, JSON.stringify(list));
        return list;
      }
    } catch (e) {
      console.warn('[leaveService] getEmployeeCustomLeaves error:', e);
    }

    try {
      const cached = localStorage.getItem(`att_emp_custom_leaves_${employeeId}`);
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  },

  async saveEmployeeCustomLeaves(employeeId: string, customLeaves: EmployeeCustomLeave[]): Promise<boolean> {
    if (!employeeId) return false;
    localStorage.setItem(`att_emp_custom_leaves_${employeeId}`, JSON.stringify(customLeaves));

    try {
      const { data: existing } = await supabase
        .from('bi_attendance_employees')
        .select('profile')
        .eq('id', employeeId)
        .maybeSingle();

      const updatedProfile = {
        ...(existing?.profile || {}),
        custom_leaves: customLeaves,
      };

      await supabase
        .from('bi_attendance_employees')
        .update({
          profile: updatedProfile,
          updated_at: new Date().toISOString(),
        })
        .eq('id', employeeId);

      return true;
    } catch (e) {
      console.warn('[leaveService] saveEmployeeCustomLeaves error:', e);
      return true;
    }
  },

  // ================= 3. Company Paid Holidays Calendar =================
  async getPaidHolidays(companyId: string): Promise<PaidHoliday[]> {
    if (!companyId) return [];
    try {
      const { data, error } = await supabase
        .from('bi_attendance_settings')
        .select('org_profile')
        .eq('company_id', companyId)
        .maybeSingle();

      if (!error && data?.org_profile?.paid_holidays) {
        const hols = data.org_profile.paid_holidays as PaidHoliday[];
        localStorage.setItem(`att_paid_holidays_${companyId}`, JSON.stringify(hols));
        return hols;
      }
    } catch (e) {
      console.warn('[leaveService] getPaidHolidays error:', e);
    }

    try {
      const cached = localStorage.getItem(`att_paid_holidays_${companyId}`);
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  },

  async savePaidHoliday(companyId: string, holiday: { date: string; name: string }): Promise<PaidHoliday[]> {
    if (!companyId) return [];
    const current = await this.getPaidHolidays(companyId);
    const existingIndex = current.findIndex((h) => h.date === holiday.date);
    let updated: PaidHoliday[];

    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = { ...updated[existingIndex], name: holiday.name };
    } else {
      updated = [
        ...current,
        { id: `hol_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`, date: holiday.date, name: holiday.name },
      ];
    }

    updated.sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem(`att_paid_holidays_${companyId}`, JSON.stringify(updated));

    try {
      const { data: existing } = await supabase
        .from('bi_attendance_settings')
        .select('id, org_profile')
        .eq('company_id', companyId)
        .maybeSingle();

      const updatedOrgProfile = {
        ...(existing?.org_profile || {}),
        paid_holidays: updated,
      };

      if (existing?.id) {
        await supabase
          .from('bi_attendance_settings')
          .update({
            org_profile: updatedOrgProfile,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      }
    } catch (e) {
      console.warn('[leaveService] savePaidHoliday error:', e);
    }

    return updated;
  },

  async deletePaidHoliday(companyId: string, holidayId: string): Promise<PaidHoliday[]> {
    if (!companyId) return [];
    const current = await this.getPaidHolidays(companyId);
    const updated = current.filter((h) => h.id !== holidayId);
    localStorage.setItem(`att_paid_holidays_${companyId}`, JSON.stringify(updated));

    try {
      const { data: existing } = await supabase
        .from('bi_attendance_settings')
        .select('id, org_profile')
        .eq('company_id', companyId)
        .maybeSingle();

      const updatedOrgProfile = {
        ...(existing?.org_profile || {}),
        paid_holidays: updated,
      };

      if (existing?.id) {
        await supabase
          .from('bi_attendance_settings')
          .update({
            org_profile: updatedOrgProfile,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      }
    } catch (e) {
      console.warn('[leaveService] deletePaidHoliday error:', e);
    }

    return updated;
  },
};
