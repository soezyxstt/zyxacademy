"use client";

import * as React from "react";
import { Check, ClipboardList, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ProposalRole = "tutor" | "admin";
type Proposal = {
  id: string;
  proposalType: string;
  courseId: string | null;
  status: string;
  preconditionVersion: number;
  diffHash: string;
  createdAt: string;
  operations: unknown[];
};

const tutorType = "misconception_brief";
const adminType = "course_readiness";

export function ZyraProposalPanel({ courseId, role }: { courseId?: string | null; role: ProposalRole }) {
  const [proposals, setProposals] = React.useState<Proposal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const query = courseId ? `?courseId=${encodeURIComponent(courseId)}` : "";
      const response = await fetch(`/api/zyra/proposals${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("PROPOSAL_LOAD_FAILED");
      const body = await response.json() as { proposals?: Proposal[] };
      setProposals(body.proposals ?? []);
      setError(null);
    } catch {
      setError("Proposal belum tersedia.");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  React.useEffect(() => { void load(); }, [load]);

  const createProposal = async () => {
    setBusy(true);
    try {
      const proposalType = role === "admin" ? adminType : tutorType;
      const response = await fetch("/api/zyra/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalType,
          courseId: courseId ?? null,
          scope: courseId ? { courseId } : {},
          evidenceRefs: [courseId ? `course:${courseId}` : "ops:current"],
          preconditionSnapshot: { version: 1 },
          operations: [{ kind: "read_only_report", reportKey: role === "admin" ? "course_readiness" : "misconception_brief" }],
          learnerImpact: { audience: courseId ? "single_course" : "none", summary: "Tidak ada perubahan yang diterapkan." },
          reversibility: { reversible: true, rollback: "Tidak ada mutasi; proposal dapat ditolak atau kedaluwarsa." },
          warnings: ["Hasil ini adalah proposal dan memerlukan review manusia."],
          rationale: role === "admin" ? "Tinjau kesiapan course secara terstruktur." : "Tinjau pola miskonsepsi secara terstruktur.",
        }),
      });
      if (!response.ok) throw new Error("PROPOSAL_CREATE_FAILED");
      await load();
    } catch {
      setError("Proposal tidak dapat dibuat.");
    } finally {
      setBusy(false);
    }
  };

  const transition = async (proposal: Proposal, action: "review" | "confirm") => {
    setBusy(true);
    try {
      const response = await fetch(`/api/zyra/proposals/${encodeURIComponent(proposal.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, preconditionVersion: proposal.preconditionVersion }),
      });
      if (!response.ok) throw new Error("PROPOSAL_TRANSITION_FAILED");
      await load();
    } catch {
      setError("Status proposal tidak dapat diubah. Periksa review dan versi data.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-xl border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-h6 font-heading">
          <ClipboardList className="size-5 text-brand-primary" aria-hidden="true" />
          Zyra proposal
        </CardTitle>
        <Button type="button" size="sm" onClick={() => void createProposal()} disabled={busy || !courseId && role !== "admin"}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Buat proposal"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-body-sm text-muted-foreground">
          Zyra hanya menyusun ringkasan dan proposal bertipe. Tidak ada perubahan data yang dijalankan otomatis.
        </p>
        {error && <p className="text-body-sm text-status-error" role="status">{error}</p>}
        {loading ? (
          <p className="text-body-sm text-muted-foreground">Memuat proposal...</p>
        ) : proposals.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">Belum ada proposal untuk scope ini.</p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {proposals.map((proposal) => (
              <div key={proposal.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="space-y-1">
                  <p className="text-body-sm font-semibold text-foreground">{proposal.proposalType}</p>
                  <p className="font-mono text-body-xs text-muted-foreground">diff {proposal.diffHash.slice(0, 12)} · versi {proposal.preconditionVersion}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-md">{proposal.status}</Badge>
                  {proposal.status === "validated" && role === "admin" && (
                    <Button type="button" size="xs" variant="outline" onClick={() => void transition(proposal, "review")} disabled={busy}>
                      <Check className="size-3.5" /> Review
                    </Button>
                  )}
                  {proposal.status === "reviewed" && (
                    <Button type="button" size="xs" onClick={() => void transition(proposal, "confirm")} disabled={busy}>
                      Konfirmasi
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className={cn("flex items-start gap-2 text-body-xs text-muted-foreground")}>
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Konfirmasi hanya menyiapkan handoff; mutation service dan audit final tetap wajib tersedia.
        </p>
      </CardContent>
    </Card>
  );
}
