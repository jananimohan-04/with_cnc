// Compatibility shim bridging any legacy imports to the new AI Attendance services
import { attendanceService } from '@/modules/ai-attendance/services/attendanceService';
import { employeeService } from '@/modules/ai-attendance/services/employeeService';
import { leaveService } from '@/modules/ai-attendance/services/leaveService';

export const attendanceApi = {
  getRoster: async () => ({ ok: true, roster: [], metrics: { total_staff: 0, present: 0, late: 0, half_day: 0, absent: 0, currently_clocked_in: 0 }, date: '' }),
  getEmployees: async () => ({ ok: true, employees: [] }),
  getLeaves: async () => ({ ok: true, data: [] }),
  attendanceService,
  employeeService,
  leaveService,
};
