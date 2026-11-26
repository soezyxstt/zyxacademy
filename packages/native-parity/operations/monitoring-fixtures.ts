import {
  featureKeys, MonitoringError, monitoringPaths,
  type ActivityFilters, type ActivityRow, type MonitoringActions, type MonitoringData,
  type MonitoringPath, type MonitoringRange, type MonitoringReader, type MonitoringRequest, type WebAnalytics,
} from "./monitoring-contract";

const date = "2026-11-26T06:00:00.000Z";
const dates = ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"];
const traceTimes = ["06:00", "05:55", "05:45", "04:50"];
const group = (name: string, items: [string, string, string, string?][]) => ({
  name, items: items.map(([title, href, iconKey, stat]) => ({ title, href, iconKey, stat: stat ?? null })),
});

export const emptyWebAnalytics: WebAnalytics = {
  summary: { views: 0, activeUsers: 0, sessions: 0 }, dailyData: [], topPages: [],
};

const features = (rangeDays: MonitoringRange): MonitoringData["features"] => {
  const populated = rangeDays !== 7;
  const multiplier = rangeDays === 90 ? 3 : 1;
  const values = populated ? [28, 17, 14, 1, 0, 5, 4, 2] : [0, 0, 0, 0, 0, 0, 0, 0];
  const labels = ["Materi", "Flashcard", "Kuis mandiri", "Tryout", "Kuis live", "Zyra Chat", "Diskusi", "Sesi tutorial"];
  const rows = featureKeys.map((key, index) => {
    const events = values[index] * multiplier;
    return {
      key, label: labels[index], events, previousEvents: events / 2, trendPercent: events ? 100 : null,
      users: Math.min(events, 12), adoptionPercent: Math.round(Math.min(events, 12) / 12 * 100),
      eventsPerUser: events ? events / Math.min(events, 12) : 0,
      lastUsedAt: events ? date : null, detailCount: Math.floor(events * 0.6),
    };
  }).sort((a, b) => b.events - a.events);
  const daily = dates.map((date, index) => ({
    date,
    materi: Math.ceil(values[0] / (index + 2)) * multiplier, flashcard: populated ? index * multiplier : 0,
    kuis: populated ? (5 - index) * multiplier : 0, tryout: populated && index === 1 ? multiplier : 0, kuisLive: 0,
    zyra: populated && index % 2 ? multiplier : 0, diskusi: populated && index > 1 ? multiplier : 0,
    tutorial: populated && index > 3 ? multiplier : 0,
  }));
  const events = rows.reduce((sum, row) => sum + row.events, 0);
  return {
    rangeDays, rows, daily,
    totals: { events, activeUsers: populated ? 12 : 0, trendPercent: populated ? 100 : null,
      topFeatureKey: populated ? "materi" : null, topFeatureSharePercent: populated ? Math.round(rows[0].events / events * 100) : null },
    insights: {
      fastestGrowing: populated ? { key: "materi", trendPercent: 100 } : null,
      highestAdoption: populated ? { key: "materi", adoptionPercent: 100 } : null,
      needsAttention: populated ? { key: "kuisLive", adoptionPercent: 0, events: 0 } : null,
    },
  };
};

const sampleAudit: ActivityRow[] = [
  { id: "audit-1", createdAt: date, actorName: "Nadia Contoh", actorEmail: "nadia@example.invalid", actorId: "tutor-nadia",
    courseTitle: "Kalkulus", entityType: "quiz", entityId: "quiz-1", action: "update", outcome: "success",
    reason: null, correlationId: "req-quiz", beforeSnapshot: { title: "Limit" }, afterSnapshot: { title: "Limit fungsi" } },
  { id: "audit-2", createdAt: "2026-11-25T06:00:00.000Z", actorName: "Raka Contoh", actorEmail: "raka@example.invalid", actorId: "tutor-raka",
    courseTitle: "Aljabar Linear", entityType: "material", entityId: "material-1", action: "delete", outcome: "rejected",
    reason: "Materi sedang digunakan", correlationId: "req-delete", beforeSnapshot: null, afterSnapshot: null },
  { id: "audit-3", createdAt: "2026-11-22T06:00:00.000Z", actorName: "Nadia Contoh", actorEmail: "nadia@example.invalid", actorId: "tutor-nadia",
    courseTitle: "Kalkulus", entityType: "quiz", entityId: "quiz-2", action: "create", outcome: "failed",
    reason: "Validasi gagal", correlationId: "req-create", beforeSnapshot: null, afterSnapshot: null },
];

export const monitoringFixtureData: MonitoringData = {
  home: { failedJobs: 2, categories: [
    group("Konten akademik", [
      ["Mata Kuliah", "/admin/courses", "courses", "7 mata kuliah"],
      ["Jadwal Umum", "/admin/schedules", "schedules"], ["Meet", "/admin/meet", "meet"],
      ["Bank Soal", "/admin/questions", "bank-soal", "4 perlu ditinjau"], ["Diskusi dan laporan", "/admin/discussions", "discussions"],
    ]),
    group("Pengguna & Akses", [
      ["Pengguna", "/admin/users", "users"], ["Kelompok Belajar", "/admin/groups", "groups"],
      ["Token Aktivasi", "/admin/tokens", "tokens", "12 token · 1 aktivasi hari ini"],
      ["Kalkulator Harga", "/admin/pricing", "pricing"], ["Notifikasi", "/admin/notifications", "notifications"],
    ]),
    group("Publikasi & Konten", [
      ["Blog", "/admin/blog", "blog", "6 artikel"], ["Form Studio", "/admin/forms", "forms"], ["Pustaka Media", "/admin/media", "media"],
      ["Tautan Publik", "/admin/tautan", "tautan"], ["Short Links", "/admin/ops/short-links", "short-links"],
    ]),
    group("Analitik & Monitor", [
      ["Web Analytics", "/admin/ops/web-analytics", "web-analytics"],
      ["Monitor Ops", "/admin/ops", "ops-monitor", "12 dalam antrean · 42 permintaan AI"],
      ["Analitik Zyra", "/admin/ops/analytics", "ai-analytics"], ["Penggunaan Fitur", "/admin/ops/feature-usage", "feature-usage"],
      ["Aktivitas Tutor", "/admin/ops/tutor-activity", "tutor-activity"],
    ]),
    group("Sistem", [["Model AI", "/admin/ops/models", "ai-models"], ["API Keys", "/admin/ops/keys", "api-keys"]]),
    group("", [["Dokumentasi", "/admin/docs", "docs"]]),
  ] },
  web: {
    summary: { views: 2_524, activeUsers: 321, sessions: 1_103 },
    dailyData: dates.map((day, index) => ({ date: day, views: [130, 270, 450, 390, 680, 604][index], sessions: [79, 155, 175, 148, 268, 278][index] })),
    topPages: [
      { path: "/", title: "Zyx Academy", views: 1_208 },
      { path: "/blog", title: "Blog Zyx Academy", views: 576 },
      { path: "/plans", title: "Paket belajar", views: 208 },
      { path: "/blog/memahami-pembuktian-matematika-dari-urutan-contoh-dan-kontra-contoh", title: "Memahami pembuktian matematika dari urutan contoh dan kontra-contoh", views: 105 },
    ],
  },
  features: features(30),
  ai: {
    totalRequests: 148, successfulRequests: 145, failedRequests: 3,
    gatewayRequests: 139, directRequests: 9, gatewaySuccessRate: 98.6, directSuccessRate: 88.9,
    averageLatencyMs: 640, recentLogs: traceTimes.map((time, i) => ({
      timestamp: `2026-11-26T${time}:00.000Z`, operation: i === 1 ? "chatCompletions" : "generateContent",
      model: i === 1 ? "openai/gpt-4o-mini" : "google/gemini-2.5-flash", viaGateway: i !== 3,
      latencyMs: [520, 780, 890, 1420][i], success: i !== 3,
    })),
  },
  usage: {
    users: [
      { userId: "learner-nadia", name: "Nadia Contoh", email: "nadia@example.invalid", requests: 64, inputTokens: 48_200, outputTokens: 31_400, totalTokens: 79_600 },
      { userId: "learner-raka", name: "Raka Contoh", email: "raka@example.invalid", requests: 42, inputTokens: 32_100, outputTokens: 21_800, totalTokens: 53_900 },
    ],
    daily: dates.map((date, i) => ({ date, requests: [18, 24, 31, 28, 22, 25][i], inputTokens: (i + 2) * 4500, outputTokens: (i + 1) * 3900 })),
  },
  ops: {
    checkedAt: date, gemini: { reqToday: 42, cacheHitToday: 17, cacheHitPct: 40.5 },
    budgets: { tutorPerDay: 30, feedbackPerSubmission: 1, summariesPerDayPerUser: 5 },
    usageByFeature: [{ feature: "tutor", count: 42, tokens: 68_200 }],
    jobFailures24h: 2, syncQueueDepth: 12,
    jobHealth: { recommendationsLastAt: date, snapshotsLastAt: "2026-11-26T05:45:00.000Z", pathsLastAt: null },
  },
  zyra: {
    checkedAt: date, externalUsageUnknown: true,
    projectSlots: Array.from({ length: 4 }, (_, index) => ({ slot: index + 1, alias: "masked", health: "healthy" })),
    ledger: { committedProviderTurns: 42, activeReservations: 1, refundedReservations: 2, cacheSavedTurns: 17 },
    image: { uploaded: 4, dispatched: 2, expired: 1, failed: 1 },
    traces: { success: 40, failure: 2, validationViolations: 0 }, alerts: [],
    events: [{ eventType: "provider_attempt", resultCode: "PROVIDER_FALLBACK_SUCCESS", count: 2 }],
    capacity: { modelPools: [{ model: "google/gemini-2.5-flash", configuredPerProjectRpd: 250, configuredUsableRpd: 800,
      safetyReserveRpd: 200, zyxCommittedRequests: 42, activeReservations: 1, usableRemainingRpd: 757 }] },
  },
  proposals: { proposals: [{ id: "proposal-1", proposalType: "course_readiness", status: "validated", preconditionVersion: 1, diffHash: "f".repeat(64) }] },
  keys: {
    checkedAt: date, totalRequestsToday: 42,
    compatible: [{ model: "openai/gpt-4o-mini", keys: [{ label: "Gateway A", cooldownUntil: 0 }] }],
    geminiKeys: [
      { keyId: "project-primary", modelId: "gemini-2.5-flash", requestsToday: 34, successes: 34, failures: 0,
        circuitState: "CLOSED", cooldownRemainingMs: 0, activeRequestsCount: 0 },
      { keyId: "project-fallback", modelId: "gemini-2.5-pro", requestsToday: 8, successes: 7, failures: 1,
        circuitState: "OPEN", cooldownRemainingMs: 25000, activeRequestsCount: 0 },
    ],
  },
  tutor: {
    stats: { total: 3, success: 1, rejected: 1, failed: 1, unclassified: 0 },
    options: {
      tutors: [{ id: "tutor-nadia", name: "Nadia Contoh", email: "nadia@example.invalid" }, { id: "tutor-raka", name: "Raka Contoh", email: "raka@example.invalid" }],
      courses: [{ id: "kalkulus", title: "Kalkulus", code: "MAT101" }, { id: "aljabar", title: "Aljabar Linear", code: "MAT102" }],
      entityTypes: ["quiz", "material"], actions: ["create", "update", "delete"],
    },
    page: { items: sampleAudit, nextCursor: null, hasNextPage: false, limit: 25 },
  },
  tutorDetail: sampleAudit[0],
  models: [
    { feature: "global-default", label: "Model global", group: "interactive", description: "Prioritas model bawaan untuk layanan AI.",
      isCustom: true, models: ["model-a", "model-b", "model-c"], selectableModels: ["model-a", "model-b", "model-c", "model-d"],
      editableDefaultModels: ["model-b", "model-a", "model-c"], updatedAt: date },
    { feature: "zyra", label: "Zyra", group: "interactive", description: "Prioritas model percakapan.",
      isCustom: false, models: ["model-b", "model-a", "model-d"], selectableModels: ["model-a", "model-b", "model-c", "model-d"],
      editableDefaultModels: ["model-b", "model-a", "model-d"], updatedAt: null },
  ],
  offline: {
    revision: 2, status: { cursor: "100", lastChangedAt: Date.parse(date) }, policy: {
      revision: 2, updatedAt: Date.parse(date), metadataMaxAgeMs: 86_400_000, contentMaxAgeMs: 7 * 86_400_000,
      retentionMs: 30 * 86_400_000, accessLeaseMs: 86_400_000, activeCheckIntervalMs: 60_000, maxBytes: 104_857_600,
      maxEntries: 250, autoCache: true, wifiOnly: false, schedule: { frequency: "weekly", weekday: 5, hour: 6, timeZone: "Asia/Jakarta" },
    },
  },
  offlineCatalog: {
    courses: [{ id: "kalkulus", title: "Kalkulus" }, { id: "aljabar", title: "Aljabar Linear" }],
    resources: [{ key: "article-limit", id: "limit", kind: "article", title: "Limit fungsi", courseId: "kalkulus" }],
  },
  links: [{ id: "short-1", slug: "kelas-kalkulus", url: "https://example.invalid/kalkulus", title: "Kelas Kalkulus", clicks: 14, createdAt: date }],
};

type FixtureMode = "populated" | "empty" | "unavailable" | "retry" | "denied";
const retryViewByPath: Record<MonitoringPath, keyof MonitoringData> = {
  "/admin": "home", "/admin/ops/web-analytics": "web", "/admin/ops": "ops", "/admin/ops/analytics": "ai",
  "/admin/ops/feature-usage": "features", "/admin/ops/tutor-activity": "tutor", "/admin/ops/keys": "keys",
  "/admin/ops/models": "models", "/admin/ops/offline": "offline", "/admin/ops/short-links": "links",
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function auditMatches(item: ActivityRow, filters: ActivityFilters) {
  const day = item.createdAt.slice(0, 10);
  const course = item.courseTitle === "Kalkulus" ? "kalkulus" : "aljabar";
  return (!filters.actorId || item.actorId === filters.actorId)
    && (!filters.courseId || course === filters.courseId)
    && (!filters.entityType || item.entityType === filters.entityType)
    && (!filters.action || item.action === filters.action)
    && (!filters.outcome || filters.outcome === "all" || item.outcome === filters.outcome)
    && (!filters.correlationId || item.correlationId === filters.correlationId)
    && (!filters.startDate || day >= filters.startDate)
    && (!filters.endDate || day <= filters.endDate);
}

export function createMonitoringFixture(mode: FixtureMode = "populated", path: MonitoringPath = "/admin/ops/web-analytics") {
  const data = clone(monitoringFixtureData);
  let attempt = 0;
  if (mode === "empty") {
    data.home.failedJobs = 0;
    data.web = emptyWebAnalytics;
    data.ai = { ...data.ai, totalRequests: 0, successfulRequests: 0, failedRequests: 0, recentLogs: [] };
    data.usage = { daily: [], users: [] };
    data.keys = { ...data.keys, totalRequestsToday: 0, geminiKeys: [], compatible: [] };
    data.tutor.page.items = [];
    data.proposals.proposals = [];
    data.models = [];
    data.links = [];
  } else if (mode === "unavailable") data.web = null;

  function value<K extends keyof MonitoringData>(input: MonitoringRequest<K>): MonitoringData[K] {
    if (input.view === "features") return features(mode === "empty" ? 7 : input.range ?? 30) as MonitoringData[K];
    if (input.view === "usage" && input.range === 7) return { daily: [], users: [] } as MonitoringData[K];
    if (input.view === "tutorDetail") return (data.tutor.page.items.find(item => item.id === input.id) ?? null) as MonitoringData[K];
    if (input.view === "offlineCatalog") {
      const resources = data.offlineCatalog.resources?.filter(item => item.courseId === input.id);
      return { courses: data.offlineCatalog.courses, resources } as MonitoringData[K];
    }
    if (input.view === "tutor") {
      const candidates = data.tutor.page.items.filter(item => auditMatches(item, input.filters ?? {}));
      const limit = input.filters?.limit ?? 25;
      const after = candidates.findIndex(item => item.id === input.cursor?.id) + 1;
      const items = candidates.slice(after, after + limit);
      const last = items.at(-1);
      const hasNextPage = after + items.length < candidates.length;
      const nextCursor = last && hasNextPage ? { id: last.id, createdAt: last.createdAt } : null;
      return { ...data.tutor, page: { items, nextCursor, hasNextPage, limit } } as MonitoringData[K];
    }
    return data[input.view];
  }
  const reader: MonitoringReader = {
    async read<K extends keyof MonitoringData>(input: MonitoringRequest<K>, signal: AbortSignal) {
      if (signal.aborted) throw new Error("Aborted");
      if (mode === "denied") throw new MonitoringError(403);
      if (mode === "retry" && input.view === retryViewByPath[path] && attempt++ === 0) throw new MonitoringError(503);
      return clone(value(input));
    },
  };
  function updateModel(input: { feature: string; expectedUpdatedAt: string | null }, models?: readonly [string, string, string]) {
    const model = data.models.find(item => item.feature === input.feature);
    if (!model || model.updatedAt !== input.expectedUpdatedAt) throw new MonitoringError(409);
    if (models && (new Set(models).size !== 3 || models.some(id => !model.selectableModels.includes(id)))) throw new MonitoringError(400);
    model.isCustom = Boolean(models);
    model.models = models ?? model.editableDefaultModels;
    model.updatedAt = models ? new Date(Date.parse(date) + (model.updatedAt ? Date.parse(model.updatedAt) - Date.parse(date) + 1000 : 1000)).toISOString() : null;
  }
  const actions: MonitoringActions = {
    async syncAnalytics() {},
    async createLink(input) {
      const slug = input.slug || `tautan-${data.links.length + 1}`;
      if (data.links.some(link => link.slug === slug)) throw new MonitoringError(409);
      data.links.unshift({ ...input, id: `short-${data.links.length + 1}`, slug, clicks: 0, createdAt: date });
    },
    async saveOffline({ policy, expectedRevision }) {
      if (expectedRevision !== data.offline.revision) throw new MonitoringError(409);
      data.offline.revision += 1;
      data.offline.policy = { ...clone(policy), revision: data.offline.revision, updatedAt: Date.parse(date) };
    },
    async revalidateOffline() { data.offline.status.cursor = String(Number(data.offline.status.cursor) + 1); },
    async saveModel(input) { updateModel(input, input.models); },
    async resetModel(input) { updateModel(input); },
    async measureModelLatency() {},
    async createProposal() {
      data.proposals.proposals.push({
        id: `proposal-${data.proposals.proposals.length + 1}`, proposalType: "course_readiness",
        status: "validated", preconditionVersion: 1, diffHash: "e".repeat(64),
      });
    },
    async transitionProposal(input) {
      const proposal = data.proposals.proposals.find(item => item.id === input.id);
      const required = input.action === "review" ? "validated" : "reviewed";
      if (!proposal || proposal.preconditionVersion !== input.preconditionVersion || proposal.status !== required) throw new MonitoringError(409);
      proposal.status = input.action === "review" ? "reviewed" : "confirmed";
    },
  };
  return { reader, actions };
}

export const monitoringCases = monitoringPaths.flatMap(path => {
  const component = ({ "/admin": "HomeDashboardScreen", "/admin/ops": "OpsMonitorScreen",
    "/admin/ops/web-analytics": "WebAnalyticsScreen", "/admin/ops/analytics": "AiAnalyticsScreen",
    "/admin/ops/feature-usage": "FeatureUsageScreen", "/admin/ops/tutor-activity": "TutorActivityScreen",
    "/admin/ops/keys": "KeyDiagnosticsScreen", "/admin/ops/models": "ModelsScreen",
    "/admin/ops/offline": "OfflineCacheScreen", "/admin/ops/short-links": "ShortLinksScreen",
  })[path];
  return (["populated", "retry", "denied"] as const).map((mode, index) => ({
    id: `operations-monitoring-${path.slice(1).replaceAll("/", "-")}-${mode}`, name: component,
    path, mode, theme: index === 1 ? "dark" as const : "light" as const,
  }));
});
