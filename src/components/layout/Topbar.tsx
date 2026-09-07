import { useState, useRef, useEffect } from 'react';
import {
  Search,
  ChevronDown,
  Bell,
  ChevronRight,
  Settings,
  LogOut,
  User as UserIcon,
  Menu,
  HelpCircle,
} from 'lucide-react';
import { getBreadcrumbs } from '@/config/navigation';
import { recentActivities } from '@/data/mockData';

export function Topbar({
  currentPage,
  onNavigate,
  onLogout,
}: {
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}) {
  const [showNotif, setShowNotif] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const breadcrumbs = getBreadcrumbs(currentPage);
  const notifications = recentActivities.slice(0, 5);

  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-lg border-b border-slate-200 shadow-sm h-16 flex items-center px-4 lg:px-6 gap-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm flex-1 min-w-0">
        <Menu size={18} className="text-slate-400 lg:hidden flex-shrink-0 cursor-pointer hover:text-slate-600 transition-colors" />
        {breadcrumbs.map((bc, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            {i > 0 && <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />}
            <button
              onClick={() => bc.page && onNavigate(bc.page)}
              disabled={!bc.page}
              className={`truncate transition-colors font-medium tracking-wide ${bc.page ? 'text-slate-500 hover:text-brand-600' : 'text-slate-800 font-bold'}`}
            >
              {bc.label}
            </button>
          </div>
        ))}
      </div>

      {/* Global Search */}
      <div className="hidden md:flex items-center relative group">
        <Search size={16} className="absolute left-3 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
        <input
          placeholder="Search parts, orders, machines..."
          className="w-64 lg:w-96 pl-9 pr-12 py-2 text-sm rounded-md bg-slate-50 border border-slate-200 focus:bg-white focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-500/10 transition-all shadow-inner placeholder:text-slate-400"
        />
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-slate-400 bg-white border border-slate-200 rounded shadow-sm px-1.5 py-0.5 font-mono font-bold tracking-widest">
          <span>⌘</span>K
        </kbd>
      </div>

      {/* Mobile search */}
      <button className="md:hidden p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors" onClick={() => setShowSearch(!showSearch)}>
        <Search size={18} />
      </button>

      {/* System Status */}
      <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-100 rounded-full">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse-ring" />
        <span className="text-[10px] font-bold text-green-700 tracking-wide uppercase">System Online</span>
      </div>

      {/* Notifications */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => setShowNotif(!showNotif)}
          className="relative p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors"
        >
          <Bell size={19} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-500 rounded-full ring-2 ring-white" />
        </button>
        {showNotif && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 animate-scale-in overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-800">Notifications</h3>
              <span className="text-xs text-brand-600 font-bold cursor-pointer hover:underline">Mark all read</span>
            </div>
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              {notifications.map((n) => (
                <div key={n.id} className="px-4 py-3 border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors group">
                  <p className="text-sm text-slate-700 font-medium group-hover:text-brand-700 transition-colors">{n.message}</p>
                  <p className="text-xs text-slate-400 mt-1">{n.time}</p>
                </div>
              ))}
            </div>
            <button className="w-full px-4 py-3 text-xs font-bold text-brand-600 hover:bg-slate-50 transition-colors uppercase tracking-wider">
              View all notifications
            </button>
          </div>
        )}
      </div>

      {/* Profile */}
      <div className="relative" ref={profileRef}>
        <button
          onClick={() => setShowProfile(!showProfile)}
          className="flex items-center gap-2.5 p-1 pr-2 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
        >
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center text-white text-xs font-bold shadow-sm">
            RK
          </div>
          <div className="hidden lg:block text-left">
            <p className="text-xs font-bold text-slate-700">Rajesh Kumar</p>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Administrator</p>
          </div>
          <ChevronDown size={14} className="hidden lg:block text-slate-400" />
        </button>
        {showProfile && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 animate-scale-in overflow-hidden z-50">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
              <p className="text-sm font-bold text-slate-800">Rajesh Kumar</p>
              <p className="text-xs text-slate-500 mt-0.5">r.kumar@cncforge.in</p>
            </div>
            <div className="py-2">
              <button className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-brand-600 transition-colors font-medium">
                <UserIcon size={16} /> My Profile
              </button>
              <button className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-brand-600 transition-colors font-medium">
                <Settings size={16} /> Preferences
              </button>
              <button className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-brand-600 transition-colors font-medium">
                <HelpCircle size={16} /> Documentation
              </button>
            </div>
            <div className="border-t border-slate-100 py-2">
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
              >
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
