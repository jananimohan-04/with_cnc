import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  Hash,
  Plus,
  RefreshCw,
  Check,
  Building,
  Sparkles,
} from 'lucide-react';
import {
  InvoiceSeriesConfig,
  getInvoiceSeriesState,
  parseInvoiceNumber,
  generateNextInvoiceNumber,
  registerInvoiceSeries,
  saveStoredCompanyPref,
} from '@/lib/invoiceNumberFormats';

interface InvoiceSeriesPickerProps {
  value: string;
  onChange: (val: string) => void;
  customerName?: string;
  inputClassName?: string;
  disabled?: boolean;
  onSeriesSelected?: (series: InvoiceSeriesConfig) => void;
}

export const InvoiceSeriesPicker: React.FC<InvoiceSeriesPickerProps> = ({
  value,
  onChange,
  customerName,
  inputClassName = '',
  disabled = false,
  onSeriesSelected,
}) => {
  const [seriesList, setSeriesList] = useState<InvoiceSeriesConfig[]>([]);
  const [activeSeries, setActiveSeries] = useState<InvoiceSeriesConfig | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [customSeriesName, setCustomSeriesName] = useState('');
  const [setAsCompanyDefault, setSetAsCompanyDefault] = useState(true);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowAddForm(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Fetch all series and pick the best one for this company
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInvoiceSeriesState(customerName)
      .then((state) => {
        if (cancelled) return;
        setSeriesList(state.seriesList);
        setActiveSeries(state.activeSeries);

        // If the invoice number is currently blank, auto-populate with the suggested next number!
        if (!value || value.trim() === '') {
          onChange(state.suggestedNumber);
          if (onSeriesSelected) onSeriesSelected(state.activeSeries);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerName]);

  // When user selects an existing format from the list
  const handleSelectSeries = (s: InvoiceSeriesConfig) => {
    setActiveSeries(s);
    onChange(s.nextNumber);
    if (customerName) {
      saveStoredCompanyPref(customerName, s.prefix);
    }
    if (onSeriesSelected) onSeriesSelected(s);
    setShowMenu(false);
    setShowAddForm(false);
  };

  // When user defines and adds a brand new format/starting number
  const handleSaveCustomFormat = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;

    const registered = registerInvoiceSeries(
      trimmed,
      customerName,
      customSeriesName.trim() || undefined,
      setAsCompanyDefault
    );

    if (registered) {
      setActiveSeries(registered);
      onChange(trimmed);
      if (onSeriesSelected) onSeriesSelected(registered);

      // Refresh list
      getInvoiceSeriesState(customerName).then((state) => {
        setSeriesList(state.seriesList);
      });
    }

    setCustomInput('');
    setCustomSeriesName('');
    setShowAddForm(false);
    setShowMenu(false);
  };

  // Regenerate to next number in the currently active series
  const handleRefreshNext = () => {
    if (activeSeries) {
      onChange(activeSeries.nextNumber);
    } else {
      getInvoiceSeriesState(customerName).then((state) => {
        onChange(state.suggestedNumber);
      });
    }
  };

  // Inspect the current input value for live detected series info
  const parsedCurrent = parseInvoiceNumber(value);
  const isCustomDetected =
    parsedCurrent &&
    (!activeSeries || activeSeries.prefix !== parsedCurrent.prefix);

  return (
    <div className="relative" ref={menuRef}>
      {/* Top row: Label + Format Picker Toggle */}
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">
          <Hash size={11} className="text-orange-500" />
          <span>Invoice Number</span>
        </label>

        <button
          type="button"
          onClick={() => {
            if (disabled) return;
            setShowMenu((v) => !v);
            setShowAddForm(false);
          }}
          disabled={disabled}
          title="Click to choose invoice format series or add custom format for this company"
          className="text-[10px] font-bold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200/80 px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
        >
          <Sparkles size={10} className="text-orange-500" />
          <span className="truncate max-w-[130px]">
            {activeSeries ? activeSeries.name : 'Choose Format'}
          </span>
          <ChevronDown
            size={11}
            className={`transition-transform duration-200 ${showMenu ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Input box with refresh/next button */}
      <div className="relative">
        <input
          type="text"
          placeholder="Auto-generated (e.g. INV-00001)"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value);
            // If they type a pattern matching an existing series, update active series
            const p = parseInvoiceNumber(e.target.value);
            if (p) {
              const matched = seriesList.find((s) => s.prefix === p.prefix);
              if (matched) setActiveSeries(matched);
            }
          }}
          className={`${inputClassName} font-bold text-slate-900 pr-8`}
          data-testid="inv-docno"
        />

        <button
          type="button"
          onClick={handleRefreshNext}
          disabled={disabled}
          title="Reset to next auto-generated sequential number"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-600 transition-colors p-1"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Live Helper badge when a new series or company format is detected */}
      {isCustomDetected && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-700 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>
            New series detected: <b>{parsedCurrent.prefix}</b> · Next will be{' '}
            <b>{generateNextInvoiceNumber(parsedCurrent, 1)}</b>
            {customerName && ` for ${customerName}`}
          </span>
        </div>
      )}

      {/* Format Selector Dropdown Popover */}
      {showMenu && (
        <div className="absolute right-0 top-full mt-1.5 w-84 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 p-3 text-xs animate-scale-in">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <div>
              <p className="font-bold text-slate-800 text-xs">Invoice Number Formats</p>
              <p className="text-[10px] text-slate-500">
                {customerName
                  ? `Choose or set format for ${customerName}`
                  : 'Select an invoice sequence series'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="px-2 py-1 rounded bg-orange-600 hover:bg-orange-700 text-white font-bold text-[10px] flex items-center gap-1 transition-colors"
            >
              <Plus size={11} />
              <span>{showAddForm ? 'View Formats' : 'Add Format'}</span>
            </button>
          </div>

          {/* List of existing formats */}
          {!showAddForm ? (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {seriesList.map((s) => {
                const isSelected =
                  activeSeries?.id === s.id || activeSeries?.prefix === s.prefix;
                const isCompanySpecific = !!s.companyName;

                return (
                  <div
                    key={s.id}
                    onClick={() => handleSelectSeries(s)}
                    className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-orange-50/80 border-orange-300 ring-1 ring-orange-400'
                        : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800 text-[11px] truncate">
                          {s.name}
                        </span>
                        {s.isDefault && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 text-slate-700 font-semibold">
                            Default
                          </span>
                        )}
                        {isCompanySpecific && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-blue-100 text-blue-700 font-semibold flex items-center gap-0.5">
                            <Building size={9} /> Company
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                        <span>
                          Prefix: <code className="font-mono bg-white px-1 rounded">{s.prefix}</code>
                        </span>
                        <span>•</span>
                        <span>
                          Next: <b className="text-orange-700 font-mono">{s.nextNumber}</b>
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                        isSelected
                          ? 'bg-orange-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {isSelected ? (
                        <span className="flex items-center gap-0.5">
                          <Check size={10} /> Active
                        </span>
                      ) : (
                        'Use'
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Inline Add Format Form */
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-800">
                <Plus size={13} className="text-orange-600" />
                <span>Add Format / Custom Starting Number</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                Enter any format with starting digits (e.g.{' '}
                <code className="font-semibold text-slate-700">LGB/24-25/001</code>,{' '}
                <code className="font-semibold text-slate-700">LGB-101</code>, or{' '}
                <code className="font-semibold text-slate-700">ARG-2026-0001</code>). The next
                invoice will automatically increment to the next number!
              </p>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                  Starting Invoice Number *
                </label>
                <input
                  type="text"
                  placeholder="e.g. LGB/24-25/001 or LGB-001"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  className="w-full text-xs font-semibold px-2 py-1.5 border border-slate-300 rounded bg-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                  Format Name (optional)
                </label>
                <input
                  type="text"
                  placeholder={
                    customerName ? `${customerName} Series` : 'e.g. Special Client Series'
                  }
                  value={customSeriesName}
                  onChange={(e) => setCustomSeriesName(e.target.value)}
                  className="w-full text-xs px-2 py-1 border border-slate-300 rounded bg-white focus:outline-none focus:border-orange-500"
                />
              </div>

              {customerName && (
                <label className="flex items-center gap-1.5 text-[10px] text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={setAsCompanyDefault}
                    onChange={(e) => setSetAsCompanyDefault(e.target.checked)}
                    className="rounded text-orange-600 focus:ring-orange-500 h-3.5 w-3.5"
                  />
                  <span>
                    Set as default format for <b>{customerName}</b>
                  </span>
                </label>
              )}

              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-2.5 py-1 rounded border border-slate-300 text-slate-600 text-[10px] font-semibold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomFormat}
                  disabled={!customInput.trim()}
                  className="px-3 py-1 rounded bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-bold transition-colors disabled:opacity-50"
                >
                  Apply & Save Format
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
