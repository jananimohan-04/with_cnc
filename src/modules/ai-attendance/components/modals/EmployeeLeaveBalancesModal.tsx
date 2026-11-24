import React, { useState } from 'react';
import { Users, Search, Edit3, Trash2 } from 'lucide-react';
import type { AttendanceEmployee } from '../../types/employee.types';

interface Props {
  employees: AttendanceEmployee[];
  onClose: () => void;
  onEditEmployeeQuota: (employee: AttendanceEmployee) => void;
  onResetEmployeeQuota?: (employeeId: string) => void;
}

export const EmployeeLeaveBalancesModal: React.FC<Props> = ({
  employees,
  onClose,
  onEditEmployeeQuota,
  onResetEmployeeQuota,
}) => {
  const [search, setSearch] = useState('');

  const filtered = employees.filter((emp) => {
    const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
    const code = (emp.employee_code || emp.id || '').toLowerCase();
    const dept = (emp.department || '').toLowerCase();
    const q = search.toLowerCase();
    return fullName.includes(q) || code.includes(q) || dept.includes(q);
  });

  return (
    <div className="emp-modal-overlay fixed inset-0 bg-slate-900/65 z-[1055] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        {/* Header (Ocean Blue #0284c7) */}
        <div className="bg-gradient-to-r from-sky-600 to-sky-700 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-white" />
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Employee Leave Balances &amp; Quotas</h3>
              <p className="text-xs text-sky-100 mt-0.5">
                Configure individual custom leave types, allocations, and permissions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white text-xl p-1 leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Top Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-shrink-0">
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Search employees..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
          <div className="text-xs text-slate-600 font-medium">
            Click <strong className="text-sky-600 font-bold">Set</strong> on any employee to configure custom leave types &amp; numbers.
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-y-auto flex-1 p-4">
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10.5px]">
                  <th className="py-2.5 px-3 w-36">EMP ID</th>
                  <th className="py-2.5 px-3">EMPLOYEE NAME</th>
                  <th className="py-2.5 px-3 w-40">DEPARTMENT</th>
                  <th className="py-2.5 px-3">LEAVE TYPES &amp; BALANCES</th>
                  <th className="py-2.5 px-3 w-36 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                      No employees found matching &quot;{search}&quot;.
                    </td>
                  </tr>
                ) : (
                  filtered.map((emp) => {
                    const customLeaves: any[] = emp.profile?.custom_leaves || [];
                    const fullName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Staff Member';
                    const empCode = emp.employee_code || emp.id.slice(0, 15);

                    return (
                      <tr key={emp.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{empCode}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{fullName}</td>
                        <td className="py-2.5 px-3 text-slate-600">{emp.department || 'General'}</td>
                        <td className="py-2.5 px-3">
                          {customLeaves.length === 0 ? (
                            <span className="text-slate-400 italic text-[11px]">No leaves configured</span>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {customLeaves.map((cl, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-sky-50 text-sky-700 border border-sky-200"
                                >
                                  <span>{cl.name}:</span>
                                  <span className="text-sky-900">{cl.quota}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => onEditEmployeeQuota(emp)}
                              className="px-3 py-1 rounded-md text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white cursor-pointer transition-colors shadow-sm"
                            >
                              {customLeaves.length > 0 ? 'Edit' : 'Set'}
                            </button>
                            {customLeaves.length > 0 && (
                              <button
                                type="button"
                                onClick={() => onResetEmployeeQuota?.(emp.id)}
                                className="px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer transition-colors"
                                title="Reset Quota"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
