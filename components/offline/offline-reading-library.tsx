"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { StructuredArticleSectionContent } from "@/components/course/structured-article-section-content";
import { useSession } from "@/lib/auth-client";
import { useAppLocale } from "@/lib/i18n/client";
import { OfflineLibraryBrowser } from "@/components/offline/offline-library-browser";
import { OfflineSnapshotContent } from "@/components/offline/offline-snapshot-content";
import { OFFLINE_LIBRARY_COPY } from "@/lib/offline/library-copy";
import { OFFLINE_CACHE_CHANGED_EVENT, requestOfflineSync, type NativeOfflineLibrarySnapshot } from "@/lib/offline/library-contract";
import { readOfflineLibrarySnapshot } from "@/lib/offline/metadata-cache";
import { downloadOfflineReading } from "@/lib/offline/sync-client";
import { getOfflineScope, setOfflineAccount } from "@/lib/offline/cache-scope";
import {
  clearAllOfflineReadings,
  clearOfflineReadingsForOtherUsers,
  getOfflineCacheStats,
  getOfflineReadingByKey,
  listOfflineReadings,
  removeOfflineReadingByKey,
  setOfflineReadingPinned,
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
  const { data: session, isPending, error: sessionError } = useSession();
  const { locale } = useAppLocale();
  const copy = OFFLINE_LIBRARY_COPY[locale];
  const [library, setLibrary] = useState<NativeOfflineLibrarySnapshot | null>(null);
  const [expired, setExpired] = useState(false);
  const [updatedRecord, setUpdatedRecord] = useState<OfflineReadingRecord | null>(null);
  const activeUserId = session?.user?.id ?? null;
  const [online, setOnline] = useState(true);
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
      // A network failure is not a confirmed sign-out. Read only the last
      // verified scope while the session check is pending or unavailable.
      if (online && !isPending && !sessionError) {
        if (!activeUserId) {
          if (getOfflineScope()) await clearOfflineReadingsForOtherUsers(null);
          setItems([]); setLibrary(null); setStats(null); setActiveRecord(null);
          return;
        }
        if (activeRecordRef.current && activeRecordRef.current.userId !== activeUserId) {
          restorationReadyRef.current = false; setActiveRecord(null);
        }
        const previous = getOfflineScope();
        if (previous?.userId !== activeUserId || previous?.locale !== locale) {
          setOfflineAccount(activeUserId, locale);
          await clearOfflineReadingsForOtherUsers(activeUserId);
        }
      }
      const scopeUserId = activeUserId ?? getOfflineScope()?.userId;
      if (!scopeUserId) { setItems([]); setLibrary(null); return; }
      const [list, cacheStats, snapshot] = await Promise.all([
        listOfflineReadings(scopeUserId), getOfflineCacheStats(scopeUserId), readOfflineLibrarySnapshot(scopeUserId, true),
      ]);
      const accessExpired = Boolean(snapshot && snapshot.accessValidUntil <= Date.now());
      setExpired(accessExpired);
      setLibrary(accessExpired ? null : snapshot);
      setItems(accessExpired ? [] : list.filter(item => !item.invalidated && (item.accessValidUntil ?? 0) > Date.now()));
      setStats(cacheStats);
      if (activeRecordRef.current) {
        const current = await getOfflineReadingByKey(activeRecordRef.current.key);
        if (!current || accessExpired) { setActiveRecord(null); setUpdatedRecord(null); }
        else if (current.contentVersion !== activeRecordRef.current.contentVersion) setUpdatedRecord(current);
      }
    } finally { setLoading(false); }
  }, [online, isPending, sessionError, activeUserId, locale]);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setOnline(navigator.onLine);
    }
    const handleOnline = () => {
      setOnline(true);
    };
    const handleOffline = () => {
      setOnline(false);
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
    const update = () => { void refresh(); };
    window.addEventListener(OFFLINE_CACHE_CHANGED_EVENT, update);
    const timer = setInterval(update, 30_000);
    return () => { window.removeEventListener(OFFLINE_CACHE_CHANGED_EVENT, update); clearInterval(timer); };
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
    if (record && record.userId === (activeUserId ?? getOfflineScope()?.userId)) {
      setUpdatedRecord(null);
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
      <div className="mx-auto max-w-4xl px-(--page-gutter) py-(--section-gap)">
        <div className="mb-(--section-gap) flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-(--compact-gap)">
          <Button
            type="button"
            variant="ghost"
            className="-ml-2.5"
            onClick={handleCloseReader}
          >
            <ArrowLeft className="size-4" />
            {copy.readings}
          </Button>
          <span role="status" className="text-body-xs text-muted-foreground empty:sr-only">{!online ? copy.offline : ""}</span>
          {online && (
            <Button asChild variant="ghost" onClick={() => persistCurrentPosition()}>
              <Link href={onlineReturnHref}>{copy.openOnline}</Link>
            </Button>
          )}
        </div>

        {updatedRecord && <div role="status" className="mb-(--related-gap) flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 text-body-xs text-muted-foreground"><span>{copy.updateAvailable}</span><Button variant="ghost" onClick={() => { persistCurrentPosition(); setActiveRecord(updatedRecord); setUpdatedRecord(null); }}>{copy.updateNow}</Button></div>}
        <article ref={articleBodyRef} className="space-y-(--section-gap)">
          <header className="space-y-1">
            {activeRecord.courseTitle && (
              <p className="text-body-xs text-muted-foreground">
                {activeRecord.courseTitle}
                {activeRecord.chapterTitle ? `, ${activeRecord.chapterTitle}` : ""}
              </p>
            )}
            <h1 className="wrap-anywhere font-heading text-h5 font-bold text-foreground">
              {activeRecord.title}
            </h1>
          </header>

          {activeRecord.kind === "structured_article" && activeRecord.article ? (
            <div className="space-y-(--reading-section-gap)">
              {activeRecord.article.sections.map((section) => (
                <section
                  key={section.id}
                  data-section-slug={section.slug}
                  className="space-y-(--compact-gap) border-t border-border/60 pt-(--section-gap) first:border-t-0 first:pt-0"
                >
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
          ) : activeRecord.snapshot ? (
            <OfflineSnapshotContent snapshot={activeRecord.snapshot} />
          ) : activeRecord.material?.body ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <MarkdownRenderer content={activeRecord.material.body} />
            </div>
          ) : (
            <p className="text-body-sm text-muted-foreground">
              {copy.unavailable}
            </p>
          )}
        </article>
      </div>
    );
  }

  return <OfflineLibraryBrowser
    locale={locale}
    snapshot={library}
    items={items}
    stats={stats}
    online={online}
    loading={loading}
    expired={expired}
    onOpen={handleOpen}
    onRemove={handleRemove}
    onPin={async (key, pinned) => { await setOfflineReadingPinned(key, pinned); await refresh(); }}
    onSync={requestOfflineSync}
    onSave={async (material) => {
      const userId = activeUserId ?? getOfflineScope()?.userId;
      if (!userId) return;
      const saved = await downloadOfflineReading(userId, { kind: material.kind === "diktat" ? "diktat" : "article", id: material.id, courseId: material.courseId });
      if (!saved) throw new Error("offline_download_failed");
      await refresh();
    }}
    onClear={handleClearAll}
  />;
}
