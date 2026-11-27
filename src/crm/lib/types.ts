/**
 * Types mirroring `supabase/migrations/202610200001_initial_schema.sql`.
 *
 * Every field here exists on the corresponding table — no phantom columns.
 * Optional columns are optional; columns with database defaults are optional
 * too, because a freshly-inserted row comes back with them filled in.
 */

export const ROLES = ["owner", "admin", "manager", "salesperson", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  salesperson: "Salesperson",
  viewer: "Viewer",
};

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "follow_up",
  "qualified",
  "proposal",
  "converted",
  "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** The six kanban columns, in board order. `lost` is filterable but not a column. */
export const PIPELINE_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "follow_up",
  "qualified",
  "proposal",
  "converted",
];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  follow_up: "Follow-up",
  qualified: "Qualified",
  proposal: "Proposal",
  converted: "Converted",
  lost: "Lost",
};

export const LEAD_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const PRIORITY_LABELS: Record<LeadPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const LEAD_SOURCES = [
  "facebook",
  "instagram",
  "linkedin",
  "website_form",
  "csv_import",
  "manual",
  "referral",
  "email",
  "phone",
  "event",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const SOURCE_LABELS: Record<LeadSource, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  website_form: "Website form",
  csv_import: "CSV import",
  manual: "Manual",
  referral: "Referral",
  email: "E-mail",
  phone: "Phone",
  event: "Event",
  other: "Other",
};

export const FOLLOW_UP_TYPES = ["call", "email", "meeting", "demo", "task", "other"] as const;
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];
export type FollowUpStatus = "pending" | "completed" | "cancelled";

export const INTEGRATION_STATUSES = [
  "not_connected",
  "setup_required",
  "awaiting_approval",
  "connected",
  "expired",
  "error",
  "disconnected",
] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const PROVIDERS = ["facebook", "instagram", "linkedin", "website_form"] as const;
export type Provider = (typeof PROVIDERS)[number];

// --------------------------------------------------------------------------- //
// Records
// --------------------------------------------------------------------------- //

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  industry: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  timezone: string | null;
  currency: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyWithRole extends Company {
  role: Role;
}

/** A compact person reference attached by the API to leads/follow-ups/notes. */
export interface PersonRef {
  id: string;
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
}

export interface Lead {
  id: string;
  company_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  job_title: string | null;
  website: string | null;
  source: LeadSource;
  campaign: string | null;
  external_id: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  assigned_to: string | null;
  created_by: string | null;
  tags: string[];
  notes: string | null;
  sort_order: number;
  next_follow_up_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  assignee?: PersonRef | null;
  creator?: PersonRef | null;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  actor_id: string | null;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: PersonRef | null;
}

export interface LeadNote {
  id: string;
  lead_id: string;
  company_id: string;
  author_id: string | null;
  body: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  author?: PersonRef | null;
}

export interface LeadDuplicate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  organization: string | null;
  status: LeadStatus;
  source: LeadSource;
  created_at: string;
  match_on: string[];
}

export interface FollowUp {
  id: string;
  company_id: string;
  lead_id: string;
  created_by: string | null;
  assigned_to: string | null;
  type: FollowUpType;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_min: number | null;
  status: FollowUpStatus;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  lead?: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    status: LeadStatus;
    priority: LeadPriority;
    organization: string | null;
  } | null;
  assignee?: PersonRef | null;
  creator?: PersonRef | null;
  window?: "overdue" | "today" | "upcoming" | "done" | "cancelled";
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: Role;
  status: string;
  invited_by: string | null;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
  profile?: PersonRef | null;
}

export interface Invitation {
  id: string;
  company_id: string;
  email: string;
  role: Role;
  status: "pending" | "accepted" | "revoked" | "expired";
  token?: string;
  expires_at: string;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppNotification {
  id: string;
  company_id: string;
  user_id: string;
  type: "system" | "assignment" | "follow_up" | "mention" | "integration" | "team" | "lead";
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface Connection {
  id: string;
  company_id: string;
  provider: Provider;
  status: IntegrationStatus;
  external_account_id: string | null;
  external_account_name: string | null;
  page_id: string | null;
  ad_account_id: string | null;
  form_id: string | null;
  organization_id: string | null;
  scopes: string[];
  permissions: Record<string, unknown>;
  settings: Record<string, unknown>;
  sync_enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: "success" | "partial" | "failed" | null;
  last_error: string | null;
  last_error_at: string | null;
  token_expires_at: string | null;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MissingRequirement {
  key: string;
  label: string;
  description: string;
  where_to_set: string;
}

export interface ProviderStatus {
  provider: Provider;
  status: IntegrationStatus;
  connection: Connection | null;
  configured: boolean;
  requirements: MissingRequirement[];
  callback_url?: string;
  /** where the provider sends new leads (Meta / LinkedIn) */
  webhook_url?: string;
  endpoint_url?: string;
  signing_secret?: string | null;
  message: string | null;
  scopes: string[];
  last_sync_at: string | null;
  last_sync_status: string | null;
  error: string | null;
  documentation?: string;
  instructions?: string;
  has_secret?: boolean;
}

export interface IntegrationLog {
  id: string;
  company_id: string;
  connection_id: string | null;
  provider: string;
  level: "debug" | "info" | "warn" | "error";
  event: string;
  message: string;
  status_code: number | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CompanySetting {
  company_id: string;
  key: string;
  value: unknown;
  updated_at: string;
}

// --------------------------------------------------------------------------- //
// Envelopes
// --------------------------------------------------------------------------- //

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ListResponse<T> {
  data: T[];
  pagination: Pagination;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown> & {
    fields?: { field: string; message: string }[];
    missing?: MissingRequirement[];
    invitation?: Invitation;
  };
  request_id?: string;
}

// --------------------------------------------------------------------------- //
// Analytics (every number is computed server-side from real rows)
// --------------------------------------------------------------------------- //

export interface AnalyticsOverview {
  window_days: number;
  generated_at: string;
  granularity: string;
  totals: {
    leads: number;
    archived: number;
    in_pipeline: number;
    converted: number;
    lost: number;
    conversion_rate: number | null;
    created_today: number;
    created_this_week: number;
    team_size: number;
  };
  by_status: { status: LeadStatus; count: number }[];
  by_priority: { priority: LeadPriority; count: number }[];
  by_source: { source: string; count: number }[];
  top_tags: { tag: string; count: number }[];
  follow_ups: {
    overdue: number;
    due_today: number;
    upcoming: number;
    completed: number;
    completion_rate: number | null;
  };
  timeline: { period: string; created: number; converted: number }[];
}

export interface PipelineAnalytics {
  window_days: number;
  generated_at: string;
  stages: { status: string; count: number }[];
  funnel: { status: string; reached: number; step_conversion: number | null }[];
  note: string;
}

export interface SourceAnalytics {
  window_days: number;
  generated_at: string;
  sources: {
    source: string;
    campaign: string | null;
    leads: number;
    converted: number;
    conversion_rate: number | null;
  }[];
}

export interface TeamAnalytics {
  window_days: number;
  generated_at: string;
  members: {
    user_id: string;
    name: string | null;
    role: Role;
    leads_assigned: number;
    converted: number;
    conversion_rate: number | null;
    follow_ups_total: number;
    follow_ups_completed: number;
    follow_up_completion_rate: number | null;
  }[];
  unassigned_leads: number;
}

export interface ImportReport {
  filename: string;
  dry_run: boolean;
  headers: string[];
  detected_mapping: Record<string, string>;
  ignored_columns: string[];
  suggestions: string[];
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicates_in_file: number;
  duplicates_of_existing: number;
  errors: { row: number; messages: string[] }[];
  preview: {
    row: number;
    values: Record<string, unknown>;
    errors: string[];
    duplicate_of: string | null;
  }[];
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: { row: string; message: string }[];
}
