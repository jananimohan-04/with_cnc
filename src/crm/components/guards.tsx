import type { ReactNode } from "react";
import { useAuth } from "../providers/AuthProvider";
import { can, canAny, type Permission } from "../lib/permissions";
import { EmptyState } from "./ui/primitives";
import { ShieldAlert } from "lucide-react";
import type { Role } from "../lib/types";

/**
 * Route-level permission gate.
 *
 * This hides pages a role has no business reading, but it is a convenience
 * only: the backend re-checks the same permission on every request and
 * PostgreSQL RLS decides what is actually visible. A viewer who edits the
 * value in devtools reaches an empty screen, never another tenant's data.
 */
export function RequirePermission({
  anyOf,
  children,
}: {
  anyOf: Permission[];
  children: ReactNode;
}) {
  const { role, status } = useAuth();

  if (status === "loading") return null;

  const allowed = canAny(role, ...anyOf);
  if (allowed) return <>{children}</>;

  return (
    <EmptyState
      icon={<ShieldAlert className="size-6" />}
      title="You don't have access to this page"
      description={
        `Your role in this company is ${role ?? "unknown"}, which cannot ` +
        `${anyOf.join(" or ").replace(/:/g, " ")}. Ask a company owner or admin ` +
        "if you need this changed."
      }
    />
  );
}

/** Inline variant — renders `fallback` instead of a whole-page state. */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { role } = useAuth();
  return can(role, permission) ? <>{children}</> : <>{fallback}</>;
}

/** Role-at-least helper for "owner only" style controls. */
export function AtLeast({
  minimum,
  children,
  fallback = null,
}: {
  minimum: Role;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { role } = useAuth();
  const order: Role[] = ["viewer", "salesperson", "manager", "admin", "owner"];
  const allowed =
    role !== null && order.indexOf(role) >= order.indexOf(minimum);
  return allowed ? <>{children}</> : <>{fallback}</>;
}
