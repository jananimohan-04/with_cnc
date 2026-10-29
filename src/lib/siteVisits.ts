import { supabase } from '@/lib/supabase';

export interface SiteVisit {
  id: string;
  visit_no: string;
  customer_id?: string | null;
  customer_name: string;
  site_address: string;
  contact_person: string;
  contact_phone: string;
  contact_email?: string;
  salesperson_id?: string | null;
  salesperson_name: string;
  visit_date: string;
  visit_time: string;
  purpose: string;
  discussion_notes: string;
  interested_products: string;
  estimated_deal_value: number;
  follow_up_date: string | null;
  next_action: string;
  related_quotation_no?: string | null;
  related_sales_order_no?: string | null;
  outcome_status: 'Scheduled' | 'In Progress' | 'Completed' | 'Follow-up Required' | 'Deal Won' | 'Deal Lost' | 'Cancelled';
  created_at: string;
  updated_at: string;
}

const LOCAL_STORAGE_KEY = 'cncforge_site_visits_v1';

const SEED_SITE_VISITS: SiteVisit[] = [
  {
    id: 'sv-001',
    visit_no: 'SV-2026-001',
    customer_name: 'HAL Engine Division',
    site_address: 'Old Airport Road, Vimanapura, Bengaluru - 560017',
    contact_person: 'Dr. Venkat Raman (GM Technology)',
    contact_phone: '+91 94801 88990',
    contact_email: 'v.raman@hal-india.com',
    salesperson_name: 'Karan Mehta (Key Account Mgr)',
    visit_date: new Date().toISOString().slice(0, 10),
    visit_time: '11:30 AM',
    purpose: 'Turbine casing titanium machining contract discussion',
    discussion_notes: 'Reviewed technical tolerance requirements for 5-axis blisk milling. Client requested formal cycle-time simulation and machine certification for high-nickel superalloys.',
    interested_products: '5-Axis Titanium Milling, Aerospace Blisks, CMM Inspection Packages',
    estimated_deal_value: 4500000,
    follow_up_date: new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10),
    next_action: 'Submit formal technical proposal & machine capability certificate',
    related_quotation_no: 'QT-2026-089',
    outcome_status: 'Completed',
    created_at: new Date(Date.now() - 3600 * 1000 * 24 * 3).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sv-002',
    visit_no: 'SV-2026-002',
    customer_name: 'Bharat Forge Heavy Machining',
    site_address: 'Mundhwa Industrial Area, Pune - 411036',
    contact_person: 'Nitin Deshmukh (Chief Engineer)',
    contact_phone: '+91 98220 44556',
    contact_email: 'n.deshmukh@bharatforge.com',
    salesperson_name: 'Sneha Joshi (Technical Sales)',
    visit_date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
    visit_time: '02:00 PM',
    purpose: 'Annual tooling & CNC machine spare supply contract renewal',
    discussion_notes: 'Pre-visit alignment on volume rebate tiers and stocking agreement for indexable milling inserts.',
    interested_products: 'CNC Tooling Packages, Carbide Inserts, High-Pressure Coolant Pumps',
    estimated_deal_value: 1850000,
    follow_up_date: new Date(Date.now() + 86400000 * 9).toISOString().slice(0, 10),
    next_action: 'Present updated commercial matrix with volume tiering',
    related_quotation_no: null,
    outcome_status: 'Scheduled',
    created_at: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'sv-003',
    visit_no: 'SV-2026-003',
    customer_name: 'Godrej & Boyce Aerospace',
    site_address: 'Plant 14, Pirojshanagar, Vikhroli East, Mumbai - 400079',
    contact_person: 'Sameer Patil (Procurement Lead)',
    contact_phone: '+91 98200 66778',
    contact_email: 'spatil@godrej.com',
    salesperson_name: 'Karan Mehta (Key Account Mgr)',
    visit_date: new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10),
    visit_time: '10:30 AM',
    purpose: 'Cryogenic propellant tank component manufacturing audit',
    discussion_notes: 'Walkthrough of customer QA requirements. Initial coupon samples showed acceptable Ra 0.4 surface finish. Delivery schedule alignment needed.',
    interested_products: 'Specialized CNC Turning, Wire EDM, Clean-Room Deburring',
    estimated_deal_value: 6200000,
    follow_up_date: new Date(Date.now() + 86400000 * 4).toISOString().slice(0, 10),
    next_action: 'Client review of sample test coupons and stage 1 purchase order issue',
    related_quotation_no: 'QT-2026-092',
    related_sales_order_no: 'SO-2026-041',
    outcome_status: 'Follow-up Required',
    created_at: new Date(Date.now() - 3600 * 1000 * 48).toISOString(),
    updated_at: new Date().toISOString(),
  }
];

function getStoredVisits(): SiteVisit[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  saveStoredVisits(SEED_SITE_VISITS);
  return SEED_SITE_VISITS;
}

function saveStoredVisits(visits: SiteVisit[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(visits));
  } catch {}
}

export const siteVisitsApi = {
  listVisits: async (): Promise<SiteVisit[]> => {
    try {
      const { data, error } = await supabase.from('sales_site_visits')
        .select('*').order('visit_date', { ascending: false }).limit(200);
      if (!error && data && data.length > 0) {
        const local = getStoredVisits();
        const serverIds = new Set(data.map((d: any) => d.id));
        const merged = [...data, ...local.filter((l) => !serverIds.has(l.id))];
        saveStoredVisits(merged as SiteVisit[]);
        return merged as SiteVisit[];
      }
    } catch {}
    return getStoredVisits();
  },

  createVisit: async (input: Omit<SiteVisit, 'id' | 'visit_no' | 'created_at' | 'updated_at'>): Promise<SiteVisit> => {
    const year = new Date().getFullYear();
    const rand = Math.floor(100 + Math.random() * 900);
    const visit_no = `SV-${year}-${rand}`;
    const newVisit: SiteVisit = {
      ...input,
      id: `sv-${Date.now()}`,
      visit_no,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      await supabase.from('sales_site_visits').insert([newVisit]);
    } catch {}

    const stored = getStoredVisits();
    const updated = [newVisit, ...stored];
    saveStoredVisits(updated);
    return newVisit;
  },

  updateVisit: async (id: string, updates: Partial<SiteVisit>): Promise<SiteVisit> => {
    try {
      await supabase.from('sales_site_visits').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    } catch {}

    const stored = getStoredVisits();
    const idx = stored.findIndex((v) => v.id === id);
    if (idx >= 0) {
      stored[idx] = { ...stored[idx], ...updates, updated_at: new Date().toISOString() };
      saveStoredVisits(stored);
      return stored[idx];
    }
    throw new Error('Site visit not found');
  },

  deleteVisit: async (id: string): Promise<void> => {
    try {
      await supabase.from('sales_site_visits').delete().eq('id', id);
    } catch {}
    const stored = getStoredVisits().filter((v) => v.id !== id);
    saveStoredVisits(stored);
  }
};
