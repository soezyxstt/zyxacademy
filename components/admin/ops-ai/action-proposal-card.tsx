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
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type SupportedProposal = OpsAiActionProposalV2 | OpsAiActionProposal;

interface ActionProposalCardProps {
  proposal: SupportedProposal;
  chatId?: string;
  disabled?: boolean;
  onExecuted?: (proposalId: string, result: unknown, grantUntil?: number) => void;
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
}: ActionProposalCardProps) {
  const [status, setStatus] = useState<string>(initialProposal.status);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const [submittedChoice, setSubmittedChoice] = useState<"once" | "chat" | null>(null);
  const approval = "approval" in initialProposal ? initialProposal.approval : undefined;
  const expiresAt = "expiresAt" in initialProposal ? initialProposal.expiresAt : undefined;
  const [expired, setExpired] = useState(() => Boolean(expiresAt && expiresAt <= Date.now()));
  const [canCheckResult, setCanCheckResult] = useState(false);
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

  const handleExecute = async (choice: "once" | "chat") => {
    if (inFlight.current || disabled || (approval && !chatId)) return;
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
        setCanCheckResult(data.retryable === true);
        setStatus("failed");
        setErrorMessage(data.error || "Aksi gagal diproses.");
        return;
      }

      setStatus("executed");
      const resObj = (data.result && typeof data.result === "object") ? data.result : { message: "Aksi berhasil dieksekusi." };
      setExecutionResult(resObj);
      toast.success("Aksi berhasil dieksekusi.");
      onExecuted?.(initialProposal.id, resObj, typeof data.grantUntil === "number" ? data.grantUntil : undefined);
    } catch {
      setStatus("failed");
      setCanCheckResult(true);
      setErrorMessage("Hasil aksi belum terverifikasi. Coba lagi dengan izin yang sama.");
    } finally {
      inFlight.current = false;
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

  const badge = getProposalStatusBadge(status === "pending" && expired ? "expired" : status);
  const isPending = status === "pending";
  const isExecuted = status === "executed";
  const isFailed = status === "failed";


  const tokenString = executionResult?.token ? String(executionResult.token) : null;
  const messageString = executionResult?.message
    ? String(executionResult.message)
    : "Proposal berhasil dieksekusi.";

  return (
    <div className="rounded-xl border border-border/70 bg-card/75 backdrop-blur-md p-3.5 shadow-xs space-y-2.5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 sm:gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-heading text-body-sm font-bold text-foreground mt-0.5 leading-snug break-words">
            {initialProposal.title}
          </h4>
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

      {/* Description */}
      {initialProposal.description && (
        <p className="text-body-xs text-muted-foreground leading-relaxed">
          {initialProposal.description}
        </p>
      )}

      {/* Preview Parameters */}
      {previewFields.length > 0 && (
        <dl className="space-y-2">
          {previewFields.map((field, idx) => (
            <div key={idx} className="min-w-0">
              <dt className="text-body-xs text-muted-foreground">{field.label}</dt>
              <dd className={cn("whitespace-pre-wrap wrap-anywhere text-body-sm", field.value.includes("\n") && "max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono")} tabIndex={field.value.includes("\n") ? 0 : undefined}>
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* Execution Result Banner */}
      {isExecuted && (
        <div className="rounded-md border border-status-success/30 bg-status-success/10 p-2.5 text-body-xs text-status-success space-y-1.5">
          <div className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{messageString}</span>
          </div>

          {tokenString && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-background/80 p-2 border border-status-success/20">
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                  Token Dibuat
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

      {/* Error Output Banner */}
      {isFailed && errorMessage && (
        <div className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-body-xs text-destructive">
          <AlertCircle className="size-4 shrink-0 mt-0.2" />
          <span>{errorMessage}</span>
        </div>
      )}

      {isPending && !expired && !approval && (
        <p className="text-body-xs text-muted-foreground">Izinkan aksi ini sekali?</p>
      )}
      {isPending && expired && (
        <p className="text-body-xs text-muted-foreground">Minta Ops AI menyiapkan aksi lagi.</p>
      )}
      {approval === "chat" && isPending && !expired && (
        <p className="text-body-xs text-muted-foreground">Izin chat mencakup aksi ini pada target yang sama selama 10 menit.</p>
      )}
      {((isPending && !expired) || loading || (isFailed && canCheckResult && submittedChoice)) && (
        <div className="flex flex-wrap justify-end gap-2">
          {approval === "chat" && isPending && (
            <Button type="button" variant="outline" size="sm" disabled={disabled || !chatId} onClick={() => void handleExecute("chat")}>
              Allow in chat
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={disabled || loading || Boolean(approval && !chatId)}
            onClick={() => void handleExecute(submittedChoice ?? "once")}
            aria-label={approval || isFailed ? undefined : "Konfirmasi dan eksekusi aksi"}
          >
            {loading ? <><Loader2 className="animate-spin" aria-hidden="true" />Memproses</> : isFailed ? "Coba lagi" : "Allow"}
          </Button>
        </div>
      )}
    </div>
  );
}
