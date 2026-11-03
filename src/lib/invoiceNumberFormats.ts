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
  isDefault?: boolean;
}

export interface CompanySeriesMapping {
  [companyNameNormalized: string]: string; // maps normalized customer name to series prefix/id
}

const STORAGE_SERIES_KEY = 'argus_invoice_custom_series_v1';
const STORAGE_COMPANY_PREF_KEY = 'argus_company_invoice_series_pref_v1';

export const normalizeCompanyName = (name?: string | null): string => {
  return String(name || '').trim().toLowerCase();
};

/**
 * Parses an invoice string into prefix, sequential digits, and optional suffix.
 * e.g. "INV-00006" -> prefix: "INV-", num: 6, padding: 5, suffix: ""
 * e.g. "LGB/24-25/001" -> prefix: "LGB/24-25/", num: 1, padding: 3, suffix: ""
 * e.g. "AT-99" -> prefix: "AT-", num: 99, padding: 2, suffix: ""
 */
export function parseInvoiceNumber(raw?: string | null): ParsedInvoiceNumber | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Match the LAST contiguous block of digits as the sequence serial number
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

/**
 * Discovers all invoice series from database + local storage,
 * and determines the best series and next auto-generated number for a specific company.
 */
export async function getInvoiceSeriesState(customerName?: string): Promise<{
  seriesList: InvoiceSeriesConfig[];
  activeSeries: InvoiceSeriesConfig;
  suggestedNumber: string;
}> {
  const customSeries = loadStoredCustomSeries();
  const companyPrefs = loadStoredCompanyPrefs();
  const targetCompanyKey = normalizeCompanyName(customerName);

  // Group existing numbers from DB
  const prefixMap = new Map<string, {
    maxNum: number;
    padding: number;
    suffix: string;
    sample: string;
    companies: Set<string>;
    latestCompanyDate: Map<string, string>;
  }>();

  // Always seed default standard series
  prefixMap.set('INV-', {
    maxNum: 0,
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
        const parsed = parseInvoiceNumber(row.invoice_no);
        if (!parsed) continue;

        const current = prefixMap.get(parsed.prefix) || {
          maxNum: 0,
          padding: parsed.padding,
          suffix: parsed.suffix,
          sample: parsed.raw,
          companies: new Set(),
          latestCompanyDate: new Map(),
        };

        if (parsed.num > current.maxNum) {
          current.maxNum = parsed.num;
          current.padding = Math.max(current.padding, parsed.padding);
          current.suffix = parsed.suffix;
          current.sample = parsed.raw;
        }

        if (row.customer_name) {
          current.companies.add(row.customer_name);
          current.latestCompanyDate.set(normalizeCompanyName(row.customer_name), row.created_at || '');
        }

        prefixMap.set(parsed.prefix, current);
      }
    }
  } catch {
    // Supabase query failed or offline
  }

  // Merge custom user-configured series into map
  for (const cs of customSeries) {
    const parsed = parseInvoiceNumber(cs.sample || cs.prefix + '1');
    const prefix = cs.prefix || (parsed ? parsed.prefix : cs.id);
    const existing = prefixMap.get(prefix);

    if (existing) {
      if (cs.lastNumber > existing.maxNum) {
        existing.maxNum = cs.lastNumber;
      }
      if (cs.companyName) {
        existing.companies.add(cs.companyName);
      }
    } else {
      prefixMap.set(prefix, {
        maxNum: cs.lastNumber || (parsed ? parsed.num : 0),
        padding: cs.padding || (parsed ? parsed.padding : 3),
        suffix: cs.suffix || (parsed ? parsed.suffix : ''),
        sample: cs.sample || `${prefix}001`,
        companies: cs.companyName ? new Set([cs.companyName]) : new Set(),
        latestCompanyDate: new Map(),
      });
    }
  }

  // Compile final array of series configs
  const seriesList: InvoiceSeriesConfig[] = [];

  for (const [prefix, meta] of prefixMap.entries()) {
    const isDefault = prefix === 'INV-';
    const nextNum = meta.maxNum + 1;
    const nextNumber = `${prefix}${String(nextNum).padStart(meta.padding, '0')}${meta.suffix}`;
    
    // Find friendly name
    let name = isDefault ? 'Standard (INV-)' : `${prefix} Series`;
    const matchingCustom = customSeries.find((c) => c.prefix === prefix);
    if (matchingCustom && matchingCustom.name) {
      name = matchingCustom.name;
    } else if (meta.companies.size === 1) {
      const singleComp = Array.from(meta.companies)[0];
      name = `${singleComp} (${prefix})`;
    }

    seriesList.push({
      id: prefix,
      name,
      prefix,
      padding: meta.padding,
      suffix: meta.suffix,
      lastNumber: meta.maxNum,
      nextNumber,
      companyName: meta.companies.size === 1 ? Array.from(meta.companies)[0] : undefined,
      isDefault,
    });
  }

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

  // Determine active series for this company
  let activeSeries = seriesList[0] || {
    id: 'INV-',
    name: 'Standard (INV-)',
    prefix: 'INV-',
    padding: 5,
    suffix: '',
    lastNumber: 0,
    nextNumber: 'INV-00001',
    isDefault: true,
  };

  if (targetCompanyKey) {
    const prefId = companyPrefs[targetCompanyKey];
    if (prefId) {
      const match = seriesList.find((s) => s.id === prefId || s.prefix === prefId);
      if (match) activeSeries = match;
    } else {
      // Check if this company has an existing series in the DB
      const compSeries = seriesList.find(
        (s) => s.companyName && normalizeCompanyName(s.companyName) === targetCompanyKey
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
 * Registers or updates an invoice series when a user types a new format or saves an invoice.
 */
export function registerInvoiceSeries(
  invoiceNo: string,
  customerName?: string,
  customName?: string,
  setAsCompanyDefault = true
): InvoiceSeriesConfig | null {
  const parsed = parseInvoiceNumber(invoiceNo);
  if (!parsed) return null;

  const customList = loadStoredCustomSeries();
  const existingIndex = customList.findIndex((s) => s.prefix === parsed.prefix);

  const series: InvoiceSeriesConfig = {
    id: parsed.prefix,
    name: customName || (customerName ? `${customerName} (${parsed.prefix})` : `${parsed.prefix} Series`),
    prefix: parsed.prefix,
    padding: parsed.padding,
    suffix: parsed.suffix,
    lastNumber: parsed.num,
    nextNumber: generateNextInvoiceNumber(parsed, 1),
    companyName: customerName || undefined,
  };

  if (existingIndex >= 0) {
    customList[existingIndex] = {
      ...customList[existingIndex],
      lastNumber: Math.max(customList[existingIndex].lastNumber, parsed.num),
      nextNumber: generateNextInvoiceNumber(parsed, 1),
      companyName: customerName || customList[existingIndex].companyName,
      name: customName || customList[existingIndex].name,
    };
  } else {
    customList.push(series);
  }

  saveStoredCustomSeries(customList);

  if (customerName && setAsCompanyDefault) {
    saveStoredCompanyPref(customerName, parsed.prefix);
  }

  return series;
}
