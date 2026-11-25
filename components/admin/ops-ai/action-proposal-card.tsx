"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  OpsAiActionProposalV2,
  OpsAiProposalStatus,
} from "@/lib/admin-ops-ai/contracts";
import type { OpsAiActionProposal } from "@/lib/admin-ops-ai/types";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { hapticError, hapticMedium, hapticSuccess } from "@/lib/native/haptics";
import { cn } from "@/lib/utils";

type SupportedProposal = OpsAiActionProposalV2 | OpsAiActionProposal;

interface ActionProposalCardProps {
  proposal: SupportedProposal;
  chatId?: string;
  disabled?: boolean;
  onExecutionChange?: (pending: boolean) => boolean;
  onExecuted?: (proposalId: string, result: unknown, grantUntil?: number) => void;
}

export interface ProposalSummaryItem {
  label: string;
  value: string;
}

export interface ProposalRawJsonBlock {
  label: string;
  json: string;
}

export interface ParsedProposalPreview {
  summaryItems: ProposalSummaryItem[];
  rawJsonBlocks: ProposalRawJsonBlock[];
}

const KNOWN_FIELD_LABELS: Record<string, string> = {
  title: "Judul",
  judul: "Judul",
  name: "Nama",
  nama: "Nama",
  slug: "Tautan",
  category: "Kategori",
  kategori: "Kategori",
  status: "Status",
  mode: "Mode",
  description: "Deskripsi",
  deskripsi: "Deskripsi",
  excerpt: "Ringkasan",
  summary: "Ringkasan",
  questions: "Pertanyaan",
  fields: "Kolom",
  items: "Item",
  chapters: "Bab",
  materials: "Materi",
  courseIds: "Mata kuliah",
  courseId: "Mata kuliah",
  courseSlug: "Mata kuliah",
  chapterId: "Bab",
  chapterSlug: "Bab",
  tags: "Tag",
  acceptingResponses: "Terima respons",
  collectEmail: "Kumpulkan email",
  showProgressBar: "Indikator progres",
  customSuccessMessage: "Pesan selesai",
  requireLogin: "Wajib masuk",
  isPublished: "Publikasi",
  published: "Publikasi",
  isActive: "Aktif",
  active: "Aktif",
  capacity: "Kapasitas",
  maxResponses: "Batas respons",
  target: "Target",
  resolvedTarget: "Target",
  operation: "Operasi",
  type: "Tipe",
  id: "ID",
  formId: "ID formulir",
  postId: "ID artikel",
  Environment: "Lingkungan",
  environment: "Lingkungan",
};

const KNOWN_VALUE_LABELS: Record<string, string> = {
  none: "Tidak ada",
  required: "Wajib",
  optional: "Opsional",
  verified: "Terverifikasi",
  feedback: "Masukan",
  registration: "Pendaftaran",
  survey: "Survei",
  quiz: "Kuis",
  draft: "Draf",
  published: "Dipublikasikan",
  archived: "Diarsipkan",
  active: "Aktif",
  inactive: "Nonaktif",
  open: "Terbuka",
  closed: "Ditutup",
  public: "Publik",
  private: "Privat",
  student: "Siswa",
  tutor: "Tutor",
  admin: "Admin",
  staging: "Staging",
  production: "Produksi",
};

const ARRAY_UNIT_LABELS: Record<string, string> = {
  questions: "pertanyaan",
  chapters: "bab",
  materials: "materi",
  courseIds: "mata kuliah",
  courses: "mata kuliah",
  fields: "kolom",
};

const PRIORITY_KEYS = [
  "title",
  "judul",
  "name",
  "nama",
  "category",
  "kategori",
  "questions",
  "fields",
  "slug",
  "status",
  "mode",
  "acceptingResponses",
  "collectEmail",
  "showProgressBar",
  "published",
  "isPublished",
  "active",
  "isActive",
  "capacity",
  "description",
  "deskripsi",
  "excerpt",
  "customSuccessMessage",
];

const UNWRAP_OBJECT_KEYS = new Set([
  "settings",
  "data",
  "patch",
  "input",
  "payload",
  "resolvedTarget",
]);

function humanizeKey(key: string): string {
  if (KNOWN_FIELD_LABELS[key]) return KNOWN_FIELD_LABELS[key];
  const trimmed = key.trim();
  if (trimmed.includes(" ")) return trimmed;
  const spaced = trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function formatReadableValue(value: unknown, key?: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const compact = value.replace(/\s+/g, " ").trim();
    if (!compact) return null;
    const lowered = compact.toLowerCase();
    if (KNOWN_VALUE_LABELS[lowered]) return KNOWN_VALUE_LABELS[lowered];
    if (key === "Environment" || key === "environment") {
      if (lowered.startsWith("staging")) return "Staging";
      if (lowered.startsWith("production")) return "Produksi";
    }
    return compact.length > 140 ? `${compact.slice(0, 137)}...` : compact;
  }
  if (Array.isArray(value)) {
    if (key === "tags" && value.every((item) => typeof item === "string")) {
      const joined = (value as string[]).map((s) => s.trim()).filter(Boolean).join(", ");
      if (joined) return joined.length > 80 ? `${joined.slice(0, 77)}...` : joined;
    }
    const unit = (key && ARRAY_UNIT_LABELS[key]) || "item";
    return `${value.length} ${unit}`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== undefined && v !== ""
    );
    if (entries.length === 0) return null;
    return `${entries.length} kolom`;
  }
  return String(value);
}

function tryParseJsonValue(raw: string): unknown | undefined {
  const trimmed = raw.trim();
  if (
    (!trimmed.startsWith("{") || !trimmed.endsWith("}")) &&
    (!trimmed.startsWith("[") || !trimmed.endsWith("]"))
  ) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function extractEntriesFromJsonObject(
  obj: Record<string, unknown>,
  maxItems = 8,
): ProposalSummaryItem[] {
  const flatEntries: Array<{ key: string; value: unknown }> = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (
      UNWRAP_OBJECT_KEYS.has(key) &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        if (nestedValue === null || nestedValue === undefined) continue;
        flatEntries.push({ key: nestedKey, value: nestedValue });
      }
    } else {
      flatEntries.push({ key, value });
    }
  }

  flatEntries.sort((a, b) => {
    const idxA = PRIORITY_KEYS.indexOf(a.key);
    const idxB = PRIORITY_KEYS.indexOf(b.key);
    if (idxA >= 0 && idxB >= 0) return idxA - idxB;
    if (idxA >= 0) return -1;
    if (idxB >= 0) return 1;
    return 0;
  });

  const seenLabels = new Set<string>();
  const items: ProposalSummaryItem[] = [];
  for (const entry of flatEntries) {
    if (items.length >= maxItems) break;
    const formatted = formatReadableValue(entry.value, entry.key);
    if (!formatted) continue;
    const label = humanizeKey(entry.key);
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);
    items.push({ label, value: formatted });
  }
  return items;
}

export function extractReadableProposalSummary(
  fields: Array<{ label: string; value: string }>,
): ParsedProposalPreview {
  const summaryItems: ProposalSummaryItem[] = [];
  const rawJsonBlocks: ProposalRawJsonBlock[] = [];

  for (const field of fields) {
    const parsed = tryParseJsonValue(field.value);
    if (parsed !== undefined && typeof parsed === "object" && parsed !== null) {
      const prettyJson = JSON.stringify(parsed, null, 2);
      rawJsonBlocks.push({ label: field.label, json: prettyJson });

      if (Array.isArray(parsed)) {
        summaryItems.push({ label: humanizeKey(field.label), value: `${parsed.length} item` });
      } else {
        const extracted = extractEntriesFromJsonObject(parsed as Record<string, unknown>);
        if (extracted.length > 0) {
          summaryItems.push(...extracted);
        }
      }
    } else {
      const formatted = formatReadableValue(field.value, field.label);
      if (formatted) {
        summaryItems.push({ label: humanizeKey(field.label), value: formatted });
      }
    }
  }

  return { summaryItems, rawJsonBlocks };
}

function getProposalStatusBadge(status: OpsAiProposalStatus | string) {
  switch (status) {
    case "pending":
      return {
        label: "Menunggu Konfirmasi",
        badgeClass: "bg-status-warning/15 text-status-warning border-status-warning/30",
        icon: <Clock className="size-3.5" />,
      };
    case "executing":
      return {
        label: "Mengeksekusi...",
        badgeClass: "bg-primary/10 text-primary border-primary/30",
        icon: <Loader2 className="size-3.5 animate-spin" />,
      };
    case "job-pending":
      return {
        label: "Job diproses",
        badgeClass: "bg-muted text-muted-foreground border-border/60",
        icon: <Clock className="size-3.5" />,
      };
    case "job-attention":
      return {
        label: "Periksa job",
        badgeClass: "bg-status-warning/15 text-status-warning border-status-warning/30",
        icon: <AlertCircle className="size-3.5" />,
      };
    case "executed":
      return {
        label: "Selesai",
        badgeClass: "bg-status-success/15 text-status-success border-status-success/30",
        icon: <CheckCircle2 className="size-3.5" />,
      };
    case "failed":
      return {
        label: "Gagal",
        badgeClass: "bg-destructive/15 text-destructive border-destructive/30",
        icon: <AlertCircle className="size-3.5" />,
      };
    case "cancelled":
      return {
        label: "Dibatalkan",
        badgeClass: "bg-muted text-muted-foreground border-border/60",
        icon: <XCircle className="size-3.5" />,
      };
    case "expired":
      return {
        label: "Kedaluwarsa",
        badgeClass: "bg-muted text-muted-foreground border-border/60",
        icon: <Clock className="size-3.5" />,
      };
    default:
      return {
        label: status,
        badgeClass: "bg-muted text-muted-foreground border-border/60",
        icon: <Clock className="size-3.5" />,
      };
  }
}

export function ActionProposalCard({
  proposal: initialProposal,
  chatId,
  disabled,
  onExecuted,
  onExecutionChange,
}: ActionProposalCardProps) {
  const [status, setStatus] = useState<string>(initialProposal.status);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const [submittedChoice, setSubmittedChoice] = useState<"once" | "chat" | null>(null);
  const approval = "approval" in initialProposal ? initialProposal.approval : undefined;
  const expiresAt = "expiresAt" in initialProposal ? initialProposal.expiresAt : undefined;
  const [expired, setExpired] = useState(() => Boolean(expiresAt && expiresAt <= Date.now()));
  const [canCheckResult, setCanCheckResult] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  useEffect(() => {
    if (!expiresAt || expired) return;
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt, expired]);
  const [executionResult, setExecutionResult] = useState<Record<string, unknown> | null>(() => {
    if ("result" in initialProposal && initialProposal.result) {
      return initialProposal.result as Record<string, unknown>;
    }
    return null;
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    if ("error" in initialProposal && initialProposal.error) {
      return initialProposal.error;
    }
    return null;
  });
  const [tokenCopied, setTokenCopied] = useState(false);

  // Extract preview fields from either v2 preview or v1 params
  const previewFields: Array<{ label: string; value: string }> = [];
  if ("preview" in initialProposal && initialProposal.preview?.fields) {
    previewFields.push(...initialProposal.preview.fields);
  } else if ("params" in initialProposal && initialProposal.params) {
    for (const [key, val] of Object.entries(initialProposal.params)) {
      previewFields.push({
        label: key,
        value: Array.isArray(val) ? val.join(", ") : String(val),
      });
    }
  }

  const { summaryItems, rawJsonBlocks } = extractReadableProposalSummary(previewFields);

  const handleCopyJson = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard || rawJsonBlocks.length === 0) return;
    const combined = rawJsonBlocks
      .map((block) => (rawJsonBlocks.length > 1 ? `// ${block.label}\n${block.json}` : block.json))
      .join("\n\n");
    navigator.clipboard.writeText(combined);
    setJsonCopied(true);
    setTimeout(() => setJsonCopied(false), 2000);
    toast.success("Detail JSON berhasil disalin.");
  };

  const handleExecute = async (choice: "once" | "chat") => {
    if (inFlight.current || disabled || (approval && !chatId)) return;
    if (onExecutionChange?.(true) === false) return;
    void hapticMedium();
    inFlight.current = true;
    setSubmittedChoice(choice);
    setCanCheckResult(false);
    setLoading(true);
    setStatus("executing");
    setErrorMessage(null);

    try {
      // Strictly call execute with only { proposalId } to prevent parameter tampering
      const res = await fetch("/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: initialProposal.id, ...(approval ? { choice, chatId } : {}) }),
      });

      const data = await res.json();
      if (!res.ok) {
        void hapticError();
        setCanCheckResult(data.retryable === true);
        setStatus("failed");
        setErrorMessage(data.error || "Aksi gagal diproses.");
        return;
      }

      setStatus("executed");
      const resObj = (data.result && typeof data.result === "object") ? data.result : { message: "Aksi berhasil dieksekusi." };
      setExecutionResult(resObj);
      void hapticSuccess();
      if (!resObj.jobId) toast.success("Aksi berhasil dieksekusi.");
      onExecuted?.(initialProposal.id, resObj, typeof data.grantUntil === "number" ? data.grantUntil : undefined);
    } catch {
      void hapticError();
      setStatus("failed");
      setCanCheckResult(true);
      setErrorMessage("Hasil aksi belum terverifikasi. Coba lagi dengan izin yang sama.");
    } finally {
      inFlight.current = false;
      onExecutionChange?.(false);
      setLoading(false);
    }
  };

  const handleCopyToken = (token: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
      toast.success("Token berhasil disalin ke papan klip.");
    }
  };

  const jobState = executionResult?.jobState;
  const jobBadge = jobState === "pending" ? "job-pending" : jobState === "attention" ? "job-attention" : undefined;
  const badge = getProposalStatusBadge(status === "executed" && jobBadge ? jobBadge : status === "pending" && expired ? "expired" : status);
  const isPending = status === "pending";
  const isExecuted = status === "executed";
  const isFailed = status === "failed";


  const tokenString = executionResult?.token ? String(executionResult.token) : null;
  const messageString = executionResult?.message
    ? String(executionResult.message)
    : "Proposal berhasil dieksekusi.";

  const showActionButtons =
    (isPending && !expired) || loading || (isFailed && canCheckResult && submittedChoice);

  return (
    <div className="rounded-xl border border-border/80 bg-card/50 px-3 py-2.5 space-y-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 sm:gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-heading text-body-sm font-bold text-foreground leading-snug break-words">
            {initialProposal.title}
          </h4>
          {initialProposal.description && (
            <p className="mt-0.5 text-body-xs text-muted-foreground leading-relaxed">
              {initialProposal.description}
            </p>
          )}
        </div>

        <span
          className={cn(
            "self-start inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-body-xs font-medium shrink-0",
            badge.badgeClass
          )}
        >
          {badge.icon}
          <span>{badge.label}</span>
        </span>
      </div>

      {/* Flat Human-Readable Summary Rows (no nested card wrapper) */}
      {summaryItems.length > 0 && (
        <dl className="divide-y divide-border/50 border-t border-border/50 pt-0.5">
          {summaryItems.map((field, idx) => (
            <div
              key={`${field.label}-${idx}`}
              className="flex items-baseline justify-between gap-3 py-1.5 min-w-0"
            >
              <dt className="text-body-xs text-muted-foreground shrink-0">
                {field.label}
              </dt>
              <dd className="text-body-xs font-medium text-foreground text-right wrap-anywhere min-w-0">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* Execution Result Row */}
      {isExecuted && (
        <div className={cn("border-t border-border/50 pt-2 text-body-xs space-y-1.5", jobBadge ? "text-foreground" : "text-status-success")}>
          <div className="flex items-center gap-1.5 font-medium">
            {jobBadge ? badge.icon : <CheckCircle2 className="size-3.5 shrink-0" />}
            <span>{messageString}</span>
          </div>

          {tokenString && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/80 px-2.5 py-1.5">
              <div className="min-w-0">
                <span className="text-body-2xs uppercase font-semibold text-muted-foreground block">
                  Token dibuat
                </span>
                <span className="font-mono text-body-xs font-bold text-foreground select-all break-all block">
                  {tokenString}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyToken(tokenString)}
                aria-label="Salin token aktivasi"
                className="inline-flex size-7 items-center justify-center rounded-md border border-border/60 bg-muted hover:bg-muted/80 text-foreground transition-colors shrink-0 cursor-pointer"
              >
                {tokenCopied ? (
                  <Check className="size-3.5 text-status-success" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error Row */}
      {isFailed && errorMessage && (
        <div className="flex items-start gap-1.5 border-t border-border/50 pt-2 text-body-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Contextual guidance */}
      {isPending && !expired && !approval && (
        <p className="text-body-xs text-muted-foreground">Izinkan aksi ini sekali?</p>
      )}
      {isPending && expired && (
        <p className="text-body-xs text-muted-foreground">Minta Ops AI menyiapkan aksi lagi.</p>
      )}
      {approval === "chat" && isPending && !expired && (
        <p className="text-body-xs text-muted-foreground">Izin chat berlaku untuk target yang sama selama 10 menit.</p>
      )}

      {/* Compact Footer Row: Technical Details Toggle + Approval Controls */}
      {(rawJsonBlocks.length > 0 || showActionButtons) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2">
          {rawJsonBlocks.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowRawJson((prev) => !prev)}
                aria-expanded={showRawJson}
                className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-body-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {showRawJson ? (
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                ) : (
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                )}
                <span>Detail teknis</span>
              </button>

              {showRawJson && (
                <button
                  type="button"
                  onClick={handleCopyJson}
                  aria-label="Salin detail JSON"
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-body-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors cursor-pointer"
                >
                  {jsonCopied ? (
                    <>
                      <Check className="size-3 text-status-success" aria-hidden="true" />
                      <span>Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" aria-hidden="true" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <span />
          )}

          {showActionButtons && (
            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              {approval === "chat" && isPending && (
                <Button type="button" variant="outline" size="sm" disabled={disabled || !chatId} onClick={() => void handleExecute("chat")}>
                  Izinkan di chat
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={disabled || loading || Boolean(approval && !chatId)}
                onClick={() => void handleExecute(submittedChoice ?? "once")}
                aria-label={approval || isFailed ? undefined : "Konfirmasi dan eksekusi aksi"}
              >
                {loading ? <><Loader2 className="animate-spin" aria-hidden="true" />Memproses</> : isFailed ? "Coba lagi" : "Izinkan"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Collapsible Raw JSON Payload */}
      {showRawJson && rawJsonBlocks.length > 0 && (
        <div className="space-y-1.5 pt-0.5">
          {rawJsonBlocks.map((block, idx) => (
            <div key={`${block.label}-${idx}`} className="space-y-1">
              {rawJsonBlocks.length > 1 && (
                <span className="block text-body-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {block.label}
                </span>
              )}
              <pre
                tabIndex={0}
                className="max-h-48 overflow-auto rounded-md border border-border/60 bg-background p-2 font-mono text-body-xs text-foreground whitespace-pre-wrap wrap-anywhere"
              >
                {block.json}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
