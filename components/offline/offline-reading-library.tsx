"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Trash2, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { StructuredArticleSectionContent } from "@/components/course/structured-article-section-content";
import {
  clearAllOfflineReadings,
  formatOfflineBytes,
  getOfflineCacheStats,
  getOfflineReadingByKey,
  listOfflineReadings,
  removeOfflineReadingByKey,
  type OfflineCacheStats,
  type OfflineReadingRecord,
  type OfflineReadingSummary,
} from "@/lib/offline/reading-cache";

export function OfflineReadingLibrary() {
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<OfflineReadingSummary[]>([]);
  const [stats, setStats] = useState<OfflineCacheStats | null>(null);
  const [activeRecord, setActiveRecord] = useState<OfflineReadingRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, cacheStats] = await Promise.all([
        listOfflineReadings(),
        getOfflineCacheStats(),
      ]);
      setItems(list);
      setStats(cacheStats);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setOnline(navigator.onLine);
    }
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void refresh();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refresh]);

  const handleOpen = async (key: string) => {
    const record = await getOfflineReadingByKey(key);
    if (record) {
      setActiveRecord(record);
    }
  };

  const handleRemove = async (key: string) => {
    await removeOfflineReadingByKey(key);
    if (activeRecord?.key === key) {
      setActiveRecord(null);
    }
    await refresh();
  };

  const handleClearAll = async () => {
    await clearAllOfflineReadings();
    setActiveRecord(null);
    await refresh();
  };

  if (activeRecord) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setActiveRecord(null)}
          >
            <ArrowLeft className="size-4" />
            Daftar bacaan offline
          </Button>
          <span className="inline-flex items-center gap-1.5 text-body-xs text-muted-foreground">
            {online ? <Wifi className="size-3.5 text-status-success" /> : <WifiOff className="size-3.5 text-status-warning" />}
            {online ? "Online" : "Offline"}
          </span>
        </div>

        <article className="space-y-6">
          <header className="space-y-1">
            {activeRecord.courseTitle && (
              <p className="text-body-xs text-muted-foreground">
                {activeRecord.courseTitle}
                {activeRecord.chapterTitle ? `, ${activeRecord.chapterTitle}` : ""}
              </p>
            )}
            <h1 className="font-heading text-h5 font-bold text-foreground">
              {activeRecord.title}
            </h1>
          </header>

          {activeRecord.kind === "structured_article" && activeRecord.article ? (
            <div className="space-y-8">
              {activeRecord.article.sections.map((section) => (
                <section key={section.id} className="space-y-3 border-t border-border pt-6 first:border-t-0 first:pt-0">
                  <h2 className="font-heading text-body-base font-bold text-foreground">
                    {section.title}
                  </h2>
                  <StructuredArticleSectionContent
                    section={section}
                    articleId={activeRecord.article!.id}
                    articleVersion={activeRecord.article!.version}
                    showProgress={false}
                    interactiveChecks={false}
                  />
                </section>
              ))}
            </div>
          ) : activeRecord.material?.body ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <MarkdownRenderer content={activeRecord.material.body} />
            </div>
          ) : (
            <p className="text-body-sm text-muted-foreground">
              Konten bacaan ini tidak tersedia di penyimpanan lokal.
            </p>
          )}
        </article>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <h1 className="font-heading text-h5 font-bold text-foreground">
            Bacaan offline
          </h1>
          <p className="text-body-xs text-muted-foreground">
            Materi teks dan artikel yang terakhir dibuka tersimpan otomatis hingga{" "}
            {stats ? `${stats.maxEntries} bacaan (${formatOfflineBytes(stats.maxBytes)})` : "25 bacaan (8.0 MB)"}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-body-xs text-muted-foreground">
            {online ? <Wifi className="size-3.5 text-status-success" /> : <WifiOff className="size-3.5 text-status-warning" />}
            {online ? "Online" : "Offline"}
          </span>
          {online && (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard">Kembali ke beranda</Link>
            </Button>
          )}
        </div>
      </div>

      {stats && stats.count > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-body-xs text-muted-foreground">
          <span>
            {stats.count} / {stats.maxEntries} bacaan tersimpan ({formatOfflineBytes(stats.totalBytes)} / {formatOfflineBytes(stats.maxBytes)})
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => void handleClearAll()}>
            <Trash2 className="size-3.5" />
            Hapus semua
          </Button>
        </div>
      )}

      <div className="mt-4 divide-y divide-border border-y border-border">
        {loading ? (
          <p className="py-8 text-center text-body-sm text-muted-foreground">
            Memuat bacaan tersimpan...
          </p>
        ) : items.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <BookOpen className="mx-auto size-6 text-muted-foreground" />
            <p className="text-body-sm font-medium text-foreground">
              Belum ada bacaan offline
            </p>
            <p className="text-body-xs text-muted-foreground">
              Buka artikel atau materi teks saat online agar otomatis tersimpan di sini.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-3 py-3">
              <button
                type="button"
                onClick={() => void handleOpen(item.key)}
                className="min-w-0 flex-1 text-left hover:text-primary transition-colors cursor-pointer"
              >
                <p className="truncate text-body-sm font-medium text-foreground">
                  {item.title}
                </p>
                <p className="truncate text-body-xs text-muted-foreground">
                  {item.courseTitle ? `${item.courseTitle} · ` : ""}
                  {formatOfflineBytes(item.sizeBytes)}
                  {item.estimatedMinutes ? ` · ${item.estimatedMinutes} menit` : ""}
                </p>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Hapus ${item.title}`}
                onClick={() => void handleRemove(item.key)}
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
