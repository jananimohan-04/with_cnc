import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, 
  Search, 
  Calendar, 
  Download, 
  Printer, 
  FileSpreadsheet, 
  Trash2, 
  Edit3, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  BarChart2, 
  Eye, 
  ArrowUpDown,
  FileText
} from 'lucide-react';

export const PaymentEntry = () => {
  const { organization } = useAuth();

  // Primary data states
  const [entries, setEntries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pagination & Search states
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [globalSearch, setGlobalSearch] = useState('');

  // Column Filters states (matching Image 2)
  const [filterEmployee, setFilterEmployee] = useState('All');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterBank, setFilterBank] = useState('All');
  const [filterPaymentType, setFilterPaymentType] = useState('All');
  const [filterReason, setFilterReason] = useState('All');

  // Sorting
  const [sortField, setSortField] = useState('created_at');
  const [sortAsc, setSortAsc] = useState(false);

  // Modals
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showAddAdvanceModal, setShowAddAdvanceModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceData, setBalanceData] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Edit / Delete state
  const [editingEntry, setEditingEntry] = useState(null);
  const [viewingReceipt, setViewingReceipt] = useState(null);

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    bank: '',
    payment_type: 'UPI',
    reason: 'Advance Repayment',
    receipt: null,
    receipt_filename: ''
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Load initial entries and employees
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [entriesRes, empRes] = await Promise.all([
        api.get('/financial-entries'),
        api.get('/employees')
      ]);
      setEntries(entriesRes.data || []);
      setEmployees(empRes.data || []);
      if (empRes.data?.length > 0 && !formData.employee_id) {
        setFormData(prev => ({ ...prev, employee_id: empRes.data[0].id }));
      }
    } catch (err) {
      console.error('Failed to fetch payment entries', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Fetch balance summary
  const fetchBalanceSummary = async () => {
    setBalanceLoading(true);
    try {
      const res = await api.get('/financial-entries/balance-summary');
      setBalanceData(res.data);
      setShowBalanceModal(true);
    } catch (err) {
      console.error('Failed to fetch balance summary', err);
    } finally {
      setBalanceLoading(false);
    }
  };

  // Master employees map
  const empMap = useMemo(() => {
    const map = new Map();
    (employees || []).forEach(e => {
      map.set(e.id, e);
      if (e.employee_code) map.set(e.employee_code, e);
    });
    return map;
  }, [employees]);

  // Unique Banks list for column filter
  const uniqueBanks = useMemo(() => {
    const banks = new Set();
    entries.forEach(e => {
      if (e.bank && e.bank.trim()) banks.add(e.bank.trim());
    });
    return Array.from(banks).sort();
  }, [entries]);

  // Handle Form Input Change
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle Receipt Upload
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Receipt file size exceeds 5MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFormData(prev => ({
        ...prev,
        receipt: reader.result,
        receipt_filename: file.name
      }));
    };
    reader.readAsDataURL(file);
  };

  // Open Modal for Add Payment
  const openAddPayment = () => {
    setEditingEntry(null);
    setErrorMsg('');
    setFormData({
      employee_id: employees[0]?.id || '',
      date: new Date().toISOString().split('T')[0],
      amount: '',
      bank: '',
      payment_type: 'UPI',
      reason: 'Advance Repayment',
      receipt: null,
      receipt_filename: ''
    });
    setShowAddAdvanceModal(false);
    setShowAddPaymentModal(true);
  };

  // Open Modal for Add Advance (Giving Advance to Employee)
  const openAddAdvance = () => {
    setEditingEntry(null);
    setErrorMsg('');
    setFormData({
      employee_id: employees[0]?.id || '',
      date: new Date().toISOString().split('T')[0],
      amount: '',
      bank: '',
      payment_type: 'Cash',
      reason: 'Salary Advance',
      receipt: null,
      receipt_filename: ''
    });
    setShowAddPaymentModal(false);
    setShowAddAdvanceModal(true);
  };

  // Open Modal for Edit
  const openEditEntry = (entry) => {
    setEditingEntry(entry);
    setErrorMsg('');
    setFormData({
      employee_id: entry.employee_id || '',
      date: entry.date || (entry.created_at ? entry.created_at.split('T')[0] : ''),
      amount: entry.amount || '',
      bank: entry.bank || '',
      payment_type: entry.payment_type || 'UPI',
      reason: entry.reason || 'Salary',
      receipt: entry.receipt || null,
      receipt_filename: entry.receipt_filename || ''
    });
    setShowAddAdvanceModal(false);
    setShowAddPaymentModal(true);
  };

  // Save Payment Entry or Salary Advance
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.employee_id) {
      setErrorMsg('Please select an employee.');
      return;
    }
    const amt = parseFloat(formData.amount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('Please enter a valid amount greater than 0.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    try {
      if (showAddAdvanceModal) {
        // Issuing a Salary Advance (No installments - full lump sum)
        await api.post('/advances', {
          employee_id: formData.employee_id,
          total_advance: amt,
          date: formData.date,
          bank: formData.bank,
          payment_type: formData.payment_type,
          reason: formData.reason || 'Salary Advance',
          receipt: formData.receipt,
          receipt_filename: formData.receipt_filename
        });
        setSuccessMsg(`Salary advance of ₹${amt.toLocaleString('en-IN')} allocated successfully!`);
      } else if (editingEntry) {
        await api.put(`/financial-entries/${editingEntry.id}`, {
          employee_id: formData.employee_id,
          date: formData.date,
          amount: amt,
          bank: formData.bank,
          payment_type: formData.payment_type,
          reason: formData.reason,
          receipt: formData.receipt,
          receipt_filename: formData.receipt_filename
        });
        setSuccessMsg('Payment entry updated successfully!');
      } else {
        await api.post('/financial-entries', {
          employee_id: formData.employee_id,
          date: formData.date,
          amount: amt,
          bank: formData.bank,
          payment_type: formData.payment_type,
          reason: formData.reason,
          receipt: formData.receipt,
          receipt_filename: formData.receipt_filename
        });
        if (formData.reason === 'Advance Repayment') {
          setSuccessMsg(`Advance repayment of ₹${amt.toLocaleString('en-IN')} recorded successfully! Active advance balance deducted.`);
        } else {
          setSuccessMsg('Payment entry created successfully!');
        }
      }

      setShowAddPaymentModal(false);
      setShowAddAdvanceModal(false);
      fetchAllData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Failed to save payment/advance entry', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to save entry.');
    } finally {
      setSaving(false);
    }
  };

  // Delete Payment Entry
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this payment entry?')) return;
    try {
      await api.delete(`/financial-entries/${id}`);
      setEntries(prev => prev.filter(e => e.id !== id));
      setSuccessMsg('Payment entry deleted successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Failed to delete payment entry', err);
      alert('Failed to delete payment entry.');
    }
  };

  // Filter & Sort Logic
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      // Global Search
      if (globalSearch.trim()) {
        const q = globalSearch.toLowerCase();
        const emp = empMap.get(e.employee_id) || empMap.get(e.employee_code);
        const name = (e.employee_name || (emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() : '')).toLowerCase();
        const code = (e.employee_code || emp?.employee_code || '').toLowerCase();
        const bank = (e.bank || '').toLowerCase();
        const pType = (e.payment_type || '').toLowerCase();
        const reason = (e.reason || '').toLowerCase();
        const amtStr = String(e.amount || '');
        const dateStr = (e.date || '').toLowerCase();
        const tsStr = (e.timestamp || e.created_at || '').toLowerCase();

        const match = name.includes(q) || code.includes(q) || bank.includes(q) || 
                      pType.includes(q) || reason.includes(q) || amtStr.includes(q) || 
                      dateStr.includes(q) || tsStr.includes(q);
        if (!match) return false;
      }

      // Column: Employee
      if (filterEmployee !== 'All') {
        if (e.employee_id !== filterEmployee && e.employee_code !== filterEmployee) return false;
      }

      // Column: Date Range
      const entryDate = e.date || (e.created_at ? e.created_at.split('T')[0] : '');
      if (filterStartDate && entryDate && entryDate < filterStartDate) return false;
      if (filterEndDate && entryDate && entryDate > filterEndDate) return false;

      // Column: Bank
      if (filterBank !== 'All') {
        if ((e.bank || '').toLowerCase() !== filterBank.toLowerCase()) return false;
      }

      // Column: Payment Type
      if (filterPaymentType !== 'All') {
        if ((e.payment_type || '').toLowerCase() !== filterPaymentType.toLowerCase()) return false;
      }

      // Column: Reason
      if (filterReason !== 'All') {
        if ((e.reason || '').toLowerCase() !== filterReason.toLowerCase()) return false;
      }

      return true;
    }).sort((a, b) => {
      let valA = a[sortField] || '';
      let valB = b[sortField] || '';

      if (sortField === 'amount') {
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
        return sortAsc ? valA - valB : valB - valA;
      }

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [entries, globalSearch, filterEmployee, filterStartDate, filterEndDate, filterBank, filterPaymentType, filterReason, sortField, sortAsc, empMap]);

  // Paginated Entries
  const totalEntries = filteredEntries.length;
  const totalPages = Math.ceil(totalEntries / pageSize) || 1;
  const paginatedEntries = useMemo(() => {
    if (pageSize === 'All') return filteredEntries;
    const start = (currentPage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, currentPage, pageSize]);

  // Column Sort Toggle
  const toggleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Export to Excel / CSV
  const handleExportCSV = () => {
    if (filteredEntries.length === 0) {
      alert('No data available to export.');
      return;
    }
    const headers = ['Timestamp', 'Employee Name', 'Employee Code', 'Date', 'Amount (INR)', 'Bank', 'Payment Type', 'Reason'];
    const rows = filteredEntries.map(e => {
      const emp = empMap.get(e.employee_id) || empMap.get(e.employee_code);
      const name = e.employee_name || (emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() : 'Employee');
      const code = e.employee_code || emp?.employee_code || '';
      return [
        `"${e.timestamp || e.created_at || ''}"`,
        `"${name.replace(/"/g, '""')}"`,
        `"${code}"`,
        `"${e.date || ''}"`,
        `"${e.amount || 0}"`,
        `"${(e.bank || '').replace(/"/g, '""')}"`,
        `"${e.payment_type || 'UPI'}"`,
        `"${(e.reason || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Payment_Management_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-5 max-w-[1600px] mx-auto w-full font-sans text-slate-800">
      
      {/* ------------------------------------------------------------- */}
      {/* TOP HEADER SECTION (MATCHING IMAGE 2) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#f0f3f8] px-5 py-3.5 rounded-t-lg border-b-2 border-slate-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <h1 className="text-lg md:text-xl font-black text-[#1e3a5f] tracking-wide uppercase">
          PAYMENT MANAGEMENT
        </h1>

        {/* Action Buttons: Yellow Styling matching uploaded images 2, 3 */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={openAddPayment}
            className="px-3.5 py-1.5 bg-[#f1c40f] hover:bg-[#e2b70b] active:bg-[#d4ab09] text-slate-900 text-xs font-bold rounded shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Add Payment</span>
          </button>

          <button
            type="button"
            onClick={openAddAdvance}
            className="px-3.5 py-1.5 bg-[#f1c40f] hover:bg-[#e2b70b] active:bg-[#d4ab09] text-slate-900 text-xs font-bold rounded shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Add Advance</span>
          </button>

          <button
            type="button"
            onClick={fetchBalanceSummary}
            disabled={balanceLoading}
            className="px-3.5 py-1.5 bg-[#f1c40f] hover:bg-[#e2b70b] active:bg-[#d4ab09] text-slate-900 text-xs font-bold rounded shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <BarChart2 className="w-3.5 h-3.5 text-blue-700 stroke-[2.5]" />
            <span>Balance</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TABLE CONTROLS BAR (MATCHING IMAGE 2) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white p-3 border border-slate-200 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-slate-600">
        
        {/* Left Controls: Show entries & Export buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(e.target.value === 'All' ? 'All' : Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-medium focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value="All">All</option>
            </select>
            <span>entries</span>
          </div>

          <div className="flex items-center border border-slate-300 rounded overflow-hidden">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border-r border-slate-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Excel
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border-r border-slate-300 text-xs font-medium transition-colors cursor-pointer"
            >
              PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
            >
              Print
            </button>
          </div>
        </div>

        {/* Right Search Input */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="font-medium">Search:</span>
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => {
              setGlobalSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500 w-full md:w-56"
          />
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* DATA TABLE WITH INLINE COLUMN FILTERS (EXACTLY MATCHING IMAGE 2) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            
            {/* Header Row 1: Titles with Sort Arrows */}
            <thead className="bg-[#f8fafc] text-slate-800 font-bold border-b border-slate-300">
              <tr>
                <th 
                  onClick={() => toggleSort('timestamp')}
                  className="p-2.5 border-r border-slate-200 cursor-pointer hover:bg-slate-100 whitespace-nowrap"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Timestamp</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th 
                  onClick={() => toggleSort('employee_name')}
                  className="p-2.5 border-r border-slate-200 cursor-pointer hover:bg-slate-100 whitespace-nowrap min-w-[150px]"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Employee</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th 
                  onClick={() => toggleSort('date')}
                  className="p-2.5 border-r border-slate-200 cursor-pointer hover:bg-slate-100 whitespace-nowrap min-w-[150px]"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Date</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th 
                  onClick={() => toggleSort('amount')}
                  className="p-2.5 border-r border-slate-200 cursor-pointer hover:bg-slate-100 whitespace-nowrap text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Amount</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th 
                  onClick={() => toggleSort('bank')}
                  className="p-2.5 border-r border-slate-200 cursor-pointer hover:bg-slate-100 whitespace-nowrap"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Bank</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th 
                  onClick={() => toggleSort('payment_type')}
                  className="p-2.5 border-r border-slate-200 cursor-pointer hover:bg-slate-100 whitespace-nowrap"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Payment Type</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th 
                  onClick={() => toggleSort('reason')}
                  className="p-2.5 border-r border-slate-200 cursor-pointer hover:bg-slate-100 whitespace-nowrap"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Reason</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>

                <th className="p-2.5 border-r border-slate-200 text-center whitespace-nowrap">
                  <span>Receipt</span>
                </th>

                <th className="p-2.5 text-center whitespace-nowrap">
                  <span>Action</span>
                </th>
              </tr>

              {/* Header Row 2: In-Header Column Filter Inputs (Matching Image 2) */}
              <tr className="bg-[#f0f3f8] border-t border-slate-300">
                {/* Timestamp: Empty */}
                <td className="p-1.5 border-r border-slate-200"></td>

                {/* Employee: Dropdown Filter */}
                <td className="p-1.5 border-r border-slate-200">
                  <select
                    value={filterEmployee}
                    onChange={(e) => {
                      setFilterEmployee(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-[11px] focus:outline-none"
                  >
                    <option value="All">All</option>
                    {employees.map(emp => {
                      const name = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || emp.name;
                      return (
                        <option key={emp.id} value={emp.id}>{name} ({emp.employee_code})</option>
                      );
                    })}
                  </select>
                </td>

                {/* Date: Start & End Date Pickers (Image 2) */}
                <td className="p-1.5 border-r border-slate-200 space-y-1">
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => {
                      setFilterStartDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[11px] focus:outline-none"
                    placeholder="mm/dd/yyyy"
                    title="From Date"
                  />
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => {
                      setFilterEndDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[11px] focus:outline-none"
                    placeholder="mm/dd/yyyy"
                    title="To Date"
                  />
                </td>

                {/* Amount: Empty */}
                <td className="p-1.5 border-r border-slate-200"></td>

                {/* Bank: Dropdown Filter */}
                <td className="p-1.5 border-r border-slate-200">
                  <select
                    value={filterBank}
                    onChange={(e) => {
                      setFilterBank(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-[11px] focus:outline-none"
                  >
                    <option value="All">All</option>
                    {uniqueBanks.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </td>

                {/* Payment Type: Dropdown Filter */}
                <td className="p-1.5 border-r border-slate-200">
                  <select
                    value={filterPaymentType}
                    onChange={(e) => {
                      setFilterPaymentType(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-[11px] focus:outline-none"
                  >
                    <option value="All">All</option>
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Net Banking">Net Banking</option>
                    <option value="Mobile Banking">Mobile Banking</option>
                    <option value="Repayment">Repayment</option>
                    <option value="Others">Others</option>
                  </select>
                </td>

                {/* Reason: Dropdown Filter */}
                <td className="p-1.5 border-r border-slate-200">
                  <select
                    value={filterReason}
                    onChange={(e) => {
                      setFilterReason(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-[11px] focus:outline-none"
                  >
                    <option value="All">All</option>
                    <option value="Salary Advance">Salary Advance</option>
                    <option value="Advance Repayment">Advance Repayment</option>
                    <option value="Salary">Salary</option>
                    <option value="Incentive">Incentive</option>
                    <option value="Allowance">Allowance</option>
                    <option value="Other Earnings">Other Earnings</option>
                    <option value="Other Deductions">Other Deductions</option>
                  </select>
                </td>

                {/* Receipt: Empty */}
                <td className="p-1.5 border-r border-slate-200"></td>

                {/* Action: Empty */}
                <td className="p-1.5 text-center">
                  {(filterEmployee !== 'All' || filterStartDate || filterEndDate || filterBank !== 'All' || filterPaymentType !== 'All' || filterReason !== 'All') && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterEmployee('All');
                        setFilterStartDate('');
                        setFilterEndDate('');
                        setFilterBank('All');
                        setFilterPaymentType('All');
                        setFilterReason('All');
                        setCurrentPage(1);
                      }}
                      className="text-[10px] text-red-600 hover:text-red-700 underline font-bold cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </td>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    Loading payment records...
                  </td>
                </tr>
              ) : paginatedEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500 font-medium">
                    No data available in table
                  </td>
                </tr>
              ) : (
                paginatedEntries.map((entry) => {
                  const emp = empMap.get(entry.employee_id) || empMap.get(entry.employee_code);
                  const name = entry.employee_name || (emp ? `${emp.first_name || ''} ${emp.last_name || ''}`.trim() : 'Employee');
                  const code = entry.employee_code || emp?.employee_code || '';
                  const isDeduction = entry.reason === 'Advance Repayment' || entry.reason === 'Other Deductions';
                  const isAdvance = entry.reason === 'Salary Advance' || entry.type === 'ADVANCE';

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                      {/* Timestamp */}
                      <td className="p-2.5 border-r border-slate-200 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {entry.timestamp || (entry.created_at ? new Date(entry.created_at).toLocaleString() : '—')}
                      </td>

                      {/* Employee */}
                      <td className="p-2.5 border-r border-slate-200 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{name}</div>
                        <div className="font-mono text-[10px] text-slate-400">{code}</div>
                      </td>

                      {/* Date */}
                      <td className="p-2.5 border-r border-slate-200 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {entry.date || (entry.created_at ? entry.created_at.split('T')[0] : '—')}
                      </td>

                      {/* Amount */}
                      <td className="p-2.5 border-r border-slate-200 text-right font-mono font-bold text-xs whitespace-nowrap">
                        <span className={isDeduction ? 'text-amber-700' : isAdvance ? 'text-blue-700' : 'text-emerald-700'}>
                          {isDeduction ? '-' : '+'} ₹{Number(entry.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* Bank */}
                      <td className="p-2.5 border-r border-slate-200 text-xs text-slate-700 whitespace-nowrap">
                        {entry.bank || '—'}
                      </td>

                      {/* Payment Type */}
                      <td className="p-2.5 border-r border-slate-200 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
                          {entry.payment_type || 'UPI'}
                        </span>
                      </td>

                      {/* Reason */}
                      <td className="p-2.5 border-r border-slate-200 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          isDeduction 
                            ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                            : isAdvance
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}>
                          {entry.reason || 'Salary'}
                        </span>
                      </td>

                      {/* Receipt */}
                      <td className="p-2.5 border-r border-slate-200 text-center whitespace-nowrap">
                        {entry.receipt ? (
                          <button
                            type="button"
                            onClick={() => setViewingReceipt(entry)}
                            className="p-1 text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded inline-flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                            title="View Receipt"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Actions: Edit & Delete */}
                      <td className="p-2.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditEntry(entry)}
                            className="p-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                            title="Edit entry"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(entry.id)}
                            className="p-1 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title="Delete entry"
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

        {/* Footer: Showing 0 to 0 of 0 entries & Pagination */}
        <div className="px-4 py-3 bg-[#f8fafc] border-t border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
          <div>
            Showing {totalEntries === 0 ? 0 : ((currentPage - 1) * (pageSize === 'All' ? totalEntries : pageSize)) + 1} to{' '}
            {pageSize === 'All' ? totalEntries : Math.min(currentPage * pageSize, totalEntries)} of {totalEntries} entries
          </div>

          {pageSize !== 'All' && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="px-2.5 py-1 border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 rounded text-xs font-medium cursor-pointer"
              >
                Previous
              </button>
              <span className="px-2 font-mono text-xs font-bold text-slate-700">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="px-2.5 py-1 border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 rounded text-xs font-medium cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* ADD / EDIT PAYMENT MODAL (EXACTLY MATCHING IMAGES 3, 4, 5) */}
      {/* ------------------------------------------------------------- */}
      {(showAddPaymentModal || showAddAdvanceModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden my-auto">
            
            {/* Header with 'x' close button (Matching Image 3) */}
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                {editingEntry ? 'Edit Payment Entry' : (showAddAdvanceModal ? 'Issue Salary Advance (Allocate Advance)' : 'Add Manual Payment')}
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowAddPaymentModal(false);
                  setShowAddAdvanceModal(false);
                }}
                className="text-slate-400 hover:text-slate-700 font-mono font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-5 space-y-3.5 text-xs text-slate-800">
              {errorMsg && (
                <div className="p-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
                  {errorMsg}
                </div>
              )}

              {/* Field 1: Employee */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <label className="w-28 font-medium text-slate-700">Employee</label>
                <select
                  name="employee_id"
                  value={formData.employee_id}
                  onChange={handleInputChange}
                  className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500"
                  required
                >
                  {employees.map(emp => {
                    const name = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || emp.name;
                    return (
                      <option key={emp.id} value={emp.id}>
                        {name} ({emp.employee_code})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Field 2: Date */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <label className="w-28 font-medium text-slate-700">Date</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleInputChange}
                  className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              {/* Field 3: Amount */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <label className="w-28 font-medium text-slate-700">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  name="amount"
                  value={formData.amount}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500 font-mono"
                  required
                />
              </div>

              {/* Field 4: Bank */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <label className="w-28 font-medium text-slate-700">Bank</label>
                <input
                  type="text"
                  name="bank"
                  value={formData.bank}
                  onChange={handleInputChange}
                  placeholder="Bank name or account info"
                  className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Field 5: Payment Type (Matching Image 5) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <label className="w-28 font-medium text-slate-700">Payment Type</label>
                <select
                  name="payment_type"
                  value={formData.payment_type}
                  onChange={handleInputChange}
                  className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Net Banking">Net Banking</option>
                  <option value="Mobile Banking">Mobile Banking</option>
                  <option value="Repayment">Repayment</option>
                  <option value="Others">Others</option>
                </select>
              </div>

              {/* Field 6: Reason / Category */}
              {showAddAdvanceModal ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <label className="w-28 font-medium text-slate-700">Category</label>
                  <div className="flex-1 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded text-xs font-bold text-blue-800">
                    Salary Advance (Lump Sum Allocation)
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <label className="w-28 font-medium text-slate-700">Reason</label>
                  <select
                    name="reason"
                    value={formData.reason}
                    onChange={handleInputChange}
                    className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="Advance Repayment">Advance Repayment</option>
                    <option value="Salary">Salary</option>
                    <option value="Incentive">Incentive</option>
                    <option value="Allowance">Allowance</option>
                    <option value="Other Earnings">Other Earnings</option>
                    <option value="Other Deductions">Other Deductions</option>
                  </select>
                </div>
              )}

              {/* Field 7: Receipt Upload (Matching Image 3) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <label className="w-28 font-medium text-slate-700">Receipt</label>
                <div className="flex-1">
                  <input
                    type="file"
                    onChange={handleFileChange}
                    accept="image/*,.pdf"
                    className="w-full text-[11px] text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border file:border-slate-300 file:bg-slate-100 file:text-xs file:font-medium hover:file:bg-slate-200 cursor-pointer"
                  />
                  {formData.receipt_filename && (
                    <div className="text-[10px] text-emerald-600 mt-1 truncate">
                      Attached: {formData.receipt_filename}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions: Save Button (Matching Image 3) */}
              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-white hover:bg-slate-100 border border-slate-400 rounded text-xs font-semibold text-slate-800 transition-colors shadow-sm cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* BALANCE OVERVIEW MODAL (TRIGGERED BY 📊 Balance BUTTON) */}
      {/* ------------------------------------------------------------- */}
      {showBalanceModal && balanceData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
            
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-xs uppercase tracking-wider">
                  Payment & Advance Balance Overview
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowBalanceModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* KPI Overview Strip */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
              <div className="p-2.5 bg-white border border-slate-200 rounded">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Total Payments Logged</div>
                <div className="text-sm font-black text-slate-900 font-mono mt-0.5">
                  ₹{balanceData.total_payments_logged?.toLocaleString('en-IN') || 0}
                </div>
              </div>
              <div className="p-2.5 bg-white border border-slate-200 rounded">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Advances Disbursed</div>
                <div className="text-sm font-black text-blue-700 font-mono mt-0.5">
                  ₹{balanceData.total_advances_disbursed?.toLocaleString('en-IN') || 0}
                </div>
              </div>
              <div className="p-2.5 bg-white border border-slate-200 rounded">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Advances Repaid</div>
                <div className="text-sm font-black text-emerald-700 font-mono mt-0.5">
                  ₹{balanceData.total_advance_repaid?.toLocaleString('en-IN') || 0}
                </div>
              </div>
              <div className="p-2.5 bg-white border border-slate-200 rounded">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Outstanding Balance</div>
                <div className="text-sm font-black text-amber-700 font-mono mt-0.5">
                  ₹{balanceData.outstanding_advance_balance?.toLocaleString('en-IN') || 0}
                </div>
              </div>
            </div>

            {/* Employee Breakdown Table */}
            <div className="p-4 overflow-y-auto flex-1">
              <h3 className="font-bold text-xs text-slate-700 mb-2 uppercase tracking-wide">
                Employee-Wise Balance & Disbursement
              </h3>
              {(!balanceData.employee_balances || balanceData.employee_balances.length === 0) ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  No active advance balances found for employees.
                </div>
              ) : (
                <table className="w-full text-left text-xs border border-slate-200">
                  <thead className="bg-slate-100 text-slate-700 font-bold">
                    <tr>
                      <th className="p-2 border-b">Employee</th>
                      <th className="p-2 border-b">Dept</th>
                      <th className="p-2 border-b text-right">Advance Received</th>
                      <th className="p-2 border-b text-right">Advance Repaid</th>
                      <th className="p-2 border-b text-right">Outstanding Advance</th>
                      <th className="p-2 border-b text-right">Payments Logged</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {balanceData.employee_balances.map(emp => (
                      <tr key={emp.employee_id} className="hover:bg-slate-50">
                        <td className="p-2 font-medium">
                          <div>{emp.employee_name}</div>
                          <div className="text-[10px] font-mono text-slate-400">{emp.employee_code}</div>
                        </td>
                        <td className="p-2 text-slate-600">{emp.department}</td>
                        <td className="p-2 text-right font-mono font-bold text-blue-700">
                          ₹{Number(emp.total_advances_received || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-700">
                          ₹{Number(emp.total_advance_repaid || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-amber-700">
                          ₹{Number(emp.active_advance_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-800">
                          ₹{Number(emp.total_payments_logged || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Close footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowBalanceModal(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* RECEIPT PREVIEW MODAL */}
      {/* ------------------------------------------------------------- */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 max-w-lg w-full overflow-hidden my-auto p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="font-bold text-xs text-slate-900">
                Payment Receipt Attachment
              </div>
              <button
                type="button"
                onClick={() => setViewingReceipt(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto flex items-center justify-center bg-slate-50 rounded p-2">
              {viewingReceipt.receipt?.startsWith('data:image') || viewingReceipt.receipt?.endsWith('.png') || viewingReceipt.receipt?.endsWith('.jpg') ? (
                <img
                  src={viewingReceipt.receipt}
                  alt="Receipt Preview"
                  className="max-w-full max-h-[50vh] object-contain rounded"
                />
              ) : (
                <div className="text-center p-6 space-y-2">
                  <FileText className="w-12 h-12 text-blue-500 mx-auto" />
                  <p className="text-xs text-slate-600 font-medium">{viewingReceipt.receipt_filename || 'Attachment File'}</p>
                  <a
                    href={viewingReceipt.receipt}
                    download={viewingReceipt.receipt_filename || 'receipt'}
                    className="inline-block px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold"
                  >
                    Download File
                  </a>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center text-xs text-slate-500 font-mono pt-1">
              <span>{viewingReceipt.employee_name} • ₹{viewingReceipt.amount}</span>
              <button
                type="button"
                onClick={() => setViewingReceipt(null)}
                className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
