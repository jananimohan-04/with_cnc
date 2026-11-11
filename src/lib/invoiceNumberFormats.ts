import { supabase } from './supabase';

export interface ParsedInvoiceNumber {
  raw: string;
  prefix: string;
  num: number;
  padding: number;
  suffix: string;
}

export interface InvoiceSeriesConfig {
  id: string;
  name: string;
  prefix: string;
  padding: number;
  suffix: string;
  lastNumber: number;
  nextNumber: string;
  companyName?: string;
  scope?: 'all' | 'company';
  /** True for whichever format is currently the Global Default for all customers. */
  isDefault?: boolean;
  /** True only for the built-in INV- fallback format. */
  isSystemStandard?: boolean;
  /** Latest numeric sequence observed in DB invoices when state was loaded. */
  dbLastNumber?: number;
  /** DB max at the time the user explicitly overrode the next number in Edit mode. */
  overriddenDbMax?: number;
  /** True only when user explicitly typed a custom starting number via Add/Edit Format. */
  isManualOverride?: boolean;
}

export interface CompanySeriesMapping {
  [companyNameNormalized: string]: string; // maps normalized customer name to series prefix/id
}

const STORAGE_SERIES_KEY = 'argus_invoice_custom_series_v1';
const STORAGE_COMPANY_PREF_KEY = 'argus_company_invoice_series_pref_v1';
const STORAGE_HIDDEN_SERIES_KEY = 'argus_invoice_hidden_series_v1';
const STORAGE_GLOBAL_DEFAULT_KEY = 'argus_invoice_global_default_prefix_v1';

export type InvoiceSeriesDefaultScope = 'all' | 'company' | 'none';

export function loadGlobalDefaultPrefix(): string {
  try {
    const val = localStorage.getItem(STORAGE_GLOBAL_DEFAULT_KEY);
    return val && val.trim() ? val.trim() : 'INV-';
  } catch {
    return 'INV-';
  }
}

export function saveGlobalDefaultPrefix(prefix: string): void {
  try {
    const clean = (prefix || '').trim() || 'INV-';
    localStorage.setItem(STORAGE_GLOBAL_DEFAULT_KEY, clean);
  } catch {
    // ignore storage errors
  }
}

/**
 * Clear per-company overrides that don't point to a company-exclusive series
 * so a newly chosen global default applies across all customers.
 */
export function clearNonCompanySpecificPrefs(seriesList?: InvoiceSeriesConfig[], alsoClearCompanyName?: string): void {
  try {
    const prefs = loadStoredCompanyPrefs();
    const companyOnlyKeys = new Set<string>();
    for (const s of seriesList ?? []) {
      if (s.companyName) {
        companyOnlyKeys.add(s.id);
        if (!s.suffix) companyOnlyKeys.add(s.prefix);
      }
    }
    const clearKey = alsoClearCompanyName ? normalizeCompanyName(alsoClearCompanyName) : '';
    let changed = false;
    for (const key of Object.keys(prefs)) {
      if ((clearKey && key === clearKey) || !companyOnlyKeys.has(prefs[key])) {
        delete prefs[key];
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(STORAGE_COMPANY_PREF_KEY, JSON.stringify(prefs));
    }
  } catch {
    // ignore storage errors
  }
}

export const normalizeCompanyName = (name?: string | null): string => {
  return String(name || '').trim().toLowerCase();
};

export function getSeriesId(prefix: string, suffix = ''): string {
  return suffix ? `${prefix}{n}${suffix}` : prefix;
}

export function formatSeriesPatternLabel(prefix: string, suffix = ''): string {
  return suffix ? `${prefix}##${suffix}` : prefix;
}

export function formatSeriesDisplayName(prefix: string, suffix = ''): string {
  if (prefix === 'INV-' && !suffix) return 'Standard (INV-)';
  return suffix ? `${prefix}##${suffix} Series` : `${prefix} Series`;
}

export interface InvoiceNumberSegment {
  index: number;
  start: number;
  end: number;
  digitsStr: string;
  num: number;
  padding: number;
  prefix: string;
  suffix: string;
}

/**
 * Splits an invoice number into all contiguous numeric segments so the user
 * can choose which segment acts as the incrementing counter (e.g. `64` in `S/64/26/27`).
 */
export function parseInvoiceSegments(raw?: string | null): InvoiceNumberSegment[] {
  if (!raw || typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const segments: InvoiceNumberSegment[] = [];
  const regex = /\d+/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = regex.exec(trimmed)) !== null) {
    const digitsStr = m[0];
    const start = m.index;
    const end = start + digitsStr.length;
    segments.push({
      index: idx++,
      start,
      end,
      digitsStr,
      num: parseInt(digitsStr, 10),
      padding: digitsStr.length,
      prefix: trimmed.slice(0, start),
      suffix: trimmed.slice(end),
    });
  }
  return segments;
}

function getStoredSuffixPatterns(): Array<{ prefix: string; suffix: string }> {
  try {
    const list = loadStoredCustomSeries();
    return list
      .filter((s) => !!s.suffix && typeof s.prefix === 'string')
      .map((s) => ({ prefix: s.prefix, suffix: s.suffix }));
  } catch {
    return [];
  }
}

function isConsecutiveFinancialYear(y1Str: string, y2Str: string): boolean {
  const y1 = parseInt(y1Str, 10);
  const y2 = parseInt(y2Str, 10);
  if (isNaN(y1) || isNaN(y2)) return false;

  if (y1Str.length === 2 && y2Str.length === 2) {
    return y1 >= 15 && y1 <= 50 && y2 === (y1 + 1) % 100;
  }
  if (y1Str.length === 4 && y2Str.length === 2) {
    return y1 >= 2015 && y1 <= 2050 && y2 === (y1 + 1) % 100;
  }
  if (y1Str.length === 4 && y2Str.length === 4) {
    return y1 >= 2015 && y1 <= 2050 && y2 === y1 + 1;
  }
  return false;
}

/**
 * Parses an invoice string into prefix, sequential digits, and optional constant suffix.
 * - Matches any saved custom constant-suffix pattern first (e.g. `S/{n}/26/27`).
 * - Automatically detects trailing financial-year suffixes like `S/64/26/27` -> prefix `"S/"`, num `64`, suffix `"/26/27"`.
 * - Otherwise parses the trailing digit block (`INV-00006` -> `"INV-"`, `6`, `""`).
 */
export function parseInvoiceNumber(
  raw?: string | null,
  preferredPatterns?: Array<{ prefix: string; suffix?: string }>
): ParsedInvoiceNumber | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. Explicit / saved constant-suffix patterns (longest match first)
  const patterns = (preferredPatterns ?? getStoredSuffixPatterns())
    .filter((p) => !!(p.suffix && p.suffix.length > 0))
    .slice()
    .sort((a, b) => (b.prefix.length + (b.suffix?.length || 0)) - (a.prefix.length + (a.suffix?.length || 0)));

  for (const pat of patterns) {
    const suf = pat.suffix || '';
    if (trimmed.startsWith(pat.prefix) && trimmed.endsWith(suf) && trimmed.length > pat.prefix.length + suf.length) {
      const mid = trimmed.slice(pat.prefix.length, trimmed.length - suf.length);
      if (/^\d+$/.test(mid)) {
        const num = parseInt(mid, 10);
        if (!isNaN(num)) {
          return {
            raw: trimmed,
            prefix: pat.prefix,
            num,
            padding: mid.length,
            suffix: suf,
          };
        }
      }
    }
  }

  // 2. Trailing Indian financial-year pair e.g. S/64/26/27, S/64/26-27, INV/1/2026-27
  const fyMatch = trimmed.match(/^(.*?)(\d+)([/-](\d{2}|\d{4})[/-](\d{2}|\d{4}))$/);
  if (fyMatch && isConsecutiveFinancialYear(fyMatch[4], fyMatch[5])) {
    const digitsStr = fyMatch[2];
    const num = parseInt(digitsStr, 10);
    if (!isNaN(num)) {
      return {
        raw: trimmed,
        prefix: fyMatch[1],
        num,
        padding: digitsStr.length,
        suffix: fyMatch[3],
      };
    }
  }

  // 3. Match the LAST contiguous block of digits as the sequence serial number
  const match = trimmed.match(/^(.*?)(\d+)([^\d]*)$/);
  if (!match) return null;

  const prefix = match[1];
  const digitsStr = match[2];
  const suffix = match[3] || '';
  const num = parseInt(digitsStr, 10);
  if (isNaN(num)) return null;

  return {
    raw: trimmed,
    prefix,
    num,
    padding: digitsStr.length,
    suffix,
  };
}

/**
 * Calculates the next sequential invoice number string.
 * e.g. "INV-00006" -> "INV-00007"
 * e.g. "LGB/24-25/001" -> "LGB/24-25/002"
 */
export function generateNextInvoiceNumber(lastRawOrParsed: string | ParsedInvoiceNumber, step = 1): string {
  const parsed = typeof lastRawOrParsed === 'string' ? parseInvoiceNumber(lastRawOrParsed) : lastRawOrParsed;
  if (!parsed) return 'INV-00001';
  const nextNum = parsed.num + step;
  return `${parsed.prefix}${String(nextNum).padStart(parsed.padding, '0')}${parsed.suffix}`;
}

export function loadStoredCustomSeries(): InvoiceSeriesConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_SERIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredCustomSeries(series: InvoiceSeriesConfig[]): void {
  try {
    localStorage.setItem(STORAGE_SERIES_KEY, JSON.stringify(series));
  } catch {
    // quota exceeded or private mode
  }
}

export function loadStoredCompanyPrefs(): CompanySeriesMapping {
  try {
    const raw = localStorage.getItem(STORAGE_COMPANY_PREF_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStoredCompanyPref(companyName: string, seriesIdOrPrefix: string): void {
  if (!companyName) return;
  try {
    const prefs = loadStoredCompanyPrefs();
    prefs[normalizeCompanyName(companyName)] = seriesIdOrPrefix;
    localStorage.setItem(STORAGE_COMPANY_PREF_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function removeStoredCompanyPref(companyName: string): void {
  if (!companyName) return;
  try {
    const prefs = loadStoredCompanyPrefs();
    delete prefs[normalizeCompanyName(companyName)];
    localStorage.setItem(STORAGE_COMPANY_PREF_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function loadHiddenSeriesPrefixes(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_HIDDEN_SERIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveHiddenSeriesPrefixes(prefixes: string[]): void {
  try {
    localStorage.setItem(STORAGE_HIDDEN_SERIES_KEY, JSON.stringify(Array.from(new Set(prefixes))));
  } catch {
    // ignore
  }
}

export function unhideInvoiceSeries(prefix: string): void {
  if (!prefix) return;
  const hidden = loadHiddenSeriesPrefixes();
  if (hidden.includes(prefix)) {
    saveHiddenSeriesPrefixes(hidden.filter((p) => p !== prefix));
  }
}

/**
 * Discovers all invoice series from database + local storage,
 * and determines the best series and next auto-generated number for a specific company.
 */
export async function getInvoiceSeriesState(
  customerName?: string,
  excludeInvoiceNo?: string
): Promise<{
  seriesList: InvoiceSeriesConfig[];
  activeSeries: InvoiceSeriesConfig;
  suggestedNumber: string;
}> {
  const customSeries = loadStoredCustomSeries();
  const companyPrefs = loadStoredCompanyPrefs();
  const hiddenPrefixes = new Set(loadHiddenSeriesPrefixes());
  const targetCompanyKey = normalizeCompanyName(customerName);
  const excludeUpper = excludeInvoiceNo?.trim().toUpperCase() || '';
  const usedInvoiceNos = new Set<string>();

  const preferredPatterns = customSeries
    .filter((c) => !!c.suffix)
    .map((c) => ({ prefix: c.prefix, suffix: c.suffix || '' }));

  // Group existing numbers from DB keyed by seriesId (prefix + optional constant suffix)
  const prefixMap = new Map<string, {
    prefix: string;
    maxNum: number;
    dbMaxNum: number;
    padding: number;
    suffix: string;
    sample: string;
    companies: Set<string>;
    latestCompanyDate: Map<string, string>;
  }>();

  // Always seed default standard series
  prefixMap.set('INV-', {
    prefix: 'INV-',
    maxNum: 0,
    dbMaxNum: 0,
    padding: 5,
    suffix: '',
    sample: 'INV-00001',
    companies: new Set(),
    latestCompanyDate: new Map(),
  });

  try {
    const { data: invRows } = await supabase
      .from('cnc_invoices')
      .select('invoice_no, customer_name, created_at')
      .not('invoice_no', 'is', null)
      .order('created_at', { ascending: true });

    if (invRows && Array.isArray(invRows)) {
      for (const row of invRows) {
        const rawNo = String(row.invoice_no ?? '').trim();
        if (rawNo && rawNo.toUpperCase() !== excludeUpper) {
          usedInvoiceNos.add(rawNo.toUpperCase());
        }
        const parsed = parseInvoiceNumber(row.invoice_no, preferredPatterns);
        if (!parsed) continue;

        const seriesKey = getSeriesId(parsed.prefix, parsed.suffix);
        const current = prefixMap.get(seriesKey) || {
          prefix: parsed.prefix,
          maxNum: 0,
          dbMaxNum: 0,
          padding: parsed.padding,
          suffix: parsed.suffix,
          sample: parsed.raw,
          companies: new Set(),
          latestCompanyDate: new Map(),
        };

        if (parsed.num > current.maxNum) {
          current.maxNum = parsed.num;
          current.dbMaxNum = parsed.num;
          current.padding = Math.max(current.padding, parsed.padding);
          current.suffix = parsed.suffix;
          current.sample = parsed.raw;
        }

        if (row.customer_name) {
          current.companies.add(row.customer_name);
          current.latestCompanyDate.set(normalizeCompanyName(row.customer_name), row.created_at || '');
        }

        prefixMap.set(seriesKey, current);
      }
    }
  } catch {
    // Supabase query failed or offline
  }

  const isHiddenSeries = (id: string, prefix: string, suffix: string) =>
    hiddenPrefixes.has(id) || (!suffix && hiddenPrefixes.has(prefix));

  // Merge custom user-configured series into map
  for (const cs of customSeries) {
    const csPrefix = cs.prefix || cs.id;
    const csSuffix = cs.suffix || '';
    const csId = getSeriesId(csPrefix, csSuffix);
    if (csId !== 'INV-' && isHiddenSeries(csId, csPrefix, csSuffix)) continue;

    const existing = prefixMap.get(csId) || (!csSuffix ? prefixMap.get(csPrefix) : undefined);

    if (existing) {
      const withinUserOverride =
        !!cs.isManualOverride &&
        cs.overriddenDbMax !== undefined &&
        existing.dbMaxNum <= cs.overriddenDbMax;

      if (withinUserOverride) {
        existing.maxNum = cs.lastNumber;
        existing.padding = cs.padding || existing.padding;
        existing.suffix = cs.suffix ?? existing.suffix;
      }
      if (cs.companyName) {
        existing.companies.add(cs.companyName);
      }
    } else {
      const padding = cs.padding || 2;
      prefixMap.set(csId, {
        prefix: csPrefix,
        maxNum: cs.lastNumber || 0,
        dbMaxNum: 0,
        padding,
        suffix: csSuffix,
        sample: `${csPrefix}${'1'.padStart(padding, '0')}${csSuffix}`,
        companies: cs.companyName ? new Set([cs.companyName]) : new Set(),
        latestCompanyDate: new Map(),
      });
    }
  }

  // Compile final array of series configs
  const rawSeriesList: InvoiceSeriesConfig[] = [];

  for (const [seriesId, meta] of prefixMap.entries()) {
    const prefix = meta.prefix;
    const isSystemStandard = seriesId === 'INV-';
    if (!isSystemStandard && isHiddenSeries(seriesId, prefix, meta.suffix)) continue;

    let nextNum = meta.maxNum + 1;
    let nextNumber = `${prefix}${String(nextNum).padStart(meta.padding, '0')}${meta.suffix}`;
    while (usedInvoiceNos.has(nextNumber.toUpperCase())) {
      nextNum += 1;
      nextNumber = `${prefix}${String(nextNum).padStart(meta.padding, '0')}${meta.suffix}`;
    }

    const matchingCustom =
      customSeries.find((c) => getSeriesId(c.prefix || c.id, c.suffix || '') === seriesId) ||
      (!meta.suffix ? customSeries.find((c) => c.prefix === prefix) : undefined);

    const scopedCompanyName = matchingCustom?.scope === 'all'
      ? undefined
      : (matchingCustom?.companyName || undefined);

    // Default series label stays neutral unless explicitly renamed or explicitly scoped to one customer
    let name = formatSeriesDisplayName(prefix, meta.suffix);
    if (matchingCustom && matchingCustom.name) {
      name = matchingCustom.name;
    }

    rawSeriesList.push({
      id: seriesId,
      name,
      prefix,
      padding: meta.padding,
      suffix: meta.suffix,
      lastNumber: meta.maxNum,
      nextNumber,
      companyName: scopedCompanyName,
      scope: scopedCompanyName ? 'company' : 'all',
      isDefault: false,
      isSystemStandard,
      dbLastNumber: meta.dbMaxNum,
      overriddenDbMax: matchingCustom?.overriddenDbMax,
    });
  }

  const storedGlobal = loadGlobalDefaultPrefix();
  const hasStoredGlobal = rawSeriesList.some(
    (s) => s.id === storedGlobal || (!s.suffix && s.prefix === storedGlobal)
  );
  const resolvedGlobalId = hasStoredGlobal ? storedGlobal : 'INV-';

  const seriesList: InvoiceSeriesConfig[] = rawSeriesList.map((s) => ({
    ...s,
    isDefault: s.id === resolvedGlobalId || (!s.suffix && s.prefix === resolvedGlobalId),
  }));

  // Sort series: Preferred for this company first, then standard, then alphabetical
  seriesList.sort((a, b) => {
    if (targetCompanyKey) {
      const aPref = companyPrefs[targetCompanyKey] === a.id || companyPrefs[targetCompanyKey] === a.prefix;
      const bPref = companyPrefs[targetCompanyKey] === b.id || companyPrefs[targetCompanyKey] === b.prefix;
      if (aPref && !bPref) return -1;
      if (!aPref && bPref) return 1;

      const aComp = a.companyName && normalizeCompanyName(a.companyName) === targetCompanyKey;
      const bComp = b.companyName && normalizeCompanyName(b.companyName) === targetCompanyKey;
      if (aComp && !bComp) return -1;
      if (!aComp && bComp) return 1;
    }
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });

  // Determine active series: start from Global Default, then apply company override if explicitly configured
  let activeSeries =
    seriesList.find((s) => s.isDefault) ||
    seriesList.find((s) => s.prefix === 'INV-') ||
    seriesList[0] || {
      id: 'INV-',
      name: 'Standard (INV-)',
      prefix: 'INV-',
      padding: 5,
      suffix: '',
      lastNumber: 0,
      nextNumber: 'INV-00001',
      isDefault: true,
      isSystemStandard: true,
      scope: 'all' as const,
    };

  if (targetCompanyKey) {
    const prefId = companyPrefs[targetCompanyKey];
    if (prefId) {
      const match = seriesList.find((s) => s.id === prefId || s.prefix === prefId);
      if (match) activeSeries = match;
    } else {
      const compSeries = seriesList.find(
        (s) => s.scope === 'company' && s.companyName && normalizeCompanyName(s.companyName) === targetCompanyKey
      );
      if (compSeries) activeSeries = compSeries;
    }
  }

  return {
    seriesList,
    activeSeries,
    suggestedNumber: activeSeries.nextNumber,
  };
}

/**
 * Finds the next free invoice number matching the prefix/format of `invoiceNo`,
 * skipping any number already stored in `cnc_invoices` (excluding `excludeInvoiceId`).
 */
export async function findNextAvailableInvoiceNo(
  invoiceNo: string,
  excludeInvoiceId?: string
): Promise<string | null> {
  const parsed = parseInvoiceNumber(invoiceNo);
  if (!parsed) return null;

  try {
    const { data } = await supabase
      .from('cnc_invoices')
      .select('id, invoice_no')
      .not('invoice_no', 'is', null);

    const patterns = getStoredSuffixPatterns();
    const taken = new Set<string>();
    let maxNum = parsed.num;
    for (const row of data ?? []) {
      if (excludeInvoiceId && String(row.id) === String(excludeInvoiceId)) continue;
      const raw = String(row.invoice_no ?? '').trim();
      if (!raw) continue;
      taken.add(raw.toUpperCase());
      const p = parseInvoiceNumber(raw, patterns);
      if (p && p.prefix === parsed.prefix && p.suffix === parsed.suffix && p.num > maxNum) {
        maxNum = p.num;
      }
    }

    if (!taken.has(parsed.raw.toUpperCase())) {
      return parsed.raw;
    }

    let candidateNum = Math.max(parsed.num + 1, maxNum + 1);
    let candidate = `${parsed.prefix}${String(candidateNum).padStart(parsed.padding, '0')}${parsed.suffix}`;
    while (taken.has(candidate.toUpperCase())) {
      candidateNum += 1;
      candidate = `${parsed.prefix}${String(candidateNum).padStart(parsed.padding, '0')}${parsed.suffix}`;
    }
    return candidate;
  } catch {
    return null;
  }
}

/**
 * Registers or updates an invoice series when a user adds a format or saves an invoice.
 */
export function registerInvoiceSeries(
  invoiceNo: string,
  customerName?: string,
  customName?: string,
  setAsCompanyDefault = false,
  options?: {
    defaultScope?: InvoiceSeriesDefaultScope;
    scope?: 'all' | 'company';
    /** When true (from Add Format UI), `invoiceNo` represents the next number to use rather than a just-saved number. */
    nextNumberIsTarget?: boolean;
    dbLastNumber?: number;
    existingSeriesList?: InvoiceSeriesConfig[];
    parsedOverride?: ParsedInvoiceNumber;
    isManualOverride?: boolean;
  }
): InvoiceSeriesConfig | null {
  const parsed = options?.parsedOverride || parseInvoiceNumber(invoiceNo);
  if (!parsed) return null;

  const targetId = getSeriesId(parsed.prefix, parsed.suffix);
  unhideInvoiceSeries(targetId);
  if (!parsed.suffix) unhideInvoiceSeries(parsed.prefix);

  const customList = loadStoredCustomSeries();
  const existingIndex = customList.findIndex(
    (s) => s.id === targetId || (!parsed.suffix && !s.suffix && s.prefix === parsed.prefix)
  );
  const existing = existingIndex >= 0 ? customList[existingIndex] : undefined;

  const isExplicitForm = !!options;
  const targetScope: 'all' | 'company' = isExplicitForm
    ? (options?.scope ?? 'all')
    : (existing?.scope ?? (existing?.companyName ? 'company' : 'all'));

  const targetLastNum = options?.nextNumberIsTarget ? Math.max(0, parsed.num - 1) : parsed.num;
  const nextNumber = options?.nextNumberIsTarget
    ? `${parsed.prefix}${String(parsed.num).padStart(parsed.padding, '0')}${parsed.suffix}`
    : generateNextInvoiceNumber(parsed, 1);

  const cleanedCustomName = customName?.trim() || '';
  const targetCompanyName =
    targetScope === 'company' ? (customerName || existing?.companyName || undefined) : undefined;

  const patternDisplay = formatSeriesPatternLabel(parsed.prefix, parsed.suffix);
  const fallbackName =
    targetScope === 'company' && targetCompanyName && targetId !== 'INV-'
      ? `${targetCompanyName} (${patternDisplay})`
      : formatSeriesDisplayName(parsed.prefix, parsed.suffix);

  const resolvedName = cleanedCustomName || (!isExplicitForm && existing?.name ? existing.name : fallbackName);
  const dbMax = Math.max(options?.dbLastNumber ?? 0, existing?.dbLastNumber ?? 0);
  const applyManualOverride =
    !!options?.nextNumberIsTarget && (options?.isManualOverride ?? targetLastNum !== dbMax);

  const series: InvoiceSeriesConfig = {
    id: targetId,
    name: resolvedName,
    prefix: parsed.prefix,
    padding: parsed.padding,
    suffix: parsed.suffix,
    lastNumber: targetLastNum,
    nextNumber,
    companyName: targetCompanyName,
    scope: targetScope,
    dbLastNumber: dbMax,
    overriddenDbMax: applyManualOverride ? dbMax : undefined,
    isManualOverride: applyManualOverride ? true : undefined,
  };

  if (existingIndex >= 0) {
    customList[existingIndex] = {
      ...customList[existingIndex],
      ...series,
    };
  } else {
    customList.push(series);
  }

  saveStoredCustomSeries(customList);

  const defaultScope: InvoiceSeriesDefaultScope =
    options?.defaultScope ?? (setAsCompanyDefault && customerName ? 'company' : 'none');

  if (defaultScope === 'all') {
    saveGlobalDefaultPrefix(targetId);
    clearNonCompanySpecificPrefs(options?.existingSeriesList, customerName);
  } else if (defaultScope === 'company' && customerName) {
    saveStoredCompanyPref(customerName, targetId);
  }

  return series;
}

/**
 * Updates an existing invoice number format (name, prefix, suffix, next invoice number, scope, and default setting).
 */
export function updateInvoiceSeries(
  original: InvoiceSeriesConfig,
  nextInvoiceNo: string,
  customName?: string,
  customerName?: string,
  setAsCompanyDefault = false,
  options?: {
    defaultScope?: InvoiceSeriesDefaultScope;
    scope?: 'all' | 'company';
    targetDbMax?: number;
    existingSeriesList?: InvoiceSeriesConfig[];
    parsedOverride?: ParsedInvoiceNumber;
    preserveManualOverride?: boolean;
  }
): InvoiceSeriesConfig | null {
  const parsed = options?.parsedOverride || parseInvoiceNumber(nextInvoiceNo);
  if (!parsed) return null;

  const isSystemStd = !!original.isSystemStandard || original.id === 'INV-';
  // Keep built-in Standard format anchored to INV-; all other formats can change prefix/suffix freely.
  const targetPrefix = isSystemStd ? 'INV-' : parsed.prefix;
  const targetSuffix = isSystemStd ? '' : parsed.suffix;
  const targetId = getSeriesId(targetPrefix, targetSuffix);
  const originalId = original.id || getSeriesId(original.prefix, original.suffix || '');
  const targetLastNum = Math.max(0, parsed.num - 1);
  const nextNumber = `${targetPrefix}${String(targetLastNum + 1).padStart(parsed.padding, '0')}${targetSuffix}`;
  const dbMax = Math.max(
    options?.targetDbMax ?? 0,
    originalId === targetId ? (original.dbLastNumber ?? 0) : 0
  );

  let customList = loadStoredCustomSeries();

  // If a non-system format changed its pattern id, retire the old pattern cleanly.
  if (!isSystemStd && originalId !== targetId) {
    customList = customList.filter((s) => s.id !== originalId && s.prefix !== originalId);
    if ((original.dbLastNumber ?? 0) > 0) {
      const hidden = loadHiddenSeriesPrefixes();
      if (!hidden.includes(originalId)) {
        saveHiddenSeriesPrefixes([...hidden, originalId]);
      }
    }
    const prefs = loadStoredCompanyPrefs();
    let prefsChanged = false;
    for (const [k, v] of Object.entries(prefs)) {
      if (v === originalId || v === original.prefix) {
        prefs[k] = targetId;
        prefsChanged = true;
      }
    }
    if (prefsChanged) {
      try {
        localStorage.setItem(STORAGE_COMPANY_PREF_KEY, JSON.stringify(prefs));
      } catch {
        // ignore
      }
    }
    if (loadGlobalDefaultPrefix() === originalId || loadGlobalDefaultPrefix() === original.prefix) {
      saveGlobalDefaultPrefix(targetId);
    }
  }

  unhideInvoiceSeries(targetId);
  if (!targetSuffix) unhideInvoiceSeries(targetPrefix);

  const defaultScope: InvoiceSeriesDefaultScope =
    options?.defaultScope ?? (setAsCompanyDefault && customerName ? 'company' : 'none');

  const targetScope: 'all' | 'company' = isSystemStd
    ? 'all'
    : (options?.scope ?? (defaultScope === 'company' ? 'company' : 'all'));

  const targetCompanyName =
    targetScope === 'company' ? (customerName || original.companyName || undefined) : undefined;

  const patternDisplay = formatSeriesPatternLabel(targetPrefix, targetSuffix);
  const resolvedName =
    customName?.trim() ||
    (isSystemStd
      ? 'Standard (INV-)'
      : targetScope === 'company' && targetCompanyName
        ? `${targetCompanyName} (${patternDisplay})`
        : formatSeriesDisplayName(targetPrefix, targetSuffix));

  const applyManualOverride = options?.preserveManualOverride ?? targetLastNum !== dbMax;

  const updated: InvoiceSeriesConfig = {
    id: targetId,
    name: resolvedName,
    prefix: targetPrefix,
    padding: parsed.padding,
    suffix: targetSuffix,
    lastNumber: targetLastNum,
    nextNumber,
    companyName: targetCompanyName,
    scope: targetScope,
    isSystemStandard: isSystemStd,
    isDefault: defaultScope === 'all' || (!isSystemStd && loadGlobalDefaultPrefix() === targetId),
    dbLastNumber: dbMax,
    overriddenDbMax: applyManualOverride ? dbMax : undefined,
    isManualOverride: applyManualOverride ? true : undefined,
  };

  const existingIndex = customList.findIndex(
    (s) => s.id === targetId || (!targetSuffix && !s.suffix && s.prefix === targetPrefix)
  );
  if (existingIndex >= 0) {
    customList[existingIndex] = updated;
  } else {
    customList.push(updated);
  }
  saveStoredCustomSeries(customList);

  if (defaultScope === 'all') {
    saveGlobalDefaultPrefix(targetId);
    clearNonCompanySpecificPrefs(options?.existingSeriesList, customerName);
  } else if (defaultScope === 'company' && customerName) {
    saveStoredCompanyPref(customerName, targetId);
    if (loadGlobalDefaultPrefix() === targetId && targetId !== 'INV-') {
      saveGlobalDefaultPrefix('INV-');
    }
  } else {
    if (customerName) {
      const prefs = loadStoredCompanyPrefs();
      const prefVal = prefs[normalizeCompanyName(customerName)];
      if (prefVal === targetId || prefVal === originalId) {
        removeStoredCompanyPref(customerName);
      }
    }
    if (defaultScope === 'none' && loadGlobalDefaultPrefix() === targetId && targetId !== 'INV-') {
      saveGlobalDefaultPrefix('INV-');
    }
  }

  return updated;
}

/**
 * Sets any format as the Global Default for all customers in one step.
 */
export function setGlobalDefaultInvoiceSeries(
  seriesIdOrPrefix: string,
  allSeries: InvoiceSeriesConfig[],
  currentCustomerName?: string
): void {
  if (!seriesIdOrPrefix) return;
  const matchedSeries = allSeries.find((s) => s.id === seriesIdOrPrefix || (!s.suffix && s.prefix === seriesIdOrPrefix));
  const resolvedId = matchedSeries?.id || seriesIdOrPrefix;
  unhideInvoiceSeries(resolvedId);
  saveGlobalDefaultPrefix(resolvedId);

  // If the series had previously been tagged to a single company, promote it to a shared global series.
  const customList = loadStoredCustomSeries();
  const idx = customList.findIndex((s) => s.id === resolvedId || s.prefix === seriesIdOrPrefix);
  if (idx >= 0 && customList[idx].scope === 'company') {
    const oldComp = customList[idx].companyName;
    const patLabel = formatSeriesPatternLabel(customList[idx].prefix, customList[idx].suffix || '');
    const isOldAutoName = oldComp && (
      customList[idx].name === `${oldComp} (${customList[idx].prefix})` ||
      customList[idx].name === `${oldComp} (${patLabel})`
    );
    customList[idx] = {
      ...customList[idx],
      companyName: undefined,
      scope: 'all',
      name: isOldAutoName
        ? formatSeriesDisplayName(customList[idx].prefix, customList[idx].suffix || '')
        : customList[idx].name,
    };
    saveStoredCustomSeries(customList);
  }

  clearNonCompanySpecificPrefs(allSeries, currentCustomerName);
}

/**
 * Clears any manual sequence override on a series so the next number resyncs to the DB max.
 */
export function clearInvoiceSeriesManualOverride(seriesIdOrPrefix: string): void {
  if (!seriesIdOrPrefix) return;
  const customList = loadStoredCustomSeries();
  let changed = false;
  const nextList = customList.map((s) => {
    const sid = s.id || getSeriesId(s.prefix, s.suffix || '');
    if (sid === seriesIdOrPrefix || (!s.suffix && s.prefix === seriesIdOrPrefix)) {
      if (s.isManualOverride || s.overriddenDbMax !== undefined) {
        changed = true;
        return { ...s, overriddenDbMax: undefined, isManualOverride: undefined };
      }
    }
    return s;
  });
  if (changed) saveStoredCustomSeries(nextList);
}

/**
 * Removes an invoice format from the picker list (and hides DB-discovered non-default series).
 */
export function deleteInvoiceSeries(seriesIdOrPrefix: string): void {
  if (!seriesIdOrPrefix || seriesIdOrPrefix === 'INV-') return;

  const customList = loadStoredCustomSeries().filter(
    (s) => s.id !== seriesIdOrPrefix && (!!s.suffix || s.prefix !== seriesIdOrPrefix)
  );
  saveStoredCustomSeries(customList);

  if (loadGlobalDefaultPrefix() === seriesIdOrPrefix) {
    saveGlobalDefaultPrefix('INV-');
  }

  const prefs = loadStoredCompanyPrefs();
  let changed = false;
  for (const [k, v] of Object.entries(prefs)) {
    if (v === seriesIdOrPrefix) {
      delete prefs[k];
      changed = true;
    }
  }
  if (changed) {
    try {
      localStorage.setItem(STORAGE_COMPANY_PREF_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }

  const hidden = loadHiddenSeriesPrefixes();
  if (!hidden.includes(seriesIdOrPrefix)) {
    saveHiddenSeriesPrefixes([...hidden, seriesIdOrPrefix]);
  }
}
