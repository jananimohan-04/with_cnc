import { useAuth } from "./use-auth";
import { Permission } from "@/lib/rbac";

export function usePermissions() {
  const { role, profile } = useAuth();

  // Super Admin: profile has NO company (internal access) OR role is Super Admin
  const isSuperAdmin = !profile?.party_id || role?.name === "Super Admin";

  // Company Admin: has a party_id AND role is "Admin" / "Company Admin" or department is "Admin"
  const isCompanyAdmin =
    !isSuperAdmin &&
    (role?.name === "Admin" ||
      role?.name === "Company Admin" ||
      profile?.department?.toLowerCase() === "admin");

  // Normal user (Engineer / Viewer / non-admin dept): belongs to a company but is not Company Admin
  const isNormalUser = !isSuperAdmin && !isCompanyAdmin;

  // The tenant party ID for filtering (null for Super Admin)
  const userPartyId = isSuperAdmin ? null : (profile?.party_id || null);

  const can = (permission: Permission) => {
    if (isSuperAdmin) return true;

    // Company Admins have administrative rights within their company
    if (isCompanyAdmin) {
      if (
        permission === "manage_users" ||
        permission === "manage_settings" ||
        permission === "manage_documents" ||
        permission === "upload" ||
        permission === "view" ||
        permission === "download" ||
        permission === "create_folders"
      ) {
        return true;
      }
    }

    if (!role) return false;

    // Check if the role permissions array contains the permission key
    const perms = role.permissions as unknown as string[];
    if (!Array.isArray(perms)) return false;
    return perms.includes(permission);
  };

  return {
    can,
    isSuperAdmin,
    isCompanyAdmin,
    isNormalUser,
    userPartyId,
    role,
    profile,
  };
}
