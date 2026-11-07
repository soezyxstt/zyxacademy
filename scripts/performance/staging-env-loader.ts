import { createHash, createHmac } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

export interface BuildProvenanceVerification {
  buildKind?: "baseline" | "candidate";
  sourceHash?: string;
  buildId: string;
  buildTimestampIso: string;
  isOriginalPreOptimizationBuild: boolean;
  containsPostOptimizationSymbol: boolean | null;
  verificationReason: string;
}

export interface SanitizedTargetVerification {
  verified: boolean;
  environment: "staging";
  readOnlyEnforced: boolean;
  projectId: string;
  branchId: string;
  productionBranchId: string;
  databaseName: string;
  hostHash: string;
  productionHostHash: string;
  storageBucket: string;
  distinctFromProduction: boolean;
}

export interface DiscoveredRouteFixtures {
  courseSlug: string;
  materialCourseId: string;
  materialId: string;
  quizCourseId: string;
  quizId: string;
  materialCourseQuizCount: number;
  nonPkaCourseCategories: string[];
  assessmentId: string | null;
  sampledCounts: {
    activePengguna: number;
    activeSessions: number;
    activeMataKuliah: number;
    legacyCourses: number;
    activeSoal: number;
    activeAiQuestions: number;
    activeAssessments: number;
    quizTemplates: number;
    courseMaterials: number;
  };
  sessionUserSummary: {
    hasActiveSession: boolean;
    userIdHash: string | null;
    userRole: string | null;
    peranCodes: string[];
    enrolledCourseCount: number;
    hasStreakRow: boolean;
  };
}

export interface FreshSessionAuthMaterial {
  signedCookieValue: string;
  userIdHash: string;
  expiresAtIso: string;
}

export interface SessionCookieProbeResult {
  verified: boolean;
  cookieName: "better-auth.session_token" | "__Secure-better-auth.session_token" | null;
  userIdHash: string | null;
  failureReason: string | null;
}

const DEFAULT_LOCAL_AUTH_SECRET = "zyx-local-baseline-ephemeral-auth-secret-32b";
const STRETCH_SALT = "zyx-edu:better-auth:secret-stretch:v1";

export const EXPECTED_STAGING_BRANCH_ID = "br-gentle-scene-azq0gp91";
export const EXPECTED_PRODUCTION_BRANCH_ID = "br-wandering-butterfly-azi11h8r";
export const EXPECTED_STAGING_PROJECT_ID = "muddy-sky-44104897";
export const EXPECTED_STAGING_BUCKET = "zyx-staging";
export const EXPECTED_STAGING_HOST_PREFIX = "ep-sparkling-lab-azrp3ymj-pooler";
export const EXPECTED_PRODUCTION_HOST_PREFIX = "ep-quiet-math-azyey0mb-pooler";
export const EXPECTED_STAGING_HOST_HASH = "f7ce8b408360";
export const EXPECTED_ORIGINAL_BUILD_ID = "xw8W41j22sk3FCrQPTOVd";

const ALLOWED_LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.trim(), "utf8").digest("hex").slice(0, 12);
}

export function validateLoopbackBaseUrl(rawBaseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl.trim());
  } catch {
    throw new Error("INVALID_BASE_URL: Cannot parse base URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`INVALID_BASE_URL_PROTOCOL: Expected http: or https:, got "${parsed.protocol}"`);
  }
  if (!ALLOWED_LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `UNSAFE_BASE_URL_HOST: Base URL must target a loopback host (localhost, 127.0.0.1, ::1); got "${parsed.hostname}"`
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error("INVALID_BASE_URL_CREDENTIALS: Base URL must not embed credentials");
  }
  return parsed;
}

export function verifyOriginalPreOptimizationBuild(repoRoot = resolve(process.cwd())): BuildProvenanceVerification {
  const buildIdPath = resolve(repoRoot, ".next/BUILD_ID");
  if (!existsSync(buildIdPath)) {
    throw new Error("MISSING_NEXT_BUILD: .next/BUILD_ID does not exist");
  }
  const buildId = readFileSync(buildIdPath, "utf8").trim();
  const buildStat = statSync(buildIdPath);
  const buildTimestampIso = buildStat.mtime.toISOString();

  // Check whether post-optimization symbol `getCourseTitleOnly` exists in compiled .next/server chunks
  const serverDir = resolve(repoRoot, ".next/server");
  let containsPostOptimizationSymbol = false;

  const scanDirForSymbol = (dir: string, symbol: string): boolean => {
    if (!existsSync(dir)) return false;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (scanDirForSymbol(fullPath, symbol)) return true;
      } else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) {
        const content = readFileSync(fullPath, "utf8");
        if (content.includes(symbol)) return true;
      }
    }
    return false;
  };

  containsPostOptimizationSymbol = scanDirForSymbol(serverDir, "getCourseTitleOnly");
  const isOriginalPreOptimizationBuild =
    buildId === EXPECTED_ORIGINAL_BUILD_ID && !containsPostOptimizationSymbol;

  if (!isOriginalPreOptimizationBuild) {
    throw new Error(
      `BUILD_PROVENANCE_INVALID: Expected original pre-optimization BUILD_ID=${EXPECTED_ORIGINAL_BUILD_ID} without post-optimization symbols; got buildId=${buildId}, containsPostOptimizationSymbol=${containsPostOptimizationSymbol}`
    );
  }

  return {
    buildId,
    buildTimestampIso,
    isOriginalPreOptimizationBuild,
    containsPostOptimizationSymbol,
    verificationReason: `Verified original pre-optimization build ${buildId} built at ${buildTimestampIso} (no post-optimization symbols in .next/server).`,
  };
}

export function parseEnvFileRaw(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1]!;
    let val = match[2]!.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function buildReadOnlyPostgresUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("INVALID_POSTGRES_PROTOCOL: DATABASE_URL must use postgres:// or postgresql://");
  }
  if (!parsed.hostname) {
    throw new Error("INVALID_POSTGRES_HOST: DATABASE_URL hostname is empty");
  }
  const existingOptions = parsed.searchParams.get("options") ?? "";
  if (!existingOptions.includes("default_transaction_read_only=on")) {
    const combined = existingOptions
      ? `${existingOptions} -c default_transaction_read_only=on`
      : "-c default_transaction_read_only=on";
    parsed.searchParams.set("options", combined);
  }
  return parsed.toString();
}

export function loadVerifiedStagingEnvironment(options?: {
  envFilePath?: string;
  port?: number;
  parsedEnvOverride?: Record<string, string>;
}): SanitizedTargetVerification {
  const repoRoot = resolve(process.cwd());
  const envFilePath = options?.envFilePath ?? resolve(repoRoot, ".env.neon");
  const port = options?.port ?? Number(process.env.PORT || 3100);
  const origin = `http://localhost:${port}`;

  const parsedEnv = options?.parsedEnvOverride ?? parseEnvFileRaw(envFilePath);

  const projectId = parsedEnv.NEON_PROJECT_ID?.trim() || "";
  const branchId = parsedEnv.NEON_STAGING_BRANCH_ID?.trim() || "";
  const prodBranchId = parsedEnv.NEON_PRODUCTION_BRANCH_ID?.trim() || "";
  const stagingDbUrl = parsedEnv.NEON_STAGING_DATABASE_URL?.trim() || "";
  const prodDbUrl = parsedEnv.NEON_PRODUCTION_DATABASE_URL?.trim() || "";
  const storageBucket = parsedEnv.NEON_STAGING_STORAGE_BUCKET?.trim() || "";
  const prodStorageBucket = parsedEnv.NEON_PRODUCTION_STORAGE_BUCKET?.trim() || "";

  if (!projectId || projectId !== EXPECTED_STAGING_PROJECT_ID) {
    throw new Error(
      `MISSING_OR_INVALID_NEON_PROJECT_ID: Required NEON_PROJECT_ID=${EXPECTED_STAGING_PROJECT_ID}, got "${projectId || "missing"}"`
    );
  }

  if (!branchId || branchId !== EXPECTED_STAGING_BRANCH_ID) {
    throw new Error(
      `MISSING_OR_INVALID_STAGING_BRANCH_ID: Required NEON_STAGING_BRANCH_ID=${EXPECTED_STAGING_BRANCH_ID}, got "${branchId || "missing"}"`
    );
  }

  if (!prodBranchId) {
    throw new Error(
      "MISSING_PRODUCTION_BRANCH_ID: NEON_PRODUCTION_BRANCH_ID is required to assert staging/production branch separation"
    );
  }

  if (branchId === prodBranchId) {
    throw new Error("PRODUCTION_BRANCH_COLLISION: Staging branch ID matches production branch ID");
  }

  if (!stagingDbUrl) {
    throw new Error("MISSING_STAGING_DATABASE_URL: NEON_STAGING_DATABASE_URL is required in .env.neon");
  }

  if (!prodDbUrl) {
    throw new Error(
      "MISSING_PRODUCTION_DATABASE_URL: NEON_PRODUCTION_DATABASE_URL is required in .env.neon to assert staging/production database separation"
    );
  }

  if (stagingDbUrl === prodDbUrl) {
    throw new Error("PRODUCTION_DATABASE_COLLISION: Staging database URL matches production database URL");
  }

  if (!storageBucket || storageBucket !== EXPECTED_STAGING_BUCKET) {
    throw new Error(
      `MISSING_OR_INVALID_STAGING_BUCKET: Required NEON_STAGING_STORAGE_BUCKET=${EXPECTED_STAGING_BUCKET}, got "${storageBucket || "missing"}"`
    );
  }

  if (prodStorageBucket && storageBucket === prodStorageBucket) {
    throw new Error("PRODUCTION_BUCKET_COLLISION: Staging storage bucket matches production storage bucket");
  }

  const readOnlyDbUrl = buildReadOnlyPostgresUrl(stagingDbUrl);
  const parsedStagingUrl = new URL(readOnlyDbUrl);
  const parsedProdUrl = new URL(prodDbUrl);

  if (parsedStagingUrl.hostname === parsedProdUrl.hostname) {
    throw new Error("PRODUCTION_HOST_COLLISION: Staging database hostname matches production database hostname");
  }

  if (parsedStagingUrl.hostname.includes(EXPECTED_PRODUCTION_HOST_PREFIX)) {
    throw new Error("PRODUCTION_ENDPOINT_DETECTED: Staging database URL points to production endpoint prefix");
  }

  if (!parsedStagingUrl.hostname.startsWith(EXPECTED_STAGING_HOST_PREFIX)) {
    throw new Error(
      `UNEXPECTED_STAGING_HOST: Staging hostname must start with ${EXPECTED_STAGING_HOST_PREFIX}`
    );
  }

  const hostHash = hashIdentifier(parsedStagingUrl.hostname);
  const productionHostHash = hashIdentifier(parsedProdUrl.hostname);

  if (hostHash !== EXPECTED_STAGING_HOST_HASH) {
    throw new Error(
      `UNEXPECTED_STAGING_HOST_HASH: Expected ${EXPECTED_STAGING_HOST_HASH}, got ${hostHash}`
    );
  }

  const databaseName = parsedStagingUrl.pathname.replace(/^\//, "") || "neondb";
  const readOnlyEnforced =
    readOnlyDbUrl.includes("default_transaction_read_only%3Don") ||
    readOnlyDbUrl.includes("default_transaction_read_only=on");

  if (!readOnlyEnforced) {
    throw new Error("READ_ONLY_OPTION_MISSING: Read-only transaction option was not applied to DATABASE_URL");
  }

  // Populate process.env with verified staging read-only settings
  process.env.DATABASE_URL = readOnlyDbUrl;
  process.env.ZYX_ENVIRONMENT = "staging";
  process.env.STORAGE_PROVIDER_MODE = "neon";
  process.env.NEON_STORAGE_BUCKET = storageBucket;
  if (parsedEnv.NEON_STAGING_AWS_ENDPOINT_URL_S3) {
    process.env.AWS_ENDPOINT_URL_S3 = parsedEnv.NEON_STAGING_AWS_ENDPOINT_URL_S3;
  }
  if (parsedEnv.NEON_STAGING_AWS_REGION) {
    process.env.AWS_REGION = parsedEnv.NEON_STAGING_AWS_REGION;
  }
  if (parsedEnv.NEON_STAGING_AWS_ACCESS_KEY_ID) {
    process.env.AWS_ACCESS_KEY_ID = parsedEnv.NEON_STAGING_AWS_ACCESS_KEY_ID;
  }
  if (parsedEnv.NEON_STAGING_AWS_SECRET_ACCESS_KEY) {
    process.env.AWS_SECRET_ACCESS_KEY = parsedEnv.NEON_STAGING_AWS_SECRET_ACCESS_KEY;
  }

  process.env.BETTER_AUTH_URL = origin;
  process.env.NEXT_PUBLIC_APP_URL = origin;
  process.env.BETTER_AUTH_SECRET =
    process.env.BETTER_AUTH_SECRET || parsedEnv.BETTER_AUTH_SECRET || DEFAULT_LOCAL_AUTH_SECRET;
  process.env.SKIP_ENV_VALIDATION = "1";

  // Non-secret placeholders for external services unused during read-only navigation baseline
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "baseline-placeholder-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET =
    process.env.GOOGLE_CLIENT_SECRET || "baseline-placeholder-google-client-secret";
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_baseline_placeholder_no_send";
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "baseline-placeholder-gemini-key";
  process.env.INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY || "baseline-placeholder-inngest-key";

  return {
    verified: true,
    environment: "staging",
    readOnlyEnforced,
    projectId,
    branchId,
    productionBranchId: prodBranchId,
    databaseName,
    hostHash,
    productionHostHash,
    storageBucket,
    distinctFromProduction:
      branchId !== prodBranchId &&
      stagingDbUrl !== prodDbUrl &&
      hostHash !== productionHostHash,
  };
}

export function resolveLocalSigningSecret(): string {
  const raw = process.env.BETTER_AUTH_SECRET || DEFAULT_LOCAL_AUTH_SECRET;
  if (raw.length >= 32) return raw;
  return createHash("sha256").update(`${STRETCH_SALT}:${raw}`, "utf8").digest("base64url");
}

export function signSessionToken(token: string, secret = resolveLocalSigningSecret()): string {
  const sig = createHmac("sha256", secret).update(token, "utf8").digest("base64");
  return encodeURIComponent(`${token}.${sig}`);
}

// pg query_timeout alone does not cancel server work. Destroy the transport on
// every exit, including DNS/connect/query timeout and caller cancellation.
export async function withBoundedReadOnlyClient<T>(
  work: (client: Client) => Promise<T>,
  options: { signal?: AbortSignal; timeoutMs?: number; clientFactory?: () => Client } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) throw new Error("INVALID_DB_TIMEOUT");
  const client = options.clientFactory?.() ?? new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: Math.min(timeoutMs, 3_000),
    query_timeout: Math.min(timeoutMs, 5_000),
    statement_timeout: Math.min(timeoutMs, 5_000),
  });
  // Installed pg exposes connection.stream; end() destroys it for active queries,
  // but query_timeout can clear the active query before the server stops work.
  const destroy = () => client.connection.stream.destroy();
  let rejectAbort!: (error: Error) => void;
  const interrupted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const cancel = () => { destroy(); rejectAbort(new Error("DB_PROBE_ABORTED")); };
  const timer = setTimeout(cancel, timeoutMs);
  options.signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (options.signal?.aborted) cancel();
    else return await Promise.race([(async () => { await client.connect(); return work(client); })(), interrupted]);
    return await interrupted;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    destroy();
    // Do not wait for a misbehaving driver after destroying its socket.
    void client.end().catch(() => {});
  }
}

export async function fetchFreshSignedSessionCookie(options?: {
  expectedUserIdHash?: string;
  signal?: AbortSignal;
}): Promise<FreshSessionAuthMaterial> {
  if (!process.env.DATABASE_URL) {
    loadVerifiedStagingEnvironment();
  }
  return withBoundedReadOnlyClient(async (client) => {
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    const readOnlyCheck = await client.query("SHOW transaction_read_only");
    if (readOnlyCheck.rows[0]?.transaction_read_only !== "on") {
      throw new Error("READ_ONLY_CHECK_FAILED: Database transaction is not in read-only mode");
    }

    const res = await client.query(`
      SELECT
        s.token,
        s.user_id,
        s.expires_at,
        u.role AS user_role,
        (SELECT count(*)::int FROM public.enrollments e WHERE e.user_id = s.user_id) AS enrolled_count
      FROM public.pengguna p
      INNER JOIN public.pengguna_peran pp ON pp.pengguna_id = p.id
      INNER JOIN public.peran r ON r.id = pp.peran_id
      INNER JOIN public.session s ON s.user_id = p.id
      LEFT JOIN public."user" u ON u.id = p.id
      WHERE p.status = 'active'
        AND r.code = 'admin'
        AND s.expires_at > NOW()
      ORDER BY enrolled_count DESC, s.updated_at DESC
    `);

    for (const row of res.rows) {
      const candidateHash = hashIdentifier(String(row.user_id));
      if (options?.expectedUserIdHash && candidateHash !== options.expectedUserIdHash) {
        continue;
      }
      return {
        signedCookieValue: signSessionToken(String(row.token)),
        userIdHash: candidateHash,
        expiresAtIso: new Date(row.expires_at).toISOString(),
      };
    }

    if (options?.expectedUserIdHash) {
      throw new Error(
        `SESSION_USER_IDENTITY_MISMATCH: No active unexpired admin session matches expected userIdHash=${options.expectedUserIdHash}`
      );
    }
    throw new Error("NO_ACTIVE_STAGING_SESSION: No unexpired active admin session found in public.session");
  }, { signal: options?.signal });
}

export async function probeSessionCookieName(
  baseUrl: string,
  signedCookieValue: string,
  expectedUserIdHash?: string,
  signal?: AbortSignal
): Promise<SessionCookieProbeResult> {
  validateLoopbackBaseUrl(baseUrl);
  const endpoint = new URL("/api/auth/get-session", baseUrl).toString();
  const candidates: Array<"better-auth.session_token" | "__Secure-better-auth.session_token"> = [
    "better-auth.session_token",
    "__Secure-better-auth.session_token",
  ];

  for (const cookieName of candidates) {
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          cookie: `${cookieName}=${signedCookieValue}`,
          accept: "application/json",
        },
        redirect: "manual",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
      });

      if (response.status !== 200) {
        continue;
      }
      const payload = (await response.json()) as {
        session?: { userId?: string } | null;
        user?: { id?: string; role?: string } | null;
      } | null;

      const resolvedUserId = payload?.user?.id || payload?.session?.userId;
      if (!resolvedUserId) {
        continue;
      }
      const actualUserIdHash = hashIdentifier(String(resolvedUserId));
      if (expectedUserIdHash && actualUserIdHash !== expectedUserIdHash) {
        return {
          verified: false,
          cookieName: null,
          userIdHash: actualUserIdHash,
          failureReason: `SESSION_PROBE_IDENTITY_MISMATCH: Expected userIdHash=${expectedUserIdHash}, got ${actualUserIdHash}`,
        };
      }
      return {
        verified: true,
        cookieName,
        userIdHash: actualUserIdHash,
        failureReason: null,
      };
    } catch {
      // Try next candidate
    }
  }

  return {
    verified: false,
    cookieName: null,
    userIdHash: null,
    failureReason:
      "SESSION_PROBE_FAILED: Neither better-auth.session_token nor __Secure-better-auth.session_token returned an authenticated session from /api/auth/get-session",
  };
}

export async function probeReadOnlySessionAndFixtures(options?: { signal?: AbortSignal }): Promise<DiscoveredRouteFixtures> {
  if (!process.env.DATABASE_URL) {
    loadVerifiedStagingEnvironment();
  }
  return withBoundedReadOnlyClient(async (client) => {
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    const readOnlyCheck = await client.query("SHOW transaction_read_only");
    if (readOnlyCheck.rows[0]?.transaction_read_only !== "on") {
      throw new Error("READ_ONLY_CHECK_FAILED: Database transaction is not in read-only mode");
    }

    const countsRes = await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.pengguna WHERE status = 'active') AS active_pengguna,
        (SELECT count(*)::int FROM public.session WHERE expires_at > NOW()) AS active_sessions,
        (SELECT count(*)::int FROM public.mata_kuliah WHERE status = 'active') AS active_mata_kuliah,
        (SELECT count(*)::int FROM public.courses) AS legacy_courses,
        (SELECT count(*)::int FROM public.soal WHERE status != 'retired') AS active_soal,
        (SELECT count(*)::int FROM public.ai_question_bank WHERE status != 'retired') AS active_ai_questions,
        (SELECT count(*)::int FROM public.assessment_sources WHERE deleted_at IS NULL) AS active_assessments,
        (SELECT count(*)::int FROM public.quiz_templates WHERE status = 'published') AS quiz_templates,
        (SELECT count(*)::int FROM public.course_materials) AS course_materials
    `);

    const sessionRes = await client.query(`
      SELECT
        s.user_id,
        u.role AS user_role,
        ARRAY(
          SELECT r.code
          FROM public.pengguna_peran pp
          JOIN public.peran r ON r.id = pp.peran_id
          WHERE pp.pengguna_id = s.user_id
          ORDER BY r.code
        ) AS peran_codes,
        (SELECT count(*)::int FROM public.enrollments e WHERE e.user_id = s.user_id) AS enrolled_count,
        (SELECT count(*)::int FROM public.student_streaks ss WHERE ss.student_id = s.user_id) AS streak_count,
        ARRAY(SELECT e.course_id FROM public.enrollments e WHERE e.user_id = s.user_id ORDER BY e.course_id) AS enrolled_courses
      FROM public.session s
      JOIN public.pengguna p ON p.id = s.user_id
      LEFT JOIN public."user" u ON u.id = p.id
      WHERE p.status = 'active'
        AND s.expires_at > NOW()
        AND EXISTS (
          SELECT 1
          FROM public.pengguna_peran pp
          JOIN public.peran r ON r.id = pp.peran_id
          WHERE pp.pengguna_id = s.user_id AND r.code = 'admin'
        )
      ORDER BY enrolled_count DESC, s.updated_at DESC
      LIMIT 1
    `);

    const courseRes = await client.query(`
      SELECT mk.id
      FROM public.mata_kuliah mk
      WHERE mk.status = 'active'
      ORDER BY
        (SELECT count(*) FROM public.bab b WHERE b.mata_kuliah_id = mk.id AND b.status = 'active') DESC,
        mk.title ASC
      LIMIT 1
    `);

    const articleRes = await client.query(`
      SELECT id, mata_kuliah_id
      FROM public.artikel
      WHERE status = 'published'
      ORDER BY CASE WHEN mata_kuliah_id = 'mat-i' THEN 0 ELSE 1 END, id ASC
      LIMIT 1
    `);

    const quizRes = await client.query(`
      SELECT id, course_id
      FROM public.quiz_templates
      WHERE status = 'published' AND category != 'simulation'
      ORDER BY id ASC
      LIMIT 1
    `);

    const materialCourseId = String(articleRes.rows[0]?.mata_kuliah_id || "mat-i");
    const materialQuizCountRes = await client.query(
      `
        SELECT count(*)::int AS cnt
        FROM public.quiz_templates
        WHERE status = 'published'
          AND category != 'simulation'
          AND course_id = $1
      `,
      [materialCourseId]
    );

    const categoriesRes = await client.query(`
      SELECT DISTINCT COALESCE(NULLIF(trim(category), ''), 'Lainnya') AS category
      FROM public.courses
      WHERE id != 'tutorial-pka'
        AND LOWER(title) NOT LIKE '%pka%'
      ORDER BY category ASC
    `);

    const assessmentRes = await client.query(`
      SELECT id
      FROM public.assessment_sources
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const c = countsRes.rows[0];
    const s = sessionRes.rows[0];

    return {
      courseSlug: String(courseRes.rows[0]?.id || "mat-i"),
      materialCourseId,
      materialId: String(articleRes.rows[0]?.id || "mat-i-bab1-pertaksamaan-fungsi-article"),
      quizCourseId: String(quizRes.rows[0]?.course_id || "tutorial-pka"),
      quizId: String(quizRes.rows[0]?.id || "456fa259-5d77-489b-8b97-ba41d5c749c4"),
      materialCourseQuizCount: Number(materialQuizCountRes.rows[0]?.cnt ?? 0),
      nonPkaCourseCategories: categoriesRes.rows.map((r) => String(r.category)),
      assessmentId: assessmentRes.rows[0]?.id ? String(assessmentRes.rows[0].id) : null,
      sampledCounts: {
        activePengguna: Number(c.active_pengguna ?? 0),
        activeSessions: Number(c.active_sessions ?? 0),
        activeMataKuliah: Number(c.active_mata_kuliah ?? 0),
        legacyCourses: Number(c.legacy_courses ?? 0),
        activeSoal: Number(c.active_soal ?? 0),
        activeAiQuestions: Number(c.active_ai_questions ?? 0),
        activeAssessments: Number(c.active_assessments ?? 0),
        quizTemplates: Number(c.quiz_templates ?? 0),
        courseMaterials: Number(c.course_materials ?? 0),
      },
      sessionUserSummary: {
        hasActiveSession: Boolean(s),
        userIdHash: s?.user_id ? hashIdentifier(String(s.user_id)) : null,
        userRole: s?.user_role ? String(s.user_role) : null,
        peranCodes: Array.isArray(s?.peran_codes) ? s.peran_codes.map(String) : [],
        enrolledCourseCount: Number(s?.enrolled_count ?? 0),
        hasStreakRow: Number(s?.streak_count ?? 0) > 0,
      },
    };
  }, { signal: options?.signal });
}
