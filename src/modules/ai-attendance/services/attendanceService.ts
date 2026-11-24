import { supabase } from './supabaseClient';
import type { AttendanceRecord, AttendanceStats, PunchRecord } from '../types/attendance.types';

function getTodayIST(): string {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600000);
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, '0');
  const day = String(ist.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getNowTime12(): string {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600000);
  let h = ist.getHours();
  const m = String(ist.getMinutes()).padStart(2, '0');
  const s = String(ist.getSeconds()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${m}:${s} ${ampm}`;
}

export const attendanceService = {
  async getTodayStats(companyId: string): Promise<AttendanceStats> {
    if (!companyId) {
      return { totalEmployees: 0, presentToday: 0, absentToday: 0, presentPercent: 0, timeoutCount: 0, lateCount: 0, onLeaveCount: 0 };
    }

    const today = getTodayIST();

    const [empRes, recRes] = await Promise.all([
      supabase.from('bi_attendance_employees').select('id, is_active').eq('company_id', companyId).eq('is_active', true),
      supabase.from('bi_attendance_records').select('*').eq('company_id', companyId).eq('log_date', today),
    ]);

    const total = empRes.data?.length || 0;
    const records = recRes.data || [];

    const present = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'HALF_DAY').length;
    const late = records.filter((r) => r.status === 'LATE').length;
    const onLeave = records.filter((r) => r.status === 'ON_LEAVE').length;
    const absent = Math.max(0, total - present - onLeave);
    const presentPercent = total > 0 ? Math.round((present / total) * 100) : 0;
    const timeoutCount = records.filter((r) => r.is_currently_in === false && r.last_punch_out !== null).length;

    return {
      totalEmployees: total,
      presentToday: present,
      absentToday: absent,
      presentPercent,
      timeoutCount,
      lateCount: late,
      onLeaveCount: onLeave,
    };
  },

  async getAttendanceRecords(
    companyId: string,
    filters?: { startDate?: string; endDate?: string; status?: string; employeeId?: string }
  ): Promise<AttendanceRecord[]> {
    if (!companyId) return [];

    let query = supabase
      .from('bi_attendance_records')
      .select('*, employee:bi_attendance_employees(employee_code, first_name, last_name, department, designation)')
      .eq('company_id', companyId)
      .order('log_date', { ascending: false });

    if (filters?.startDate) {
      query = query.gte('log_date', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('log_date', filters.endDate);
    }
    if (filters?.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status);
    }
    if (filters?.employeeId) {
      query = query.eq('employee_id', filters.employeeId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[attendanceService] getAttendanceRecords error:', error);
      throw error;
    }

    return (data || []).map((r: any) => ({
      ...r,
      employee_name: r.employee ? `${r.employee.first_name || ''} ${r.employee.last_name || ''}`.trim() : 'Unknown Staff',
      employee_code: r.employee?.employee_code || '',
      department: r.employee?.department || 'General',
      designation: r.employee?.designation || 'Staff',
    })) as AttendanceRecord[];
  },

  async deleteAttendanceRecord(recordId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('bi_attendance_records')
        .delete()
        .eq('id', recordId);
      if (error) {
        console.warn('[attendanceService] deleteAttendanceRecord error:', error);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  async getLiveEntries(companyId: string): Promise<AttendanceRecord[]> {
    const today = getTodayIST();
    let query = supabase
      .from('bi_attendance_records')
      .select('*, employee:bi_attendance_employees(employee_code, first_name, last_name, department, designation)')
      .eq('company_id', companyId)
      .eq('log_date', today)
      .eq('is_currently_in', true)
      .order('first_punch_in', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((r: any) => ({
      ...r,
      employee_name: r.employee ? `${r.employee.first_name || ''} ${r.employee.last_name || ''}`.trim() : 'Unknown Staff',
      employee_code: r.employee?.employee_code || '',
      department: r.employee?.department || 'General',
      designation: r.employee?.designation || 'Staff',
    })) as AttendanceRecord[];
  },

  async getTimeoutEntries(companyId: string): Promise<AttendanceRecord[]> {
    const today = getTodayIST();
    let query = supabase
      .from('bi_attendance_records')
      .select('*, employee:bi_attendance_employees(employee_code, first_name, last_name, department, designation)')
      .eq('company_id', companyId)
      .eq('log_date', today)
      .eq('is_currently_in', false)
      .not('last_punch_out', 'is', null)
      .order('last_punch_out', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((r: any) => ({
      ...r,
      employee_name: r.employee ? `${r.employee.first_name || ''} ${r.employee.last_name || ''}`.trim() : 'Unknown Staff',
      employee_code: r.employee?.employee_code || '',
      department: r.employee?.department || 'General',
      designation: r.employee?.designation || 'Staff',
    })) as AttendanceRecord[];
  },

  async recordPunch(
    companyId: string,
    params: {
      employeeId: string;
      confidence?: number;
      kioskId?: string;
      latitude?: number;
      longitude?: number;
      verificationMode?: 'FACE_AI' | 'MANUAL' | 'KIOSK' | 'FIELD_GPS';
    }
  ): Promise<{ record: AttendanceRecord; action: 'CHECK_IN' | 'CHECK_OUT'; message: string }> {
    const today = getTodayIST();
    const nowIso = new Date().toISOString();
    const time12 = getNowTime12();

    const { data: existing } = await supabase
      .from('bi_attendance_records')
      .select('*')
      .eq('company_id', companyId)
      .eq('employee_id', params.employeeId)
      .eq('log_date', today)
      .maybeSingle();

    const punches: PunchRecord[] = (existing?.punches as PunchRecord[]) || [];
    const isIn = existing?.is_currently_in || false;
    const nextAction: 'CHECK_IN' | 'CHECK_OUT' = isIn ? 'CHECK_OUT' : 'CHECK_IN';

    punches.push({
      action: nextAction,
      time: time12,
      timestamp: nowIso,
      confidence: params.confidence,
      kiosk_id: params.kioskId || 'main-kiosk',
      latitude: params.latitude,
      longitude: params.longitude,
      verification_mode: params.verificationMode || 'FACE_AI',
    });

    let totalHours = existing?.total_hours || 0;
    let firstIn = existing?.first_punch_in || (nextAction === 'CHECK_IN' ? nowIso : null);
    let lastOut = existing?.last_punch_out;

    if (nextAction === 'CHECK_OUT') {
      lastOut = nowIso;
      if (firstIn) {
        const diffMs = new Date(nowIso).getTime() - new Date(firstIn).getTime();
        totalHours = Math.round((diffMs / (1000 * 3600)) * 100) / 100;
      }
    }

    const payload = {
      company_id: companyId,
      employee_id: params.employeeId,
      log_date: today,
      check_in_time: existing?.check_in_time || (nextAction === 'CHECK_IN' ? time12 : null),
      check_out_time: nextAction === 'CHECK_OUT' ? time12 : existing?.check_out_time,
      first_punch_in: firstIn,
      last_punch_out: lastOut,
      total_hours: totalHours,
      status: existing?.status || 'PRESENT',
      is_currently_in: nextAction === 'CHECK_IN',
      confidence_score: params.confidence || 0.95,
      liveness_verified: true,
      punch_mode: params.verificationMode || 'FACE_AI',
      punches,
      kiosk_id: params.kioskId || 'main-kiosk',
      updated_at: nowIso,
    };

    let result;
    if (existing?.id) {
      const { data, error } = await supabase
        .from('bi_attendance_records')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('bi_attendance_records')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return {
      record: result as AttendanceRecord,
      action: nextAction,
      message: `${nextAction === 'CHECK_IN' ? 'Check-in' : 'Check-out'} recorded at ${time12}`,
    };
  },

  async createManualOverride(
    companyId: string,
    data: {
      employeeId: string;
      logDate: string;
      checkInTime: string;
      checkOutTime: string;
      totalHours: number;
      status: string;
      reason: string;
    }
  ): Promise<AttendanceRecord> {
    const { data: existing } = await supabase
      .from('bi_attendance_records')
      .select('*')
      .eq('company_id', companyId)
      .eq('employee_id', data.employeeId)
      .eq('log_date', data.logDate)
      .maybeSingle();

    const payload = {
      company_id: companyId,
      employee_id: data.employeeId,
      log_date: data.logDate,
      check_in_time: data.checkInTime,
      check_out_time: data.checkOutTime,
      total_hours: data.totalHours,
      status: data.status,
      shift_status: 'MANUAL_OVERRIDE',
      is_currently_in: false,
      punch_mode: 'MANUAL',
      remarks: data.reason,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing?.id) {
      const { data: upd, error } = await supabase
        .from('bi_attendance_records')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      result = upd;
    } else {
      const { data: ins, error } = await supabase
        .from('bi_attendance_records')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      result = ins;
    }

    return result as AttendanceRecord;
  },
};
