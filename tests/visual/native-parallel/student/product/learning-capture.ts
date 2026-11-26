import { chromium, type Page } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";
import { learningEvidence, learningEvidenceDatabase } from "./learning-seed";

type Capture = {
  id: string;
  pattern: string;
  path: string;
  text?: string[];
  selector?: string;
  scenario?: "visitor";
  terminal?: string;
  redirects?: string[];
  flip?: boolean;
};

const course = `/courses/${learningEvidence.course}`;
const pka = `/courses/${learningEvidence.pka}`;
const courseCase = (id: string, tail: string, detail = tail): Capture => ({
  id, pattern: `/courses/[id]/${detail}`, path: `${course}/${tail}`,
});
const cases: Capture[] = [
  { ...courseCase("concept", `concept/${learningEvidence.concept}`, "concept/[slug]"), text: ["Limit ada jika nilai dari kiri dan kanan"] },
  { ...courseCase("flashcard", "flashcard"), text: ["Kapan limit dari dua arah ada?"], flip: true },
  { ...courseCase("mastery", "mastery"), text: ["Limit dari dua arah", "56"] },
  { ...courseCase("mastery-locked", "mastery"), text: ["Kelas memerlukan token"], scenario: "visitor" },
  { ...courseCase("path", "path"), text: ["Limit dari dua arah"] },
  { ...courseCase("playground", "playground"), selector: "main .cm-content" },
  { ...courseCase("progress", "progress"), text: ["Membaca limit dari tabel"], selector: 'main [aria-label="Statistik belajar"]' },
  { ...courseCase("video", "video"), text: ["Pembahasan limit", "Membaca limit dengan tabel"] },
  { ...courseCase("live", "live"), text: ["Belum ada sesi kuis langsung"] },
  { ...courseCase("live-host", "live/host"), redirects: [`/tutor/${learningEvidence.course}/live`, "/"], terminal: "/" },
  { id: "pka-home", pattern: pka, path: pka, text: ["Persiapan sesi Matematika", "Diskusi limit PKA"] },
  { id: "pka-registration", pattern: `${pka}/daftar`, path: `${pka}/daftar`, text: ["Pendaftaran ditutup"], scenario: "visitor" },
  { id: "pka-schedule", pattern: `${pka}/jadwal`, path: `${pka}/jadwal`, text: ["Diskusi limit PKA", "Gabung Meet"] },
  { id: "pka-report", pattern: `${pka}/laporan`, path: `${pka}/laporan`, text: ["Laporan diagnostik", "85%"] },
  { id: "pka-material-list", pattern: `${pka}/material`, path: `${pka}/material`, text: ["Persiapan limit PKA"] },
  { id: "pka-material-detail", pattern: `${pka}/material/[materialId]`, path: `${pka}/material/${learningEvidence.pkaMaterial}`, text: ["Bandingkan nilai dari kiri dan kanan"] },
  { id: "pka-simulation", pattern: `${pka}/simulasi`, path: `${pka}/simulasi`, text: ["Simulasi Ujian PKA", "Simulasi matematika tahap 1"] },
  { id: "pka-stage", pattern: `${pka}/simulasi/[subject]/[stage]`, path: `${pka}/simulasi/matematika/1`, text: ["Ambang kelulusan stage ini", "Mulai simulasi"] },
  { id: "pka-stage-locked", pattern: `${pka}/simulasi/[subject]/[stage]`, path: `${pka}/simulasi/matematika/2`, text: ["Stage 2 masih terkunci"] },
  { id: "pka-simulation-visitor", pattern: `${pka}/simulasi`, path: `${pka}/simulasi`, text: ["Pendaftaran ditutup"], scenario: "visitor",
    redirects: [`${pka}/daftar`], terminal: `${pka}/daftar` },
];

const origin = new URL(process.env.BETTER_AUTH_URL ?? "").origin;
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)) throw new Error("Expected loopback Next.js origin");
const serverSha = process.env.STUDENT_SERVER_SHA;
if (!serverSha || !/^[a-f0-9]{40}$/.test(serverSha)) throw new Error("Set STUDENT_SERVER_SHA to the running Next checkout commit");
const out = process.env.STUDENT_CAPTURE_DIR ?? "artifacts/student-evidence/learning-product";
const ids = process.env.STUDENT_LEARNING_CAPTURE_IDS?.split(",").filter(Boolean);
const selected = ids ? cases.filter(item => ids.includes(item.id)) : cases;
if (!selected.length || (ids && selected.length !== ids.length)) throw new Error("Unrecognized learning capture ID");
const width = 380, height = 844, dpr = 1;
const theme = "light", locale = "id-ID", timezone = "Asia/Jakarta";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret || secret.length < 32) throw new Error("Synthetic local Better Auth secret required");
const db = new Client({ connectionString: learningEvidenceDatabase().href });
const cookie = new Map<string, string>();
await db.connect();
try {
  for (const id of [learningEvidence.learner, learningEvidence.visitor]) {
    const row = await db.query<{ token: string }>("select token from session where id = $1 and user_id = $1 and expires_at > now()", [id]);
    if (row.rowCount !== 1) throw new Error("Missing learning evidence session. Run learning-seed.ts first.");
    const token = row.rows[0].token;
    cookie.set(id, encodeURIComponent(`${token}.${await makeSignature(token, secret)}`));
  }
} finally { await db.end(); }

async function capture(page: Page, filename: string) {
  await page.screenshot({ path: join(out, filename), animations: "disabled", timeout: 30_000 });
  return { file: filename, sha256: createHash("sha256").update(await readFile(join(out, filename))).digest("hex") };
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
const results: Record<string, unknown>[] = [];
try {
  for (const item of selected) {
    const id = item.scenario === "visitor" ? learningEvidence.visitor : learningEvidence.learner;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true,
      locale, timezoneId: timezone, colorScheme: theme, reducedMotion: "reduce", serviceWorkers: "block" });
    await context.addCookies([{ name: "better-auth.session_token", value: cookie.get(id)!, url: origin, httpOnly: true, sameSite: "Lax" }]);
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      return url.protocol === "data:" || url.protocol === "blob:" || url.origin === origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    const documents: { status: number; path: string }[] = [], errors: string[] = [], failedRequests: string[] = [];
    page.on("pageerror", error => errors.push(error.message.slice(0, 200)));
    page.on("response", response => {
      const url = new URL(response.url());
      if (url.origin !== origin) return;
      if (response.request().resourceType() === "document") documents.push({ status: response.status(), path: url.pathname });
      if (response.status() >= 400) failedRequests.push(`${response.status()} ${url.pathname}`);
    });
    try {
      const response = await page.goto(origin + item.path, { timeout: 150_000, waitUntil: "domcontentloaded" });
      const expectedPath = item.terminal ?? item.path;
      await page.waitForURL(url => url.pathname === expectedPath, { timeout: 30_000 });
      if (!response?.ok()) throw new Error(`Initial navigation HTTP ${response?.status()}`);
      await page.locator("main").last().waitFor({ state: "visible", timeout: 30_000 });
      if (expectedPath.startsWith("/courses/")) {
        await page.getByText(/^Memuat mata kuliah(?:\.+|…)$/).filter({ visible: true }).first().waitFor({ state: "hidden", timeout: 35_000 });
      }
      for (const text of item.text ?? []) await page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 35_000 });
      if (item.selector) await page.locator(item.selector).first().waitFor({ state: "visible", timeout: 15_000 });
      for (const expected of item.redirects ?? []) {
        if (expected !== expectedPath && !documents.some(document => document.path === expected && document.status >= 300 && document.status < 400)) {
          throw new Error(`Missing redirect document ${expected}`);
        }
      }
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: "nextjs-portal { display: none !important }" });
      if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) throw new Error("Horizontal overflow");
      if (errors.length || failedRequests.length) throw new Error("Same-origin HTTP or page runtime error");
      const screenshots = [await capture(page, `${item.id}.png`)];
      if (item.flip) {
        await page.getByRole("button", { name: "Ketuk untuk membalik kartu" }).click();
        await page.getByText("Saat limit kiri dan kanan sama.", { exact: true }).waitFor({ state: "visible" });
        await page.locator("[data-flashcard-rating-dock]").waitFor({ state: "visible" });
        screenshots.push(await capture(page, `${item.id}-answer.png`));
      }
      results.push({ ...item, terminal: expectedPath, status: response.status(), documents, screenshots });
      console.log(`${item.id}: captured`);
    } catch (error) {
      const headings = await page.locator("main h1:visible, main h2:visible, main h3:visible").allTextContents().catch(() => []);
      results.push({ ...item, actualPath: new URL(page.url()).pathname, documents, visibleHeadings: headings.slice(0, 5),
        error: error instanceof Error ? error.message.slice(0, 400) : "Unavailable", failedRequests, runtimeErrors: errors });
      console.log(`${item.id}: unavailable`);
    } finally {
      await context.close();
      await writeFile(join(out, "web.json"), JSON.stringify({ serverSha, browser: browser.version(), width, height, dpr, theme, locale, timezone, results }, null, 2) + "\n");
    }
  }
} finally { await browser.close(); }
if (results.some(item => item.error)) process.exitCode = 1;
