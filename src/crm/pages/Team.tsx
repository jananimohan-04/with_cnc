import { useState, type FormEvent } from "react";
import {
  Crown,
  Mail,
  Plus,
  ShieldCheck,
  UserMinus,
  UserRoundCog,
} from "lucide-react";
import { api } from "../lib/api";
import { useAsync, useToggle } from "../lib/hooks";
import { useToast } from "../providers/ToastProvider";
import { useAuth } from "../providers/AuthProvider";
import { can, PERMISSIONS, roleAtLeast, ROLE_SUMMARIES } from "../lib/permissions";
import { ROLES, ROLE_LABELS, type CompanyMember, type Invitation, type Role } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  RoleBadge,
  Select,
  Skeleton,
} from "../components/ui/primitives";
import { Avatar } from "../components/layout/Shell";
import { Modal, ConfirmDialog } from "../components/ui/Modal";
import { PageHeader, TableWrap, Td, Th } from "../components/ui/pagebits";
import { formatDateTime, formatRelative } from "../lib/format";

/** Inside BI: no invitations or ownership transfer (owners are the BI admins). */
const SHOW_INVITATIONS = false;

/** Roles a manager/admin may hand out — never `owner`. */
const ASSIGNABLE: Role[] = ["admin", "manager", "salesperson", "viewer"];

interface AddByEmailResult {
  kind: "member" | "invitation";
  id?: string;
  user_id?: string;
  email?: string;
  role?: string;
  message?: string;
}

/**
 * Team screen: members, invitations, roles and ownership transfer.
 *
 * Every mutation goes through the guarded SECURITY DEFINER functions on the
 * server (`add_company_member_by_email`, `update_member_role`, …). The UI
 * mirrors the same rules — `owner` is not offered anywhere, an admin cannot
 * promote anyone to owner, and nobody can edit the owner's row — but those
 * rules are enforced in SQL first. Changing the select here and submitting
 * still fails server-side.
 */
export default function Team() {
  const { role, user, currentCompany } = useAuth();
  const toast = useToast();

  const canManage = can(role, PERMISSIONS.TEAM_MANAGE);
  const isOwner = role === "owner";

  const members = useAsync<CompanyMember[]>(
    (signal) => api.get<CompanyMember[]>("/members", undefined, { signal }),
    [currentCompany?.id],
  );

  const invitations = useAsync<Invitation[]>(
    (signal) => api.get<Invitation[]>("/invitations", undefined, { signal }),
    [currentCompany?.id],
    { enabled: canManage },
  );

  const [inviteOpen, setInviteOpen] = useToggle(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("salesperson");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{ kind: string; token?: string; email?: string } | null>(null);

  const [roleTarget, setRoleTarget] = useState<CompanyMember | null>(null);
  const [nextRole, setNextRole] = useState<Role>("salesperson");
  const [roleBusy, setRoleBusy] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<CompanyMember | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<Invitation | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const [transferTarget, setTransferTarget] = useState<CompanyMember | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferConfirm, setTransferConfirm] = useState("");

  const rowName = (member: CompanyMember) =>
    member.profile?.full_name?.trim() || member.profile?.email || "Team member";

  async function invite(event: FormEvent) {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!email) {
      setInviteError("Enter an e-mail address.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setInviteError("That doesn't look like an e-mail address.");
      return;
    }
    if (inviteRole === "owner") {
      setInviteError("Ownership can only be transferred, never invited.");
      return;
    }
    setInviteError(null);
    setInviteBusy(true);
    try {
      const result = await api.post<AddByEmailResult>("/members/by-email", {
        email,
        role: inviteRole,
      });
      setInviteResult({ kind: result.kind, token: undefined, email });
      if (result.kind === "invitation") {
        toast.success("Invitation created", `No account exists for ${email} yet.`);
      } else {
        toast.success("Member added", `${email} joined as ${ROLE_LABELS[inviteRole]}.`);
      }
      setInviteEmail("");
      await Promise.all([members.refetch(), invitations.refetch()]);
    } catch (err) {
      // The API reports "no account yet" as an error carrying the invitation;
      // treat it as the success it actually is.
      const apiError = err as { code?: string; details?: { invitation?: Invitation } };
      if (apiError.code === "invitation_created") {
        setInviteResult({
          kind: "invitation",
          token: apiError.details?.invitation?.token,
          email,
        });
        setInviteEmail("");
        toast.success("Invitation created", `No account exists for ${email} yet.`);
        void invitations.refetch();
      } else {
        setInviteError(
          err instanceof Error ? err.message : "Could not send the invitation.",
        );
        toast.fromError(err, "Could not send the invitation.");
      }
    } finally {
      setInviteBusy(false);
    }
  }

  async function changeRole() {
    if (!roleTarget) return;
    setRoleBusy(true);
    try {
      await api.patch(`/members/${roleTarget.id}`, { role: nextRole });
      toast.success("Role updated", `${rowName(roleTarget)} is now ${ROLE_LABELS[nextRole]}.`);
      setRoleTarget(null);
      await members.refetch();
    } catch (err) {
      toast.fromError(err, "Could not change the role.");
    } finally {
      setRoleBusy(false);
    }
  }

  async function removeMember() {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      await api.delete(`/members/${removeTarget.id}`);
      toast.success("Member removed", `${rowName(removeTarget)} no longer has access.`);
      setRemoveTarget(null);
      await Promise.all([members.refetch(), invitations.refetch()]);
    } catch (err) {
      toast.fromError(err, "Could not remove this member.");
    } finally {
      setRemoveBusy(false);
    }
  }

  async function revoke() {
    if (!revokeTarget) return;
    setRevokeBusy(true);
    try {
      await api.delete(`/invitations/${revokeTarget.id}`);
      toast.success("Invitation revoked", revokeTarget.email);
      setRevokeTarget(null);
      await invitations.refetch();
    } catch (err) {
      toast.fromError(err, "Could not revoke the invitation.");
    } finally {
      setRevokeBusy(false);
    }
  }

  async function transfer() {
    if (!transferTarget) return;
    setTransferBusy(true);
    try {
      await api.post("/transfer-ownership", { new_owner_id: transferTarget.user_id });
      toast.success("Ownership transferred", `${rowName(transferTarget)} is now the owner.`);
      setTransferTarget(null);
      setTransferConfirm("");
      window.location.reload(); // role in the sidebar/switcher comes from a fresh load
    } catch (err) {
      toast.fromError(err, "Could not transfer ownership.");
    } finally {
      setTransferBusy(false);
    }
  }

  const memberRows = members.data ?? [];
  const pendingInvites = (invitations.data ?? []).filter((i) => i.status === "pending");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Team"
        subtitle={
          members.loading
            ? "Loading members…"
            : `${memberRows.length} active member${memberRows.length === 1 ? "" : "s"}${
                canManage && pendingInvites.length
                  ? ` · ${pendingInvites.length} pending invitation${pendingInvites.length === 1 ? "" : "s"}`
                  : ""
              } · your role: ${role ? ROLE_LABELS[role] : "—"}`
        }
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setInviteOpen(true)} icon={<Plus className="size-4" aria-hidden />}>
              Add person
            </Button>
          ) : null
        }
      />

      {/* ------------------------------------------------------------- members */}
      <Card>
        <CardHeader
          title="Members"
          subtitle="Everyone with Leads CRM access in this company. BI Super Admins and Company Admins are always owners."
          actions={
            canManage ? (
              <Button size="sm" variant="secondary" onClick={() => setInviteOpen(true)} icon={<Mail className="size-4" aria-hidden />}>
                Invite
              </Button>
            ) : null
          }
        />
        {members.loading && !members.data ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-20 rounded" />
              </div>
            ))}
          </div>
        ) : members.error && !members.data ? (
          <ErrorState
            title="Couldn't load the team"
            description={members.errorMessage}
            onRetry={() => void members.refetch()}
          />
        ) : memberRows.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="size-6" />}
            title="No members yet"
            description="Use Add person to give BI users of this company a CRM role."
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Role</Th>
                <Th>Joined</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {memberRows.map((member) => {
                const isSelf = member.user_id === user?.id;
                const isCompanyOwner = currentCompany?.owner_id === member.user_id;
                // An admin may edit anyone below owner; an owner may edit all
                // but themselves through this screen (transfer does that).
                const editable =
                  canManage && !isCompanyOwner && member.role !== "owner";
                return (
                  <tr key={member.id} className="border-b border-line transition hover:bg-surface-2">
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar
                          name={member.profile?.full_name}
                          email={member.profile?.email}
                          size="md"
                        />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate font-semibold text-ink">
                            {rowName(member)}
                            {isCompanyOwner ? (
                              <Crown className="size-3.5 text-warning" aria-label="Company owner" />
                            ) : null}
                            {isSelf ? <Badge tone="info">You</Badge> : null}
                          </p>
                          <p className="truncate text-xs text-ink-3">{member.profile?.email ?? "—"}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <RoleBadge role={member.role} />
                      <p className="mt-1 max-w-56 text-xs text-ink-3">{ROLE_SUMMARIES[member.role]}</p>
                    </Td>
                    <Td className="whitespace-nowrap text-sm text-ink-2">
                      {member.joined_at ? formatDateTime(member.joined_at) : formatRelative(member.created_at)}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        {editable ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setRoleTarget(member);
                                setNextRole(member.role === "owner" ? "admin" : member.role);
                              }}
                              icon={<UserRoundCog className="size-3.5" aria-hidden />}
                            >
                              Change role
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setRemoveTarget(member)}
                              aria-label={`Remove ${rowName(member)}`}
                              icon={<UserMinus className="size-3.5" />}
                            >
                              Remove
                            </Button>
                          </>
                        ) : null}
                        {SHOW_INVITATIONS && isOwner && !isCompanyOwner && member.status === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTransferTarget(member);
                              setTransferConfirm("");
                            }}
                          >
                            Transfer ownership
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {/* --------------------------------------------------------- invitations */}
      {/* inside BI there are no e-mail invitations: people are added in BI first */}
      {SHOW_INVITATIONS && canManage ? (
        <Card>
          <CardHeader
            title="Pending invitations"
            subtitle="Invitations expire; a revoked one can no longer be redeemed."
          />
          {invitations.loading && !invitations.data ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : invitations.error && !invitations.data ? (
            <ErrorState
              title="Couldn't load invitations"
              description={invitations.errorMessage}
              onRetry={() => void invitations.refetch()}
            />
          ) : pendingInvites.length === 0 ? (
            <EmptyState
              icon={<Mail className="size-6" />}
              title="No pending invitations"
              description="Anyone invited who does not have an account yet shows up here."
              action={
                <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
                  Invite someone
                </Button>
              }
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>E-mail</Th>
                  <Th>Role</Th>
                  <Th>Expires</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((invitation) => (
                  <tr key={invitation.id} className="border-b border-line">
                    <Td className="font-medium text-ink">{invitation.email}</Td>
                    <Td>
                      <RoleBadge role={invitation.role} />
                    </Td>
                    <Td className="text-sm text-ink-2">
                      {formatRelative(invitation.expires_at)}
                      <span className="block text-xs text-ink-3">{formatDateTime(invitation.expires_at)}</span>
                    </Td>
                    <Td>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRevokeTarget(invitation)}
                          icon={<UserMinus className="size-3.5" />}
                        >
                          Revoke
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      ) : null}

      {/* ------------------------------------------------------- role reference */}
      <Card>
        <CardHeader
          title="What each role can do"
          subtitle="Enforced by the API and by database row-level security, not just by this screen."
        />
        <ul className="divide-y divide-line">
          {ROLES.map((item) => (
            <li key={item} className="flex flex-wrap items-start gap-3 px-5 py-3">
              <RoleBadge role={item} />
              <p className="min-w-0 flex-1 text-sm text-ink-2">{ROLE_SUMMARIES[item]}</p>
              {item === "owner" ? (
                <Badge tone="warning">Cannot be assigned</Badge>
              ) : item === "admin" && role !== "owner" ? (
                <Badge tone="neutral">Owner only</Badge>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {/* ------------------------------------------------------------ invite dlg */}
      <Modal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteResult(null);
          setInviteError(null);
        }}
        title="Add a person"
        description="Enter the e-mail of a BI user of this company (add them in BI Access Management first; they must have signed in to BI once). They get the role you choose."
        footer={
          inviteResult ? (
            <Button
              variant="primary"
              onClick={() => {
                setInviteOpen(false);
                setInviteResult(null);
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setInviteOpen(false);
                  setInviteError(null);
                }}
                disabled={inviteBusy}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={inviteBusy}
                onClick={(event) => void invite(event as unknown as FormEvent)}
              >
                Send invite
              </Button>
            </>
          )
        }
      >
        {inviteResult ? (
          <div className="space-y-3 text-sm text-ink-2">
            <p className="rounded-lg border border-success/30 bg-converted/10 px-3.5 py-3 text-ink">
              {inviteResult.kind === "invitation"
                ? `An invitation was created for ${inviteResult.email}. They join as soon as they sign up with that address and accept it.`
                : `${inviteResult.email} was added to the company.`}
            </p>
            <p>
              No e-mail is sent by this application itself — copy the link from the pending
              invitations list, or have the person sign up and accept from there.
            </p>
          </div>
        ) : (
          <form onSubmit={invite} className="space-y-4">
            <Field label="E-mail address" htmlFor="invite-email" required error={inviteError}>
              <Input
                id="invite-email"
                data-autofocus
                type="email"
                value={inviteEmail}
                invalid={Boolean(inviteError)}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="teammate@company.com"
                autoComplete="off"
              />
            </Field>

            <Field
              label="Role"
              htmlFor="invite-role"
              hint={
                inviteRole === "admin"
                  ? roleAtLeast(role, "owner")
                    ? "Admins manage everything except deleting or transferring the company."
                    : "Only an owner can grant admin."
                  : ROLE_SUMMARIES[inviteRole]
              }
            >
              <Select
                id="invite-role"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as Role)}
              >
                {ASSIGNABLE.map((item) => (
                  <option
                    key={item}
                    value={item}
                    disabled={item === "admin" && !roleAtLeast(role, "owner")}
                  >
                    {ROLE_LABELS[item]}
                    {item === "admin" && !roleAtLeast(role, "owner") ? " (owner only)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </form>
        )}
      </Modal>

      {/* ------------------------------------------------------------ change role */}
      <Modal
        open={roleTarget !== null}
        onClose={() => setRoleTarget(null)}
        title="Change role"
        description={roleTarget ? rowName(roleTarget) : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRoleTarget(null)} disabled={roleBusy}>
              Cancel
            </Button>
            <Button variant="primary" loading={roleBusy} onClick={() => void changeRole()}>
              Save role
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="New role" htmlFor="role-select" hint={ROLE_SUMMARIES[nextRole]}>
            <Select
              id="role-select"
              data-autofocus
              value={nextRole}
              onChange={(event) => setNextRole(event.target.value as Role)}
            >
              {ASSIGNABLE.filter((item) => roleAtLeast(role, "admin") || item !== "admin").map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABELS[item]}
                </option>
              ))}
            </Select>
          </Field>
          {nextRole === "admin" && !roleAtLeast(role, "owner") ? (
            <p className="text-sm text-danger">Only an owner can grant the admin role.</p>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={removeMember}
        loading={removeBusy}
        title="Remove this member?"
        description={
          <>
            <strong>{removeTarget ? rowName(removeTarget) : ""}</strong> loses access to this company
            immediately. Their leads stay in the pipeline but become unassigned in practice — you can
            reassign them afterwards.
          </>
        }
        confirmLabel="Remove"
      />

      <ConfirmDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onConfirm={revoke}
        loading={revokeBusy}
        title="Revoke this invitation?"
        description={
          <>
            {revokeTarget?.email} will no longer be able to redeem the invite. You can always send a
            new one.
          </>
        }
        confirmLabel="Revoke"
      />

      {/* -------------------------------------------------------------- transfer */}
      <Modal
        open={transferTarget !== null}
        onClose={() => setTransferTarget(null)}
        title="Transfer ownership?"
        description="This is the only way the owner role changes hands."
        footer={
          <>
            <Button variant="secondary" onClick={() => setTransferTarget(null)} disabled={transferBusy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={transferBusy}
              disabled={transferConfirm !== "TRANSFER"}
              onClick={() => void transfer()}
            >
              Transfer
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-ink-2">
          <p>
            <strong className="text-ink">{transferTarget ? rowName(transferTarget) : ""}</strong> will
            become the company owner, able to delete the company and manage every member. You will
            become an admin.
          </p>
          <p>Type <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">TRANSFER</code> to confirm.</p>
          <Input
            data-autofocus
            value={transferConfirm}
            onChange={(event) => setTransferConfirm(event.target.value)}
            placeholder="TRANSFER"
            autoComplete="off"
            aria-label="Type TRANSFER to confirm"
          />
        </div>
      </Modal>
    </div>
  );
}
