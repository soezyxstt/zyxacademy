import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  buildRouteMatrixDefinitions,
  writeCheckpointAtomic,
  parseHarnessArgs,
  safeDiagnosticPath,
  VIEWPORTS,
  computeColdDescriptiveMetric,
  computePercentiles,
  evaluateSampleGates,
  filterOverlappingLongTasks,
  renderBaselineMarkdownReport,
  sanitizeBaselineSummary,
  summarizeColdSamples,
  summarizeWarmSamples,
  validateRouteSelectorSafety,
  type BaselineRunArtifact,
  type NavigationSample,
  type RouteMatrixDefinition,
} from "../../scripts/performance/navigation-baseline-harness";
import {
  buildReadOnlyPostgresUrl,
  EXPECTED_ORIGINAL_BUILD_ID,
  loadVerifiedStagingEnvironment,
  validateLoopbackBaseUrl,
  verifyOriginalPreOptimizationBuild,
  type BuildProvenanceVerification,
  type DiscoveredRouteFixtures,
  type SanitizedTargetVerification,
  type SessionCookieProbeResult,
} from "../../scripts/performance/staging-env-loader";

const mockBuildProvenance: BuildProvenanceVerification = {
  buildId: EXPECTED_ORIGINAL_BUILD_ID,
  buildTimestampIso: "2026-11-05T21:32:54.847Z",
  isOriginalPreOptimizationBuild: true,
  containsPostOptimizationSymbol: false,
  verificationReason: "Verified original pre-optimization build",
};

const mockVerification: SanitizedTargetVerification = {
  verified: true,
  environment: "staging",
  readOnlyEnforced: true,
  projectId: "muddy-sky-44104897",
  branchId: "br-gentle-scene-azq0gp91",
  productionBranchId: "br-wandering-butterfly-azi11h8r",
  databaseName: "neondb",
  hostHash: "f7ce8b408360",
  productionHostHash: "a1b2c3d4e5f6",
  storageBucket: "zyx-staging",
  distinctFromProduction: true,
};

const mockCookieProbe: SessionCookieProbeResult = {
  verified: true,
  cookieName: "better-auth.session_token",
  userIdHash: "112233445566",
  failureReason: null,
};

const mockFixtureSummary: DiscoveredRouteFixtures = {
  courseSlug: "mat-i",
  materialCourseId: "mat-i",
  materialId: "mat-i-bab1-pertaksamaan-fungsi-article",
  quizCourseId: "tutorial-pka",
  quizId: "456fa259-5d77-489b-8b97-ba41d5c749c4",
  materialCourseQuizCount: 0,
  nonPkaCourseCategories: ["TPB"],
  assessmentId: null,
  sampledCounts: {
    activePengguna: 69,
    activeSessions: 1,
    activeMataKuliah: 5,
    legacyCourses: 5,
    activeSoal: 289,
    activeAiQuestions: 309,
    activeAssessments: 0,
    quizTemplates: 9,
    courseMaterials: 9,
  },
  sessionUserSummary: {
    hasActiveSession: true,
    userIdHash: "112233445566",
    userRole: "admin",
    peranCodes: ["admin", "tutor"],
    enrolledCourseCount: 1,
    hasStreakRow: true,
  },
};

describe("staging-env-loader fail-closed guards", () => {
  test("enforces PostgreSQL read-only transaction option on connection URLs", () => {
    const rawUrl =
      "postgresql://user:pass@ep-sparkling-lab-azrp3ymj-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
    const readOnlyUrl = buildReadOnlyPostgresUrl(rawUrl);
    const parsed = new URL(readOnlyUrl);
    expect(parsed.searchParams.get("options")).toContain("-c default_transaction_read_only=on");
  });

  test("verifies .env.neon staging target against production without exposing secrets", () => {
    const verification = loadVerifiedStagingEnvironment();
    expect(verification.verified).toBe(true);
    expect(verification.branchId).toBe("br-gentle-scene-azq0gp91");
    expect(verification.productionBranchId).toBe("br-wandering-butterfly-azi11h8r");
    expect(verification.projectId).toBe("muddy-sky-44104897");
    expect(verification.storageBucket).toBe("zyx-staging");
    expect(verification.hostHash).toBe("f7ce8b408360");
    expect(verification.distinctFromProduction).toBe(true);
    expect(verification.readOnlyEnforced).toBe(true);
    expect(process.env.DATABASE_URL).toContain("default_transaction_read_only");
  });

  test("fails closed when required .env.neon bindings or production comparison keys are missing or collide", () => {
    const validBase = {
      NEON_PROJECT_ID: "muddy-sky-44104897",
      NEON_STAGING_BRANCH_ID: "br-gentle-scene-azq0gp91",
      NEON_PRODUCTION_BRANCH_ID: "br-wandering-butterfly-azi11h8r",
      NEON_STAGING_DATABASE_URL:
        "postgresql://user:pass@ep-sparkling-lab-azrp3ymj-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require",
      NEON_PRODUCTION_DATABASE_URL:
        "postgresql://user:pass@ep-quiet-math-azyey0mb-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require",
      NEON_STAGING_STORAGE_BUCKET: "zyx-staging",
      NEON_PRODUCTION_STORAGE_BUCKET: "zyx-production",
    };

    expect(() =>
      loadVerifiedStagingEnvironment({
        parsedEnvOverride: { ...validBase, NEON_PROJECT_ID: "" },
      })
    ).toThrow(/MISSING_OR_INVALID_NEON_PROJECT_ID/);

    expect(() =>
      loadVerifiedStagingEnvironment({
        parsedEnvOverride: { ...validBase, NEON_PRODUCTION_DATABASE_URL: "" },
      })
    ).toThrow(/MISSING_PRODUCTION_DATABASE_URL/);

    expect(() =>
      loadVerifiedStagingEnvironment({
        parsedEnvOverride: {
          ...validBase,
          NEON_PRODUCTION_DATABASE_URL: validBase.NEON_STAGING_DATABASE_URL,
        },
      })
    ).toThrow(/PRODUCTION_DATABASE_COLLISION/);

    expect(() =>
      loadVerifiedStagingEnvironment({
        parsedEnvOverride: {
          ...validBase,
          NEON_STAGING_DATABASE_URL:
            "postgresql://user:different_pass@ep-quiet-math-azyey0mb-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require",
        },
      })
    ).toThrow(/PRODUCTION_HOST_COLLISION|PRODUCTION_ENDPOINT_DETECTED/);
  });

  test("restricts base URL strictly to loopback hosts", () => {
    expect(validateLoopbackBaseUrl("http://localhost:3100").hostname).toBe("localhost");
    expect(validateLoopbackBaseUrl("http://127.0.0.1:3100").hostname).toBe("127.0.0.1");
    expect(() => validateLoopbackBaseUrl("https://zyxacademy.com")).toThrow(
      /UNSAFE_BASE_URL_HOST/
    );
    expect(() => validateLoopbackBaseUrl("http://user:pass@localhost:3100")).toThrow(
      /INVALID_BASE_URL_CREDENTIALS/
    );
  });

  test("verifies original pre-optimization .next build provenance on disk", () => {
    const root = mkdtempSync(resolve(tmpdir(), "zyx-baseline-"));
    try {
      mkdirSync(resolve(root, ".next"));
      writeFileSync(resolve(root, ".next/BUILD_ID"), EXPECTED_ORIGINAL_BUILD_ID);
      const provenance = verifyOriginalPreOptimizationBuild(root);
      expect(provenance.isOriginalPreOptimizationBuild).toBe(true);
      writeFileSync(resolve(root, ".next/BUILD_ID"), "candidate");
      expect(() => verifyOriginalPreOptimizationBuild(root)).toThrow("BUILD_PROVENANCE_INVALID");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("navigation-baseline-harness routes, readiness gates, and telemetry", () => {
  test("parses isolated viewport output and rejects invalid sample counts", () => {
    expect(parseHarnessArgs(["--build-kind", "candidate"]).outputDir).toEndWith("candidate/desktop");
    const mobile = parseHarnessArgs(["--build-kind", "candidate", "--viewport", "mobile", "--cold-samples", "0"]);
    expect(mobile.outputDir).toEndWith("candidate/mobile");
    expect(VIEWPORTS.mobile).toEqual({ width: 380, height: 844 });
    expect(VIEWPORTS.desktop).toEqual({ width: 1536, height: 864 });
    expect(parseHarnessArgs(["--output-dir", "custom"]).outputDir).toBe(resolve("custom"));
    for (const args of [["--viewport", "tablet"], ["--viewport"], ["--warm-samples", "0"], ["--warm-samples", "1.5"], ["--cold-samples", "-1"], ["--cold-samples", "9007199254740992"], ["--warm-samples", "1001"], ["--unknown"]]) {
      expect(() => parseHarnessArgs(args)).toThrow();
    }
    expect(computePercentiles(Array.from({ length: 39 }, (_, i) => i)).p95).toBeNull();
  });

  test("does not report p95 from smoke samples", () => {
    expect(computePercentiles([10, 20]).p95).toBeNull();
    expect(computePercentiles(Array.from({ length: 40 }, (_, i) => i + 1)).p95).toBe(38);
  });

  test("maps R1 through R8 to exact plan routes and separates exploratory E1-E3", () => {
    const planOnly = buildRouteMatrixDefinitions(mockFixtureSummary);
    expect(planOnly.map((m) => m.routeId)).toEqual([
      "R1",
      "R2",
      "R3",
      "R4",
      "R5",
      "R6",
      "R7",
      "R8",
    ]);

    expect(planOnly.find((m) => m.routeId === "R1")?.targetPath).toBe("/dashboard");
    expect(planOnly.find((m) => m.routeId === "R2")?.targetPath).toBe("/admin");
    expect(planOnly.find((m) => m.routeId === "R3")?.targetPath).toBe("/admin/courses");
    expect(planOnly.find((m) => m.routeId === "R4")?.targetPath).toBe("/admin/courses/mat-i");
    expect(planOnly.find((m) => m.routeId === "R5")?.targetPath).toBe("/admin/questions");
    expect(planOnly.find((m) => m.routeId === "R6")?.status).toBe(
      "blocked_missing_product_link_or_fixture"
    );
    expect(planOnly.find((m) => m.routeId === "R7")?.status).toBe(
      "blocked_single_category_fixture"
    );
    expect(planOnly.find((m) => m.routeId === "R8")?.status).toBe(
      "blocked_legacy_redirect_route"
    );

    const withExploratory = buildRouteMatrixDefinitions(
      {
        ...mockFixtureSummary,
        nonPkaCourseCategories: ["TPB", "Informatika"],
      },
      { includeExploratory: true }
    );
    expect(withExploratory.map((m) => m.routeId)).toEqual([
      "R1",
      "R2",
      "R3",
      "R4",
      "R5",
      "R6",
      "R7",
      "R8",
      "E1",
      "E2",
      "E3",
    ]);
    expect(withExploratory.find((m) => m.routeId === "R7")?.status).toBe("measured");
  });

  test("rejects bare structural selectors (h1, header, aside, main, tablist) as primarySelector", () => {
    const validRoute = buildRouteMatrixDefinitions(mockFixtureSummary)[0]!;
    expect(() => validateRouteSelectorSafety(validRoute)).not.toThrow();

    const unsafeH1: RouteMatrixDefinition = {
      ...validRoute,
      primarySelector: "main a[href^='/courses/'], h1",
    };
    expect(() => validateRouteSelectorSafety(unsafeH1)).toThrow(/UNSAFE_PRIMARY_SELECTOR/);

    const unsafeTablist: RouteMatrixDefinition = {
      ...validRoute,
      primarySelector: '[role="tablist"]',
    };
    expect(() => validateRouteSelectorSafety(unsafeTablist)).toThrow(/UNSAFE_PRIMARY_SELECTOR/);
  });

  test("evaluates timeout, redirect, HTTP 4xx/5xx, console.error, pageerror, and local tab gates", () => {
    const passing = evaluateSampleGates({
      timedOut: false,
      transitionKind: "route_navigation",
      finalPathname: "/admin/courses",
      expectedFinalPath: "/admin/courses",
      localTabChanged: true,
      hardNavigationDetected: false,
      httpErrorStatuses: [],
      consoleErrorCount: 0,
      pageErrorCount: 0,
      errorBoundaryVisible: false,
    });
    expect(passing.status).toBe("valid");
    expect(passing.failureReasons).toEqual([]);

    const failing = evaluateSampleGates({
      timedOut: true,
      transitionKind: "local_tab",
      finalPathname: "/sign-in",
      expectedFinalPath: "/courses",
      localTabChanged: false,
      hardNavigationDetected: true,
      httpErrorStatuses: [403, 500],
      consoleErrorCount: 1,
      pageErrorCount: 1,
      errorBoundaryVisible: true,
    });
    expect(failing.status).toBe("failed");
    expect(failing.failureReasons).toContain("READINESS_TIMEOUT");
    expect(failing.failureReasons).toContain("UNEXPECTED_FINAL_PATHNAME:/sign-in!=/courses");
    expect(failing.failureReasons).toContain("LOCAL_TAB_PANEL_UNCHANGED");
    expect(failing.failureReasons).toContain("HARD_NAVIGATION_DETECTED");
    expect(failing.failureReasons).toContain("HTTP_ERROR_STATUS:403,500");
    expect(failing.failureReasons).toContain("CONSOLE_ERROR_COUNT:1");
    expect(failing.failureReasons).toContain("PAGE_ERROR_COUNT:1");
    expect(failing.failureReasons).toContain("VISIBLE_ERROR_STATE");
  });

  test("preserves null for cached/prefetched RSC timings and excludes failed samples from percentiles", () => {
    const cachedSample: NavigationSample = {
      routeId: "R1",
      routeGroup: "plan",
      mode: "warm",
      sampleIndex: 1,
      traceId: "R1-warm-1",
      status: "valid",
      failureReasons: [],
      triggerKind: "dropdown_link",
      sessionUserIdHash: "112233445566",
      feedbackWithTopLoaderMs: 2.1,
      feedbackNativeMs: 40.5,
      ttfbMs: null,
      shellMs: 40.5,
      primaryCommitMs: 85.0,
      primaryVisibleReadyApproxMs: 118.4,
      clientRscDurationMs: null,
      serverRscDurationMs: null,
      serverTimingMissingReason: "no_server_span_instrumentation",
      rscDeliveryMode: "client_cache_or_prefetched",
      timingMissingReason: "served_from_client_router_cache_or_prefetch",
      rscTransferSizeBytes: null,
      rscEncodedBodyBytes: null,
      rscDecodedBodyBytes: null,
      rscRequestCount: 0,
      longTaskSupported: true,
      longTaskCount: 0,
      longTaskMaxMs: 0,
      layoutShiftSupported: true,
      observedTransitionLayoutShiftSum: 0,
      fcmRegisterCalls: 0,
      hardNavigationDetected: false,
      httpErrorStatuses: [],
      httpErrorDetails: [],
      consoleErrorCount: 0,
      consoleErrorMessages: [],
      pageErrorCount: 0,
      pageErrorMessages: [],
      finalPathname: "/dashboard",
      finalSearch: "",
    };

    const failedTimeoutSample: NavigationSample = {
      ...cachedSample,
      sampleIndex: 2,
      status: "failed",
      failureReasons: ["READINESS_TIMEOUT"],
      primaryCommitMs: null,
      primaryVisibleReadyApproxMs: null,
    };

    const summary = summarizeWarmSamples([cachedSample, failedTimeoutSample]);
    expect(summary?.validSampleCount).toBe(1);
    expect(summary?.failedSampleCount).toBe(1);
    expect(summary?.cacheOrPrefetchedCount).toBe(1);
    expect(summary?.ttfbMs.p50).toBeNull();
    expect(summary?.ttfbMs.nullCount).toBe(1);
    expect(summary?.primaryCommitMs.p50).toBe(85);
    expect(summary?.primaryVisibleReadyApproxMs.p50).toBe(118.4);

    const coldDesc = computeColdDescriptiveMetric([510.2, 480.4, 530.8]);
    expect(coldDesc.sampleCount).toBe(3);
    expect(coldDesc.min).toBe(480.4);
    expect(coldDesc.p50).toBe(510.2);
    expect(coldDesc.max).toBe(530.8);
    expect("p95" in coldDesc).toBe(false);
  });

  test("filters LongTasks by interval overlap with [tClick, windowEnd]", () => {
    const tasks = [
      { startTime: 50, duration: 30 }, // ends at 80 (< 100), excluded
      { startTime: 85, duration: 40 }, // ends at 125 (> 100), overlaps!
      { startTime: 130, duration: 55 }, // inside [100, 200], overlaps!
      { startTime: 210, duration: 60 }, // starts after 200, excluded
    ];
    const overlapping = filterOverlappingLongTasks(tasks, 100, 200);
    expect(overlapping).toEqual([
      { startTime: 85, duration: 40 },
      { startTime: 130, duration: 55 },
    ]);
  });

  test("sanitizes PII, emails, JWTs, and connection strings from v2 baseline artifacts", () => {
    const sample: NavigationSample = {
      routeId: "R1",
      routeGroup: "plan",
      mode: "warm",
      sampleIndex: 1,
      traceId: "R1-warm-1",
      status: "valid",
      failureReasons: [],
      triggerKind: "dropdown_link",
      sessionUserIdHash: "112233445566",
      feedbackWithTopLoaderMs: 12.5,
      feedbackNativeMs: 140.2,
      ttfbMs: 95.4,
      shellMs: 142.1,
      primaryCommitMs: 250.0,
      primaryVisibleReadyApproxMs: 280.6,
      clientRscDurationMs: 130.8,
      serverRscDurationMs: null,
      serverTimingMissingReason: "no_server_span_instrumentation",
      rscDeliveryMode: "network_fetched",
      timingMissingReason: null,
      rscTransferSizeBytes: 8420,
      rscEncodedBodyBytes: 8120,
      rscDecodedBodyBytes: 24100,
      rscRequestCount: 1,
      longTaskSupported: true,
      longTaskCount: 1,
      longTaskMaxMs: 62.0,
      layoutShiftSupported: true,
      observedTransitionLayoutShiftSum: 0,
      fcmRegisterCalls: 0,
      hardNavigationDetected: false,
      httpErrorStatuses: [],
      httpErrorDetails: [],
      consoleErrorCount: 0,
      consoleErrorMessages: [],
      pageErrorCount: 0,
      pageErrorMessages: [],
      finalPathname: "/dashboard",
      finalSearch: "",
    };

    const artifact: BaselineRunArtifact = {
      schemaVersion: 2,
      capturedAtIso: "2026-11-05T22:00:00.000Z",
      viewport: { name: "desktop", ...VIEWPORTS.desktop },
      baseUrl: "http://localhost:3100",
      warmSamplesPerRoute: 2,
      browserContextColdSamplesPerRoute: 1,
      buildProvenance: mockBuildProvenance,
      environmentVerification: mockVerification,
      sessionCookieProbe: mockCookieProbe,
      preRunFixtures: mockFixtureSummary,
      postRunFixtures: mockFixtureSummary,
      sampledFixtureCountsEqual: true,
      sampledFixtureCountsNote: "Sampled reference table counts only.",
      routes: [
        {
          routeId: "R1",
          routeGroup: "plan",
          label: "Marketing Home -> Student Dashboard (user@example.com)",
          planRouteLabel: "/ -> /dashboard",
          transitionKind: "route_navigation",
          sourcePath: "/",
          targetPath: "/dashboard",
          expectedFinalPath: "/dashboard",
          authMode: "authenticated",
          status: "measured",
          boundaryNote: "postgresql://secret:pass@host/neondb",
          warmValidSampleCount: 1,
          warmFailedSampleCount: 0,
          coldValidSampleCount: 1,
          coldFailedSampleCount: 0,
          warmMetrics: summarizeWarmSamples([sample]),
          browserContextColdMetrics: summarizeColdSamples([
            { ...sample, mode: "browser-context-cold" },
          ]),
        },
      ],
      rawSamples: [sample],
    };

    const sanitized = sanitizeBaselineSummary(artifact);
    expect(sanitized).not.toContain("postgresql://secret:pass@host/neondb");
    expect(sanitized).not.toContain("user@example.com");
    expect(sanitized).toContain("[REDACTED]");

    const report = renderBaselineMarkdownReport(artifact);
    expect(report).toContain("# Navigation Performance Baseline Report");
    expect(report).toContain("INVALID");
    expect(report).toContain("Browser-Context-Cold");
    expect(report).toContain("desktop (1536 x 864)");
    expect(report).toContain("Smaller runs are smoke evidence only");
  });
});

test("focused routes retain IDs and diagnostic paths redact dynamic data", () => {
  expect(parseHarnessArgs(["--routes", "R2,R1"]).routes).toEqual(["R2", "R1"]);
  expect(() => parseHarnessArgs(["--routes", "R9"])).toThrow("INVALID_ROUTES");
  expect(safeDiagnosticPath("/courses/private-user")).toBe("/[redacted]");
  expect(safeDiagnosticPath("/dashboard")).toBe("/dashboard");
});


test("profile trigger is specific and checkpoint replacement redacts diagnostics", () => {
  const routes = buildRouteMatrixDefinitions(mockFixtureSummary);
  for (const id of ["R1", "R2"]) {
    expect(routes.find((route) => route.routeId === id)?.dropdownTriggerSelector).toBe("header [data-testid=nav-profile-trigger]");
  }
  const dir = mkdtempSync(resolve(tmpdir(), "nav-checkpoint-"));
  try {
    const path = resolve(dir, "checkpoint.json");
    writeCheckpointAtomic(path, { rawSamples: [{ status: "valid", primaryCommitMs: 42 }] });
    writeCheckpointAtomic(path, { rawSamples: [{ status: "valid", primaryCommitMs: 42 }, { status: "failed", primaryCommitMs: null, httpErrorDetails: [{ status: 500, method: "GET", url: "/private?token=secret" }], consoleErrorMessages: ["private@example.com"] }] });
    const result = readFileSync(path, "utf8");
    expect(JSON.parse(result).rawSamples[0].primaryCommitMs).toBe(42);
    expect(JSON.parse(result).rawSamples[1].primaryCommitMs).toBeNull();
    expect(result).not.toContain("secret");
    expect(result).not.toContain("private@example.com");
    expect(readdirSync(dir)).toEqual(["checkpoint.json"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
