import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { stubVisualTelemetry } from "../../../telemetry-stubs";
import { waitForVisualReadiness } from "../../../visual-readiness";
import { communityReference as data } from "./community-data";
import { localStudentCookie } from "./session";

const base = process.env.STUDENT_COMMUNITY_HTTP_BASE;
const captureDir = process.env.STUDENT_COMMUNITY_CAPTURE_DIR;
const serverSha = process.env.STUDENT_SERVER_SHA;
test.skip(!base, "Opt-in synthetic Student product server");
test.setTimeout(240_000);
test.use({ locale: "id-ID", contextOptions: { reducedMotion: "reduce" } });

type TextExpectation = { kind: "text" | "heading" | "button" | "tab" | "label" | "combobox" | "menuitemradio"; value: string; exact?: boolean };
type Case = {
  id: string;
  path: string;
  expectedPath?: string;
  scenario?: Parameters<typeof localStudentCookie>[0];
  expectedQuery?: Record<string, string[]>;
  checks: TextExpectation[];
  selectedTab?: string;
  openMenu?: string;
  profileLink?: string;
};
const text = (value: string, exact = true): TextExpectation => ({ kind: "text", value, exact });
const heading = (value: string): TextExpectation => ({ kind: "heading", value });
const button = (value: string, exact = true): TextExpectation => ({ kind: "button", value, exact });
const tab = (value: string): TextExpectation => ({ kind: "tab", value });
const label = (value: string): TextExpectation => ({ kind: "label", value });
const course = "/courses/" + data.course;
const openThread = "?thread=" + data.threadId;

const cases: Case[] = [
  { id: "leaderboard-participation", path: "/leaderboard", checks: [tab("Akademik"), text(data.learner)] },
  { id: "leaderboard-academic-alias", path: "/leaderboard/academic?course=" + data.course + "&custom=first&custom=second",
    expectedPath: "/leaderboard", expectedQuery: { tab: ["academic"], course: [data.course], custom: ["first", "second"] },
    checks: [text(data.courseTitle), text(data.learner), text("93%", false)], selectedTab: "Akademik" },
  { id: "course-leaderboard", path: course + "/leaderboard", checks: [text("Peringkat Anda"), text(data.learner), text("93%")] },
  { id: "course-leaderboard-revoked", path: "/courses/matematika-1/leaderboard", scenario: "revoked", checks: [heading("Kelas memerlukan token")] },
  { id: "course-discussions", path: course + "/discussions", checks: [button(data.threadTitle, false)] },
  { id: "dashboard-discussions", path: "/dashboard/discussions", checks: [button(data.threadTitle, false)] },
  { id: "dashboard-discussions-via-profile", path: "/dashboard/discussions", profileLink: "Diskusi", checks: [button(data.threadTitle, false)] },
  { id: "discussions-alias", path: "/discussions" + openThread, expectedPath: "/dashboard/discussions",
    expectedQuery: { thread: [data.threadId] }, checks: [text(data.threadTitle), text(data.question)] },
  { id: "achievements", path: "/achievements", checks: [tab("Ringkasan"), text("Kades")], selectedTab: "Ringkasan" },
  { id: "achievement-badges", path: "/achievements?tab=badges", checks: [tab("Lencana")], selectedTab: "Lencana" },
  { id: "achievement-missions-empty", path: "/achievements?tab=missions", checks: [tab("Misi")], selectedTab: "Misi" },
  { id: "calendar", path: "/calendar", checks: [heading(data.quiz), heading(`Tutorial: ${data.sessionTopic}`)] },
  { id: "calendar-empty", path: "/calendar", scenario: data.peerSession, checks: [heading("Belum ada agenda terjadwal")] },
  { id: "groups", path: "/dashboard/groups", checks: [text(data.group), text(data.courseTitle)] },
  { id: "schedule", path: "/dashboard/schedule", checks: [heading("Kalender dan jadwal tutorial"), button(data.tutor, false), text(data.sessionTopic)] },
  { id: "feedback", path: "/feedback", checks: [label("Pesan dan saran"), button("Kirim masukan")] },
  { id: "pet", path: "/pet", checks: [heading("Koleksi pet"), text("Zyra")] },
  { id: "profile", path: "/profile", checks: [text(data.learner)] },
  { id: "profile-edit", path: "/profile/edit", checks: [heading("Edit profil"), { kind: "combobox", value: "Tahun masuk ITB (angkatan)" }] },
  { id: "reflections", path: "/profile/reflections", checks: [text("2 kuis"), text("21 flashcard")] },
  { id: "settings", path: "/settings", openMenu: "Bahasa", checks: [
    heading("Preferensi"), { kind: "menuitemradio", value: "Bahasa Indonesia" }, { kind: "menuitemradio", value: "English" },
  ] },
  { id: "settings-via-profile", path: "/settings", profileLink: "Pengaturan", openMenu: "Bahasa", checks: [
    heading("Preferensi"), { kind: "menuitemradio", value: "Bahasa Indonesia" }, { kind: "menuitemradio", value: "English" },
  ] },
  { id: "notification-preferences", path: "/settings/notifications", checks: [heading("Aktivitas belajar"), heading("Jam tenang")] },
  { id: "notification-browser", path: "/settings/notifications/browser", checks: [heading("Hentikan notifikasi browser"), button("Hentikan notifikasi browser")] },
  { id: "public-student-profile", path: "/students/" + data.publicId, checks: [text(data.peer), text("FMIPA"), button("Follow")] },
];

function locate(page: Page, { kind, value, exact = true }: TextExpectation) {
  if (kind === "text") return page.getByText(value, { exact });
  if (kind === "label") return page.getByLabel(value, { exact });
  return page.getByRole(kind, { name: value, exact });
}

async function open(page: Page, scenario: Parameters<typeof localStudentCookie>[0], path: string) {
  const origin = new URL(base!);
  if (!["127.0.0.1", "localhost"].includes(origin.hostname)) throw new Error("Expected loopback Student product server");
  // Seed a previously deferred reminder. Permission remains untouched and no token is registered.
  await page.addInitScript(userId => localStorage.setItem(`zyx:notification-permission:${userId}`, "later:" + Date.now()), "student-evidence-" + scenario);
  const auth = await localStudentCookie(scenario);
  await page.context().addCookies([{ ...auth, url: origin.href, httpOnly: true, sameSite: "Lax" }]);
  await page.context().route("**/*", route => {
    const url = new URL(route.request().url());
    return url.protocol === "data:" || url.protocol === "blob:" || url.origin === origin.origin
      ? route.continue() : route.abort("blockedbyclient");
  });
  await stubVisualTelemetry(page);
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400 && new URL(response.url()).origin === origin.origin) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on("console", event => {
    if (event.type() === "error" && new URL(event.location().url || origin.href, origin).origin === origin.origin) {
      consoleErrors.push(event.text().split("\n")[0].slice(0, 160));
    }
  });
  const response = await page.goto(new URL(path, origin).href, { waitUntil: "domcontentloaded", timeout: 185_000 });
  expect(response?.status()).toBe(200);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await waitForVisualReadiness(page);
  return { errors, consoleErrors };
}

type VisualEvidence = {
  id: string;
  scenario: string;
  path: string;
  terminal?: string;
  entryPath?: string;
  entryErrors?: string[];
  expected: string[];
  status: string;
  screenshot?: string;
  signedInScope?: boolean;
  coursePickerLoading?: boolean;
  viewport?: { width: number; height: number };
  deviceScale?: number;
  theme?: string;
  browser?: string;
  consoleErrors?: string[];
  error?: string;
};

async function record(info: TestInfo, evidence: VisualEvidence, screenshot?: string) {
  if (!captureDir) return;
  if (!serverSha || !/^[0-9a-f]{40}$/i.test(serverSha)) throw new Error("Set STUDENT_SERVER_SHA to the exact web checkout SHA");
  await mkdir(captureDir, { recursive: true });
  const manifest = join(captureDir, `manifest-${info.project.name}.json`);
  let entries: VisualEvidence[] = [];
  try {
    const prior = JSON.parse(await readFile(manifest, "utf8")) as { serverSha: string; entries: VisualEvidence[] };
    if (prior.serverSha !== serverSha) throw new Error("Use a fresh evidence directory for a different server revision");
    entries = prior.entries;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (screenshot && evidence.screenshot) await copyFile(screenshot, join(captureDir, evidence.screenshot));
  entries = [...entries.filter(item => item.id !== evidence.id), evidence];
  const pending = `${manifest}.tmp`;
  await writeFile(pending, JSON.stringify({ serverSha, project: info.project.name, locale: "id-ID", timeZone: "Asia/Jakarta", entries }, null, 2) + "\n");
  await rename(pending, manifest);
}

for (const item of cases) {
  test(`Student community reference: ${item.id}`, async ({ page, browser }, info) => {
    const scenario = item.scenario ?? data.learnerSession;
    const evidence: VisualEvidence = { id: item.id, scenario, path: item.path, expected: item.checks.map(check => check.value),
      status: "failed", browser: browser.version(), viewport: page.viewportSize() ?? undefined };
    let screenshot: string | undefined;
    try {
      const { errors, consoleErrors } = await open(page, scenario, item.profileLink ? "/profile" : item.path);
      if (item.profileLink) {
        await expect(page.getByText(data.learner, { exact: true }).filter({ visible: true }).first()).toBeVisible();
        evidence.entryPath = "/profile";
        evidence.entryErrors = errors.splice(0).map(error => error.split("\n")[0].slice(0, 200));
        await page.getByRole("link", { name: item.profileLink, exact: true }).click();
        await page.waitForURL(url => url.pathname === item.path);
        await waitForVisualReadiness(page);
      }
      const actual = new URL(page.url());
      evidence.terminal = actual.pathname + actual.search;
      expect(actual.pathname).toBe(item.expectedPath ?? item.path.split("?")[0]);
      for (const [name, values] of Object.entries(item.expectedQuery ?? {})) expect(actual.searchParams.getAll(name)).toEqual(values);
      await expect(page.getByRole("main").last()).toBeVisible();
      if (item.openMenu) await page.getByRole("button", { name: item.openMenu, exact: true }).click();
      for (const check of item.checks) await expect(locate(page, check).filter({ visible: true }).first()).toBeVisible({ timeout: 25_000 });
      if (item.selectedTab) await expect(page.getByRole("tab", { name: item.selectedTab, exact: true })).toHaveAttribute("aria-selected", "true");
      const display = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light", dpr: window.devicePixelRatio,
      }));
      expect(display.scrollWidth).toBeLessThanOrEqual(display.clientWidth);
      expect(errors).toEqual([]);
      evidence.theme = display.theme;
      evidence.deviceScale = display.dpr;
      evidence.signedInScope = true;
      evidence.coursePickerLoading = await page.getByText(/Memuat mata kuliah/i).filter({ visible: true }).count() > 0;
      evidence.consoleErrors = [...new Set(consoleErrors)];
      evidence.screenshot = `${info.project.name}-${item.id}.png`;
      screenshot = info.outputPath(evidence.screenshot);
      await page.screenshot({ path: screenshot, animations: "disabled" });
      await info.attach(item.id, { path: screenshot, contentType: "image/png" });
      evidence.status = "passed";
    } catch (error) {
      evidence.error = String(error).replace(/\u001b\[[0-9;]*m/g, "").slice(0, 600);
      throw error;
    } finally {
      await record(info, evidence, evidence.status === "passed" ? screenshot : undefined);
    }
  });
}
