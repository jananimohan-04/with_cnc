export const PERMISSIONS = [
  { key: "view", label: "View documents" },
  { key: "download", label: "Download files" },
  { key: "upload", label: "Upload / new version" },
  { key: "edit", label: "Edit metadata" },
  { key: "approve", label: "Review & approve" },
  { key: "delete", label: "Delete documents" },
  { key: "manage_access", label: "Manage document access" },
  { key: "manage_users", label: "Manage users" },
  { key: "manage_roles", label: "Manage roles" },
  { key: "manage_parties", label: "Manage parties" },
  { key: "manage_documents", label: "Manage parts & documents" },
  { key: "view_audit", label: "View audit logs" },
  { key: "manage_settings", label: "Manage settings" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const DOC_PERMISSIONS: Permission[] = [
  "view",
  "download",
  "edit",
  "upload",
  "approve",
  "delete",
  "manage_access",
];

export const DOC_STATUSES = [
  "Draft",
  "Under Review",
  "Approved",
  "Released",
  "Superseded",
  "Archived",
] as const;

export type DocStatus = (typeof DOC_STATUSES)[number];

export const DOCUMENT_TYPES = [
  "Mechanical Drawing",
  "Fabrication Drawing",
  "Assembly Drawing",
  "CNC Program",
  "Inspection Drawing",
  "Specification",
  "Process Sheet",
] as const;

export const ALLOWED_EXTENSIONS = [
  "pdf",
  "dwg",
  "dxf",
  "step",
  "stp",
  "iges",
  "igs",
  "jpg",
  "jpeg",
  "png",
  "xlsx",
  "docx",
  "zip",
  "nc",
  "cnc",
] as const;

export const MAX_FILE_SIZE = 60 * 1024 * 1024;

export const PREVIEWABLE = ["pdf", "jpg", "jpeg", "png"];

export function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function formatBytes(bytes?: number | null) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}
