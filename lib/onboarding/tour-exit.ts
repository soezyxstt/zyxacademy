import type { TourMutationResult, TourWriteAction } from "./tour-state";

/** Never let a delayed response retarget Exit to a run started by another tab. */
export function resolveTourExitGeneration(
  dismissedGeneration: number,
  pending: Pick<TourWriteAction, "action" | "generation"> | null,
  receipt: TourMutationResult | undefined,
): number {
  if (!pending || !receipt?.applied) return dismissedGeneration;
  const expected = pending.action === "restart" ? pending.generation + 1
    : pending.action === "start" ? Math.max(1, pending.generation) : dismissedGeneration;
  return receipt.state?.generation === expected ? expected : dismissedGeneration;
}
