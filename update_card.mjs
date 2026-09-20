import fs from 'fs';
import path from 'path';

const filePath = path.resolve('src/components/ui/Card.tsx');
let code = fs.readFileSync(filePath, 'utf8');

// Upgrade Button variants
code = code.replace(
  /const variants: Record<string, string> = \{[\s\S]*?\};/,
  `const variants: Record<string, string> = {
    primary: 'bg-brand-600 hover:bg-brand-500 text-white shadow-md shadow-brand-500/20 hover:shadow-brand-500/40 border border-brand-600 hover:-translate-y-0.5',
    secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm hover:shadow-md hover:-translate-y-0.5',
    ghost: 'hover:bg-slate-100 text-slate-600 hover:-translate-y-0.5',
    danger: 'bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-500/20 hover:shadow-red-500/40 border border-red-600 hover:-translate-y-0.5',
  };`
);

// Upgrade StatCard to have better premium styling
const oldStatCard = /export function StatCard\(\{[\s\S]*?\} \) \{[\s\S]*?return \([\s\S]*?\);\n\}/;
const newStatCard = `export function StatCard({
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
    brand: 'bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 border-brand-200 shadow-inner',
    accent: 'bg-gradient-to-br from-accent-50 to-accent-100 text-accent-600 border-accent-200 shadow-inner',
    success: 'bg-gradient-to-br from-green-50 to-green-100 text-green-600 border-green-200 shadow-inner',
    warning: 'bg-gradient-to-br from-amber-50 to-amber-100 text-amber-600 border-amber-200 shadow-inner',
    error: 'bg-gradient-to-br from-red-50 to-red-100 text-red-600 border-red-200 shadow-inner',
    navy: 'bg-gradient-to-br from-navy-50 to-navy-100 text-navy-700 border-navy-200 shadow-inner',
    neutral: 'bg-gradient-to-br from-slate-50 to-slate-100 text-slate-600 border-slate-200 shadow-inner',
    info: 'bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 border-blue-200 shadow-inner',
  };
  return (
    <Card className="p-5 hover:shadow-premium-hover hover:-translate-y-1 transition-all duration-300 group overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/40 to-transparent rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{label}</p>
          <p className="text-[28px] font-bold text-slate-800 tracking-tight leading-none group-hover:text-brand-600 transition-colors">{value}</p>
          {trend && (
            <div className="flex items-center gap-1 mt-3">
              <span
                className={\`text-xs font-semibold px-1.5 py-0.5 rounded-full \${
                  trendUp ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }\`}
              >
                {trendUp ? '↑' : '↓'} {trend}
              </span>
            </div>
          )}
        </div>
        <div className={\`w-12 h-12 rounded-xl flex items-center justify-center border \${accentMap[accent]} transition-transform duration-300 group-hover:scale-110\`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}`;

code = code.replace(oldStatCard, newStatCard);

// Make standard Card a bit nicer
code = code.replace(
  /export function Card\(\{ children, className = '', onClick \}: \{ children: ReactNode; className\?: string; onClick\?: \(\) => void \}\) \{[\s\S]*?return \([\s\S]*?\);\n\}/,
  `export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div className={\`bg-white rounded-2xl border border-slate-200/60 shadow-premium transition-shadow duration-300 \${className}\`} onClick={onClick}>
      {children}
    </div>
  );
}`
);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Card styles updated');
