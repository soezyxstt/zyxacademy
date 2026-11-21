"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { StructuredArticleSectionContent } from "@/components/course/structured-article-section-content";
import { useSession } from "@/lib/auth-client";
import {
  clearAllOfflineReadings,
  clearOfflineReadingsForOtherUsers,
  formatOfflineBytes,
  getOfflineCacheStats,
  getOfflineReadingByKey,
  listOfflineReadings,
  removeOfflineReadingByKey,
  type OfflineCacheStats,
  type OfflineReadingRecord,
  type OfflineReadingSummary,
} from "@/lib/offline/reading-cache";
import {
  computeScrollRatio,
  loadLatestOfflineReadingPosition,
  restoreOfflineReadingScroll,
  saveOfflineReadingPosition,
} from "@/lib/offline/reading-position";

export function OfflineReadingLibrary() {
  const { data: session, isPending } = useSession();
  const activeUserId = session?.user?.id ?? null;
  const [online, setOnline] = useState(true);
  const [reconnectedBannerVisible, setReconnectedBannerVisible] = useState(false);
  const [items, setItems] = useState<OfflineReadingSummary[]>([]);
  const [stats, setStats] = useState<OfflineCacheStats | null>(null);
  const [activeRecord, setActiveRecord] = useState<OfflineReadingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const activeRecordRef = useRef<OfflineReadingRecord | null>(null);
  const articleBodyRef = useRef<HTMLElement | null>(null);
  const restorationReadyRef = useRef(false);

  useEffect(() => {
    activeRecordRef.current = activeRecord;
  }, [activeRecord]);

  const persistCurrentPosition = useCallback(() => {
    const record = activeRecordRef.current;
    if (!record || !restorationReadyRef.current || typeof window === "undefined") return;
    const scrollY = Math.max(0, Math.round(window.scrollY || document.documentElement.scrollTop || 0));
    const scrollHeight = Math.max(
      document.documentElement.scrollHeight || 0,
      document.body.scrollHeight || 0,
    );
    const scrollRatio = computeScrollRatio(scrollY, scrollHeight, window.innerHeight);

    let sectionSlug: string | null = null;
    let sectionIndex = 0;
    const sectionEls = articleBodyRef.current?.querySelectorAll<HTMLElement>("[data-section-slug]");
    if (sectionEls?.length) {
      sectionEls.forEach((el, idx) => {
        if (el.getBoundingClientRect().top <= 120) {
          sectionIndex = idx;
          sectionSlug = el.dataset.sectionSlug ?? null;
        }
      });
    }

    saveOfflineReadingPosition({
      key: record.key,
      sectionSlug,
      sectionIndex,
      scrollY,
      scrollRatio,
      scope: "document",
      updatedAt: Date.now(),
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // When online, wait for confirmed session and enforce strict account isolation.
      // Never interrupt an active offline reading session mid-read when connectivity returns,
      // unless a different user is now authenticated.
      if (online) {
        if (isPending) return;
        if (!activeUserId) {
          if (!activeRecordRef.current) {
            await clearAllOfflineReadings();
            setItems([]);
            setStats({ count: 0, totalBytes: 0, maxEntries: 25, maxBytes: 8 * 1024 * 1024 });
          }
          return;
        }
        if (activeRecordRef.current && activeRecordRef.current.userId !== activeUserId) {
          restorationReadyRef.current = false;
          setActiveRecord(null);
        }
        await clearOfflineReadingsForOtherUsers(activeUserId);
      }

      const scopeUserId = activeUserId ?? undefined;
      const [list, cacheStats] = await Promise.all([
        listOfflineReadings(scopeUserId),
        getOfflineCacheStats(scopeUserId),
      ]);
      setItems(list);
      setStats(cacheStats);
    } finally {
      setLoading(false);
    }
  }, [online, isPending, activeUserId]);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setOnline(navigator.onLine);
    }
    const handleOnline = () => {
      setOnline(true);
      setReconnectedBannerVisible(true);
    };
    const handleOffline = () => {
      setOnline(false);
      setReconnectedBannerVisible(false);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Restore reading position when opening an offline record and persist on scroll/hide.
  useEffect(() => {
    if (!activeRecord) return;
    let cancelled = false;
    restorationReadyRef.current = false;
    let raf1 = 0;
    let raf2 = 0;

    void loadLatestOfflineReadingPosition(activeRecord.key).then((saved) => {
      if (cancelled) return;
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => {
          if (cancelled) return;
          if (!saved) {
            window.scrollTo(0, 0);
          } else {
            restoreOfflineReadingScroll(saved, articleBodyRef.current);
          }
          restorationReadyRef.current = true;
        });
      });
    });

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (!restorationReadyRef.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        persistCurrentPosition();
      }, 250);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        persistCurrentPosition();
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", persistCurrentPosition);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      if (timer) clearTimeout(timer);
      if (restorationReadyRef.current) persistCurrentPosition();
      restorationReadyRef.current = false;
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", persistCurrentPosition);
    };
  }, [activeRecord, persistCurrentPosition]);

  const handleOpen = async (key: string) => {
    const record = await getOfflineReadingByKey(key);
    if (record && (!activeUserId || record.userId === activeUserId)) {
      setActiveRecord(record);
    }
  };

  const handleCloseReader = () => {
    persistCurrentPosition();
    setActiveRecord(null);
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
    const onlineReturnHref = activeRecord.courseId
      ? `/courses/${activeRecord.courseId}`
      : "/dashboard";

    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {online && reconnectedBannerVisible && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-status-success/10 px-3 py-2 text-body-xs text-status-success"
          >
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Wifi className="size-3.5" />
              Koneksi kembali tersedia
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                asChild
                size="sm"
                variant="default"
                onClick={() => persistCurrentPosition()}
              >
                <Link href={onlineReturnHref}>Kembali online</Link>
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Tutup pemberitahuan koneksi"
                onClick={() => setReconnectedBannerVisible(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCloseReader}
          >
            <ArrowLeft className="size-4" />
            Daftar bacaan offline
          </Button>
          <span className="inline-flex items-center gap-1.5 text-body-xs text-muted-foreground">
            {online ? <Wifi className="size-3.5 text-status-success" /> : <WifiOff className="size-3.5 text-status-warning" />}
            {online ? "Online" : "Offline"}
          </span>
        </div>

        <article ref={articleBodyRef} className="space-y-6">
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
                <section
                  key={section.id}
                  data-section-slug={section.slug}
                  className="space-y-3 border-t border-border pt-6 first:border-t-0 first:pt-0"
                >
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
