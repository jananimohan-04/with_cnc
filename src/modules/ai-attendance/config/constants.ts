export const ATTENDANCE_CONSTANTS = {
  // Recognition threshold (0.40 for SFace L2 distance, 0.75 for Cosine Similarity)
  RECOGNITION_THRESHOLD: 0.72,
  MARGIN_THRESHOLD: 0.08,
  
  // Embedding Vector Size
  VECTOR_DIMENSIONS: 128,

  // Shift Defaults
  DEFAULT_WORK_START: '09:00',
  DEFAULT_WORK_END: '18:00',
  DEFAULT_GRACE_MINUTES: 15,
  DEFAULT_HALF_DAY_HOURS: 4.5,
  DEFAULT_FULL_DAY_HOURS: 8.0,

  // Geofence defaults
  DEFAULT_GEOFENCE_RADIUS_METERS: 200,

  // Status Colors & Badges
  STATUS_COLORS: {
    PRESENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    LATE: 'bg-amber-50 text-amber-700 border-amber-200',
    HALF_DAY: 'bg-orange-50 text-orange-700 border-orange-200',
    ABSENT: 'bg-rose-50 text-rose-700 border-rose-200',
    ON_LEAVE: 'bg-blue-50 text-blue-700 border-blue-200',
    OVERTIME: 'bg-purple-50 text-purple-700 border-purple-200',
  },
};
