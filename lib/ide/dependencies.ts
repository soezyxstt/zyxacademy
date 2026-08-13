import {
  ideaRelationGraphSchema,
  type DependencyFreshness,
  type IdeaRelation,
  type ProductDependency,
  transitionDependencyFreshness as transitionContractFreshness,
} from "@/lib/ide/contracts";

export type DependencyChange =
  | { type: "upstream_hash_changed"; upstreamHash: string; upstreamVersion: number }
  | { type: "upstream_withdrawn"; reason?: string }
  | { type: "downstream_revalidated"; upstreamAvailable: boolean; validationPassed: boolean; downstreamHash?: string };

export function transitionDependencyFreshness(
  current: DependencyFreshness,
  change: DependencyChange,
): DependencyFreshness {
  return transitionContractFreshness(current, {
    type: change.type,
    upstreamAvailable: "upstreamAvailable" in change ? change.upstreamAvailable : undefined,
    validationPassed: "validationPassed" in change ? change.validationPassed : undefined,
  });
}

export function applyDependencyChange(
  dependencies: readonly ProductDependency[],
  upstream: Pick<ProductDependency, "upstreamEntityType" | "upstreamEntityId">,
  change: DependencyChange,
): ProductDependency[] {
  return dependencies.map((dependency) => {
    if (
      dependency.upstreamEntityType !== upstream.upstreamEntityType ||
      dependency.upstreamEntityId !== upstream.upstreamEntityId
    ) {
      return dependency;
    }

    const freshness = transitionDependencyFreshness(dependency.freshness, change);
    return {
      ...dependency,
      upstreamVersion: change.type === "upstream_hash_changed" ? change.upstreamVersion : dependency.upstreamVersion,
      upstreamHash: change.type === "upstream_hash_changed" ? change.upstreamHash : dependency.upstreamHash,
      downstreamHash:
        change.type === "downstream_revalidated" && change.downstreamHash
          ? change.downstreamHash
          : dependency.downstreamHash,
      freshness,
      reason:
        change.type === "upstream_withdrawn"
          ? change.reason ?? "Upstream source withdrawn"
          : change.type === "upstream_hash_changed"
            ? "Upstream hash changed; downstream validation is required"
            : freshness === "UP_TO_DATE"
              ? undefined
              : dependency.reason,
    };
  });
}

export function assertNoPrerequisiteCycle(relations: readonly IdeaRelation[]): void {
  ideaRelationGraphSchema.parse(relations);
}
