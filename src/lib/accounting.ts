// Types + thin wrappers for the accounting database functions
// (supabase/migrations/20260923010000_accounting.sql). All figures are calculated in the
// database for the current company; the browser only displays them.
import { supabase } from '@/lib/supabase';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export interface FinancialYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'Open' | 'Closed';
  is_current: boolean;
}

export interface FinancialYearsResponse {
  company: { id: string; company_name: string; fy_start_month: number };
  today: string;
  years: FinancialYear[];
}

export interface Account {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  account_type: AccountType;
  bs_class: 'CURRENT' | 'NON_CURRENT' | null;
  is_group: boolean;
  system_key: string | null;
  status: 'Active' | 'Inactive';
  has_postings: boolean;
}

export interface ReportRow {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  account_type: AccountType;
  bs_class?: 'CURRENT' | 'NON_CURRENT' | null;
  is_group: boolean;
  system_key?: string | null;
  level: number;
  amount: string;
  virtual?: boolean;
  link?: 'ledger' | 'profit_loss';
}

export interface BalanceSheet {
  company: string;
  financial_year: { id: string; name: string; start_date: string; end_date: string; status: string };
  as_of: string;
  generated_at: string;
  has_data: boolean;
  rows: ReportRow[];
  totals: {
    assets: string; liabilities: string; equity: string; liabilities_and_equity: string;
    current_assets: string; current_liabilities: string; non_current_assets: string; non_current_liabilities: string;
    profit_current_period: string;
  };
  current_ratio: string | null;
  balanced: boolean;
  difference: string;
}

export interface ProfitAndLoss {
  company: string;
  from: string;
  to: string;
  rows: ReportRow[];
  totals: { income: string; expenses: string; net_profit: string };
}

export interface TrialBalance {
  company: string;
  financial_year: { id: string; name: string; start_date: string; end_date: string };
  as_of: string;
  rows: { id: string; code: string; name: string; account_type: AccountType; debit: string; credit: string }[];
  totals: { debit: string; credit: string };
}

export interface LedgerLine {
  journal_id: string;
  entry_no: string;
  entry_date: string;
  voucher_type: string;
  narration: string | null;
  reference: string | null;
  source_type: string | null;
  source_id: string | null;
  account: string;
  party: string | null;
  debit: string;
  credit: string;
  balance: string;
}

export interface Ledger {
  account: { id: string; code: string; name: string; account_type: AccountType; is_group: boolean };
  from: string;
  to: string;
  opening: string;
  lines: LedgerLine[];
  totals: { debit: string; credit: string };
  closing: string;
}

export type VoucherType = 'Journal' | 'Receipt' | 'Payment' | 'Contra' | 'Opening' | 'Sales' | 'Purchase' | 'Stock';

export interface JournalEntry {
  id: string;
  entry_no: string;
  entry_date: string;
  voucher_type: VoucherType;
  narration: string | null;
  reference: string | null;
  source_type: string | null;
  source_id: string | null;
  is_system: boolean;
  created_by: string | null;
  created_at: string;
  total: string;
  lines: { account_id: string; account_code: string; account_name: string; party: string | null; debit: string; credit: string }[];
}

/** Human label for the module an automatic entry came from. */
export const SOURCE_LABELS: Record<string, string> = {
  invoice: 'Sales invoice',
  invoice_receipt: 'Invoice receipt',
  grn: 'Goods receipt',
  stock_issue: 'Material issue',
  opening_stock: 'Opening stock',
  stock_movement: 'Stock movement',
  inventory_reval: 'Inventory revaluation',
};

/** Where to open the source record of an automatic entry. */
export const SOURCE_ROUTES: Record<string, string> = {
  invoice: '/sales/pipeline',
  invoice_receipt: '/sales/pipeline',
  grn: '/purchasing/goods-receipt',
  stock_issue: '/inventory/movements',
  opening_stock: '/inventory/stock',
  stock_movement: '/inventory/stock',
  inventory_reval: '/inventory/stock',
};

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const accountingApi = {
  financialYears: () => call<FinancialYearsResponse>('erp_financial_years'),
  balanceSheet: (fyId: string, asOf: string) => call<BalanceSheet>('erp_balance_sheet', { p_fy_id: fyId, p_as_of: asOf }),
  profitAndLoss: (from: string, to: string) => call<ProfitAndLoss>('erp_profit_and_loss', { p_from: from, p_to: to }),
  trialBalance: (fyId: string, asOf: string) => call<TrialBalance>('erp_trial_balance', { p_fy_id: fyId, p_as_of: asOf }),
  ledger: (accountId: string, from: string, to: string) => call<Ledger>('erp_account_ledger', { p_account_id: accountId, p_from: from, p_to: to }),
  chartOfAccounts: () => call<Account[]>('erp_chart_of_accounts'),
  journalEntries: (from: string, to: string) => call<JournalEntry[]>('erp_journal_entries', { p_from: from, p_to: to }),
  journalEntry: (id: string) => call<JournalEntry | null>('erp_journal_entry', { p_id: id }),
  saveJournal: (args: { id: string | null; date: string; type: VoucherType; narration: string; reference: string; lines: { account_id: string; debit: string; credit: string; party: string }[] }) =>
    call<{ id: string; entry_no: string }>('erp_save_journal', {
      p_id: args.id, p_entry_date: args.date, p_voucher_type: args.type, p_narration: args.narration,
      p_reference: args.reference, p_lines: args.lines,
    }),
  deleteJournal: (id: string) => call<void>('erp_delete_journal', { p_id: id }),
  saveAccount: (args: { id: string | null; parentId: string | null; code: string; name: string; isGroup: boolean; status: 'Active' | 'Inactive' }) =>
    call<Account>('erp_save_account', {
      p_id: args.id, p_parent_id: args.parentId, p_code: args.code, p_name: args.name, p_is_group: args.isGroup, p_status: args.status,
    }),
};

/** Builds parent → children lookup for report rows / accounts. */
export function childrenMap<T extends { id: string; parent_id: string | null }>(rows: T[]) {
  const map = new Map<string | null, T[]>();
  rows.forEach(r => {
    const list = map.get(r.parent_id) ?? [];
    list.push(r);
    map.set(r.parent_id, list);
  });
  return map;
}
