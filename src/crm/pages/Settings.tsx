import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, KeyRound, LogOut, Save, Trash2, UserRound } from "lucide-react";
import { api } from "../lib/api";
import { useAsync, useToggle } from "../lib/hooks";
import { useToast } from "../providers/ToastProvider";
import { useAuth } from "../providers/AuthProvider";
import { can, PERMISSIONS, ROLE_SUMMARIES } from "../lib/permissions";
import { ROLES, ROLE_LABELS, type CompanySetting, type Role } from "../lib/types";
import {
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
import { Modal } from "../components/ui/Modal";
import { PageHeader } from "../components/ui/pagebits";
import { formatDateTime } from "../lib/format";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR", "AED", "JPY", "CHF", "SEK", "SGD", "BRL"];
const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

interface ProfileForm {
  full_name: string;
  avatar_url: string;
}

interface PasswordForm {
  new_password: string;
  confirm: string;
}

interface CompanyForm {
  name: string;
  industry: string;
  website: string;
  phone: string;
  address: string;
  timezone: string;
  currency: string;
}

/**
 * Settings.
 *
 * Four independent sections, each saving to its own endpoint:
 *   1. your profile        → PATCH /auth/me
 *   2. your password       → POST  /auth/password
 *   3. company details     → PATCH /companies/{id}      (manager+)
 *   4. company key/values  → PUT   /companies/{id}/settings/{key} (manager+)
 * plus a genuinely destructive zone that mirrors the server's own
 * "type the company name" requirement.
 */
/** Inside BI: account, company and delete are managed in BI. */
const IN_BI = true;

export default function Settings() {
  const { profile, user, currentCompany, role, updateProfile, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const canManageCompany = can(role, PERMISSIONS.SETTINGS_MANAGE);
  const canDeleteCompany = can(role, PERMISSIONS.COMPANY_DELETE);
  const isOwner = role === "owner";

  // ------------------------------------------------------------------ profile
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    full_name: "",
    avatar_url: "",
  });
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);

  useEffect(() => {
    if (!profileDirty) {
      setProfileForm({
        full_name: profile?.full_name ?? "",
        avatar_url: profile?.avatar_url ?? "",
      });
    }
  }, [profile, profileDirty]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!profileForm.full_name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    setProfileBusy(true);
    try {
      await updateProfile({
        full_name: profileForm.full_name.trim(),
        avatar_url: profileForm.avatar_url.trim() || null,
      });
      setProfileDirty(false);
      toast.success("Profile updated");
    } catch (error) {
      toast.fromError(error, "Could not save your profile.");
    } finally {
      setProfileBusy(false);
    }
  }

  // ----------------------------------------------------------------- password
  const [pw, setPw] = useState<PasswordForm>({ new_password: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErrors, setPwErrors] = useState<{ new_password?: string; confirm?: string }>({});

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    const errors: typeof pwErrors = {};
    if (pw.new_password.length < 8) errors.new_password = "Use at least 8 characters.";
    if (pw.confirm !== pw.new_password) errors.confirm = "Passwords don't match.";
    setPwErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPwBusy(true);
    try {
      await api.post("/auth/password", { new_password: pw.new_password });
      setPw({ new_password: "", confirm: "" });
      toast.success("Password changed");
    } catch (error) {
      toast.fromError(error, "Could not change the password.");
    } finally {
      setPwBusy(false);
    }
  }

  // ----------------------------------------------------------------- company
  const [companyForm, setCompanyForm] = useState<CompanyForm | null>(null);
  const [companyDirty, setCompanyDirty] = useState(false);
  const [companyBusy, setCompanyBusy] = useState(false);
  const [companyErrors, setCompanyErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (currentCompany && !companyDirty) {
      setCompanyForm({
        name: currentCompany.name,
        industry: currentCompany.industry ?? "",
        website: currentCompany.website ?? "",
        phone: currentCompany.phone ?? "",
        address: currentCompany.address ?? "",
        timezone: currentCompany.timezone ?? "UTC",
        currency: currentCompany.currency ?? "USD",
      });
    }
  }, [currentCompany, companyDirty]);

  async function saveCompany(event: FormEvent) {
    event.preventDefault();
    if (!companyForm || !currentCompany) return;
    const errors: Record<string, string> = {};
    if (!companyForm.name.trim()) errors.name = "The company needs a name.";
    if (companyForm.website.trim() && !/^https?:\/\/.+/.test(companyForm.website.trim()))
      errors.website = "Include https://";
    setCompanyErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setCompanyBusy(true);
    try {
      await api.patch(`/companies/${currentCompany.id}`, {
        name: companyForm.name.trim(),
        industry: companyForm.industry.trim() || null,
        website: companyForm.website.trim() || null,
        phone: companyForm.phone.trim() || null,
        address: companyForm.address.trim() || null,
        timezone: companyForm.timezone,
        currency: companyForm.currency,
      });
      setCompanyDirty(false);
      toast.success("Company details saved");
      window.location.reload(); // role/name appear in the sidebar + switcher
    } catch (error) {
      const fieldErrors = (error as { fieldErrors?: Record<string, string> }).fieldErrors;
      if (fieldErrors) setCompanyErrors(fieldErrors);
      toast.fromError(error, "Could not save the company.");
    } finally {
      setCompanyBusy(false);
    }
  }

  // --------------------------------------------------------------- app settings
  const settings = useAsync<CompanySetting[]>(
    (signal) =>
      api.get<CompanySetting[]>(`/companies/${currentCompany?.id}/settings`, undefined, { signal }),
    [currentCompany?.id],
    { enabled: Boolean(currentCompany) && can(role, PERMISSIONS.SETTINGS_READ) },
  );

  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [settingBusy, setSettingBusy] = useState(false);

  async function putSetting(event: FormEvent) {
    event.preventDefault();
    const key = newKey.trim().toLowerCase();
    if (!key || !currentCompany) return;
    if (!/^[a-z][a-z0-9_]*$/.test(key) || key.length > 64) {
      toast.error("Invalid key", "Lower-case letters, digits and underscores, starting with a letter.");
      return;
    }
    setSettingBusy(true);
    try {
      await api.put(`/companies/${currentCompany.id}/settings/${key}`, { value: newValue.trim() });
      setNewKey("");
      setNewValue("");
      toast.success(`Setting "${key}" saved`);
      await settings.refetch();
    } catch (error) {
      toast.fromError(error, "Could not save the setting.");
    } finally {
      setSettingBusy(false);
    }
  }

  async function removeSetting(key: string) {
    if (!currentCompany) return;
    if (!window.confirm(`Delete the setting "${key}"?`)) return;
    try {
      await api.delete(`/companies/${currentCompany.id}/settings/${key}`);
      toast.success(`Setting "${key}" deleted`);
      await settings.refetch();
    } catch (error) {
      toast.fromError(error, "Could not delete the setting.");
    }
  }

  // ------------------------------------------------------------ danger zone
  const [deleteOpen, setDeleteOpen] = useToggle(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function deleteCompany() {
    if (!currentCompany) return;
    setDeleteBusy(true);
    try {
      await api.delete(
        `/companies/${currentCompany.id}?confirm=${encodeURIComponent(currentCompany.name)}`,
      );
      toast.success("Company deleted");
      await signOut();
      navigate("/", { replace: true });
    } catch (error) {
      toast.fromError(error, "Could not delete the company.");
    } finally {
      setDeleteBusy(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Your account, your company, and the switches this company keeps between sessions."
      />

      {/* inside BI: name, sign-in (Google) and company details are managed in BI */}
      <Card>
        <CardHeader title="Account and company" subtitle="Managed in Business Intelligence" />
        <div className="p-5 text-sm text-ink-2">
          Your name and sign-in (Google) are managed in BI Access Management, and the company details in BI Company Management.
          Leads CRM roles are set on the <a href="/crm/team" className="font-semibold text-brand-600 hover:underline">Team</a> page.
        </div>
      </Card>

      {!IN_BI && (<>
      {/* ------------------------------------------------------------- profile */}
      <Card>
        <CardHeader
          title="Your profile"
          subtitle={user?.email ?? "Signed in"}
          actions={<UserRound className="size-4 text-ink-3" aria-hidden />}
        />
        <form onSubmit={saveProfile} className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Full name" htmlFor="profile-name" required>
            <Input
              id="profile-name"
              value={profileForm.full_name}
              onChange={(event) => {
                setProfileForm({ ...profileForm, full_name: event.target.value });
                setProfileDirty(true);
              }}
              placeholder="Alex Rivera"
              maxLength={200}
            />
          </Field>
          <Field label="Avatar URL" htmlFor="profile-avatar" hint="Optional. https://…">
            <Input
              id="profile-avatar"
              type="url"
              value={profileForm.avatar_url}
              onChange={(event) => {
                setProfileForm({ ...profileForm, avatar_url: event.target.value });
                setProfileDirty(true);
              }}
              placeholder="https://…"
            />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button
              type="submit"
              variant="primary"
              loading={profileBusy}
              disabled={!profileDirty}
              icon={<Save className="size-4" aria-hidden />}
            >
              Save profile
            </Button>
          </div>
        </form>
      </Card>

      {/* ------------------------------------------------------------ password */}
      <Card>
        <CardHeader title="Change password" subtitle="Applies to your account across every company." />
        <form onSubmit={savePassword} className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="New password" htmlFor="new-password" required error={pwErrors.new_password}>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={pw.new_password}
              invalid={Boolean(pwErrors.new_password)}
              onChange={(event) => setPw({ ...pw, new_password: event.target.value })}
              placeholder="At least 8 characters"
            />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-password" required error={pwErrors.confirm}>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={pw.confirm}
              invalid={Boolean(pwErrors.confirm)}
              onChange={(event) => setPw({ ...pw, confirm: event.target.value })}
              placeholder="Repeat it"
            />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" variant="primary" loading={pwBusy} icon={<KeyRound className="size-4" aria-hidden />}>
              Update password
            </Button>
          </div>
        </form>
      </Card>

      {/* ------------------------------------------------------ company details */}
      <Card>
        <CardHeader
          title="Company details"
          subtitle={
            canManageCompany
              ? "Shared by everyone in this company."
              : "Read-only — your role cannot change company settings."
          }
          actions={<Building2 className="size-4 text-ink-3" aria-hidden />}
        />
        {!currentCompany ? (
          <div className="p-5"><Skeleton className="h-24 w-full" /></div>
        ) : !companyForm ? (
          <div className="p-5"><Skeleton className="h-24 w-full" /></div>
        ) : (
          <form onSubmit={saveCompany} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Company name" htmlFor="company-name" required error={companyErrors.name}>
              <Input
                id="company-name"
                value={companyForm.name}
                disabled={!canManageCompany}
                invalid={Boolean(companyErrors.name)}
                onChange={(event) => {
                  setCompanyForm({ ...companyForm, name: event.target.value });
                  setCompanyDirty(true);
                }}
                maxLength={200}
              />
            </Field>
            <Field label="Industry" htmlFor="company-industry">
              <Input
                id="company-industry"
                value={companyForm.industry}
                disabled={!canManageCompany}
                onChange={(event) => {
                  setCompanyForm({ ...companyForm, industry: event.target.value });
                  setCompanyDirty(true);
                }}
                maxLength={120}
              />
            </Field>
            <Field label="Website" htmlFor="company-website" error={companyErrors.website}>
              <Input
                id="company-website"
                type="url"
                value={companyForm.website}
                disabled={!canManageCompany}
                invalid={Boolean(companyErrors.website)}
                onChange={(event) => {
                  setCompanyForm({ ...companyForm, website: event.target.value });
                  setCompanyDirty(true);
                }}
                placeholder="https://"
              />
            </Field>
            <Field label="Phone" htmlFor="company-phone">
              <Input
                id="company-phone"
                type="tel"
                value={companyForm.phone}
                disabled={!canManageCompany}
                onChange={(event) => {
                  setCompanyForm({ ...companyForm, phone: event.target.value });
                  setCompanyDirty(true);
                }}
              />
            </Field>
            <Field label="Address" htmlFor="company-address" className="sm:col-span-2">
              <Input
                id="company-address"
                value={companyForm.address}
                disabled={!canManageCompany}
                onChange={(event) => {
                  setCompanyForm({ ...companyForm, address: event.target.value });
                  setCompanyDirty(true);
                }}
                maxLength={500}
              />
            </Field>
            <Field label="Timezone" htmlFor="company-tz">
              <Select
                id="company-tz"
                value={companyForm.timezone}
                disabled={!canManageCompany}
                onChange={(event) => {
                  setCompanyForm({ ...companyForm, timezone: event.target.value });
                  setCompanyDirty(true);
                }}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
                {!TIMEZONES.includes(companyForm.timezone) ? (
                  <option value={companyForm.timezone}>{companyForm.timezone}</option>
                ) : null}
              </Select>
            </Field>
            <Field label="Currency" htmlFor="company-currency">
              <Select
                id="company-currency"
                value={companyForm.currency}
                disabled={!canManageCompany}
                onChange={(event) => {
                  setCompanyForm({ ...companyForm, currency: event.target.value });
                  setCompanyDirty(true);
                }}
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
                {!CURRENCIES.includes(companyForm.currency) ? (
                  <option value={companyForm.currency}>{companyForm.currency}</option>
                ) : null}
              </Select>
            </Field>
            {canManageCompany && companyDirty ? (
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setCompanyDirty(false);
                    window.location.reload();
                  }}
                >
                  Discard
                </Button>
                <Button type="submit" variant="primary" loading={companyBusy}>
                  Save company
                </Button>
              </div>
            ) : null}
          </form>
        )}
      </Card>

      </>)}

      {/* ---------------------------------------------------------- your access */}
      <Card>
        <CardHeader
          title="Your access here"
          subtitle={`You are ${role ? ROLE_LABELS[role] : "—"} in ${currentCompany?.name ?? "this company"}.`}
        />
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          {role ? <RoleBadge role={role} /> : null}
          <p className="min-w-0 flex-1 text-sm text-ink-2">
            {role ? ROLE_SUMMARIES[role as Role] : "No role assigned."}
          </p>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {ROLES.map((item) => (
            <li key={item} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              <span className={`w-24 shrink-0 text-sm ${item === role ? "font-bold text-brand-700" : "text-ink-3"}`}>
                {ROLE_LABELS[item]}
                {item === role ? " ← you" : ""}
              </span>
              <span className="min-w-0 flex-1 text-sm text-ink-2">{ROLE_SUMMARIES[item]}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* ------------------------------------------------------ app settings kv */}
      <Card>
        <CardHeader
          title="Company switches"
          subtitle="Key/value settings this company keeps between sessions. Anything you add here is stored as given."
        />
        {settings.error && !settings.data ? (
          <ErrorState
            title="Couldn't load settings"
            description={settings.errorMessage}
            onRetry={() => void settings.refetch()}
          />
        ) : settings.loading && !settings.data ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (settings.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No custom settings yet"
            description="Add a key below — for example `lead_source_required` with the value `true`."
          />
        ) : (
          <ul className="divide-y divide-line">
            {settings.data!.map((setting) => (
              <li key={setting.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <code className="rounded bg-surface-2 px-2 py-1 font-mono text-xs font-semibold text-ink">
                  {setting.key}
                </code>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-2">
                  {JSON.stringify(setting.value)}
                </span>
                <span className="text-xs text-ink-3">
                  {setting.updated_at ? formatDateTime(setting.updated_at) : ""}
                </span>
                {canManageCompany ? (
                  <Button size="sm" variant="ghost" onClick={() => void removeSetting(setting.key)}>
                    Delete
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canManageCompany ? (
          <form onSubmit={putSetting} className="flex flex-wrap items-end gap-3 border-t border-line p-5">
            <div className="min-w-40 flex-1">
              <Field label="Key" htmlFor="setting-key" hint="lower_case_with_underscores">
                <Input
                  id="setting-key"
                  value={newKey}
                  onChange={(event) => setNewKey(event.target.value)}
                  placeholder="lead_source_required"
                  maxLength={64}
                />
              </Field>
            </div>
            <div className="min-w-48 flex-[2]">
              <Field label="Value" htmlFor="setting-value" hint="Stored as text exactly as typed.">
                <Input
                  id="setting-value"
                  value={newValue}
                  onChange={(event) => setNewValue(event.target.value)}
                  placeholder="true"
                />
              </Field>
            </div>
            <Button type="submit" variant="primary" loading={settingBusy} disabled={!newKey.trim()}>
              Save setting
            </Button>
          </form>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------- danger zone */}
      {!IN_BI && (
      <Card className="border-danger/40">
        <CardHeader
          title="Danger zone"
          subtitle="These actions are irreversible. Nothing here happens without an explicit confirmation."
        />
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Delete this company</p>
            <p className="mt-0.5 text-sm text-ink-2">
              Removes {currentCompany?.name}, its leads, follow-ups, notes and integrations for
              everyone. {isOwner ? "Owner only." : "You need the owner role."}
            </p>
          </div>
          <Button
            variant="danger"
            disabled={!canDeleteCompany}
            onClick={() => {
              setDeleteTyped("");
              setDeleteOpen(true);
            }}
            icon={<Trash2 className="size-4" aria-hidden />}
          >
            Delete company
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Sign out</p>
            <p className="mt-0.5 text-sm text-ink-2">Ends this session on this device.</p>
          </div>
          <Button variant="outline" onClick={() => void signOut().then(() => navigate("/"))} icon={<LogOut className="size-4" aria-hidden />}>
            Sign out
          </Button>
        </div>
      </Card>
      )}

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this company?"
        description="Leads, follow-ups, notes, activity, invitations and integrations are all removed for every member."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteBusy}
              disabled={deleteTyped.trim() !== (currentCompany?.name ?? "")}
              onClick={() => void deleteCompany()}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-2">
          <p>
            Type <strong className="text-ink">{currentCompany?.name}</strong> exactly to confirm —
            this is the same check the server applies.
          </p>
          <Input
            data-autofocus
            value={deleteTyped}
            onChange={(event) => setDeleteTyped(event.target.value)}
            placeholder={currentCompany?.name ?? ""}
            aria-label="Type the company name to confirm"
            autoComplete="off"
          />
        </div>
      </Modal>
    </div>
  );
}
