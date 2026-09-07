import type { ReactNode } from 'react';

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-card ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
      <div className="flex items-center gap-3">
        {icon && <div className="text-brand-600">{icon}</div>}
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  trendUp,
  accent = 'brand',
}: {
  label: string;
  value: string;
  icon: ReactNode;
  trend?: string;
  trendUp?: boolean;
  accent?: 'brand' | 'accent' | 'success' | 'warning' | 'error' | 'navy' | 'neutral' | 'info';
}) {
  const accentMap: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    accent: 'bg-accent-50 text-accent-600',
    success: 'bg-green-50 text-green-600',
    warning: 'bg-amber-50 text-amber-600',
    error: 'bg-red-50 text-red-600',
    navy: 'bg-navy-50 text-navy-700',
    neutral: 'bg-slate-100 text-slate-600',
    info: 'bg-blue-50 text-blue-600',
  };
  return (
    <Card className="p-5 hover:shadow-card-hover transition-shadow duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-slate-800 mt-2">{value}</p>
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              <span
                className={`text-xs font-semibold ${
                  trendUp ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {trendUp ? '↑' : '↓'} {trend}
              </span>
            </div>
          )}
        </div>
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${accentMap[accent]}`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

type BadgeVariant =
  | 'brand' | 'success' | 'warning' | 'error' | 'neutral' | 'info' | 'accent';

const badgeStyles: Record<BadgeVariant, string> = {
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  accent: 'bg-accent-50 text-accent-700 border-accent-200',
};

export function Badge({
  children,
  variant = 'neutral',
  dot = false,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
}) {
  const dotColors: Record<BadgeVariant, string> = {
    brand: 'bg-brand-500',
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    neutral: 'bg-slate-400',
    info: 'bg-blue-500',
    accent: 'bg-accent-500',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeStyles[variant]}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}

export function statusToVariant(status: string): BadgeVariant {
  const s = status.toLowerCase();
  if (['running', 'active', 'completed', 'pass', 'delivered', 'received', 'released', 'accepted', 'confirmed'].includes(s)) return 'success';
  if (['idle', 'planning', 'pending', 'draft', 'scheduled', 'sent', 'new', 'setup'].includes(s)) return 'neutral';
  if (['in progress', 'partially delivered', 'partially received', 'under review', 'quoted', 'in production', 'on order', 'under investigation', 'action taken'].includes(s)) return 'brand';
  if (['maintenance', 'on hold', 'paused', 'low stock', 'delayed', 'overdue', 'rework', 'prototype'].includes(s)) return 'warning';
  if (['breakdown', 'cancelled', 'rejected', 'fail', 'out of stock', 'lost', 'expired', 'suspended', 'open', 'critical'].includes(s)) return 'error';
  if (['obsolete', 'superseded', 'inactive'].includes(s)) return 'neutral';
  return 'neutral';
}

export function priorityToVariant(priority: string): BadgeVariant {
  const p = priority.toLowerCase();
  if (p === 'critical') return 'error';
  if (p === 'high') return 'warning';
  if (p === 'medium') return 'brand';
  return 'neutral';
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  onClick,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const variants: Record<string, string> = {
    primary: 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm',
    secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm',
    ghost: 'hover:bg-slate-100 text-slate-600',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm',
  };
  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg font-medium transition-all duration-150 active:scale-[0.98] ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

export function ProgressBar({
  value,
  max = 100,
  color = 'brand',
  showLabel = false,
  height = 'h-2',
}: {
  value: number;
  max?: number;
  color?: 'brand' | 'success' | 'warning' | 'error' | 'accent' | 'neutral';
  showLabel?: boolean;
  height?: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const colors: Record<string, string> = {
    brand: 'bg-brand-500',
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    accent: 'bg-accent-500',
    neutral: 'bg-slate-400',
  };
  return (
    <div className="w-full">
      <div className={`w-full bg-slate-100 rounded-full overflow-hidden ${height}`}>
        <div
          className={`${colors[color]} ${height} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-slate-500 mt-1 inline-block">{pct.toFixed(0)}%</span>
      )}
    </div>
  );
}
