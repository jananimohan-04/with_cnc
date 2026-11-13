/**
 * Unified per-module and per-page colour theming for CNCFORGE BI.
 *
 * Every module has one synchronized colour identity across:
 *   1. Top KPI counter (background, icon chip, active glow ring, ping dot)
 *   2. Opened Page / Entry form (background gradient, form tint, card border, primary button)
 *   3. Kanban Column (column background, border, title, cards, badges, buttons, search)
 *   4. Tables (header accent, subtle alternating row tints)
 *
 * Saturated jewel & earth tones only (15–25 % luminance).  Zero black.
 */

export interface KanbanColTheme {
  id: string;
  title: string;
  desc: string;
  bg: string;
  border: string;
  text: string;
  card: string;
  code: string;
  amount: string;
  badge: string;
  button: string;
  search: string;
}

export interface ModuleTheme {
  id: string;
  name: string;
  stage: string;
  /** Background gradient for opened page canvas */
  gradient: string;
  /** KPI tile classes */
  kpiTile: string;
  kpiIcon: string;
  kpiActive: string;
  kpiDot: string;
  /** Kanban column styling */
  kanban: KanbanColTheme;
  /** Table header styling class */
  tableClass: string;
  /** Card container border accent */
  cardBorder: string;
  /** Primary button styling */
  btnPrimary: string;
  /** Entry form panel tint */
  entryPanel: string;
}

export interface PageTheme {
  gradient: string;
  label: string;
}

/* ── Module Themes (1 module = 1 consistent colour identity) ─────────── */

export const MODULE_THEMES: Record<string, ModuleTheme> = {
  Enquiry: {
    id: 'enquiry',
    name: 'Total Enquiries',
    stage: 'Enquiry',
    gradient: 'linear-gradient(135deg, #143b70 0%, #1a4a8c 50%, #10305c 100%)',
    kpiTile: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.blue.400)_0%,theme(colors.blue.500)_100%)] kanban-shine border-blue-400/50 !shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_16px_-8px_theme(colors.blue.800)] hover:brightness-125',
    kpiIcon: 'bg-blue-500/30 text-blue-100',
    kpiActive: '!opacity-100 ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900 border-2 border-blue-300 shadow-[0_0_16px_rgba(96,165,250,0.85)] brightness-110 font-black scale-[1.04] z-10',
    kpiDot: 'bg-blue-300',
    kanban: {
      id: 'Enquiry',
      title: 'ENQUIRY',
      desc: 'New opportunities',
      bg: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.blue.400)_0%,theme(colors.blue.500)_100%)] kanban-shine !shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_0_0_1px_rgba(255,255,255,0.08),0_14px_30px_-12px_theme(colors.blue.800)]',
      border: 'border-blue-700/70',
      text: 'text-slate-950',
      card: 'no-glass !bg-white border-blue-800 hover:border-blue-950 text-slate-900 shadow-md',
      code: 'bg-blue-100 text-blue-800 border border-blue-300',
      amount: 'text-blue-700',
      badge: 'bg-white text-blue-800 border-white',
      button: 'bg-white/85 hover:bg-white text-blue-900 border-white',
      search: 'no-glass !bg-white border border-blue-800 text-slate-800 placeholder-blue-700/50',
    },
    tableClass: 'erp-table-blue',
    cardBorder: 'border-blue-400/30',
    btnPrimary: '!bg-blue-600 hover:!bg-blue-500 text-white shadow-md shadow-blue-500/25 !border-blue-600',
    entryPanel: 'border-blue-400 bg-blue-100/90 [--entry-border:theme(colors.blue.400)]',
  },

  Quotation: {
    id: 'quotation',
    name: 'Quotations',
    stage: 'Quotation',
    gradient: 'linear-gradient(135deg, #461e68 0%, #572780 50%, #381854 100%)',
    kpiTile: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.violet.400)_0%,theme(colors.violet.500)_100%)] kanban-shine border-violet-400/50 !shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_16px_-8px_theme(colors.violet.800)] hover:brightness-125',
    kpiIcon: 'bg-violet-500/30 text-violet-100',
    kpiActive: '!opacity-100 ring-2 ring-violet-400 ring-offset-2 ring-offset-slate-900 border-2 border-violet-300 shadow-[0_0_16px_rgba(167,139,250,0.85)] brightness-110 font-black scale-[1.04] z-10',
    kpiDot: 'bg-violet-300',
    kanban: {
      id: 'Quotation',
      title: 'QUOTATION',
      desc: 'Sent to customer',
      bg: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.violet.400)_0%,theme(colors.violet.500)_100%)] kanban-shine !shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_0_0_1px_rgba(255,255,255,0.08),0_14px_30px_-12px_theme(colors.violet.800)]',
      border: 'border-violet-700/70',
      text: 'text-slate-950',
      card: 'no-glass !bg-white border-violet-800 hover:border-violet-950 text-slate-900 shadow-md',
      code: 'bg-violet-100 text-violet-800 border border-violet-300',
      amount: 'text-violet-700',
      badge: 'bg-white text-violet-800 border-white',
      button: 'bg-white/85 hover:bg-white text-violet-900 border-white',
      search: 'no-glass !bg-white border border-violet-800 text-slate-800 placeholder-violet-700/50',
    },
    tableClass: 'erp-table-violet',
    cardBorder: 'border-violet-400/30',
    btnPrimary: '!bg-violet-600 hover:!bg-violet-500 text-white shadow-md shadow-violet-500/25 !border-violet-600',
    entryPanel: 'border-violet-400 bg-violet-100/90 [--entry-border:theme(colors.violet.400)]',
  },

  'Sales Order': {
    id: 'sales-order',
    name: 'Sales Orders',
    stage: 'Sales Order',
    gradient: 'linear-gradient(135deg, #0d503c 0%, #12654c 50%, #0a3f2f 100%)',
    kpiTile: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.emerald.400)_0%,theme(colors.emerald.500)_100%)] kanban-shine border-emerald-400/50 !shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_16px_-8px_theme(colors.emerald.800)] hover:brightness-125',
    kpiIcon: 'bg-emerald-500/30 text-emerald-100',
    kpiActive: '!opacity-100 ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900 border-2 border-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.85)] brightness-110 font-black scale-[1.04] z-10',
    kpiDot: 'bg-emerald-300',
    kanban: {
      id: 'Sales Order',
      title: 'SALES ORDER',
      desc: 'Confirmed orders',
      bg: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.emerald.400)_0%,theme(colors.emerald.500)_100%)] kanban-shine !shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_0_0_1px_rgba(255,255,255,0.08),0_14px_30px_-12px_theme(colors.emerald.800)]',
      border: 'border-emerald-700/70',
      text: 'text-slate-950',
      card: 'no-glass !bg-white border-emerald-800 hover:border-emerald-950 text-slate-900 shadow-md',
      code: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
      amount: 'text-emerald-700',
      badge: 'bg-white text-emerald-800 border-white',
      button: 'bg-white/85 hover:bg-white text-emerald-900 border-white',
      search: 'no-glass !bg-white border border-emerald-800 text-slate-800 placeholder-emerald-700/50',
    },
    tableClass: 'erp-table-emerald',
    cardBorder: 'border-emerald-400/30',
    btnPrimary: '!bg-emerald-600 hover:!bg-emerald-500 text-white shadow-md shadow-emerald-500/25 !border-emerald-600',
    entryPanel: 'border-emerald-400 bg-emerald-100/90 [--entry-border:theme(colors.emerald.400)]',
  },

  Inward: {
    id: 'inward',
    name: 'Inward',
    stage: 'Inward',
    gradient: 'linear-gradient(135deg, #73390c 0%, #8c460f 50%, #592c09 100%)',
    kpiTile: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.yellow.300)_0%,theme(colors.yellow.400)_100%)] kanban-shine border-amber-400/50 !shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_16px_-8px_theme(colors.yellow.600)] hover:brightness-125',
    kpiIcon: 'bg-amber-500/30 text-amber-100',
    kpiActive: '!opacity-100 ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 border-2 border-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.85)] brightness-110 font-black scale-[1.04] z-10',
    kpiDot: 'bg-amber-300',
    kanban: {
      id: 'Inward',
      title: 'INWARD',
      desc: 'Raw material / Purchase',
      bg: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.yellow.300)_0%,theme(colors.yellow.400)_100%)] kanban-shine !shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_0_0_1px_rgba(255,255,255,0.08),0_14px_30px_-12px_theme(colors.yellow.600)]',
      border: 'border-amber-700/70',
      text: 'text-slate-950',
      card: 'no-glass !bg-white border-amber-800 hover:border-amber-950 text-slate-900 shadow-md',
      code: 'bg-amber-100 text-amber-800 border border-amber-300',
      amount: 'text-amber-700',
      badge: 'bg-white text-amber-800 border-white',
      button: 'bg-white/85 hover:bg-white text-amber-900 border-white',
      search: 'no-glass !bg-white border border-amber-800 text-slate-800 placeholder-amber-700/50',
    },
    tableClass: 'erp-table-amber',
    cardBorder: 'border-amber-400/30',
    btnPrimary: '!bg-amber-600 hover:!bg-amber-500 text-white shadow-md shadow-amber-500/25 !border-amber-600',
    entryPanel: 'border-amber-400 bg-amber-100/90 [--entry-border:theme(colors.amber.400)]',
  },

  'Finished Goods': {
    id: 'finished-goods',
    name: 'Finished Goods',
    stage: 'Finished Goods',
    gradient: 'linear-gradient(135deg, #0f545e 0%, #136875 50%, #0c424a 100%)',
    kpiTile: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.teal.400)_0%,theme(colors.teal.500)_100%)] kanban-shine border-teal-400/50 !shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_16px_-8px_theme(colors.teal.800)] hover:brightness-125',
    kpiIcon: 'bg-teal-500/30 text-teal-100',
    kpiActive: '!opacity-100 ring-2 ring-teal-400 ring-offset-2 ring-offset-slate-900 border-2 border-teal-300 shadow-[0_0_16px_rgba(45,212,191,0.85)] brightness-110 font-black scale-[1.04] z-10',
    kpiDot: 'bg-teal-300',
    kanban: {
      id: 'Finished Goods',
      title: 'FINISHED GOODS',
      desc: 'Ready for delivery',
      bg: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.teal.400)_0%,theme(colors.teal.500)_100%)] kanban-shine !shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_0_0_1px_rgba(255,255,255,0.08),0_14px_30px_-12px_theme(colors.teal.800)]',
      border: 'border-teal-700/70',
      text: 'text-slate-950',
      card: 'no-glass !bg-white border-teal-800 hover:border-teal-950 text-slate-900 shadow-md',
      code: 'bg-teal-100 text-teal-800 border border-teal-300',
      amount: 'text-teal-700',
      badge: 'bg-white text-teal-800 border-white',
      button: 'bg-white/85 hover:bg-white text-teal-900 border-white',
      search: 'no-glass !bg-white border border-teal-800 text-slate-800 placeholder-teal-700/50',
    },
    tableClass: 'erp-table-teal',
    cardBorder: 'border-teal-400/30',
    btnPrimary: '!bg-teal-600 hover:!bg-teal-500 text-white shadow-md shadow-teal-500/25 !border-teal-600',
    entryPanel: 'border-teal-400 bg-teal-100/90 [--entry-border:theme(colors.teal.400)]',
  },

  Rejected: {
    id: 'rejected',
    name: 'Rejected',
    stage: 'Rejected',
    gradient: 'linear-gradient(135deg, #6d1830 0%, #841e3b 50%, #541225 100%)',
    kpiTile: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.rose.400)_0%,theme(colors.rose.500)_100%)] kanban-shine border-rose-400/50 !shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_16px_-8px_theme(colors.rose.800)] hover:brightness-125',
    kpiIcon: 'bg-rose-500/30 text-rose-100',
    kpiActive: '!opacity-100 ring-2 ring-rose-400 ring-offset-2 ring-offset-slate-900 border-2 border-rose-300 shadow-[0_0_16px_rgba(251,113,133,0.85)] brightness-110 font-black scale-[1.04] z-10',
    kpiDot: 'bg-rose-300',
    kanban: {
      id: 'Rejected',
      title: 'REJECTED',
      desc: 'Quality rejections',
      bg: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.rose.400)_0%,theme(colors.rose.500)_100%)] kanban-shine !shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_0_0_1px_rgba(255,255,255,0.08),0_14px_30px_-12px_theme(colors.rose.800)]',
      border: 'border-rose-700/70',
      text: 'text-slate-950',
      card: 'no-glass !bg-white border-rose-800 hover:border-rose-950 text-slate-900 shadow-md',
      code: 'bg-rose-100 text-rose-800 border border-rose-300',
      amount: 'text-rose-700',
      badge: 'bg-white text-rose-800 border-white',
      button: 'bg-white/85 hover:bg-white text-rose-900 border-white',
      search: 'no-glass !bg-white border border-rose-800 text-slate-800 placeholder-rose-700/50',
    },
    tableClass: 'erp-table-rose',
    cardBorder: 'border-rose-400/30',
    btnPrimary: '!bg-rose-600 hover:!bg-rose-500 text-white shadow-md shadow-rose-500/25 !border-rose-600',
    entryPanel: 'border-rose-400 bg-rose-100/90 [--entry-border:theme(colors.rose.400)]',
  },

  DC: {
    id: 'dc',
    name: 'Delivery Challans',
    stage: 'DC',
    gradient: 'linear-gradient(135deg, #4a1942 0%, #5e2054 50%, #3b1435 100%)',
    kpiTile: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.fuchsia.400)_0%,theme(colors.fuchsia.500)_100%)] kanban-shine border-fuchsia-400/50 !shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_16px_-8px_theme(colors.fuchsia.800)] hover:brightness-125',
    kpiIcon: 'bg-fuchsia-500/30 text-fuchsia-100',
    kpiActive: '!opacity-100 ring-2 ring-fuchsia-400 ring-offset-2 ring-offset-slate-900 border-2 border-fuchsia-300 shadow-[0_0_16px_rgba(232,121,249,0.85)] brightness-110 font-black scale-[1.04] z-10',
    kpiDot: 'bg-fuchsia-300',
    kanban: {
      id: 'DC',
      title: 'DELIVERY CHALLAN',
      desc: 'Dispatch to company',
      bg: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.fuchsia.400)_0%,theme(colors.fuchsia.500)_100%)] kanban-shine !shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_0_0_1px_rgba(255,255,255,0.08),0_14px_30px_-12px_theme(colors.fuchsia.800)]',
      border: 'border-fuchsia-700/70',
      text: 'text-slate-950',
      card: 'no-glass !bg-white border-fuchsia-800 hover:border-fuchsia-950 text-slate-900 shadow-md',
      code: 'bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-300',
      amount: 'text-fuchsia-700',
      badge: 'bg-white text-fuchsia-800 border-white',
      button: 'bg-white/85 hover:bg-white text-fuchsia-900 border-white',
      search: 'no-glass !bg-white border border-fuchsia-800 text-slate-800 placeholder-fuchsia-700/50',
    },
    tableClass: 'erp-table-plum',
    cardBorder: 'border-fuchsia-400/30',
    btnPrimary: '!bg-fuchsia-700 hover:!bg-fuchsia-600 text-white shadow-md shadow-fuchsia-500/25 !border-fuchsia-700',
    entryPanel: 'border-fuchsia-400 bg-fuchsia-100/90 [--entry-border:theme(colors.fuchsia.400)]',
  },

  Invoice: {
    id: 'invoice',
    name: 'Invoices',
    stage: 'Invoice',
    gradient: 'linear-gradient(135deg, #24286d 0%, #2d3288 50%, #1b1e55 100%)',
    kpiTile: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.indigo.400)_0%,theme(colors.indigo.500)_100%)] kanban-shine border-indigo-400/50 !shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_16px_-8px_theme(colors.indigo.800)] hover:brightness-125',
    kpiIcon: 'bg-indigo-500/30 text-indigo-100',
    kpiActive: '!opacity-100 ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900 border-2 border-indigo-300 shadow-[0_0_16px_rgba(129,140,248,0.85)] brightness-110 font-black scale-[1.04] z-10',
    kpiDot: 'bg-indigo-300',
    kanban: {
      id: 'Invoice',
      title: 'INVOICE',
      desc: 'Billed & Completed',
      bg: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.indigo.400)_0%,theme(colors.indigo.500)_100%)] kanban-shine !shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_0_0_1px_rgba(255,255,255,0.08),0_14px_30px_-12px_theme(colors.indigo.800)]',
      border: 'border-indigo-700/70',
      text: 'text-slate-950',
      card: 'no-glass !bg-white border-indigo-800 hover:border-indigo-950 text-slate-900 shadow-md',
      code: 'bg-indigo-100 text-indigo-800 border border-indigo-300',
      amount: 'text-indigo-700',
      badge: 'bg-white text-indigo-800 border-white',
      button: 'bg-white/85 hover:bg-white text-indigo-900 border-white',
      search: 'no-glass !bg-white border border-indigo-800 text-slate-800 placeholder-indigo-700/50',
    },
    tableClass: 'erp-table-indigo',
    cardBorder: 'border-indigo-400/30',
    btnPrimary: '!bg-indigo-600 hover:!bg-indigo-500 text-white shadow-md shadow-indigo-500/25 !border-indigo-600',
    entryPanel: 'border-indigo-400 bg-indigo-100/90 [--entry-border:theme(colors.indigo.400)]',
  },

  'Pipeline Report': {
    id: 'pipeline-report',
    name: 'Pipeline Report',
    stage: 'Pipeline Report',
    gradient: 'linear-gradient(135deg, #0e4f5a 0%, #0d6e7c 50%, #06353d 100%)',
    kpiTile: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.teal.400)_0%,theme(colors.teal.500)_100%)] kanban-shine border-teal-400/50 !shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_16px_-8px_theme(colors.teal.800)] hover:brightness-125',
    kpiIcon: 'bg-teal-500/30 text-teal-100',
    kpiActive: '!opacity-100 ring-2 ring-teal-400 ring-offset-2 ring-offset-slate-900 border-2 border-teal-300 shadow-[0_0_16px_rgba(45,212,191,0.85)] brightness-110 font-black scale-[1.04] z-10',
    kpiDot: 'bg-teal-300',
    kanban: {
      id: 'Pipeline Report',
      title: 'PIPELINE REPORT',
      desc: 'Pipeline conversion and stage analytics',
      bg: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.teal.400)_0%,theme(colors.teal.500)_100%)] kanban-shine !shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_0_0_1px_rgba(255,255,255,0.08),0_14px_30px_-12px_theme(colors.teal.800)]',
      border: 'border-teal-700/70',
      text: 'text-slate-950',
      card: 'no-glass !bg-white border-teal-800 hover:border-teal-950 text-slate-900 shadow-md',
      code: 'bg-teal-100 text-teal-800 border border-teal-300',
      amount: 'text-teal-700',
      badge: 'bg-white text-teal-800 border-white',
      button: 'bg-white/85 hover:bg-white text-teal-900 border-white',
      search: 'no-glass !bg-white border border-teal-800 text-slate-800 placeholder-teal-700/50',
    },
    tableClass: 'erp-table-teal',
    cardBorder: 'border-teal-400/30',
    btnPrimary: '!bg-teal-600 hover:!bg-teal-500 text-white shadow-md shadow-teal-500/25 !border-teal-600',
    entryPanel: 'border-teal-400 bg-teal-100/90 [--entry-border:theme(colors.teal.400)]',
  },

  'Qty Tracking': {
    id: 'qty-tracking',
    name: 'Qty Tracking',
    stage: 'Qty Tracking',
    gradient: 'linear-gradient(135deg, #7a2e0e 0%, #96400f 50%, #5e230a 100%)',
    kpiTile: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.orange.400)_0%,theme(colors.orange.500)_100%)] kanban-shine border-orange-400/50 !shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_16px_-8px_theme(colors.orange.800)] hover:brightness-125',
    kpiIcon: 'bg-orange-500/30 text-orange-100',
    kpiActive: '!opacity-100 ring-2 ring-orange-400 ring-offset-2 ring-offset-slate-900 border-2 border-orange-300 shadow-[0_0_16px_rgba(251,146,60,0.85)] brightness-110 font-black scale-[1.04] z-10',
    kpiDot: 'bg-orange-300',
    kanban: {
      id: 'Qty Tracking',
      title: 'QTY TRACKING',
      desc: 'Order quantities',
      bg: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0)_8%),linear-gradient(160deg,theme(colors.orange.400)_0%,theme(colors.orange.500)_100%)] kanban-shine !shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_0_0_1px_rgba(255,255,255,0.08),0_14px_30px_-12px_theme(colors.orange.800)]',
      border: 'border-orange-700/70',
      text: 'text-slate-950',
      card: 'no-glass !bg-white border-orange-800 hover:border-orange-950 text-slate-900 shadow-md',
      code: 'bg-orange-100 text-orange-800 border border-orange-300',
      amount: 'text-orange-700',
      badge: 'bg-white text-orange-800 border-white',
      button: 'bg-white/85 hover:bg-white text-orange-900 border-white',
      search: 'no-glass !bg-white border border-orange-800 text-slate-800 placeholder-orange-700/50',
    },
    tableClass: 'erp-table-orange',
    cardBorder: 'border-orange-400/30',
    btnPrimary: '!bg-orange-600 hover:!bg-orange-500 text-white shadow-md shadow-orange-500/25 !border-orange-600',
    entryPanel: 'border-orange-400 bg-orange-100/90 [--entry-border:theme(colors.orange.400)]',
  },
};

export const STAGE_THEMES: Record<string, PageTheme> = {
  pipeline: {
    gradient: 'linear-gradient(135deg, #1c324f 0%, #244065 50%, #15263d 100%)',
    label: 'Steel Azure (Kanban Board)',
  },
  enquiry_list: {
    gradient: MODULE_THEMES.Enquiry.gradient,
    label: 'Deep Sapphire Blue (Enquiries)',
  },
  quotation_list: {
    gradient: MODULE_THEMES.Quotation.gradient,
    label: 'Royal Amethyst (Quotations)',
  },
  sales_order_list: {
    gradient: MODULE_THEMES['Sales Order'].gradient,
    label: 'Deep Emerald Jade (Sales Orders)',
  },
  inward_list: {
    gradient: MODULE_THEMES.Inward.gradient,
    label: 'Deep Warm Bronze (Inward)',
  },
  fg_list: {
    gradient: MODULE_THEMES['Finished Goods'].gradient,
    label: 'Deep Ocean Teal (Finished Goods)',
  },
  rejected_list: {
    gradient: MODULE_THEMES.Rejected.gradient,
    label: 'Deep Crimson Wine (Rejected)',
  },
  dc_list: {
    gradient: MODULE_THEMES.DC.gradient,
    label: 'Deep Plum (Delivery Challans)',
  },
  invoice_list: {
    gradient: MODULE_THEMES.Invoice.gradient,
    label: 'Deep Midnight Indigo (Invoices)',
  },
  tracking_list: {
    gradient: MODULE_THEMES['Qty Tracking'].gradient,
    label: 'Deep Burnt Orange (Quantity Tracking)',
  },
  pipeline_report: {
    gradient: MODULE_THEMES['Pipeline Report'].gradient,
    label: 'Deep Teal (Pipeline Report)',
  },
};

export function getSalesStageTheme(activeView: string): PageTheme {
  return STAGE_THEMES[activeView] ?? STAGE_THEMES.pipeline;
}

export function getModuleTheme(stage: string): ModuleTheme {
  return MODULE_THEMES[stage] ?? MODULE_THEMES.Enquiry;
}

/* ── Route-level themes (sidebar pages) ─────────────────────────────── */

interface RouteRule {
  prefix: string;
  theme: PageTheme;
}

const ROUTE_RULES: RouteRule[] = [
  { prefix: 'sales', theme: STAGE_THEMES.pipeline },
  { prefix: 'dashboard', theme: { gradient: 'linear-gradient(135deg, #163e72 0%, #1c4d8e 50%, #11315b 100%)', label: 'Deep Royal Cobalt (Dashboard)' } },
  { prefix: 'engineering', theme: { gradient: 'linear-gradient(135deg, #413654 0%, #514369 50%, #332a42 100%)', label: 'Deep Bronze Slate (Engineering)' } },
  { prefix: 'production/scheduling', theme: { gradient: 'linear-gradient(135deg, #472766 0%, #57307d 50%, #371e4f 100%)', label: 'Deep Amethyst (Scheduling)' } },
  { prefix: 'production/tracking', theme: { gradient: 'linear-gradient(135deg, #114d59 0%, #16606f 50%, #0d3c46 100%)', label: 'Deep Marine Teal (Machine Log)' } },
  { prefix: 'production/process-master', theme: { gradient: 'linear-gradient(135deg, #571d40 0%, #6c2450 50%, #431631 100%)', label: 'Deep Plum Magenta (Process Master)' } },
  { prefix: 'production/finished-goods', theme: { gradient: MODULE_THEMES['Finished Goods'].gradient, label: 'Deep Ocean Teal (Finished Goods)' } },
  { prefix: 'production', theme: { gradient: 'linear-gradient(135deg, #144c3a 0%, #1a5f49 50%, #0f3b2d 100%)', label: 'Deep Forest Pine (Production)' } },
  { prefix: 'operations', theme: { gradient: MODULE_THEMES.DC.gradient, label: 'Deep Plum (Delivery Challans)' } },
  { prefix: 'finance/invoices', theme: { gradient: MODULE_THEMES.Invoice.gradient, label: 'Deep Midnight Indigo (Invoices)' } },
  { prefix: 'finance', theme: { gradient: 'linear-gradient(135deg, #223552 0%, #2b4266 50%, #1a293f 100%)', label: 'Deep Midnight Slate (Finance)' } },
  { prefix: 'accounts', theme: { gradient: 'linear-gradient(135deg, #223552 0%, #2b4266 50%, #1a293f 100%)', label: 'Deep Midnight Slate (Accounts)' } },
  { prefix: 'costing', theme: { gradient: 'linear-gradient(135deg, #511f59 0%, #652770 50%, #3e1744 100%)', label: 'Deep Mulberry (Costing)' } },
  { prefix: 'quotation', theme: { gradient: MODULE_THEMES.Quotation.gradient, label: 'Royal Amethyst (Quotation Tools)' } },
  { prefix: 'inventory', theme: { gradient: 'linear-gradient(135deg, #444218 0%, #54521e 50%, #353313 100%)', label: 'Deep Golden Olive (Inventory)' } },
  { prefix: 'purchasing', theme: { gradient: 'linear-gradient(135deg, #651b40 0%, #7d2250 50%, #4e1531 100%)', label: 'Deep Raspberry Wine (Purchasing)' } },
  { prefix: 'quality', theme: { gradient: 'linear-gradient(135deg, #174667 0%, #1d5780 50%, #123650 100%)', label: 'Deep Cerulean (Quality)' } },
  { prefix: 'maintenance', theme: { gradient: 'linear-gradient(135deg, #61301a 0%, #773b20 50%, #4b2514 100%)', label: 'Deep Rust Leather (Maintenance)' } },
  { prefix: 'reports', theme: { gradient: 'linear-gradient(135deg, #253250 0%, #2e3e64 50%, #1c263e 100%)', label: 'Deep Slate Cobalt (Reports)' } },
  { prefix: 'admin', theme: { gradient: 'linear-gradient(135deg, #41214c 0%, #51295f 50%, #32193b 100%)', label: 'Deep Eggplant Mauve (Admin)' } },
];

const DEFAULT_THEME: PageTheme = {
  gradient: 'linear-gradient(135deg, #163e72 0%, #1c4d8e 50%, #11315b 100%)',
  label: 'Deep Royal Cobalt (Default)',
};

export function getPageTheme(pathname: string): PageTheme {
  const clean = pathname.replace(/^\/+/, '').toLowerCase();
  for (const rule of ROUTE_RULES) {
    if (clean.startsWith(rule.prefix)) return rule.theme;
  }
  return DEFAULT_THEME;
}
