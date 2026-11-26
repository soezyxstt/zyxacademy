"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, Download, GraduationCap, HardDrive, Pin, Play, RefreshCw, Trash2, Trophy, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { OFFLINE_LIBRARY_COPY } from "@/lib/offline/library-copy";
import { visibleOfflineLibrary } from "@/lib/offline/library-access";
import type { NativeOfflineLibrarySnapshot } from "@/lib/offline/library-contract";
import { formatOfflineBytes, type OfflineCacheStats, type OfflineReadingSummary } from "@/lib/offline/reading-cache";

type Section = "courses" | "readings" | "videos" | "achievements" | "storage";
type Material = NativeOfflineLibrarySnapshot["materials"][number];
export interface OfflineLibraryBrowserProps {
  locale: "id" | "en";
  snapshot: NativeOfflineLibrarySnapshot | null;
  items: OfflineReadingSummary[];
  stats: OfflineCacheStats | null;
  online: boolean;
  loading: boolean;
  expired?: boolean;
  onOpen: (key: string) => Promise<void> | void;
  onRemove: (key: string) => Promise<void> | void;
  onPin: (key: string, pinned: boolean) => Promise<void> | void;
  onSync: () => Promise<void> | void;
  onSave: (material: Material) => Promise<void> | void;
  onClear: () => Promise<void> | void;
}

export function OfflineLibraryBrowser({ locale, snapshot: storedSnapshot, items, stats, online, loading, expired, onOpen, onRemove, onPin, onSync, onSave, onClear }: OfflineLibraryBrowserProps) {
  const snapshot = visibleOfflineLibrary(storedSnapshot);
  const copy = OFFLINE_LIBRARY_COPY[locale];
  const [section, setSection] = useState<Section>("courses");
  const [courseId, setCourseId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [operationError, setOperationError] = useState(false);
  const syncing = snapshot?.syncState === "syncing" || working === "sync";
  const run = async (key: string, action: () => Promise<void> | void) => {
    if (working) return; setWorking(key); setOperationError(false);
    try { await action(); } catch { setOperationError(true); } finally { setWorking(null); }
  };
  const date = (value: number) => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeStyle: "short" }).format(value);
  const activeCourse = snapshot?.courses.find(course => course.id === courseId);
  const tabs = [
    { value: "courses", icon: GraduationCap }, { value: "readings", icon: BookOpen }, { value: "videos", icon: Play }, { value: "achievements", icon: Trophy }, { value: "storage", icon: HardDrive },
  ] as const;
  const empty = (title: string, description?: string) => <div className="py-(--section-gap)"><p className="text-body-sm font-medium">{title}</p>{description && <p className="mt-1 max-w-md text-body-xs leading-relaxed text-muted-foreground">{description}</p>}</div>;
  const reading = (item: OfflineReadingSummary, storage = false) => <li key={item.key} className="flex items-center gap-(--compact-gap) border-b border-border/60 py-(--row-padding)">
    <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    <button type="button" onClick={() => void onOpen(item.key)} className="min-h-11 min-w-0 flex-1 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring">
      <span className="block wrap-anywhere text-body-sm font-medium">{item.title}</span>
      <span className="mt-1 block wrap-anywhere text-body-xs text-muted-foreground">{[item.courseTitle, formatOfflineBytes(item.sizeBytes), item.pinned ? copy.pinned : ""].filter(Boolean).join(" · ")}</span>
    </button>
    {storage ? <div className="flex shrink-0 items-center gap-1">
      <Tooltip><TooltipTrigger asChild><Button type="button" size="icon-lg" variant="ghost" disabled={Boolean(working)} aria-label={item.pinned ? copy.unpin : copy.pin} onClick={() => void run(item.key, () => onPin(item.key, !item.pinned))}><Pin className={cn("size-4", item.pinned && "fill-current")} /></Button></TooltipTrigger><TooltipContent>{item.pinned ? copy.unpin : copy.pin}</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger asChild><Button type="button" size="icon-lg" variant="ghost" disabled={Boolean(working)} aria-label={`${copy.remove} ${item.title}`} onClick={() => void run(item.key, () => onRemove(item.key))}><Trash2 className="size-4" /></Button></TooltipTrigger><TooltipContent>{copy.remove}</TooltipContent></Tooltip>
    </div> : <Button type="button" variant="ghost" onClick={() => void onOpen(item.key)}>{copy.open}</Button>}
  </li>;

  return <div className="mx-auto max-w-6xl px-(--page-gutter) py-(--section-gap)">
    <header className="flex flex-wrap items-start justify-between gap-(--related-gap) border-b border-border/60 pb-(--related-gap)">
      <div><h1 className="font-heading text-h5 font-bold">{copy.title}</h1>{snapshot?.lastVerifiedAt ? <p className="mt-1 text-body-xs text-muted-foreground">{copy.lastChecked} {date(snapshot.lastVerifiedAt)}</p> : null}</div>
      <div className="flex flex-wrap items-center gap-2">
        <span role="status" className="inline-flex items-center gap-1.5 text-body-xs text-muted-foreground">{online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}{syncing ? copy.syncing : online ? copy.online : copy.offline}</span>
        <Button type="button" variant="outline" disabled={!online || syncing} onClick={() => void run("sync", onSync)}><RefreshCw className={cn("size-3.5", syncing && "animate-spin motion-reduce:animate-none")} />{copy.sync}</Button>
        {online && <Button asChild variant="ghost"><Link href="/dashboard">{copy.openOnline}</Link></Button>}
      </div>
    </header>

    <div className="grid gap-(--section-gap) pt-(--related-gap) md:grid-cols-[11rem_minmax(0,1fr)]">
      <nav aria-label={copy.title} className="flex max-w-full gap-1 border-b border-border/60 pb-(--compact-gap) md:flex-col md:border-0 md:pb-0">
        {tabs.map((tab, index) => <Button key={tab.value} type="button" variant={section === tab.value ? "secondary" : "ghost"} className={cn("min-w-0 flex-1 justify-center px-2 md:justify-start md:px-3", index >= 3 && "hidden md:inline-flex")} aria-current={section === tab.value ? "page" : undefined} onClick={() => { setSection(tab.value); setCourseId(null); }}><tab.icon className="hidden size-4 md:block" />{copy[tab.value]}</Button>)}
        <DropdownMenu><DropdownMenuTrigger asChild><Button className="min-w-0 flex-1 px-2 md:hidden" variant={section === "achievements" || section === "storage" ? "secondary" : "ghost"}>{copy.more}</Button></DropdownMenuTrigger><DropdownMenuContent align="end">{tabs.slice(3).map(tab => <DropdownMenuItem key={tab.value} onSelect={() => { setSection(tab.value); setCourseId(null); }}><tab.icon className="size-4" />{copy[tab.value]}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
      </nav>
      <section className="min-w-0" aria-label={activeCourse?.title ?? copy[section]}>
        {(expired || snapshot?.syncError || operationError) && <p role="status" className="mb-(--related-gap) border-l-2 border-status-warning bg-status-warning/5 px-3 py-2 text-body-xs leading-relaxed">{expired ? copy.expired : operationError || snapshot?.syncError === "storage" ? copy.storageFailed : snapshot?.syncError === "access" ? copy.unavailable : copy.syncFailed}</p>}
        <div className="mb-(--compact-gap) flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-body-base font-semibold">{activeCourse?.title ?? copy[section]}</h2>
          {courseId ? <Button variant="ghost" onClick={() => setCourseId(null)}>{copy.allCourses}</Button> : <span className="text-body-xs tabular-nums text-muted-foreground">{section === "courses" ? snapshot?.courses.length ?? 0 : section === "readings" ? items.length : ""}</span>}
        </div>
        {loading && !snapshot && !items.length ? <p role="status" className="py-(--related-gap) text-body-sm text-muted-foreground">{copy.syncing}</p> :
          !snapshot && section !== "storage" && section !== "readings" ? empty(copy.emptyTitle, expired ? copy.expired : copy.emptyBody) :
          section === "courses" ? <>
            {courseId ? <ul>{(snapshot?.materials ?? []).filter(item => item.courseId === courseId && item.kind !== "video").map(material => {
              const saved = items.find(item => item.materialId === material.id); return <li key={material.id} className="flex items-center gap-(--compact-gap) border-b border-border/60 py-(--row-padding)"><BookOpen className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="wrap-anywhere text-body-sm font-medium">{material.title}</p><p className="mt-1 text-body-xs text-muted-foreground">{material.kind === "diktat" ? copy.diktat : copy.article} · {saved ? copy.saved : copy.notSaved}</p></div><Button variant="ghost" disabled={!saved && (!online || Boolean(working))} onClick={() => void (saved ? onOpen(saved.key) : run(material.id, () => onSave(material)))}>{!saved && <Download className="size-3.5" />}{saved ? copy.open : working === material.id ? copy.saving : copy.save}</Button></li>;
            })}</ul> : snapshot?.courses.length ? <ul>{snapshot.courses.map(course => <li key={course.id} className="flex items-center gap-(--compact-gap) border-b border-border/60 py-(--row-padding)"><GraduationCap className="size-5 shrink-0 text-muted-foreground" /><button type="button" className="min-h-11 min-w-0 flex-1 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setCourseId(course.id)}><span className="block wrap-anywhere text-body-sm font-medium">{course.title}</span><span className="mt-1 block text-body-xs text-muted-foreground">{snapshot.materials.filter(item => item.courseId === course.id).length} {copy.items} · {items.filter(item => item.courseId === course.id).length} {copy.saved.toLowerCase()}</span></button><Button variant="ghost" onClick={() => setCourseId(course.id)}>{copy.open}</Button></li>)}</ul> : empty(copy.noCourses, copy.emptyBody)}
          </> : section === "readings" ? items.length ? <ul>{items.map(item => reading(item))}</ul> : empty(copy.emptyReadings, copy.emptyReadingsBody) :
          section === "videos" ? snapshot?.materials.some(item => item.kind === "video") ? <><p className="text-body-xs text-muted-foreground">{copy.videoNeedsConnection}</p><ul>{snapshot.materials.filter(item => item.kind === "video").map(video => <li key={video.id} className="flex items-center gap-(--compact-gap) border-b border-border/60 py-(--row-padding)"><>{video.thumbnailUrl?.startsWith("data:image/") ? <Image src={video.thumbnailUrl} alt="" width={96} height={54} className="aspect-video w-20 shrink-0 rounded-sm object-cover sm:w-24" /> : <Play className="size-5 shrink-0 text-muted-foreground" />}</><div className="min-w-0 flex-1"><p className="wrap-anywhere text-body-sm font-medium">{video.title}</p><p className="mt-1 text-body-xs text-muted-foreground">{snapshot.courses.find(course => course.id === video.courseId)?.title}</p></div><Button variant="ghost" disabled={!online} onClick={() => { try { const url = new URL(video.videoUrl ?? ""); if (url.protocol === "https:") window.open(url.href, "_blank", "noopener,noreferrer"); } catch { /* Invalid URLs never open. */ } }}>{copy.open}</Button></li>)}</ul></> : empty(copy.noVideos) :
          section === "achievements" ? snapshot?.achievements.length ? <ul>{snapshot.achievements.map(item => <li key={item.id} className="flex items-start gap-(--compact-gap) border-b border-border/60 py-(--row-padding)"><Trophy className="mt-1 size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="text-body-sm font-medium">{item.title}</p><p className="mt-1 text-body-xs leading-relaxed text-muted-foreground">{item.description}</p></div></li>)}</ul> : empty(copy.noAchievements) : <>
            <div className="border-b border-border/60 pb-(--related-gap)"><div className="mb-2 flex items-baseline justify-between gap-2"><strong className="text-h5 font-semibold tabular-nums">{formatOfflineBytes(stats?.totalBytes ?? 0)}</strong><span className="text-body-xs text-muted-foreground">{copy.of} {formatOfflineBytes(snapshot?.policy.maxBytes ?? stats?.maxBytes ?? 100 * 1024 * 1024)}</span></div><meter className="block h-2 w-full accent-primary" min={0} max={snapshot?.policy.maxBytes ?? stats?.maxBytes ?? 100 * 1024 * 1024} value={stats?.totalBytes ?? 0} aria-label={copy.usage} /><p className="mt-2 text-body-xs text-muted-foreground">{copy.pinnedHelp}</p>{snapshot?.accessValidUntil && <p className="mt-1 text-body-xs text-muted-foreground">{copy.accessUntil} {date(snapshot.accessValidUntil)}</p>}</div>
            {items.length ? <ul>{items.map(item => reading(item, true))}</ul> : empty(copy.emptyReadings)}
            {(snapshot || items.length > 0) && <Button variant="ghost" className="mt-(--compact-gap)" disabled={Boolean(working)} onClick={() => setConfirmClear(true)}><Trash2 className="size-4" />{copy.clear}</Button>}
          </>}
      </section>
    </div>
    <Dialog open={confirmClear} onOpenChange={setConfirmClear}><DialogContent><DialogHeader><DialogTitle>{copy.clearTitle}</DialogTitle><DialogDescription>{copy.clearBody}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmClear(false)}>{copy.cancel}</Button><Button variant="destructive" disabled={Boolean(working)} onClick={() => void run("clear", async () => { await onClear(); setConfirmClear(false); })}>{copy.clear}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
