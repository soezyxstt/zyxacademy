import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { isQueryAccountCurrent } from "@/lib/query/client";
import { ApiError, requestJson } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";

// Cache only fields this list displays or sends as revision preconditions.
// The full server contract also imports node:crypto and stays server-side.
export const proposalSummarySchema = z.object({
  id: z.string().min(1),
  proposalType: z.string().min(1),
  courseId: z.string().nullable(),
  status: z.enum(["draft", "validated", "reviewed", "confirmed", "applied", "rejected", "expired", "failed"]),
  preconditionVersion: z.number().int().positive(),
  diffHash: z.string().regex(/^[a-f0-9]{64}$/i),
  createdAt: z.iso.datetime({ offset: true }),
});
export type ProposalSummary = z.infer<typeof proposalSummarySchema>;
export type ProposalRole = "tutor" | "admin";
export type ProposalTransition = { proposal: Pick<ProposalSummary, "id" | "preconditionVersion">; action: "review" | "confirm" };
const proposalListSchema = z.object({ proposals: z.array(proposalSummarySchema) });

export function zyraProposalsQuery(userId: string, courseId?: string | null) {
  const scope = courseId || undefined;
  return queryOptions({
    queryKey: queryKeys.zyra.proposals(userId, scope),
    queryFn: ({ signal }) => requestJson(`/api/zyra/proposals${scope ? `?${new URLSearchParams({ courseId: scope })}` : ""}`, proposalListSchema, { signal }),
    enabled: !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function createZyraProposalReport(role: ProposalRole, courseId?: string | null) {
  return requestJson("/api/zyra/proposals", z.object({ proposal: proposalSummarySchema }), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proposalType: role === "admin" ? "course_readiness" : "misconception_brief",
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
}

export function transitionZyraProposal({ proposal, action }: ProposalTransition) {
  return requestJson(`/api/zyra/proposals/${encodeURIComponent(proposal.id)}`, z.object({ proposal: proposalSummarySchema.nullable() }), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, preconditionVersion: proposal.preconditionVersion }),
  });
}

function invalidateProposals(client: QueryClient, userId: string) {
  if (!isQueryAccountCurrent(client, userId)) return;
  return client.invalidateQueries({ queryKey: queryKeys.zyra.proposalsAll(userId) });
}

export function createZyraProposalMutation(client: QueryClient, userId: string, role: ProposalRole, courseId?: string | null) {
  return mutationOptions({
    mutationKey: [...queryKeys.zyra.proposalsAll(userId), "create"],
    retry: false,
    networkMode: "always",
    mutationFn: () => {
      if (!userId || !isQueryAccountCurrent(client, userId)) throw new ApiError(409, "Account changed");
      return createZyraProposalReport(role, courseId);
    },
    // A failed response can follow a committed write. Re-read, never replay it.
    onSettled: () => invalidateProposals(client, userId),
  });
}

export function transitionZyraProposalMutation(client: QueryClient, userId: string) {
  return mutationOptions({
    mutationKey: [...queryKeys.zyra.proposalsAll(userId), "transition"],
    retry: false,
    networkMode: "always",
    mutationFn: (input: ProposalTransition) => {
      if (!userId || !isQueryAccountCurrent(client, userId)) throw new ApiError(409, "Account changed");
      return transitionZyraProposal(input);
    },
    onSettled: () => invalidateProposals(client, userId),
  });
}
