import { supabase } from '@/lib/supabase';

export interface ActivityItem {
  id: string;
  type: 'sales' | 'production' | 'inventory';
  message: string;
  createdAt: string;
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : new Date(iso).toLocaleDateString();
}

// Latest pipeline events for the current company (RLS scopes every query to it).
export async function fetchRecentActivity(limit = 8): Promise<ActivityItem[]> {
  const [enq, quo, so, wo, dc] = await Promise.all([
    supabase.from('cnc_enquiries').select('id, enquiry_no, customer, created_at').order('created_at', { ascending: false }).limit(limit),
    supabase.from('cnc_quotations').select('id, quote_no, customer, created_at').order('created_at', { ascending: false }).limit(limit),
    supabase.from('cnc_sales_orders').select('id, order_no, customer, created_at').order('created_at', { ascending: false }).limit(limit),
    supabase.from('cnc_work_orders').select('id, wo_no, part_name, created_at').order('created_at', { ascending: false }).limit(limit),
    supabase.from('cnc_deliveries').select('id, delivery_no, customer_name, created_at').order('created_at', { ascending: false }).limit(limit),
  ]);

  const items: ActivityItem[] = [
    ...(enq.data || []).map(r => ({ id: `enq-${r.id}`, type: 'sales' as const, message: `Enquiry ${r.enquiry_no ?? ''} received from ${r.customer ?? 'customer'}`, createdAt: r.created_at })),
    ...(quo.data || []).map(r => ({ id: `quo-${r.id}`, type: 'sales' as const, message: `Quotation ${r.quote_no ?? ''} prepared for ${r.customer ?? 'customer'}`, createdAt: r.created_at })),
    ...(so.data || []).map(r => ({ id: `so-${r.id}`, type: 'sales' as const, message: `Sales order ${r.order_no ?? ''} booked for ${r.customer ?? 'customer'}`, createdAt: r.created_at })),
    ...(wo.data || []).map(r => ({ id: `wo-${r.id}`, type: 'production' as const, message: `Work order ${r.wo_no ?? ''} created${r.part_name ? ` for ${r.part_name}` : ''}`, createdAt: r.created_at })),
    ...(dc.data || []).map(r => ({ id: `dc-${r.id}`, type: 'inventory' as const, message: `Delivery ${r.delivery_no ?? ''} raised${r.customer_name ? ` for ${r.customer_name}` : ''}`, createdAt: r.created_at })),
  ];

  return items
    .filter(i => i.createdAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
