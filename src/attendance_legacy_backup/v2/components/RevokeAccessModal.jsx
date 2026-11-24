import React from 'react';
import { ShieldAlert, X, AlertTriangle, UserX, Loader2 } from 'lucide-react';

export const RevokeAccessModal = ({
  isOpen,
  employee,
  onClose,
  onConfirm,
  loading = false
}) => {
  if (!isOpen || !employee) return null;

  const fullName = `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || employee.employee_name || 'Employee';
  const employeeCode = employee.employee_code || employee.emp_code || 'EMP';
  const department = employee.department || 'General';
  const designation = employee.designation || 'Staff Personnel';
  const shift = employee.assigned_shift || employee.shift || 'General Shift';

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div 
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header with Red Warning Accent */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-3 bg-red-50/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 shadow-2xs border border-red-200">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Revoke Biometric Access
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Permanent credential revocation & workforce removal
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Main Confirmation Question */}
          <div className="text-sm font-semibold text-slate-800 leading-relaxed">
            Revoke biometric access and remove{' '}
            <span className="font-bold text-red-600">"{fullName}"</span>{' '}
            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
              ({employeeCode})
            </span>
            ?
          </div>

          {/* Personnel Snapshot Box */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                {fullName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">
                  {fullName}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {designation} • <span className="font-medium text-slate-700">{department}</span>
                </div>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[10px] font-mono font-bold text-slate-600 bg-white px-2 py-1 rounded border border-slate-200 block truncate max-w-[150px]">
                {shift}
              </span>
            </div>
          </div>

          {/* Security Impact Warning Alert */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-950 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Biometric Security Protocol Impacts</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-[11px] text-amber-800 font-medium">
              <li>128-dimensional facial embeddings and biometric vectors will be deactivated.</li>
              <li>Attendance terminal face scan recognition will be blocked immediately.</li>
              <li>Employee portal self-service account will be disabled.</li>
              <li>Workforce rosters and attendance counters will update dynamically across all tabs.</li>
            </ul>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-white text-xs font-bold text-slate-700 transition-colors shadow-2xs cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-xs font-bold text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Revoking Access...</span>
              </>
            ) : (
              <>
                <UserX className="w-3.5 h-3.5" />
                <span>Revoke Access & Remove</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
