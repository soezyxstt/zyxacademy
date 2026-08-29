"use client";

import { useState } from "react";
import { type OpsAiActionProposal } from "@/lib/admin-ops-ai/types";
import { Check, Loader2, AlertCircle, Play, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/toast";

interface ActionProposalCardProps {
  proposal: OpsAiActionProposal;
  onExecuted?: (proposalId: string, result: Record<string, unknown>) => void;
}

export function ActionProposalCard({ proposal: initialProposal, onExecuted }: ActionProposalCardProps) {
  const [proposal, setProposal] = useState<OpsAiActionProposal>(initialProposal);
  const [loading, setLoading] = useState(false);

  const handleExecute = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ops-ai/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Eksekusi proposal gagal");
      }

      const updated: OpsAiActionProposal = {
        ...proposal,
        status: "executed",
        result: data.result,
      };
      setProposal(updated);
      toast.success("Aksi berhasil dieksekusi.");
      onExecuted?.(proposal.id, data.result);
    } catch (err: any) {
      setProposal((prev) => ({
        ...prev,
        status: "failed",
        error: err.message,
      }));
      toast.error(err.message || "Gagal mengeksekusi aksi.");
    } finally {
      setLoading(false);
    }
  };

  const isExecuted = proposal.status === "executed";
  const isFailed = proposal.status === "failed";

  return (
    <div className="my-3 rounded-lg border border-border/80 bg-card p-3 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[10px] font-semibold tracking-wider text-primary uppercase">
            Proposal Aksi Admin
          </span>
          <h4 className="text-body-sm font-semibold text-foreground">{proposal.title}</h4>
        </div>
        {isExecuted && (
          <span className="inline-flex items-center gap-1 rounded-md bg-status-success/15 px-2 py-0.5 text-body-xs font-medium text-status-success">
            <CheckCircle2 className="size-3.5" />
            Selesai
          </span>
        )}
      </div>

      <p className="mt-1 text-body-xs text-muted-foreground">{proposal.description}</p>

      {/* Parameters Preview */}
      <div className="mt-2 rounded-md bg-muted/50 p-2 font-mono text-[11px] text-muted-foreground">
        {Object.entries(proposal.params).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="font-semibold text-foreground/80">{k}:</span>
            <span className="truncate">{Array.isArray(v) ? v.join(", ") : String(v)}</span>
          </div>
        ))}
      </div>

      {/* Execution Result */}
      {isExecuted && proposal.result && (
        <div className="mt-2 rounded-md border border-status-success/30 bg-status-success/10 p-2 text-body-xs text-status-success">
          <p className="font-medium">{String(proposal.result.message || "Berhasil dieksekusi")}</p>
          {proposal.result.token ? (
            <p className="mt-1 font-mono font-bold text-foreground select-all">
              Token: {String(proposal.result.token)}
            </p>
          ) : null}
        </div>
      )}

      {/* Error Output */}
      {isFailed && proposal.error && (
        <div className="mt-2 flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-body-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{proposal.error}</span>
        </div>
      )}

      {/* Action Trigger */}
      {!isExecuted && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleExecute}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-body-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Mengeksekusi...
              </>
            ) : (
              <>
                <Play className="size-4" />
                Konfirmasi dan Eksekusi
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

