import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  Hash,
  Plus,
  RefreshCw,
  Check,
  Building,
  Sparkles,
  Pencil,
  Trash2,
  X,
  Globe,
} from 'lucide-react';
import {
  InvoiceSeriesConfig,
  InvoiceSeriesDefaultScope,
  getInvoiceSeriesState,
  parseInvoiceNumber,
  generateNextInvoiceNumber,
  registerInvoiceSeries,
  setGlobalDefaultInvoiceSeries,
  updateInvoiceSeries,
  deleteInvoiceSeries,
  unhideInvoiceSeries,
  loadStoredCompanyPrefs,
  normalizeCompanyName,
} from '@/lib/invoiceNumberFormats';

interface InvoiceSeriesPickerProps {
  value: string;
  onChange: (val: string) => void;
  customerName?: string;
  inputClassName?: string;
  disabled?: boolean;
  onSeriesSelected?: (series: InvoiceSeriesConfig) => void;
  /** Fires on discrete picks (selecting a series, setting default, refresh, save format) or on input Enter/blur. */
  onCommit?: (val: string) => void | Promise<void>;
  /** Existing invoice number already owned by the record being edited (so it is not flagged as a collision with itself). */
  excludeInvoiceNo?: string;
  label?: string;
  hideLabelIcon?: boolean;
  popoverAlign?: 'left' | 'right';
}

export const InvoiceSeriesPicker: React.FC<InvoiceSeriesPickerProps> = ({
  value,
  onChange,
  customerName,
  inputClassName = '',
  disabled = false,
  onSeriesSelected,
  onCommit,
  excludeInvoiceNo,
  label = 'Invoice Number',
  hideLabelIcon = false,
  popoverAlign = 'right',
}) => {
  const [seriesList, setSeriesList] = useState<InvoiceSeriesConfig[]>([]);
  const [activeSeries, setActiveSeries] = useState<InvoiceSeriesConfig | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSeries, setEditingSeries] = useState<InvoiceSeriesConfig | null>(null);
  const [confirmDeletePrefix, setConfirmDeletePrefix] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [customSeriesName, setCustomSeriesName] = useState('');
  const [defaultScope, setDefaultScope] = useState<InvoiceSeriesDefaultScope>('all');
  const [savingFormat, setSavingFormat] = useState(false);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const parsedPreview = customInput.trim() ? parseInvoiceNumber(customInput.trim()) : null;

  const resetFormState = () => {
    setShowAddForm(false);
    setEditingSeries(null);
    setCustomInput('');
    setCustomSeriesName('');
    setFormError('');
    setDefaultScope('all');
  };

  // Close menu on click outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setConfirmDeletePrefix(null);
        resetFormState();
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Fetch all series and pick the best one for this company
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInvoiceSeriesState(customerName, excludeInvoiceNo)
      .then((state) => {
        if (cancelled) return;
        setSeriesList(state.seriesList);
        const parsedVal = value ? parseInvoiceNumber(value) : null;
        const matchedByValue = parsedVal
          ? state.seriesList.find((s) => s.prefix === parsedVal.prefix)
          : undefined;
        setActiveSeries(matchedByValue || state.activeSeries);

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
  }, [customerName, excludeInvoiceNo]);

  // Keep the displayed active series in sync if `value` changes externally
  useEffect(() => {
    const parsedVal = value ? parseInvoiceNumber(value) : null;
    if (!parsedVal || !seriesList.length) return;
    const matched = seriesList.find((s) => s.prefix === parsedVal.prefix);
    if (matched && matched.prefix !== activeSeries?.prefix) {
      setActiveSeries(matched);
    }
  }, [value, seriesList, activeSeries?.prefix]);

  // When user selects an existing format for this invoice
  const handleSelectSeries = (s: InvoiceSeriesConfig) => {
    setActiveSeries(s);
    onChange(s.nextNumber);
    if (onSeriesSelected) onSeriesSelected(s);
    setShowMenu(false);
    setConfirmDeletePrefix(null);
    resetFormState();
    if (onCommit) void onCommit(s.nextNumber);
  };

  // Set any format as the Global Default for all customers in one click
  const handleMakeDefaultAll = async (s: InvoiceSeriesConfig, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeletePrefix(null);
    setGlobalDefaultInvoiceSeries(s.prefix, seriesList, customerName);
    const state = await getInvoiceSeriesState(customerName, excludeInvoiceNo);
    setSeriesList(state.seriesList);
    const updated = state.seriesList.find((x) => x.prefix === s.prefix) || { ...s, isDefault: true, companyName: undefined };
    setActiveSeries(updated);
    onChange(updated.nextNumber);
    if (onSeriesSelected) onSeriesSelected(updated);
    if (onCommit) void onCommit(updated.nextNumber);
  };

  // Start editing an existing format
  const handleStartEdit = (s: InvoiceSeriesConfig, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeletePrefix(null);
    setFormError('');
    setEditingSeries(s);
    setCustomInput(s.nextNumber);
    const trimmedName = s.name.trim();
    const isAutoGeneratedName =
      trimmedName === 'Standard (INV-)' ||
      trimmedName === `${s.prefix} Series` ||
      (!!s.companyName && trimmedName === `${s.companyName} (${s.prefix})`) ||
      (!!customerName && trimmedName === `${customerName} (${s.prefix})`);
    setCustomSeriesName(isAutoGeneratedName ? '' : s.name);

    const prefs = loadStoredCompanyPrefs();
    const companyPref = customerName ? prefs[normalizeCompanyName(customerName)] : undefined;
    if (s.isDefault) {
      setDefaultScope('all');
    } else if (customerName && (companyPref === s.prefix || companyPref === s.id || s.scope === 'company')) {
      setDefaultScope('company');
    } else {
      setDefaultScope('none');
    }
    setShowAddForm(true);
  };

  // Delete a non-standard format from the picker
  const handleConfirmDelete = async (s: InvoiceSeriesConfig) => {
    deleteInvoiceSeries(s.prefix);
    setConfirmDeletePrefix(null);

    const state = await getInvoiceSeriesState(customerName, excludeInvoiceNo);
    setSeriesList(state.seriesList);

    const parsedVal = parseInvoiceNumber(value);
    if (
      activeSeries?.prefix === s.prefix ||
      activeSeries?.id === s.id ||
      parsedVal?.prefix === s.prefix
    ) {
      setActiveSeries(state.activeSeries);
      onChange(state.suggestedNumber);
      if (onSeriesSelected) onSeriesSelected(state.activeSeries);
      if (onCommit) void onCommit(state.suggestedNumber);
    }
  };

  // Save either a new custom format or edits to an existing format
  const handleSaveCustomFormat = async () => {
    const trimmed = customInput.trim();
    if (!trimmed || savingFormat) return;

    const parsed = parseInvoiceNumber(trimmed);
    if (!parsed) {
      setFormError('Include trailing digits (e.g. INV-00016 or S/64/26/28).');
      return;
    }

    setSavingFormat(true);
    try {
      if (editingSeries) {
        const isSystemStd = !!editingSeries.isSystemStandard || editingSeries.prefix === 'INV-';
        if (isSystemStd && parsed.prefix !== 'INV-') {
          setFormError('Standard format keeps the INV- prefix. Add a new format to use another prefix.');
          return;
        }

        const existingTargetSeries = seriesList.find((x) => x.prefix === parsed.prefix);
        const updated = updateInvoiceSeries(
          editingSeries,
          trimmed,
          customSeriesName.trim() || undefined,
          customerName,
          defaultScope === 'company',
          {
            defaultScope,
            scope: defaultScope === 'company' ? 'company' : 'all',
            targetDbMax: existingTargetSeries?.dbLastNumber,
            existingSeriesList: seriesList,
          }
        );

        const state = await getInvoiceSeriesState(customerName, excludeInvoiceNo);
        setSeriesList(state.seriesList);

        if (updated) {
          const refreshed =
            state.seriesList.find((x) => x.prefix === updated.prefix) || updated;
          const wasActive =
            activeSeries?.prefix === editingSeries.prefix ||
            activeSeries?.id === editingSeries.id;

          if (wasActive || defaultScope === 'all' || (customerName && defaultScope === 'company')) {
            setActiveSeries(refreshed);
            onChange(refreshed.nextNumber);
            if (onSeriesSelected) onSeriesSelected(refreshed);
            if (onCommit) void onCommit(refreshed.nextNumber);
          }
        }

        resetFormState();
        return;
      }

      unhideInvoiceSeries(parsed.prefix);
      const existingTargetSeries = seriesList.find((x) => x.prefix === parsed.prefix);
      const registered = registerInvoiceSeries(
        trimmed,
        customerName,
        customSeriesName.trim() || undefined,
        defaultScope === 'company',
        {
          defaultScope,
          scope: defaultScope === 'company' ? 'company' : 'all',
          nextNumberIsTarget: true,
          dbLastNumber: existingTargetSeries?.dbLastNumber ?? 0,
          existingSeriesList: seriesList,
        }
      );

      if (registered) {
        const state = await getInvoiceSeriesState(customerName, excludeInvoiceNo);
        setSeriesList(state.seriesList);
        const refreshed =
          state.seriesList.find((x) => x.prefix === registered.prefix) || registered;
        setActiveSeries(refreshed);
        onChange(refreshed.nextNumber);
        if (onSeriesSelected) onSeriesSelected(refreshed);
        if (onCommit) void onCommit(refreshed.nextNumber);
      }

      resetFormState();
      setShowMenu(false);
    } finally {
      setSavingFormat(false);
    }
  };

  // Regenerate to next number in the currently active series
  const handleRefreshNext = () => {
    if (activeSeries) {
      onChange(activeSeries.nextNumber);
      if (onCommit) void onCommit(activeSeries.nextNumber);
    } else {
      getInvoiceSeriesState(customerName, excludeInvoiceNo).then((state) => {
        onChange(state.suggestedNumber);
        if (onCommit) void onCommit(state.suggestedNumber);
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
      <div className={`flex items-center justify-between ${hideLabelIcon ? 'mb-0.5' : 'mb-1'}`}>
        <label className={`text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1 ${hideLabelIcon ? '' : 'tracking-wider'}`}>
          {!hideLabelIcon && <Hash size={11} className="text-orange-500" />}
          <span>{label}</span>
        </label>

        <button
          type="button"
          onClick={() => {
            if (disabled) return;
            setShowMenu((v) => !v);
            setConfirmDeletePrefix(null);
            resetFormState();
          }}
          disabled={disabled}
          title="Click to choose, edit, or set default invoice format series"
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              (e.target as HTMLInputElement).blur();
            }
          }}
          onBlur={(e) => {
            if (onCommit) void onCommit(e.target.value.trim());
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
          </span>
        </div>
      )}

      {/* Format Selector Dropdown Popover */}
      {showMenu && (
        <div
          className={`absolute ${
            popoverAlign === 'left' ? 'left-0' : 'right-0'
          } top-full mt-1.5 w-[360px] sm:w-[440px] bg-white rounded-xl shadow-2xl border border-slate-200 z-50 p-3 text-xs animate-scale-in`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <div>
              <p className="font-bold text-slate-800 text-xs">Invoice Number Formats</p>
              <p className="text-[10px] text-slate-500">
                Choose, edit, or set default format for all customers
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setConfirmDeletePrefix(null);
                if (showAddForm) {
                  resetFormState();
                } else {
                  setEditingSeries(null);
                  setCustomInput('');
                  setCustomSeriesName('');
                  setDefaultScope('all');
                  setFormError('');
                  setShowAddForm(true);
                }
              }}
              className="px-2 py-1 rounded bg-orange-600 hover:bg-orange-700 text-white font-bold text-[10px] flex items-center gap-1 transition-colors cursor-pointer"
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
                const isConfirmingDelete = confirmDeletePrefix === s.prefix;

                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      if (isConfirmingDelete) return;
                      handleSelectSeries(s);
                    }}
                    className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-orange-50/80 border-orange-300 ring-1 ring-orange-400'
                        : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-800 text-[11px] truncate max-w-[160px]">
                          {s.name}
                        </span>
                        {s.isDefault && (
                          <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold flex items-center gap-0.5">
                            <Globe size={9} /> Default (All)
                          </span>
                        )}
                        {isCompanySpecific && (
                          <span className="shrink-0 text-[9px] px-1 py-0.2 rounded bg-blue-100 text-blue-700 font-semibold flex items-center gap-0.5">
                            <Building size={9} /> {s.companyName}
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

                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isConfirmingDelete ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleConfirmDelete(s)}
                            className="px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePrefix(null)}
                            title="Cancel delete"
                            aria-label="Cancel delete"
                            className="p-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <X size={11} />
                          </button>
                        </>
                      ) : (
                        <>
                          {!s.isDefault && (
                            <button
                              type="button"
                              onClick={(e) => void handleMakeDefaultAll(s, e)}
                              title="Set as default format for all customers"
                              className="px-1.5 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 text-[9px] font-bold transition-colors cursor-pointer flex items-center gap-0.5"
                            >
                              <Globe size={9} /> Default
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleStartEdit(s, e)}
                            title="Edit format"
                            aria-label={`Edit ${s.name}`}
                            className="p-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:text-orange-600 hover:border-orange-300 hover:bg-orange-50 transition-colors cursor-pointer"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            type="button"
                            disabled={!!s.isSystemStandard || s.prefix === 'INV-'}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (s.isSystemStandard || s.prefix === 'INV-') return;
                              setConfirmDeletePrefix(s.prefix);
                            }}
                            title={
                              s.isSystemStandard || s.prefix === 'INV-'
                                ? 'Standard INV- format cannot be deleted'
                                : 'Delete format'
                            }
                            aria-label={`Delete ${s.name}`}
                            className={`p-1.5 rounded border transition-colors ${
                              s.isSystemStandard || s.prefix === 'INV-'
                                ? 'border-slate-200 bg-white/60 text-slate-300 cursor-not-allowed'
                                : 'border-slate-200 bg-white text-red-500 hover:text-red-700 hover:border-red-300 hover:bg-red-50 cursor-pointer'
                            }`}
                          >
                            <Trash2 size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectSeries(s)}
                            className={`px-2 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer ${
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
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Inline Add / Edit Format Form */
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-2">
              <div className="flex items-center gap-1 text-[11px] font-bold text-slate-800">
                {editingSeries ? (
                  <>
                    <Pencil size={12} className="text-orange-600" />
                    <span>Edit Format</span>
                  </>
                ) : (
                  <>
                    <Plus size={13} className="text-orange-600" />
                    <span>Add Format / Custom Starting Number</span>
                  </>
                )}
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                {editingSeries ? (
                  editingSeries.prefix === 'INV-' ? (
                    <>Update the format name, default setting, or next <code className="font-semibold text-slate-700">INV-</code> invoice number.</>
                  ) : (
                    <>Update the format name, prefix, next invoice number, or default setting.</>
                  )
                ) : (
                  <>
                    Enter the next invoice number with any prefix (e.g.{' '}
                    <code className="font-semibold text-slate-700">S/64/26/28</code>,{' '}
                    <code className="font-semibold text-slate-700">LGB/26-27/001</code>, or{' '}
                    <code className="font-semibold text-slate-700">ARG-001</code>).
                  </>
                )}
              </p>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                  Next Invoice Number *
                </label>
                <input
                  type="text"
                  placeholder="e.g. S/64/26/28 or ARG-001"
                  value={customInput}
                  onChange={(e) => {
                    setCustomInput(e.target.value);
                    if (formError) setFormError('');
                  }}
                  className="w-full text-xs font-semibold px-2 py-1.5 border border-slate-300 rounded bg-white focus:outline-none focus:border-orange-500"
                />
                {parsedPreview ? (
                  <p className="text-[10px] text-emerald-700 mt-0.5">
                    Prefix: <span className="font-mono font-semibold">{parsedPreview.prefix}</span> · Next #{parsedPreview.num}
                  </p>
                ) : customInput.trim() ? (
                  <p className="text-[10px] text-amber-700 mt-0.5">
                    Must end with digits (e.g. S/64/26/28)
                  </p>
                ) : null}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                  Format Name (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Main Tax Invoice, Export Series"
                  value={customSeriesName}
                  onChange={(e) => setCustomSeriesName(e.target.value)}
                  className="w-full text-xs px-2 py-1 border border-slate-300 rounded bg-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="space-y-1 pt-0.5">
                <label className="block text-[10px] font-bold text-slate-600">
                  Default Setting
                </label>
                <label className="flex items-center gap-1.5 text-[10px] text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="seriesDefaultScope"
                    checked={defaultScope === 'all'}
                    onChange={() => setDefaultScope('all')}
                    className="text-orange-600 focus:ring-orange-500 h-3.5 w-3.5"
                  />
                  <span>
                    Set as default for <b>all customers</b>
                  </span>
                </label>
                {customerName && (
                  <label className="flex items-center gap-1.5 text-[10px] text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="seriesDefaultScope"
                      checked={defaultScope === 'company'}
                      onChange={() => setDefaultScope('company')}
                      className="text-orange-600 focus:ring-orange-500 h-3.5 w-3.5"
                    />
                    <span>
                      Default only for <b>{customerName}</b>
                    </span>
                  </label>
                )}
                <label className="flex items-center gap-1.5 text-[10px] text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="seriesDefaultScope"
                    checked={defaultScope === 'none'}
                    onChange={() => setDefaultScope('none')}
                    className="text-orange-600 focus:ring-orange-500 h-3.5 w-3.5"
                  />
                  <span>Shared format (do not change default)</span>
                </label>
              </div>

              {formError && (
                <p className="text-[10px] font-semibold text-red-600">{formError}</p>
              )}

              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={resetFormState}
                  disabled={savingFormat}
                  className="px-2.5 py-1 rounded border border-slate-300 text-slate-600 text-[10px] font-semibold hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveCustomFormat()}
                  disabled={!customInput.trim() || savingFormat}
                  className="px-3 py-1 rounded bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-bold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {savingFormat ? 'Saving...' : editingSeries ? 'Save Changes' : 'Apply & Save Format'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
