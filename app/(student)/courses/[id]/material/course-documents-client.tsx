"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Lock,
} from "lucide-react";
import { DocumentListClient } from "./document-list-client";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { cn } from "@/lib/utils";
import type { CourseMaterial } from "@/lib/student-course-fixtures";
import { getSubcategoryLabel, type CourseMaterialSubcategory } from "@/lib/course-materials";

type Chapter = { id: string; title: string; orderIndex: number };
type TabKey = "all" | "materi" | "diktat" | "bank_soal" | "pdf";

type CourseDocumentsClientProps = {
  courseId: string;
  materials: CourseMaterial[];
  chapters: Chapter[];
  defaultTab?: string;
  accessTier?: "free" | "standard";
  lockedMaterialCount?: number;
};

const MAX_THUMBNAIL_RETRIES = 8;

const tabs: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: "all", label: "Semua", icon: FileText },
  { key: "materi", label: "Materi", icon: FileText },
  { key: "diktat", label: "Diktat", icon: BookOpen },
  { key: "bank_soal", label: "Soal", icon: ClipboardList },
  { key: "pdf", label: "PDF Materi", icon: FileText },
];

function normalizeTabKey(tab?: string | null): TabKey {
  if (tab === "materi") return "materi";
  if (tab === "diktat") return "diktat";
  if (tab === "pdf") return "pdf";
  if (tab === "bank_soal" || tab === "bank-soal") return "bank_soal";
  return "all";
}

function resolveTabGroup(material: CourseMaterial): Exclude<TabKey, "all"> {
  if (material.tabGroup) return material.tabGroup;
  if (material.docCategory === "diktat") return "diktat";
  if (
    material.docCategory === "soal" ||
    material.docCategory === "solusi" ||
    material.kind === "quiz" ||
    material.kind === "tryout"
  ) {
    return "bank_soal";
  }
  if (material.kind === "pdf") return "pdf";
  return "materi";
}

const typeStyle: Record<
  Exclude<TabKey, "all">,
  { label: string; border: string; icon: typeof FileText; iconClass: string }
> = {
  materi: {
    label: "Artikel",
    border: "border-l-blue-500",
    icon: FileText,
    iconClass: "text-blue-500",
  },
  diktat: {
    label: "Diktat",
    border: "border-l-indigo-500",
    icon: BookOpen,
    iconClass: "text-indigo-500",
  },
  bank_soal: {
    label: "Soal",
    border: "border-l-amber-500",
    icon: ClipboardList,
    iconClass: "text-amber-500",
  },
  pdf: {
    label: "PDF Materi",
    border: "border-l-rose-500",
    icon: FileText,
    iconClass: "text-rose-500",
  },
};

function materialChapterIds(material: CourseMaterial): string[] {
  if (Array.isArray(material.chapterIds) && material.chapterIds.length > 0) {
    return material.chapterIds.filter(Boolean);
  }
  return material.chapterId ? [material.chapterId] : [];
}

function documentMeta(material: CourseMaterial, typeLabel: string): string {
  const subcategory = material.subcategory
    ? getSubcategoryLabel(material.subcategory as CourseMaterialSubcategory) ?? material.subcategory
    : null;

  return [typeLabel, subcategory, material.year ? String(material.year) : null, material.fileSize]
    .filter(Boolean)
    .join(" · ");
}

function CompactDocumentThumbnail({
  material,
  icon: Icon,
  iconClass,
}: {
  material: CourseMaterial;
  icon: typeof FileText;
  iconClass: string;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseThumbnailUrl = material.thumbnailUrl ?? "";
  const isRetryableThumbnail = baseThumbnailUrl.includes("/thumbnail");
  const thumbnailSrc =
    baseThumbnailUrl && retryAttempt > 0
      ? `${baseThumbnailUrl}${baseThumbnailUrl.includes("?") ? "&" : "?"}retry=${retryAttempt}`
      : baseThumbnailUrl;
  const hasThumbnail = Boolean(baseThumbnailUrl) && !imageError;

  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    setRetryAttempt(0);
  }, [baseThumbnailUrl]);

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  const handleThumbnailError = () => {
    if (!isRetryableThumbnail || retryAttempt >= MAX_THUMBNAIL_RETRIES) {
      setImageError(true);
      return;
    }

    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    const delayMs = Math.min(750 * 2 ** retryAttempt, 5000);
    retryTimerRef.current = setTimeout(() => {
      setImageLoaded(false);
      setRetryAttempt((current) => current + 1);
    }, delayMs);
  };

  return (
    <div className="relative flex h-14 w-18 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/45 bg-muted/20">
      {(!hasThumbnail || !imageLoaded) && (
        <Icon className={cn("size-5", iconClass, hasThumbnail && "animate-pulse opacity-70")} aria-hidden />
      )}
      {hasThumbnail && (
        <Image
          key={thumbnailSrc}
          src={thumbnailSrc}
          alt={`Pratinjau ${material.title}`}
          fill
          unoptimized={isRetryableThumbnail}
          sizes="72px"
          className={cn(
            "object-cover object-center transition-all duration-200 group-hover:scale-[1.02]",
            imageLoaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setImageLoaded(true)}
          onError={handleThumbnailError}
        />
      )}
    </div>
  );
}

function HierarchyDocumentCard({ material, courseId }: { material: CourseMaterial; courseId: string }) {
  const group = resolveTabGroup(material);
  const style = typeStyle[group];
  const itemHref = material.href ?? `/courses/${courseId}/material/${material.id}`;
  const isLocked = Boolean(material.locked);

  return (
    <Link
      href={itemHref}
      className={cn(
        "group flex min-w-0 items-center gap-2.5 rounded-lg border border-border/50 border-l-2 bg-background p-2 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        style.border,
        isLocked && "opacity-90 hover:opacity-100"
      )}
    >
      <div className="relative shrink-0">
        <CompactDocumentThumbnail material={material} icon={style.icon} iconClass={style.iconClass} />
        {isLocked && (
          <div className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-md bg-background/90 text-amber-500 shadow-xs border border-border/50">
            <Lock className="size-3" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-body-sm font-semibold leading-snug text-foreground" title={material.title}>
          {material.title}
        </p>
        <p className="mt-1 truncate text-body-xs leading-tight text-muted-foreground">
          {documentMeta(material, style.label)}
        </p>
      </div>

      {isLocked ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-body-2xs font-semibold text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
          <Lock className="size-3" />
          Terkunci
        </span>
      ) : material.completed ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-status-success" aria-label="Selesai dipelajari" />
      ) : (
        <ChevronRight
          className="size-3.5 shrink-0 text-muted-foreground/55 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      )}
    </Link>
  );
}

function isSoalMaterial(material: CourseMaterial): boolean {
  if (material.kind === "quiz" || material.kind === "tryout") return true;
  if (material.docCategory === "soal" || material.docCategory === "solusi") return true;
  if (material.tabGroup === "bank_soal") return true;
  const sub = material.subcategory?.toLowerCase().trim();
  if (sub && ["kuis", "kbf", "tutorial", "tryout"].includes(sub)) return true;
  return false;
}

function isUtsMaterial(material: CourseMaterial): boolean {
  const sub = material.subcategory?.toLowerCase().trim();
  if (sub === "uts") return true;
  if (isSoalMaterial(material) && /\b(uts)\b/i.test(material.title)) return true;
  return false;
}

function isUasMaterial(material: CourseMaterial): boolean {
  const sub = material.subcategory?.toLowerCase().trim();
  if (sub === "uas") return true;
  if (isSoalMaterial(material) && /\b(uas)\b/i.test(material.title)) return true;
  return false;
}

function sortMaterials(items: CourseMaterial[]): CourseMaterial[] {
  return [...items].sort((a, b) => {
    if (a.year && b.year && a.year !== b.year) return b.year - a.year;
    return a.title.localeCompare(b.title, "id");
  });
}

function CollapsibleDocumentSection({
  badge,
  title,
  materials,
  courseId,
  open,
  onOpenChange,
}: {
  badge: string;
  title: string;
  materials: CourseMaterial[];
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const hasDocuments = materials.length > 0;

  return (
    <Collapsible
      open={open && hasDocuments}
      onOpenChange={onOpenChange}
      className="border-b border-border/45 last:border-b-0"
    >
      <CollapsibleTrigger
        disabled={!hasDocuments}
        className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/30 disabled:cursor-default disabled:hover:bg-transparent sm:px-3.5"
      >
        <span className="w-14 shrink-0 text-body-xs font-semibold text-muted-foreground sm:w-16">
          {badge}
        </span>
        <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-foreground" title={title}>
          {title}
        </span>
        <span className="shrink-0 text-body-xs text-muted-foreground">{materials.length} dokumen</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180",
            !hasDocuments && "opacity-30"
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      {hasDocuments ? (
        <CollapsibleContent>
          <div className="grid grid-cols-1 gap-2 border-t border-border/35 bg-muted/10 p-2 sm:grid-cols-2 lg:grid-cols-3">
            {materials.map((material) => (
              <HierarchyDocumentCard key={material.id} material={material} courseId={courseId} />
            ))}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

export function CourseDocumentsClient({
  courseId,
  materials,
  chapters,
  defaultTab,
  accessTier,
  lockedMaterialCount = 0,
}: CourseDocumentsClientProps) {
  const initialTab = normalizeTabKey(defaultTab);
  const [urlTab, setUrlTab] = useUrlTab("tab", "all", initialTab);
  const activeTab = normalizeTabKey(urlTab);

  const knownChapterIds = useMemo(() => new Set(chapters.map((chapter) => chapter.id)), [chapters]);

  const {
    chapterGroups,
    utsMaterials,
    uasMaterials,
    soalLainnyaMaterials,
    lainLainMaterials,
  } = useMemo(() => {
    const uts: CourseMaterial[] = [];
    const uas: CourseMaterial[] = [];
    const soalLainnya: CourseMaterial[] = [];
    const lainLain: CourseMaterial[] = [];

    const chapterMaterialMap = new Map<string, CourseMaterial[]>();
    for (const chapter of chapters) {
      chapterMaterialMap.set(chapter.id, []);
    }

    for (const material of materials) {
      if (isUtsMaterial(material)) {
        uts.push(material);
        continue;
      }
      if (isUasMaterial(material)) {
        uas.push(material);
        continue;
      }
      if (isSoalMaterial(material)) {
        soalLainnya.push(material);
        continue;
      }

      // Non-soal materials: check one-to-one relationship with chapters
      const rawIds = materialChapterIds(material);
      const validChapterIds = Array.from(
        new Set(rawIds.filter((id) => knownChapterIds.has(id)))
      );

      if (validChapterIds.length === 1) {
        const list = chapterMaterialMap.get(validChapterIds[0]);
        if (list) {
          list.push(material);
        } else {
          lainLain.push(material);
        }
      } else {
        // One-to-many (>1 chapters) or 0 chapters (unassigned/general)
        lainLain.push(material);
      }
    }

    return {
      chapterGroups: chapters.map((chapter) => ({
        chapter,
        materials: sortMaterials(chapterMaterialMap.get(chapter.id) ?? []),
      })),
      utsMaterials: sortMaterials(uts),
      uasMaterials: sortMaterials(uas),
      soalLainnyaMaterials: sortMaterials(soalLainnya),
      lainLainMaterials: sortMaterials(lainLain),
    };
  }, [chapters, knownChapterIds, materials]);

  const firstPopulatedSectionKey = useMemo(() => {
    const firstChapter = chapterGroups.find(({ materials: chMats }) => chMats.length > 0);
    if (firstChapter) return `chapter:${firstChapter.chapter.id}`;
    if (utsMaterials.length > 0) return "special:uts";
    if (uasMaterials.length > 0) return "special:uas";
    if (soalLainnyaMaterials.length > 0) return "special:soal_lainnya";
    if (lainLainMaterials.length > 0) return "special:lain_lain";
    return null;
  }, [chapterGroups, utsMaterials.length, uasMaterials.length, soalLainnyaMaterials.length, lainLainMaterials.length]);

  const [openSection, setOpenSection] = useState<string | null>(firstPopulatedSectionKey);

  return (
    <div className="space-y-3 font-sans">
      {activeTab === "all" && accessTier === "free" && lockedMaterialCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-primary/25 bg-brand-primary/5 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2 text-body-xs text-muted-foreground">
            <span>Bab berikutnya dan materi tanpa bab tersedia setelah aktivasi kelas.</span>
          </div>
          <Link href="/plans" className="shrink-0 rounded-md border border-border bg-card px-2.5 py-1.5 text-body-sm font-semibold text-brand-primary hover:bg-muted">
            Aktifkan akses
          </Link>
        </div>
      ) : null}
      <Tabs value={activeTab} onValueChange={(value) => setUrlTab(normalizeTabKey(value))}>
        <TabsList className="max-w-full justify-start" aria-label="Kategori dokumen mata kuliah">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.key} value={tab.key}>
                <Icon className="size-3.5 shrink-0" />
                <span>{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {activeTab === "all" ? (
        materials.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border/55 bg-card">
            {chapterGroups.map(({ chapter, materials: chapterMaterials }) => {
              const sectionKey = `chapter:${chapter.id}`;
              return (
                <CollapsibleDocumentSection
                  key={chapter.id}
                  badge={`Bab ${chapter.orderIndex}`}
                  title={chapter.title}
                  materials={chapterMaterials}
                  courseId={courseId}
                  open={openSection === sectionKey}
                  onOpenChange={(nextOpen) => setOpenSection(nextOpen ? sectionKey : null)}
                />
              );
            })}
            <CollapsibleDocumentSection
              badge="UTS"
              title="Ujian Tengah Semester"
              materials={utsMaterials}
              courseId={courseId}
              open={openSection === "special:uts"}
              onOpenChange={(nextOpen) => setOpenSection(nextOpen ? "special:uts" : null)}
            />
            <CollapsibleDocumentSection
              badge="UAS"
              title="Ujian Akhir Semester"
              materials={uasMaterials}
              courseId={courseId}
              open={openSection === "special:uas"}
              onOpenChange={(nextOpen) => setOpenSection(nextOpen ? "special:uas" : null)}
            />
            <CollapsibleDocumentSection
              badge="Soal"
              title="Soal lainnya"
              materials={soalLainnyaMaterials}
              courseId={courseId}
              open={openSection === "special:soal_lainnya"}
              onOpenChange={(nextOpen) => setOpenSection(nextOpen ? "special:soal_lainnya" : null)}
            />
            <CollapsibleDocumentSection
              badge="Lainnya"
              title="Lain-lain"
              materials={lainLainMaterials}
              courseId={courseId}
              open={openSection === "special:lain_lain"}
              onOpenChange={(nextOpen) => setOpenSection(nextOpen ? "special:lain_lain" : null)}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border/60 bg-muted/15 px-4 py-10 text-center">
            <FileText className="size-6 text-muted-foreground" aria-hidden />
            <h2 className="mt-3 font-heading text-body-sm font-bold">Belum ada dokumen</h2>
            <p className="mt-1 text-body-xs text-muted-foreground">Dokumen mata kuliah ini belum tersedia.</p>
          </div>
        )
      ) : (
        <div className="[&_[data-slot=tabs-list]]:hidden">
          <DocumentListClient
            courseId={courseId}
            materials={materials}
            chapters={chapters}
            defaultTab={activeTab}
            accessTier={accessTier}
            lockedMaterialCount={lockedMaterialCount}
          />
        </div>
      )}
    </div>
  );
}
