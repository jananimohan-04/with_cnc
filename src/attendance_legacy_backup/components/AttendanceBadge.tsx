import React from 'react';

interface Props {
  status: 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | 'OVERTIME' | 'ON_LEAVE' | string;
  className?: string;
}

export function AttendanceBadge({ status, className = '' }: Props) {
  const norm = (status || 'ABSENT').toUpperCase();

  let styles = 'bg-slate-100 text-slate-700 border-slate-200';
  let label = norm;

  if (norm === 'PRESENT') {
    styles = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    label = 'Present';
  } else if (norm === 'LATE') {
    styles = 'bg-amber-50 text-amber-700 border-amber-200';
    label = 'Late Arrival';
  } else if (norm === 'HALF_DAY') {
    styles = 'bg-amber-50 text-amber-800 border-amber-300';
    label = 'Half Day';
  } else if (norm === 'ABSENT') {
    styles = 'bg-rose-50 text-rose-700 border-rose-200';
    label = 'Absent';
  } else if (norm === 'OVERTIME') {
    styles = 'bg-purple-50 text-purple-700 border-purple-200';
    label = 'Overtime';
  } else if (norm === 'ON_LEAVE') {
    styles = 'bg-blue-50 text-blue-700 border-blue-200';
    label = 'On Leave';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  );
}
