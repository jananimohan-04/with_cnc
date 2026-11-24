import React, { useState, useEffect } from 'react';
import {
  FileText,
  Users,
  User,
  Calendar,
  RotateCw,
  Volume2,
  VolumeX,
  Check,
  X,
  Trash2,
  Search,
} from 'lucide-react';
import { leaveService } from '../services/leaveService';
import { employeeService } from '../services/employeeService';
import { CompanyLeavesModal } from '../components/modals/CompanyLeavesModal';
import { EmployeeLeaveBalancesModal } from '../components/modals/EmployeeLeaveBalancesModal';
import { SetEmployeeQuotaModal } from '../components/modals/SetEmployeeQuotaModal';
import { PaidHolidaysModal } from '../components/modals/PaidHolidaysModal';
import type { LeaveRequest } from '../types/payment.types';
import type { AttendanceEmployee } from '../types/employee.types';

interface Props {
  companyId: string;
}

export const LeaveManagementPage: React.FC<Props> = ({ companyId }) => {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');
  const [audioMuted, setAudioMuted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals state
  const [showCompanyLeavesModal, setShowCompanyLeavesModal] = useState(false);
  const [showEmployeeBalancesModal, setShowEmployeeBalancesModal] = useState(false);
  const [showPaidHolidaysModal, setShowPaidHolidaysModal] = useState(false);
  const [editingEmployeeForQuota, setEditingEmployeeForQuota] = useState<AttendanceEmployee | null>(null);

  // Quick Reject Modal
  const [rejectingItem, setRejectingItem] = useState<LeaveRequest | null>(null);
  const [rejectRemark, setRejectRemark] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [lList, emps] = await Promise.all([
        leaveService.getLeaves(companyId),
        employeeService.getEmployees(companyId),
      ]);
      setLeaves(lList);
      setEmployees(emps);
    } catch (err) {
      console.error('Failed to load leaves:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [companyId]);

  const handleStatusUpdate = async (id: string, status: 'Approved' | 'Rejected', remark?: string) => {
    try {
      await leaveService.updateLeaveStatus(id, status, 'Admin');
      setRejectingItem(null);
      setRejectRemark('');
      loadData();
    } catch (err) {
      alert('Failed to update status: ' + String(err));
    }
  };

  const handleDeleteSingle = async (id: string) => {
    if (!confirm('Are you sure you want to delete this leave request?')) return;
    try {
      await leaveService.deleteLeaveRequest(id);
      setSelectedIds((prev) => prev.filter((i) => i !== id));
      loadData();
    } catch (err) {
      alert('Failed to delete request: ' + String(err));
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected request(s)?`)) return;
    try {
      await leaveService.bulkDeleteLeaves(selectedIds);
      setSelectedIds([]);
      loadData();
    } catch (err) {
      alert('Failed to delete selected requests: ' + String(err));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filtered.map((l) => l.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    }
  };

  const filtered = leaves.filter((r) => {
    const matchesSearch =
      (r.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.leave_type || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.reason || '').toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === 'All' || r.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const pendingCount = leaves.filter((l) => l.status === 'Pending').length;
  const approvedCount = leaves.filter((l) => l.status === 'Approved').length;
  const rejectedCount = leaves.filter((l) => l.status === 'Rejected').length;

  return (
    <div className="space-y-4">
      {/* 1. Top Content Banner Card (Image 2) */}
      <div className="content-banner-card">
        <div className="banner-left">
          <div
            className="banner-icon-badge"
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
            }}
          >
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div className="banner-text-group">
            <h2 className="banner-title">LEAVE &amp; PERMISSION MANAGEMENT</h2>
            <p className="banner-subtitle">
              Review incoming leave/permission requests, manage employee balances, and configure policy
            </p>
          </div>
        </div>

        <div className="banner-actions">
          {/* Button 1: Company Leaves */}
          <button
            type="button"
            onClick={() => setShowCompanyLeavesModal(true)}
            className="btn-primary-action"
            style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              borderColor: '#2563eb',
            }}
            title="Set Overall Leaves & Permissions for All Employees"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Company Leaves</span>
          </button>

          {/* Button 2: Specific Employee Leaves */}
          <button
            type="button"
            onClick={() => setShowEmployeeBalancesModal(true)}
            className="btn-primary-action"
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              borderColor: '#0284c7',
            }}
            title="Set or Adjust Specific Employee Leaves"
          >
            <User className="w-3.5 h-3.5" />
            <span>Specific Employee Leaves</span>
          </button>

          {/* Button 3: Paid Holidays */}
          <button
            type="button"
            onClick={() => setShowPaidHolidaysModal(true)}
            className="btn-primary-action"
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              borderColor: '#059669',
            }}
            title="Manage Paid Holidays Calendar"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Paid Holidays</span>
          </button>

          {/* Button 4: Refresh */}
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer shadow-sm transition-colors"
            title="Refresh Data"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* Button 5: Audio Speaker Icon */}
          <button
            type="button"
            onClick={() => setAudioMuted(!audioMuted)}
            className="w-9 h-9 min-w-[36px] rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors cursor-pointer shadow-sm"
            title={audioMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {audioMuted ? (
              <VolumeX className="w-4 h-4 text-rose-500" />
            ) : (
              <Volume2 className="w-4 h-4 text-slate-700" />
            )}
          </button>
        </div>
      </div>

      {/* 2. Recent Requests Table Card (Image 2) */}
      <div className="table-card bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Toolbar */}
        <div className="table-toolbar p-3.5 bg-white border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="table-toolbar-left flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900 whitespace-nowrap">
              <span className="text-sky-600 text-sm font-bold">☑</span>
              <span>Recent Requests</span>
            </div>

            {/* Filter Tabs matching Image 2 */}
            <div className="tab-toggle-container flex items-center gap-1">
              <button
                type="button"
                onClick={() => setStatusFilter('All')}
                className={`btn-toggle-tab text-xs font-bold px-3 py-1 rounded-md transition-all cursor-pointer ${
                  statusFilter === 'All'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>All</span>
                {leaves.length > 0 && <span className="ml-1 text-[10px] opacity-80">({leaves.length})</span>}
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('Pending')}
                className={`btn-toggle-tab text-xs font-bold px-3 py-1 rounded-md transition-all cursor-pointer ${
                  statusFilter === 'Pending'
                    ? 'bg-amber-500 text-slate-900 shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>Pending</span>
                {pendingCount > 0 && <span className="ml-1 text-[10px] font-extrabold">({pendingCount})</span>}
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('Approved')}
                className={`btn-toggle-tab text-xs font-bold px-3 py-1 rounded-md transition-all cursor-pointer ${
                  statusFilter === 'Approved'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>Approved</span>
                {approvedCount > 0 && <span className="ml-1 text-[10px] opacity-80">({approvedCount})</span>}
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('Rejected')}
                className={`btn-toggle-tab text-xs font-bold px-3 py-1 rounded-md transition-all cursor-pointer ${
                  statusFilter === 'Rejected'
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>Rejected</span>
                {rejectedCount > 0 && <span className="ml-1 text-[10px] opacity-80">({rejectedCount})</span>}
              </button>
            </div>
          </div>

          <div className="table-toolbar-right w-full sm:w-auto flex items-center justify-end">
            <div className="relative w-full sm:w-56">
              <input
                type="text"
                placeholder="Search requests..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 pl-8 pr-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        {/* Bulk Actions Banner */}
        {selectedIds.length > 0 && (
          <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 flex items-center justify-between text-xs text-rose-800">
            <div className="flex items-center gap-2 font-semibold">
              <span>
                Selected: <span className="bg-rose-600 text-white px-2 py-0.5 rounded-full font-bold">{selectedIds.length}</span> record(s)
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="underline text-slate-600 hover:text-slate-800 cursor-pointer ml-2"
              >
                Clear Selection
              </button>
            </div>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedIds.length})</span>
            </button>
          </div>
        )}

        {/* 3. Table matching Image 2 */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10.5px]">
                <th className="py-2.5 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="accent-rose-600 cursor-pointer w-4 h-4"
                  />
                </th>
                <th className="py-2.5 px-3 w-14 text-center">SL NO</th>
                <th className="py-2.5 px-3 w-28">TYPE</th>
                <th className="py-2.5 px-3">EMPLOYEE</th>
                <th className="py-2.5 px-3 w-40">DATE / PERIOD</th>
                <th className="py-2.5 px-3">REASON</th>
                <th className="py-2.5 px-3 w-24 text-center">ATTACHMENT</th>
                <th className="py-2.5 px-3 w-36 text-center">STATUS</th>
                <th className="py-2.5 px-3 w-28 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400 italic text-sm font-medium">
                    No requests found matching criteria
                  </td>
                </tr>
              ) : (
                filtered.map((item, idx) => {
                  const isSelected = selectedIds.includes(item.id);

                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-slate-100 hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-sky-50/40' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectRow(item.id, e.target.checked)}
                          className="accent-rose-600 cursor-pointer w-4 h-4"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-500 font-medium">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {item.leave_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{item.employee_name}</td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        {item.start_date}
                        {item.end_date && item.end_date !== item.start_date ? ` to ${item.end_date}` : ''}
                        <span className="text-slate-400 text-[10.5px] ml-1">({item.days}d)</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={item.reason}>
                        {item.reason || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-400">-</td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold ${
                            item.status === 'Approved'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : item.status === 'Rejected'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {item.status === 'Pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStatusUpdate(item.id, 'Approved')}
                                className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-pointer transition-colors"
                                title="Approve Request"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectingItem(item)}
                                className="p-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer transition-colors"
                                title="Reject Request"
                              >
                                <X className="w-3.5 h-3.5 stroke-[2.5]" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteSingle(item.id)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-rose-600 cursor-pointer transition-colors"
                            title="Delete Request"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* Quick Reject Remark Modal */}
      {rejectingItem && (
        <div className="emp-modal-overlay fixed inset-0 bg-slate-900/60 z-[1200] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-200 p-5">
            <h4 className="text-sm font-bold text-slate-900 mb-1">Reject Leave Request</h4>
            <p className="text-xs text-slate-500 mb-3">
              Provide an optional remark for {rejectingItem.employee_name}:
            </p>
            <textarea
              value={rejectRemark}
              onChange={(e) => setRejectRemark(e.target.value)}
              placeholder="e.g. Insufficient leave balance, urgent shift schedule"
              rows={3}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-rose-500 mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRejectingItem(null);
                  setRejectRemark('');
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleStatusUpdate(rejectingItem.id, 'Rejected', rejectRemark)}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-sm"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4 Modals */}
      {showCompanyLeavesModal && (
        <CompanyLeavesModal
          companyId={companyId}
          onClose={() => setShowCompanyLeavesModal(false)}
          onSaved={loadData}
        />
      )}

      {showEmployeeBalancesModal && (
        <EmployeeLeaveBalancesModal
          employees={employees}
          onClose={() => setShowEmployeeBalancesModal(false)}
          onEditEmployeeQuota={(emp) => {
            setEditingEmployeeForQuota(emp);
          }}
          onResetEmployeeQuota={async (empId) => {
            if (confirm('Reset custom leave quota for this employee?')) {
              await leaveService.saveEmployeeCustomLeaves(empId, []);
              loadData();
            }
          }}
        />
      )}

      {editingEmployeeForQuota && (
        <SetEmployeeQuotaModal
          employee={editingEmployeeForQuota}
          onClose={() => setEditingEmployeeForQuota(null)}
          onSaved={() => {
            loadData();
          }}
        />
      )}

      {showPaidHolidaysModal && (
        <PaidHolidaysModal
          companyId={companyId}
          onClose={() => setShowPaidHolidaysModal(false)}
          onSaved={loadData}
        />
      )}
    </div>
  );
};
