import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  FileCode2,
  Inbox,
  Plug,
  RefreshCw,
  Unplug,
  Webhook,
} from "lucide-react";
import { api } from "../lib/api";
import { useAsync } from "../lib/hooks";
import { useToast } from "../providers/ToastProvider";
import { useAuth } from "../providers/AuthProvider";
import { can, PERMISSIONS } from "../lib/permissions";
import {
  INTEGRATION_STATUSES,
  type IntegrationLog,
  type IntegrationStatus,
  type Provider,
  type ProviderStatus,
} from "../lib/types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
} from "../components/ui/primitives";
import { PageHeader, Pagination, TableWrap, Td, Th } from "../components/ui/pagebits";
import { Modal } from "../components/ui/Modal";
import { formatDateTime, formatRelative, truncate } from "../lib/format";
import { IntegrationSetup } from "./IntegrationSetup";

const PROVIDER_LABELS: Record<Provider, string> = {
  facebook: "Facebook lead ads",
  instagram: "Instagram lead ads",
  linkedin: "LinkedIn",
  website_form: "Website form",
};

const PROVIDER_BLURB: Record<Provider, string> = {
  facebook: "People who fill in your Facebook lead ad forms become leads automatically.",
  instagram: "People who fill in your Instagram lead ad forms become leads automatically.",
  linkedin: "People who fill in your LinkedIn lead gen forms become leads automatically.",
  website_form: "Every entry from the contact form on your own website becomes a lead. Works straight away.",
};

const STATUS_META: Record<IntegrationStatus, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info"; hint: string }> = {
  not_connected: { label: "Not connected", tone: "neutral", hint: "Nothing is linked for this company yet." },
  setup_required: { label: "Setup required", tone: "warning", hint: "Waiting for the setup steps above." },
  awaiting_approval: { label: "Awaiting approval", tone: "info", hint: "Signed in, but Meta or LinkedIn has not approved the app yet." },
  connected: { label: "Connected", tone: "success", hint: "Working: new leads arrive automatically." },
  expired: { label: "Expired", tone: "warning", hint: "The sign-in has expired. Press Reconnect." },
  error: { label: "Error", tone: "danger", hint: "Something went wrong. See the activity log below." },
  disconnected: { label: "Not connected", tone: "neutral", hint: "Was connected before, then disconnected." },
};

function StatusPill({ status }: { status: IntegrationStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.not_connected;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={meta.tone}>
        {meta.tone === "success" ? <CheckCircle2 className="size-3" aria-hidden /> : null}
        {meta.tone === "danger" || meta.tone === "warning" ? (
          <AlertTriangle className="size-3" aria-hidden />
        ) : null}
        {meta.tone === "info" ? <Clock className="size-3" aria-hidden /> : null}
        {meta.label}
      </Badge>
    </span>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <div className="mt-1 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink-2">
          {value}
        </code>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard
              .writeText(value)
              .then(() => setCopied(true))
              .catch(() => toast.error("Copy failed", "Select the text and copy it manually."));
          }}
          icon={<Copy className="size-3.5" aria-hidden />}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Integrations screen.
 *
 * Nothing here is decorative: the status shown is exactly what the backend
 * reports after checking its own environment and the stored connection row.
 * A provider whose credentials are absent reads `setup_required` and the
 * "Connect" button says so rather than opening a handshake that cannot work.
 * The only success message that ever appears is one the server actually
 * returned from the OAuth callback.
 */
export default function Integrations() {
  const { role } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const canManage = can(role, PERMISSIONS.INTEGRATION_MANAGE);

  const list = useAsync<{ integrations: ProviderStatus[] }>(
    (signal) => api.get<{ integrations: ProviderStatus[] }>("/integrations", undefined, { signal }),
    [role],
  );

  const [logPage, setLogPage] = useState(1);
  const logs = useAsync<{ data: IntegrationLog[]; pagination: { page: number; pages: number; total: number; page_size: number } }>(
    (signal) =>
      api.get("/integrations/logs", { page: logPage, page_size: 25 }, { signal }),
    [role, logPage],
  );

  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProviderStatus | null>(null);
  const [syncResult, setSyncResult] = useState<{ provider: string; text: string; ok: boolean } | null>(null);

  // Result of the OAuth redirect: ?provider=…&status=…
  const resultProvider = searchParams.get("provider");
  const resultStatus = searchParams.get("status");
  const resultMessage = searchParams.get("message");
  const resultAccount = searchParams.get("account");

  useEffect(() => {
    if (!resultProvider) return;
    if (resultStatus === "connected") {
      toast.success(
        `${PROVIDER_LABELS[resultProvider as Provider] ?? resultProvider} connected`,
        resultAccount ? `Connected as ${resultAccount}.` : undefined,
      );
    } else if (resultStatus === "awaiting_approval") {
      toast.info(
        "Awaiting approval",
        `${PROVIDER_LABELS[resultProvider as Provider] ?? resultProvider} accepted the sign-in but still needs its permissions approved before leads can be read.`,
      );
    } else if (resultStatus === "error") {
      toast.error(
        "Connection failed",
        resultMessage || "The provider did not complete the handshake.",
      );
    }
    const params = new URLSearchParams(searchParams);
    params.delete("provider");
    params.delete("status");
    params.delete("message");
    params.delete("account");
    setSearchParams(params, { replace: true });
    void list.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultProvider, resultStatus]);

  async function connect(provider: Provider) {
    setBusyProvider(provider);
    try {
      const started = await api.post<{ authorize_url: string }>(
        `/integrations/${provider}/oauth/start`,
      );
      if (!started?.authorize_url) {
        throw new Error("The server did not return an authorisation URL.");
      }
      // Full page navigation: the provider redirects back to the backend
      // callback, which then forwards to this page with the result.
      window.location.assign(started.authorize_url);
    } catch (error) {
      toast.fromError(error, "Could not start the connection.");
      setBusyProvider(null);
    }
  }

  async function sync(provider: Provider) {
    setBusyProvider(provider);
    try {
      const result = await api.post<{ status: string; created?: number; fetched?: number; messages?: string[] }>(
        `/integrations/${provider}/sync`,
      );
      const ok = result.status === "success";
      setSyncResult({
        provider,
        ok,
        text: [
          `Sync ${result.status}.`,
          result.fetched !== undefined ? `${result.fetched} fetched` : null,
          result.created !== undefined ? `${result.created} created` : null,
          ...(result.messages ?? []),
        ]
          .filter(Boolean)
          .join(" · "),
      });
      if (ok) toast.success("Sync finished");
      else toast.error("Sync did not finish", result.messages?.join(" ") ?? result.status);
      await list.refetch();
    } catch (error) {
      toast.fromError(error, "Sync failed.");
    } finally {
      setBusyProvider(null);
    }
  }

  async function disconnect(provider: Provider) {
    if (!window.confirm(`Disconnect ${PROVIDER_LABELS[provider]}? Stored tokens are deleted; existing leads are kept.`)) {
      return;
    }
    setBusyProvider(provider);
    try {
      await api.post(`/integrations/${provider}/disconnect`);
      toast.success("Disconnected", "Existing leads are untouched.");
      await Promise.all([list.refetch(), logs.refetch()]);
    } catch (error) {
      toast.fromError(error, "Could not disconnect.");
    } finally {
      setBusyProvider(null);
    }
  }

  if (list.error && !list.data) {
    return (
      <div className="mx-auto max-w-6xl">
        <ErrorState
          title="Couldn't load integrations"
          description={list.errorMessage}
          onRetry={() => void list.refetch()}
        />
      </div>
    );
  }

  const ORDER: Provider[] = ["website_form", "facebook", "instagram", "linkedin"];
  const entries = [...(list.data?.integrations ?? [])].sort((a, b) => ORDER.indexOf(a.provider) - ORDER.indexOf(b.provider));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Integrations"
        subtitle="Bring leads in automatically from your website, Facebook, Instagram and LinkedIn."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void list.refetch()}
            loading={list.loading && Boolean(list.data)}
            icon={<RefreshCw className="size-4" aria-hidden />}
          >
            Refresh
          </Button>
        }
      />

      {resultStatus === "error" && resultProvider ? (
        <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs text-rose-800 shadow-xs">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden />
          <span>{resultMessage || "The provider refused the connection."}</span>
        </div>
      ) : null}

      <IntegrationSetup onSaved={() => void list.refetch()} />

      <div className="grid gap-5 lg:grid-cols-2">
        {list.loading && !list.data
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-5 space-y-3">
                <Skeleton className="h-5 w-48 rounded-full" />
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-9 w-40 rounded-xl" />
              </Card>
            ))
          : entries.map((entry) => {
              const meta = STATUS_META[entry.status] ?? STATUS_META.not_connected;
              const provider = entry.provider;
              const isForm = provider === "website_form";
              const connected = entry.status === "connected";
              return (
                <Card key={provider} className="flex flex-col p-5 hover:shadow-card-hover transition-all duration-200">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-brand-50 p-1.5 text-brand-600 ring-1 ring-brand-200/60">
                          {isForm ? <Webhook className="size-4" /> : <Plug className="size-4" />}
                        </span>
                        <h2 className="font-display text-base font-bold text-ink">
                          {PROVIDER_LABELS[provider] ?? provider}
                        </h2>
                      </div>
                      <p className="mt-1 text-xs text-ink-3">
                        {PROVIDER_BLURB[provider] ?? ""}
                      </p>
                    </div>
                    <StatusPill status={entry.status} />
                  </div>

                  <p className="mt-3 text-xs text-ink-2">
                    {entry.message ?? meta.hint}
                  </p>

                  {entry.connection ? (
                    <dl className="mt-3 space-y-1.5 rounded-lg border border-line bg-surface-2 px-3.5 py-3 text-xs">
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-3">Account</dt>
                        <dd className="truncate font-medium text-ink">
                          {entry.connection.external_account_name ||
                            entry.connection.external_account_id ||
                            "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-3">Last sync</dt>
                        <dd className="font-medium text-ink">
                          {entry.last_sync_at
                            ? `${formatRelative(entry.last_sync_at)} · ${entry.last_sync_status ?? "unknown"}`
                            : "never"}
                        </dd>
                      </div>
                      {entry.connection.token_expires_at ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-3">Token expires</dt>
                          <dd className="font-medium text-ink">
                            {formatDateTime(entry.connection.token_expires_at)}
                          </dd>
                        </div>
                      ) : null}
                      {entry.scopes.length > 0 ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-3">Scopes</dt>
                          <dd className="truncate font-medium text-ink-2">{entry.scopes.join(", ")}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}

                  {entry.error ? (
                    <p className="mt-3 rounded-lg border border-danger/30 bg-lost/10 px-3 py-2 text-xs text-[#b91c1c]">
                      {entry.error}
                    </p>
                  ) : null}


                  {isForm && entry.endpoint_url ? (
                    <div className="mt-3 space-y-3">
                      <CopyField label="Web address for your form" value={entry.endpoint_url} />
                      {entry.signing_secret ? (
                        <CopyField label="Secret key (shown once — save it now)" value={entry.signing_secret} />
                      ) : (
                        <p className="text-xs text-ink-3">
                          A secret key has already been issued for this company — it is kept on the
                          server and never shown again.
                        </p>
                      )}
                      <p className="text-xs text-ink-2">{entry.instructions}</p>
                      <Button variant="outline" size="sm" onClick={() => setDetail(entry)}>
                        <FileCode2 className="size-4" aria-hidden />
                        Example request
                      </Button>
                    </div>
                  ) : null}

                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {!isForm ? (
                      canManage ? (
                        <Button
                          variant={connected ? "secondary" : "primary"}
                          loading={busyProvider === provider}
                          disabled={!entry.configured}
                          onClick={() => void connect(provider as Provider)}
                          icon={<Plug className="size-4" aria-hidden />}
                        >
                          {connected ? "Reconnect" : "Connect"}
                        </Button>
                      ) : (
                        <Button variant="secondary" disabled icon={<Plug className="size-4" aria-hidden />}>
                          Connect (owners, admins, managers)
                        </Button>
                      )
                    ) : null}

                    {canManage && connected ? (
                      <>
                        <Button
                          variant="secondary"
                          loading={busyProvider === provider}
                          onClick={() => void sync(provider as Provider)}
                          icon={<RefreshCw className="size-4" aria-hidden />}
                        >
                          Sync now
                        </Button>
                        <Button
                          variant="outline"
                          loading={busyProvider === provider}
                          onClick={() => void disconnect(provider as Provider)}
                          icon={<Unplug className="size-4" aria-hidden />}
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : null}

                  </div>

                  {!entry.configured ? (
                    <p className="mt-2 text-xs text-ink-3">
                      Finish the setup steps above first.
                    </p>
                  ) : null}
                </Card>
              );
            })}
      </div>

      {syncResult ? (
        <Modal
          open
          onClose={() => setSyncResult(null)}
          title={`${PROVIDER_LABELS[syncResult.provider as Provider] ?? syncResult.provider} — sync result`}
          description={syncResult.ok ? "The run completed successfully." : "The run did not complete."}
          footer={
            <Button variant="primary" onClick={() => setSyncResult(null)}>
              Close
            </Button>
          }
        >
          <p className="text-sm text-ink-2">{syncResult.text}</p>
        </Modal>
      ) : null}

      {detail ? (
        <Modal
          open
          onClose={() => setDetail(null)}
          title="Example request"
          description="Send your form's entries to this web address."
          size="lg"
          footer={
            <Button variant="primary" onClick={() => setDetail(null)}>
              Close
            </Button>
          }
        >
          <div className="space-y-3 text-sm text-ink-2">
            <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-4 font-mono text-xs leading-relaxed scroll-thin">
{`curl -X POST "${detail.endpoint_url}" \\
  -H "Content-Type: application/json" \\
  -H "X-Argus-Signature: sha256=<hmac-sha256-hex of the raw body>" \\
  -d '{
    "full_name": "Ada Lovelace",
    "email": "ada@example.com",
    "phone": "+44 20 7946 0000",
    "organization": "Analytical Engines Ltd",
    "message": "Interested in the enterprise plan",
    "campaign": "spring-sale",
    "source": "website_form"
  }'`}
            </pre>
            <p>
              Without the signature header the lead is still created, but flagged as unverified in
              its notes. A signature that does not match the secret key is refused outright.
            </p>
            <p>A plain contact form on any web page works too (entries arrive unverified):</p>
            <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-4 font-mono text-xs leading-relaxed scroll-thin">
{`<form method="POST" action="${detail.endpoint_url}">
  <input name="full_name" placeholder="Your name" required>
  <input name="email" type="email" placeholder="E-mail">
  <input name="phone" placeholder="Phone">
  <textarea name="message"></textarea>
  <input type="hidden" name="campaign" value="website">
  <input type="hidden" name="_redirect" value="https://your-site.example/thank-you">
  <button type="submit">Send</button>
</form>`}
            </pre>
          </div>
        </Modal>
      ) : null}

      {/* --------------------------------------------------------------- logs */}
      <Card>
        <CardHeader
          title="Activity log"
          subtitle="Every connection, sync, incoming lead and failure."
          actions={
            <Link
              to="/crm/settings"
              className="text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              Settings
            </Link>
          }
        />
        {logs.loading && !logs.data ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : logs.error && !logs.data ? (
          <ErrorState
            title="Couldn't load the log"
            description={logs.errorMessage}
            onRetry={() => void logs.refetch()}
          />
        ) : (logs.data?.data.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Inbox className="size-6" />}
            title="No integration activity yet"
            description="Connecting, syncing or receiving a webhook writes its first entry here."
          />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Provider</Th>
                  <Th>Event</Th>
                  <Th>Level</Th>
                  <Th>Message</Th>
                </tr>
              </thead>
              <tbody>
                {logs.data!.data.map((entry) => (
                  <tr key={entry.id} className="border-b border-line hover:bg-surface-2">
                    <Td className="whitespace-nowrap text-sm text-ink-2">
                      {formatRelative(entry.created_at)}
                    </Td>
                    <Td className="text-sm font-medium text-ink">{entry.provider}</Td>
                    <Td className="font-mono text-xs text-ink-2">{entry.event}</Td>
                    <Td>
                      <Badge
                        tone={
                          entry.level === "error"
                            ? "danger"
                            : entry.level === "warn"
                              ? "warning"
                              : entry.level === "info"
                                ? "info"
                                : "neutral"
                        }
                      >
                        {entry.level}
                      </Badge>
                      {entry.status_code ? (
                        <span className="ml-1.5 text-xs text-ink-3">{entry.status_code}</span>
                      ) : null}
                    </Td>
                    <Td className="max-w-md text-sm text-ink-2">
                      {truncate(entry.message, 160)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination
              page={logs.data!.pagination.page}
              pages={logs.data!.pagination.pages}
              total={logs.data!.pagination.total}
              pageSize={logs.data!.pagination.page_size}
              label="log entries"
              onPage={(next: number) => setLogPage(next)}
            />
          </>
        )}
      </Card>

      {/* Provider overview for people who just want the honest state */}
      <Card>
        <CardHeader
          title="What the states mean"
          subtitle="What the label on each card means."
        />
        <ul className="divide-y divide-line">
          {INTEGRATION_STATUSES.filter((s) => s !== "disconnected").map((status) => (
            <li key={status} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <StatusPill status={status} />
              <span className="min-w-0 flex-1 text-sm text-ink-2">
                {STATUS_META[status].hint}
              </span>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-5 py-4 text-sm text-ink-2">
          <Webhook className="mr-1.5 inline size-4 text-ink-3" aria-hidden />
          Every incoming lead is checked before it is saved, and the same lead is never added twice.
        </div>
      </Card>
    </div>
  );
}
