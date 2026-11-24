import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, X } from 'lucide-react';
import { leaveService, type OverallLeaveType } from '../../services/leaveService';

interface Props {
  companyId: string;
  onClose: () => void;
  onSaved?: () => void;
}

export const CompanyLeavesModal: React.FC<Props> = ({ companyId, onClose, onSaved }) => {
  const [leaves, setLeaves] = useState<OverallLeaveType[]>([]);
  const [name, setName] = useState('');
  const [count, setCount] = useState<number | ''>('');
  const [type, setType] = useState<'Days - Leave' | 'Hours - Permission'>('Days - Leave');
  const [saving, setSaving] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    (async () => {
      const data = await leaveService.getCompanyOverallLeaves(companyId);
      setLeaves(data);
    })();
  }, [companyId]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const countNum = Number(count) || 0;
    if (countNum <= 0) return;

    const newItem: OverallLeaveType = {
      id: `ovl_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: name.trim(),
      count: countNum,
      type,
    };

    setLeaves((prev) => [...prev, newItem]);
    setName('');
    setCount('');
    setType('Days - Leave');
  };

  const handleDelete = (id: string) => {
    setLeaves((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSaveAndApply = async () => {
    try {
      setSaving(true);
      await leaveService.saveCompanyOverallLeaves(companyId, leaves);
      setAlertMsg({ text: 'Company overall leaves saved and applied successfully!', type: 'success' });
      setTimeout(() => {
        onSaved?.();
        onClose();
      }, 700);
    } catch (err) {
      setAlertMsg({ text: 'Failed to save overall leaves: ' + String(err), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="emp-modal-overlay fixed inset-0 bg-slate-900/65 z-[1055] flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        {/* Header (Blue #2563eb) */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-white" />
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Company Overall Leaves &amp; Permissions</h3>
              <p className="text-xs text-blue-100 mt-0.5">
                Configure company-wide leaves &amp; permissions automatically applied to all employees in this company.
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

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-4">
          {alertMsg && (
            <div
              className={`p-3 rounded-lg text-xs font-semibold ${
                alertMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {alertMsg.text}
            </div>
          )}

          {/* Builder Section Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-800 mb-3">Add Overall Leave / Permission Type</div>
            <form onSubmit={handleAdd} className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                placeholder="e.g. Casual Leave, Short Permission"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 w-full sm:w-auto h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                required
              />
              <input
                type="number"
                placeholder="Count"
                value={count}
                onChange={(e) => setCount(e.target.value === '' ? '' : Number(e.target.value))}
                min="1"
                className="w-full sm:w-24 h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                required
              />
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full sm:w-40 h-9 px-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="Days - Leave">Days - Leave</option>
                <option value="Hours - Permission">Hours - Permission</option>
              </select>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="submit"
                  className="h-9 px-4 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setName('');
                    setCount('');
                    setType('Days - Leave');
                  }}
                  className="h-9 px-3 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>

          {/* Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10.5px]">
                  <th className="py-2.5 px-3 w-16 text-center">SL NO</th>
                  <th className="py-2.5 px-3">LEAVE / PERMISSION NAME</th>
                  <th className="py-2.5 px-3 w-24 text-center">COUNT</th>
                  <th className="py-2.5 px-3 w-36">TYPE</th>
                  <th className="py-2.5 px-3 w-20 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {leaves.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                      No overall company leaves configured yet. Add a Leave or Permission above, then click &quot;Save &amp; Apply to All Employees&quot;.
                    </td>
                  </tr>
                ) : (
                  leaves.map((item, idx) => (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-center text-slate-500 font-medium">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{item.name}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-blue-600">{item.count}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10.5px] font-semibold ${
                            item.type === 'Days - Leave'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {item.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer transition-colors"
                          title="Delete Leave Type"
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

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2.5 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSaveAndApply}
            disabled={saving}
            className="px-5 py-2 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save & Apply to All Employees'}
          </button>
        </div>
      </div>
    </div>
  );
};
