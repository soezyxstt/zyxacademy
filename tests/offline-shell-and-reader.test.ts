import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OFFLINE_SW_SCOPE,
  OFFLINE_SW_URL,
  canRegisterOfflineServiceWorker,
  registerOfflineServiceWorker,
  resetOfflineServiceWorkerRegistrationForTests,
} from "@/lib/offline/register-sw";
import {
  buildNativeOfflineSnapshot,
  clearOfflineReadingsForOtherUsers,
  mirrorSaveToNativeStore,
  removeOfflineReadingByKey,
} from "@/lib/offline/reading-cache";
import {
  renderOfflineMarkdownHtml,
  renderOfflineVisualHtml,
  renderOfflineWorkedExampleHtml,
} from "@/lib/offline/offline-snapshot-renderer";
import {
  buildOfflineReadingKey,
  computeScrollRatio,
  loadOfflineReadingPosition,
  pickLatestReadingPosition,
  removeOfflineReadingPosition,
  resolveRestoredScrollY,
  saveOfflineReadingPosition,
} from "@/lib/offline/reading-position";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";

const ROOT = process.cwd();

describe("Item #3: standalone offline shell SW decoupled from push permission", () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    resetOfflineServiceWorkerRegistrationForTests();
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      globalThis.window = originalWindow;
    }
    if (originalNavigator === undefined) {
      delete (globalThis as { navigator?: unknown }).navigator;
    } else {
      globalThis.navigator = originalNavigator;
    }
  });

  test("registers /sw.js at root scope even when Notification permission is denied", async () => {
    const calls: Array<{ url: string; options: unknown }> = [];
    const fakeReg = { scope: "/" } as ServiceWorkerRegistration;

    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      isSecureContext: true,
      location: { hostname: "www.zyxacademy.com" },
      Notification: { permission: "denied" },
    };
    (globalThis as unknown as { navigator: Record<string, unknown> }).navigator = {
      serviceWorker: {
        register: async (url: string, options: unknown) => {
          calls.push({ url, options });
          return fakeReg;
        },
      },
    };

    expect(canRegisterOfflineServiceWorker()).toBe(true);
    const first = await registerOfflineServiceWorker();
    const second = await registerOfflineServiceWorker();

    expect(first).toBe(fakeReg);
    expect(second).toBe(fakeReg);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(OFFLINE_SW_URL);
    expect(calls[0].options).toEqual({
      scope: OFFLINE_SW_SCOPE,
      updateViaCache: "none",
    });
  });

  test("returns null safely when serviceWorker is unavailable", async () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      isSecureContext: true,
      location: { hostname: "www.zyxacademy.com" },
    };
    (globalThis as unknown as { navigator: Record<string, unknown> }).navigator = {};

    expect(canRegisterOfflineServiceWorker()).toBe(false);
    expect(await registerOfflineServiceWorker()).toBeNull();
  });

  test("public/sw.js is standalone without Firebase CDN imports and app/layout mounts OfflineShellRegister", () => {
    const swSource = readFileSync(join(ROOT, "public/sw.js"), "utf8");
    expect(swSource).not.toContain("importScripts");
    expect(swSource).not.toContain("gstatic.com");
    expect(swSource).toContain('const OFFLINE_PAGE_URL = "/offline"');
    expect(swSource).toContain('url.pathname.startsWith("/api/")');
    expect(swSource).toContain('url.pathname.startsWith("/_next/static/")');

    const fcmMessaging = readFileSync(join(ROOT, "lib/firebase/messaging.ts"), "utf8");
    expect(fcmMessaging).toContain('scope: "/firebase-cloud-messaging-push-scope"');
    expect(fcmMessaging).not.toContain('scope: "/"');

    const fcmSw = readFileSync(join(ROOT, "public/firebase-messaging-sw.js"), "utf8");
    expect(fcmSw).not.toContain("OFFLINE_SHELL_CACHE");

    const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
    expect(layout).toContain("OfflineShellRegister");
  });

  test("Tauri desktop boots local offline fallback shell and mirrors offline store calls", async () => {
    const tauriConf = JSON.parse(
      readFileSync(join(ROOT, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"),
    ) as { app: { windows: Array<{ url: string; width: number; height: number }> } };
    const tauriNightlyConf = JSON.parse(
      readFileSync(join(ROOT, "apps/desktop/src-tauri/tauri.nightly.conf.json"), "utf8"),
    ) as { app: { windows: Array<{ url: string }> } };

    expect(tauriConf.app.windows[0].url).toBe("index.html");
    expect(tauriNightlyConf.app.windows[0].url).toBe("index.html");

    const rustLib = readFileSync(join(ROOT, "apps/desktop/src-tauri/src/lib.rs"), "utf8");
    for (const cmd of [
      "get_desktop_server_origin",
      "save_offline_reading",
      "save_offline_reading_position",
      "list_offline_readings",
      "get_offline_reading",
      "remove_offline_reading",
      "clear_other_offline_users",
    ]) {
      expect(rustLib).toContain(cmd);
    }

    const invoked: Array<{ cmd: string; args: Record<string, unknown> | undefined }> = [];
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      __TAURI__: {
        core: {
          invoke: async (cmd: string, args?: Record<string, unknown>) => {
            invoked.push({ cmd, args });
            return true;
          },
        },
      },
    };

    mirrorSaveToNativeStore({
      key: "u1::c1::m1",
      userId: "u1",
      courseId: "c1",
      materialId: "m1",
      kind: "course_material",
      title: "Turunan Fungsi",
      sizeBytes: 120,
      savedAt: 1000,
      lastAccessedAt: 1000,
      material: {
        id: "m1",
        courseId: "c1",
        title: "Turunan Fungsi",
        kind: "article",
        body: "Turunan dari $f(x) = x^2$ adalah $2x$.",
      },
    });
    await removeOfflineReadingByKey("u1::c1::m1");
    await clearOfflineReadingsForOtherUsers("u1");

    expect(invoked.map((i) => i.cmd)).toEqual([
      "save_offline_reading",
      "remove_offline_reading",
      "clear_other_offline_users",
    ]);
  });
});

describe("Item #4: offline KaTeX, visuals, reading position, and non-disruptive reconnect", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  test("renders LaTeX inline/block formulas, chemistry, tables, and escapes XSS safely", () => {
    const md = [
      "## Integral dan Kimia",
      "",
      "Rumus luas: $A = \\pi r^2$ dan reaksi $\\ce{2H2 + O2 -> 2H2O}$.",
      "",
      "$$",
      "\\int_0^1 x^2 \\, dx = \\frac{1}{3}",
      "$$",
      "",
      "| Variabel | Nilai |",
      "| --- | --- |",
      "| $x$ | $2$ |",
      "",
      '<script>alert("xss")</script> [klik](javascript:alert(1))',
    ].join("\n");

    const html = renderOfflineMarkdownHtml(md);
    expect(html).toContain("katex");
    expect(html).toContain("<math");
    expect(html).toContain("offline-math-block");
    expect(html).toContain("<table class=\"offline-table\">");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:alert");
  });

  test("renders typed learning visuals into self-contained offline SVG/HTML figures", () => {
    const epsilonSvg = renderOfflineVisualHtml({
      id: "vis-ed",
      kind: "epsilon_delta_graph",
      label: "Limit linear $f(x)=2x$",
      description: "Visualisasi pita epsilon dan delta.",
      bounds: { xMin: 0, xMax: 4, yMin: 0, yMax: 8 },
      limitPoint: 2,
      limitValue: 4,
      defaultEpsilon: 0.5,
      defaultDelta: 0.25,
      functionModel: { kind: "linear", m: 2, b: 0 },
      staticFallback: { type: "text", summary: "Ringkasan", content: "Isi" },
    });
    expect(epsilonSvg).toContain("<figure class=\"offline-visual\"");
    expect(epsilonSvg).toContain("<svg ");
    expect(epsilonSvg).toContain("katex");

    const geomSvg = renderOfflineVisualHtml({
      id: "vis-geom",
      kind: "geometry_2d",
      label: "Segitiga ABC",
      description: "Segitiga siku-siku.",
      interactive: false,
      bounds: { xMin: -2, xMax: 5, yMin: -2, yMax: 5 },
      geometry: {
        points: [
          { id: "A", x: 0, y: 0, labelLatex: "A" },
          { id: "B", x: 3, y: 0, labelLatex: "B" },
          { id: "C", x: 0, y: 4, labelLatex: "C" },
        ],
        segments: [{ id: "AB", from: "A", to: "B", labelLatex: "3" }],
        circles: [],
        polygons: [{ id: "ABC", pointIds: ["A", "B", "C"] }],
      },
      staticFallback: { type: "text", summary: "Segitiga", content: "3-4-5" },
    });
    expect(geomSvg).toContain("<polygon");
    expect(geomSvg).toContain("<svg ");

    const workedHtml = renderOfflineWorkedExampleHtml({
      steps: [{ stepIndex: 0, label: "Langkah 1", explanation: "Substitusi $x = 2$", reason: "Definisi limit" }],
      verification: "Hasil $f(2) = 4$",
    });
    expect(workedHtml).toContain("offline-worked-example");
    expect(workedHtml).toContain("katex");
  });

  test("buildNativeOfflineSnapshot includes pre-rendered bodyHtml and section slugs", () => {
    const article: PublicArticleReadModel = {
      id: "art-1",
      courseId: "course-1",
      chapterId: "chap-1",
      slug: "limit-fungsi",
      title: "Limit Fungsi",
      courseTitle: "Kalkulus I",
      chapterTitle: "Bab 1",
      chapterNumber: 1,
      version: 1,
      totalEstimatedReadingMinutes: 6,
      sections: [
        {
          id: "sec-1",
          slug: "definisi-limit",
          title: "Definisi $\\varepsilon$-$\\delta$",
          sectionNumber: "1.1",
          sectionKind: "topic",
          learningObjective: "Memahami definisi formal limit.",
          estimatedReadingMinutes: 6,
          orderIndex: 0,
          parentSectionId: null,
          blocks: [
            {
              id: "blk-1",
              blockKey: "b1",
              blockType: "explanation",
              title: "Konsep Inti",
              orderIndex: 0,
              content: "Untuk setiap $\\varepsilon > 0$ terdapat $\\delta > 0$.",
            },
          ],
        },
      ],
    };

    const snapshot = buildNativeOfflineSnapshot({
      key: "u1::course-1::art-1",
      userId: "u1",
      courseId: "course-1",
      materialId: "art-1",
      kind: "structured_article",
      title: article.title,
      courseTitle: article.courseTitle,
      chapterTitle: article.chapterTitle ?? undefined,
      estimatedMinutes: 6,
      sizeBytes: 1024,
      savedAt: 100,
      lastAccessedAt: 100,
      article,
    });

    expect(snapshot.sections).toHaveLength(1);
    expect(snapshot.sections[0].slug).toBe("definisi-limit");
    expect(snapshot.sections[0].headingHtml).toContain("katex");
    expect(snapshot.sections[0].bodyHtml).toContain("katex");
    expect(snapshot.sections[0].bodyHtml).toContain("offline-objective");
  });

  test("persists, merges, and mirrors reading scroll/section position", () => {
    const storeMap = new Map<string, string>();
    const capCalls: Array<{ key: string; positionJson: string }> = [];

    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      localStorage: {
        getItem: (k: string) => storeMap.get(k) ?? null,
        setItem: (k: string, v: string) => {
          storeMap.set(k, v);
        },
        removeItem: (k: string) => {
          storeMap.delete(k);
        },
      },
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
        Plugins: {
          ZyxOfflineStore: {
            saveReadingPosition: async (opts: { key: string; positionJson: string }) => {
              capCalls.push(opts);
              return { saved: true };
            },
          },
        },
      },
    };

    const key = buildOfflineReadingKey("u1", "c1", "m1");
    const ratio = computeScrollRatio(500, 2500, 500);
    expect(ratio).toBe(0.25);
    expect(resolveRestoredScrollY({ scrollY: 500, scrollRatio: ratio }, 4500, 500)).toBe(1000);

    saveOfflineReadingPosition({
      key,
      sectionSlug: "bab-2",
      sectionIndex: 1,
      scrollY: 500,
      scrollRatio: ratio,
      updatedAt: 2000,
    });

    const loaded = loadOfflineReadingPosition(key);
    expect(loaded?.sectionSlug).toBe("bab-2");
    expect(loaded?.scrollRatio).toBe(0.25);
    expect(capCalls).toHaveLength(1);
    expect(capCalls[0].key).toBe(key);

    const picked = pickLatestReadingPosition(
      { key, scrollY: 100, scrollRatio: 0.1, updatedAt: 1000 },
      loaded,
    );
    expect(picked?.updatedAt).toBe(2000);

    removeOfflineReadingPosition(key);
    expect(loadOfflineReadingPosition(key)).toBeNull();
  });

  test("mobile and desktop offline shells bundle KaTeX assets and never auto-redirect on online event", () => {
    for (const appRoot of ["apps/mobile/www", "apps/desktop/dist"]) {
      const htmlPath = join(ROOT, appRoot, "index.html");
      const katexCssPath = join(ROOT, appRoot, "vendor/katex/katex.min.css");
      const katexFontsDir = join(ROOT, appRoot, "vendor/katex/fonts");

      expect(existsSync(katexCssPath)).toBe(true);
      const fonts = readdirSync(katexFontsDir).filter((f) => f.endsWith(".woff2"));
      expect(fonts.length).toBeGreaterThanOrEqual(15);

      const html = readFileSync(htmlPath, "utf8");
      expect(html).toContain('href="vendor/katex/katex.min.css"');
      expect(html).toContain("reconnect-banner");
      expect(html).toContain("sanitizeHtmlFragment");
      expect(html).toContain("persistActiveReadingPosition");
      expect(html).toContain("restoreReadingPosition");

      // Online event listener must show reconnect banner instead of auto-redirecting mid-read
      const onlineMatch = html.match(/window\.addEventListener\("online",\s*function\s*\(\)\s*\{([\s\S]*?)\}\);/);
      expect(onlineMatch).not.toBeNull();
      const onlineBody = onlineMatch![1];
      expect(onlineBody).not.toContain("location.replace");
      expect(onlineBody).not.toContain("handleRetry");
      expect(onlineBody).not.toContain("retryConnection");
      expect(onlineBody).not.toContain("handleReturnOnline");

      // AGENTS.md style compliance: no em/en dashes
      expect(html).not.toMatch(/[\u2013\u2014]/);
    }
  });
});
