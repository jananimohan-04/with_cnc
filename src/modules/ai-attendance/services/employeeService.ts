import { supabase } from './supabaseClient';
import type { AttendanceEmployee } from '../types/employee.types';

export const employeeService = {
  async getEmployees(companyId: string): Promise<AttendanceEmployee[]> {
    if (!companyId) return [];
    const { data, error } = await supabase
      .from('bi_attendance_employees')
      .select('*')
      .eq('company_id', companyId)
      .order('first_name', { ascending: true });

    if (error) {
      console.error('[employeeService] getEmployees error:', error);
      throw error;
    }

    return (data || []).map((row) => ({
      ...row,
      employee_name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.employee_code,
    })) as AttendanceEmployee[];
  },

  async getEmployeeById(id: string): Promise<AttendanceEmployee | null> {
    const { data, error } = await supabase
      .from('bi_attendance_employees')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[employeeService] getEmployeeById error:', error);
      throw error;
    }
    if (!data) return null;

    return {
      ...data,
      employee_name: `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.employee_code,
    } as AttendanceEmployee;
  },

  async createEmployee(employee: Partial<AttendanceEmployee>): Promise<AttendanceEmployee> {
    const payload = {
      company_id: employee.company_id,
      employee_code: employee.employee_code,
      first_name: employee.first_name,
      last_name: employee.last_name || '',
      email: employee.email || null,
      phone: employee.phone || null,
      department: employee.department || 'General',
      designation: employee.designation || 'Staff',
      employment_type: employee.employment_type || 'FULL_TIME',
      shift_type: employee.shift_type || 'FIXED',
      shift_start: employee.shift_start || '09:00',
      shift_end: employee.shift_end || '18:00',
      hourly_rate: Number(employee.hourly_rate) || 250,
      is_active: employee.is_active !== false,
      biometric_consent: employee.biometric_consent || false,
      avatar_url: employee.avatar_url || null,
      face_embeddings: employee.face_embeddings || [],
      profile: employee.profile || {},
    };

    const { data, error } = await supabase
      .from('bi_attendance_employees')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[employeeService] createEmployee error:', error);
      throw error;
    }

    return {
      ...data,
      employee_name: `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.employee_code,
    } as AttendanceEmployee;
  },

  async updateEmployee(id: string, updates: Partial<AttendanceEmployee>): Promise<AttendanceEmployee> {
    const { employee_name, created_at, updated_at, ...cleanUpdates } = updates as any;
    const { data, error } = await supabase
      .from('bi_attendance_employees')
      .update({
        ...cleanUpdates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[employeeService] updateEmployee error:', error);
      throw error;
    }

    return {
      ...data,
      employee_name: `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.employee_code,
    } as AttendanceEmployee;
  },

  async deleteEmployee(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('bi_attendance_employees')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[employeeService] deleteEmployee error:', error);
      throw error;
    }
    return true;
  },

  async saveFaceEmbeddings(id: string, embeddings: number[][]): Promise<boolean> {
    const { error } = await supabase
      .from('bi_attendance_employees')
      .update({
        face_embeddings: embeddings,
        enrolled_samples_count: embeddings.length,
        biometric_consent: true,
        consent_timestamp: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('[employeeService] saveFaceEmbeddings error:', error);
      throw error;
    }
    return true;
  },
};
