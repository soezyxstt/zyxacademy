import {
  getProjectAliases, isTextProfile, TEXT_PROFILES,
  MODEL_REGISTRY,
  type ModelId,
  type ModelRouteClass
} from "../../../../lib/ai/provider/model-registry";

export const PROJECT_ALIASES = getProjectAliases();

export type WorkerModelContract = {
  id: ModelId;
  routeClasses: readonly ModelRouteClass[];
  ordinaryRoutingAllowed: boolean;
  perProjectRpm: number;
  perProjectRpd: number;
  initialUsableRpd: number;
};

export const WORKER_MODEL_CONTRACT: Readonly<Record<ModelId, WorkerModelContract>> = Object.freeze(
  Object.fromEntries(
    Object.values(MODEL_REGISTRY).map((entry) => [
      entry.id,
      {
        id: entry.id,
        routeClasses: entry.routeClasses,
        ordinaryRoutingAllowed: entry.ordinaryRoutingAllowed,
        perProjectRpm: entry.limits.perProjectRpm,
        perProjectRpd: entry.limits.perProjectRpd,
        initialUsableRpd: entry.limits.initialUsableRpd
      }
    ])
  ) as Record<ModelId, WorkerModelContract>
);

export function getWorkerModelContract(modelId: string): WorkerModelContract | undefined {
  return WORKER_MODEL_CONTRACT[modelId as ModelId];
}

export function projectDailyCeiling(model: WorkerModelContract): number {
  if (isTextProfile(model.id)) return model.initialUsableRpd;
  if (model.initialUsableRpd <= 0) return 0;
  return Math.min(model.perProjectRpd, Math.floor(model.initialUsableRpd / PROJECT_ALIASES.length));
}

export function textQuotaGroup(id: ModelId) {
  return isTextProfile(id) ? TEXT_PROFILES[id].group : undefined;
}
