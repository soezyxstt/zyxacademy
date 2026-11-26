export const monitoringPaths = [
  "/admin",
  "/admin/ops/web-analytics",
  "/admin/ops",
  "/admin/ops/analytics",
  "/admin/ops/feature-usage",
  "/admin/ops/tutor-activity",
  "/admin/ops/keys",
  "/admin/ops/models",
  "/admin/ops/offline",
  "/admin/ops/short-links",
] as const;

export type MonitoringPath = (typeof monitoringPaths)[number];
export type MonitoringLocale = "id" | "en";
export type MonitoringRange = 7 | 30 | 90;
export const monitoringRanges = [7, 30, 90] as const;

export type HomeDashboard = {
  failedJobs: number;
  categories: { name: string; items: { title: string; href: string; iconKey: string; stat: string | null }[] }[];
};
export type WebAnalytics = {
  summary: { views: number; sessions: number; activeUsers: number };
  dailyData: { date: string; views: number; sessions: number }[];
  topPages: { path: string; title: string; views: number }[];
};
export type FeatureUsage = {
  rangeDays: MonitoringRange;
  rows: {
    key: FeatureKey; label: string; events: number; previousEvents: number; trendPercent: number | null;
    users: number; adoptionPercent: number; eventsPerUser: number; lastUsedAt: string | null; detailCount?: number;
  }[];
  daily: ({ date: string } & Record<FeatureKey, number>)[];
  totals: { events: number; activeUsers: number; trendPercent: number | null; previousEvents: number; topFeatureKey: FeatureKey | null; topFeatureLabel: string | null; topFeatureSharePercent: number | null };
  insights: {
    fastestGrowing: { key: FeatureKey; trendPercent: number } | null;
    highestAdoption: { key: FeatureKey; adoptionPercent: number } | null;
    needsAttention: { key: FeatureKey; adoptionPercent: number; events: number } | null;
  };
};
export const featureKeys = ["materi", "flashcard", "kuis", "tryout", "kuisLive", "zyra", "diskusi", "tutorial"] as const;
export type FeatureKey = (typeof featureKeys)[number];
export type AiRequest = {
  timestamp: string; operation: string; model: string; viaGateway: boolean; latencyMs: number;
  success: boolean; error?: string;
};
export type AiAnalytics = {
  totalRequests: number; successfulRequests: number; failedRequests: number;
  gatewayRequests: number; directRequests: number; averageLatencyMs: number;
  gatewaySuccessRate: number; directSuccessRate: number; recentLogs: AiRequest[];
};
export type AiUsage = {
  users: { userId: string; name: string | null; email: string | null; requests: number; inputTokens: number; outputTokens: number; totalTokens: number }[];
  daily: { date: string; requests: number; inputTokens: number; outputTokens: number }[];
};
export type OpsMetrics = {
  checkedAt: string; jobFailures24h: number; syncQueueDepth: number;
  gemini: { reqToday: number; cacheHitToday: number; cacheHitPct: number };
  usageByFeature: { feature: string; count: number; tokens: number }[];
  jobHealth: { recommendationsLastAt: string | null; snapshotsLastAt: string | null; pathsLastAt: string | null };
  budgets: { tutorPerDay: number; feedbackPerSubmission: number; summariesPerDayPerUser: number };
};
export type ZyraOps = {
  checkedAt: string; externalUsageUnknown: true;
  projectSlots: { slot: number; alias: "masked"; health: string }[];
  ledger: { committedProviderTurns: number; activeReservations: number; refundedReservations: number; cacheSavedTurns: number };
  image: { uploaded: number; dispatched: number; expired: number; failed: number };
  traces: { success: number; failure: number; validationViolations: number };
  events: { eventType: string; resultCode: string; count: number }[];
  capacity: { modelPools: { model: string; configuredPerProjectRpd: number | null; configuredUsableRpd: number | null; safetyReserveRpd: number | null; zyxCommittedRequests: number; activeReservations: number; usableRemainingRpd: number | null }[] };
  stageOutcomes?: { stage: string; model: string; total: number; failed: number; p95Ms: number }[];
  alerts: { code: string; severity: string; dedupKey: string; runbook: string; rollbackFlag?: string }[];
};
export type OpsProposals = { proposals: { id: string; proposalType: string; status: string; preconditionVersion: number; diffHash: string }[] };
export type KeyDiagnostics = {
  checkedAt: string; totalRequestsToday: number | string;
  compatible?: { model: string; keys: { label: string; cooldownUntil: number }[] }[];
  geminiKeys: {
    keyId: string; modelId: string; requestsToday: number; successes: number; failures: number;
    circuitState: "CLOSED" | "HALF_OPEN" | "OPEN"; cooldownRemainingMs: number; activeRequestsCount: number;
  }[];
};
export const activityOutcomes = ["all", "success", "rejected", "failed", "unclassified"] as const;
export type ActivityOutcome = (typeof activityOutcomes)[number];
export type ActivityCursor = { createdAt: string; id: string };
export type ActivityFilters = {
  actorId?: string; courseId?: string; entityType?: string; action?: string;
  outcome?: ActivityOutcome; correlationId?: string; startDate?: string; endDate?: string; limit?: number;
};
export type ActivityRow = {
  id: string; createdAt: string; actorName: string | null; actorEmail: string | null; actorId: string | null;
  courseTitle: string | null; entityType: string; entityId: string; action: string;
  outcome: Exclude<ActivityOutcome, "all">; reason: string | null; correlationId: string | null;
  beforeSnapshot: Record<string, unknown> | null; afterSnapshot: Record<string, unknown> | null;
};
export type ActivityPage = {
  items: ActivityRow[]; nextCursor: ActivityCursor | null; hasNextPage: boolean; limit: number;
};
export type TutorActivity = {
  stats: Record<Exclude<ActivityOutcome, "all"> | "total", number>;
  options: {
    tutors: { id: string; name: string; email: string }[];
    courses: { id: string; title: string; code: string | null }[];
    entityTypes: string[]; actions: string[];
  };
  page: ActivityPage;
};
export type ModelSetting = {
  feature: string; label: string; group: string; description: string; isCustom: boolean;
  models: readonly [string, string, string]; selectableModels: readonly string[];
  editableDefaultModels: readonly [string, string, string];
  modelLabels?: Readonly<Partial<Record<string, string>>>;
  updatedAt: string | null;
};
export type OfflineSettings = {
  metadataMaxAgeMs: number; contentMaxAgeMs: number; retentionMs: number; accessLeaseMs: number;
  activeCheckIntervalMs: number; maxBytes: number; maxEntries: number; autoCache: boolean; wifiOnly: boolean;
  schedule: { frequency: "daily" | "weekly"; weekday: number; hour: number; timeZone: "Asia/Jakarta" };
};
export type OfflinePolicy = {
  policy: OfflineSettings & { revision: number; updatedAt: number };
  revision: number;
  status: { cursor: string; lastChangedAt: number | null };
};
export type OfflineCatalog = {
  courses: { id: string; title: string }[];
  resources?: { key: string; id: string; kind: string; title: string; courseId: string | null }[];
};
export type OfflineScope =
  | { scope: "all" }
  | { scope: "course"; courseId: string }
  | { scope: "resource"; courseId: string; kind: string; resourceId: string };
export type ShortLink = { id: string; slug: string; url: string; title: string | null; clicks: number; createdAt: string | number };
export type ShortLinkInput = { url: string; title: string | null; slug: string };

export type MonitoringData = {
  home: HomeDashboard;
  web: WebAnalytics | null;
  features: FeatureUsage;
  ai: AiAnalytics;
  usage: AiUsage;
  ops: OpsMetrics;
  zyra: ZyraOps;
  proposals: OpsProposals;
  keys: KeyDiagnostics;
  tutor: TutorActivity;
  tutorDetail: ActivityRow | null;
  models: ModelSetting[];
  embedding: { id: string; model: string; dimensions: number }[];
  offline: OfflinePolicy;
  offlineCatalog: OfflineCatalog;
  links: ShortLink[];
};
export type MonitoringRequest<K extends keyof MonitoringData> = {
  view: K; range?: MonitoringRange; filters?: ActivityFilters; cursor?: ActivityCursor | null; id?: string;
};
export interface MonitoringReader {
  read<K extends keyof MonitoringData>(request: MonitoringRequest<K>, signal: AbortSignal): Promise<MonitoringData[K]>;
}

/** Optional account-scoped writes. The host owns origin verification and credential transport. */
export interface MonitoringActions {
  syncAnalytics?: () => Promise<void>;
  createLink?: (input: ShortLinkInput) => Promise<void>;
  saveOffline?: (input: { expectedRevision: number; policy: OfflineSettings }) => Promise<void>;
  revalidateOffline?: (scope: OfflineScope) => Promise<void>;
  saveModel?: (input: { feature: string; models: readonly [string, string, string]; expectedUpdatedAt: string | null }) => Promise<void>;
  resetModel?: (input: { feature: string; expectedUpdatedAt: string | null }) => Promise<void>;
  measureModelLatency?: () => Promise<void>;
  createProposal?: () => Promise<void>;
  transitionProposal?: (input: { id: string; preconditionVersion: number; action: "review" | "confirm" }) => Promise<void>;
}

export class MonitoringError extends Error {
  constructor(readonly status: number) {
    super(`Monitoring request failed (${status})`);
    this.name = "MonitoringError";
  }
}

export function isMonitoringPath(path: string): path is MonitoringPath {
  return (monitoringPaths as readonly string[]).includes(path);
}

export function swapModelPriority(
  models: readonly [string, string, string], index: 0 | 1 | 2, next: string,
): [string, string, string] {
  const updated: [string, string, string] = [...models];
  const duplicate = updated.indexOf(next);
  if (duplicate !== -1) updated[duplicate] = updated[index];
  updated[index] = next;
  return updated;
}

export function monitoringResultMatches(
  result: { reader: MonitoringReader; query: string } | undefined, reader: MonitoringReader, query: string,
): boolean {
  return result?.reader === reader && result.query === query;
}

export function aiDateRange(range: MonitoringRange, now: Date): URLSearchParams {
  // Web's daysAgo uses local calendar days rather than rounding the request to midnight.
  const start = new Date(now);
  start.setDate(start.getDate() - range);
  return new URLSearchParams({ startDate: start.toISOString(), endDate: now.toISOString() });
}

export function filterAiRequests(logs: AiRequest[], filter: "all" | "failed" | "gateway"): AiRequest[] {
  if (filter === "failed") return logs.filter(log => !log.success);
  if (filter === "gateway") return logs.filter(log => log.viaGateway);
  return logs;
}
