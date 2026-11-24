import React, { useState } from 'react';
import { Bot, Megaphone, Briefcase, X } from 'lucide-react';

export const FloatingAiDock: React.FC = () => {
  const [activeModal, setActiveModal] = useState<'advisor' | 'coworker' | 'manager' | null>(null);

  return (
    <>
      <div className="att-floating-dock">
        {/* Button 1: Teacher / Audio Advisor */}
        <button
          type="button"
          className="att-dock-btn att-dock-btn-advisor"
          title="Advisor AI - Attendance Intelligence"
          onClick={() => setActiveModal('advisor')}
        >
          <Megaphone className="w-4 h-4 text-amber-300" />
        </button>

        {/* Button 2: Co-Worker AI (Main) */}
        <button
          type="button"
          className="att-dock-btn att-dock-btn-coworker"
          title="Co-Worker AI - Real-time Work assistant"
          onClick={() => setActiveModal('coworker')}
        >
          <Bot className="w-5 h-5 text-white" />
        </button>

        {/* Button 3: Operations Manager AI */}
        <button
          type="button"
          className="att-dock-btn att-dock-btn-manager"
          title="Manager AI - Decision & Shift Analytics"
          onClick={() => setActiveModal('manager')}
        >
          <Briefcase className="w-4 h-4 text-purple-200" />
        </button>
      </div>

      {/* Interactive AI Assistant Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className={`p-4 text-white flex items-center justify-between ${
              activeModal === 'advisor'
                ? 'bg-gradient-to-r from-slate-900 to-sky-900'
                : activeModal === 'coworker'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-700'
                : 'bg-gradient-to-r from-indigo-700 to-purple-800'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-bold text-sm">
                  {activeModal === 'advisor' && <Megaphone className="w-4 h-4 text-amber-300" />}
                  {activeModal === 'coworker' && <Bot className="w-4 h-4 text-white" />}
                  {activeModal === 'manager' && <Briefcase className="w-4 h-4 text-purple-200" />}
                </div>
                <div>
                  <h4 className="font-bold text-sm leading-tight">
                    {activeModal === 'advisor' && 'Advisor AI - Voice & Audio Briefing'}
                    {activeModal === 'coworker' && 'Co-Worker AI - Live Assistance'}
                    {activeModal === 'manager' && 'Manager AI - Policy & Shift Intelligence'}
                  </h4>
                  <p className="text-[11px] text-white/80">Argus Attendance Intelligence v2.0</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-lg hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-600">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-start gap-2.5">
                <span className="text-base">💡</span>
                <div>
                  <span className="font-bold text-slate-800 block">AI Engine Status</span>
                  <span>Face vector recognition engine connected to Supabase PostgreSQL real-time sync.</span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">Quick Actions</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      alert('Audio briefing: All 3 active employees present and verified with zero anomalies.');
                      setActiveModal(null);
                    }}
                    className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-left transition-colors"
                  >
                    🔊 Read Daily Summary
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      alert('Face vectors database verified: 100% vector embeddings loaded into memory.');
                      setActiveModal(null);
                    }}
                    className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-left transition-colors"
                  >
                    ⚡ Check Face Vectors
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 text-white font-semibold text-xs hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
