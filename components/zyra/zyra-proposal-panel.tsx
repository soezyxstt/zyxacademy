"use client";

import { useTranslations } from "@/lib/i18n/client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardList, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useQueryAccountId } from "@/hooks/use-query-account";
import { createZyraProposalMutation, transitionZyraProposalMutation, zyraProposalsQuery, type ProposalRole, type ProposalSummary } from "@/lib/zyra/proposals-query";

export function ZyraProposalPanel({ courseId, role }: { courseId?: string | null; role: ProposalRole }) {
  const userId = useQueryAccountId();
  return <AccountProposalPanel key={`${userId ?? "anonymous"}:${courseId ?? ""}`} userId={userId} courseId={courseId} role={role} />;
}

function AccountProposalPanel({ userId, courseId, role }: { userId?: string; courseId?: string | null; role: ProposalRole }) {
  const tr = useTranslations("zyra.proposalPanel");
  const client = useQueryClient();
  const query = useQuery(zyraProposalsQuery(userId ?? "", courseId));
  const createMutation = useMutation(createZyraProposalMutation(client, userId ?? "", role, courseId));
  const transitionMutation = useMutation(transitionZyraProposalMutation(client, userId ?? ""));
  const proposals = query.data?.proposals ?? [];
  const loading = query.isPending;
  const busy = !userId || createMutation.isPending || transitionMutation.isPending;
  const error = createMutation.isError ? tr("createFailed")
    : transitionMutation.isError ? tr("transitionFailed")
      : query.isError ? tr("unavailable") : null;

  const createProposal = () => {
    if (busy) return;
    transitionMutation.reset();
    createMutation.mutate();
  };

  const transition = (proposal: ProposalSummary, action: "review" | "confirm") => {
    if (busy) return;
    createMutation.reset();
    transitionMutation.mutate({ proposal, action });
  };

  return (
    <Card className="rounded-xl border-border">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-body-base font-heading">
          <ClipboardList className="size-5 text-brand-primary" aria-hidden="true" />
          {tr("title")}
        </CardTitle>
        <Button type="button" size="sm" onClick={() => void createProposal()} disabled={busy || !courseId && role !== "admin"}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : tr("create")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-body-sm text-muted-foreground">
          {tr("summary")}
        </p>
        {error && <p className="text-body-sm text-status-error" role="status">{error}</p>}
        {loading ? (
          <p className="text-body-sm text-muted-foreground">{tr("loading")}</p>
        ) : proposals.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{tr("none")}</p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {proposals.map((proposal) => (
              <div key={proposal.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="space-y-1">
                  <p className="text-body-sm font-semibold text-foreground">{proposal.proposalType}</p>
                  <p className="font-mono text-body-xs text-muted-foreground">{tr("revision", { hash: proposal.diffHash.slice(0, 12), version: proposal.preconditionVersion })}</p>
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
                      {tr("confirm")}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className={cn("flex items-start gap-2 text-body-xs text-muted-foreground")}>
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {tr("handoff")}
        </p>
      </CardContent>
    </Card>
  );
}
