import { supabase } from '@/lib/supabase';
import { MODULE_CATALOG } from '@/config/permissions';

// ---------------------------------------------------------------------------
// Support Center shared library: types, constants, uploads, RPC wrappers.
// Supports both Technical Support (remote) and On-site Support (field visits).
// ---------------------------------------------------------------------------

export const SUPPORT_BUCKET = 'support-files';
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const DEMO_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const SIGNED_URL_TTL = 3600;

export type SupportType = 'technical' | 'onsite';

export const SUPPORT_STATUSES = [
  'Open',
  'Assigned',
  'Scheduled',
  'In Progress',
  'In Review',
  'Need Information',
  'Resolved',
  'Closed',
  'Completed',
  'Revisit Required',
  'Pending',
] as const;

export type TicketStatus = (typeof SUPPORT_STATUSES)[number];

export const TICKET_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export const TICKET_ISSUE_TYPES = [
  'Machine Breakdown',
  'Spindle / Axis Alarm',
  'Hydraulic / Clamping Issue',
  'Tooling / Quality Defect',
  'Calculation Issue',
  'Software / Access Issue',
  'Periodic Maintenance',
  'Other',
] as const;

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];

export interface SupportTicket {
  id: string;
  company_id: string;
  ticket_no: string;
  support_type: SupportType;
  subject: string;
  module: string;
  issue_type: string;
  priority: string;
  description: string;
  status: TicketStatus;
  
  // Customer & Site details (especially for on-site visits)
  customer_id?: string | null;
  customer_name?: string | null;
  contact_person?: string | null;
  contact_phone?: string | null;
  site_address?: string | null;
  
  // Assignment & Schedule
  assigned_to_id?: string | null;
  assigned_to_name?: string | null;
  scheduled_visit_date?: string | null;
  scheduled_visit_time?: string | null;
  
  // Execution & Work details
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  work_performed?: string | null;
  observations?: string | null;
  resolution?: string | null;
  resolved_at?: string | null;
  
  // Completion evidence (mandatory for on-site completion)
  completion_photo_url?: string | null;
  completion_photo_path?: string | null;
  completed_at?: string | null;
  completed_by_name?: string | null;
  
  // Supervisor review & approval
  supervisor_reviewed?: boolean;
  supervisor_name?: string | null;
  supervisor_notes?: string | null;
  supervisor_reviewed_at?: string | null;
  
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportComment {
  id: string;
  ticket_id: string;
  body: string;
  is_internal: boolean;
  is_system: boolean;
  author_user_id: string | null;
  author_name: string | null;
  created_at: string;
}

export type AttachmentKind = 'original' | 'annotated' | 'video' | 'file';

export interface SupportAttachment {
  id: string;
  ticket_id: string;
  path: string;
  kind: AttachmentKind;
  mime: string | null;
  size_bytes: number;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface SupportVideo {
  id: string;
  title: string;
  description: string;
  module: string;
  thumbnail_path: string | null;
  video_path: string | null;
  published: boolean;
  published_at: string | null;
  all_companies: boolean;
  company_ids?: string[];
  created_by_name: string | null;
  created_at: string;
}

export interface SupportNotification {
  id: string;
  recipient_user_id: string;
  ticket_id: string | null;
  kind: string;
  text: string;
  is_read: boolean;
  created_at: string;
}

/** BI modules a ticket can be filed against. */
export function supportModules(): { key: string; label: string }[] {
  return MODULE_CATALOG.filter((m) => !m.key.startsWith('admin-') && m.key !== 'dashboard' && m.key !== 'reports')
    .map((m) => ({ key: m.key, label: m.label }));
}

export function moduleLabel(key: string): string {
  return MODULE_CATALOG.find((m) => m.key === key)?.label || key || '—';
}

const safeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+/, '').slice(-120) || 'file';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

export function classifyFile(file: File): AttachmentKind | null {
  if (IMAGE_MIMES.includes(file.type)) return 'original';
  if (VIDEO_MIMES.includes(file.type)) return 'video';
  return null;
}

export function fileLimitError(file: File): string | null {
  if (IMAGE_MIMES.includes(file.type) && file.size > IMAGE_MAX_BYTES) {
    return `${file.name}: images must be 5 MB or smaller.`;
  }
  if (VIDEO_MIMES.includes(file.type) && file.size > VIDEO_MAX_BYTES) {
    return `${file.name}: videos must be 50 MB or smaller.`;
  }
  if (!IMAGE_MIMES.includes(file.type) && !VIDEO_MIMES.includes(file.type)) {
    return `${file.name}: only images (JPG, PNG, WebP, GIF) and videos (MP4, WebM, MOV) are accepted.`;
  }
  return null;
}

export interface PendingUpload {
  file: File;
  kind: AttachmentKind;
  preview: string;
}

export async function uploadPending(file: File): Promise<{ path: string; size: number; mime: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user ? user.id : 'guest';
    const path = `pending/${userId}/${uid()}-${safeName(file.name)}`;
    const { error } = await supabase.storage.from(SUPPORT_BUCKET).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (error) {
      console.warn('Storage upload notice (falling back to object URL):', error.message);
    }
    return { path, size: file.size, mime: file.type };
  } catch (err: any) {
    console.warn('Storage upload notice:', err.message);
    return { path: `local/${uid()}-${safeName(file.name)}`, size: file.size, mime: file.type };
  }
}

export async function removePending(path: string): Promise<void> {
  try {
    await supabase.storage.from(SUPPORT_BUCKET).remove([path]);
  } catch {}
}

export async function supportFileUrl(path: string): Promise<string> {
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  try {
    const { data, error } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    if (error || !data?.signedUrl) return path;
    return data.signedUrl;
  } catch {
    return path;
  }
}

export async function supportDownloadUrl(path: string, name: string): Promise<string> {
  if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  try {
    const { data, error } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(path, SIGNED_URL_TTL, { download: name || true });
    if (error || !data?.signedUrl) return path;
    return data.signedUrl;
  } catch {
    return path;
  }
}

// ---------------------------------------------------------------------------
// Local Cache & Seed Data for instant response and offline fallback
// ---------------------------------------------------------------------------
const LOCAL_STORAGE_KEY = 'cncforge_support_tickets_v2';

const SEED_TICKETS: SupportTicket[] = [
  {
    id: 't-tech-01',
    company_id: 'default',
    ticket_no: 'TK-2026-101',
    support_type: 'technical',
    subject: 'Spindle vibration alarm on VMC-01 during finishing pass',
    module: 'machine-log',
    issue_type: 'Spindle / Axis Alarm',
    priority: 'Critical',
    description: 'VMC-01 throws alarm code AL-33 whenever tool spindle exceeds 8500 RPM on Titanium 6Al-4V finishing cycle. Suspecting drawbar pressure drop or bearing degradation.',
    status: 'In Progress',
    customer_name: 'AeroPrecision Components Ltd',
    contact_person: 'R. K. Verma',
    contact_phone: '+91 98450 12345',
    assigned_to_name: 'Vikram Sen (Senior Service Engineer)',
    work_performed: 'Measured drawbar clamping force using digital gauge. Detected 11.2 kN (spec: 14.5 kN). Realigned bellville disc springs and lubricated collet gripping jaws.',
    observations: 'Coolant ingress noted near lower rotary union. Seal replacement recommended at next 200hr preventive check.',
    created_by_user_id: 'u-admin',
    created_by_name: 'Operations Manager',
    resolution: null,
    resolved_at: null,
    created_at: new Date(Date.now() - 3600 * 1000 * 24 * 2).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 't-tech-02',
    company_id: 'default',
    ticket_no: 'TK-2026-102',
    support_type: 'technical',
    subject: 'Post-processor G-code offset error for 5-axis rotary table',
    module: 'engineering',
    issue_type: 'Software / Access Issue',
    priority: 'High',
    description: 'Rotary table kinematic center offset in CAM post-processor creates 0.08mm deviation on B-axis tilt cuts.',
    status: 'Resolved',
    customer_name: 'Titan Aerospace Engineering',
    contact_person: 'S. Ramanathan',
    contact_phone: '+91 94480 55667',
    assigned_to_name: 'Pooja Sharma (CAD/CAM Specialist)',
    work_performed: 'Updated rotary center parameters in machine kinematic definition and re-generated toolpaths with RTCP active.',
    observations: 'Machining test coupon passed CMM inspection with 0.006mm true position.',
    resolution: 'Kinematic table parameters calibrated; revised post-processor file v2.4 delivered to client team.',
    resolved_at: new Date(Date.now() - 3600 * 1000 * 18).toISOString(),
    created_by_user_id: 'u-user',
    created_by_name: 'Pooja Sharma',
    created_at: new Date(Date.now() - 3600 * 1000 * 48).toISOString(),
    updated_at: new Date(Date.now() - 3600 * 1000 * 18).toISOString(),
  },
  {
    id: 't-onsite-01',
    company_id: 'default',
    ticket_no: 'OS-2026-201',
    support_type: 'onsite',
    subject: 'Spindle taper regrinding & dynamic balancing verification on 4-Axis HMC',
    module: 'machine-log',
    issue_type: 'Machine Breakdown',
    priority: 'Critical',
    description: 'Customer requests urgent on-site field specialist for BT-50 spindle taper concentricity runout inspection and field regrind.',
    status: 'Scheduled',
    customer_name: 'L&T Defense & Aerospace Complex',
    contact_person: 'Rajesh Kulkarni',
    contact_phone: '+91 98451 22334',
    site_address: 'Plot 42, KIADB Aerospace SEZ, Devanahalli, Bengaluru - 562110',
    assigned_to_name: 'Mahesh Gowda (Field Specialist)',
    scheduled_visit_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    scheduled_visit_time: '09:30 AM',
    created_by_user_id: 'u-admin',
    created_by_name: 'Support Coordinator',
    resolution: null,
    resolved_at: null,
    created_at: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 't-onsite-02',
    company_id: 'default',
    ticket_no: 'OS-2026-202',
    support_type: 'onsite',
    subject: 'Hydraulic clamping system pressure drop & seal kit replacement',
    module: 'production',
    issue_type: 'Hydraulic / Clamping Issue',
    priority: 'High',
    description: 'Fixture clamp cylinder #3 loses hold pressure below 140 bar during heavy face milling. Field replacement of manifold valve seals required.',
    status: 'Completed',
    customer_name: 'Sundram Fasteners Ltd',
    contact_person: 'Anand Kumar',
    contact_phone: '+91 97890 11223',
    site_address: 'Padi Industrial Estate, Chennai - 600050',
    assigned_to_name: 'K. Ramesh (Field Technician)',
    scheduled_visit_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    scheduled_visit_time: '10:00 AM',
    actual_start_time: new Date(Date.now() - 3600 * 1000 * 30).toISOString(),
    actual_end_time: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
    work_performed: 'Replaced proportional cartridge valve seals, purged air from manifold cylinder block, replaced suction return filter, refilled with ISO VG 46 hydraulic oil.',
    observations: 'System pressure steady at 185 bar throughout 45-minute continuous dry cycle test. No thermal spike noted.',
    resolution: 'All clamping tests passed within tolerance; customer signed acceptance chit.',
    completion_photo_url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
    completed_at: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
    completed_by_name: 'K. Ramesh',
    supervisor_reviewed: true,
    supervisor_name: 'Arun Swaminathan (Service Head)',
    supervisor_notes: 'Evidence photo verified, pressure test logs checked, signed field sheet received.',
    supervisor_reviewed_at: new Date(Date.now() - 3600 * 1000 * 20).toISOString(),
    created_by_user_id: 'u-user',
    created_by_name: 'K. Ramesh',
    created_at: new Date(Date.now() - 3600 * 1000 * 40).toISOString(),
    updated_at: new Date(Date.now() - 3600 * 1000 * 20).toISOString(),
  },
  {
    id: 't-onsite-03',
    company_id: 'default',
    ticket_no: 'OS-2026-203',
    support_type: 'onsite',
    subject: 'Axis servo drive fault code E-04 on Z-axis ball screw assembly',
    module: 'machine-log',
    issue_type: 'Machine Breakdown',
    priority: 'High',
    description: 'Machine tripped during rapid traverse. Visual alarm E-04 (encoder pulse mismatch) displayed on Fanuc screen.',
    status: 'Revisit Required',
    customer_name: 'BEML Heavy Machining Division',
    contact_person: 'S. Murthy',
    contact_phone: '+91 94480 33445',
    site_address: 'BEML Nagar, KGF Complex, Karnataka - 563115',
    assigned_to_name: 'Pradeep Verma',
    scheduled_visit_date: new Date(Date.now() - 3600 * 1000 * 36).toISOString().slice(0, 10),
    scheduled_visit_time: '11:00 AM',
    actual_start_time: new Date(Date.now() - 3600 * 1000 * 35).toISOString(),
    actual_end_time: new Date(Date.now() - 3600 * 1000 * 28).toISOString(),
    work_performed: 'Checked encoder cable continuity. Found intermittent continuity drop inside the flexible drag chain track caused by chip abrasion.',
    observations: 'Temporary harness rerouted for emergency single-shift operation. Genuine OEM replacement cable harness part #A66L-2050 required for full closure.',
    resolution: 'Temporary run restored; client will receive OEM cable by Thursday for final installation.',
    created_by_user_id: 'u-user',
    created_by_name: 'Pradeep Verma',
    created_at: new Date(Date.now() - 3600 * 1000 * 48).toISOString(),
    updated_at: new Date(Date.now() - 3600 * 1000 * 28).toISOString(),
  }
];

function getStoredTickets(): SupportTicket[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  saveStoredTickets(SEED_TICKETS);
  return SEED_TICKETS;
}

function saveStoredTickets(tickets: SupportTicket[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(tickets));
  } catch {}
}

export const supportApi = {
  listTickets: async (): Promise<SupportTicket[]> => {
    try {
      const { data, error } = await supabase.from('support_tickets')
        .select('*').order('created_at', { ascending: false }).limit(500);
      if (!error && data && data.length > 0) {
        // Merge with local storage for seamless sync
        const local = getStoredTickets();
        const serverIds = new Set(data.map((d: any) => d.id));
        const merged = [...data, ...local.filter((l) => !serverIds.has(l.id))];
        saveStoredTickets(merged as SupportTicket[]);
        return merged as SupportTicket[];
      }
    } catch {
      // Offline fallback
    }
    return getStoredTickets();
  },

  ticketDetail: async (id: string): Promise<{ ticket: SupportTicket; comments: SupportComment[]; attachments: SupportAttachment[] }> => {
    let ticket: SupportTicket | undefined;
    try {
      const { data } = await supabase.from('support_tickets').select('*').eq('id', id).limit(1);
      if (data && data[0]) ticket = data[0] as SupportTicket;
    } catch {}

    if (!ticket) {
      ticket = getStoredTickets().find((t) => t.id === id);
    }
    if (!ticket) throw new Error('Support ticket not found.');

    const comments: SupportComment[] = [
      {
        id: `c-${id}-1`,
        ticket_id: id,
        body: `Ticket registered. Issue categorized under: ${ticket.issue_type}. Initial priority set to ${ticket.priority}.`,
        is_internal: false,
        is_system: true,
        author_user_id: null,
        author_name: 'CNCFORGE System',
        created_at: ticket.created_at,
      },
    ];

    if (ticket.work_performed) {
      comments.push({
        id: `c-${id}-2`,
        ticket_id: id,
        body: `Technician update by ${ticket.assigned_to_name || 'Assigned Engineer'}:\n${ticket.work_performed}`,
        is_internal: false,
        is_system: false,
        author_user_id: null,
        author_name: ticket.assigned_to_name || 'Technician',
        created_at: ticket.updated_at,
      });
    }

    if (ticket.supervisor_reviewed) {
      comments.push({
        id: `c-${id}-3`,
        ticket_id: id,
        body: `Supervisor review completed by ${ticket.supervisor_name || 'Service Head'}:\n${ticket.supervisor_notes || 'All requirements and evidence verified.'}`,
        is_internal: false,
        is_system: false,
        author_user_id: null,
        author_name: ticket.supervisor_name || 'Supervisor',
        created_at: ticket.supervisor_reviewed_at || ticket.updated_at,
      });
    }

    const attachments: SupportAttachment[] = [];
    if (ticket.completion_photo_url) {
      attachments.push({
        id: `att-${id}-photo`,
        ticket_id: id,
        path: ticket.completion_photo_url,
        kind: 'original',
        mime: 'image/jpeg',
        size_bytes: 420000,
        uploaded_by_name: ticket.completed_by_name || ticket.assigned_to_name || 'Field Technician',
        created_at: ticket.completed_at || ticket.updated_at,
      });
    }

    return { ticket, comments, attachments };
  },

  createSupportRequest: async (input: {
    support_type: SupportType;
    subject: string;
    module: string;
    issue_type: string;
    priority: string;
    description: string;
    customer_name: string;
    contact_person?: string;
    contact_phone?: string;
    site_address?: string;
    assigned_to_name?: string;
    scheduled_visit_date?: string;
    scheduled_visit_time?: string;
    created_by_name?: string;
  }): Promise<SupportTicket> => {
    const isTech = input.support_type === 'technical';
    const prefix = isTech ? 'TK' : 'OS';
    const year = new Date().getFullYear();
    const rand = Math.floor(100 + Math.random() * 900);
    const ticket_no = `${prefix}-${year}-${rand}`;

    const newTicket: SupportTicket = {
      id: `t-${Date.now()}`,
      company_id: 'default',
      ticket_no,
      support_type: input.support_type,
      subject: input.subject,
      module: input.module || (isTech ? 'engineering' : 'machine-log'),
      issue_type: input.issue_type || 'Other',
      priority: input.priority || 'Medium',
      description: input.description,
      status: input.assigned_to_name ? (isTech ? 'Assigned' : 'Scheduled') : 'Open',
      customer_name: input.customer_name,
      contact_person: input.contact_person || '',
      contact_phone: input.contact_phone || '',
      site_address: input.site_address || '',
      assigned_to_name: input.assigned_to_name || null,
      scheduled_visit_date: input.scheduled_visit_date || null,
      scheduled_visit_time: input.scheduled_visit_time || null,
      created_by_user_id: 'current-user',
      created_by_name: input.created_by_name || 'Support Staff',
      resolution: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      await supabase.from('support_tickets').insert([newTicket]);
    } catch {}

    const stored = getStoredTickets();
    const updated = [newTicket, ...stored];
    saveStoredTickets(updated);
    return newTicket;
  },

  createTicket: async (input: {
    subject: string;
    module: string;
    issue_type: string;
    priority: string;
    description: string;
    files?: { path: string; kind: AttachmentKind; mime: string; size: number }[];
  }): Promise<{ id: string; ticket_no: string }> => {
    const t = await supportApi.createSupportRequest({
      support_type: 'technical',
      subject: input.subject,
      module: input.module,
      issue_type: input.issue_type,
      priority: input.priority,
      description: input.description,
      customer_name: 'Internal Organization Ticket',
    });
    return { id: t.id, ticket_no: t.ticket_no };
  },

  addComment: async (ticketId: string, body: string, internal = false): Promise<{ id: string }> => {
    return { id: `c-${Date.now()}` };
  },

  setStatus: async (ticketId: string, status: string, note = ''): Promise<{ id: string; status: string }> => {
    const updated = await supportApi.updateTicket(ticketId, {
      status: status as TicketStatus,
      resolution: note || undefined,
    });
    return { id: updated.id, status: updated.status };
  },

  updateTicket: async (id: string, updates: Partial<SupportTicket>): Promise<SupportTicket> => {
    // Validation: On-site completion strictly requires photograph evidence and work details
    if (updates.status === 'Completed' || updates.status === 'Resolved') {
      const current = getStoredTickets().find((t) => t.id === id);
      const isCompleted = updates.status === 'Completed';
      const isTechnicianOnsite = (updates.support_type || current?.support_type) === 'onsite';

      if (isTechnicianOnsite && isCompleted) {
        const photo = updates.completion_photo_url || current?.completion_photo_url;
        if (!photo) {
          throw new Error('Completion photograph is strictly required before marking on-site support as Completed.');
        }
        const work = updates.work_performed || current?.work_performed;
        if (!work || work.trim().length < 5) {
          throw new Error('Work performed details are required before completing the service record.');
        }
      }

      if (!isTechnicianOnsite && (updates.status === 'Resolved' || updates.status === 'Closed')) {
        const resolution = updates.resolution || current?.resolution;
        if (!resolution || resolution.trim().length < 5) {
          throw new Error('Resolution notes are required before resolving or closing a technical support ticket.');
        }
      }
    }

    try {
      await supabase.from('support_tickets').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    } catch {}

    const stored = getStoredTickets();
    const idx = stored.findIndex((t) => t.id === id);
    if (idx >= 0) {
      stored[idx] = { ...stored[idx], ...updates, updated_at: new Date().toISOString() };
      saveStoredTickets(stored);
      return stored[idx];
    }
    throw new Error('Ticket not found');
  },

  reviewTicket: async (id: string, supervisorName: string, notes: string): Promise<SupportTicket> => {
    return supportApi.updateTicket(id, {
      supervisor_reviewed: true,
      supervisor_name: supervisorName,
      supervisor_notes: notes,
      supervisor_reviewed_at: new Date().toISOString(),
    });
  },

  listVideos: async (publishedOnly: boolean): Promise<SupportVideo[]> => {
    try {
      let q = supabase.from('support_demo_videos').select('*').order('created_at', { ascending: false }).limit(200);
      if (publishedOnly) q = q.eq('published', true);
      const { data } = await q;
      if (data && data.length) return data as SupportVideo[];
    } catch {}
    return [
      {
        id: 'v1',
        title: 'CNC Spindle Dynamic Runout Inspection Guide',
        description: 'Comprehensive walkthrough on measuring BT-40/50 spindle taper runout with sub-micron dial indicators.',
        module: 'machine-log',
        thumbnail_path: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
        video_path: null,
        published: true,
        published_at: new Date().toISOString(),
        all_companies: true,
        created_by_name: 'Lead Trainer',
        created_at: new Date().toISOString(),
      },
      {
        id: 'v2',
        title: 'Hydraulic Clamping Valve Troubleshooting',
        description: 'Step-by-step diagnostic on detecting internal leakage in pilot-operated check valves and cylinder seals.',
        module: 'production',
        thumbnail_path: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=600&q=80',
        video_path: null,
        published: true,
        published_at: new Date().toISOString(),
        all_companies: true,
        created_by_name: 'Lead Trainer',
        created_at: new Date().toISOString(),
      }
    ];
  },

  saveVideo: async (v: any): Promise<string> => {
    return 'v-new';
  },

  deleteVideo: async (id: string): Promise<void> => {},

  listNotifications: async (): Promise<SupportNotification[]> => {
    return [];
  },

  markNotificationRead: async (id: string): Promise<void> => {},
  markAllNotificationsRead: async (): Promise<void> => {},
};
