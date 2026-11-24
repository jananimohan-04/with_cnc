import { supabase } from './supabaseClient';
import type { AttendanceSettings } from '../types/attendance.types';

export const settingsService = {
  async getSettings(companyId: string): Promise<AttendanceSettings> {
    const defaultSettings: AttendanceSettings = {
      company_id: companyId,
      work_start_time: '09:00',
      work_end_time: '18:00',
      late_grace_minutes: 15,
      half_day_hours: 4.5,
      full_day_hours: 8.0,
      geofence_enabled: false,
      geofence_latitude: 13.0827,
      geofence_longitude: 80.2707,
      geofence_radius_meters: 200,
      liveness_strict: true,
      similarity_threshold: 0.72,
      auto_checkout_enabled: false,
    };

    if (!companyId) return defaultSettings;

    const { data, error } = await supabase
      .from('bi_attendance_settings')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('[settingsService] fetch warning:', error.message);
    }

    return { ...defaultSettings, ...(data || {}) };
  },

  async updateSettings(companyId: string, settings: Partial<AttendanceSettings>): Promise<AttendanceSettings> {
    const { data: existing } = await supabase
      .from('bi_attendance_settings')
      .select('id')
      .eq('company_id', companyId)
      .maybeSingle();

    const payload = {
      ...settings,
      company_id: companyId,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing?.id) {
      const { data, error } = await supabase
        .from('bi_attendance_settings')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('bi_attendance_settings')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return result as AttendanceSettings;
  },
};
