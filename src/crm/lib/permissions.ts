import type { Role } from "./types";

/**
 * Client-side mirror of `backend/app/rbac.py`.
 *
 * This exists **only** to hide controls the current role could not use — it is
 * never the enforcement boundary. The backend re-checks every request and
 * PostgreSQL Row Level Security decides what is actually readable or writable,
 * so a stale or forged value here cannot grant anything.
 */
export const PERMISSIONS = {
  LEAD_READ: "lead:read",
  LEAD_CREATE: "lead:create",
  LEAD_UPDATE_ANY: "lead:update_any",
  LEAD_UPDATE_OWN: "lead:update_own",
  LEAD_DELETE: "lead:delete",
  LEAD_ARCHIVE: "lead:archive",
  LEAD_EXPORT: "lead:export",
  LEAD_IMPORT: "lead:import",
  LEAD_BULK: "lead:bulk",
  FOLLOW_UP_READ: "follow_up:read",
  FOLLOW_UP_CREATE: "follow_up:create",
  FOLLOW_UP_UPDATE_ANY: "follow_up:update_any",
  FOLLOW_UP_UPDATE_OWN: "follow_up:update_own",
  FOLLOW_UP_DELETE: "follow_up:delete",
  NOTE_CREATE: "note:create",
  NOTE_UPDATE_ANY: "note:update_any",
  NOTE_DELETE: "note:delete",
  ACTIVITY_READ: "activity:read",
  TEAM_READ: "team:read",
  TEAM_MANAGE: "team:manage",
  INTEGRATION_READ: "integration:read",
  INTEGRATION_MANAGE: "integration:manage",
  SETTINGS_READ: "settings:read",
  SETTINGS_MANAGE: "settings:manage",
  COMPANY_DELETE: "company:delete",
  COMPANY_TRANSFER: "company:transfer",
  ANALYTICS_READ: "analytics:read",
  NOTIFICATION_READ: "notification:read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const BASE_READ: Permission[] = [
  PERMISSIONS.LEAD_READ,
  PERMISSIONS.FOLLOW_UP_READ,
  // NOTE_CREATE is intentionally absent — RLS (`lead_notes_insert`) requires
  // owner/admin/manager/salesperson, so a viewer must never be offered the
  // composer. Keep in step with backend/app/rbac.py.
  PERMISSIONS.ACTIVITY_READ,
  PERMISSIONS.TEAM_READ,
  PERMISSIONS.SETTINGS_READ,
  PERMISSIONS.ANALYTICS_READ,
  PERMISSIONS.NOTIFICATION_READ,
];

const ALL: Permission[] = Object.values(PERMISSIONS);

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  viewer: [...BASE_READ],
  salesperson: [
    ...BASE_READ,
    PERMISSIONS.LEAD_CREATE,
    PERMISSIONS.LEAD_UPDATE_OWN,
    PERMISSIONS.LEAD_ARCHIVE,
    PERMISSIONS.LEAD_EXPORT,
    PERMISSIONS.LEAD_IMPORT,
    PERMISSIONS.LEAD_BULK,
    PERMISSIONS.NOTE_CREATE,
    PERMISSIONS.FOLLOW_UP_CREATE,
    PERMISSIONS.FOLLOW_UP_UPDATE_OWN,
    // No INTEGRATION_READ: integrations are owner/admin/manager only.
  ],
  manager: [
    ...BASE_READ,
    PERMISSIONS.LEAD_CREATE,
    PERMISSIONS.LEAD_UPDATE_ANY,
    PERMISSIONS.LEAD_UPDATE_OWN,
    PERMISSIONS.LEAD_ARCHIVE,
    PERMISSIONS.LEAD_EXPORT,
    PERMISSIONS.LEAD_IMPORT,
    PERMISSIONS.LEAD_BULK,
    PERMISSIONS.NOTE_CREATE,
    PERMISSIONS.FOLLOW_UP_CREATE,
    PERMISSIONS.FOLLOW_UP_UPDATE_ANY,
    PERMISSIONS.FOLLOW_UP_UPDATE_OWN,
    PERMISSIONS.FOLLOW_UP_DELETE,
    PERMISSIONS.NOTE_UPDATE_ANY,
    PERMISSIONS.INTEGRATION_READ,
    PERMISSIONS.INTEGRATION_MANAGE,
  ],
  admin: [
    ...BASE_READ,
    ...ALL.filter(
      (p) => p !== PERMISSIONS.COMPANY_DELETE && p !== PERMISSIONS.COMPANY_TRANSFER,
    ),
  ],
  owner: [...ALL],
};

const ROLE_ORDER: Record<Role, number> = {
  viewer: 0,
  salesperson: 1,
  manager: 2,
  admin: 3,
  owner: 4,
};

const cache = new Map<Role, Set<Permission>>();

export function permissionsFor(role: Role | null | undefined): Set<Permission> {
  if (!role) return new Set();
  const cached = cache.get(role);
  if (cached) return cached;
  const set = new Set(ROLE_PERMISSIONS[role] ?? []);
  cache.set(role, set);
  return set;
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return permissionsFor(role).has(permission);
}

/** True when the role holds *any* of the listed permissions. */
export function canAny(role: Role | null | undefined, ...permissions: Permission[]): boolean {
  const granted = permissionsFor(role);
  return permissions.some((p) => granted.has(p));
}

export function roleAtLeast(role: Role | null | undefined, minimum: Role): boolean {
  if (!role) return false;
  return ROLE_ORDER[role] >= ROLE_ORDER[minimum];
}

/**
 * A salesperson may only modify leads assigned to them or they created —
 * the same rule `rbac.may_touch_lead` applies on the server.
 */
export function mayTouchLead(
  role: Role | null | undefined,
  lead: { assigned_to?: string | null; created_by?: string | null },
  userId: string | null | undefined,
): boolean {
  if (can(role, PERMISSIONS.LEAD_UPDATE_ANY)) return true;
  if (!can(role, PERMISSIONS.LEAD_UPDATE_OWN) || !userId) return false;
  return lead.assigned_to === userId || lead.created_by === userId;
}

export function mayTouchFollowUp(
  role: Role | null | undefined,
  followUp: { assigned_to?: string | null; created_by?: string | null },
  userId: string | null | undefined,
): boolean {
  if (can(role, PERMISSIONS.FOLLOW_UP_UPDATE_ANY)) return true;
  if (!can(role, PERMISSIONS.FOLLOW_UP_UPDATE_OWN) || !userId) return false;
  return followUp.assigned_to === userId || followUp.created_by === userId;
}

export const ROLE_SUMMARIES: Record<Role, string> = {
  owner: "Full control, including deleting the company, transferring ownership and managing every member.",
  admin: "Manages members, integrations, settings and all records. Cannot delete the company or modify the owner.",
  manager: "Full access to leads, follow-ups, notes and integrations. Cannot manage the team or company settings.",
  salesperson: "Creates and works leads assigned to them (or they created), plus their own follow-ups.",
  viewer: "Read-only access to leads, follow-ups, team and analytics.",
};
