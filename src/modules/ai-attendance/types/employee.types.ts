export interface EmployeeProfile {
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  pan_number?: string;
  aadhaar_number?: string;
  emergency_contact?: string;
  geofence_latitude?: number;
  geofence_longitude?: number;
  geofence_radius?: number;
  salary_type?: 'MONTHLY' | 'HOURLY' | 'DAILY';
  base_salary?: number;
  salary_components?: {
    basic?: number;
    da?: number;
    hra?: number;
    conveyance?: number;
    special?: number;
    pf_deduction?: number;
    esi_deduction?: number;
  };
  documents?: { name: string; url: string; uploaded_at: string }[];
  permissions?: string[];
  notes?: string;
  [key: string]: any;
}

export interface AttendanceEmployee {
  id: string;
  company_id: string;
  user_id?: string | null;
  employee_code: string;
  first_name: string;
  last_name: string;
  employee_name?: string; // computed helper
  email?: string | null;
  phone?: string | null;
  department: string;
  designation: string;
  employment_type: 'FULL_TIME' | 'PART_TIME' | 'DAILY_WAGE' | 'CONTRACT' | 'INTERN';
  shift_type: 'FIXED' | 'FLEXIBLE' | 'ROTATING';
  shift_start: string;
  shift_end: string;
  hourly_rate: number;
  salary_type?: 'MONTHLY' | 'HOURLY' | 'DAILY' | 'monthly' | 'hourly' | 'day' | string;
  hourly_salary?: number;
  day_salary?: number;
  half_day_salary?: number;
  monthly_salary?: number;
  face_embeddings: number[][]; // 128-d unit-normalized float arrays
  face_embedding?: number[];
  enrolled_samples_count: number;
  biometric_consent: boolean;
  consent_timestamp?: string | null;
  is_active: boolean;
  avatar_url?: string | null;
  profile?: EmployeeProfile;
  created_at: string;
  updated_at: string;
}
