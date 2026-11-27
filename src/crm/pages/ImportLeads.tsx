import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  UploadCloud,
} from "lucide-react";
import { api } from "../lib/api";
import { useToggle } from "../lib/hooks";
import { useToast } from "../providers/ToastProvider";
import type { ImportReport } from "../lib/types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
} from "../components/ui/primitives";
import { PageHeader, Td, Th } from "../components/ui/pagebits";
import { toCsv, downloadFile } from "../lib/format";

const SAMPLE_HEADERS = [
  "full_name",
  "email",
  "phone",
  "organization",
  "job_title",
  "website",
  "status",
  "priority",
  "source",
  "campaign",
  "assigned_to",
  "tags",
  "notes",
  "next_follow_up_at",
];

/**
 * CSV import: always a dry run first.
 *
 * Nothing is written until the report below is shown and the operator presses
 * "Import". Duplicate handling is explicit (skip vs update), every rejected
 * row is listed with the reason it was rejected, and the final counts come
 * from the server's own post-write report — never from an optimistic guess.
 */
export default function ImportLeads() {
  const toast = useToast();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useToggle(true);
  const [updateExisting, setUpdateExisting] = useToggle(false);
  const [done, setDone] = useState<ImportReport | null>(null);

  function onPick(picked: File | null | undefined) {
    setDone(null);
    setReport(null);
    setError(null);
    if (!picked) return;
    if (!/\.(csv|txt)$/i.test(picked.name)) {
      setError("Pick a .csv file. Export from your tool as CSV (comma separated).");
      return;
    }
    if (picked.size > 20 * 1024 * 1024) {
      setError("That file is larger than 20 MB — split it and import in parts.");
      return;
    }
    setFile(picked);
  }

  async function analyse() {
    if (!file) return;
    setRunning(true);
    setError(null);
    setDone(null);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const result = await api.upload<ImportReport>("/leads/import", form, { dry_run: true });
      setReport(result);
      if (result.invalid_rows > 0 || result.duplicates_in_file + result.duplicates_of_existing > 0) {
        toast.info(
          "Review needed",
          `${result.invalid_rows} invalid row(s) and ${
            result.duplicates_in_file + result.duplicates_of_existing
          } duplicate(s) found.`,
        );
      } else {
        toast.success("All rows look valid");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
      toast.fromError(err, "Analysis failed.");
    } finally {
      setRunning(false);
    }
  }

  async function commit() {
    if (!file) return;
    setRunning(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const result = await api.upload<ImportReport>("/leads/import", form, {
        dry_run: false,
        skip_duplicates: skipDuplicates,
        update_existing: updateExisting,
      });
      setDone(result);
      setReport(null);
      toast.success(
        `${result.created ?? 0} lead${(result.created ?? 0) === 1 ? "" : "s"} imported`,
        `${result.updated ?? 0} updated · ${result.skipped ?? 0} skipped`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The import failed.");
      toast.fromError(err, "Import failed.");
    } finally {
      setRunning(false);
    }
  }

  function downloadTemplate() {
    const rows = [
      ["Ada Lovelace", "ada@example.com", "+44 20 7946 0000", "Analytical Engines", "CTO", "contacted", "high", "website_form", "spring-sale", "", "vip, uk", "Met at the conference", ""],
      ["Grace Hopper", "grace@example.com", "+1 202 555 0134", "Navy Labs", "Rear Admiral", "new", "medium", "referral", "", "", "", "", ""],
    ];
    downloadFile("argus-leads-template.csv", toCsv(SAMPLE_HEADERS, rows));
    toast.success("Template downloaded", "Fill it in, keep the header row, then upload it.");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/crm/leads"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-2 shadow-xs transition hover:text-ink hover:bg-surface-2"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to leads
        </Link>
      </div>

      <PageHeader
        title="Import leads from CSV"
        subtitle="Analysed first, written only when you say so. Nothing is created during the preview."
      />

      {/* --------------------------------------------------------------- upload */}
      <Card>
        <CardHeader
          title="1 · Choose a file"
          subtitle="Header row required. Column names are matched automatically and shown back to you."
          actions={
            <Button variant="outline" size="sm" onClick={downloadTemplate} icon={<Download className="size-4" aria-hidden />}>
              Download template
            </Button>
          }
        />
        <div className="p-6">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-line-strong/80 bg-surface-2/40 px-6 py-12 text-center transition-all duration-200 hover:border-brand-500 hover:bg-brand-50/20 group"
          >
            <div className="rounded-2xl bg-brand-50 p-3 text-brand-600 ring-1 ring-brand-200/60 group-hover:scale-105 transition-transform">
              <UploadCloud className="size-8" aria-hidden />
            </div>
            <span className="text-sm font-semibold text-ink group-hover:text-brand-600 transition-colors">
              {file ? file.name : "Click or drop a CSV file to begin"}
            </span>
            <span className="text-xs text-ink-3">
              {file ? `${(file.size / 1024).toFixed(1)} KB` : "Standard CSV up to 20 MB with header columns"}
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="CSV file"
            onChange={(event) => onPick(event.target.files?.[0])}
          />

          {file ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="primary" loading={running} onClick={() => void analyse()} disabled={!file}>
                Analyse file
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setFile(null);
                  setReport(null);
                  setDone(null);
                  if (fileInput.current) fileInput.current.value = "";
                }}
              >
                Clear
              </Button>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-lost/10 px-3.5 py-3 text-sm text-[#b91c1c]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
        </div>
      </Card>

      {/* --------------------------------------------------------------- report */}
      {report ? (
        <Card>
          <CardHeader
            title="2 · Review the analysis"
            subtitle={`${report.filename} · ${report.total_rows} row(s) read`}
            actions={
              <Badge tone={report.invalid_rows > 0 ? "warning" : "success"}>
                {report.valid_rows} valid / {report.total_rows}
              </Badge>
            }
          />

          <div className="grid grid-cols-2 gap-3 border-b border-line p-5 sm:grid-cols-4">
            {[
              { label: "Valid rows", value: report.valid_rows, tone: "text-success" },
              { label: "Invalid rows", value: report.invalid_rows, tone: report.invalid_rows ? "text-danger" : "text-ink" },
              { label: "Duplicates in file", value: report.duplicates_in_file, tone: "text-ink" },
              { label: "Match existing leads", value: report.duplicates_of_existing, tone: "text-ink" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-line bg-surface-2 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{stat.label}</p>
                <p className={`mt-1 font-display text-2xl font-extrabold ${stat.tone}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="border-b border-line px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Detected columns</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(report.detected_mapping).map(([header, field]) => (
                <span
                  key={header}
                  className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs ring-1 ring-line-strong"
                >
                  <span className="font-mono text-ink-3">{header}</span>
                  <span className="mx-1 text-ink-3">→</span>
                  <span className="font-semibold text-ink">{field}</span>
                </span>
              ))}
            </div>
            {report.ignored_columns.length > 0 ? (
              <p className="mt-2 text-xs text-ink-3">
                Ignored: {report.ignored_columns.join(", ")}
              </p>
            ) : null}
            {report.suggestions.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-[#92400e]">
                {report.suggestions.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {report.errors.length > 0 ? (
            <div className="border-b border-line px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                Rows that will be rejected
              </p>
              <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto scroll-thin">
                {report.errors.map((entry) => (
                  <li key={entry.row} className="text-sm text-[#b91c1c]">
                    Row {entry.row}: {entry.messages.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">First 20 rows</p>
            <div className="mt-2 overflow-x-auto scroll-thin">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
                    <Th>Row</Th>
                    <Th>Name</Th>
                    <Th>E-mail</Th>
                    <Th>Status</Th>
                    <Th>Note</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.preview.map((row) => (
                    <tr key={row.row} className="border-b border-line">
                      <Td className="text-ink-3">{row.row}</Td>
                      <Td className="text-ink">{String(row.values.full_name ?? "—")}</Td>
                      <Td className="text-ink-2">{String(row.values.email ?? "—")}</Td>
                      <Td>
                        {row.errors.length > 0 ? (
                          <Badge tone="danger">invalid</Badge>
                        ) : row.duplicate_of ? (
                          <Badge tone="warning">
                            {String(row.duplicate_of).startsWith("row ")
                              ? "duplicate in file"
                              : "matches existing"}
                          </Badge>
                        ) : (
                          <Badge tone="success">ready</Badge>
                        )}
                      </Td>
                      <Td className="text-xs text-ink-3">
                        {row.errors.length > 0
                          ? row.errors.join("; ")
                          : row.duplicate_of
                            ? String(row.duplicate_of)
                            : ""}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-line bg-surface-2 px-5 py-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={() => {
                  if (!skipDuplicates) setUpdateExisting(false);
                  setSkipDuplicates();
                }}
                className="size-4 rounded accent-brand-600"
              />
              Skip duplicate rows
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={() => {
                  setUpdateExisting();
                  if (!updateExisting) setSkipDuplicates(false);
                }}
                className="size-4 rounded accent-brand-600"
              />
              Update matching leads instead
            </label>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" onClick={() => setReport(null)} disabled={running}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={running}
                disabled={report.valid_rows === 0}
                onClick={() => void commit()}
                icon={<UploadCloud className="size-4" aria-hidden />}
              >
                Import {Math.min(report.valid_rows, report.valid_rows)} row(s)
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- done */}
      {done ? (
        <Card>
          <CardHeader
            title="3 · Import complete"
            subtitle="Counts below come from the server after it finished writing."
            actions={
              <Badge tone={done.failed && done.failed.length > 0 ? "warning" : "success"}>
                {done.failed && done.failed.length > 0 ? `${done.failed.length} failed` : "success"}
              </Badge>
            }
          />
          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
            {[
              { label: "Created", value: done.created ?? 0 },
              { label: "Updated", value: done.updated ?? 0 },
              { label: "Skipped", value: done.skipped ?? 0 },
              { label: "Failed", value: done.failed?.length ?? 0 },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-line bg-surface-2 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{stat.label}</p>
                <p className="mt-1 font-display text-2xl font-extrabold text-ink">{stat.value}</p>
              </div>
            ))}
          </div>

          {(done.failed?.length ?? 0) > 0 ? (
            <div className="border-t border-line px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Failures</p>
              <ul className="mt-2 space-y-1 text-sm text-[#b91c1c]">
                {done.failed!.map((entry, index) => (
                  <li key={`${entry.row}-${index}`}>
                    {entry.row}: {entry.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-line bg-surface-2 px-5 py-4">
            <Button variant="primary" onClick={() => navigate("/crm/leads")}>
              <CheckCircle2 className="size-4" aria-hidden />
              View leads
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDone(null);
                setFile(null);
                setReport(null);
                if (fileInput.current) fileInput.current.value = "";
              }}
            >
              Import another file
            </Button>
          </div>
        </Card>
      ) : null}

      {/* ----------------------------------------------------------------- help */}
      <Card>
        <CardHeader title="What the importer understands" />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-ink">Recognised columns</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SAMPLE_HEADERS.map((header) => (
                <code
                  key={header}
                  className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink-2 ring-1 ring-line-strong"
                >
                  {header}
                </code>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-3">
              Common aliases are matched too — "Name", "Full Name" or "Contact" all map to{" "}
              <code className="font-mono">full_name</code>.
            </p>
          </div>
          <div className="space-y-3 text-sm text-ink-2">
            <p className="flex items-start gap-2">
              <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
              UTF-8 CSV with a header row. Comma or semicolon separated; quoted cells supported.
            </p>
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
              <span>
                <code className="font-mono text-xs">assigned_to</code> is matched by the person's
                e-mail against this company's members. Addresses that are not members are left
                unassigned rather than guessed.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
              Duplicates are detected inside the file and against existing leads by e-mail, then by{" "}
              <code className="font-mono text-xs">external_id</code>.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
