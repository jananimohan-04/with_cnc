export interface PunchRecord {
  action: 'CHECK_IN' | 'CHECK_OUT' | 'IN' | 'OUT';
  time: string; // HH:MM:SS format
  timestamp: string; // ISO format
  confidence?: number;
  kiosk_id?: string;
  latitude?: number;
  longitude?: number;
  verification_mode?: 'FACE_AI' | 'MANUAL' | 'KIOSK' | 'FIELD_GPS';
}

export interface AttendanceRecord {
  id: string;
  company_id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  department?: string;
  designation?: string;
  log_date?: string; // YYYY-MM-DD
  attendance_date?: string;
  check_in_time: string | null;
  check_out_time: string | null;
  first_punch_in?: string | null;
  last_punch_out?: string | null;
  total_hours?: number;
  status: 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | 'ON_LEAVE' | 'OVERTIME' | 'Present' | 'Late' | 'Absent' | 'On Leave' | 'Auto Timeout' | string;
  shift_status?: string; // 'ON-TIME' | 'LATE' | 'EARLY_EXIT' | 'FLEXIBLE' | 'MANUAL_OVERRIDE'
  is_currently_in?: boolean;
  confidence_score?: number;
  liveness_verified?: boolean;
  punch_mode?: string;
  punches?: PunchRecord[];
  latitude?: number;
  longitude?: number;
  location_in_address?: string;
  location_out_address?: string;
  distance_meters_in?: number;
  distance_meters_out?: number;
  late_minutes?: number;
  exit_distance?: string | number;
  exit_status?: string;
  geofence_status?: string;
  working_hours?: string;
  shift_variance?: string;
  working_salary?: number;
  kiosk_id?: string;
  remarks?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AttendanceStats {
  totalEmployees: number;
  presentToday: number;
  absentToday: number;
  presentPercent: number;
  timeoutCount: number;
  lateCount: number;
  onLeaveCount: number;
}

export interface AttendanceSettings {
  id?: string;
  company_id: string;
  work_start_time: string;
  work_end_time: string;
  late_grace_minutes: number;
  half_day_hours: number;
  full_day_hours: number;
  geofence_enabled: boolean;
  geofence_latitude?: number | null;
  geofence_longitude?: number | null;
  geofence_radius_meters: number;
  liveness_strict: boolean;
  similarity_threshold: number;
  auto_checkout_enabled: boolean;
  auto_checkout_time?: string;
  org_profile?: {
    company_name?: string;
    branch_name?: string;
    address?: string;
    phone?: string;
    email?: string;
    tax_id?: string;
  };
  logo_url?: string | null;
}
