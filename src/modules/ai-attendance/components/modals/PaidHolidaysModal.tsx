import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { leaveService, type PaidHoliday } from '../../services/leaveService';

interface Props {
  companyId: string;
  onClose: () => void;
  onSaved?: () => void;
}

export const PaidHolidaysModal: React.FC<Props> = ({ companyId, onClose, onSaved }) => {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [holidayName, setHolidayName] = useState('');
  const [holidays, setHolidays] = useState<PaidHoliday[]>([]);
  const [saving, setSaving] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const currentMonthTitle = `${monthNames[month]} ${year}`;

  const loadHolidays = async () => {
    const list = await leaveService.getPaidHolidays(companyId);
    setHolidays(list);
  };

  useEffect(() => {
    loadHolidays();
  }, [companyId]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleYearChange = (newYear: number) => {
    setCurrentDate(new Date(newYear, month, 1));
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now.toISOString().slice(0, 10));
  };

  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayName.trim() || !selectedDate) return;

    try {
      setSaving(true);
      const updated = await leaveService.savePaidHoliday(companyId, {
        date: selectedDate,
        name: holidayName.trim(),
      });
      setHolidays(updated);
      setHolidayName('');
      onSaved?.();
    } catch (err) {
      alert('Failed to save paid holiday: ' + String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    try {
      const updated = await leaveService.deletePaidHoliday(companyId, id);
      setHolidays(updated);
      onSaved?.();
    } catch (err) {
      alert('Failed to delete holiday: ' + String(err));
    }
  };

  // Calendar Day Calculation
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays: Array<{ dayNumber: number | null; dateString: string | null; isSunday: boolean; isSaturday: boolean }> = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push({ dayNumber: null, dateString: null, isSunday: i === 0, isSaturday: i === 6 });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dayOfWeek = new Date(year, month, d).getDay();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarDays.push({
      dayNumber: d,
      dateString: dateStr,
      isSunday: dayOfWeek === 0,
      isSaturday: dayOfWeek === 6,
    });
  }

  // Filter holidays for current month display in table
  const currentMonthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthHolidays = holidays.filter((h) => h.date.startsWith(currentMonthPrefix));

  const yearsOptions = [year - 2, year - 1, year, year + 1, year + 2];

  return (
    <div className="emp-modal-overlay fixed inset-0 bg-slate-900/65 z-[1055] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        {/* Header (Emerald Green #059669) */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <CalendarIcon className="w-5 h-5 text-white" />
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Company Paid Holidays Calendar</h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                Mark company-wide Paid Holidays (e.g. Christmas Holiday). Applied to all employees &amp; auto-calculated in payroll.
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

        {/* 2-Column Body */}
        <div className="p-5 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-5 items-start">
          {/* Left Column: Interactive Calendar */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-white shadow-sm">
            {/* Calendar Month Navigation Header */}
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="px-2.5 py-1 text-xs font-bold rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  &larr; Prev
                </button>
                <span className="text-sm font-extrabold text-slate-900 min-w-[130px] text-center">
                  {currentMonthTitle}
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="px-2.5 py-1 text-xs font-bold rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  Next &rarr;
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  value={year}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                  className="px-2 py-1 text-xs font-bold rounded-md border border-slate-300 bg-white text-slate-800"
                >
                  {yearsOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleToday}
                  className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  Today
                </button>
              </div>
            </div>

            {/* Weekday Labels */}
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold mb-1">
              <div className="text-rose-600 py-1">Sun</div>
              <div className="text-slate-600 py-1">Mon</div>
              <div className="text-slate-600 py-1">Tue</div>
              <div className="text-slate-600 py-1">Wed</div>
              <div className="text-slate-600 py-1">Thu</div>
              <div className="text-slate-600 py-1">Fri</div>
              <div className="text-sky-600 py-1">Sat</div>
            </div>

            {/* Calendar Days Grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((cell, idx) => {
                if (!cell.dayNumber) {
                  return <div key={`empty_${idx}`} className="min-h-[50px] bg-slate-50/50 rounded-lg" />;
                }

                const isSelected = selectedDate === cell.dateString;
                const holiday = holidays.find((h) => h.date === cell.dateString);

                return (
                  <div
                    key={cell.dateString}
                    onClick={() => {
                      if (cell.dateString) setSelectedDate(cell.dateString);
                      if (holiday) setHolidayName(holiday.name);
                    }}
                    className={`min-h-[52px] p-1.5 rounded-lg border text-left cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-2 border-sky-600 bg-sky-50/80 shadow-sm'
                        : holiday
                        ? 'border-emerald-300 bg-emerald-50/70 hover:bg-emerald-100/70'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`text-xs font-bold leading-none ${
                        cell.isSunday
                          ? 'text-rose-600'
                          : cell.isSaturday
                          ? 'text-sky-600'
                          : 'text-slate-800'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>

                    {holiday ? (
                      <span
                        className="text-[9.5px] font-bold text-emerald-800 truncate block mt-1"
                        title={holiday.name}
                      >
                        {holiday.name}
                      </span>
                    ) : (
                      <span className="text-[9.5px] text-slate-400 font-medium block mt-1">
                        Click to set
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Form + Holidays List */}
          <div className="flex flex-col gap-4">
            {/* Form */}
            <form
              onSubmit={handleSaveHoliday}
              className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm"
            >
              <div className="text-xs font-bold text-emerald-900 mb-2.5">Mark Paid Holiday</div>
              <div className="mb-2.5">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 font-semibold"
                  required
                />
              </div>
              <div className="mb-2.5">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Holiday Name</label>
                <input
                  type="text"
                  placeholder="e.g. Christmas Holiday"
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 font-medium"
                  required
                />
              </div>
              <div className="text-[10.5px] text-emerald-700 font-medium mb-3">
                Paid Holiday salary is automatically calculated for all company employees in payroll &amp; payslips.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Paid Holiday'}
                </button>
                <button
                  type="button"
                  onClick={() => setHolidayName('')}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>

            {/* List */}
            <div className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col gap-2">
              <div className="text-xs font-bold text-slate-800">Paid Holidays — {currentMonthTitle}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-1.5 px-2">DATE</th>
                      <th className="py-1.5 px-2">HOLIDAY NAME</th>
                      <th className="py-1.5 px-2 text-center w-16">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthHolidays.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-4 text-center text-slate-400 italic text-[11px]">
                          No Paid Holidays marked in {currentMonthTitle}. Click any date on the calendar to add one.
                        </td>
                      </tr>
                    ) : (
                      monthHolidays.map((h) => (
                        <tr key={h.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-2 font-mono font-bold text-slate-700">{h.date}</td>
                          <td className="py-2 px-2 font-semibold text-emerald-800">{h.name}</td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteHoliday(h.id)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                              title="Delete Holiday"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
