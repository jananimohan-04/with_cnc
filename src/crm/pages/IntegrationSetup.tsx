// Step-by-step setup for Facebook / Instagram (Meta) and LinkedIn on the Integrations page.
// A BI Super Admin pastes the app keys here (the server keeps them encrypted); everyone else sees the progress.
// The webhook verify token and the encryption key are made by the server, so nobody has to invent them.

import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Copy, ExternalLink, KeyRound, Lock } from "lucide-react";
import { api } from "../lib/api";
import { useAsync } from "../lib/hooks";
import { useToast } from "../providers/ToastProvider";
import { Button, Card, Input } from "../components/ui/primitives";

type KeyName = "META_APP_ID" | "META_APP_SECRET" | "META_WEBHOOK_VERIFY_TOKEN" | "LINKEDIN_CLIENT_ID" | "LINKEDIN_CLIENT_SECRET";
interface KeyState { set: boolean; from_server: boolean; value: string | null }
export interface AppKeys {
  can_edit: boolean;
  table_ready: boolean;
  keys: Record<KeyName, KeyState>;
  meta: { redirect_urls: string[]; webhook_url: string };
  linkedin: { redirect_url: string };
}

export function CopyLine({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <div className="mt-1 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink-2">{value}</code>
        <Button size="sm" variant="secondary" icon={<Copy className="size-3.5" aria-hidden />}
          onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true)).catch(() => toast.error("Copy failed", "Select the text and copy it yourself."))}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${done ? "bg-emerald-500 text-white" : "bg-brand-600 text-white"}`}>
        {done ? <CheckCircle2 className="size-4" aria-hidden /> : n}
      </span>
      <div className="min-w-0 flex-1 pb-4">
        <p className="text-sm font-bold text-ink">{title}</p>
        <div className="mt-1 space-y-2 text-xs leading-relaxed text-ink-2">{children}</div>
      </div>
    </li>
  );
}

const Out = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
    {children} <ExternalLink className="size-3" aria-hidden />
  </a>
);

function KeyInput({ label, name, keys, secret, draft, setDraft, editable }: {
  label: string; name: KeyName; keys: AppKeys["keys"]; secret?: boolean;
  draft: Partial<Record<KeyName, string>>; setDraft: (f: (d: Partial<Record<KeyName, string>>) => Partial<Record<KeyName, string>>) => void; editable: boolean;
}) {
  const k = keys[name];
  if (k.from_server) {
    return <p className="text-xs"><b>{label}:</b> <span className="text-emerald-700">set in the server settings ✓</span></p>;
  }
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</span>
      <Input
        type={secret ? "password" : "text"}
        autoComplete="off"
        disabled={!editable}
        value={draft[name] ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, [name]: e.target.value }))}
        placeholder={k.set ? (secret ? "Saved ✓ (type a new one to replace it)" : k.value ?? "Saved ✓") : editable ? `Paste the ${label} here` : "Not added yet"}
        className="mt-1"
      />
    </label>
  );
}

function Section({ title, ready, open, onToggle, children }: { title: string; ready: boolean; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <KeyRound className="size-4 text-brand-600" aria-hidden />
        <span className="flex-1 text-sm font-bold text-ink">{title}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ready ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"}`}>
          {ready ? "Keys added ✓" : "Keys needed"}
        </span>
        {open ? <ChevronUp className="size-4 text-ink-3" /> : <ChevronDown className="size-4 text-ink-3" />}
      </button>
      {open ? <div className="border-t border-line px-4 pt-4">{children}</div> : null}
    </div>
  );
}

export function IntegrationSetup({ onSaved }: { onSaved: () => void }) {
  const toast = useToast();
  const data = useAsync<AppKeys>((signal) => api.get<AppKeys>("/integrations/app-keys", undefined, { signal }), []);
  const [draft, setDraft] = useState<Partial<Record<KeyName, string>>>({});
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<"meta" | "linkedin" | null>(null);

  const d = data.data;
  const metaReady = !!d && d.keys.META_APP_ID.set && d.keys.META_APP_SECRET.set;
  const liReady = !!d && d.keys.LINKEDIN_CLIENT_ID.set && d.keys.LINKEDIN_CLIENT_SECRET.set;

  useEffect(() => {
    if (d && open === null) setOpen(!metaReady ? "meta" : !liReady ? "linkedin" : null);
  }, [d, metaReady, liReady, open]);

  if (data.error && !d) {
    return <Card className="p-4 text-xs text-[#b91c1c]">Could not load the setup steps: {data.errorMessage}</Card>;
  }
  if (!d) return null;

  const editable = d.can_edit && d.table_ready;
  const save = async (names: KeyName[]) => {
    const body = Object.fromEntries(names.map((n) => [n, draft[n] ?? ""]).filter(([, v]) => String(v).trim()));
    if (!Object.keys(body).length) { toast.info("Nothing to save", "Paste a key first."); return; }
    setSaving(true);
    try {
      await api.post("/integrations/app-keys", body);
      setDraft((x) => { const n = { ...x }; for (const k of names) delete n[k]; return n; });
      toast.success("Keys saved", "They are kept encrypted on the server.");
      await data.refetch();
      onSaved();
    } catch (e) {
      toast.fromError(e, "Could not save the keys.");
    } finally { setSaving(false); }
  };

  const keyProps = { keys: d.keys, draft, setDraft, editable };

  return (
    <Card className="p-5">
      <h2 className="font-display text-base font-bold text-ink">Set up Facebook, Instagram and LinkedIn</h2>
      <p className="mt-1 text-xs text-ink-3">
        Done once for the whole of BI by a Super Admin. After that, each company only presses <b>Connect</b> on its card below.
        The website form needs no setup.
      </p>

      {!d.table_ready ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Please ask your administrator to run the SQL file <b>20261204000000_crm_app_settings.sql</b>, then refresh this page.
        </p>
      ) : !d.can_edit ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2">
          <Lock className="size-3.5 text-ink-3" aria-hidden /> Only a BI Super Admin can add these keys. Ask them to follow the steps below.
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        <Section title="Facebook & Instagram (Meta)" ready={metaReady} open={open === "meta"} onToggle={() => setOpen(open === "meta" ? null : "meta")}>
          <ol>
            <Step n={1} title="Create a Meta app">
              <p>Open <Out href="https://developers.facebook.com/apps">developers.facebook.com/apps</Out>, sign in with the Facebook account that manages your business Page, and press <b>Create app</b>.</p>
              <p>Use case: choose <b>“Other”</b>, then app type <b>“Business”</b>. Give it a name (for example “Argus Leads”) and pick your Business portfolio.</p>
            </Step>
            <Step n={2} title="Copy the App ID and App Secret here" done={metaReady}>
              <p>In the app go to <b>App settings → Basic</b>. Copy the <b>App ID</b>, then press <b>Show</b> next to <b>App secret</b> and copy it.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <KeyInput label="App ID" name="META_APP_ID" {...keyProps} />
                <KeyInput label="App secret" name="META_APP_SECRET" secret {...keyProps} />
              </div>
              {editable ? (
                <Button size="sm" variant="primary" loading={saving} onClick={() => void save(["META_APP_ID", "META_APP_SECRET"])}>Save Meta keys</Button>
              ) : null}
            </Step>
            <Step n={3} title="Add Facebook Login and paste the sign-in return addresses">
              <p>In the app's left menu press <b>Add product</b> → <b>Facebook Login for Business</b> (or Facebook Login) → <b>Set up</b>. Open its <b>Settings</b> and paste both addresses into <b>Valid OAuth Redirect URIs</b>, then <b>Save changes</b>.</p>
              {d.meta.redirect_urls.map((u, i) => <CopyLine key={u} label={i === 0 ? "Return address 1 (Facebook)" : "Return address 2 (Instagram)"} value={u} />)}
            </Step>
            <Step n={4} title="Add Webhooks so new leads arrive straight away">
              <p><b>Add product</b> → <b>Webhooks</b>. In the drop-down choose <b>Page</b>, press <b>Subscribe to this object</b>, paste the two values below and press <b>Verify and save</b>. Then find <b>leadgen</b> in the list and press <b>Subscribe</b>.</p>
              <CopyLine label="Callback URL" value={d.meta.webhook_url} />
              {d.keys.META_WEBHOOK_VERIFY_TOKEN.value ? (
                <CopyLine label="Verify token" value={d.keys.META_WEBHOOK_VERIFY_TOKEN.value} />
              ) : (
                <p className="text-ink-3">{d.can_edit ? "The verify token appears here once the SQL above has been run." : "The Super Admin sees the verify token here."}</p>
              )}
            </Step>
            <Step n={5} title="Who may connect">
              <p>Until Meta reviews your app, only people listed in <b>App roles → Roles</b> (Administrators, Developers, Testers) can connect. Add the Facebook account of each person who will press Connect.</p>
              <p>To let any company connect, send the app for <b>App Review</b> with these permissions: <i>pages_show_list, pages_manage_metadata, pages_manage_ads, leads_retrieval</i> (and <i>instagram_basic</i> for Instagram), then switch the app to <b>Live</b>.</p>
            </Step>
            <Step n={6} title="Connect">
              <p>Press <b>Connect</b> on the Facebook card below, sign in to Facebook and tick the Pages whose lead forms you use. New leads from your Facebook and Instagram lead ads then appear in Leads automatically.</p>
            </Step>
          </ol>
        </Section>

        <Section title="LinkedIn" ready={liReady} open={open === "linkedin"} onToggle={() => setOpen(open === "linkedin" ? null : "linkedin")}>
          <ol>
            <Step n={1} title="Create a LinkedIn app">
              <p>Open <Out href="https://www.linkedin.com/developers/apps/new">linkedin.com/developers/apps/new</Out>. Enter an app name, choose your company's LinkedIn Page and upload a logo, then <b>Create app</b>. Verify the app from your Page when LinkedIn asks.</p>
            </Step>
            <Step n={2} title="Turn on the products">
              <p>On the <b>Products</b> tab request <b>Sign In with LinkedIn using OpenID Connect</b> and <b>Lead Sync</b> (lead gen forms). LinkedIn may take a few days to approve Lead Sync.</p>
            </Step>
            <Step n={3} title="Copy the Client ID and Client Secret here" done={liReady}>
              <p>Open the <b>Auth</b> tab and copy the <b>Client ID</b> and the <b>Primary Client Secret</b>.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <KeyInput label="Client ID" name="LINKEDIN_CLIENT_ID" {...keyProps} />
                <KeyInput label="Client secret" name="LINKEDIN_CLIENT_SECRET" secret {...keyProps} />
              </div>
              {editable ? (
                <Button size="sm" variant="primary" loading={saving} onClick={() => void save(["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"])}>Save LinkedIn keys</Button>
              ) : null}
            </Step>
            <Step n={4} title="Paste the sign-in return address">
              <p>Still on the <b>Auth</b> tab, under <b>Authorized redirect URLs for your app</b>, press the pencil, add this address and <b>Update</b>.</p>
              <CopyLine label="Return address" value={d.linkedin.redirect_url} />
            </Step>
            <Step n={5} title="Connect">
              <p>Press <b>Connect</b> on the LinkedIn card below and sign in with a LinkedIn account that is an admin of your company Page.</p>
            </Step>
          </ol>
        </Section>
      </div>
    </Card>
  );
}
