import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineStudentShell } from "@/components/offline/offline-student-shell";
import { StudentApplicationShell } from "@/components/student-application-shell";
import { StructuredArticleReader } from "@/components/course/structured-article-reader";
import { MaterialViewer } from "@/components/course/material-viewer";

import { loadMessages } from "@/lib/i18n/catalogs";
import { createOfflineScope, scopedReadingKey, setOfflineScope } from "@/lib/offline/cache-scope";
import { openOfflineDb, readOfflineState, READING_STORE, writeOfflineState } from "@/lib/offline/cache-db";
import { DEFAULT_OFFLINE_POLICY } from "@/lib/offline/sync-contract";
import { notifyOfflineCacheChanged, OFFLINE_RESOURCE_CHANGED_EVENT, type OfflineMetadataSnapshot } from "@/lib/offline/library-contract";
import { registerOfflineSyncController } from "@/lib/offline/sync-client";
import type { OfflineReadingRecord } from "@/lib/offline/reading-cache";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import "katex/dist/katex.min.css";

export type OfflineWebScenario = "populated" | "empty" | "expired";
export type OfflineWebMode = "library" | "article" | "diktat";
declare global {
  interface Window {
    __offlineWebConfig: { locale: "id" | "en"; scenario: OfflineWebScenario; mode: OfflineWebMode; thumbnail: string; online: boolean };
    __offlineWebControls: {
      refreshes: number;
      packageRequests: number;
      readVisits: () => Promise<number>;
      reviseReading: () => void;
      signalRevocation: () => void;
      updateReading: () => Promise<void>;
      signalUpdate: () => void;
      setSyncError: () => Promise<void>;
    };
  }
}

async function mount() {
  const config = window.__offlineWebConfig;
  const en = config.locale === "en";
  const now = Date.now(); const lease = config.scenario === "expired" ? now - 1000 : now + 86_400_000;
  const scope = createOfflineScope("fixture-student", location.origin, config.locale);
  setOfflineScope(scope);
  const article: PublicArticleReadModel = {
    id: "limits", version: 2, courseId: "math", chapterId: "chapter", slug: "limits",
    title: en ? "Function limits and approaching a value" : "Limit fungsi dan pendekatan nilai",
    courseTitle: en ? "Mathematics I" : "Matematika I", chapterTitle: en ? "Functions and limits" : "Fungsi dan limit", chapterNumber: 1, totalEstimatedReadingMinutes: 8,
    progress: { completed: false, overallPercent: 0, lastSectionSlug: null, sectionProgress: {} },
    sections: [{ id: "definition", slug: "definition", title: en ? "Approaching a value" : "Mendekati suatu nilai", sectionNumber: "1.1", sectionKind: "topic", learningObjective: "", estimatedReadingMinutes: 8, orderIndex: 0, parentSectionId: null,
      blocks: [{ id: "explanation", blockKey: "explanation", blockType: "explanation", title: null, orderIndex: 0,
        content: en ? "The output of a function can approach a number as its input approaches the point we are studying.\n\n$$\\lim_{x\\to 2}(3x+1)=7$$\n\nDirect substitution applies because this function is continuous at this point.\n\n| x | f(x) |\n| --- | --- |\n| 1.9 | 6.7 |\n| 1.99 | 6.97 |\n| 2.01 | 7.03 |"
          : "Nilai fungsi dapat mendekati suatu bilangan saat nilai masukan makin dekat ke titik yang kita tinjau.\n\n$$\\lim_{x\\to 2}(3x+1)=7$$\n\nSubstitusi langsung berlaku karena fungsi ini kontinu di titik tersebut.\n\n| x | f(x) |\n| --- | --- |\n| 1.9 | 6.7 |\n| 1.99 | 6.97 |\n| 2.01 | 7.03 |",
      }],
    }],
  };
  const material = {
    id: "derivatives", courseId: "math", title: en ? "Study guide: derivatives and rates of change" : "Diktat turunan dan penerapannya dalam laju perubahan",
    kind: "article" as const, docCategory: "diktat" as const, completed: false,
    body: en ? "## The rate of change\n\nA derivative describes a rate of change at a point.\n\n$$f'(x)=\\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}$$\n\n## A quadratic function\n\nFor $f(x)=x^2$, its derivative is $f'(x)=2x$."
      : "## Laju perubahan\n\nTurunan menyatakan laju perubahan di suatu titik.\n\n$$f'(x)=\\lim_{h\\to0}\\frac{f(x+h)-f(x)}{h}$$\n\n## Fungsi kuadrat\n\nUntuk $f(x)=x^2$, turunannya adalah $f'(x)=2x$.",
  };
  let snapshot: OfflineMetadataSnapshot = {
    ...scope, schemaVersion: 2, sessionId: "fixture-session", lastVerifiedAt: now - 60_000, accessValidUntil: lease, syncCursor: "42",
    policy: { ...DEFAULT_OFFLINE_POLICY, autoCache: config.mode !== "library" }, syncState: "ready", resources: {}, manifests: {},
    courses: [{ id: "math", title: article.courseTitle!, chapterIds: ["chapter"], accessValidUntil: lease }, { id: "computing", title: en ? "Computational Thinking and Programming" : "Berpikir Komputasional dan Pemrograman", chapterIds: ["chapter"], accessValidUntil: lease }],
    materials: [
      { id: article.id, courseId: "math", title: article.title, kind: "article", contentVersion: "v2", accessValidUntil: lease },
      { id: material.id, courseId: "math", title: material.title, kind: "diktat", contentVersion: "v3", accessValidUntil: lease },
      { id: "limit-video", courseId: "math", title: en ? "Understanding limits from a graph" : "Memahami limit dari grafik", kind: "video", contentVersion: "v1", thumbnailUrl: config.thumbnail, videoUrl: "https://www.youtube.com/watch?v=fixture", accessValidUntil: lease },
    ],
    achievements: [{ id: "first", title: en ? "First steps" : "Langkah pertama", description: en ? "Complete your first material." : "Selesaikan materi pertama Anda." }, { id: "consistent", title: en ? "Study regularly" : "Belajar rutin", description: en ? "Study on consecutive days." : "Belajar dalam beberapa hari berturut-turut." }],
  };
  const base = { ...scope, schemaVersion: 2 as const, contentCursor: "42", userId: scope.userId, courseId: "math", courseTitle: article.courseTitle!, chapterIds: ["chapter"], savedAt: now - 60_000, lastAccessedAt: now - 60_000, lastVerifiedAt: now - 60_000, accessValidUntil: lease, assetsComplete: true, pinned: false, sizeBytes: 220_000 };
  const records: OfflineReadingRecord[] = [
    { ...base, key: scopedReadingKey(scope, "math", article.id), kind: "structured_article", materialId: article.id, title: article.title, contentVersion: "v2", article },
    { ...base, key: scopedReadingKey(scope, "math", material.id), kind: "course_material", materialId: material.id, title: material.title, contentVersion: "v3", material, pinned: config.mode === "library" },
  ];
  async function put(record: OfflineReadingRecord) {
    const db = await openOfflineDb();
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(READING_STORE, "readwrite"); tx.objectStore(READING_STORE).put(record); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
    finally { db.close(); }
  }
  const saveSnapshot = () => writeOfflineState(`library:${scope.scopeKey}`, snapshot).then(() => { notifyOfflineCacheChanged(); });
  if (config.scenario !== "empty") {
    await saveSnapshot();
    if (config.mode === "library") for (const record of records) await put(record);
  }
  const openReading = config.mode === "diktat" ? material : article;
  const resourceChange = (action: "upsert" | "delete") => window.dispatchEvent(new CustomEvent(OFFLINE_RESOURCE_CHANGED_EVENT, { detail: { scopeKey: scope.scopeKey, change: { cursor: "43", kind: config.mode === "diktat" ? "diktat" : "article", resourceId: openReading.id, courseId: "math", action, revision: action === "upsert" ? "v9" : null } } }));
  window.__offlineWebControls = {
    refreshes: 0,
    packageRequests: 0,
    readVisits: async () => (await readOfflineState<Array<[string, string[]]>>(`reading-visits:${scope.scopeKey}`))?.[0]?.[1].length ?? 0,
    signalRevocation: () => resourceChange("delete"),
    reviseReading: () => renderReading(1),
    updateReading: async () => {
      const record = structuredClone(records[0]); record.contentVersion = "v9";
      record.article!.sections[0].blocks[0].content = en ? "The newest explanation is now available." : "Penjelasan versi terbaru sudah tersedia.";
      await put(record); notifyOfflineCacheChanged();
    },
    signalUpdate: () => resourceChange("upsert"),
    setSyncError: async () => { snapshot = { ...snapshot, syncState: "error", syncError: "network" }; await saveSnapshot(); },
  };
  registerOfflineSyncController(scope, {
    sync: async () => { if (config.scenario !== "empty") { snapshot = { ...snapshot, syncState: "ready", syncError: undefined }; await saveSnapshot(); } },
    snapshot: async () => snapshot,
    dispose() {},
    refreshResource: async (resource, options) => {
      window.__offlineWebControls.packageRequests++;
      const record = records.find(record => record.materialId === resource.id);
      if (!record) return false;
      await put({ ...record, pinned: options?.pinned ?? record.pinned }); notifyOfflineCacheChanged(); return true;
    },
  });
  const messages = await loadMessages(config.locale);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(document.getElementById("root")!);
  const renderReading = (revision = 0) => root.render(
    <StrictMode><ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <LocaleProvider initialLocale={config.locale} initialMessages={messages}>
        <QueryClientProvider client={queryClient}><TooltipProvider>
          {config.mode === "library" ? <OfflineStudentShell showLive={false} /> : <StudentApplicationShell showLive={false}>
            {config.mode === "article" ? <StructuredArticleReader article={{ ...article, version: article.version + revision, title: revision ? `${article.title} (v3)` : article.title }} studentId={scope.userId} course={{ id: "math", title: article.courseTitle! }} />
              : <MaterialViewer material={{ ...material, title: revision ? `${material.title} (v3)` : material.title }} studentId={scope.userId} course={{ title: article.courseTitle! }} chapterId="chapter" canDownload={false} backHref="/courses/math/material" />}
          </StudentApplicationShell>}
        </TooltipProvider></QueryClientProvider>
      </LocaleProvider>
    </ThemeProvider></StrictMode>,
  );
  renderReading();
}
void mount();
