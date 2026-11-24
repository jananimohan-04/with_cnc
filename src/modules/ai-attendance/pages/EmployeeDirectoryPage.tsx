import React, { useState, useEffect } from 'react';
import { Plus, Users, User, Camera, Edit2, Trash2, Check, Copy, FileSpreadsheet, Printer } from 'lucide-react';
import { employeeService } from '../services/employeeService';
import type { AttendanceEmployee } from '../types/employee.types';
import { EmployeeModal } from '../components/modals/EmployeeModal';
import { FaceEnrollModal } from '../components/modals/FaceEnrollModal';

interface Props {
  companyId: string;
}

export const EmployeeDirectoryPage: React.FC<Props> = ({ companyId }) => {
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [entriesLimit, setEntriesLimit] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<AttendanceEmployee | null>(null);
  const [enrollingEmployee, setEnrollingEmployee] = useState<AttendanceEmployee | null>(null);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const data = await employeeService.getEmployees(companyId);
      setEmployees(data);
    } catch (err) {
      console.error('Error fetching employees:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [companyId]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete employee "${name}"?`)) return;
    try {
      await employeeService.deleteEmployee(id);
      fetchEmployees();
    } catch (err) {
      alert('Failed to delete employee: ' + String(err));
    }
  };

  const activeCount = employees.filter((e) => e.is_active !== false).length;
  const inactiveCount = employees.filter((e) => e.is_active === false).length;

  const filtered = employees.filter((emp) => {
    const matchesSearch =
      emp.employee_name?.toLowerCase().includes(search.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(search.toLowerCase()) ||
      emp.designation?.toLowerCase().includes(search.toLowerCase()) ||
      emp.department?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Active' && emp.is_active !== false) ||
      (statusFilter === 'Inactive' && emp.is_active === false);

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filtered.length / entriesLimit) || 1;
  const paginated = filtered.slice((currentPage - 1) * entriesLimit, currentPage * entriesLimit);

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(paginated.map((p) => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleExport = (type: string) => {
    if (type === 'copy') {
      const text = filtered.map((e) => `${e.employee_code}\t${e.employee_name}\t${e.designation}\t${e.salary_type}\t₹${e.day_salary}`).join('\n');
      navigator.clipboard.writeText(text);
      alert('Copied employee records to clipboard!');
    } else if (type === 'csv' || type === 'excel') {
      const header = 'ID,Code,Name,Designation,Status,Salary Basis,Day Salary,Monthly Salary\n';
      const rows = filtered.map((e) => `"${e.id}","${e.employee_code}","${e.employee_name}","${e.designation}","${e.is_active ? 'Active' : 'Inactive'}","${e.salary_type}","${e.day_salary}","${e.monthly_salary}"`).join('\n');
      const blob = new Blob([header + rows], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Employees_${companyId}.csv`;
      a.click();
    } else if (type === 'print') {
      window.print();
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Top Employee Details Banner */}
      <div className="content-banner-card">
        <div className="banner-left">
          <div className="banner-icon-badge">
            <Users className="w-5 h-5 text-[#0284c7]" />
          </div>
          <div className="banner-text-group">
            <div className="flex items-center gap-2">
              <h2 className="banner-title">EMPLOYEE DETAILS</h2>
              <div className="quota-badge" title="Active employees vs Allocated restriction limit">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                <span>Active Quota:</span>
                <span className="font-extrabold text-emerald-800">{activeCount} / 25 Active</span>
              </div>
            </div>
            <p className="banner-subtitle">
              Manage employee information, salary details and attendance settings
            </p>
          </div>
        </div>

        <div className="banner-actions">
          <button
            type="button"
            className="btn-primary-action"
            onClick={() => {
              setEditingEmployee(null);
              setIsModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            <span>New Entry</span>
          </button>
        </div>
      </div>

      {/* 2. Employee Data Table Card */}
      <div className="table-card">
        {/* Toolbar */}
        <div className="table-toolbar">
          <div className="table-toolbar-left">
            <div className="flex items-center gap-2">
              <label htmlFor="tableSearch" className="text-xs font-semibold text-slate-600">
                Search:
              </label>
              <input
                id="tableSearch"
                type="text"
                placeholder="Search employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="filter-input w-44"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-600 ml-2">
              <span>Show</span>
              <select
                value={entriesLimit}
                onChange={(e) => {
                  setEntriesLimit(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="filter-input text-xs"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>entries</span>
            </div>

            {/* List / Grid Switcher */}
            <div className="flex items-center border border-slate-200 rounded-md p-0.5 ml-2 bg-slate-50">
              <button
                type="button"
                className="px-2 py-1 text-xs rounded bg-white font-bold text-slate-800 shadow-sm"
                title="List View"
              >
                ≡
              </button>
              <button
                type="button"
                className="px-2 py-1 text-xs rounded text-slate-500 hover:text-slate-800"
                title="Grid View"
              >
                ⊞
              </button>
            </div>
          </div>

          <div className="table-toolbar-right">
            {/* Status Filter Tabs */}
            <div className="inline-flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('All')}
                className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                  statusFilter === 'All'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({employees.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Active')}
                className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                  statusFilter === 'Active'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-emerald-700 hover:text-emerald-900'
                }`}
              >
                Active ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('Inactive')}
                className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                  statusFilter === 'Inactive'
                    ? 'bg-white text-rose-700 shadow-sm'
                    : 'text-rose-600 hover:text-rose-900'
                }`}
              >
                Inactive ({inactiveCount})
              </button>
            </div>

            {/* Export Buttons */}
            <div className="export-btn-group">
              <button
                type="button"
                onClick={() => handleExport('copy')}
                className="btn-export"
                title="Copy to clipboard"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => handleExport('csv')}
                className="btn-export"
                title="Download CSV"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => handleExport('excel')}
                className="btn-export text-emerald-700"
                title="Download Excel"
              >
                Excel
              </button>
              <button
                type="button"
                onClick={() => handleExport('csv')}
                className="btn-export text-rose-700"
                title="Download PDF"
              >
                PDF
              </button>
              <button
                type="button"
                onClick={() => handleExport('print')}
                className="btn-export"
                title="Print table"
              >
                Print
              </button>
            </div>
          </div>
        </div>

        {/* 3. 13-Column Data Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="att-data-table">
            <thead>
              <tr>
                <th style={{ width: '38px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    onChange={toggleSelectAll}
                    checked={paginated.length > 0 && selectedIds.length === paginated.length}
                    className="accent-blue-600 cursor-pointer"
                  />
                </th>
                <th>ID ⇅</th>
                <th>PHOTO ⇅</th>
                <th style={{ minWidth: '140px' }}>EMPLOYEE NAME ⇅</th>
                <th>DESIGNATION ⇅</th>
                <th>STATUS ⇅</th>
                <th>SALARY BASIS ⇅</th>
                <th>HOURLY SALARY ⇅</th>
                <th>DAY SALARY ⇅</th>
                <th>HALF DAY SALARY ⇅</th>
                <th>MONTHLY SALARY ⇅</th>
                <th style={{ textAlign: 'center', minWidth: '110px' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="text-center py-8 text-slate-400 font-mono">
                    Loading employee directory...
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-8 text-slate-400">
                    No employees matching filter criteria
                  </td>
                </tr>
              ) : (
                paginated.map((emp) => {
                  const isChecked = selectedIds.includes(emp.id);
                  return (
                    <tr key={emp.id} className={isChecked ? 'bg-sky-50/50' : ''}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectOne(emp.id)}
                          className="accent-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="font-mono text-[11px] text-slate-500 font-semibold">
                        {emp.employee_code || emp.id.slice(0, 8)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 border border-slate-300 mx-auto flex items-center justify-center text-slate-500 font-bold text-xs">
                          {emp.face_embeddings?.length ? (
                            <span className="w-full h-full bg-gradient-to-tr from-sky-400 to-indigo-500 flex items-center justify-center text-white">
                              {emp.employee_name?.slice(0, 1).toUpperCase()}
                            </span>
                          ) : (
                            <User className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </td>
                      <td className="font-bold text-slate-900">{emp.employee_name}</td>
                      <td className="text-slate-600">{emp.designation || 'Staff'}</td>
                      <td>
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                          emp.is_active !== false
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}>
                          {emp.is_active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <span className="inline-block px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {emp.salary_type === 'day' ? 'Day-Based' : emp.salary_type === 'monthly' ? 'Monthly' : 'Hourly'}
                        </span>
                      </td>
                      <td className="text-slate-700">₹{Number(emp.hourly_salary || 0).toFixed(2)}</td>
                      <td className="font-semibold text-slate-900">₹{Number(emp.day_salary || 0)}</td>
                      <td className="text-slate-700">₹{Number(emp.half_day_salary || 0)}</td>
                      <td className="font-semibold text-slate-900">₹{Number(emp.monthly_salary || 0)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEnrollingEmployee(emp)}
                            className="p-1.5 rounded-md hover:bg-sky-50 text-[#0284c7] transition-colors"
                            title="Enroll Face Biometrics"
                          >
                            <Camera className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEmployee(emp);
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 rounded-md hover:bg-amber-50 text-amber-600 transition-colors"
                            title="Edit Employee"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(emp.id, emp.employee_name || 'Employee')}
                            className="p-1.5 rounded-md hover:bg-rose-50 text-rose-600 transition-colors"
                            title="Delete Employee"
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

        {/* 4. Pagination */}
        <div className="flex items-center justify-between mt-3 text-xs text-slate-600">
          <div>
            Showing {(currentPage - 1) * entriesLimit + (filtered.length ? 1 : 0)} to{' '}
            {Math.min(currentPage * entriesLimit, filtered.length)} of {filtered.length} entries
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="px-2.5 py-1 rounded border border-slate-200 bg-white disabled:opacity-50 text-slate-700 font-semibold"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }).map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentPage(idx + 1)}
                className={`w-7 h-7 rounded text-xs font-bold ${
                  currentPage === idx + 1
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                {idx + 1}
              </button>
            ))}
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="px-2.5 py-1 rounded border border-slate-200 bg-white disabled:opacity-50 text-slate-700 font-semibold"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {isModalOpen && (
        <EmployeeModal
          companyId={companyId}
          employee={editingEmployee}
          onClose={() => {
            setIsModalOpen(false);
            setEditingEmployee(null);
          }}
          onSaved={() => {
            setIsModalOpen(false);
            setEditingEmployee(null);
            fetchEmployees();
          }}
        />
      )}

      {enrollingEmployee && (
        <FaceEnrollModal
          employee={enrollingEmployee}
          onClose={() => setEnrollingEmployee(null)}
          onSuccess={() => {
            setEnrollingEmployee(null);
            fetchEmployees();
          }}
        />
      )}
    </div>
  );
};
