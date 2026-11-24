import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon: LucideIcon;
  variant?: 'amber' | 'emerald' | 'rose' | 'blue' | 'purple' | 'slate';
}

const colorMap = {
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    iconBg: 'bg-amber-400/20 text-amber-400',
    text: 'text-amber-400',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    iconBg: 'bg-emerald-400/20 text-emerald-400',
    text: 'text-emerald-400',
  },
  rose: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    iconBg: 'bg-rose-400/20 text-rose-400',
    text: 'text-rose-400',
  },
  blue: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    iconBg: 'bg-blue-400/20 text-blue-400',
    text: 'text-blue-400',
  },
  purple: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    iconBg: 'bg-purple-400/20 text-purple-400',
    text: 'text-purple-400',
  },
  slate: {
    bg: 'bg-slate-800/50',
    border: 'border-slate-700',
    iconBg: 'bg-slate-700 text-slate-300',
    text: 'text-slate-200',
  },
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subValue,
  icon: Icon,
  variant = 'slate',
}) => {
  const c = colorMap[variant];

  return (
    <div className={`p-4 rounded-xl border ${c.bg} ${c.border} flex items-center justify-between shadow-sm`}>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <h3 className="text-2xl font-black text-white mt-1">{value}</h3>
        {subValue && <p className={`text-xs mt-0.5 font-medium ${c.text}`}>{subValue}</p>}
      </div>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${c.iconBg}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
};
