import {
  getProjectAliases, isTextProfile, getTextProfile,
  MODEL_REGISTRY, getModelEntry,
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
  providerManaged?: boolean;
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
        initialUsableRpd: entry.limits.initialUsableRpd,
        providerManaged: entry.limits.providerManaged,
      }
    ])
  ) as Record<ModelId, WorkerModelContract>
);

export function getWorkerModelContract(modelId: string): WorkerModelContract | undefined {
  if (WORKER_MODEL_CONTRACT[modelId as ModelId]) return WORKER_MODEL_CONTRACT[modelId as ModelId];
  try {
    const entry = getModelEntry(modelId);
    return { id: entry.id, routeClasses: entry.routeClasses, ordinaryRoutingAllowed: entry.ordinaryRoutingAllowed,
      perProjectRpm: entry.limits.perProjectRpm, perProjectRpd: entry.limits.perProjectRpd, initialUsableRpd: entry.limits.initialUsableRpd, providerManaged: entry.limits.providerManaged };
  } catch { return undefined; }
}

export function projectDailyCeiling(model: WorkerModelContract): number | null {
  if (model.providerManaged) return null;
  if (model.initialUsableRpd <= 0) return 0;
  return Math.min(model.perProjectRpd, Math.floor(model.initialUsableRpd / PROJECT_ALIASES.length));
}

export function textQuotaGroup(id: ModelId) {
  return isTextProfile(id) ? getTextProfile(id)!.group : undefined;
}
