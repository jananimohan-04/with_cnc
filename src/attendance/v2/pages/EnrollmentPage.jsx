import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api, { extractErrorMessage } from '../utils/api';
import { 
  Fingerprint, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ChevronDown, 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  User, 
  Mail, 
  Phone, 
  Building2, 
  Briefcase, 
  RefreshCw, 
  X,
  Lock,
  Check,
  Eye
} from 'lucide-react';
import { EnrollEmployeeModal, ALL_PERMISSIONS, DEFAULT_PERMISSIONS } from '../components/EnrollEmployeeModal';
import { RevokeAccessModal } from '../components/RevokeAccessModal';
import { EmployeeAttendanceModal } from '../components/EmployeeAttendanceModal';

export const EnrollmentPage = () => {
  const { organization } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All Departments');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedEmployeeForReport, setSelectedEmployeeForReport] = useState(null);
  
  // Edit Employee State
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editFormData, setEditFormData] = useState({
    first_name: '',
    last_name: '',
    employee_code: '',
    email: '',
    department: 'Operations',
    designation: 'Staff',
    phone: '',
    hourly_rate: 250,
    daily_wage_rate: 600,
    half_day_salary: 300,
    aadhar_number: '',
    emergency_contact: '',
    joining_date: '',
    account_holder_name: '',
    upi_number: '',
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    shift_hours: '08:00',
    assigned_shift: 'General Shift (09:00 AM – 05:30 PM • 8.5h)',
    shift_start: '09:00',
    shift_end: '17:30',
    base_salary: 40000,
    statutory_deductions: 3000,
    permissions: DEFAULT_PERMISSIONS
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Revoke Biometric Access Confirmation Modal State
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Status Notification
  const [actionMessage, setActionMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await api.get('/employees/');
      setEmployees(res.data || []);
    } catch (err) {
      console.error('Failed to load employees', err);
      showNotice('error', 'Unable to retrieve employee records.');
    } finally {
      setLoading(false);
    }
  };

  const showNotice = (type, text) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage({ type: '', text: '' }), 4000);
  };

  const formatTime12h = (time24) => {
    if (!time24) return '';
    try {
      const [h, m] = time24.split(':').map(Number);
      const suffix = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
    } catch {
      return time24;
    }
  };

  const calculateHours = (inTime, outTime) => {
    if (!inTime || !outTime) return 8.5;
    try {
      const [h1, m1] = inTime.split(':').map(Number);
      const [h2, m2] = outTime.split(':').map(Number);
      let diffMins = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (diffMins < 0) diffMins += 24 * 60;
      return Math.round((diffMins / 60) * 10) / 10;
    } catch {
      return 8.5;
    }
  };

  const handleCustomEditTimingChange = (newStart, newEnd) => {
    const start = newStart !== undefined ? newStart : editFormData.shift_start;
    const end = newEnd !== undefined ? newEnd : editFormData.shift_end;
    const hrs = calculateHours(start, end);
    const shiftDesc = `Custom Shift (${formatTime12h(start)} – ${formatTime12h(end)} • ${hrs}h)`;
    setEditFormData(prev => ({
      ...prev,
      shift_start: start,
      shift_end: end,
      assigned_shift: shiftDesc
    }));
  };

  const handleEditShiftChange = (shiftName) => {
    let start = '09:00';
    let end = '17:30';
    if (shiftName.includes('Morning')) {
      start = '06:00';
      end = '14:30';
    } else if (shiftName.includes('Evening')) {
      start = '14:00';
      end = '22:30';
    } else if (shiftName.includes('Night')) {
      start = '21:00';
      end = '05:30';
    } else if (shiftName.includes('10:00 AM')) {
      start = '10:00';
      end = '19:00';
    }
    setEditFormData(prev => ({
      ...prev,
      assigned_shift: shiftName,
      shift_start: start,
      shift_end: end
    }));
  };

  const handleOpenEdit = (emp) => {
    setEditingEmployee(emp);
    setEditFormData({
      first_name: emp.first_name || '',
      last_name: emp.last_name || '',
      employee_code: emp.employee_code || '',
      email: emp.email || '',
      department: emp.department || 'Operations',
      designation: emp.designation || 'Staff',
      phone: emp.phone || '',
      hourly_rate: emp.hourly_rate != null ? emp.hourly_rate : 250,
      daily_wage_rate: emp.daily_wage_rate != null ? emp.daily_wage_rate : 600,
      half_day_salary: emp.half_day_salary != null ? emp.half_day_salary : ((emp.daily_wage_rate || 600) / 2),
      aadhar_number: emp.aadhar_number || '',
      emergency_contact: emp.emergency_contact || '',
      joining_date: emp.joining_date || '',
      account_holder_name: emp.account_holder_name || '',
      upi_number: emp.upi_number || '',
      bank_name: emp.bank_name || '',
      account_number: emp.account_number || '',
      ifsc_code: emp.ifsc_code || '',
      shift_hours: emp.shift_hours || '08:00',
      assigned_shift: emp.assigned_shift || 'General Shift (09:00 AM – 05:30 PM • 8.5h)',
      shift_start: emp.shift_start || '09:00',
      shift_end: emp.shift_end || '17:30',
      base_salary: emp.base_salary != null ? emp.base_salary : 40000,
      statutory_deductions: emp.statutory_deductions != null ? emp.statutory_deductions : 3000,
      permissions: emp.permissions || DEFAULT_PERMISSIONS
    });
    setEditError('');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setEditSaving(true);
    setEditError('');

    try {
      const payload = { ...editFormData };
      payload.email = payload.email?.trim() || null;
      payload.designation = payload.designation?.trim() || payload.department || 'Production';
      const res = await api.put(`/employees/${editingEmployee.id}`, payload);
      setEmployees(prev => prev.map(emp => emp.id === editingEmployee.id ? { ...emp, ...res.data } : emp));
      setEditingEmployee(null);
      showNotice('success', `Employee ${res.data.first_name} ${res.data.last_name} updated successfully.`);
    } catch (err) {
      setEditError(extractErrorMessage(err, 'Failed to update employee details.'));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteEmployee = (emp) => {
    setEmployeeToDelete(emp);
  };

  const handleConfirmDelete = async () => {
    if (!employeeToDelete) return;
    const emp = employeeToDelete;
    const fullName = `${emp.first_name} ${emp.last_name}`.trim();
    setDeleteLoading(true);

    try {
      await api.delete(`/employees/${emp.id}`);
      setEmployees(prev => prev.filter(e => e.id !== emp.id));
      showNotice('success', `Employee "${fullName}" removed and credentials revoked.`);
      setEmployeeToDelete(null);
    } catch (err) {
      showNotice('error', extractErrorMessage(err, 'Failed to remove employee.'));
    } finally {
      setDeleteLoading(false);
    }
  };

  // Distinct departments for filter
  const departments = ['All Departments', ...new Set(employees.map(e => e.department).filter(Boolean))];

  // Filtering
  const filteredEmployees = employees.filter(emp => {
    const query = searchQuery.toLowerCase();
    const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
    const code = (emp.employee_code || '').toLowerCase();
    const dept = (emp.department || '').toLowerCase();
    const email = (emp.email || '').toLowerCase();

    const matchesSearch = !query || fullName.includes(query) || code.includes(query) || dept.includes(query) || email.includes(query);
    const matchesDept = selectedDept === 'All Departments' || emp.department?.toLowerCase() === selectedDept.toLowerCase();

    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* 1. Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-2xs">
            <Fingerprint className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 uppercase font-mono">
                EMPLOYEE DIRECTORY
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
                {employees.length} REGISTERED
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0080ff] hover:bg-blue-600 active:scale-[0.99] text-white rounded-xl text-xs font-bold shadow-xs transition-all self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Employee</span>
        </button>
      </div>

      {/* Action Notice Banner */}
      {actionMessage.text && (
        <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200 ${
          actionMessage.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* 2. Registered Employees Directory Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Filter Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/40">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, ID, or department..."
              className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-56">
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full pl-3 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              onClick={fetchEmployees}
              title="Refresh Directory"
              className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[760px]">
            <thead>
              <tr className="bg-slate-50 text-[10px] text-slate-400 uppercase font-mono font-bold tracking-wider border-b border-slate-200">
                <th className="py-3 px-4">EMPLOYEE & ID</th>
                <th className="py-3 px-4">DEPARTMENT</th>
                <th className="py-3 px-4">DESIGNATION</th>
                <th className="py-3 px-4">ASSIGNED SHIFT</th>
                <th className="py-3 px-4">CONTACT</th>
                <th className="py-3 px-4">BIOMETRIC STATUS</th>
                <th className="py-3 px-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                      <p className="text-xs font-bold text-slate-600">Loading workforce directory...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <Fingerprint className="w-8 h-8 text-slate-300 stroke-1" />
                      <p className="text-xs font-bold text-slate-700">
                        {searchQuery ? 'No matching personnel found.' : 'No employees registered yet.'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {searchQuery 
                          ? 'Try clearing the search query or department filter.' 
                          : 'Click the "+ Add Employee" button above to enroll your first staff member and capture biometric vectors.'}
                      </p>
                      {!searchQuery && (
                        <button
                          onClick={() => setIsAddModalOpen(true)}
                          className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#0080ff] hover:bg-blue-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Enroll Employee
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : filteredEmployees.map((emp) => {
                const fullName = `${emp.first_name} ${emp.last_name}`.trim();
                const initials = ((emp.first_name?.[0] || '') + (emp.last_name?.[0] || '')).toUpperCase() || 'EM';
                const hasBio = Boolean(emp.has_biometric);

                return (
                  <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Employee & Code */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {initials}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-xs">{fullName}</div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-blue-600 font-bold">{emp.employee_code}</span>
                            {emp.aadhar_number && (
                              <span className="text-[9px] font-mono text-slate-400">UID: {emp.aadhar_number}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-slate-700">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>{emp.department || 'Operations'}</span>
                      </span>
                    </td>

                    {/* Designation */}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                        <span>{emp.designation || 'Staff'}</span>
                      </span>
                    </td>

                    {/* Assigned Shift */}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-mono font-semibold max-w-[190px] truncate">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{emp.assigned_shift || 'General Shift (09:00 – 17:30)'}</span>
                      </span>
                    </td>

                    {/* Contact */}
                    <td className="py-3 px-4">
                      <div className="space-y-0.5">
                        <div className="text-[11px] text-slate-600 font-mono flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span className="truncate max-w-[170px]">{emp.email || '—'}</span>
                        </div>
                        {emp.phone && (
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <Phone className="w-2.5 h-2.5 text-slate-400" />
                            <span>{emp.phone}</span>
                          </div>
                        )}
                        {emp.emergency_contact && (
                          <div className="text-[9px] text-amber-600 font-mono">
                            SOS: {emp.emergency_contact}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Biometric Status */}
                    <td className="py-3 px-4">
                      {hasBio ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono font-bold">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          ENROLLED (128-D)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-mono font-bold">
                          <AlertCircle className="w-3 h-3 text-amber-600" />
                          PENDING BIOMETRIC
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedEmployeeForReport(emp)}
                          title="View Attendance Report"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(emp)}
                          title="Edit Employee Details"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEmployee(emp)}
                          title="Remove Employee"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
          <div>
            Showing <span className="font-bold text-slate-700">{filteredEmployees.length}</span> of {employees.length} personnel
          </div>
        </div>
      </div>

      {/* 3. Add Employee 3-Step Wizard Modal */}
      <EnrollEmployeeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onEmployeeCreated={() => {
          fetchEmployees();
          setIsAddModalOpen(false);
          showNotice('success', 'New employee profile and biometric vectors registered.');
        }}
      />

      {/* 4. Edit Employee Details Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] my-auto">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-800">
                    EDIT EMPLOYEE PROFILE
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Update record details for {editingEmployee.employee_code}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveEdit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {editError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{editError}</span>
                  </div>
                )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.first_name}
                    onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.last_name}
                    onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Employee ID / Code
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.employee_code}
                    onChange={(e) => setEditFormData({ ...editFormData, employee_code: e.target.value })}
                    className="w-full text-xs font-mono font-bold text-blue-600 bg-blue-50/30 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.department}
                    onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.designation}
                    onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={editFormData.phone}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    placeholder="e.g. +91 9876543210"
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                  Email Address (User Portal Login)
                </label>
                <input
                  type="email"
                  required
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Salary Structure (Matching Image) */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <label className="block text-xs font-bold text-slate-800">
                  Salary Structure (₹)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Hourly Salary *
                    </label>
                    <input
                      type="number"
                      step="10"
                      min="0"
                      value={editFormData.hourly_rate}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const daily = Math.round(val * 8);
                        setEditFormData({ 
                          ...editFormData, 
                          hourly_rate: val,
                          daily_wage_rate: daily,
                          half_day_salary: Math.round(daily / 2)
                        });
                      }}
                      className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Day Salary *
                    </label>
                    <input
                      type="number"
                      step="50"
                      min="0"
                      value={editFormData.daily_wage_rate}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setEditFormData({ 
                          ...editFormData, 
                          daily_wage_rate: val,
                          half_day_salary: Math.round(val / 2)
                        });
                      }}
                      className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Half Day Salary *
                    </label>
                    <input
                      type="number"
                      step="25"
                      min="0"
                      value={editFormData.half_day_salary}
                      onChange={(e) => setEditFormData({ ...editFormData, half_day_salary: parseFloat(e.target.value) || 0 })}
                      className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Contact, Identity & Shift Hours */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Emergency Contact
                  </label>
                  <input
                    type="text"
                    value={editFormData.emergency_contact}
                    onChange={(e) => setEditFormData({ ...editFormData, emergency_contact: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Number"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Aadhar Number
                  </label>
                  <input
                    type="text"
                    value={editFormData.aadhar_number}
                    onChange={(e) => setEditFormData({ ...editFormData, aadhar_number: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="12-digit number"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Joining Date
                  </label>
                  <input
                    type="date"
                    value={editFormData.joining_date}
                    onChange={(e) => setEditFormData({ ...editFormData, joining_date: e.target.value })}
                    className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                    Shift Hours
                  </label>
                  <input
                    type="text"
                    value={editFormData.shift_hours}
                    onChange={(e) => setEditFormData({ ...editFormData, shift_hours: e.target.value })}
                    className="w-full text-xs font-mono font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Example 08:00"
                  />
                </div>
              </div>

              {/* Banking & UPI Details */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <label className="block text-xs font-bold text-slate-800">
                  Banking &amp; UPI Details
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={editFormData.account_holder_name}
                      onChange={(e) => setEditFormData({ ...editFormData, account_holder_name: e.target.value })}
                      className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="Account Holder Name"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      UPI Number / ID
                    </label>
                    <input
                      type="text"
                      value={editFormData.upi_number}
                      onChange={(e) => setEditFormData({ ...editFormData, upi_number: e.target.value })}
                      className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="UPI Number"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={editFormData.bank_name}
                      onChange={(e) => setEditFormData({ ...editFormData, bank_name: e.target.value })}
                      className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="Bank Name"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={editFormData.account_number}
                      onChange={(e) => setEditFormData({ ...editFormData, account_number: e.target.value })}
                      className="w-full text-xs font-mono font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="Account Number"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      value={editFormData.ifsc_code}
                      onChange={(e) => setEditFormData({ ...editFormData, ifsc_code: e.target.value.toUpperCase() })}
                      className="w-full text-xs font-mono font-medium text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      placeholder="IFSC Code"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase">
                  Assigned Shift / Working Schedule
                </label>
                <select
                  value={
                    [
                      'General Shift (09:00 AM – 05:30 PM • 8.5h)',
                      'Morning Shift (06:00 AM – 02:30 PM • 8.5h)',
                      'Evening Shift (02:00 PM – 10:30 PM • 8.5h)',
                      'Night Shift (09:00 PM – 05:30 AM • 8.5h)',
                      'Standard Shift (10:00 AM – 07:00 PM • 9.0h)',
                      'Flexible Schedule (8.0h)'
                    ].includes(editFormData.assigned_shift) ? editFormData.assigned_shift : 'CUSTOM'
                  }
                  onChange={(e) => {
                    if (e.target.value === 'CUSTOM') {
                      handleCustomEditTimingChange(editFormData.shift_start, editFormData.shift_end);
                    } else {
                      handleEditShiftChange(e.target.value);
                    }
                  }}
                  className="w-full text-xs font-medium text-slate-900 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
                >
                  <option value="General Shift (09:00 AM – 05:30 PM • 8.5h)">General Shift (09:00 AM – 05:30 PM • 8.5h)</option>
                  <option value="Morning Shift (06:00 AM – 02:30 PM • 8.5h)">Morning Shift (06:00 AM – 02:30 PM • 8.5h)</option>
                  <option value="Evening Shift (02:00 PM – 10:30 PM • 8.5h)">Evening Shift (02:00 PM – 10:30 PM • 8.5h)</option>
                  <option value="Night Shift (09:00 PM – 05:30 AM • 8.5h)">Night Shift (09:00 PM – 05:30 AM • 8.5h)</option>
                  <option value="Standard Shift (10:00 AM – 07:00 PM • 9.0h)">Standard Shift (10:00 AM – 07:00 PM • 9.0h)</option>
                  <option value="Flexible Schedule (8.0h)">Flexible Schedule (8.0h)</option>
                  <option value="CUSTOM">Custom Shift (Explicit timings below)</option>
                </select>

                {/* Explicit Shift Timing Pickers */}
                <div className="grid grid-cols-2 gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Shift Start Time
                    </label>
                    <input
                      type="time"
                      required
                      value={editFormData.shift_start}
                      onChange={(e) => handleCustomEditTimingChange(e.target.value, undefined)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                      Shift End Time
                    </label>
                    <input
                      type="time"
                      required
                      value={editFormData.shift_end}
                      onChange={(e) => handleCustomEditTimingChange(undefined, e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Compensation & Salary Structure */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800">
                    Compensation & Salary Structure
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Update base monthly pay, hourly overtime rates, and statutory tax deductions for payroll.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                      Base Salary (₹/mo)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={editFormData.base_salary || 0}
                      onChange={(e) => setEditFormData({ ...editFormData, base_salary: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="40000"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                      OT Rate (₹/hr)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="25"
                      value={editFormData.hourly_rate || 0}
                      onChange={(e) => setEditFormData({ ...editFormData, hourly_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="250"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                      PF / Tax Ded. (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={editFormData.statutory_deductions || 0}
                      onChange={(e) => setEditFormData({ ...editFormData, statutory_deductions: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="3000"
                    />
                  </div>
                </div>
              </div>

              {/* User Access & Permissions */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      User Access & Permissions
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Check the sidebar tabs this employee is permitted to view in their UI.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setEditFormData(prev => ({ ...prev, permissions: ALL_PERMISSIONS.map(p => p.id) }))}
                      className="text-blue-600 hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => setEditFormData(prev => ({ ...prev, permissions: DEFAULT_PERMISSIONS }))}
                      className="text-slate-500 hover:underline cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {ALL_PERMISSIONS.map((perm) => {
                    const isChecked = (editFormData.permissions || []).includes(perm.id);
                    return (
                      <label
                        key={perm.id}
                        className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isChecked 
                            ? 'bg-blue-50/60 border-blue-200 text-slate-900' 
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const current = editFormData.permissions || [];
                            if (e.target.checked) {
                              setEditFormData(prev => ({ ...prev, permissions: [...current, perm.id] }));
                            } else {
                              setEditFormData(prev => ({ ...prev, permissions: current.filter(p => p !== perm.id) }));
                            }
                          }}
                          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">{perm.label}</div>
                          <div className="text-[10px] text-slate-400 truncate">{perm.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="px-5 py-2 rounded-xl bg-[#0080ff] hover:bg-blue-600 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {editSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Update Profile</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revoke Biometric Access Confirmation Modal */}
      <RevokeAccessModal
        isOpen={!!employeeToDelete}
        employee={employeeToDelete}
        onClose={() => !deleteLoading && setEmployeeToDelete(null)}
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
      />

      {/* Employee Attendance Report Modal */}
      <EmployeeAttendanceModal
        isOpen={!!selectedEmployeeForReport}
        employee={selectedEmployeeForReport}
        onClose={() => setSelectedEmployeeForReport(null)}
      />
    </div>
  );
};
