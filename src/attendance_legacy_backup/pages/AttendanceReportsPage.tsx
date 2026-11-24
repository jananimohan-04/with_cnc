import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Clock,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Search,
  Filter,
} from 'lucide-react';
import { attendanceApi } from '../api';
import { useAuth } from '@/contexts/AuthContext';

export function AttendanceReportsPage() {
  const { company } = useAuth();
  const companyId = company?.id || '';

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchReports = async () => {
    try {
      setLoading(true);
      const res = await attendanceApi.getReports(startDate, endDate, companyId);
      setReportData(res);
    } catch (err) {
      console.error('Failed to load attendance report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) fetchReports();
  }, [startDate, endDate, companyId]);

  // Export CSV
  const handleExportCSV = () => {
    if (!reportData?.summary?.length) return;

    const headers = [
      'Employee Code',
      'Name',
      'Department',
      'Hourly Rate (INR)',
      'Days Present',
      'Late Days',
      'Half Days',
      'Total Hours',
      'Overtime Hours',
      'Estimated Payout (INR)',
    ];

    const rows = reportData.summary.map((item: any) => [
      `"${item.employee_code}"`,
      `"${item.name}"`,
      `"${item.department}"`,
      item.hourly_rate,
      item.total_days_present,
      item.total_late_days,
      item.total_half_days,
      item.total_hours_worked,
      item.overtime_hours,
      item.estimated_payout,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Argus_Attendance_Payroll_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredSummary = (reportData?.summary || []).filter((item: any) => {
    const q = searchQuery.toLowerCase().trim();
    return !q || item.name.toLowerCase().includes(q) || item.employee_code.toLowerCase().includes(q) || item.department.toLowerCase().includes(q);
  });

  const grandTotals = (reportData?.summary || []).reduce(
    (acc: any, cur: any) => ({
      hours: acc.hours + (cur.total_hours_worked || 0),
      overtime: acc.overtime + (cur.overtime_hours || 0),
      payout: acc.payout + (cur.estimated_payout || 0),
    }),
    { hours: 0, overtime: 0, payout: 0 }
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Attendance & Payroll Reports</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Comprehensive shift aggregates, worked hours, late arrival counts, and payroll estimates for {company?.company_name || 'Argus'}.
          </p>
        </div>

        {/* Date Filters & CSV Export */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent focus:outline-none"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent focus:outline-none"
            />
          </div>

          <button
            onClick={fetchReports}
            disabled={loading}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          <button
            onClick={handleExportCSV}
            disabled={!reportData?.summary?.length}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-blue-500" />
            Export Payroll CSV
          </button>
        </div>
      </div>

      {/* Aggregate KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-slate-400">Cumulative Hours</div>
            <div className="text-2xl font-black text-slate-900 font-mono">
              {Math.round(grandTotals.hours * 10) / 10} hrs
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center font-bold">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-slate-400">Overtime Hours</div>
            <div className="text-2xl font-black text-purple-700 font-mono">
              {Math.round(grandTotals.overtime * 10) / 10} hrs
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-slate-400">Est. Payroll Payout</div>
            <div className="text-2xl font-black text-emerald-700 font-mono">
              ₹{grandTotals.payout.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Staff Work Summary</h3>
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search employee…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4 text-center">Days Present</th>
                <th className="py-3 px-4 text-center">Late Days</th>
                <th className="py-3 px-4 text-center">Half Days</th>
                <th className="py-3 px-4 text-right">Total Hours</th>
                <th className="py-3 px-4 text-right">Overtime</th>
                <th className="py-3 px-4 text-right">Hourly Rate</th>
                <th className="py-3 px-4 text-right">Est. Payout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Calculating report metrics…
                  </td>
                </tr>
              ) : filteredSummary.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                    No summary data found for the selected period.
                  </td>
                </tr>
              ) : (
                filteredSummary.map((item: any) => (
                  <tr key={item.employee_id} className="hover:bg-slate-50/60 transition-colors font-sans">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{item.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{item.employee_code}</div>
                    </td>

                    <td className="py-3 px-4 text-slate-600 font-medium">{item.department}</td>

                    <td className="py-3 px-4 text-center font-mono font-bold text-emerald-700">
                      {item.total_days_present}
                    </td>

                    <td className="py-3 px-4 text-center font-mono font-bold text-amber-700">
                      {item.total_late_days}
                    </td>

                    <td className="py-3 px-4 text-center font-mono font-bold text-blue-700">
                      {item.total_half_days}
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {item.total_hours_worked} hrs
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-purple-700">
                      {item.overtime_hours > 0 ? `+${item.overtime_hours} hrs` : '—'}
                    </td>

                    <td className="py-3 px-4 text-right font-mono text-slate-600">
                      ₹{item.hourly_rate}
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                      ₹{item.estimated_payout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
