import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import katex from "katex";
import { DEFAULT_OFFLINE_POLICY } from "../../lib/offline/sync-contract";

const origin = "https://offline-native.fixture.test";
const environment = "https://staging.zyxacademy.com";
const thumbnail = `data:image/png;base64,${readFileSync(resolve("tests/visual/fixtures/rich-documents/built/mechanics.png")).toString("base64")}`;
type Platform = "desktop" | "android";
type Scenario = "populated" | "empty" | "expired" | "unsupported";

test.beforeAll(() => { execFileSync(process.execPath, ["scripts/build-native-offline.mjs"], { cwd: process.cwd(), stdio: "pipe", env: { ...process.env, ZYX_APP_CHANNEL: "nightly" } }); });

async function launch(page: Page, platform: Platform, theme: "light" | "dark", locale: "id" | "en" = "id", scenario: Scenario = "populated", stalledOnline = false) {
  const now = Date.now(); const scopeKey = JSON.stringify([environment, "fixture-student", locale]);
  const library = {
    schemaVersion: 2, scopeKey, environment, userId: "fixture-student", sessionId: "fixture-session", locale,
    accessValidUntil: scenario === "expired" ? now - 1000 : now + 86_400_000, lastVerifiedAt: now - 60_000,
    syncCursor: "42", policy: DEFAULT_OFFLINE_POLICY, syncState: "ready",
    courses: [
      { id: "math", title: locale === "id" ? "Matematika I" : "Mathematics I", code: "MA1101" },
      { id: "physics", title: locale === "id" ? "Fisika Dasar I" : "Fundamental Physics I", code: "FI1101" },
      { id: "computing", title: locale === "id" ? "Berpikir Komputasional dan Pemrograman" : "Computational Thinking and Programming", code: "KU1101" },
    ],
    materials: [
      { id: "limits", courseId: "math", title: locale === "id" ? "Limit fungsi dan pendekatan nilai" : "Function limits and approaching a value", kind: "article", contentVersion: "v2" },
      { id: "derivatives", courseId: "math", title: locale === "id" ? "Diktat turunan dan penerapannya dalam laju perubahan" : "Study guide: derivatives and rates of change", kind: "diktat", contentVersion: "v3" },
      { id: "motion", courseId: "physics", title: locale === "id" ? "Gerak lurus dengan percepatan tetap" : "Motion with constant acceleration", kind: "article", contentVersion: "v1" },
      { id: "limit-video", courseId: "math", title: locale === "id" ? "Memahami limit dari grafik" : "Understanding limits from a graph", kind: "video", thumbnailUrl: thumbnail, videoUrl: "https://www.youtube.com/watch?v=fixture", contentVersion: "v1" },
      { id: "motion-video", courseId: "physics", title: locale === "id" ? "Menentukan arah percepatan benda" : "Finding the direction of acceleration", kind: "video", videoUrl: "https://www.youtube.com/watch?v=fixture2", contentVersion: "v1" },
    ],
    achievements: [
      { id: "first-step", title: locale === "id" ? "Langkah pertama" : "First steps", description: locale === "id" ? "Selesaikan materi pertama Anda." : "Complete your first material.", icon: "book" },
      { id: "consistent", title: locale === "id" ? "Belajar rutin" : "Study regularly", description: locale === "id" ? "Belajar dalam beberapa hari berturut-turut." : "Study on consecutive days.", icon: "calendar" },
      { id: "curious", title: locale === "id" ? "Aktif berdiskusi" : "Join the discussion", description: locale === "id" ? "Tanya dan berbagi jawaban dalam diskusi mata kuliah." : "Ask questions and share answers in course discussions.", icon: "message" },
    ],
  };
  const records = library.materials.filter(item => item.kind !== "video").map((material, index) => ({
    schemaVersion: 2, key: `fixture-student::${encodeURIComponent(environment)}::${locale}::${material.courseId}::${material.id}`,
    scopeKey, environment, locale, userId: library.userId, courseId: material.courseId, materialId: material.id,
    kind: material.kind === "diktat" ? "course_material" : "structured_article", resourceKind: material.kind, chapterIds: ["chapter-1"],
    contentVersion: material.contentVersion, contentCursor: "42", lastVerifiedAt: library.lastVerifiedAt, accessValidUntil: library.accessValidUntil,
    pinned: index === 0, assetsComplete: true, title: material.title, courseTitle: library.courses.find(c => c.id === material.courseId)!.title,
    sizeBytes: 220_000 + index * 70_000, savedAt: library.lastVerifiedAt, lastAccessedAt: library.lastVerifiedAt, estimatedMinutes: 8 + index * 3,
    sections: [{ id: "definition", slug: "definition", heading: locale === "id" ? "Mendekati suatu nilai" : "Approaching a value", body: "", bodyHtml: `<p>${locale === "id" ? "Nilai fungsi dapat mendekati suatu bilangan saat nilai masukan makin dekat ke titik yang kita tinjau." : "The value of a function can approach a number as its input approaches the point we are studying."}</p>${katex.renderToString("\\lim_{x \\to 2} (3x+1) = 7", { displayMode: true, throwOnError: false })}<p>${locale === "id" ? "Substitusi langsung berlaku karena fungsi ini kontinu di titik tersebut." : "Direct substitution applies because this function is continuous at this point."}</p><table><thead><tr><th>x</th><th>f(x)</th></tr></thead><tbody><tr><td>1.9</td><td>6.7</td></tr><tr><td>1.99</td><td>6.97</td></tr><tr><td>2.01</td><td>7.03</td></tr></tbody></table>` }],
  }));
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.addInitScript(({ platform, library, records, scenario, environment, stalledOnline }) => {
    const state = { library: scenario === "empty" ? null : library, records: scenario === "empty" ? [] : records, online: stalledOnline, requests: [] as unknown[], mode: stalledOnline ? "stalled" : "network" };
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => state.online });
    Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => platform === "desktop" ? "Mozilla/5.0 Windows WebView2" : "ZyxMobileApp/1 (nightly)" });
    const summary = (record: Record<string, unknown>) => { const { sections: _sections, ...meta } = record; return meta; };
    const store = {
      async getLibrarySnapshot() { const valid = Boolean(state.library && state.library.accessValidUntil > Date.now()); return { snapshot: valid ? state.library : null, expired: Boolean(state.library && !valid), identity: state.library ? { userId: state.library.userId, scopeKey: state.library.scopeKey, environment: state.library.environment, locale: state.library.locale } : undefined }; },
      async saveLibrarySnapshot({ payloadJson }: { payloadJson: string }) { state.library = JSON.parse(payloadJson); return { saved: true }; },
      async clearLibrarySnapshot() { state.library = null; state.records = []; },
      async listReadings(options?: { includeExpired?: boolean }) { const visible = state.records.filter(r => options?.includeExpired || r.accessValidUntil > Date.now()); return { items: visible.map(summary), totalBytes: visible.reduce((sum, r) => sum + r.sizeBytes, 0), count: visible.length }; },
      async getReading({ key }: { key: string }) { return { reading: state.records.find(record => record.key === key && record.accessValidUntil > Date.now()) ?? null }; },
      async saveReading({ key, payloadJson }: { key: string; payloadJson: string }) { const record = JSON.parse(payloadJson); state.records = [...state.records.filter(item => item.key !== key), record]; return { saved: true }; },
      async removeReading({ key }: { key: string }) { state.records = state.records.filter(record => record.key !== key); },
      async saveReadingPosition() { return { saved: true }; },
      async clearOtherUsers({ userId }: { userId: string }) { if (state.library?.userId !== userId) { state.library = null; state.records = []; } },
      async offlineRequest(options: unknown) { state.requests.push(options); if (state.mode === "stalled") return new Promise(() => {}); if (state.mode === "revoked") { state.records = []; state.library = null; return { status: 401, headers: {}, bodyBase64: "" }; } throw new Error("Network unavailable"); },
    };
    const global = window as unknown as Record<string, unknown>;
    if (scenario === "unsupported") global.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: {} };
    else if (platform === "android") global.Capacitor = { isNativePlatform: () => true, getPlatform: () => "android", Plugins: { ZyxOfflineStore: store, Network: { getStatus: async () => ({ connected: state.online, connectionType: "wifi" }) } } };
    else global.__TAURI__ = { core: { invoke: async (command: string, args: Record<string, unknown> = {}) => {
      if (command === "get_desktop_server_origin") return environment;
      const map: Record<string, keyof typeof store> = { get_offline_library_snapshot: "getLibrarySnapshot", save_offline_library_snapshot: "saveLibrarySnapshot", clear_offline_library_snapshot: "clearLibrarySnapshot", list_offline_readings: "listReadings", get_offline_reading: "getReading", save_offline_reading: "saveReading", remove_offline_reading: "removeReading", save_offline_reading_position: "saveReadingPosition", clear_other_offline_users: "clearOtherUsers", offline_request: "offlineRequest" };
      if (!map[command]) throw new Error(`Unexpected native command: ${command}`);
      return (store[map[command]] as (args?: unknown) => unknown)(args);
    } } };
    global.__offlineNativeFixture = state;
  }, { platform, library, records, scenario, environment, stalledOnline });
  let releaseProbe: (() => Promise<void>) | undefined;
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === environment && url.pathname === "/favicon.ico" && url.searchParams.has("zyx-connect") && route.request().method() === "HEAD") {
      if (stalledOnline) return new Promise<void>(resolve => { releaseProbe = async () => { await route.fulfill({ status: 200, body: "" }); resolve(); }; });
      return route.fulfill({ status: 200, body: "" });
    }
    if (url.origin !== origin) { failures.push(`Unexpected external request: ${url.href}`); return route.abort(); }
    const prefix = `/native-offline/${platform}/`;
    if (!url.pathname.startsWith(prefix)) { failures.push(`Unexpected request: ${url.href}`); return route.abort(); }
    const file = url.pathname.slice(prefix.length) || "index.html";
    if (file.includes("..")) return route.abort();
    const path = resolve(platform === "desktop" ? "apps/desktop/dist" : "apps/mobile/www", file);
    const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };
    try { return route.fulfill({ body: readFileSync(path), contentType: mime[extname(path)] ?? "application/octet-stream" }); }
    catch { failures.push(`Missing native asset: ${file}`); return route.fulfill({ status: 404 }); }
  });
  await page.goto(`${origin}/native-offline/${platform}/index.html`);
  await page.waitForFunction(async () => { await window.zyxOfflineShell?.ready; return Boolean(window.zyxOfflineShell); });
  if (scenario !== "unsupported") await expect(page.locator("#offline-library-v2")).toBeVisible();
  return { failures, records, hasPendingProbe: () => Boolean(releaseProbe), releaseProbe: async () => { await releaseProbe?.(); } };
}

async function capture(page: Page, info: TestInfo, name: string, failures: string[]) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const path = info.outputPath(`${name}.png`); await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" }); expect(failures).toEqual([]);
}

async function selectSection(page: Page, section: string) {
  const button = page.locator(`[data-section="${section}"]`);
  if (!await button.isVisible()) await page.locator(".offline-v2-more summary").click();
  await button.click();
}

for (const platform of ["desktop", "android"] as const) for (const theme of ["light", "dark"] as const) {
  test(`${platform} bundled library, course, reader and storage in ${theme}`, async ({ page }, info) => {
    const { failures } = await launch(page, platform, theme);
    await expect(page.getByRole("heading", { name: "Materi di perangkat" })).toBeVisible();
    await capture(page, info, `offline-${platform}-courses-${theme}`, failures);
    await page.locator(".offline-v2-row-main").filter({ hasText: "Matematika I" }).click();
    await expect(page.locator(".offline-v2-content")).toContainText("Limit fungsi");
    await capture(page, info, `offline-${platform}-course-${theme}`, failures);
    await page.locator(".offline-v2-row").filter({ hasText: "Limit fungsi" }).getByRole("button", { name: "Buka", exact: true }).click();
    await expect(page.locator("#reader-view")).toBeVisible();
    await expect(page.locator("#reader-body .katex")).toBeVisible();
    await capture(page, info, `offline-${platform}-reader-${theme}`, failures);
    await page.locator("#reader-back-btn").click();
    await selectSection(page, "storage");
    await expect(page.getByRole("meter")).toBeVisible();
    await capture(page, info, `offline-${platform}-storage-${theme}`, failures);
    await page.getByRole("button", { name: "Hapus unduhan", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Batal", exact: true }).click();
    await expect(page.locator(".offline-v2-row")).toHaveCount(3);
  });
}

for (const platform of ["desktop", "android"] as const) test(`${platform} English native metadata and failed refresh retain saved content`, async ({ page }, info) => {
  const { failures } = await launch(page, platform, "light", "en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#lang-en")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#lang-id")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#reader-back-label")).toHaveText("Back");
  await selectSection(page, "achievements");
  await capture(page, info, "offline-native-achievements-en", failures);
  await page.locator('[data-section="videos"]').click();
  await expect(page.getByRole("button", { name: "Open", exact: true }).first()).toBeDisabled();
  await capture(page, info, "offline-native-videos-en", failures);
  await page.evaluate(() => { const state = (window as unknown as { __offlineNativeFixture: { online: boolean } }).__offlineNativeFixture; state.online = true; window.dispatchEvent(new Event("online")); });
  await expect(page.locator(".offline-v2-notice")).toContainText("Could not update");
  await expect(page.locator("#reconnect-banner-text")).toHaveText("Connection restored");
  await expect(page.locator("#banner-online-btn")).toHaveText("Return online");
  expect(page.url()).toContain(`${origin}/native-offline/${platform}/`);
  await page.locator('[data-section="readings"]').click();
  await expect(page.locator(".offline-v2-row")).toHaveCount(3);
  await capture(page, info, "offline-native-sync-error-en", failures);
});

for (const scenario of ["empty", "expired"] as const) test(`native ${scenario} state is scoped and readable`, async ({ page }, info) => {
  const { failures } = await launch(page, "android", "dark", "id", scenario);
  await expect(page.locator(".offline-v2-row")).toHaveCount(0);
  if (scenario === "expired") await expect(page.locator(".offline-v2-notice")).toContainText("memeriksa akses");
  await capture(page, info, `offline-native-${scenario}`, failures);
});

test("native reader waits for the user before replacing an updated version", async ({ page }, info) => {
  const { failures, records } = await launch(page, "desktop", "light");
  await page.locator('[data-section="readings"]').click();
  await page.locator(".offline-v2-row").filter({ hasText: records[0].title }).getByRole("button", { name: "Buka", exact: true }).click();
  await page.evaluate(() => { const state = (window as unknown as { __offlineNativeFixture: { records: Array<{contentVersion: string; sections: Array<{bodyHtml: string}>}> } }).__offlineNativeFixture; state.records[0].contentVersion = "v9"; state.records[0].sections[0].bodyHtml = "<p>Penjelasan versi terbaru.</p>"; window.dispatchEvent(new Event("zyx:offline-cache-changed")); });
  await expect(page.locator("#offline-reader-update")).toBeVisible();
  await expect(page.locator("#reader-body")).not.toContainText("Penjelasan versi terbaru");
  await capture(page, info, "offline-native-reader-update", failures);
  await page.getByRole("button", { name: "Buka versi baru", exact: true }).click();
  await expect(page.locator("#reader-body")).toContainText("Penjelasan versi terbaru");
});

test("empty Nightly desktop opens the configured staging app", async ({ page }) => {
  await launch(page, "desktop", "light", "en", "empty");
  await page.route(`${environment}/dashboard`, route => route.fulfill({ contentType: "text/html", body: "<h1>Online app</h1>" }));
  await page.locator("#lang-en").click();
  await page.getByRole("button", { name: "Open the online app", exact: true }).click();
  await expect(page).toHaveURL(`${environment}/dashboard`);
});

test("a native platform without the storage bridge keeps the bundled recovery view", async ({ page }, info) => {
  const { failures } = await launch(page, "android", "light", "id", "unsupported");
  await expect(page.locator("#home-view .offline-header")).toBeVisible();
  await expect(page.locator("#retry-btn")).toBeVisible();
  await expect(page.locator("#reading-list")).toBeEmpty();
  await capture(page, info, "offline-native-unsupported-recovery", failures);
});

for (const platform of ["desktop", "android"] as const) test(`${platform} cached online launch opens local content while server requests are stalled`, async ({ page }, info) => {
  const { failures, hasPendingProbe, releaseProbe } = await launch(page, platform, "light", "id", "populated", true);
  await expect(page.getByRole("heading", { name: "Materi di perangkat", exact: true })).toBeVisible();
  if (platform === "desktop") {
    await expect(page.locator("#startup-splash")).toBeHidden();
    await expect.poll(hasPendingProbe).toBe(true);
  }
  await expect.poll(() => page.evaluate(() => (window as unknown as { __offlineNativeFixture: { requests: unknown[] } }).__offlineNativeFixture.requests.length)).toBeGreaterThan(0);
  await page.locator('[data-section="readings"]').click();
  await page.locator(".offline-v2-row").filter({ hasText: "Limit fungsi" }).getByRole("button", { name: "Buka", exact: true }).click();
  await expect(page.locator("#reader-body .katex")).toBeVisible();
  await capture(page, info, `offline-${platform}-cold-online-stalled`, failures);
  await releaseProbe();
  await expect(page).toHaveURL(`${origin}/native-offline/${platform}/index.html`);
  await expect(page.locator("#reader-view")).toBeVisible();
  expect(failures).toEqual([]);
});
