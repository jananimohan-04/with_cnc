import React, { useState, useEffect } from 'react';
import { Settings, Plus, Check, Volume2, VolumeX, X } from 'lucide-react';
import { leaveService, type EmployeeCustomLeave } from '../../services/leaveService';
import type { AttendanceEmployee } from '../../types/employee.types';

interface Props {
  employee: AttendanceEmployee;
  onClose: () => void;
  onSaved: (employeeId: string, updatedLeaves: EmployeeCustomLeave[]) => void;
}

export const SetEmployeeQuotaModal: React.FC<Props> = ({ employee, onClose, onSaved }) => {
  const [rows, setRows] = useState<EmployeeCustomLeave[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const existing = await leaveService.getEmployeeCustomLeaves(employee.id);
      if (existing.length > 0) {
        setRows(existing);
      } else {
        // Preload default leave row matching Image 5
        setRows([
          {
            id: `row_${Date.now()}_1`,
            name: 'Casual Leave',
            quota: 12,
            type: 'Days - Leave',
          },
        ]);
      }
    })();
  }, [employee.id]);

  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `row_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: '',
        quota: 0,
        type: 'Days - Leave',
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleFieldChange = (id: string, field: keyof EmployeeCustomLeave, val: any) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = rows.filter((r) => r.name.trim().length > 0);
    try {
      setSaving(true);
      await leaveService.saveEmployeeCustomLeaves(employee.id, validRows);
      onSaved(employee.id, validRows);
      onClose();
    } catch (err) {
      alert('Failed to save employee leaves: ' + String(err));
    } finally {
      setSaving(false);
    }
  };

  const fullName = `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || 'Staff Member';
  const empCode = employee.employee_code || employee.id.slice(0, 15);

  return (
    <div className="emp-modal-overlay fixed inset-0 bg-slate-900/70 z-[1100] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        {/* Header (Ocean Blue #0284c7) */}
        <div className="bg-gradient-to-r from-sky-600 to-sky-700 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-white" />
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Set Employee Custom Leaves</h3>
              <p className="text-xs text-sky-100 mt-0.5">
                Configuring: {fullName} (ID: {empCode})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAudioEnabled(!audioEnabled)}
              className="px-2 py-1 text-[11px] font-semibold rounded-md border border-white/30 bg-white/15 hover:bg-white/25 text-white flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {audioEnabled ? (
                <>
                  <Volume2 className="w-3 h-3 text-emerald-300" />
                  <span>Audio: On</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3 h-3 text-rose-300" />
                  <span>Audio: Off</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-white/80 hover:text-white text-xl p-1 leading-none cursor-pointer"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Body Content */}
        <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-800">Custom Leave Types &amp; Numbers</label>
              <button
                type="button"
                onClick={handleAddRow}
                className="px-2.5 py-1 text-xs font-bold rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-700 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Leave Type</span>
              </button>
            </div>

            {/* Dynamic Rows */}
            <div className="flex flex-col gap-2.5">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="custom-leave-row bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex flex-col sm:flex-row items-center gap-2 transition-colors"
                >
                  <input
                    type="text"
                    placeholder="Leave Name (e.g. Medical Leave)"
                    value={row.name}
                    onChange={(e) => handleFieldChange(row.id, 'name', e.target.value)}
                    className="flex-1 w-full sm:w-auto h-8 px-3 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500 font-medium"
                    required
                  />
                  <input
                    type="number"
                    placeholder="Quota"
                    value={row.quota}
                    onChange={(e) => handleFieldChange(row.id, 'quota', Number(e.target.value))}
                    min="0"
                    className="w-full sm:w-20 h-8 px-3 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500 font-bold text-center"
                    required
                  />
                  <select
                    value={row.type}
                    onChange={(e) => handleFieldChange(row.id, 'type', e.target.value)}
                    className="w-full sm:w-36 h-8 px-2 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-sky-500 font-semibold text-slate-700"
                  >
                    <option value="Days - Leave">Days - Leave</option>
                    <option value="Hours - Permission">Hours - Permission</option>
                  </select>
                  <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      className="px-2.5 py-1 text-[11px] font-bold rounded bg-sky-100 hover:bg-sky-200 text-sky-700 cursor-pointer transition-colors"
                      title="Edit Quota Row"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(row.id)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded bg-rose-100 hover:bg-rose-200 text-rose-700 cursor-pointer transition-colors"
                      title="Delete Quota Row"
                    >
                      Del
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>{saving ? 'Saving...' : 'Save Leaves'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
