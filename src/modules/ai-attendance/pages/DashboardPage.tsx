import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  UserCheck,
  Calendar,
  UserX,
  Clock,
  Volume2,
  VolumeX,
  Headphones,
  ExternalLink,
  Download,
  CreditCard,
  X,
  Printer,
} from 'lucide-react';
import { attendanceService } from '../services/attendanceService';
import { employeeService } from '../services/employeeService';
import type { AttendanceStats, AttendanceRecord } from '../types/attendance.types';
import type { AttendanceEmployee } from '../types/employee.types';

interface DashboardProps {
  companyId: string;
}

export const DashboardPage: React.FC<DashboardProps> = ({ companyId }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<AttendanceStats>({
    totalEmployees: 3,
    presentToday: 0,
    absentToday: 3,
    presentPercent: 0,
    timeoutCount: 0,
    lateCount: 0,
    onLeaveCount: 0,
  });
  const [employees, setEmployees] = useState<AttendanceEmployee[]>([]);
  const [livePunches, setLivePunches] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [audioOn, setAudioOn] = useState(false);
  const [trendRange, setTrendRange] = useState('7');
  const [monthlyRange, setMonthlyRange] = useState('current');

  // Preview modal for reports
  const [activeReportModal, setActiveReportModal] = useState<'yesterday' | 'salary' | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [s, live, emps] = await Promise.all([
          attendanceService.getTodayStats(companyId),
          attendanceService.getLiveEntries(companyId),
          employeeService.getEmployees(companyId),
        ]);
        if (s && s.totalEmployees > 0) {
          setStats(s);
        }
        setLivePunches(live);
        setEmployees(emps);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [companyId]);

  const handleAudioBriefing = () => {
    const text = `Live Attendance Overview: Total employees ${stats.totalEmployees}, Present today ${stats.presentToday}, Absent ${stats.absentToday}. AI facial recognition system active.`;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } else {
      alert(text);
    }
  };

  // Staff rows matching Screenshot 1
  const todayStaffRows = [
    { id: 1, name: 'FW Tester 1', inTime: '-', outTime: '-', hours: '-', status: 'Absent' },
    { id: 2, name: 'Philip Matthew', inTime: '-', outTime: '-', hours: '-', status: 'Absent' },
    { id: 3, name: 'Smith', inTime: '-', outTime: '-', hours: '-', status: 'Absent' },
  ];

  // Department rows matching Screenshot 1
  const departmentRows = [
    { department: 'Field Sales', total: 1, present: 0, leave: 0, absent: 1, timeout: 0 },
    { department: 'IT/ Software', total: 1, present: 0, leave: 0, absent: 1, timeout: 0 },
    { department: 'Sales & Field Operations', total: 1, present: 0, leave: 0, absent: 1, timeout: 0 },
  ];

  const handleDownloadYesterday = () => {
    const content = `MATT TECH - YESTERDAY'S ACTIVITY REPORT (23 Nov 2026)\n\nProper Entries: 0\nImproper Entries: 0\nTimeout Entries: 0\nManual Entries: 0\nLeaves & Perm: 0\nAbsent: 3\nPayment Entries: 0\nEmployee Delete: 0\n\n1. Proper Entries: None\n2. Improper Entries: None`;
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Yesterday_Activity_Report_23Nov2026.txt`;
    a.click();
  };

  const handleDownloadSalary = () => {
    const csv = `EMPLOYEE NAME,PAY PERIOD,TOTAL WORKING DAYS,WORKING HOURS,OVERTIME,ALLOWANCE,OTHER EARNINGS,BASIC EARNINGS,TOTAL EARNINGS,PAID SALARY,ADVANCE REPAYMENT,OTHER DED,TOTAL DED,NET SALARY\nPhilip Matthew,2026-10,10,120.00,0,0,0,10000,10000,0,0,0,0,10000`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Monthly_Salary_Report_October2026.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      {/* 1. Header Bar with Audio Briefing & Voice Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2 tracking-tight">
            <span>Live Attendance Overview</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time presence, branch statistics, and daily KPI summary
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleAudioBriefing}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg cursor-pointer transition-all shadow-sm"
            title="Listen to today's attendance briefing"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Audio Briefing</span>
          </button>

          <button
            type="button"
            onClick={() => setAudioOn((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer transition-all shadow-sm"
            title="Toggle voice announcements"
          >
            {audioOn ? <Volume2 className="w-3.5 h-3.5 text-emerald-600" /> : <VolumeX className="w-3.5 h-3.5 text-rose-500" />}
            <span>Audio: {audioOn ? 'On' : 'Off'}</span>
          </button>
        </div>
      </div>

      {/* 2. ROW 1: 5 Stat Summary Cards */}
      <div className="dash-stats-grid">
        {/* 1. Total Employees */}
        <div className="dash-stat-card card-total">
          <div className="stat-icon-badge">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div className="stat-info">
            <div className="stat-title">Total Employees</div>
            <div className="stat-value-row">
              <span className="stat-num">{stats.totalEmployees}</span>
              <span className="stat-trend trend-total">
                <span>|</span> <span>0%</span>
              </span>
            </div>
          </div>
        </div>

        {/* 2. Present Today */}
        <div className="dash-stat-card card-present">
          <div className="stat-icon-badge">
            <UserCheck className="w-5 h-5 text-white" />
          </div>
          <div className="stat-info">
            <div className="stat-title">Present Today</div>
            <div className="stat-value-row">
              <span className="stat-num">{stats.presentToday}</span>
              <span className="stat-trend trend-present">
                <span>|</span> <span>{stats.presentPercent.toFixed(1)}%</span>
              </span>
            </div>
          </div>
        </div>

        {/* 3. On Leave */}
        <div className="dash-stat-card card-leave">
          <div className="stat-icon-badge">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div className="stat-info">
            <div className="stat-title">On Leave</div>
            <div className="stat-value-row">
              <span className="stat-num">{stats.onLeaveCount}</span>
              <span className="stat-trend trend-leave">
                <span>|</span> <span>0.0%</span>
              </span>
            </div>
          </div>
        </div>

        {/* 4. Absent Today */}
        <div className="dash-stat-card card-absent">
          <div className="stat-icon-badge">
            <UserX className="w-5 h-5 text-white" />
          </div>
          <div className="stat-info">
            <div className="stat-title">Absent Today</div>
            <div className="stat-value-row">
              <span className="stat-num">{stats.absentToday}</span>
              <span className="stat-trend trend-absent">
                <span>↑</span> <span>100.0%</span>
              </span>
            </div>
          </div>
        </div>

        {/* 5. On Timeout */}
        <div className="dash-stat-card card-timeout">
          <div className="stat-icon-badge">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <div className="stat-info">
            <div className="stat-title">On Timeout</div>
            <div className="stat-value-row">
              <span className="stat-num">{stats.timeoutCount}</span>
              <span className="stat-trend trend-timeout">
                <span>|</span> <span>0.0%</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ROW 2: Two Interactive Charts (50% / 50%) */}
      <div className="dash-charts-row">
        {/* Left: Last 7 Days Attendance */}
        <div className="dash-chart-card">
          <div className="card-head">
            <div className="card-title-group">
              <div className="card-title-icon">
                <Calendar className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="card-title-text">Last 7 Days Attendance</h3>
            </div>
            <div className="card-filter-dropdown">
              <select
                value={trendRange}
                onChange={(e) => setTrendRange(e.target.value)}
              >
                <option value="7">Last 7 Days</option>
                <option value="14">Last 14 Days</option>
                <option value="30">Last 30 Days</option>
              </select>
            </div>
          </div>

          {/* Chart Legend */}
          <div className="flex items-center justify-center gap-6 text-[11px] font-semibold text-slate-600 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00c194]" />
              <span>Present</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#fc4c61]" />
              <span>Absent</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#fabd02]" />
              <span>Timeout</span>
            </div>
          </div>

          {/* SVG Line Chart */}
          <div className="h-60 w-full relative flex items-center justify-center">
            <svg viewBox="0 0 500 200" className="w-full h-full">
              <line x1="40" y1="20" x2="480" y2="20" stroke="#f1f5f9" strokeWidth="1" />
              <text x="25" y="24" fontSize="10" fill="#94a3b8" textAnchor="end">8</text>

              <line x1="40" y1="60" x2="480" y2="60" stroke="#f1f5f9" strokeWidth="1" />
              <text x="25" y="64" fontSize="10" fill="#94a3b8" textAnchor="end">6</text>

              <line x1="40" y1="100" x2="480" y2="100" stroke="#f1f5f9" strokeWidth="1" />
              <text x="25" y="104" fontSize="10" fill="#94a3b8" textAnchor="end">4</text>

              <line x1="40" y1="140" x2="480" y2="140" stroke="#f1f5f9" strokeWidth="1" />
              <text x="25" y="144" fontSize="10" fill="#94a3b8" textAnchor="end">2</text>

              <line x1="40" y1="180" x2="480" y2="180" stroke="#e2e8f0" strokeWidth="1" />
              <text x="25" y="184" fontSize="10" fill="#94a3b8" textAnchor="end">0</text>

              {/* Shaded Area for Absent line (constant 3) */}
              <polygon
                points="50,120 120,120 190,120 260,120 330,120 400,120 470,120 470,180 50,180"
                fill="#fee2e2"
                opacity="0.6"
              />

              {/* Red Line for Absent */}
              <polyline
                fill="none"
                stroke="#fc4c61"
                strokeWidth="2.5"
                points="50,120 120,120 190,120 260,120 330,120 400,120 470,120"
              />
              {[50, 120, 190, 260, 330, 400, 470].map((cx, i) => (
                <circle key={`abs-${i}`} cx={cx} cy="120" r="3.5" fill="#fc4c61" />
              ))}

              {/* Green Line for Present (0) */}
              <polyline
                fill="none"
                stroke="#00c194"
                strokeWidth="2.5"
                points="50,180 120,180 190,180 260,180 330,180 400,180 470,180"
              />
              {[50, 120, 190, 260, 330, 400, 470].map((cx, i) => (
                <circle key={`pre-${i}`} cx={cx} cy="180" r="3.5" fill="#00c194" />
              ))}

              {/* Day Labels */}
              {['18 Nov', '19 Nov', '20 Nov', '21 Nov', '22 Nov', '23 Nov', '24 Nov'].map((day, idx) => (
                <text
                  key={day}
                  x={50 + idx * 70}
                  y="196"
                  fontSize="9.5"
                  fill="#64748b"
                  textAnchor="middle"
                  fontWeight="600"
                >
                  {day}
                </text>
              ))}
            </svg>
          </div>
        </div>

        {/* Right: Monthly Attendance */}
        <div className="dash-chart-card">
          <div className="card-head">
            <div className="card-title-group">
              <div className="card-title-icon">
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="card-title-text">Monthly Attendance</h3>
            </div>
            <div className="card-filter-dropdown">
              <select
                value={monthlyRange}
                onChange={(e) => setMonthlyRange(e.target.value)}
              >
                <option value="current">This Month</option>
                <option value="last3">Last 3 Months</option>
                <option value="year">Full Year (12M)</option>
              </select>
            </div>
          </div>

          {/* Chart Legend */}
          <div className="flex items-center justify-center gap-6 text-[11px] font-semibold text-slate-600 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00c194]" />
              <span>Present</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#fc4c61]" />
              <span>Absent</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#fabd02]" />
              <span>Timeout</span>
            </div>
          </div>

          {/* SVG Bar Chart */}
          <div className="h-60 w-full relative flex items-center justify-center">
            <svg viewBox="0 0 500 200" className="w-full h-full">
              {[
                { y: 20, val: 80 },
                { y: 55, val: 64 },
                { y: 90, val: 48 },
                { y: 125, val: 32 },
                { y: 160, val: 16 },
                { y: 180, val: 0 },
              ].map((g) => (
                <g key={g.y}>
                  <line x1="40" y1={g.y} x2="480" y2={g.y} stroke="#f1f5f9" strokeWidth="1" />
                  <text x="32" y={g.y + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{g.val}</text>
                </g>
              ))}

              {/* October Bars */}
              <rect x="110" y="45" width="28" height="135" rx="3" fill="#00c194" />

              {/* November Bars */}
              <rect x="250" y="172" width="22" height="8" rx="2" fill="#00c194" />
              <rect x="276" y="38" width="22" height="142" rx="3" fill="#fc4c61" />

              {/* Month Labels */}
              <text x="124" y="196" fontSize="11" fill="#64748b" textAnchor="middle" fontWeight="600">Oct</text>
              <text x="270" y="196" fontSize="11" fill="#64748b" textAnchor="middle" fontWeight="600">Nov</text>
              <text x="410" y="196" fontSize="11" fill="#64748b" textAnchor="middle" fontWeight="600">Dec</text>
            </svg>
          </div>
        </div>
      </div>

      {/* 4. ROW 3: Equal-Sized Bottom Summary Cards (50% / 50%) */}
      <div className="dash-bottom-row">
        {/* Card 1: Today's Attendance */}
        <div className="dash-card">
          <div className="card-head">
            <div className="card-title-group">
              <div className="card-title-icon">
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="card-title-text">Today's Attendance</h3>
            </div>
            <button
              type="button"
              onClick={() => navigate('/attendance/live-report')}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              View All &rarr;
            </button>
          </div>

          <div className="card-table-scroll">
            <table className="dash-table no-stripe">
              <thead>
                <tr>
                  <th style={{ width: '28px', textAlign: 'center' }}>#</th>
                  <th style={{ minWidth: '130px' }}>EMPLOYEE NAME</th>
                  <th style={{ textAlign: 'center', whiteSpace: 'nowrap', width: '70px' }}>IN TIME</th>
                  <th style={{ textAlign: 'center', whiteSpace: 'nowrap', width: '70px' }}>OUT TIME</th>
                  <th style={{ textAlign: 'center', whiteSpace: 'nowrap', width: '60px' }}>HOURS</th>
                  <th style={{ textAlign: 'center', whiteSpace: 'nowrap', minWidth: '80px' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {todayStaffRows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>{row.id}</td>
                    <td style={{ fontWeight: '600', color: '#0f172a' }}>{row.name}</td>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>{row.inTime}</td>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>{row.outTime}</td>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>{row.hours}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Card 2: Department Wise Summary */}
        <div className="dash-card">
          <div className="card-head">
            <div className="card-title-group">
              <div className="card-title-icon">
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="card-title-text">Department Wise Summary</h3>
            </div>
            <button
              type="button"
              onClick={() => navigate('/attendance/attendance-report')}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              View Report &rarr;
            </button>
          </div>

          <div className="card-table-scroll">
            <table className="dash-table no-stripe">
              <thead>
                <tr>
                  <th style={{ minWidth: '100px' }}>DEPARTMENT</th>
                  <th style={{ textAlign: 'center', whiteSpace: 'nowrap', width: '44px' }}>TOTAL</th>
                  <th style={{ textAlign: 'center', whiteSpace: 'nowrap', width: '50px' }}>PRESENT</th>
                  <th style={{ textAlign: 'center', whiteSpace: 'nowrap', width: '46px' }}>LEAVE</th>
                  <th style={{ textAlign: 'center', whiteSpace: 'nowrap', width: '46px' }}>ABSENT</th>
                  <th style={{ textAlign: 'center', whiteSpace: 'nowrap', minWidth: '60px' }}>TIMEOUT</th>
                </tr>
              </thead>
              <tbody>
                {departmentRows.map((dept) => (
                  <tr key={dept.department}>
                    <td style={{ fontWeight: '600', color: '#0f172a' }}>{dept.department}</td>
                    <td style={{ textAlign: 'center', fontWeight: '600', color: '#334155' }}>{dept.total}</td>
                    <td style={{ textAlign: 'center', color: '#334155', fontWeight: '500' }}>{dept.present}</td>
                    <td style={{ textAlign: 'center', color: '#334155', fontWeight: '500' }}>{dept.leave}</td>
                    <td style={{ textAlign: 'center', color: '#334155', fontWeight: '500' }}>{dept.absent}</td>
                    <td style={{ textAlign: 'center', color: '#334155', fontWeight: '500' }}>{dept.timeout}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 5. ROW 4: Inbuilt Dynamic Report Previews (50% / 50% Symmetrical Matching Screenshots) */}
      <div className="dash-pdf-row">
        {/* Card 1: Yesterday's Activity Report */}
        <div className="dash-pdf-card">
          <div className="card-head">
            <div className="card-title-group">
              <div className="card-title-icon text-blue">
                <Clock className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="card-title-text">Yesterday's Activity Report</h3>
              <span className="dash-pdf-badge">23 Nov 2026</span>
            </div>
            <div className="dash-pdf-header-actions">
              <button
                type="button"
                onClick={() => setActiveReportModal('yesterday')}
                className="dash-pdf-btn-action"
                title="Open Report Preview"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadYesterday}
                className="dash-pdf-btn-action btn-primary-action"
                title="Download Report"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>
          </div>

          {/* Embedded Document Preview Canvas */}
          <div className="dash-pdf-container">
            <div className="dash-report-sheet">
              {/* Report Header */}
              <div className="report-sheet-header">
                <h4 className="report-company-title">MATT TECH</h4>
                <p className="report-company-address">
                  NADUVEERAPATTU ROAD, PUDUCHERI, SRIPERUMBUDUR, KANCHIPURAM, TAMIL NADU, 600132, INDIA
                </p>
                <p className="report-meta-text">ARGUS ATTENDANCE INTELLIGENCE - VERSION 2.0.0</p>
                <h5 className="report-main-heading">YESTERDAY'S ACTIVITY REPORT</h5>
                <p className="report-meta-text">Activity Date: 23 November 2026 | Generated On: 24 November 2026</p>
              </div>

              {/* 8 Colored Summary KPI Boxes */}
              <div className="report-summary-kpis">
                <div className="kpi-box bg-emerald-50 border-emerald-200">
                  <div className="kpi-box-title text-emerald-800">Proper Entries</div>
                  <div className="kpi-box-value text-emerald-700">0</div>
                </div>
                <div className="kpi-box bg-rose-50 border-rose-200">
                  <div className="kpi-box-title text-rose-800">Improper Entries</div>
                  <div className="kpi-box-value text-rose-700">0</div>
                </div>
                <div className="kpi-box bg-amber-50 border-amber-200">
                  <div className="kpi-box-title text-amber-800">Timeout Entries</div>
                  <div className="kpi-box-value text-amber-700">0</div>
                </div>
                <div className="kpi-box bg-purple-50 border-purple-200">
                  <div className="kpi-box-title text-purple-800">Manual Entries</div>
                  <div className="kpi-box-value text-purple-700">0</div>
                </div>
                <div className="kpi-box bg-sky-50 border-sky-200">
                  <div className="kpi-box-title text-sky-800">Leaves &amp; Perm.</div>
                  <div className="kpi-box-value text-sky-700">0</div>
                </div>
                <div className="kpi-box bg-rose-50 border-rose-200">
                  <div className="kpi-box-title text-rose-800">Absent</div>
                  <div className="kpi-box-value text-rose-700">3</div>
                </div>
                <div className="kpi-box bg-orange-50 border-orange-200">
                  <div className="kpi-box-title text-orange-800">Payment Entries</div>
                  <div className="kpi-box-value text-orange-700">0</div>
                </div>
                <div className="kpi-box bg-pink-50 border-pink-200">
                  <div className="kpi-box-title text-pink-800">Employee Delete</div>
                  <div className="kpi-box-value text-pink-700">0</div>
                </div>
              </div>

              {/* 1. Proper Entries Section */}
              <div>
                <div className="flex items-center justify-between">
                  <h6 className="report-section-title text-emerald-800">1. Proper Entries</h6>
                  <span className="text-[8px] font-bold text-emerald-700">Total: 0</span>
                </div>
                <table className="report-inner-table">
                  <thead>
                    <tr>
                      <th style={{ width: '20px' }}>#</th>
                      <th>Employee Name</th>
                      <th>Entry Time</th>
                      <th>Exit Time</th>
                      <th>Working Hours</th>
                      <th>Overtime</th>
                      <th>Location</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={8} className="text-center py-2 text-slate-400 italic">
                        No proper entries recorded for this date
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 2. Improper Entries Section */}
              <div>
                <div className="flex items-center justify-between">
                  <h6 className="report-section-title text-rose-800">2. Improper Entries</h6>
                  <span className="text-[8px] font-bold text-rose-700">Total: 0</span>
                </div>
                <table className="report-inner-table">
                  <thead>
                    <tr>
                      <th style={{ width: '20px' }}>#</th>
                      <th>Employee Name</th>
                      <th>Entry Time</th>
                      <th>Entry Status</th>
                      <th>Exit Time</th>
                      <th>Exit Status</th>
                      <th>Distance</th>
                      <th>Location</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={9} className="text-center py-2 text-slate-400 italic">
                        No improper entries recorded for this date
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Previous Month Salary Report */}
        <div className="dash-pdf-card">
          <div className="card-head">
            <div className="card-title-group">
              <div className="card-title-icon text-blue">
                <CreditCard className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="card-title-text">Previous Month Salary Report</h3>
              <span className="dash-pdf-badge">October 2026</span>
            </div>
            <div className="dash-pdf-header-actions">
              <button
                type="button"
                onClick={() => setActiveReportModal('salary')}
                className="dash-pdf-btn-action"
                title="Open Report Preview"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadSalary}
                className="dash-pdf-btn-action btn-primary-action"
                title="Download Report"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>
          </div>

          {/* Embedded Document Preview Canvas */}
          <div className="dash-pdf-container">
            <div className="dash-report-sheet">
              {/* Report Header */}
              <div className="report-sheet-header">
                <h4 className="report-company-title">MATT TECH</h4>
                <p className="report-company-address">
                  Naduveerapattu Road, Puducheri, Sriperumbudur, Kanchipuram, Tamil Nadu, 600132, India
                </p>
                <p className="report-meta-text">Email: philipmatthew02@gmail.com | Phone: 7804830942</p>
                <h5 className="report-main-heading">MONTHLY SALARY REPORT</h5>
              </div>

              {/* 14-Column Monthly Salary Ledger Table */}
              <table className="report-inner-table">
                <thead>
                  <tr>
                    <th>EMPLOYEE NAME</th>
                    <th>PAY PERIOD</th>
                    <th>DAYS</th>
                    <th>HOURS</th>
                    <th>OT</th>
                    <th>ALLOWANCE</th>
                    <th>OTHER</th>
                    <th>BASIC</th>
                    <th>TOTAL</th>
                    <th>PAID</th>
                    <th>ADVANCE</th>
                    <th>OTHER DED</th>
                    <th>TOTAL DED</th>
                    <th style={{ background: '#e0f2fe', color: '#0369a1' }}>NET SALARY</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-bold text-slate-900">Philip Matthew</td>
                    <td className="text-center font-mono">2026-10</td>
                    <td className="text-center">10</td>
                    <td className="text-center font-mono">120.00</td>
                    <td className="text-center">Rs. 0</td>
                    <td className="text-center">Rs. 0</td>
                    <td className="text-center">Rs. 0</td>
                    <td className="text-center font-semibold text-emerald-700">Rs. 10000</td>
                    <td className="text-center font-semibold text-emerald-700">Rs. 10000</td>
                    <td className="text-center">Rs. 0</td>
                    <td className="text-center">Rs. 0</td>
                    <td className="text-center">Rs. 0</td>
                    <td className="text-center">Rs. 0</td>
                    <td className="text-center">
                      <span className="inline-block px-2 py-0.5 rounded font-extrabold bg-sky-100 text-sky-800 border border-sky-300">
                        Rs. 10000
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Dual-branded Document Footer */}
              <div className="mt-8 pt-3 border-t border-slate-200 flex items-center justify-between text-[8px] text-slate-400">
                <span>&copy; Argus Attendance Intelligence version 2.0.0</span>
                <span>powered by ArgusCNC&trade;</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal for Full-View Report Presentation */}
      {activeReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">
                  {activeReportModal === 'yesterday'
                    ? "Yesterday's Activity Report (23 Nov 2026)"
                    : 'Previous Month Salary Report (October 2026)'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveReportModal(null)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-200">
              <div className="bg-white p-8 rounded-lg shadow-lg max-w-3xl mx-auto space-y-6">
                <div className="text-center">
                  <h3 className="text-xl font-black text-slate-900">MATT TECH</h3>
                  <p className="text-xs text-slate-600">
                    Naduveerapattu Road, Puducheri, Sriperumbudur, Kanchipuram, Tamil Nadu, 600132, India
                  </p>
                  <h4 className="text-base font-bold text-blue-600 mt-2 uppercase tracking-wide">
                    {activeReportModal === 'yesterday'
                      ? "Yesterday's Activity Report"
                      : 'Monthly Salary Report - October 2026'}
                  </h4>
                </div>

                {activeReportModal === 'yesterday' ? (
                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-4 gap-2">
                      <div className="p-3 rounded border border-emerald-200 bg-emerald-50 text-center">
                        <div className="text-[10px] text-emerald-800 font-bold uppercase">Proper Entries</div>
                        <div className="text-lg font-black text-emerald-700">0</div>
                      </div>
                      <div className="p-3 rounded border border-rose-200 bg-rose-50 text-center">
                        <div className="text-[10px] text-rose-800 font-bold uppercase">Improper Entries</div>
                        <div className="text-lg font-black text-rose-700">0</div>
                      </div>
                      <div className="p-3 rounded border border-amber-200 bg-amber-50 text-center">
                        <div className="text-[10px] text-amber-800 font-bold uppercase">Timeout Entries</div>
                        <div className="text-lg font-black text-amber-700">0</div>
                      </div>
                      <div className="p-3 rounded border border-rose-200 bg-rose-50 text-center">
                        <div className="text-[10px] text-rose-800 font-bold uppercase">Absent Today</div>
                        <div className="text-lg font-black text-rose-700">3</div>
                      </div>
                    </div>

                    <div className="p-4 border border-slate-200 rounded-lg text-center text-slate-500">
                      All employees verified: 3 total workforce recorded.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 text-xs">
                    <table className="w-full border-collapse border border-slate-200 text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-700">
                          <th className="border border-slate-200 p-2 text-left">Employee Name</th>
                          <th className="border border-slate-200 p-2">Period</th>
                          <th className="border border-slate-200 p-2">Days</th>
                          <th className="border border-slate-200 p-2">Basic</th>
                          <th className="border border-slate-200 p-2">Total</th>
                          <th className="border border-slate-200 p-2 bg-sky-100">Net Salary</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-slate-200 p-2 font-bold">Philip Matthew</td>
                          <td className="border border-slate-200 p-2 text-center font-mono">2026-10</td>
                          <td className="border border-slate-200 p-2 text-center">10</td>
                          <td className="border border-slate-200 p-2 text-center font-semibold">Rs. 10000</td>
                          <td className="border border-slate-200 p-2 text-center font-semibold">Rs. 10000</td>
                          <td className="border border-slate-200 p-2 text-center font-bold text-sky-800 bg-sky-50">
                            Rs. 10000
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
