import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import pg from "pg";
import { fixtureCookie } from "../../../../../../packages/native-parity/academic/local/cookie.mjs";

const { academicCases } = createRequire(import.meta.url)("../../../../../../packages/native-parity/academic/cases.ts");
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../../../..");
const acl = process.argv.includes("--acl");
const origin = acl ? "http://127.0.0.1:3317" : "http://127.0.0.1:3314";
const servingRoot = acl ? resolve(process.env.PARITY_ACL_WEB_ROOT ?? root) : root;
const viewport = { width: 380, height: 852, dpr: 1 };
const locale = "id-ID";
const identityEndpoint = "/api/native/context";
const apiObservation = {
  sameOrigin: true,
  pathPrefixes: ["/api/admin", "/api/tutor"],
  responseStatuses: "2xx",
  field: "successfulProtectedReads",
  completeRequestLogRecorded: false,
};
const requestTimeout = 120_000;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: servingRoot, encoding: "utf8" }).trim();
const revision = git("rev-parse", "HEAD");
const servingPaths = ["app", "components", "lib", "messages", "proxy.ts", "packages/native-session", "packages/native-parity/academic/cases.ts", "packages/native-parity/academic/routes.ts"];
const checkServingRevision = () => assert.equal(git("diff", "--name-only", revision, "--", ...servingPaths), "", "Serving sources differ from the recorded revision");
const selected = new Set(process.argv.slice(2).filter((arg) => arg !== "--acl"));
const output = resolve(here, acl ? "api-observations.json" : "manifest.json");
const sources = new Map((await readFile(resolve(root, "plans/native-parallel/routes.tsv"), "utf8")).split("\n")
  .filter((line) => line.startsWith("academic\t")).map((line) => {
    const path = line.split("\t")[1];
    return [path.replace(/^app|\/page\.tsx$|\/\([^/]+\)/g, ""), path];
  }));
const denied = academicCases.filter(({ id }) => id.endsWith("-denied"));
assert.equal(denied.length, 54);
assert.deepEqual(new Set(denied.map(({ pattern }) => pattern)), new Set(sources.keys()));
assert.ok([...selected].every((id) => denied.some((test) => test.id === id)), "Unknown fixture case ID");

const pathUnder = (path, prefix) => path === prefix || path.startsWith(prefix + "/");
const staffEndpoints = [
  "/api/admin", "/api/tutor", "/api/live/sessions", "/api/native/academic-administration",
  ...["admin", "tutor", "tutor-support"].map((role) => `/api/native/academic/${role}`),
  ...["admin", "tutor"].map((role) => `/api/native/academic-assessment/${role}`),
];
const sessionEndpoints = ["/api/auth", "/api/native/context", "/api/account/sessions"];
const studentEndpoints = ["/api/student", "/api/notifications", "/api/offline"];
const scopedAcademicEndpoints = ["/api/quiz", "/api/discussions", "/api/live", "/api/courses", "/api/coding"];

function category(path, method) {
  const hasPrefix = (prefixes) => prefixes.some((prefix) => pathUnder(path, prefix));
  if (hasPrefix(staffEndpoints) || (method !== "GET" && method !== "HEAD" && pathUnder(path, "/api/quiz/templates"))
    || /^\/api\/live\/[^/]+\/control$/.test(path)) return "staff-api";
  if (hasPrefix(sessionEndpoints)) return "account-session";
  if (hasPrefix(studentEndpoints)) return "student-service";
  if (hasPrefix(scopedAcademicEndpoints)) return "scope-dependent-academic";
  if (pathUnder(path, "/api/pricing")) return "public-api";
  if (pathUnder(path, "/api")) return "other-api";
  return "page-or-asset";
}

function matchRoute(pattern, path) {
  const parts = pattern.split("/");
  const values = path.split("/");
  for (const [index, part] of parts.entries()) {
    if (/^\[\[?\.\.\./.test(part)) return index < values.length || part.startsWith("[[");
    if (values[index] === undefined || (!part.startsWith("[") && part !== values[index])) return false;
  }
  return parts.length === values.length;
}

const apiTemplates = acl ? git("ls-files", "app/api").split("\n").filter((path) => path.endsWith("/route.ts"))
  .map((path) => path.replace(/^app|\/route\.ts$|\/\([^/]+\)/g, ""))
  .sort((a, b) => b.split("/").filter((part) => !part.startsWith("[")).length
    - a.split("/").filter((part) => !part.startsWith("[")).length) : [];
const pageTemplates = [...sources.keys()].sort((a, b) => a.split("[").length - b.split("[").length);
const sanitizePath = (path) => {
  if (pathUnder(path, "/api")) {
    return apiTemplates.find((pattern) => pattern === path) ?? apiTemplates.find((pattern) => matchRoute(pattern, path)) ?? "/api/[unregistered]";
  }
  const page = pageTemplates.find((pattern) => matchRoute(pattern, path));
  if (page) return page;
  if (pathUnder(path, "/_next/static")) return `/_next/static/[asset]${path.match(/\.(?:js|css|woff2|png|webp)$/i)?.[0] ?? ""}`;
  if (["/", "/_next/image", "/_next/webpack-hmr"].includes(path) || /^\/[\w.-]+\.(?:ico|svg|png|webp|gif|css|woff2)$/i.test(path)) return path;
  return "/[other-page-or-asset]";
};

const marker = {
  quiz: "Kuis Struktur Sel", document: "Catatan Struktur Sel",
  idea: "Kecepatan adalah perubahan posisi terhadap waktu", product: "Struktur dan Fungsi Membran Sel",
  adminName: "Admin Akademik", tutorName: "Tutor Akademik",
};
const protectedText = [...Object.values(marker), "admin@academic.test", "tutor@academic.test", "Kelola kuis dan bank soal", "Pendaftar Tutorial PKA"];
const landingHeading = "Belajar lebih terarah setiap hari.";
const forbiddenHeading = /^(Akses ditolak|Anda tidak memiliki akses|Forbidden|403)$/i;
const terminalError = /something went wrong|application error|internal server error|server components render|halaman tidak ditemukan|this page could not be found/i;

async function verifySeed() {
  const pool = new pg.Pool({ connectionString: "postgres://postgres:academic-local-only@127.0.0.1:55434/academic", connectionTimeoutMillis: 5_000 });
  try {
    const { rows: [row] } = await pool.query(`select current_database() as database,
      (select title from quiz_templates where id = 'academic-web-quiz-1') as quiz,
      (select title from artikel where id = 'academic-web-document-1') as document,
      (select course_id from impor_bundle where id = 'academic-web-idea-1' and bundle_type = 'idea') as idea_course,
      (select course_id from impor_bundle where id = 'academic-web-product-1' and bundle_type = 'product') as product_course,
      (select count(*)::int from mata_kuliah where id in ('academic-course-1', 'academic-course-2')) as courses`);
    assert.equal(row.database, "academic");
    assert.equal(row.quiz, marker.quiz);
    assert.equal(row.document, marker.document);
    assert.ok(["biologi-dasar", "fisika-dasar", "academic-course-1", "academic-course-2"].includes(row.idea_course));
    assert.ok(["biologi-dasar", "academic-course-1"].includes(row.product_course));
    assert.equal(row.courses, 2);
    return { ideaSlug: row.idea_course.endsWith("2") || row.idea_course === "fisika-dasar" ? "fisika-dasar" : "biologi-dasar",
      ideaCourseId: row.idea_course, productCourseId: row.product_course, quizId: "academic-web-quiz-1",
      documentId: "academic-web-document-1", ideaId: "academic-web-idea-1", productId: "academic-web-product-1" };
  } finally {
    await pool.end();
  }
}

function requestedPath(test, seed) {
  const path = test.pattern === "/admin/courses/[slug]/review/idea/[bundleId]"
    ? test.path.replace("/courses/biologi-dasar/", `/courses/${seed.ideaSlug}/`) : test.path;
  return path.replace("academic-quiz-1", seed.quizId).replace("academic-document-1", seed.documentId)
    .replace("academic-idea-1", seed.ideaId).replace("academic-product-1", seed.productId);
}

async function identity(context, role) {
  const response = await context.request.get(origin + identityEndpoint, { maxRedirects: 0, timeout: requestTimeout });
  assert.equal(response.status(), 200, "The fixture session must resolve to a current account");
  const info = await response.json();
  assert.equal(info.accountId, `academic-${role}`);
  assert.equal(info.sessionId, `session-academic-${role}`);
  assert.deepEqual(info.roles, [role === "student" ? "murid" : role]);
  assert.equal(info.dashboard, role === "student" ? "/dashboard" : `/${role}`);
  return { status: response.status(), accountId: info.accountId, roles: info.roles, dashboard: info.dashboard };
}

async function contextFor(browser, theme, role) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr,
    locale, timezoneId: "Asia/Jakarta", colorScheme: theme, reducedMotion: "reduce", serviceWorkers: "block" });
  if (role) {
    const [name, value] = fixtureCookie(role).split("=");
    await context.addCookies([{ name, value, url: origin }]);
  }
  await context.route("**/*", (request) => new URL(request.request().url()).origin === origin
    && ["GET", "HEAD", "OPTIONS"].includes(request.request().method()) ? request.continue() : request.abort());
  return context;
}

function observe(page, entry) {
  const documents = [];
  const requests = new Map();
  function observation(request) {
    if (requests.has(request)) return requests.get(request);
    const url = new URL(request.url());
    if (url.origin !== origin) return null;
    const method = request.method();
    const item = { path: sanitizePath(url.pathname), method, category: category(url.pathname, method), status: null };
    requests.set(request, item);
    return item;
  }
  if (acl) {
    page.on("request", observation);
    page.on("requestfailed", (request) => { const item = observation(request); if (item) item.failed = true; });
  }
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== origin) return;
    const path = url.pathname + url.search;
    if (acl) observation(response.request()).status = response.status();
    if (response.request().isNavigationRequest() && response.request().resourceType() === "document") {
      const location = response.headers().location;
      entry.navigation.push({ path, status: response.status(), ...(location ? { location } : {}) });
      if (/^\/(admin|tutor)(\/|$)/.test(url.pathname) && response.status() < 300) documents.push(response);
    } else if (response.ok() && apiObservation.pathPrefixes.some((prefix) => url.pathname === prefix || url.pathname.startsWith(prefix + "/"))) {
      entry.successfulProtectedReads.push({ path: url.pathname, status: response.status() });
    }
  });
  return { documents, requests };
}

async function evidence(context, test, seed, screenshot = true) {
  const path = requestedPath(test, seed);
  const entry = { id: test.id, pattern: test.pattern, fixturePath: test.path, webSource: sources.get(test.pattern), requestedPath: path,
    landedPath: null, classification: "unverified", status: "fail", theme: test.theme, revision, observedAt: new Date().toISOString(),
    navigation: [], successfulProtectedReads: [] };
  const page = await context.newPage();
  const { documents, requests } = observe(page, entry);
  try {
    entry.identity = await identity(context, "student");
    const response = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: requestTimeout });
    assert.ok(response, "No document response");
    await page.waitForFunction(({ expected, destination }) => location.pathname === destination ||
      (location.pathname === expected && Array.from(document.querySelectorAll("main h1, main h2, [role=alert]")).some((heading) =>
        /^(Akses ditolak|Anda tidak memiliki akses|Forbidden|403)$/i.test(heading.textContent.trim()))),
    { expected: new URL(path, origin).pathname, destination: "/" }, { timeout: requestTimeout });
    const landed = new URL(page.url());
    assert.equal(landed.origin, origin);
    entry.landedPath = landed.pathname + landed.search;
    const first = entry.navigation.find((event) => event.path === path);
    assert.ok(first, "The original Next page request was not observed");
    entry.initialHttpStatus = first.status;
    assert.ok(entry.navigation.every(({ path }) => !/^\/(sign-in|sign-up|api\/auth)\b/.test(path)), "Navigation entered an authentication route");
    const redirected = entry.landedPath === "/";
    if (redirected) {
      assert.ok((first.status >= 300 && first.status < 400) || first.status === 200, "The protected page returned a transport error");
      assert.ok(entry.navigation.some((event) => event.path === "/" && event.status === 200), "No successful public landing document");
      await page.getByRole("heading", { name: landingHeading, exact: true }).waitFor({ timeout: requestTimeout });
      const account = page.getByRole("button", { name: "Akun (Nadia Lestari)", exact: true }).first();
      await account.waitFor({ state: "visible", timeout: requestTimeout });
      entry.landingAccountLabel = await account.getAttribute("aria-label");
      entry.heading = landingHeading;
    } else {
      assert.equal(entry.landedPath, path);
      assert.equal(first.status, 403);
      const heading = page.getByRole("heading", { name: forbiddenHeading }).first();
      await heading.waitFor({ timeout: requestTimeout });
      entry.heading = await heading.innerText();
    }
    const body = await page.locator("main").first().innerText();
    assert.ok(body.trim().includes(entry.heading) && !terminalError.test(body), "Expected rendered landing or forbidden content");
    const inspected = [body, ...await Promise.all(documents.map((document) => document.text()))];
    assert.deepEqual(protectedText.filter((value) => inspected.some((html) => html.includes(value))), [], "Protected fixture text rendered or serialized");
    assert.deepEqual(entry.successfulProtectedReads, [], "A background response under /api/admin or /api/tutor returned 2xx");
    entry.protectedDataChecks = { fixtureMarkers: protectedText.length, protectedSuccessDocuments: documents.length };
    await page.locator("div.fixed.inset-0").filter({ has: page.locator('svg[viewBox="0 0 2182 1275"]') })
      .waitFor({ state: "detached", timeout: requestTimeout });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    if (acl) await page.waitForLoadState("load", { timeout: requestTimeout });
    entry.viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
    assert.deepEqual(entry.viewport, viewport);
    assert.equal(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches), test.theme === "dark");
    if (screenshot) {
      const image = await page.screenshot({ animations: "disabled", timeout: requestTimeout, style: "nextjs-portal { display: none !important; }" });
      entry.screenshotSha256 = sha256(image);
      entry.screenshot = `captures/${entry.screenshotSha256}.png`;
      await writeFile(resolve(here, entry.screenshot), image);
    }
    if (acl) {
      entry.sameOriginRequests = [...requests.values()];
      entry.unexpectedStaffResponses = entry.sameOriginRequests.filter(({ category, status }) => category === "staff-api" && status >= 200 && status < 300);
      assert.deepEqual(entry.unexpectedStaffResponses, [], "A staff API returned 2xx during Student navigation");
    }
    entry.classification = redirected ? "redirected" : "forbidden";
    entry.status = "pass";
  } catch (error) {
    if (acl && !entry.sameOriginRequests) entry.sameOriginRequests = [...requests.values()];
    if (page.url().startsWith(origin)) {
      const url = new URL(page.url());
      entry.landedPath = url.pathname + url.search;
    }
    entry.error = error instanceof Error ? error.message : String(error);
  } finally {
    await page.close();
  }
  return entry;
}

async function checkpoints(browser, seed) {
  const picks = [
    { path: "/admin/courses", role: "admin", label: "Biologi Dasar" },
    { path: "/tutor/academic-course-1/participants", role: "tutor", label: "Nadia Lestari" },
  ];
  const authorized = [];
  const anonymous = [];
  const retries = [];
  for (const { path, role, label } of picks) {
    const anonymousContext = await contextFor(browser, "light");
    try {
      const response = await anonymousContext.request.get(origin + path, { maxRedirects: 0, timeout: requestTimeout });
      const location = new URL(response.headers().location, origin);
      assert.equal(response.status(), 307);
      assert.equal(location.pathname, "/sign-in");
      assert.equal(location.searchParams.get("next"), path);
      anonymous.push({ path, status: response.status(), destination: location.pathname + location.search });
    } finally { await anonymousContext.close(); }
    const authorizedContext = await contextFor(browser, "light", role);
    try {
      const verified = await identity(authorizedContext, role);
      const page = await authorizedContext.newPage();
      const response = await page.goto(origin + path, { waitUntil: "domcontentloaded", timeout: requestTimeout });
      assert.equal(response?.status(), 200);
      await page.getByText(label, { exact: true }).filter({ visible: true }).first().waitFor({ timeout: requestTimeout });
      const landedPath = new URL(page.url()).pathname;
      assert.equal(landedPath, path);
      authorized.push({ path, landedPath, fixtureMarker: label, status: response.status(), identity: verified });
    } finally { await authorizedContext.close(); }
    const student = await contextFor(browser, "light", "student");
    try {
      const test = denied.find((test) => test.path === path);
      assert.ok(test);
      const retry = await evidence(student, test, seed, false);
      retries.push(retry);
    } finally { await student.close(); }
  }
  return { authorized, anonymous, retries };
}

checkServingRevision();
const seed = await verifySeed();
if (!acl) await mkdir(resolve(here, "captures"), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PARITY_CHROMIUM_EXECUTABLE ?? "/usr/bin/chromium" });
const previous = selected.size ? JSON.parse(await readFile(output, "utf8").catch(() => "null")) : null;
if (previous) assert.equal(previous.revision, revision, "A partial rerun needs the recorded source revision");
const queue = denied.filter(({ id }) => !selected.size || selected.has(id));
const entries = new Map((previous?.entries ?? []).map((entry) => [entry.id, entry]));
try {
  const checkpointResults = await checkpoints(browser, seed);
  for (const retry of checkpointResults.retries) console.log(`repeat ${retry.status} ${retry.requestedPath} ${retry.error ?? retry.landedPath}`);
  const observationScope = acl ? { sameOrigin: true, fields: ["path", "method", "status", "category"], through: "hydrated page load",
    staffEndpoints, staffRules: ["non-read /api/quiz/templates", "/api/live/[sessionId]/control"],
    sessionEndpoints, studentEndpoints, scopedAcademicEndpoints, endpointSource: "packages/native-parity/academic/report/http-contracts.tsv" } : apiObservation;
  const manifest = { schemaVersion: 1, revision, origin, viewport, locale, identityEndpoint, apiObservation: observationScope, browserVersion: browser.version(),
    observedAt: new Date().toISOString(), seed, checkpoints: checkpointResults, entries: [] };
  let saving = Promise.resolve();
  function save() {
    saving = saving.then(async () => {
      manifest.entries = denied.flatMap(({ id }) => entries.has(id) ? [entries.get(id)] : []);
      manifest.summary = { passed: manifest.entries.filter(({ status }) => status === "pass").length,
        observed: manifest.entries.length, registered: denied.length,
        uniqueScreenshots: new Set(manifest.entries.flatMap(({ screenshot }) => screenshot ? [screenshot] : [])).size };
      if (acl) {
        const observed = manifest.entries.flatMap(({ sameOriginRequests }) => sameOriginRequests ?? []);
        manifest.summary.observedRequests = observed.length;
        manifest.summary.requestCategories = Object.fromEntries([...new Set(observed.map(({ category }) => category))].sort()
          .map((category) => [category, observed.filter((request) => request.category === category).length]));
        manifest.summary.unexpectedStaffResponses = observed.filter(({ category, status }) => category === "staff-api" && status >= 200 && status < 300).length;
      }
      await writeFile(`${output}.tmp`, JSON.stringify(manifest, null, 2) + "\n");
      await rename(`${output}.tmp`, output);
    });
    return saving;
  }
  const workers = Array.from({ length: 2 }, async () => {
    const context = await contextFor(browser, "light", "student");
    try {
      for (let test = queue.shift(); test; test = queue.shift()) {
        const entry = await evidence(context, test, seed, !acl);
        const prior = entries.get(entry.id);
        if (prior) entry.previousAttempts = [...(prior.previousAttempts ?? []), {
          status: prior.status, classification: prior.classification, landedPath: prior.landedPath, navigation: prior.navigation, error: prior.error,
        }];
        entries.set(entry.id, entry);
        console.log(`${entry.status} ${entry.id} ${entry.initialHttpStatus ?? "-"} ${entry.landedPath ?? "-"}`);
        await save();
      }
    } finally { await context.close(); }
  });
  await Promise.all(workers);
  checkServingRevision();
  await save();
  assert.equal(manifest.summary.passed, manifest.summary.observed);
} finally { await browser.close(); }
