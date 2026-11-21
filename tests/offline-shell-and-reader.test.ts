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
  READING_POSITION_STORAGE_PREFIX,
  buildOfflineReadingKey,
  clearOfflineReadingPositionsForOtherUsers,
  computeScrollRatio,
  findSectionElementBySlug,
  loadLatestOfflineReadingPosition,
  loadOfflineReadingPosition,
  pickLatestReadingPosition,
  removeOfflineReadingPosition,
  resolveRestoredScrollY,
  restoreOfflineReadingScroll,
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

  test("loadLatestOfflineReadingPosition merges localStorage with Capacitor and Tauri native stores", async () => {
    const key = buildOfflineReadingKey("u1", "c1", "m1");
    const storeMap = new Map<string, string>();
    storeMap.set(
      `${READING_POSITION_STORAGE_PREFIX}${key}`,
      JSON.stringify({
        key,
        sectionSlug: "sec-1",
        scrollY: 120,
        scrollRatio: 0.1,
        scope: "document",
        updatedAt: 1000,
      }),
    );

    // Capacitor native store has a newer offline reading position
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      localStorage: {
        getItem: (k: string) => storeMap.get(k) ?? null,
        setItem: (k: string, v: string) => storeMap.set(k, v),
        removeItem: (k: string) => storeMap.delete(k),
      },
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
        Plugins: {
          ZyxOfflineStore: {
            getReading: async () => ({
              reading: {
                key,
                readingPosition: {
                  key,
                  sectionSlug: "sec-4",
                  scrollY: 1400,
                  scrollRatio: 0.72,
                  scope: "document",
                  updatedAt: 3000,
                },
              },
            }),
          },
        },
      },
    };

    const capLatest = await loadLatestOfflineReadingPosition(key);
    expect(capLatest?.sectionSlug).toBe("sec-4");
    expect(capLatest?.scrollY).toBe(1400);
    expect(capLatest?.updatedAt).toBe(3000);

    // Tauri native store has a newer position even when localStorage is empty (origin switch)
    storeMap.clear();
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      localStorage: {
        getItem: (k: string) => storeMap.get(k) ?? null,
        setItem: (k: string, v: string) => storeMap.set(k, v),
        removeItem: (k: string) => storeMap.delete(k),
      },
      __TAURI__: {
        core: {
          invoke: async (cmd: string) => {
            if (cmd === "get_offline_reading") {
              return {
                reading: {
                  key,
                  readingPosition: {
                    key,
                    sectionSlug: "sec-3",
                    scrollY: 980,
                    scrollRatio: 0.55,
                    scope: "document",
                    updatedAt: 4500,
                  },
                },
              };
            }
            return null;
          },
        },
      },
    };

    const tauriLatest = await loadLatestOfflineReadingPosition(key);
    expect(tauriLatest?.sectionSlug).toBe("sec-3");
    expect(tauriLatest?.scrollRatio).toBe(0.55);
    expect(tauriLatest?.updatedAt).toBe(4500);
  });

  test("findSectionElementBySlug matches special characters safely and restoreOfflineReadingScroll respects scope", () => {
    const specialSlug = 'sec\\1]"test';
    const scrolledSections: string[] = [];
    const scrollToCalls: Array<[number, number]> = [];

    const makeEl = (slug: string) =>
      ({
        getAttribute: (name: string) => (name === "data-section-slug" ? slug : null),
        scrollIntoView: () => {
          scrolledSections.push(slug);
        },
      }) as unknown as HTMLElement;

    const fakeRoot = {
      querySelectorAll: () => [makeEl("intro"), makeEl(specialSlug)],
    } as unknown as ParentNode;

    const found = findSectionElementBySlug(fakeRoot, specialSlug);
    expect(found).not.toBeNull();
    expect(findSectionElementBySlug(fakeRoot, "missing")).toBeNull();

    const originalDocument = globalThis.document;
    try {
      (globalThis as unknown as { window: Record<string, unknown> }).window = {
        innerHeight: 500,
        scrollTo: (x: number, y: number) => scrollToCalls.push([x, y]),
      };
      (globalThis as unknown as { document: Record<string, unknown> }).document = {
        documentElement: { scrollHeight: 2500 },
        body: { scrollHeight: 2500 },
      };

      // Section-scoped position should jump to the exact section rather than applying section ratio to full document
      restoreOfflineReadingScroll(
        {
          key: "u1::c1::m1",
          sectionSlug: specialSlug,
          scrollY: 400,
          scrollRatio: 0.5,
          scope: "section",
          updatedAt: 1000,
        },
        fakeRoot,
      );
      expect(scrolledSections).toEqual([specialSlug]);
      expect(scrollToCalls).toHaveLength(0);

      // Document-scoped position should apply scrollRatio across the full document
      restoreOfflineReadingScroll(
        {
          key: "u1::c1::m1",
          sectionSlug: specialSlug,
          scrollY: 400,
          scrollRatio: 0.5,
          scope: "document",
          updatedAt: 2000,
        },
        fakeRoot,
      );
      expect(scrollToCalls).toEqual([[0, 1000]]);
    } finally {
      if (originalDocument === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        globalThis.document = originalDocument;
      }
    }
  });

  test("clearOfflineReadingPositionsForOtherUsers purges other accounts while keeping active user and unrelated keys", async () => {
    const storeMap = new Map<string, string>([
      [`${READING_POSITION_STORAGE_PREFIX}u1::c1::m1`, JSON.stringify({ key: "u1::c1::m1", scrollY: 10, scrollRatio: 0.1, updatedAt: 1 })],
      [`${READING_POSITION_STORAGE_PREFIX}u2::c1::m2`, JSON.stringify({ key: "u2::c1::m2", scrollY: 20, scrollRatio: 0.2, updatedAt: 2 })],
      ["unrelated-key", "keep-me"],
    ]);

    const fakeLocalStorage = {
      get length() {
        return storeMap.size;
      },
      key: (i: number) => Array.from(storeMap.keys())[i] ?? null,
      getItem: (k: string) => storeMap.get(k) ?? null,
      setItem: (k: string, v: string) => storeMap.set(k, v),
      removeItem: (k: string) => storeMap.delete(k),
    };

    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      localStorage: fakeLocalStorage,
    };

    clearOfflineReadingPositionsForOtherUsers("u1");
    expect(storeMap.has(`${READING_POSITION_STORAGE_PREFIX}u1::c1::m1`)).toBe(true);
    expect(storeMap.has(`${READING_POSITION_STORAGE_PREFIX}u2::c1::m2`)).toBe(false);
    expect(storeMap.get("unrelated-key")).toBe("keep-me");

    // Passing null clears all offline reading position keys (used on logout via clearAllOfflineReadings)
    await clearOfflineReadingsForOtherUsers(null);
    expect(storeMap.has(`${READING_POSITION_STORAGE_PREFIX}u1::c1::m1`)).toBe(false);
    expect(storeMap.get("unrelated-key")).toBe("keep-me");
  });

  test("readers, offline shells, sw.js, and Tauri store enforce review #38 hardening", () => {
    // 1. StructuredArticleReader restores asynchronously before enabling persistence (no mount clobber)
    const readerSrc = readFileSync(join(ROOT, "components/course/structured-article-reader.tsx"), "utf8");
    expect(readerSrc).toContain("loadLatestOfflineReadingPosition");
    expect(readerSrc).toContain("restoreOfflineReadingScroll");
    expect(readerSrc).toContain("restorationReady = true");
    expect(readerSrc).not.toMatch(/saveOfflineReadingPosition\([\s\S]*?\);\s*\n\s*\};\s*\n\s*persist\(\);/);

    // 2. MaterialViewer and OfflineReadingLibrary use async native+local loader & user switch guard
    const viewerSrc = readFileSync(join(ROOT, "components/course/material-viewer.tsx"), "utf8");
    expect(viewerSrc).toContain("loadLatestOfflineReadingPosition");

    const librarySrc = readFileSync(join(ROOT, "components/offline/offline-reading-library.tsx"), "utf8");
    expect(librarySrc).toContain("loadLatestOfflineReadingPosition");
    expect(librarySrc).toContain("restoreOfflineReadingScroll");
    expect(librarySrc).toContain("activeRecordRef.current.userId !== activeUserId");

    // 3. Desktop & mobile shells harden sanitizeHtmlFragment and avoid unescaped querySelector
    for (const appRoot of ["apps/mobile/www", "apps/desktop/dist"]) {
      const html = readFileSync(join(ROOT, appRoot, "index.html"), "utf8");
      expect(html).toContain("isSafeAttributeUrl");
      expect(html).toContain('"NOSCRIPT"');
      expect(html).toContain('"ANIMATE"');
      expect(html).toContain('name === "formaction" || name === "srcdoc"');
      expect(html).toContain("findSectionElementBySlug");
      expect(html).not.toContain('pos.sectionSlug.replace(/"/g, "")');
    }

    // 4. public/sw.js handles ?dpl=... CSS URLs and resolves relative CSS url() assets
    const swSrc = readFileSync(join(ROOT, "public/sw.js"), "utf8");
    expect(swSrc).toContain("isCssAssetUrl");
    expect(swSrc).toContain("extractCssStaticAssetUrls");
    expect(swSrc).toContain('pathname.endsWith(".css")');

    // 5. Tauri write_file_atomic uses direct rename without remove_file gap, and async spawn_blocking commands
    const rustSrc = readFileSync(join(ROOT, "apps/desktop/src-tauri/src/lib.rs"), "utf8");
    const writeAtomicBlock = rustSrc.match(/fn write_file_atomic[\s\S]*?\n\}/)?.[0] ?? "";
    expect(writeAtomicBlock).toContain("std::fs::rename(&tmp, path)");
    expect(writeAtomicBlock).not.toContain("remove_file(path)");
    expect(rustSrc).toContain("async fn save_offline_reading(");
    expect(rustSrc).toContain("async fn get_offline_reading(");
    expect(rustSrc).toContain("tauri::async_runtime::spawn_blocking");
  });
});
