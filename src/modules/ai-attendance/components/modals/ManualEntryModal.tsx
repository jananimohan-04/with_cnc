import React, { useState } from 'react';
import { X, Calendar, Clock, User } from 'lucide-react';
import { attendanceService } from '../../services/attendanceService';
import type { AttendanceEmployee } from '../../types/employee.types';

interface Props {
  companyId: string;
  employees: AttendanceEmployee[];
  onClose: () => void;
  onSaved: () => void;
}

export const ManualEntryModal: React.FC<Props> = ({ companyId, employees, onClose, onSaved }) => {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || '');
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [checkInTime, setCheckInTime] = useState('09:00');
  const [checkOutTime, setCheckOutTime] = useState('18:00');
  const [status, setStatus] = useState('PRESENT');
  const [reason, setReason] = useState('Supervisor Authorized Manual Override');
  const [saving, setSaving] = useState(false);

  const calculateHours = () => {
    const [inH, inM] = checkInTime.split(':').map(Number);
    const [outH, outM] = checkOutTime.split(':').map(Number);
    const diff = (outH * 60 + outM) - (inH * 60 + inM);
    return Math.max(0, Math.round((diff / 60) * 100) / 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) {
      alert('Please select an employee');
      return;
    }

    try {
      setSaving(true);
      await attendanceService.createManualOverride(companyId, {
        employeeId,
        logDate,
        checkInTime: `${checkInTime}:00`,
        checkOutTime: `${checkOutTime}:00`,
        totalHours: calculateHours(),
        status,
        reason,
      });
      onSaved();
    } catch (err) {
      alert('Failed to save manual override: ' + String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[1055] backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Add Manual Attendance Entry</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Select Employee *</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.employee_name} ({emp.employee_code}) - {emp.department}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Date *</label>
            <input
              type="date"
              required
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Punch In Time</label>
              <input
                type="time"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1 font-semibold">Punch Out Time</label>
              <input
                type="time"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
            <span className="text-slate-400">Calculated Working Hours:</span>
            <span className="font-mono font-bold text-amber-400">{calculateHours()} hrs</span>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Reason for Override *</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Field visit, Client meeting, Biometric glitch"
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold shadow disabled:opacity-50"
            >
              {saving ? 'Recording...' : 'Submit Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
