import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { DiscussionChannelMetadata, DiscussionPage, DiscussionMessage, DiscussionThread } from "../../../../lib/discussions/contracts";
import { studentCommunityAlias } from "../../../../packages/native-parity/student/community/routes";
import { createStudentFixtureRequest } from "../../../../packages/native-parity/student/fixture-request";
import { studentFixturePath } from "../../../../apps/mobile-native/features/student/fixture-location";
import { matchStudentRoute } from "../../../../apps/mobile-native/features/student/routes";
import { buildStudentDiscussionsReference } from "../../fixtures/student-discussions-reference-build";
import { fixtureFontStyles } from "../../fixtures/fonts";

const origin = "http://student-discussions-reference.invalid";
const targets = [
  { platform: "android", viewport: { width: 380, height: 820 }, deviceScaleFactor: 1 },
  { platform: "ios", viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 },
] as const;
const groups = [
  { id: "discussion-alias", entry: "/discussions", pattern: "/discussions", terminal: "/dashboard/discussions", course: null },
  { id: "dashboard-discussions", entry: "/dashboard/discussions", pattern: "/dashboard/discussions", terminal: "/dashboard/discussions", course: null },
  { id: "course-discussions", entry: "/courses/matematika-1/discussions", pattern: "/courses/[id]/discussions", terminal: "/courses/matematika-1/discussions", course: "matematika-1" },
] as const;
const states = ["list", "thread", "empty"] as const;
const channel = "channel-math";
const thread = "thread-limit";
const message = "message-limit";
const workspace = "/api/discussions/workspace";
const scope = "/api/native/student/community/discussion-scope";
const title = "Limit kiri dan kanan pada fungsi potongan";
const body = "Bagaimana cara menentukan limit kiri dan kanan jika nilai fungsi pada titik sambung berbeda?";
const sources = [
  "app/(student)/discussions/page.tsx",
  "app/(student)/dashboard/discussions/page.tsx",
  "app/(student)/courses/[id]/discussions/page.tsx",
  "components/discussions/discussion-page.tsx",
  "components/discussions/discussion-client.tsx",
  "components/discussions/discussion-workspace.tsx",
  "components/discussions/discussion-message.tsx",
  "components/discussions/discussion-adapter.ts",
  "features/discussions/ui/mobile/discussion-workspace-mobile.tsx",
  "features/discussions/ui/shared/discussion-workspace-parts.tsx",
  "messages/id/discussions.json",
  "app/globals.css",
  "apps/mobile-native/features/student/StudentFixtureRoute.tsx",
  "apps/mobile-native/features/student/fixture-location.ts",
  "apps/mobile-native/features/student/community/discussions.tsx",
  "apps/mobile-native/features/student/community/index.tsx",
  "packages/native-parity/student/fixture-request.ts",
  "packages/native-parity/student/community/fixtures.ts",
  "packages/native-parity/student/community/routes.ts",
  "tests/visual/fixtures/interactive-document-build.ts",
  "tests/visual/fixtures/fonts/inter-latin.woff2",
  "tests/visual/fixtures/fonts/lexend-latin.woff2",
  "tests/visual/fixtures/student-discussions-reference.tsx",
  "tests/visual/fixtures/student-discussions-reference-build.ts",
  "tests/visual/native-parallel/student/discussions-reference.spec.ts",
];

async function json<T>(response: Response): Promise<T> {
  expect(response.ok).toBe(true);
  return response.json();
}

test("Student discussion route references share the native workspace input", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile-380", "Captures both device extents directly.");
  test.setTimeout(240_000);
  const fixture = await buildStudentDiscussionsReference();
  const css = fixture.styles + fixtureFontStyles();
  const digests = Object.fromEntries(await Promise.all(sources.map(async path =>
    [path, createHash("sha256").update(await readFile(path)).digest("hex")] as const)));
  for (const group of groups) {
    const maestro = `.maestro/native-parallel/student/${group.id}-parity.yaml`;
    const flow = await readFile(maestro, "utf8");
    const nativeUrls = [...flow.matchAll(/^- openLink: "([^"]+)"$/gm)].map(([, url]) => new URL(url));
    expect(nativeUrls).toHaveLength(states.length);
    const sourceDigests = { ...digests, [maestro]: createHash("sha256").update(flow).digest("hex") };
    for (const target of targets) {
      const verified: Record<string, unknown> = {};
      const captures: Record<string, string> = {};
      const output = info.outputPath(group.id, target.platform);
      await mkdir(output, { recursive: true });
      for (const [index, state] of states.entries()) {
        const alias = group.entry !== group.terminal;
        const query = new URLSearchParams(alias ? [["ref", "first"]] : []);
        if (state === "thread") {
          query.set("channel", channel);
          query.set("thread", thread);
          query.set("message", message);
        }
        const search = query.size ? `?${query}` : "";
        const entry = group.entry + search;
        const terminal = group.terminal + search;
        const scenario = state === "empty" ? "empty" : "loaded";
        const inputs = createStudentFixtureRequest(scenario);
        const nativeUrl = nativeUrls[index];
        expect(nativeUrl.protocol + "//" + nativeUrl.hostname).toBe("zyx-native-parity://student-fixture");
        const nativeParams = Object.fromEntries(nativeUrl.searchParams);
        expect(nativeParams).toEqual({ scenario, path: group.entry, locale: "id", theme: "light",
          ...Object.fromEntries([...query].map(([key, value]) => [`query_${key}`, value])) });
        expect(studentFixturePath(nativeParams, scenario)).toBe(entry);
        const repeat = alias && state === "list" ? {
          entry: "/discussions?ref=first&ref=second",
          terminal: "/dashboard/discussions?ref=first&ref=second",
        } : null;
        if (repeat) expect(studentCommunityAlias(group.pattern, repeat.entry)).toBe(repeat.terminal);
        expect(matchStudentRoute(entry)?.pattern).toBe(group.pattern);
        expect(studentCommunityAlias(group.pattern, entry) ?? entry).toBe(terminal);
        expect(flow).toContain(`- takeScreenshot: student-${group.id}-${state}`);

        const inputScope = await json<{ catalog: DiscussionPage<DiscussionChannelMetadata>; courseId: string | null }>(
          await inputs(scope + (group.course ? `?course=${group.course}` : "")),
        );
        expect(inputScope.courseId).toBe(group.course);
        expect(inputScope.catalog.items.map(item => item.id)).toEqual(group.course ? [channel] : ["channel-general", channel]);
        const listPath = `${workspace}?view=threads&status=open${group.course ? `&channelId=${channel}` : ""}`;
        const list = await json<DiscussionPage<DiscussionThread>>(await inputs(listPath));
        expect(list.items.map(row => row.title)).toEqual(state === "empty" ? [] : [title]);
        const detail = state === "thread" ? await json<{ thread: DiscussionThread; messages: DiscussionPage<DiscussionMessage> }>(
          await inputs(`${workspace}?view=thread&threadId=${thread}&messageId=${message}`, { method: "POST" }),
        ) : null;
        if (detail) {
          expect(detail.thread.id).toBe(thread);
          expect(detail.messages.items.map(item => [item.id, item.body])).toEqual([[message, body]]);
        }
        const nativeMarkers = [{ id: "student-fixture-id-light" }, ...(state === "thread"
          ? [{ text: "^Pesan yang dibuka$" }, { text: `^${title}$` }, { text: `^${body.slice(0, -1)}\\?$` }]
          : [{ text: state === "empty" ? "^Belum ada diskusi\\.$" : `^${title}(?:,.*)?$` },
            { text: group.course ? "^Matematika I$" : "^Semua kanal$", selected: true }])];

        const request = createStudentFixtureRequest(scenario);
        const context = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor,
          hasTouch: true, isMobile: true, colorScheme: "light", locale: "id-ID", timezoneId: "Asia/Jakarta", reducedMotion: "reduce" });
        try {
          const page = await context.newPage();
          const documents: string[] = [];
          const errors: string[] = [];
          const observed = new Set<string>();
          page.on("pageerror", error => errors.push(error.message));
          page.on("request", req => {
            const url = new URL(req.url());
            if (req.resourceType() === "document") documents.push(url.pathname + url.search);
          });
          await page.route("**/*", async route => {
            const http = route.request();
            const url = new URL(http.url());
            if (url.origin === origin) {
              if (http.resourceType() === "document" && [entry, terminal, repeat?.entry, repeat?.terminal].includes(url.pathname + url.search)) {
                return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="id" class="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/__discussion.css"><body class="bg-background text-foreground"><div id="root"></div><script defer src="/__discussion.js"></script></body></html>' });
              }
              if (url.pathname === "/__discussion.css") return route.fulfill({ contentType: "text/css", body: css });
              if (url.pathname === "/__discussion.js") return route.fulfill({ contentType: "application/javascript", body: fixture.script });
              if (/^\/brand\/zyx-logo-(?:horizontal|symbol)-(?:color|reversed)\.svg$/.test(url.pathname)) {
                return route.fulfill({ contentType: "image/svg+xml", body: await readFile("public" + url.pathname) });
              }
              if (url.pathname === workspace || url.pathname === "/api/native/student/community/discussion") {
                if (url.pathname === workspace) {
                  expect(http.headers()["x-student-id"]).toBe("student-fixture");
                  const view = url.searchParams.get("view");
                  if (view === "catalog") expect(url.searchParams.get("courseId")).toBe(group.course);
                  if (view === "threads" && state !== "thread") expect(url.searchParams.get("channelId")).toBe(group.course ? channel : null);
                  if (view === "thread" && state === "thread") {
                    expect(url.searchParams.get("threadId")).toBe(thread);
                    expect(url.searchParams.get("messageId")).toBe(message);
                  }
                  observed.add(view ?? "");
                }
                const reply = await request(url.pathname + url.search, { method: http.method(), body: http.postData() });
                return route.fulfill({ status: reply.status, contentType: "application/json", body: await reply.text() });
              }
            }
            errors.push(`Unexpected fixture request ${http.method()} ${url.pathname}`);
            return route.abort();
          });
          expect((await page.goto(origin + entry, { waitUntil: "commit" }))?.status()).toBe(200);
          await expect(page).toHaveURL(origin + terminal);
          const panel = page.locator("[data-discussion-workspace]");
          await expect(panel).toBeVisible();
          if (state === "thread") {
            const targetMessage = panel.locator(`[data-message-id="${message}"][data-discussion-target="true"]`);
            await expect(targetMessage.getByText(body, { exact: true })).toBeInViewport();
            await expect(page.getByRole("banner").getByText(title, { exact: true })).toBeVisible();
            expect(observed.has("thread")).toBe(true);
          } else {
            const row = panel.getByRole("button", { name: new RegExp(`^${title}`) });
            if (state === "empty") {
              await expect(panel.getByText("Belum ada pertanyaan", { exact: true })).toBeInViewport();
              await expect(row).toHaveCount(0);
            } else await expect(row).toBeInViewport();
            expect(observed.has("threads")).toBe(true);
          }
          await page.evaluate(() => document.fonts.ready);
          expect(documents).toEqual(alias ? [entry, terminal] : [entry]);
          if (alias) expect(new URL(page.url()).searchParams.getAll("ref")).toEqual(["first"]);
          const presentation = await page.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight },
            deviceScaleFactor: devicePixelRatio, locale: document.documentElement.lang,
            theme: document.documentElement.classList.contains("light") ? "light" : "dark",
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
          expect(presentation).toEqual({ viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor, locale: "id", theme: "light", overflow: false });
          expect(errors).toEqual([]);
          const filename = `${group.id}-${state}.png`;
          captures[filename] = createHash("sha256").update(await page.screenshot({ path: info.outputPath(group.id, target.platform, filename), animations: "disabled", scale: "device" })).digest("hex");
          const capturedDocuments = [...documents];
          if (repeat) {
            await page.goto(origin + repeat.entry, { waitUntil: "commit" });
            await expect(page).toHaveURL(origin + repeat.terminal);
            await expect(page.locator("[data-discussion-workspace]")).toBeVisible();
            expect(new URL(page.url()).searchParams.getAll("ref")).toEqual(["first", "second"]);
            expect(documents.slice(capturedDocuments.length)).toEqual([repeat.entry, repeat.terminal]);
            expect(errors).toEqual([]);
          }
          verified[state] = { entry, terminal, documents: capturedDocuments, repeatQueryProof: repeat, fixture: scenario, nativeMarkers,
            native: { params: nativeParams, entry, resolvedPath: terminal },
            web: presentation, course: group.course, scope: inputScope, list, detail };
        } finally {
          await context.close();
        }
      }
      await writeFile(info.outputPath(group.id, target.platform, `${group.id}-reference.json`), JSON.stringify({
        ...target, locale: "id", theme: "light", timeZone: "Asia/Jakarta", motion: "reduced",
        scope: "Discussion list and targeted thread state with a synthetic Student session", sourceDigests, states: verified, captures,
      }, null, 2) + "\n");
    }
  }
});
