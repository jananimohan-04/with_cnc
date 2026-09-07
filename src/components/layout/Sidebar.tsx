import { useState } from 'react';
import { ChevronDown, ChevronRight, Cpu } from 'lucide-react';
import { navSections } from '@/config/navigation';

export function Sidebar({
  collapsed,
  onToggle,
  currentPage,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle: () => void;
  currentPage: string;
  onNavigate: (page: string) => void;
}) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    navSections.forEach((s) => initial.add(s.label));
    return initial;
  });

  const toggleSection = (label: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <aside
      className={`${
        collapsed ? 'w-16' : 'w-64'
      } flex-shrink-0 bg-[#0c1525] text-white flex flex-col transition-all duration-300 ease-in-out h-screen sticky top-0 z-30 shadow-[4px_0_24px_rgba(0,0,0,0.2)]`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-navy-800 flex-shrink-0 bg-gradient-to-r from-navy-950 to-navy-900">
        <div className="w-8 h-8 rounded bg-gradient-to-br from-brand-400 to-accent-600 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(99,102,241,0.4)] border border-brand-300/30">
          <Cpu size={18} className="text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden flex flex-col justify-center">
            <h1 className="text-sm font-bold tracking-tight whitespace-nowrap text-white">CNC<span className="text-brand-400">FORGE</span></h1>
            <p className="text-[9px] text-navy-300 font-bold tracking-[0.2em] whitespace-nowrap opacity-80">ERP SYSTEM</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-dark py-4 px-3 space-y-1">
        {navSections.map((section) => {
          const isExpanded = expandedSections.has(section.label);
          const hasActive = section.items.some((i) => currentPage === i.page);
          return (
            <div key={section.label} className="mb-2">
              {!collapsed && (
                <button
                  onClick={() => toggleSection(section.label)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    hasActive ? 'text-brand-300' : 'text-navy-400 hover:text-navy-200'
                  }`}
                >
                  <span>{section.label}</span>
                  <ChevronDown size={12} className={`transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
                </button>
              )}
              {collapsed && (
                <div className="h-px bg-navy-800/50 my-2 mx-1" />
              )}
              {(isExpanded || collapsed) && (
                <div className="mt-1 space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = currentPage === item.page;
                    return (
                      <button
                        key={item.page}
                        onClick={() => onNavigate(item.page)}
                        title={collapsed ? item.label : undefined}
                        className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-all duration-200 group relative ${
                          active
                            ? 'bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-md border-l-2 border-brand-300'
                            : 'text-navy-300 hover:bg-navy-800/80 hover:text-white border-l-2 border-transparent'
                        }`}
                      >
                        <Icon size={16} className={`flex-shrink-0 ${active ? 'text-white' : 'text-navy-400 group-hover:text-brand-300 transition-colors'}`} />
                        {!collapsed && <span className="truncate text-[13px] font-medium">{item.label}</span>}
                        {active && collapsed && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-brand-400 rounded-r-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-3 border-t border-navy-800 bg-navy-950 flex-shrink-0">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs text-navy-400 hover:text-white bg-navy-900 hover:bg-navy-800 border border-navy-800 hover:border-navy-700 rounded-md transition-all shadow-sm"
        >
          <ChevronRight size={14} className={`transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`} />
          {!collapsed && <span className="font-medium tracking-wide">Collapse Menu</span>}
        </button>
      </div>
    </aside>
  );
}
