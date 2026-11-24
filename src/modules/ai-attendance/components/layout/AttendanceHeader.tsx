import React, { useState } from 'react';
import { User, ChevronDown } from 'lucide-react';

interface HeaderProps {
  companyName: string;
  onToggleSidebar?: () => void;
}

export const AttendanceHeader: React.FC<HeaderProps> = ({ companyName, onToggleSidebar }) => {
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('All Branches');

  const branches = ['All Branches', 'Home Branch', 'Plant 1 - Ambattur', 'Plant 2 - Oragadam'];

  return (
    <header className="att-top-navbar">
      <div className="att-nav-left">
        <button
          type="button"
          className="att-hamburger-btn"
          onClick={onToggleSidebar}
          title="Toggle Navigation"
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <div className="att-nav-center">
        <div className="att-nav-title">
          MATT TECH
        </div>
      </div>

      <div className="att-nav-right">
        {/* Branch Selector Pill */}
        <div className="relative">
          <button
            type="button"
            className="att-nav-branch-pill"
            onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
            title="Click to switch active branch view"
          >
            <span>🏢</span>
            <span>{selectedBranch}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#0284c7]" />
          </button>

          {branchDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50">
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Switch Branch Location
              </div>
              {branches.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    setSelectedBranch(b);
                    setBranchDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold flex items-center justify-between transition-colors ${
                    selectedBranch === b ? 'bg-sky-50 text-sky-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{b}</span>
                  {selectedBranch === b && <span className="text-sky-600 font-bold">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Profile Circle Avatar */}
        <div className="att-nav-avatar" title={`User Profile - ${companyName}`}>
          <User className="w-4 h-4 text-slate-600" />
        </div>
      </div>
    </header>
  );
};
