import { awaitOwnedReadiness, linuxInspector, stopProcessGroup, verifyListenerOwnership } from "./server-process";
import { parseBuildKind, verifyBuild, type BuildKind } from "./build-provenance";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import {
  fetchFreshSignedSessionCookie,
  loadVerifiedStagingEnvironment,
  probeReadOnlySessionAndFixtures,
  probeSessionCookieName,
  validateLoopbackBaseUrl,
  type BuildProvenanceVerification,
  type DiscoveredRouteFixtures,
  type SanitizedTargetVerification,
  type SessionCookieProbeResult,
} from "./staging-env-loader";

export type PlanRouteId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8";
export type ExploratoryRouteId = "E1" | "E2" | "E3";
export type RouteId = PlanRouteId | ExploratoryRouteId;

export type ViewportName = "mobile" | "desktop";
export const VIEWPORTS = { mobile: { width: 380, height: 844 }, desktop: { width: 1536, height: 864 } } as const;

export type SampleMode = "warm" | "browser-context-cold";

export type RouteMeasureStatus =
  | "measured"
  | "partial"
  | "blocked_legacy_redirect_route"
  | "blocked_missing_product_link_or_fixture"
  | "blocked_single_category_fixture"
  | "blocked_auth_unavailable"
  | "failed_readiness_or_errors";

export type RscDeliveryMode =
  | "network_fetched"
  | "client_cache_or_prefetched"
  | "local_in_memory"
  | "missing";

export interface NavigationSample {
  routeId: RouteId;
  routeGroup: "plan" | "exploratory";
  mode: SampleMode;
  sampleIndex: number;
  traceId: string;
  status: "valid" | "failed";
  failureReasons: string[];
  triggerKind: "native_link" | "dropdown_link" | "local_tab_trigger";
  sessionUserIdHash: string | null;
  feedbackWithTopLoaderMs: number | null;
  feedbackNativeMs: number | null;
  ttfbMs: number | null;
  shellMs: number | null;
  primaryCommitMs: number | null;
  primaryVisibleReadyApproxMs: number | null;
  clientRscDurationMs: number | null;
  serverRscDurationMs: null;
  serverTimingMissingReason: "no_server_span_instrumentation";
  rscDeliveryMode: RscDeliveryMode;
  timingMissingReason: string | null;
  rscTransferSizeBytes: number | null;
  rscEncodedBodyBytes: number | null;
  rscDecodedBodyBytes: number | null;
  rscRequestCount: number;
  longTaskSupported: boolean;
  longTaskCount: number | null;
  longTaskMaxMs: number | null;
  layoutShiftSupported: boolean;
  observedTransitionLayoutShiftSum: number | null;
  fcmRegisterCalls: number;
  hardNavigationDetected: boolean;
  httpErrorStatuses: number[];
  httpErrorDetails: Array<{ status: number; method: string; url: string }>;
  consoleErrorCount: number;
  consoleErrorMessages: string[];
  pageErrorCount: number;
  pageErrorMessages: string[];
  finalPathname: string;
  finalSearch: string;
}

export interface MetricPercentiles {
  sampleCount: number;
  nullCount: number;
  min: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  max: number | null;
  mean: number | null;
}

export interface ColdDescriptiveMetric {
  sampleCount: number;
  nullCount: number;
  rawValues: Array<number | null>;
  min: number | null;
  p50: number | null;
  max: number | null;
  mean: number | null;
}

export interface WarmSamplesSummary {
  validSampleCount: number;
  failedSampleCount: number;
  networkFetchedCount: number;
  cacheOrPrefetchedCount: number;
  localInMemoryCount: number;
  feedbackWithTopLoaderMs: MetricPercentiles;
  feedbackNativeMs: MetricPercentiles;
  ttfbMs: MetricPercentiles;
  shellMs: MetricPercentiles;
  primaryCommitMs: MetricPercentiles;
  primaryVisibleReadyApproxMs: MetricPercentiles;
  clientRscDurationMs: MetricPercentiles;
  rscTransferSizeBytes: MetricPercentiles;
  rscEncodedBodyBytes: MetricPercentiles;
  rscDecodedBodyBytes: MetricPercentiles;
  longTaskMaxMs: MetricPercentiles;
  observedTransitionLayoutShiftSum: MetricPercentiles;
  fcmRegisterCallsTotal: number;
  hardNavigationCount: number;
}

export interface ColdSamplesSummary {
  validSampleCount: number;
  failedSampleCount: number;
  feedbackWithTopLoaderMs: ColdDescriptiveMetric;
  feedbackNativeMs: ColdDescriptiveMetric;
  ttfbMs: ColdDescriptiveMetric;
  shellMs: ColdDescriptiveMetric;
  primaryCommitMs: ColdDescriptiveMetric;
  primaryVisibleReadyApproxMs: ColdDescriptiveMetric;
  clientRscDurationMs: ColdDescriptiveMetric;
  rscTransferSizeBytes: ColdDescriptiveMetric;
  rscEncodedBodyBytes: ColdDescriptiveMetric;
  rscDecodedBodyBytes: ColdDescriptiveMetric;
  longTaskMaxMs: ColdDescriptiveMetric;
  observedTransitionLayoutShiftSum: ColdDescriptiveMetric;
  fcmRegisterCallsTotal: number;
  hardNavigationCount: number;
}

export interface RouteSummary {
  routeId: RouteId;
  routeGroup: "plan" | "exploratory";
  label: string;
  planRouteLabel: string;
  transitionKind: "route_navigation" | "local_tab";
  sourcePath: string;
  targetPath: string;
  expectedFinalPath: string;
  authMode: "authenticated" | "anonymous" | "admin";
  status: RouteMeasureStatus;
  boundaryNote?: string;
  warmValidSampleCount: number;
  warmFailedSampleCount: number;
  coldValidSampleCount: number;
  coldFailedSampleCount: number;
  warmMetrics: WarmSamplesSummary | null;
  browserContextColdMetrics: ColdSamplesSummary | null;
}

export interface BaselineRunArtifact {
  schemaVersion: 2;
  capturedAtIso: string;
  viewport: { name: ViewportName; width: number; height: number };
  baseUrl: string;
  warmSamplesPerRoute: number;
  browserContextColdSamplesPerRoute: number;
  buildProvenance: BuildProvenanceVerification;
  environmentVerification: SanitizedTargetVerification;
  sessionCookieProbe: SessionCookieProbeResult;
  preRunFixtures: DiscoveredRouteFixtures;
  postRunFixtures: DiscoveredRouteFixtures;
  sampledFixtureCountsEqual: boolean;
  sampledFixtureCountsNote: string;
  routes: RouteSummary[];
  rawSamples: NavigationSample[];
}

export interface RouteMatrixDefinition {
  routeId: RouteId;
  routeGroup: "plan" | "exploratory";
  label: string;
  planRouteLabel: string;
  transitionKind: "route_navigation" | "local_tab";
  sourcePath: string;
  targetPath: string;
  expectedFinalPath: string;
  authMode: "authenticated" | "anonymous" | "admin";
  status: RouteMeasureStatus;
  boundaryNote?: string;
  dropdownTriggerSelector?: string;
  linkSelector?: string;
  shellSelector: string;
  primarySelector: string;
  minPrimaryMatches?: number;
  requiredPrimaryTextPattern?: string;
  interactiveControlSelector: string;
  excludeSkeletonSelector: string;
}

const BARE_STRUCTURAL_SELECTORS = new Set([
  "h1",
  "h2",
  "h3",
  "header",
  "aside",
  "nav",
  "main",
  '[role="tablist"]',
  "main h1",
  "main h2",
  "main h3",
]);

export function validateRouteSelectorSafety(def: RouteMatrixDefinition): void {
  const parts = def.primarySelector
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`UNSAFE_PRIMARY_SELECTOR (${def.routeId}): primarySelector cannot be empty`);
  }
  for (const part of parts) {
    if (BARE_STRUCTURAL_SELECTORS.has(part)) {
      throw new Error(
        `UNSAFE_PRIMARY_SELECTOR (${def.routeId}): Bare structural selector "${part}" is prohibited as a primary readiness indicator`
      );
    }
  }
  if (!def.interactiveControlSelector.trim()) {
    throw new Error(
      `MISSING_INTERACTIVE_SELECTOR (${def.routeId}): interactiveControlSelector is required`
    );
  }
  if (!def.excludeSkeletonSelector.trim()) {
    throw new Error(
      `MISSING_SKELETON_EXCLUSION (${def.routeId}): excludeSkeletonSelector is required`
    );
  }
}

export function roundMetric(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function computePercentiles(
  values: Array<number | null | undefined>,
  totalSampleCount = values.length
): MetricPercentiles {
  const numeric = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const nullCount = Math.max(0, totalSampleCount - numeric.length);
  if (numeric.length === 0) {
    return {
      sampleCount: 0,
      nullCount,
      min: null,
      p50: null,
      p75: null,
      p95: null,
      max: null,
      mean: null,
    };
  }
  const sorted = [...numeric].sort((a, b) => a - b);
  const pick = (q: number): number => {
    const pos = Math.ceil(q * sorted.length) - 1;
    const idx = Math.max(0, Math.min(sorted.length - 1, pos));
    return roundMetric(sorted[idx] ?? 0);
  };
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    sampleCount: sorted.length,
    nullCount,
    min: roundMetric(sorted[0] ?? 0),
    p50: pick(0.5),
    p75: pick(0.75),
    p95: sorted.length >= 40 ? pick(0.95) : null,
    max: roundMetric(sorted[sorted.length - 1] ?? 0),
    mean: roundMetric(sum / sorted.length),
  };
}

export function computeColdDescriptiveMetric(
  values: Array<number | null | undefined>
): ColdDescriptiveMetric {
  const rawValues = values.map((v) =>
    typeof v === "number" && Number.isFinite(v) ? roundMetric(v) : null
  );
  const numeric = rawValues.filter((v): v is number => v !== null);
  const nullCount = rawValues.length - numeric.length;
  if (numeric.length === 0) {
    return {
      sampleCount: 0,
      nullCount,
      rawValues,
      min: null,
      p50: null,
      max: null,
      mean: null,
    };
  }
  const sorted = [...numeric].sort((a, b) => a - b);
  const midIdx = Math.max(0, Math.ceil(0.5 * sorted.length) - 1);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    sampleCount: sorted.length,
    nullCount,
    rawValues,
    min: roundMetric(sorted[0] ?? 0),
    p50: roundMetric(sorted[midIdx] ?? 0),
    max: roundMetric(sorted[sorted.length - 1] ?? 0),
    mean: roundMetric(sum / sorted.length),
  };
}

export function filterOverlappingLongTasks<T extends { startTime: number; duration: number }>(
  entries: T[],
  windowStart: number,
  windowEnd: number
): T[] {
  return entries.filter(
    (entry) => entry.startTime < windowEnd && entry.startTime + entry.duration > windowStart
  );
}

export function evaluateSampleGates(input: {
  timedOut: boolean;
  transitionKind: "route_navigation" | "local_tab";
  finalPathname: string;
  expectedFinalPath: string;
  localTabChanged: boolean;
  hardNavigationDetected: boolean;
  httpErrorStatuses: number[];
  consoleErrorCount: number;
  pageErrorCount: number;
  errorBoundaryVisible: boolean;
}): { status: "valid" | "failed"; failureReasons: string[] } {
  const failureReasons: string[] = [];
  if (input.timedOut) {
    failureReasons.push("READINESS_TIMEOUT");
  }
  if (input.finalPathname !== input.expectedFinalPath) {
    failureReasons.push(
      `UNEXPECTED_FINAL_PATHNAME:${input.finalPathname}!=${input.expectedFinalPath}`
    );
  }
  if (input.transitionKind === "local_tab" && !input.localTabChanged) {
    failureReasons.push("LOCAL_TAB_PANEL_UNCHANGED");
  }
  if (input.hardNavigationDetected) {
    failureReasons.push("HARD_NAVIGATION_DETECTED");
  }
  if (input.httpErrorStatuses.length > 0) {
    failureReasons.push(`HTTP_ERROR_STATUS:${input.httpErrorStatuses.join(",")}`);
  }
  if (input.pageErrorCount > 0) {
    failureReasons.push(`PAGE_ERROR_COUNT:${input.pageErrorCount}`);
  }
  if (input.consoleErrorCount > 0) {
    failureReasons.push(`CONSOLE_ERROR_COUNT:${input.consoleErrorCount}`);
  }
  if (input.errorBoundaryVisible) {
    failureReasons.push("VISIBLE_ERROR_STATE");
  }
  return {
    status: failureReasons.length === 0 ? "valid" : "failed",
    failureReasons,
  };
}

export function summarizeWarmSamples(samples: NavigationSample[]): WarmSamplesSummary | null {
  const valid = samples.filter((s) => s.status === "valid");
  const failed = samples.filter((s) => s.status === "failed");
  if (valid.length === 0 && failed.length === 0) return null;
  const totalValid = valid.length;
  return {
    validSampleCount: valid.length,
    failedSampleCount: failed.length,
    networkFetchedCount: valid.filter((s) => s.rscDeliveryMode === "network_fetched").length,
    cacheOrPrefetchedCount: valid.filter((s) => s.rscDeliveryMode === "client_cache_or_prefetched")
      .length,
    localInMemoryCount: valid.filter((s) => s.rscDeliveryMode === "local_in_memory").length,
    feedbackWithTopLoaderMs: computePercentiles(
      valid.map((s) => s.feedbackWithTopLoaderMs),
      totalValid
    ),
    feedbackNativeMs: computePercentiles(
      valid.map((s) => s.feedbackNativeMs),
      totalValid
    ),
    ttfbMs: computePercentiles(
      valid.map((s) => s.ttfbMs),
      totalValid
    ),
    shellMs: computePercentiles(
      valid.map((s) => s.shellMs),
      totalValid
    ),
    primaryCommitMs: computePercentiles(
      valid.map((s) => s.primaryCommitMs),
      totalValid
    ),
    primaryVisibleReadyApproxMs: computePercentiles(
      valid.map((s) => s.primaryVisibleReadyApproxMs),
      totalValid
    ),
    clientRscDurationMs: computePercentiles(
      valid.map((s) => s.clientRscDurationMs),
      totalValid
    ),
    rscTransferSizeBytes: computePercentiles(
      valid.map((s) => s.rscTransferSizeBytes),
      totalValid
    ),
    rscEncodedBodyBytes: computePercentiles(
      valid.map((s) => s.rscEncodedBodyBytes),
      totalValid
    ),
    rscDecodedBodyBytes: computePercentiles(
      valid.map((s) => s.rscDecodedBodyBytes),
      totalValid
    ),
    longTaskMaxMs: computePercentiles(
      valid.map((s) => s.longTaskMaxMs),
      totalValid
    ),
    observedTransitionLayoutShiftSum: computePercentiles(
      valid.map((s) => s.observedTransitionLayoutShiftSum),
      totalValid
    ),
    fcmRegisterCallsTotal: valid.reduce((acc, s) => acc + s.fcmRegisterCalls, 0),
    hardNavigationCount: samples.filter((s) => s.hardNavigationDetected).length,
  };
}

export function summarizeColdSamples(samples: NavigationSample[]): ColdSamplesSummary | null {
  const valid = samples.filter((s) => s.status === "valid");
  const failed = samples.filter((s) => s.status === "failed");
  if (valid.length === 0 && failed.length === 0) return null;
  return {
    validSampleCount: valid.length,
    failedSampleCount: failed.length,
    feedbackWithTopLoaderMs: computeColdDescriptiveMetric(
      valid.map((s) => s.feedbackWithTopLoaderMs)
    ),
    feedbackNativeMs: computeColdDescriptiveMetric(valid.map((s) => s.feedbackNativeMs)),
    ttfbMs: computeColdDescriptiveMetric(valid.map((s) => s.ttfbMs)),
    shellMs: computeColdDescriptiveMetric(valid.map((s) => s.shellMs)),
    primaryCommitMs: computeColdDescriptiveMetric(valid.map((s) => s.primaryCommitMs)),
    primaryVisibleReadyApproxMs: computeColdDescriptiveMetric(
      valid.map((s) => s.primaryVisibleReadyApproxMs)
    ),
    clientRscDurationMs: computeColdDescriptiveMetric(valid.map((s) => s.clientRscDurationMs)),
    rscTransferSizeBytes: computeColdDescriptiveMetric(valid.map((s) => s.rscTransferSizeBytes)),
    rscEncodedBodyBytes: computeColdDescriptiveMetric(valid.map((s) => s.rscEncodedBodyBytes)),
    rscDecodedBodyBytes: computeColdDescriptiveMetric(valid.map((s) => s.rscDecodedBodyBytes)),
    longTaskMaxMs: computeColdDescriptiveMetric(valid.map((s) => s.longTaskMaxMs)),
    observedTransitionLayoutShiftSum: computeColdDescriptiveMetric(
      valid.map((s) => s.observedTransitionLayoutShiftSum)
    ),
    fcmRegisterCallsTotal: valid.reduce((acc, s) => acc + s.fcmRegisterCalls, 0),
    hardNavigationCount: samples.filter((s) => s.hardNavigationDetected).length,
  };
}

const DEFAULT_SKELETON_EXCLUSION =
  'main [data-slot="skeleton"], main [data-testid$="-skeleton"], main [role="status"][aria-label="Memuat"]';

export function buildRouteMatrixDefinitions(
  fixtures: DiscoveredRouteFixtures,
  options?: { includeExploratory?: boolean }
): RouteMatrixDefinition[] {
  const courseSlug = fixtures.courseSlug || "mat-i";
  const materialCourseId = fixtures.materialCourseId || "mat-i";
  const materialId = fixtures.materialId || "mat-i-bab1-pertaksamaan-fungsi-article";
  const quizCourseSlug = fixtures.quizCourseId || "tutorial-pka";
  const quizId = fixtures.quizId || "456fa259-5d77-489b-8b97-ba41d5c749c4";
  const hasAdminMenuLink = fixtures.sessionUserSummary.userRole === "admin";
  const hasMultipleCatalogCategories = fixtures.nonPkaCourseCategories.length >= 2;

  const planRoutes: RouteMatrixDefinition[] = [
    {
      routeId: "R1",
      routeGroup: "plan",
      label: "Marketing Home -> Student Dashboard (Authenticated)",
      planRouteLabel: "/ -> /dashboard (authenticated)",
      transitionKind: "route_navigation",
      sourcePath: "/",
      targetPath: "/dashboard",
      expectedFinalPath: "/dashboard",
      authMode: "authenticated",
      status: "measured",
      dropdownTriggerSelector: 'header [data-testid=nav-profile-trigger]',
      linkSelector: '[role="menuitem"][href="/dashboard"], a[href="/dashboard"]',
      shellSelector: "main",
      primarySelector: `main section a[href="/courses/${courseSlug}"]`,
      interactiveControlSelector: `main a[href="/courses/${courseSlug}/flashcard"], main a[href="/courses/${courseSlug}/mastery"]`,
      excludeSkeletonSelector: 'main section:has(a[href="/courses/' + courseSlug + '"]) [data-slot="skeleton"]',
    },
    {
      routeId: "R2",
      routeGroup: "plan",
      label: "Marketing Home -> Admin Overview (Admin)",
      planRouteLabel: "/ -> /admin (admin)",
      transitionKind: "route_navigation",
      sourcePath: "/",
      targetPath: "/admin",
      expectedFinalPath: "/admin",
      authMode: "admin",
      status: hasAdminMenuLink ? "measured" : "blocked_missing_product_link_or_fixture",
      boundaryNote: hasAdminMenuLink
        ? "Triggered via the authenticated navbar profile dropdown menu item [role=\"menuitem\"][href=\"/admin\"]. Primary readiness waits for the streamed AdminOverviewStats Suspense boundary to resolve real course counts."
        : "Active session user does not have public.user.role = 'admin', so navbar profile dropdown does not render a link to /admin.",
      dropdownTriggerSelector: 'header [data-testid=nav-profile-trigger]',
      linkSelector: '[role="menuitem"][href="/admin"], a[href="/admin"]',
      shellSelector: "main div.columns-1",
      primarySelector: 'main a[href="/admin/courses"]',
      requiredPrimaryTextPattern: "\\d+\\s+mata kuliah aktif",
      interactiveControlSelector:
        'main a[href="/admin/courses"], main a[href="/admin/questions"]',
      excludeSkeletonSelector: 'main a[href="/admin/courses"] [data-slot="skeleton"]',
    },
    {
      routeId: "R3",
      routeGroup: "plan",
      label: "Admin Overview -> Admin Courses List (/admin -> /admin/courses)",
      planRouteLabel: "/admin -> /admin/courses (admin)",
      transitionKind: "route_navigation",
      sourcePath: "/admin",
      targetPath: "/admin/courses",
      expectedFinalPath: "/admin/courses",
      authMode: "admin",
      status: "measured",
      linkSelector: 'main a[href="/admin/courses"], aside a[href="/admin/courses"]',
      shellSelector: "main table",
      primarySelector: `main table tbody tr a[href="/admin/courses/${courseSlug}"]`,
      interactiveControlSelector: `main table tbody tr a[href="/admin/courses/${courseSlug}"], main input:not([disabled])`,
      excludeSkeletonSelector: 'main table [data-slot="skeleton"]',
    },
    {
      routeId: "R4",
      routeGroup: "plan",
      label: `Admin Courses List -> Admin Course Detail (/admin/courses -> /admin/courses/${courseSlug})`,
      planRouteLabel: `/admin/courses -> /admin/courses/[slug] (actual: /admin/courses/${courseSlug})`,
      transitionKind: "route_navigation",
      sourcePath: "/admin/courses",
      targetPath: `/admin/courses/${courseSlug}`,
      expectedFinalPath: `/admin/courses/${courseSlug}`,
      authMode: "admin",
      status: "measured",
      linkSelector: `main table tbody a[href="/admin/courses/${courseSlug}"]`,
      shellSelector: "main table",
      primarySelector: "main table tbody tr",
      minPrimaryMatches: 1,
      interactiveControlSelector:
        "main table tbody tr button:not([disabled]), main form input:not([disabled])",
      excludeSkeletonSelector: 'main table [data-slot="skeleton"]',
    },
    {
      routeId: "R5",
      routeGroup: "plan",
      label: "Admin Overview -> Question Bank Studio (/admin -> /admin/questions)",
      planRouteLabel: "/admin -> /admin/questions (admin)",
      transitionKind: "route_navigation",
      sourcePath: "/admin",
      targetPath: "/admin/questions",
      expectedFinalPath: "/admin/questions",
      authMode: "admin",
      status: "measured",
      linkSelector: 'aside a[href="/admin/questions"], main a[href="/admin/questions"]',
      shellSelector: 'main [role="tablist"]',
      primarySelector: 'main [role="tabpanel"][data-state="active"] .divide-y > div',
      minPrimaryMatches: 1,
      interactiveControlSelector:
        'main [role="tabpanel"][data-state="active"] .divide-y > div:first-child button:not([disabled])',
      excludeSkeletonSelector: 'main [role="tabpanel"][data-state="active"] [data-slot="skeleton"]',
    },
    {
      routeId: "R6",
      routeGroup: "plan",
      label: `Material Reader -> Quiz Page (/courses/${materialCourseId}/material/${materialId} -> /courses/${materialCourseId}/quiz/${quizId})`,
      planRouteLabel: "/courses/[id]/material/[materialId] -> /courses/[id]/quiz/[quizId]",
      transitionKind: "route_navigation",
      sourcePath: `/courses/${materialCourseId}/material/${materialId}`,
      targetPath: `/courses/${materialCourseId}/quiz/${quizId}`,
      expectedFinalPath: `/courses/${materialCourseId}/quiz/${quizId}`,
      authMode: "authenticated",
      status: "blocked_missing_product_link_or_fixture",
      boundaryNote:
        `MaterialReaderClient (/courses/${materialCourseId}/material/${materialId}) contains no product link to /courses/[id]/quiz/[quizId] (its completion CTA links to /courses/${materialCourseId}/flashcard), and mat-i has ${fixtures.materialCourseQuizCount} published quiz_templates in Neon staging while published articles exist only for mat-i. Blocked fail-closed rather than injecting a synthetic router anchor.`,
      linkSelector: `main a[href^="/courses/${materialCourseId}/quiz/"]`,
      shellSelector: "main",
      primarySelector: `main form button:not([disabled]), main a[href="/courses/${materialCourseId}/quiz"]`,
      interactiveControlSelector: "main button:not([disabled])",
      excludeSkeletonSelector: DEFAULT_SKELETON_EXCLUSION,
    },
    {
      routeId: "R7",
      routeGroup: "plan",
      label: "Course Catalog Local Tab Switch (/courses ?jurusan=...)",
      planRouteLabel: "Local tab switch on /courses (Tabs / useUrlTab)",
      transitionKind: "local_tab",
      sourcePath: "/courses",
      targetPath: "/courses",
      expectedFinalPath: "/courses",
      authMode: "authenticated",
      status: hasMultipleCatalogCategories ? "measured" : "blocked_single_category_fixture",
      boundaryNote: hasMultipleCatalogCategories
        ? `Local tab switch across ${fixtures.nonPkaCourseCategories.join(", ")} on /courses.`
        : `CourseCatalogClient only renders <TabsList> when groups.length > 1. In Neon staging (br-gentle-scene-azq0gp91), all non-PKA courses in public.courses belong to a single category (${JSON.stringify(fixtures.nonPkaCourseCategories)}), so 0 tab triggers exist in the DOM.`,
      linkSelector: 'main [role="tablist"] [role="tab"][data-state="inactive"]',
      shellSelector: 'main [role="tabpanel"][data-state="active"]',
      primarySelector: 'main [role="tabpanel"][data-state="active"] a[href^="/courses/"]',
      interactiveControlSelector:
        'main [role="tabpanel"][data-state="active"] a[href^="/courses/"]',
      excludeSkeletonSelector: DEFAULT_SKELETON_EXCLUSION,
    },
    {
      routeId: "R8",
      routeGroup: "plan",
      label: "Admin Assessments -> Assessment Detail (/admin/assessments -> /admin/assessments/[id])",
      planRouteLabel: "/admin/assessments -> /admin/assessments/[id] (admin)",
      transitionKind: "route_navigation",
      sourcePath: "/admin/assessments",
      targetPath: fixtures.assessmentId
        ? `/admin/assessments/${fixtures.assessmentId}`
        : "/admin/assessments/staging-empty-fixture",
      expectedFinalPath: fixtures.assessmentId
        ? `/admin/assessments/${fixtures.assessmentId}`
        : "/admin/assessments/staging-empty-fixture",
      authMode: "admin",
      status: "blocked_legacy_redirect_route",
      boundaryNote:
        "app/(admin)/admin/(content)/assessments/[id]/page.tsx is an 8-line legacy stub that runs assertAdmin() and immediately calls redirect('/admin/questions'), and public.assessment_sources has 0 active rows in Neon staging. Always classified as blocked_legacy_redirect_route.",
      linkSelector: 'main a[href^="/admin/assessments/"]',
      shellSelector: "main",
      primarySelector: 'main [data-testid="assessment-detail-primary"]',
      interactiveControlSelector: "main button:not([disabled])",
      excludeSkeletonSelector: DEFAULT_SKELETON_EXCLUSION,
    },
  ];

  const exploratoryRoutes: RouteMatrixDefinition[] = options?.includeExploratory
    ? [
        {
          routeId: "E1",
          routeGroup: "exploratory",
          label: `Exploratory: Student Dashboard -> Course Hub (/courses/${courseSlug})`,
          planRouteLabel: `Exploratory E1: /dashboard -> /courses/${courseSlug}`,
          transitionKind: "route_navigation",
          sourcePath: "/dashboard",
          targetPath: `/courses/${courseSlug}`,
          expectedFinalPath: `/courses/${courseSlug}`,
          authMode: "authenticated",
          status: "measured",
          linkSelector: `main a[href="/courses/${courseSlug}"]`,
          shellSelector: "main",
          primarySelector: `main a[href*="/courses/${courseSlug}/material/"]`,
          interactiveControlSelector: `main a[href*="/courses/${courseSlug}/material/"]`,
          excludeSkeletonSelector: DEFAULT_SKELETON_EXCLUSION,
        },
        {
          routeId: "E2",
          routeGroup: "exploratory",
          label: `Exploratory: Course Hub -> Material Reader (/courses/${courseSlug}/material/${materialId})`,
          planRouteLabel: `Exploratory E2: /courses/${courseSlug} -> /courses/${courseSlug}/material/${materialId}`,
          transitionKind: "route_navigation",
          sourcePath: `/courses/${courseSlug}`,
          targetPath: `/courses/${courseSlug}/material/${materialId}`,
          expectedFinalPath: `/courses/${courseSlug}/material/${materialId}`,
          authMode: "authenticated",
          status: "measured",
          linkSelector: `main a[href="/courses/${courseSlug}/material/${materialId}"]`,
          shellSelector: "main",
          primarySelector: "main article p, main .prose p",
          interactiveControlSelector: `main a[href^="/courses/${courseSlug}"], main button:not([disabled])`,
          excludeSkeletonSelector:
            '[data-testid="material-reader-skeleton"], main [data-slot="skeleton"]',
        },
        {
          routeId: "E3",
          routeGroup: "exploratory",
          label: `Exploratory: Course Quiz List -> Quiz Gateway (/courses/${quizCourseSlug}/quiz/${quizId})`,
          planRouteLabel: `Exploratory E3: /courses/${quizCourseSlug}/quiz -> /courses/${quizCourseSlug}/quiz/${quizId}`,
          transitionKind: "route_navigation",
          sourcePath: `/courses/${quizCourseSlug}/quiz`,
          targetPath: `/courses/${quizCourseSlug}/quiz/${quizId}`,
          expectedFinalPath: `/courses/${quizCourseSlug}/quiz/${quizId}`,
          authMode: "authenticated",
          status: "measured",
          linkSelector: `main a[href^="/courses/${quizCourseSlug}/quiz/${quizId}"]`,
          shellSelector: "main",
          primarySelector: `main a[href="/courses/${quizCourseSlug}/quiz"]`,
          interactiveControlSelector: "main button:not([disabled])",
          excludeSkeletonSelector: DEFAULT_SKELETON_EXCLUSION,
        },
      ]
    : [];

  const allRoutes = [...planRoutes, ...exploratoryRoutes];
  for (const route of allRoutes) {
    validateRouteSelectorSafety(route);
  }
  return allRoutes;
}

// Keep only known route shapes; dynamic segments and query strings can contain personal data.
export function safeDiagnosticPath(path: string): string {
  const known = ["/", "/dashboard", "/admin", "/courses", "/sign-in", "/api/auth/get-session"];
  return known.includes(path) ? path : "/[redacted]";
}

export function sanitizeBaselineSummary(artifact: unknown): string {
  const json = JSON.stringify(artifact, (key, value) => {
    if (key === "httpErrorDetails" && Array.isArray(value)) return value.map((entry) => ({ ...entry, url: safeDiagnosticPath(String(entry.url).split(/[?#]/)[0]) }));
    if ((key === "consoleErrorMessages" || key === "pageErrorMessages") && Array.isArray(value)) return value.map(() => key === "consoleErrorMessages" ? "console_error" : "page_error");
    return value;
  }, 2);
  const forbiddenPatterns = [
    /postgresql:\/\/[^\s"]+/gi,
    /postgres:\/\/[^\s"]+/gi,
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    /better-auth\.session_token=[^\s";]+/gi,
  ];
  let sanitized = json;
  for (const pattern of forbiddenPatterns) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

export function writeCheckpointAtomic(path: string, value: unknown): void {
  const temporary = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    writeFileSync(temporary, sanitizeBaselineSummary(value), "utf8");
    renameSync(temporary, path);
  } finally {
    try { unlinkSync(temporary); } catch { /* Already renamed or never created. */ }
  }
}

async function installPageTelemetryInitScript(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const supportedTypes =
      typeof PerformanceObserver !== "undefined" &&
      Array.isArray(PerformanceObserver.supportedEntryTypes)
        ? PerformanceObserver.supportedEntryTypes
        : [];

    const longTaskSupported = supportedTypes.includes("longtask");
    const layoutShiftSupported = supportedTypes.includes("layout-shift");

    const w = window as unknown as {
      __zyxDocInstanceId?: string;
      __zyxPerf?: {
        docInstanceId: string;
        activeTraceId: string | null;
        longTaskSupported: boolean;
        layoutShiftSupported: boolean;
        fcmRegisterCalls: number;
        longTasks: Array<{ startTime: number; duration: number }>;
        layoutShifts: Array<{ startTime: number; value: number; hadRecentInput: boolean }>;
        fetchTraces: Array<{
          traceId: string | null;
          url: string;
          pathname: string;
          isRsc: boolean;
          isPrefetch: boolean;
          startTime: number;
          headersReceivedAt: number | null;
          completedAt: number | null;
          status: number | null;
        }>;
      };
    };

    const docInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    w.__zyxDocInstanceId = docInstanceId;
    w.__zyxPerf = {
      docInstanceId,
      activeTraceId: null,
      longTaskSupported,
      layoutShiftSupported,
      fcmRegisterCalls: 0,
      longTasks: [],
      layoutShifts: [],
      fetchTraces: [],
    };

    if (longTaskSupported) {
      try {
        const ltObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            w.__zyxPerf?.longTasks.push({
              startTime: entry.startTime,
              duration: entry.duration,
            });
          }
        });
        ltObserver.observe({ type: "longtask", buffered: true });
      } catch {
        // Ignore observer registration failure
      }
    }

    if (layoutShiftSupported) {
      try {
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & {
              value?: number;
              hadRecentInput?: boolean;
            };
            w.__zyxPerf?.layoutShifts.push({
              startTime: shift.startTime,
              value: typeof shift.value === "number" ? shift.value : 0,
              hadRecentInput: Boolean(shift.hadRecentInput),
            });
          }
        });
        clsObserver.observe({ type: "layout-shift", buffered: true });
      } catch {
        // Ignore observer registration failure
      }
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (urlStr.includes("/api/notifications/register-token")) {
        if (w.__zyxPerf) {
          w.__zyxPerf.fcmRegisterCalls += 1;
        }
      }

      const traceId = w.__zyxPerf?.activeTraceId ?? null;
      let nextInit = init;
      let isRsc = false;
      let isPrefetch = false;
      let targetPathname = "";

      try {
        const parsedTarget = new URL(urlStr, window.location.origin);
        targetPathname = parsedTarget.pathname;
        const sameOrigin = parsedTarget.origin === window.location.origin;
        const isApiPath = parsedTarget.pathname.startsWith("/api/");
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined)
        );
        const hasRscHeader = headers.get("RSC") === "1" || headers.get("rsc") === "1";
        const hasRscParam = parsedTarget.searchParams.has("_rsc");
        isPrefetch =
          headers.get("Next-Router-Prefetch") === "1" ||
          headers.get("next-router-prefetch") === "1" ||
          headers.get("Next-Router-Segment-Prefetch") !== null ||
          headers.get("next-router-segment-prefetch") !== null;

        if (sameOrigin && !isApiPath && (hasRscHeader || hasRscParam)) {
          isRsc = true;
        }
        if (traceId && sameOrigin) {
          headers.set("x-zyx-trace-id", traceId);
          nextInit = { ...init, headers };
        }
      } catch {
        // Keep original init if URL/header parsing fails
      }

      const startTime = performance.now();
      const record = {
        traceId,
        url: urlStr,
        pathname: targetPathname,
        isRsc,
        isPrefetch,
        startTime,
        headersReceivedAt: null as number | null,
        completedAt: null as number | null,
        status: null as number | null,
      };
      if (isRsc && traceId && w.__zyxPerf) {
        w.__zyxPerf.fetchTraces.push(record);
      }

      const response = await originalFetch(input, nextInit);
      const headersReceivedAt = performance.now();
      record.headersReceivedAt = headersReceivedAt;
      record.status = response.status;

      if (isRsc && traceId) {
        void response
          .clone()
          .arrayBuffer()
          .then(() => {
            record.completedAt = performance.now();
          })
          .catch(() => {
            record.completedAt = performance.now();
          });
      }

      return response;
    }, window.fetch);
  });
}

async function navigateToSourcePage(
  page: Page,
  baseUrl: string,
  def: RouteMatrixDefinition,
  mode: SampleMode
): Promise<void> {
  const sourceUrl = new URL(def.sourcePath, baseUrl).toString();

  if (mode === "warm") {
    const currentPath = await page.evaluate(() => window.location.pathname).catch(() => "");
    if (currentPath === def.sourcePath) {
      return;
    }
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForFunction(
        () => {
          const w = window as unknown as { next?: { router?: unknown } };
          return Boolean(w.next?.router) && Boolean(document.querySelector("main, header"));
        },
        undefined,
        { timeout: 15_000 }
      );
      // Let initial source-page hydration and initial viewport prefetches settle before arming transition listeners
      await page.waitForTimeout(250);
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      await page.waitForTimeout(400);
    }
  }
}

async function resolveTrustedProductTrigger(
  page: Page,
  def: RouteMatrixDefinition
): Promise<{
  triggerKind: "native_link" | "dropdown_link" | "local_tab_trigger";
  selectorToClick: string;
} | null> {
  if (!def.linkSelector) {
    return null;
  }

  if (def.transitionKind === "local_tab") {
    const tabLocator = page.locator(def.linkSelector).first();
    try {
      await tabLocator.waitFor({ state: "visible", timeout: 4_000 });
      return {
        triggerKind: "local_tab_trigger",
        selectorToClick: def.linkSelector,
      };
    } catch {
      return null;
    }
  }

  if (def.dropdownTriggerSelector) {
    const directItem = page.locator(def.linkSelector).first();
    if ((await directItem.count()) > 0 && (await directItem.isVisible())) {
      return {
        triggerKind: "dropdown_link",
        selectorToClick: def.linkSelector,
      };
    }
    const menuButton = page.locator(def.dropdownTriggerSelector).first();
    try {
      await menuButton.waitFor({ state: "visible", timeout: 5_000 });
      await menuButton.click();
      await directItem.waitFor({ state: "visible", timeout: 3_000 });
      return {
        triggerKind: "dropdown_link",
        selectorToClick: def.linkSelector,
      };
    } catch {
      return null;
    }
  }

  const linkLocator = page.locator(def.linkSelector).first();
  try {
    await linkLocator.waitFor({ state: "visible", timeout: 8_000 });
    await linkLocator.scrollIntoViewIfNeeded();
    return {
      triggerKind: "native_link",
      selectorToClick: def.linkSelector,
    };
  } catch {
    return null;
  }
}

async function runSingleTransitionSample(
  context: BrowserContext,
  page: Page,
  baseUrl: string,
  def: RouteMatrixDefinition,
  mode: SampleMode,
  sampleIndex: number,
  cookieName: "better-auth.session_token" | "__Secure-better-auth.session_token",
  expectedUserIdHash: string,
  timeoutMs = 20_000
): Promise<NavigationSample> {
  const setupErrors: Array<{ status: number; method: string; url: string; phase: string }> = [];
  let setupPhase = "source";
  const setupResponse = (response: import("@playwright/test").Response) => {
    try {
      const url = new URL(response.url());
      if (url.origin === new URL(baseUrl).origin && response.status() >= 400)
        setupErrors.push({ status: response.status(), method: response.request().method(), url: safeDiagnosticPath(url.pathname), phase: setupPhase });
    } catch { /* Ignore malformed URLs. */ }
  };
  const setupConsole: string[] = [];
  let setupConsoleCount = 0;
  const setupConsoleListener = (message: { type: () => string }) => {
    if (message.type() === "error") {
      setupConsoleCount++;
      if (setupConsole.length < 10) setupConsole.push(`${setupPhase}_console_error`);
    }
  };
  page.on("console", setupConsoleListener);
  page.on("response", setupResponse);
  let activeUserIdHash: string | null = null;
  let setupFailed = false;
  try {
  if (def.authMode !== "anonymous") {
    const freshAuth = await fetchFreshSignedSessionCookie({ expectedUserIdHash });
    activeUserIdHash = freshAuth.userIdHash;
    await context.addCookies(buildVerifiedAuthCookies(baseUrl, cookieName, freshAuth.signedCookieValue));
  }

  await navigateToSourcePage(page, baseUrl, def, mode);

  } catch { setupFailed = true; }
  setupPhase = "trigger";
  let resolvedTrigger: Awaited<ReturnType<typeof resolveTrustedProductTrigger>> = null;
  try { if (!setupFailed) resolvedTrigger = await resolveTrustedProductTrigger(page, def); }
  catch { setupFailed = true; }
  page.off("response", setupResponse);
  page.off("console", setupConsoleListener);
  const traceId = `${def.routeId}-${mode}-${sampleIndex}-${Date.now()}`;

  if (!resolvedTrigger) {
    return {
      routeId: def.routeId,
      routeGroup: def.routeGroup,
      mode,
      sampleIndex,
      traceId,
      status: "failed",
      failureReasons: [setupFailed ? "SOURCE_SETUP_FAILED" : "MISSING_PRODUCT_TRIGGER"],
      triggerKind:
        def.transitionKind === "local_tab"
          ? "local_tab_trigger"
          : def.dropdownTriggerSelector
            ? "dropdown_link"
            : "native_link",
      sessionUserIdHash: activeUserIdHash,
      feedbackWithTopLoaderMs: null,
      feedbackNativeMs: null,
      ttfbMs: null,
      shellMs: null,
      primaryCommitMs: null,
      primaryVisibleReadyApproxMs: null,
      clientRscDurationMs: null,
      serverRscDurationMs: null,
      serverTimingMissingReason: "no_server_span_instrumentation",
      rscDeliveryMode: "missing",
      timingMissingReason: setupFailed ? "source_setup_failed" : "missing_product_trigger",
      rscTransferSizeBytes: null,
      rscEncodedBodyBytes: null,
      rscDecodedBodyBytes: null,
      rscRequestCount: 0,
      longTaskSupported: true,
      longTaskCount: null,
      longTaskMaxMs: null,
      layoutShiftSupported: true,
      observedTransitionLayoutShiftSum: null,
      fcmRegisterCalls: 0,
      hardNavigationDetected: false,
      httpErrorStatuses: setupErrors.map(error => error.status),
      httpErrorDetails: setupErrors,
      consoleErrorCount: setupConsoleCount,
      consoleErrorMessages: setupConsole,
      pageErrorCount: 0,
      pageErrorMessages: [],
      finalPathname: safeDiagnosticPath(await page.evaluate(() => window.location.pathname).catch(() => "")),
      finalSearch: "",
    };
  }

  if (mode === "warm") {
    await page.waitForTimeout(120);
  }

  const origin = new URL(baseUrl).origin;
  const httpErrorStatuses: number[] = setupErrors.map(error => error.status);
  const httpErrorDetails: Array<{ status: number; method: string; url: string; phase?: string }> = [...setupErrors];
  let consoleErrorCount = setupConsoleCount;
  const consoleErrorMessages: string[] = [...setupConsole];
  let pageErrorCount = 0;
  const pageErrorMessages: string[] = [];
  let mainFrameDocumentNavigated = false;
  let playwrightRscRequestCount = 0;

  const onConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === "error") {
      consoleErrorCount += 1;
      if (consoleErrorMessages.length < 10) {
        consoleErrorMessages.push("console_error");
      }
    }
  };
  const onPageError = (err: Error) => {
    pageErrorCount += 1;
    if (pageErrorMessages.length < 10) {
      pageErrorMessages.push("page_error");
    }
  };
  const onResponse = (response: {
    url: () => string;
    status: () => number;
    request: () => {
      method: () => string;
      isNavigationRequest: () => boolean;
      headers: () => Record<string, string>;
    };
    frame: () => unknown;
  }) => {
    try {
      const resUrl = new URL(response.url());
      if (resUrl.origin !== origin) return;
      const status = response.status();
      const reqHeaders = response.request().headers();
      if (status >= 400) {
        httpErrorStatuses.push(status);
        if (httpErrorDetails.length < 10) {
          httpErrorDetails.push({
            status,
            method: response.request().method(),
            url: safeDiagnosticPath(resUrl.pathname),
            phase: "transition",
          });
        }
      }
      if (
        response.request().isNavigationRequest() &&
        response.frame() === page.mainFrame()
      ) {
        mainFrameDocumentNavigated = true;
      }
      const isPrefetch =
        reqHeaders["next-router-prefetch"] === "1" ||
        reqHeaders["Next-Router-Prefetch"] === "1" ||
        Boolean(reqHeaders["next-router-segment-prefetch"]) ||
        Boolean(reqHeaders["Next-Router-Segment-Prefetch"]);
      const isTargetRsc =
        !isPrefetch &&
        resUrl.pathname === def.expectedFinalPath &&
        !resUrl.pathname.startsWith("/api/") &&
        (resUrl.searchParams.has("_rsc") ||
          reqHeaders["rsc"] === "1" ||
          reqHeaders["RSC"] === "1");
      if (isTargetRsc && reqHeaders["x-zyx-trace-id"] === traceId) {
        playwrightRscRequestCount += 1;
      }
    } catch {
      // Ignore malformed URLs
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  try {
    // Arm the in-page MutationObserver and performance state right before issuing Playwright's trusted locator.click()
    await page.evaluate(
      ({
        traceId: activeTraceId,
        expectedFinalPath,
        transitionKind,
        shellSelector,
        primarySelector,
        minPrimaryMatches,
        requiredPrimaryTextPattern,
        interactiveControlSelector,
        excludeSkeletonSelector,
        clickedSelector,
      }) => {
        const isElementVisible = (el: Element | null): boolean => {
          if (!el || !(el instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(el);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity) === 0
          ) {
            return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };

        const isControlEnabled = (el: Element | null): boolean => {
          if (!isElementVisible(el)) return false;
          if (el!.hasAttribute("disabled")) return false;
          if (el!.getAttribute("aria-disabled") === "true") return false;
          return true;
        };

        const activePanel = document.querySelector('[role="tabpanel"][data-state="active"]');
        const initialActivePanelId = activePanel?.id || activePanel?.getAttribute("aria-labelledby") || "";
        const initialPathname = window.location.pathname;
        const initialSearch = window.location.search;
        const clickedEl = document.querySelector(clickedSelector);

        const w = window as unknown as {
          __zyxPerf?: {
            docInstanceId: string;
            activeTraceId: string | null;
            fcmRegisterCalls: number;
            longTasks: Array<{ startTime: number; duration: number }>;
            layoutShifts: Array<{ startTime: number; value: number; hadRecentInput: boolean }>;
            fetchTraces: Array<{
              traceId: string | null;
              url: string;
              pathname: string;
              isRsc: boolean;
              isPrefetch: boolean;
              startTime: number;
              headersReceivedAt: number | null;
              completedAt: number | null;
              status: number | null;
            }>;
          };
          __zyxActiveTransition?: {
            tClick: number;
            initialDocInstanceId: string;
            initialNavCount: number;
            initialResourceCount: number;
            initialFcmCalls: number;
            feedbackWithTopLoaderAt: number | null;
            feedbackNativeAt: number | null;
            shellAt: number | null;
            primaryCommitAt: number | null;
            localTabChanged: boolean;
            errorBoundaryVisible: boolean;
            checkConditions: () => void;
            observer: MutationObserver;
          };
        };

        if (w.__zyxPerf) {
          w.__zyxPerf.activeTraceId = activeTraceId;
        }

        const textRegex = requiredPrimaryTextPattern
          ? new RegExp(requiredPrimaryTextPattern, "i")
          : null;

        const state = {
          tClick: performance.now(),
          initialDocInstanceId: w.__zyxPerf?.docInstanceId ?? "",
          initialNavCount: performance.getEntriesByType("navigation").length,
          initialResourceCount: performance.getEntriesByType("resource").length,
          initialFcmCalls: w.__zyxPerf?.fcmRegisterCalls ?? 0,
          feedbackWithTopLoaderAt: null as number | null,
          feedbackNativeAt: null as number | null,
          shellAt: null as number | null,
          primaryCommitAt: null as number | null,
          localTabChanged: false,
          errorBoundaryVisible: false,
          checkConditions: () => {},
          observer: null as unknown as MutationObserver,
        };

        const checkConditions = () => {
          const now = performance.now();
          const pathnameMatched =
            transitionKind === "local_tab"
              ? window.location.pathname === expectedFinalPath
              : window.location.pathname === expectedFinalPath &&
                window.location.pathname !== initialPathname;

          const currentActivePanel = document.querySelector(
            '[role="tabpanel"][data-state="active"]'
          );
          const currentActivePanelId =
            currentActivePanel?.id ||
            currentActivePanel?.getAttribute("aria-labelledby") ||
            "";
          const tabSelected =
            clickedEl?.getAttribute("aria-selected") === "true" ||
            clickedEl?.getAttribute("data-state") === "active";
          const localTabChanged =
            transitionKind === "local_tab"
              ? Boolean(
                  tabSelected &&
                    currentActivePanel &&
                    currentActivePanelId !== initialActivePanelId &&
                    window.location.search !== initialSearch
                )
              : true;

          state.localTabChanged = localTabChanged;

          const hasTopLoader = Boolean(document.getElementById("nprogress"));
          const skeletonEls = Array.from(document.querySelectorAll(excludeSkeletonSelector));
          const hasVisibleSkeleton = skeletonEls.some((el) => isElementVisible(el));
          const hasNativePending =
            hasVisibleSkeleton ||
            Boolean(document.querySelector('[data-pending="true"], [data-loading="true"]')) ||
            (transitionKind === "route_navigation" ? pathnameMatched : localTabChanged);

          if (state.feedbackWithTopLoaderAt === null && (hasTopLoader || hasNativePending)) {
            state.feedbackWithTopLoaderAt = now;
          }
          if (state.feedbackNativeAt === null && hasNativePending) {
            state.feedbackNativeAt = now;
          }

          const errorEls = Array.from(
            document.querySelectorAll(
              '[role="alert"][data-variant="destructive"], [data-slot="error-state"], [data-testid="error-state"]'
            )
          );
          state.errorBoundaryVisible = errorEls.some((el) => isElementVisible(el));

          if (pathnameMatched && localTabChanged) {
            const shellEls = Array.from(document.querySelectorAll(shellSelector));
            if (state.shellAt === null && shellEls.some((el) => isElementVisible(el))) {
              state.shellAt = now;
            }

            const primaryEls = Array.from(document.querySelectorAll(primarySelector)).filter(
              (el) => {
                if (!isElementVisible(el)) return false;
                const txt = el.textContent?.trim() ?? "";
                if (txt.length === 0) return false;
                if (textRegex && !textRegex.test(txt)) return false;
                return true;
              }
            );

            const interactiveEls = Array.from(
              document.querySelectorAll(interactiveControlSelector)
            ).filter((el) => isControlEnabled(el));

            if (
              state.primaryCommitAt === null &&
              primaryEls.length >= (minPrimaryMatches ?? 1) &&
              interactiveEls.length >= 1 &&
              !hasVisibleSkeleton &&
              !state.errorBoundaryVisible
            ) {
              state.primaryCommitAt = now;
              if (state.shellAt === null) {
                state.shellAt = now;
              }
              if (state.feedbackNativeAt === null) {
                state.feedbackNativeAt = now;
              }
              if (state.feedbackWithTopLoaderAt === null) {
                state.feedbackWithTopLoaderAt = now;
              }
            }
          }
        };

        state.checkConditions = checkConditions;
        const observer = new MutationObserver(() => {
          checkConditions();
        });
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: [
            "aria-selected",
            "aria-current",
            "data-state",
            "data-pending",
            "data-loading",
            "disabled",
            "class",
            "style",
          ],
        });
        state.observer = observer;
        w.__zyxActiveTransition = state;
      },
      {
        traceId,
        expectedFinalPath: def.expectedFinalPath,
        transitionKind: def.transitionKind,
        shellSelector: def.shellSelector,
        primarySelector: def.primarySelector,
        minPrimaryMatches: def.minPrimaryMatches ?? 1,
        requiredPrimaryTextPattern: def.requiredPrimaryTextPattern,
        interactiveControlSelector: def.interactiveControlSelector,
        excludeSkeletonSelector: def.excludeSkeletonSelector,
        clickedSelector: resolvedTrigger.selectorToClick,
      }
    );

    // Issue trusted Playwright click on the real product element
    await page.locator(resolvedTrigger.selectorToClick).first().click({ timeout: 5_000 });

    // Await primary readiness commit + two sequential post-commit requestAnimationFrame callbacks
    const rawResult = await page.evaluate(
      async ({
        timeoutMs: maxWaitMs,
        traceId: activeTraceId,
        expectedFinalPath,
      }) => {
        const w = window as unknown as {
          __zyxDocInstanceId?: string;
          __zyxPerf?: {
            docInstanceId: string;
            activeTraceId: string | null;
            longTaskSupported: boolean;
            layoutShiftSupported: boolean;
            fcmRegisterCalls: number;
            longTasks: Array<{ startTime: number; duration: number }>;
            layoutShifts: Array<{ startTime: number; value: number; hadRecentInput: boolean }>;
            fetchTraces: Array<{
              traceId: string | null;
              url: string;
              pathname: string;
              isRsc: boolean;
              isPrefetch: boolean;
              startTime: number;
              headersReceivedAt: number | null;
              completedAt: number | null;
              status: number | null;
            }>;
          };
          __zyxActiveTransition?: {
            tClick: number;
            initialDocInstanceId: string;
            initialNavCount: number;
            initialResourceCount: number;
            initialFcmCalls: number;
            feedbackWithTopLoaderAt: number | null;
            feedbackNativeAt: number | null;
            shellAt: number | null;
            primaryCommitAt: number | null;
            localTabChanged: boolean;
            errorBoundaryVisible: boolean;
            checkConditions: () => void;
            observer: MutationObserver;
          };
        };

        const st = w.__zyxActiveTransition;
        if (!st) {
          throw new Error("Transition state missing after click (hard reload may have occurred)");
        }

        st.checkConditions();
        const deadline = st.tClick + maxWaitMs;
        while (st.primaryCommitAt === null && performance.now() < deadline) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          st.checkConditions();
        }

        st.observer.disconnect();
        if (w.__zyxPerf) {
          w.__zyxPerf.activeTraceId = null;
        }

        const timedOut = st.primaryCommitAt === null;
        let primaryVisibleReadyApproxAt: number | null = null;
        if (!timedOut) {
          // Wait two post-commit animation frames for approximate visible-ready timestamp
          await new Promise((resolve) => requestAnimationFrame(resolve));
          await new Promise((resolve) => requestAnimationFrame(resolve));
          primaryVisibleReadyApproxAt = performance.now();
        }

        const windowEnd = primaryVisibleReadyApproxAt ?? performance.now();

        // A 200 ms diagnostic window after the primary frames, not full app completion.
        await new Promise((resolve) => setTimeout(resolve, 200));
        st.checkConditions();

        const matchedTraces = (w.__zyxPerf?.fetchTraces ?? []).filter(
          (ft) =>
            ft.isRsc &&
            !ft.isPrefetch &&
            ft.pathname === expectedFinalPath &&
            ft.traceId === activeTraceId &&
            ft.startTime >= st.tClick - 5 &&
            ft.startTime <= windowEnd
        );

        const tracePathnames = new Set<string>();
        for (const t of matchedTraces) {
          try {
            const u = new URL(t.url, window.location.origin);
            tracePathnames.add(u.pathname + u.search);
          } catch {
            // Ignore
          }
        }

        const recentResources = (
          performance.getEntriesByType("resource").slice(st.initialResourceCount) as PerformanceResourceTiming[]
        ).filter((entry) => {
          if (entry.startTime < st.tClick - 5 || entry.startTime > windowEnd) {
            return false;
          }
          try {
            const parsed = new URL(entry.name, window.location.origin);
            if (parsed.origin !== window.location.origin) return false;
            if (parsed.pathname !== expectedFinalPath) return false;
            if (parsed.pathname.startsWith("/api/")) return false;
            if (tracePathnames.size > 0) {
              return tracePathnames.has(parsed.pathname + parsed.search);
            }
            return parsed.searchParams.has("_rsc");
          } catch {
            return false;
          }
        });

        const docInstanceChanged =
          (w.__zyxPerf?.docInstanceId ?? "") !== st.initialDocInstanceId;
        const navEntryAdded =
          performance.getEntriesByType("navigation").length > st.initialNavCount;

        return {
          tClick: st.tClick,
          windowEnd,
          timedOut,
          localTabChanged: st.localTabChanged,
          errorBoundaryVisible: st.errorBoundaryVisible,
          feedbackWithTopLoaderAt: st.feedbackWithTopLoaderAt,
          feedbackNativeAt: st.feedbackNativeAt,
          shellAt: st.shellAt,
          primaryCommitAt: st.primaryCommitAt,
          primaryVisibleReadyApproxAt,
          matchedTraces,
          rscResources: recentResources.map((r) => ({
            name: r.name,
            startTime: r.startTime,
            responseStart: r.responseStart,
            responseEnd: r.responseEnd,
            duration: r.duration,
            transferSize: r.transferSize,
            encodedBodySize: r.encodedBodySize,
            decodedBodySize: r.decodedBodySize,
          })),
          longTaskSupported: w.__zyxPerf?.longTaskSupported ?? false,
          allLongTasks: w.__zyxPerf?.longTasks ?? [],
          layoutShiftSupported: w.__zyxPerf?.layoutShiftSupported ?? false,
          allLayoutShifts: w.__zyxPerf?.layoutShifts ?? [],
          fcmRegisterCalls: (w.__zyxPerf?.fcmRegisterCalls ?? st.initialFcmCalls) - st.initialFcmCalls,
          inPageHardNavDetected: docInstanceChanged || navEntryAdded,
          finalPathname: window.location.pathname,
          finalSearch: window.location.search,
        };
      },
      { timeoutMs, traceId, expectedFinalPath: def.expectedFinalPath }
    );

    const hardNavigationDetected =
      mainFrameDocumentNavigated || rawResult.inPageHardNavDetected;

    const gateEvaluation = evaluateSampleGates({
      timedOut: rawResult.timedOut,
      transitionKind: def.transitionKind,
      finalPathname: rawResult.finalPathname,
      expectedFinalPath: def.expectedFinalPath,
      localTabChanged: rawResult.localTabChanged,
      hardNavigationDetected,
      httpErrorStatuses,
      consoleErrorCount,
      pageErrorCount,
      errorBoundaryVisible: rawResult.errorBoundaryVisible,
    });

    const rscRequestCount = Math.max(
      rawResult.rscResources.length,
      rawResult.matchedTraces.length,
      playwrightRscRequestCount
    );

    let rscDeliveryMode: RscDeliveryMode;
    let timingMissingReason: string | null = null;
    let ttfbMs: number | null = null;
    let clientRscDurationMs: number | null = null;
    let rscTransferSizeBytes: number | null = null;
    let rscEncodedBodyBytes: number | null = null;
    let rscDecodedBodyBytes: number | null = null;

    if (def.transitionKind === "local_tab") {
      rscDeliveryMode = "local_in_memory";
      timingMissingReason = "local_tab_no_rsc_request";
    } else if (rscRequestCount === 0) {
      rscDeliveryMode = "client_cache_or_prefetched";
      timingMissingReason = "served_from_client_router_cache_or_prefetch";
    } else {
      rscDeliveryMode = "network_fetched";
      if (rawResult.rscResources.length > 0) {
        const firstRsc = rawResult.rscResources[0]!;
        ttfbMs =
          firstRsc.responseStart > firstRsc.startTime
            ? roundMetric(firstRsc.responseStart - firstRsc.startTime)
            : null;
        clientRscDurationMs = roundMetric(
          Math.max(...rawResult.rscResources.map((r) => r.duration))
        );
        rscTransferSizeBytes = rawResult.rscResources.reduce(
          (sum, r) => sum + r.transferSize,
          0
        );
        rscEncodedBodyBytes = rawResult.rscResources.reduce(
          (sum, r) => sum + r.encodedBodySize,
          0
        );
        rscDecodedBodyBytes = rawResult.rscResources.reduce(
          (sum, r) => sum + r.decodedBodySize,
          0
        );
        if (ttfbMs === null) {
          timingMissingReason = "resource_timing_response_start_unavailable";
        }
      } else if (rawResult.matchedTraces.length > 0) {
        const firstTrace = rawResult.matchedTraces[0]!;
        if (firstTrace.headersReceivedAt !== null) {
          ttfbMs = roundMetric(Math.max(0, firstTrace.headersReceivedAt - firstTrace.startTime));
        }
        const completed = firstTrace.completedAt ?? firstTrace.headersReceivedAt;
        if (completed !== null) {
          clientRscDurationMs = roundMetric(Math.max(0, completed - firstTrace.startTime));
        }
        timingMissingReason = "resource_timing_entry_not_buffered_for_bytes";
      } else {
        timingMissingReason = "playwright_observed_rsc_without_in_page_resource_entry";
      }
    }

    const overlappingLongTasks = rawResult.longTaskSupported
      ? filterOverlappingLongTasks(
          rawResult.allLongTasks,
          rawResult.tClick,
          rawResult.windowEnd
        )
      : [];
    const longTaskCount = rawResult.longTaskSupported ? overlappingLongTasks.length : null;
    const longTaskMaxMs = rawResult.longTaskSupported
      ? overlappingLongTasks.length > 0
        ? roundMetric(Math.max(...overlappingLongTasks.map((lt) => lt.duration)))
        : 0
      : null;

    const overlappingShifts = rawResult.layoutShiftSupported
      ? rawResult.allLayoutShifts.filter(
          (s) =>
            !s.hadRecentInput &&
            s.startTime >= rawResult.tClick &&
            s.startTime <= rawResult.windowEnd
        )
      : [];
    const observedTransitionLayoutShiftSum = rawResult.layoutShiftSupported
      ? roundMetric(overlappingShifts.reduce((sum, s) => sum + s.value, 0))
      : null;

    const toDeltaOrNull = (timestamp: number | null): number | null =>
      timestamp !== null ? roundMetric(Math.max(0, timestamp - rawResult.tClick)) : null;

    return {
      routeId: def.routeId,
      routeGroup: def.routeGroup,
      mode,
      sampleIndex,
      traceId,
      status: gateEvaluation.status,
      failureReasons: gateEvaluation.failureReasons,
      triggerKind: resolvedTrigger.triggerKind,
      sessionUserIdHash: activeUserIdHash,
      feedbackWithTopLoaderMs: toDeltaOrNull(rawResult.feedbackWithTopLoaderAt),
      feedbackNativeMs: toDeltaOrNull(rawResult.feedbackNativeAt),
      ttfbMs,
      shellMs: toDeltaOrNull(rawResult.shellAt),
      primaryCommitMs: rawResult.timedOut ? null : toDeltaOrNull(rawResult.primaryCommitAt),
      primaryVisibleReadyApproxMs: rawResult.timedOut
        ? null
        : toDeltaOrNull(rawResult.primaryVisibleReadyApproxAt),
      clientRscDurationMs,
      serverRscDurationMs: null,
      serverTimingMissingReason: "no_server_span_instrumentation",
      rscDeliveryMode,
      timingMissingReason,
      rscTransferSizeBytes,
      rscEncodedBodyBytes,
      rscDecodedBodyBytes,
      rscRequestCount,
      longTaskSupported: rawResult.longTaskSupported,
      longTaskCount,
      longTaskMaxMs,
      layoutShiftSupported: rawResult.layoutShiftSupported,
      observedTransitionLayoutShiftSum,
      fcmRegisterCalls: rawResult.fcmRegisterCalls,
      hardNavigationDetected,
      httpErrorStatuses,
      httpErrorDetails,
      consoleErrorCount,
      consoleErrorMessages,
      pageErrorCount,
      pageErrorMessages,
      finalPathname: safeDiagnosticPath(rawResult.finalPathname),
      finalSearch: "",
    };
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
}

function formatNullablePair(p50: number | null, p95: number | null): string {
  if (p50 === null && p95 === null) return "null";
  return `${p50 ?? "null"} / ${p95 ?? "null"}`;
}

function formatNullableTriplet(
  p50: number | null,
  p75: number | null,
  p95: number | null
): string {
  if (p50 === null && p75 === null && p95 === null) return "null";
  return `${p50 ?? "null"} / ${p75 ?? "null"} / ${p95 ?? "null"}`;
}

function formatColdDescriptive(metric: ColdDescriptiveMetric): string {
  if (metric.sampleCount === 0) return "null";
  const rawStr = metric.rawValues.map((v) => (v === null ? "null" : String(v))).join(", ");
  return `min=${metric.min}, p50=${metric.p50}, max=${metric.max} [${rawStr}]`;
}

export function renderBaselineMarkdownReport(artifact: BaselineRunArtifact): string {
  const lines: string[] = [];
  lines.push(artifact.buildProvenance.buildKind === "candidate" ? "# Navigation Performance Candidate Report (Schema v2)" : "# Navigation Performance Baseline Report (Pre-Optimization, Schema v2)");
  lines.push("Warm p95 requires at least 40 valid values. Smaller runs are smoke evidence only.");
  lines.push("");
  lines.push(
    "> **Note on Prior Report**: The earlier 2026-11-05T21:57:33.917Z 40-sample baseline report is marked **INVALID** (`baseline-report.INVALID-2026-11-05.md`) due to pre-fix route ID/selector/cached-RSC-zeroing issues identified in the methodology review."
  );
  lines.push("");
  lines.push(`- **Viewport**: ${artifact.viewport.name} (${artifact.viewport.width} x ${artifact.viewport.height})`);
  lines.push(`- **Captured At**: \`${artifact.capturedAtIso}\``);
  lines.push(`- **Base URL (Owned Loopback Server)**: \`${artifact.baseUrl}\``);
  lines.push(
    `- **Build ID**: \`${artifact.buildProvenance.buildId}\` (built \`${artifact.buildProvenance.buildTimestampIso}\`, pre-optimization verified: \`${artifact.buildProvenance.isOriginalPreOptimizationBuild}\`)`
  );
  lines.push(`- **Neon Project ID**: \`${artifact.environmentVerification.projectId}\``);
  lines.push(
    `- **Neon Staging Branch ID**: \`${artifact.environmentVerification.branchId}\` (distinct from production \`${artifact.environmentVerification.productionBranchId}\`: \`${artifact.environmentVerification.distinctFromProduction}\`)`
  );
  lines.push(`- **Database Host Hash**: \`${artifact.environmentVerification.hostHash}\``);
  lines.push(
    `- **Read-Only Session Enforced**: \`${artifact.environmentVerification.readOnlyEnforced}\``
  );
  lines.push(
    `- **Verified Session Cookie Name**: \`${artifact.sessionCookieProbe.cookieName ?? "none"}\` (user hash: \`${artifact.sessionCookieProbe.userIdHash ?? "none"}\`)`
  );
  lines.push(
    `- **Sampled Fixture Counts Equal (Pre == Post)**: \`${artifact.sampledFixtureCountsEqual}\` (${artifact.sampledFixtureCountsNote})`
  );
  lines.push(`- **Warm Samples Per Route**: \`${artifact.warmSamplesPerRoute}\``);
  lines.push(
    `- **Browser-Context-Cold Samples Per Route**: \`${artifact.browserContextColdSamplesPerRoute}\``
  );
  lines.push("");
  lines.push(
    "## 1. Warm Sequential SPA Transitions (Valid Samples Only, Percentiles in ms)"
  );
  lines.push("");
  lines.push(
    "_Note: `Primary Commit` is DOM readiness commit; `Primary Approx Visible-Ready` adds two sequential post-commit `requestAnimationFrame` ticks as an approximation (not a hardware paint guarantee). Warm transitions served from the Next.js router cache or prefetch report `null` network TTFB/RSC timings rather than coercing missing network requests to `0`._"
  );
  lines.push("");
  lines.push(
    "| Route | Group | Transition | Status | Valid / Failed | Net / Cache / Local | Feedback (#nprogress) p50 / p95 | Native Feedback p50 / p95 | TTFB p50 / p95 | Shell p50 / p95 | Primary Commit p50 / p75 / p95 | Primary Approx Visible-Ready p50 / p75 / p95 | Client RSC Duration p50 / p95 | RSC Transfer / Encoded / Decoded p50 (B) | Max LongTask p95 | Observed Layout Shift Sum p95 | FCM Calls |"
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  );

  for (const r of artifact.routes) {
    if (!r.warmMetrics || r.warmValidSampleCount === 0) {
      lines.push(
        `| **${r.routeId}** | \`${r.routeGroup}\` | \`${r.sourcePath}\` -> \`${r.targetPath}\` | \`${r.status}\` | ${r.warmValidSampleCount} / ${r.warmFailedSampleCount} | 0 / 0 / 0 | null | null | null | null | null | null | null | null | null | null | 0 |`
      );
      continue;
    }
    const m = r.warmMetrics;
    const bytesCell = `${m.rscTransferSizeBytes.p50 ?? "null"} / ${m.rscEncodedBodyBytes.p50 ?? "null"} / ${m.rscDecodedBodyBytes.p50 ?? "null"}`;
    lines.push(
      `| **${r.routeId}** | \`${r.routeGroup}\` | \`${r.sourcePath}\` -> \`${r.targetPath}\` | \`${r.status}\` | ${r.warmValidSampleCount} / ${r.warmFailedSampleCount} | ${m.networkFetchedCount} / ${m.cacheOrPrefetchedCount} / ${m.localInMemoryCount} | ${formatNullablePair(m.feedbackWithTopLoaderMs.p50, m.feedbackWithTopLoaderMs.p95)} | ${formatNullablePair(m.feedbackNativeMs.p50, m.feedbackNativeMs.p95)} | ${formatNullablePair(m.ttfbMs.p50, m.ttfbMs.p95)} | ${formatNullablePair(m.shellMs.p50, m.shellMs.p95)} | ${formatNullableTriplet(m.primaryCommitMs.p50, m.primaryCommitMs.p75, m.primaryCommitMs.p95)} | **${formatNullableTriplet(m.primaryVisibleReadyApproxMs.p50, m.primaryVisibleReadyApproxMs.p75, m.primaryVisibleReadyApproxMs.p95)}** | ${formatNullablePair(m.clientRscDurationMs.p50, m.clientRscDurationMs.p95)} | ${bytesCell} | ${m.longTaskMaxMs.p95 ?? "null"} | ${m.observedTransitionLayoutShiftSum.p95 ?? "null"} | ${m.fcmRegisterCallsTotal} |`
    );
  }

  lines.push("");
  lines.push(
    "## 2. Browser-Context-Cold SPA Transitions (Raw Values + Min / Median / Max in ms, No p95)"
  );
  lines.push("");
  lines.push(
    "_Note: `browser-context-cold` uses a fresh Playwright `BrowserContext` per sample against the warm local production server and Neon pooler (not container-cold or DB-cold). Because `N` is small, only raw values, `min`, `p50` (median), and `max` are reported._"
  );
  lines.push("");
  lines.push(
    "| Route | Transition | Status | Valid / Failed | Primary Commit (min / p50 / max [raw]) | Primary Approx Visible-Ready (min / p50 / max [raw]) | TTFB (min / p50 / max [raw]) | Client RSC Duration (min / p50 / max [raw]) | RSC Transfer / Encoded / Decoded p50 (B) |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");

  for (const r of artifact.routes) {
    if (!r.browserContextColdMetrics || r.coldValidSampleCount === 0) {
      lines.push(
        `| **${r.routeId}** | \`${r.sourcePath}\` -> \`${r.targetPath}\` | \`${r.status}\` | ${r.coldValidSampleCount} / ${r.coldFailedSampleCount} | null | null | null | null | null |`
      );
      continue;
    }
    const m = r.browserContextColdMetrics;
    const bytesCell = `${m.rscTransferSizeBytes.p50 ?? "null"} / ${m.rscEncodedBodyBytes.p50 ?? "null"} / ${m.rscDecodedBodyBytes.p50 ?? "null"}`;
    lines.push(
      `| **${r.routeId}** | \`${r.sourcePath}\` -> \`${r.targetPath}\` | \`${r.status}\` | ${r.coldValidSampleCount} / ${r.coldFailedSampleCount} | ${formatColdDescriptive(m.primaryCommitMs)} | **${formatColdDescriptive(m.primaryVisibleReadyApproxMs)}** | ${formatColdDescriptive(m.ttfbMs)} | ${formatColdDescriptive(m.clientRscDurationMs)} | ${bytesCell} |`
    );
  }

  lines.push("");
  lines.push("## 3. Route Classifications, Blockers, and Staging Fixture Boundaries");
  lines.push("");
  for (const r of artifact.routes) {
    lines.push(
      `- **${r.routeId} (${r.label})** [\`${r.status}\`]: ${r.boundaryNote ?? "Measured via trusted Playwright locator click with strict primary data and interactive readiness gates."}`
    );
    const failedForRoute = artifact.rawSamples.filter(
      (s) => s.routeId === r.routeId && s.status === "failed"
    );
    if (failedForRoute.length > 0) {
      const reasons = Array.from(new Set(failedForRoute.flatMap((s) => s.failureReasons))).join(
        ", "
      );
      const commits = failedForRoute
        .map((s) => `${s.mode}#${s.sampleIndex}:${s.primaryCommitMs ?? "null"}ms`)
        .join(", ");
      const firstPageErr = failedForRoute.flatMap((s) => s.pageErrorMessages)[0] ?? null;
      const firstConsoleErr =
        failedForRoute.flatMap((s) => s.consoleErrorMessages)[0]?.split("\n")[0] ?? null;
      lines.push(
        `  - Gate failure diagnostics (${failedForRoute.length} sample(s) excluded from valid percentiles): reasons=\`${reasons}\`; observed primaryCommitMs=[${commits}]${firstPageErr ? `; pageError=\`${firstPageErr}\`` : ""}${firstConsoleErr ? `; consoleError=\`${firstConsoleErr}\`` : ""}.`
      );
    }
  }

  lines.push("");
  lines.push("## 4. Sampled Reference Table Counts (Pre-Run vs Post-Run)");
  lines.push("");
  lines.push("| Sampled Reference Metric | Pre-Run | Post-Run |");
  lines.push("| --- | --- | --- |");
  for (const key of Object.keys(artifact.preRunFixtures.sampledCounts) as Array<
    keyof DiscoveredRouteFixtures["sampledCounts"]
  >) {
    lines.push(
      `| \`${key}\` | ${artifact.preRunFixtures.sampledCounts[key]} | ${artifact.postRunFixtures.sampledCounts[key]} |`
    );
  }

  return lines.join("\n") + "\n";
}

export function buildVerifiedAuthCookies(
  baseUrl: string,
  cookieName: "better-auth.session_token" | "__Secure-better-auth.session_token",
  signedCookieValue: string
): Parameters<BrowserContext["addCookies"]>[0] {
  const url = validateLoopbackBaseUrl(baseUrl);
  const isSecureCookie = cookieName.startsWith("__Secure-") || url.protocol === "https:";
  return [
    {
      name: cookieName,
      value: signedCookieValue,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: isSecureCookie,
      sameSite: "Lax",
    },
  ];
}

async function isPortAlreadyListening(baseUrl: string, signal?: AbortSignal): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  try {
    const res = await fetch(new URL("/sign-in", baseUrl).toString(), {
      redirect: "manual",
      signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
    });
    return res.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function stopOwnedServer(child: ChildProcess | null): Promise<void> {
  if (child?.pid) await stopProcessGroup(child.pid);
}

export async function spawnOwnedLocalProductionServer(baseUrl: string, buildKind: BuildKind, verification: SanitizedTargetVerification, buildProvenance: BuildProvenanceVerification, signal?: AbortSignal): Promise<{
  child: ChildProcess;
  bannerVerified: boolean;
}> {
  const parsed = validateLoopbackBaseUrl(baseUrl);
  signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(115_000)]) : AbortSignal.timeout(115_000);
  signal.throwIfAborted();
  if ((await linuxInspector.listeners(Number(parsed.port || (parsed.protocol === "https:" ? 443 : 3100)), signal)).length > 0) {
    throw new Error(
      `EXTERNAL_SERVER_ALREADY_LISTENING: Refusing to reuse an existing unowned listener at ${baseUrl}. Stop any running server so the harness can spawn and verify the owned original pre-optimization server.`
    );
  }

  signal?.throwIfAborted();
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "3100");
  const child = spawn(
    "bun",
    ["scripts/performance/run-next-staging.ts", "start", "--build-kind", buildKind, "--port", port],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    }
  );

  const serverCategories: Record<string, number> = {};
  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8").toLowerCase();
    for (const [category, pattern] of Object.entries({ read_only: /read.only/, statement_timeout: /statement timeout/, pool_timeout: /pool.{0,20}timeout/ })) {
      if (pattern.test(text)) serverCategories[category] = (serverCategories[category] ?? 0) + 1;
    }
    mkdirSync(resolve("artifacts/performance"), { recursive: true });
    writeFileSync(resolve("artifacts/performance/server-errors.json"), JSON.stringify(serverCategories), "utf8");
  });
  let bannerVerified = false;
  let stdoutBuffer = "";

  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutBuffer += chunk.toString("utf8");
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        const parsedLine = JSON.parse(trimmed) as {
          launcher?: string;
          buildKind?: string;
          verification?: { hostHash?: string; readOnlyEnforced?: boolean };
          buildProvenance?: { buildId?: string; isOriginalPreOptimizationBuild?: boolean };
        };
        if (
          parsedLine.launcher === "run-next-staging" &&
          parsedLine.buildKind === buildKind &&
          parsedLine.verification?.hostHash === verification.hostHash &&
          parsedLine.verification?.readOnlyEnforced === true &&
          parsedLine.buildProvenance?.buildId === buildProvenance.buildId &&
          parsedLine.buildProvenance?.isOriginalPreOptimizationBuild === (buildKind === "baseline")
        ) {
          bannerVerified = true;
        }
      } catch {
        // Ignore non-JSON stdout lines
      }
    }
  });

  let spawnError: Error | undefined;
  child.on("error", (error) => { spawnError = error; });
  await awaitOwnedReadiness({
    now: () => Date.now(),
    sleep: (ms, waitSignal) => new Promise<void>((resolve, reject) => {
      const done = () => { waitSignal.removeEventListener("abort", aborted); resolve(); };
      const timer = setTimeout(done, ms);
      const aborted = () => { clearTimeout(timer); waitSignal.removeEventListener("abort", aborted); reject(waitSignal.reason); };
      waitSignal.addEventListener("abort", aborted, { once: true });
      if (waitSignal.aborted) aborted();
    }),
    inspect: (inspectionSignal) => {
      if (spawnError) throw spawnError;
      if (!child.pid) return Promise.resolve(false);
      return verifyListenerOwnership(Number(port), child.pid, linuxInspector, inspectionSignal);
    },
    probe: (probeSignal) => isPortAlreadyListening(baseUrl, probeSignal),
    banner: () => bannerVerified,
    isAlive: () => { if (spawnError) throw spawnError; return child.exitCode === null && child.signalCode === null; },
    cleanup: () => stopOwnedServer(child),
  }, 115_000, signal);
  return { child, bannerVerified: true };
}

export function parseHarnessArgs(args: string[]) {
  let baseUrl = "http://localhost:3100";
  let buildKind: BuildKind = "baseline";
  let serverRecord: string | null = null;
  let warmSamples = 40;
  let coldSamples = 3;
  let includeExploratory = false;
  let viewport: ViewportName = "desktop";
  let explicitOutputDir: string | null = null;
  let routes: RouteId[] | null = null;
  const value = (i: number) => {
    const v = args[i + 1];
    if (!v || v.startsWith("--")) throw new Error(`MISSING_VALUE:${args[i]}`);
    return v;
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--include-exploratory") { includeExploratory = true; continue; }
    if (!["--build-kind", "--server-record", "--base-url", "--warm-samples", "--cold-samples", "--output-dir", "--viewport", "--routes"].includes(arg!)) throw new Error(`UNKNOWN_ARGUMENT:${arg}`);
    const v = value(i++);
    if (arg === "--routes") {
      const ids = v.split(",");
      if (!ids.length || ids.some(id => !/^(R[1-8]|E[1-3])$/.test(id)) || new Set(ids).size !== ids.length) throw new Error("INVALID_ROUTES");
      routes = ids as RouteId[];
      if (ids.some(id => id.startsWith("E"))) includeExploratory = true;
    } else if (arg === "--build-kind") buildKind = parseBuildKind(v);
    else if (arg === "--server-record") serverRecord = resolve(v);
    else if (arg === "--base-url") baseUrl = v;
    else if (arg === "--warm-samples" || arg === "--cold-samples") {
      if (!/^[0-9]+$/.test(v)) throw new Error(`INVALID_SAMPLE_COUNT:${arg}`);
      const count = Number(v);
      if (!Number.isSafeInteger(count) || count > 1000 || count < (arg === "--warm-samples" ? 1 : 0)) throw new Error(`INVALID_SAMPLE_COUNT:${arg}`);
      if (arg === "--warm-samples") warmSamples = count; else coldSamples = count;
    } else if (arg === "--output-dir") explicitOutputDir = resolve(v);
    else if (arg === "--viewport") {
      if (v !== "mobile" && v !== "desktop") throw new Error("INVALID_VIEWPORT");
      viewport = v;
    }
  }
  const outputDir = explicitOutputDir ?? resolve(`artifacts/performance/${buildKind}/${viewport}`);
  if (buildKind === "candidate" && [resolve("artifacts/performance/baseline"), resolve("artifacts/performance/original-baseline")].includes(outputDir)) throw new Error("CANDIDATE_CANNOT_OVERWRITE_BASELINE");
  return { baseUrl, buildKind, serverRecord, warmSamples, coldSamples, includeExploratory, viewport, outputDir, routes };
}

async function main() {
  const { baseUrl, buildKind, serverRecord, warmSamples, coldSamples, includeExploratory, viewport, outputDir, routes } = parseHarnessArgs(process.argv.slice(2));
  const parsedBaseUrl = validateLoopbackBaseUrl(baseUrl);
  const port = Number(parsedBaseUrl.port || 3100);
  const verification = loadVerifiedStagingEnvironment({ port });
  const buildProvenance = verifyBuild(buildKind, verification);

  const preRunFixtures = await probeReadOnlySessionAndFixtures();
  const expectedUserIdHash = preRunFixtures.sessionUserSummary.userIdHash;
  if (!expectedUserIdHash) {
    throw new Error("NO_ACTIVE_ADMIN_FIXTURE_USER: No active admin session user found in Neon staging");
  }

  const initialAuth = await fetchFreshSignedSessionCookie({ expectedUserIdHash });
  const matrix = buildRouteMatrixDefinitions(preRunFixtures, { includeExploratory }).filter(def => !routes || routes.includes(def.routeId));
  const rawSamples: NavigationSample[] = [];
  const routeSummaries: RouteSummary[] = [];
  mkdirSync(outputDir, { recursive: true });
  const checkpoint = () => writeCheckpointAtomic(resolve(outputDir, "checkpoint.json"), { schemaVersion: 1, rawSamples, routes: routeSummaries });

  let spawnedServer: ChildProcess | null = null;
  if (serverRecord) {
    const record = JSON.parse(readFileSync(serverRecord, "utf8"));
    if (record.launcher !== "run-next-staging" || record.buildKind !== buildKind || record.port !== port ||
        JSON.stringify(record.verification) !== JSON.stringify(verification) ||
        JSON.stringify(record.buildProvenance) !== JSON.stringify(buildProvenance)) throw new Error("OWNED_SERVER_RECORD_MISMATCH");
    process.kill(record.pid, 0);
    const cmdline = readFileSync(`/proc/${record.pid}/cmdline`, "utf8");
    if (!cmdline.includes("run-next-staging.ts") || !cmdline.includes(serverRecord)) throw new Error("UNOWNED_SERVER_PROCESS");
    if (!(await verifyListenerOwnership(port, record.pid)) || !(await isPortAlreadyListening(baseUrl)) || !(await verifyListenerOwnership(port, record.pid))) throw new Error("OWNED_SERVER_NOT_LISTENING");
  } else {
    spawnedServer = (await spawnOwnedLocalProductionServer(baseUrl, buildKind, verification, buildProvenance)).child;
  }
  const browser = await chromium.launch({ headless: true });

  let sessionCookieProbe: SessionCookieProbeResult = {
    verified: false,
    cookieName: null,
    userIdHash: null,
    failureReason: "NOT_PROBED",
  };

  try {
    sessionCookieProbe = await probeSessionCookieName(
      baseUrl,
      initialAuth.signedCookieValue,
      expectedUserIdHash
    );

    const createConfiguredContext = async (): Promise<{
      context: BrowserContext;
      page: Page;
    }> => {
      const context = await browser.newContext({
        viewport: VIEWPORTS[viewport],
        locale: "id-ID",
      });
      try {
        const page = await context.newPage();
        await installPageTelemetryInitScript(page);
        return { context, page };
      } catch (error) {
        await context.close();
        throw error;
      }
    };

    for (const def of matrix) {
      let effectiveStatus: RouteMeasureStatus = def.status;
      let effectiveNote = def.boundaryNote;

      if (
        effectiveStatus === "measured" &&
        def.authMode !== "anonymous" &&
        (!sessionCookieProbe.verified || !sessionCookieProbe.cookieName)
      ) {
        effectiveStatus = "blocked_auth_unavailable";
        effectiveNote = `Auth session probe failed: ${sessionCookieProbe.failureReason ?? "unknown"}`;
      }

      console.log(
        JSON.stringify({
          phase: "route_start",
          routeId: def.routeId,
          routeGroup: def.routeGroup,
          sourcePath: def.sourcePath,
          targetPath: def.targetPath,
          status: effectiveStatus,
        })
      );

      if (effectiveStatus !== "measured") {
        routeSummaries.push({
          routeId: def.routeId,
          routeGroup: def.routeGroup,
          label: def.label,
          planRouteLabel: def.planRouteLabel,
          transitionKind: def.transitionKind,
          sourcePath: def.sourcePath,
          targetPath: def.targetPath,
          expectedFinalPath: def.expectedFinalPath,
          authMode: def.authMode,
          status: effectiveStatus,
          boundaryNote: effectiveNote,
          warmValidSampleCount: 0,
          warmFailedSampleCount: 0,
          coldValidSampleCount: 0,
          coldFailedSampleCount: 0,
          warmMetrics: null,
          browserContextColdMetrics: null,
        });
        continue;
      }

      const verifiedCookieName = sessionCookieProbe.cookieName!;
      const routeWarmSamples: NavigationSample[] = [];
      const routeColdSamples: NavigationSample[] = [];
      let consecutiveSetupFailures = 0;

      // Browser-context-cold samples: fresh BrowserContext per sample
      for (let c = 0; c < coldSamples; c++) {
        let configured: { context: BrowserContext; page: Page } | null = null;
        try {
          configured = await createConfiguredContext();
          const { context, page } = configured;
          const sample = await runSingleTransitionSample(
            context,
            page,
            baseUrl,
            def,
            "browser-context-cold",
            c + 1,
            verifiedCookieName,
            expectedUserIdHash
          );
          routeColdSamples.push(sample);
          rawSamples.push(sample);
          checkpoint();
          consecutiveSetupFailures = sample.failureReasons.includes("SOURCE_SETUP_FAILED") ? consecutiveSetupFailures + 1 : 0;
          if (consecutiveSetupFailures >= 3) break;
        } catch {
          consecutiveSetupFailures++;
          checkpoint();
          if (consecutiveSetupFailures >= 3) break;
        } finally {
          await configured?.context.close();
        }
      }

      // Warm samples: reuse single warm BrowserContext, prime once before collecting N samples
      let warmConfigured: { context: BrowserContext; page: Page } | null = null;
      try {
        if (consecutiveSetupFailures < 3) {
        for (let attempt = 0; attempt < 3 && !warmConfigured; attempt++) {
          try {
            warmConfigured = await createConfiguredContext();
          } catch (error) {
            consecutiveSetupFailures++;
            checkpoint();
            if (attempt === 2 || consecutiveSetupFailures >= 3) throw error;
          }
        }
        if (!warmConfigured) throw new Error("WARM_CONTEXT_UNAVAILABLE");
        const { context: warmContext, page: warmPage } = warmConfigured;
        await runSingleTransitionSample(
          warmContext,
          warmPage,
          baseUrl,
          def,
          "warm",
          0,
          verifiedCookieName,
          expectedUserIdHash
        );

        for (let w = 0; w < warmSamples && consecutiveSetupFailures < 3; w++) {
          const sample = await runSingleTransitionSample(
            warmContext,
            warmPage,
            baseUrl,
            def,
            "warm",
            w + 1,
            verifiedCookieName,
            expectedUserIdHash
          );
          routeWarmSamples.push(sample);
          rawSamples.push(sample);
          checkpoint();
          consecutiveSetupFailures = sample.failureReasons.includes("SOURCE_SETUP_FAILED") ? consecutiveSetupFailures + 1 : 0;
          if ((w + 1) % 5 === 0 || w + 1 === warmSamples) {
            console.log(
              JSON.stringify({
                phase: "warm_progress",
                routeId: def.routeId,
                completed: w + 1,
                total: warmSamples,
                sampleStatus: sample.status,
                failureReasons: sample.failureReasons,
                primaryCommitMs: sample.primaryCommitMs,
                primaryVisibleReadyApproxMs: sample.primaryVisibleReadyApproxMs,
                rscDeliveryMode: sample.rscDeliveryMode,
                ttfbMs: sample.ttfbMs,
              })
            );
          }
        }
        }
      } catch {
        consecutiveSetupFailures++;
        checkpoint();
      } finally {
        await warmConfigured?.context.close();
      }

      const warmValidCount = routeWarmSamples.filter((s) => s.status === "valid").length;
      const warmFailedCount = routeWarmSamples.filter((s) => s.status === "failed").length;
      const coldValidCount = routeColdSamples.filter((s) => s.status === "valid").length;
      const coldFailedCount = routeColdSamples.filter((s) => s.status === "failed").length;

      const finalRouteStatus: RouteMeasureStatus =
        warmValidCount === 0 && coldValidCount === 0
          ? "failed_readiness_or_errors"
          : warmFailedCount + coldFailedCount > 0 || routeWarmSamples.length < warmSamples || routeColdSamples.length < coldSamples ? "partial" : "measured";

      routeSummaries.push({
        routeId: def.routeId,
        routeGroup: def.routeGroup,
        label: def.label,
        planRouteLabel: def.planRouteLabel,
        transitionKind: def.transitionKind,
        sourcePath: def.sourcePath,
        targetPath: def.targetPath,
        expectedFinalPath: def.expectedFinalPath,
        authMode: def.authMode,
        status: finalRouteStatus,
        boundaryNote: `Attempted warm ${routeWarmSamples.length}/${warmSamples}, cold ${routeColdSamples.length}/${coldSamples}; failed ${warmFailedCount + coldFailedCount}/${warmValidCount + coldValidCount + warmFailedCount + coldFailedCount}. ${effectiveNote ?? ""}`,
        warmValidSampleCount: warmValidCount,
        warmFailedSampleCount: warmFailedCount,
        coldValidSampleCount: coldValidCount,
        coldFailedSampleCount: coldFailedCount,
        warmMetrics: summarizeWarmSamples(routeWarmSamples),
        browserContextColdMetrics: summarizeColdSamples(routeColdSamples),
      });
      checkpoint();
    }
  } finally {
    await browser.close();
    await stopOwnedServer(spawnedServer);
  }

  const postRunFixtures = await probeReadOnlySessionAndFixtures();
  const sampledFixtureCountsEqual =
    JSON.stringify(preRunFixtures.sampledCounts) ===
      JSON.stringify(postRunFixtures.sampledCounts) &&
    preRunFixtures.sessionUserSummary.hasStreakRow ===
      postRunFixtures.sessionUserSummary.hasStreakRow;

  const artifact: BaselineRunArtifact = {
    schemaVersion: 2,
    capturedAtIso: new Date().toISOString(),
    viewport: { name: viewport, ...VIEWPORTS[viewport] },
    baseUrl,
    warmSamplesPerRoute: warmSamples,
    browserContextColdSamplesPerRoute: coldSamples,
    buildProvenance,
    environmentVerification: verification,
    sessionCookieProbe,
    preRunFixtures,
    postRunFixtures,
    sampledFixtureCountsEqual,
    sampledFixtureCountsNote:
      "Compares sampled fixture row counts in 9 reference tables and session user streak existence before and after the run; does not claim a full database diff.",
    routes: routeSummaries,
    rawSamples,
  };

  mkdirSync(outputDir, { recursive: true });
  const summaryJsonPath = resolve(outputDir, "baseline-summary.json");
  const reportMdPath = resolve(outputDir, "baseline-report.md");

  writeFileSync(summaryJsonPath, sanitizeBaselineSummary(artifact), "utf8");
  writeFileSync(reportMdPath, renderBaselineMarkdownReport(artifact), "utf8");

  console.log(
    JSON.stringify({
      phase: "complete",
      summaryJsonPath,
      reportMdPath,
      sampledFixtureCountsEqual,
    })
  );
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal error in navigation-baseline-harness:", err);
    process.exit(1);
  });
}
