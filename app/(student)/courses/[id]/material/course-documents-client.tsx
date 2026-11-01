"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Eye,
  FileText,
  Lock,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { DocumentListClient } from "./document-list-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { AdminUploadDocumentDialog } from "@/components/admin/course-detail/admin-upload-document-dialog";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { deleteCourseMaterial } from "@/app/(admin)/admin/(academic)/courses/actions";
import { updateMaterialProgress } from "@/app/(student)/dashboard/actions";
import { getViewablePdfUrl, isMobileOrTablet } from "@/lib/pdf-utils";
import { toast } from "@/components/ui/toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";
import type { CourseMaterial } from "@/lib/student-course-fixtures";
import { getSubcategoryLabel, type CourseMaterialSubcategory } from "@/lib/course-materials";

type Chapter = {
  id: string;
  title: string;
  orderIndex: number;
  canonicalId?: string | null;
  legacyChapterId?: string | null;
};
type TabKey = "all" | "materi" | "diktat" | "bank_soal" | "pdf";

type CourseDocumentsClientProps = {
  courseId: string;
  courseSlug?: string;
  courseTitle?: string;
  materials: CourseMaterial[];
  chapters: Chapter[];
  defaultTab?: string;
  accessTier?: "free" | "standard";
  lockedMaterialCount?: number;
  forcePageNavigation?: boolean;
  isAdmin?: boolean;
};

const tabs: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: "all", label: "all", icon: FileText },
  { key: "materi", label: "material", icon: FileText },
  { key: "diktat", label: "handbook", icon: BookOpen },
  { key: "bank_soal", label: "questions", icon: ClipboardList },
  { key: "pdf", label: "pdfMaterial", icon: FileText },
];

function normalizeTabKey(tab?: string | null): TabKey {
  if (tab === "materi") return "materi";
  if (tab === "diktat") return "diktat";
  if (tab === "pdf") return "pdf";
  if (tab === "bank_soal" || tab === "bank-soal") return "bank_soal";
  return "all";
}

function materialChapterIds(material: CourseMaterial): string[] {
  if (Array.isArray(material.chapterIds) && material.chapterIds.length > 0) {
    return material.chapterIds.filter(Boolean);
  }
  return material.chapterId ? [material.chapterId] : [];
}

export type MaterialHierarchyTier = "article" | "diktat" | "materi_pdf" | "soal_pdf";

export function getMaterialHierarchyTier(material: CourseMaterial): MaterialHierarchyTier {
  // 1. Artikel: Structured / canonical article, or written interactive reading
  if (
    material.kind === "article" ||
    material.source === "canonical-article" ||
    (material.docCategory === "materi" && material.kind !== "pdf")
  ) {
    return "article";
  }

  // 2. Diktat: Canonical diktat or diktat review document
  if (
    material.docCategory === "diktat" ||
    material.source === "canonical-diktat" ||
    (material as { kind?: string }).kind === "diktat"
  ) {
    return "diktat";
  }

  // 4. Soal PDF: Problem sheets, quizzes, exam papers, SCL, latihan soal, solusi
  if (isSoalMaterial(material)) {
    return "soal_pdf";
  }

  // 3. Materi PDF: Lecture slides, notes, textbook chapters, or generic PDF reading
  return "materi_pdf";
}

export const HIERARCHY_TIER_STYLES: Record<
  MaterialHierarchyTier,
  {
    label: string;
    textColor: string;
    borderAccent: string;
    icon: typeof FileText;
    iconColor: string;
  }
> = {
  article: {
    label: "Artikel",
    textColor: "text-blue-600 dark:text-blue-400 font-medium",
    borderAccent: "border-l-blue-500",
    icon: FileText,
    iconColor: "text-blue-500",
  },
  diktat: {
    label: "Diktat",
    textColor: "text-purple-600 dark:text-purple-400 font-medium",
    borderAccent: "border-l-purple-500",
    icon: BookOpen,
    iconColor: "text-purple-500",
  },
  materi_pdf: {
    label: "Materi PDF",
    textColor: "text-rose-600 dark:text-rose-400 font-medium",
    borderAccent: "border-l-rose-500",
    icon: FileText,
    iconColor: "text-rose-500",
  },
  soal_pdf: {
    label: "Soal PDF",
    textColor: "text-amber-600 dark:text-amber-400 font-medium",
    borderAccent: "border-l-amber-500",
    icon: ClipboardList,
    iconColor: "text-amber-500",
  },
};

function cleanDocTitle(title: string, courseTitle?: string) {
  let cleaned = title.trim();
  if (courseTitle && cleaned.toLowerCase().startsWith(courseTitle.toLowerCase())) {
    cleaned = cleaned.slice(courseTitle.length).replace(/^[\s:,-]+/, "").trim();
  }
  cleaned = cleaned.replace(/^Bab\s+\d+[:\s,-]+/i, "").trim();
  return cleaned || title;
}

function getDocumentSecondaryMeta(material: CourseMaterial, t: ReturnType<typeof useTranslations>): string[] {
  const subcategory = material.subcategory
    ? getSubcategoryLabel(material.subcategory as CourseMaterialSubcategory) ?? material.subcategory
    : null;

  const rawFileSize = material.fileSize?.trim();
  const fileLabelKeys: Record<string, string> = {
    "PDF Diktat": "diktatPdf",
    "Rangkuman Materi": "materialSummary",
    "Pembahasan Soal": "questionExplanation",
    "Lembar Soal": "questionSheet",
    "Berkas PDF ITB": "itbPdfFile",
    "PDF File": "pdfFile",
    "Disusun otomatis": "autoPrepared",
  };
  const translatedFileSize = rawFileSize && fileLabelKeys[rawFileSize]
    ? t(`documents.fileLabels.${fileLabelKeys[rawFileSize]}`)
    : rawFileSize;
  const isRedundantFileSize =
    !rawFileSize ||
    /^diktat(\s+resmi|\s+canonical)?$/i.test(rawFileSize) ||
    /^(pdf|artikel|materi|berkas\s+pdf(\s+itb)?)$/i.test(rawFileSize);

  return [
    subcategory,
    material.year ? String(material.year) : null,
    isRedundantFileSize ? null : translatedFileSize,
  ].filter((val): val is string => Boolean(val));
}

function HierarchyDocumentCard({
  material,
  courseId,
  courseSlug,
  courseTitle,
  isAdmin,
  onDelete,
}: {
  material: CourseMaterial;
  courseId: string;
  courseSlug?: string;
  courseTitle?: string;
  isAdmin?: boolean;
  onDelete?: (m: CourseMaterial) => void;
}) {
  const t = useTranslations("learning");
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);
  const tier = getMaterialHierarchyTier(material);
  const tierStyle = HIERARCHY_TIER_STYLES[tier];
  const itemHref =
    isAdmin && courseSlug
      ? `/admin/courses/${encodeURIComponent(courseSlug)}/documents/${material.id}`
      : material.href ?? `/courses/${courseId}/material/${material.id}`;
  const isLocked = Boolean(material.locked);
  const isPdf = material.kind === "pdf" && Boolean(material.url);
  const viewPdfUrl = isPdf ? getViewablePdfUrl(material.url) : null;
  const secondaryMeta = getDocumentSecondaryMeta(material, t);
  const FallbackIcon = tierStyle.icon;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isLocked) return;
    if (isPdf && viewPdfUrl && !isAdmin && isMobileOrTablet()) {
      e.preventDefault();
      updateMaterialProgress(material.id, "in_progress").catch(() => {});
      window.open(viewPdfUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Link
      href={itemHref}
      onClick={handleClick}
      className={cn(
        "group flex min-w-0 items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        isLocked && "opacity-90 hover:opacity-100"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* Document Thumbnail Preview with Seamless Left Color Accent */}
        <div
          className={cn(
            "relative aspect-[16/10] w-24 sm:w-32 shrink-0 overflow-hidden rounded-md border border-border/60 border-l-[3px] bg-muted/30 transition-colors",
            tierStyle.borderAccent
          )}
        >
          {material.thumbnailUrl && failedThumbnail !== material.thumbnailUrl ? (
            <Image
              src={material.thumbnailUrl}
              alt=""
              onError={() => setFailedThumbnail(material.thumbnailUrl ?? null)}
              fill
              sizes="(max-width: 640px) 96px, 128px"
              className="object-cover object-top"
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center bg-muted/40">
              <FallbackIcon className={cn("size-5 sm:size-6", tierStyle.iconColor)} aria-hidden />
            </div>
          )}
        </div>

        {/* Full-width Title and Seamless Color Meta Line */}
        <div className="min-w-0 flex-1">
          <p
            className="break-words text-body-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors"
            title={material.title}
          >
            {cleanDocTitle(material.title, courseTitle)}
          </p>
          <p className="mt-0.5 break-words text-body-xs leading-tight text-muted-foreground">
            <span className={tierStyle.textColor}>{t(`documents.materialTypes.${tier}`)}</span>
            {secondaryMeta.length > 0 && <span> · {secondaryMeta.join(" · ")}</span>}
          </p>
        </div>
      </div>

      {isAdmin ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 rounded-md text-muted-foreground hover:text-foreground shrink-0"
              aria-label={t("documents.documentActions")}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <MoreVertical className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href={`${itemHref}?mode=edit`}>
                <Pencil className="size-3.5 mr-2" />
                {t("documents.editDocument")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={itemHref}>
                <Eye className="size-3.5 mr-2" />
                {t("documents.preview")}
              </Link>
            </DropdownMenuItem>
            {material.url ? (
              <DropdownMenuItem asChild>
                <a href={material.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3.5 mr-2" />
                  {t("documents.openPdf")}
                </a>
              </DropdownMenuItem>
            ) : null}
            {material.source === "legacy-pdf" || material.kind === "pdf" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete?.(material);
                  }}
                >
                  <Trash2 className="size-3.5 mr-2" />
                  {t("documents.delete")}
                </DropdownMenuItem>
              </>
            ) : null}
            {material.source === "canonical-article" || material.source === "canonical-diktat" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={`/admin/courses/${encodeURIComponent(courseSlug || courseId)}/review?tab=product`}>
                    <BookOpenCheck className="size-3.5 mr-2" />
                    {t("documents.manageReview")}
                  </Link>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : isLocked ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-body-2xs font-semibold text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
          <Lock className="size-2.5" />
          {t("documents.locked")}
        </span>
      ) : material.completed ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-status-success" aria-label={t("documents.markAsRead")} />
      ) : (
        <ChevronRight
          className="size-3.5 shrink-0 text-muted-foreground/55 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      )}
    </Link>
  );
}

/** Determines if a material is a question, quiz, tryout, or assessment asset. */
function isSoalMaterial(material: CourseMaterial): boolean {
  if (material.kind === "quiz" || material.kind === "tryout") return true;
  if (material.docCategory === "soal" || material.docCategory === "solusi") return true;
  if (material.tabGroup === "bank_soal") return true;
  const sub = material.subcategory?.toLowerCase().trim();
  if (sub && ["kuis", "kbf", "tutorial", "tryout", "scl"].includes(sub)) return true;
  if (/\b(soal|latihan|pembahasan|kuis|uts|uas|scl)\b/i.test(material.title)) return true;
  return false;
}

/** Determines if a material belongs to the UTS subcategory or exam scope. */
function isUtsMaterial(material: CourseMaterial): boolean {
  const sub = material.subcategory?.toLowerCase().trim();
  if (sub === "uts") return true;
  if (isSoalMaterial(material) && /\b(uts)\b/i.test(material.title)) return true;
  return false;
}

/** Determines if a material belongs to the UAS subcategory or exam scope. */
function isUasMaterial(material: CourseMaterial): boolean {
  const sub = material.subcategory?.toLowerCase().trim();
  if (sub === "uas") return true;
  if (isSoalMaterial(material) && /\b(uas)\b/i.test(material.title)) return true;
  return false;
}

/** Determines if a material belongs to the UP subcategory or exam scope. */
function isUpMaterial(material: CourseMaterial): boolean {
  const sub = material.subcategory?.toLowerCase().trim();
  if (sub === "up") return true;
  if (isSoalMaterial(material) && /\b(up)\b/i.test(material.title)) return true;
  return false;
}

const HIERARCHY_TIER_RANK: Record<MaterialHierarchyTier, number> = {
  article: 1,
  diktat: 2,
  materi_pdf: 3,
  soal_pdf: 4,
};

/** Sorts materials by pedagogical hierarchy: artikel -> diktat -> materi pdf -> soal pdf. */
function sortMaterials(items: CourseMaterial[]): CourseMaterial[] {
  return [...items].sort((a, b) => {
    const tierA = HIERARCHY_TIER_RANK[getMaterialHierarchyTier(a)];
    const tierB = HIERARCHY_TIER_RANK[getMaterialHierarchyTier(b)];
    if (tierA !== tierB) {
      return tierA - tierB;
    }
    if (a.year !== b.year) {
      if (a.year == null) return 1;
      if (b.year == null) return -1;
      return b.year - a.year;
    }
    return a.title.localeCompare(b.title, "id");
  });
}

/** Collapsible accordion row presenting a grouped document collection with uniform badge and title. */
function CollapsibleDocumentSection({
  badge,
  title,
  materials,
  courseId,
  courseSlug,
  courseTitle,
  isAdmin,
  onDelete,
  open,
  onOpenChange,
}: {
  badge: string;
  title: string;
  materials: CourseMaterial[];
  courseId: string;
  courseSlug?: string;
  courseTitle?: string;
  isAdmin?: boolean;
  onDelete?: (m: CourseMaterial) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("learning");
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
        <span className="shrink-0 text-body-xs text-muted-foreground">{t("documents.documentCount", { count: materials.length })}</span>
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
          <div className="divide-y divide-border/40 border-t border-border/40 bg-card/25">
            {materials.map((material) => (
              <HierarchyDocumentCard
                key={material.id}
                material={material}
                courseId={courseId}
                courseSlug={courseSlug}
                courseTitle={courseTitle}
                isAdmin={isAdmin}
                onDelete={onDelete}
              />
            ))}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

/** Renders the course documents client interface with tabbed views and structured collapsible sections. */
export function CourseDocumentsClient({
  courseId,
  courseSlug,
  courseTitle,
  materials,
  chapters,
  defaultTab,
  accessTier,
  lockedMaterialCount = 0,
  forcePageNavigation = false,
  isAdmin = false,
}: CourseDocumentsClientProps) {
  const t = useTranslations("learning");
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<CourseMaterial | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await deleteCourseMaterial(deleteTarget.id);
      if (res.success) {
        toast.success(t("documents.deleted"));
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(t("documents.deleteFailed"));
      }
    } catch {
      toast.error(t("documents.networkError"));
    } finally {
      setIsDeleting(false);
    }
  };

  const initialTab = normalizeTabKey(defaultTab);
  const [urlTab, setUrlTab] = useUrlTab("tab", "all", initialTab);
  const activeTab = normalizeTabKey(urlTab);

  const { chapterKeyById } = useMemo(() => {
    const keyMap = new Map<string, string>();
    const allKnown = new Set<string>();

    for (const chapter of chapters) {
      keyMap.set(chapter.id, chapter.id);
      allKnown.add(chapter.id);
      if (chapter.canonicalId) {
        keyMap.set(chapter.canonicalId, chapter.id);
        allKnown.add(chapter.canonicalId);
      }
      if (chapter.legacyChapterId) {
        keyMap.set(chapter.legacyChapterId, chapter.id);
        allKnown.add(chapter.legacyChapterId);
      }
    }
    return { chapterKeyById: keyMap, knownChapterIds: allKnown };
  }, [chapters]);

  const {
    chapterGroups,
    utsMaterials,
    uasMaterials,
    upMaterials,
    soalLainnyaMaterials,
    lainLainMaterials,
  } = useMemo(() => {
    const uts: CourseMaterial[] = [];
    const uas: CourseMaterial[] = [];
    const up: CourseMaterial[] = [];
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
      if (isUpMaterial(material)) {
        up.push(material);
        continue;
      }

      // Check chapter relationship
      const rawIds = materialChapterIds(material);
      const resolvedChapterIds = Array.from(
        new Set(
          rawIds
            .map((id) => chapterKeyById.get(id))
            .filter((id): id is string => Boolean(id))
        )
      );

      if (resolvedChapterIds.length === 1) {
        const list = chapterMaterialMap.get(resolvedChapterIds[0]);
        if (list) {
          list.push(material);
        } else {
          if (isSoalMaterial(material)) {
            soalLainnya.push(material);
          } else {
            lainLain.push(material);
          }
        }
      } else {
        // One-to-many (>1 chapters) or 0 chapters (unassigned/general)
        if (isSoalMaterial(material)) {
          soalLainnya.push(material);
        } else {
          lainLain.push(material);
        }
      }
    }

    return {
      chapterGroups: chapters.map((chapter) => ({
        chapter,
        materials: sortMaterials(chapterMaterialMap.get(chapter.id) ?? []),
      })),
      utsMaterials: sortMaterials(uts),
      uasMaterials: sortMaterials(uas),
      upMaterials: sortMaterials(up),
      soalLainnyaMaterials: sortMaterials(soalLainnya),
      lainLainMaterials: sortMaterials(lainLain),
    };
  }, [chapterKeyById, chapters, materials]);

  const firstPopulatedSectionKey = useMemo(() => {
    const firstChapter = chapterGroups.find(({ materials: chMats }) => chMats.length > 0);
    if (firstChapter) return `chapter:${firstChapter.chapter.id}`;
    if (utsMaterials.length > 0) return "special:uts";
    if (uasMaterials.length > 0) return "special:uas";
    if (upMaterials.length > 0) return "special:up";
    if (soalLainnyaMaterials.length > 0) return "special:soal_lainnya";
    if (lainLainMaterials.length > 0) return "special:lain_lain";
    return null;
  }, [chapterGroups, utsMaterials.length, uasMaterials.length, upMaterials.length, soalLainnyaMaterials.length, lainLainMaterials.length]);

  const [openSection, setOpenSection] = useState<string | null>(firstPopulatedSectionKey);

  return (
    <div className="space-y-3 font-sans">
      {activeTab === "all" && accessTier === "free" && lockedMaterialCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-primary/25 bg-brand-primary/5 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2 text-body-xs text-muted-foreground">
            <span>{t("documents.lockedArticleNotice")}</span>
          </div>
          <Link href="/plans" className="shrink-0 rounded-md border border-border bg-card px-2.5 py-1.5 text-body-sm font-semibold text-brand-primary hover:bg-muted">
            {t("documents.activateAccess")}
          </Link>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={activeTab} onValueChange={(value) => setUrlTab(normalizeTabKey(value))}>
          <TabsList className="max-w-full justify-start" aria-label={t("documents.courseCategoryLabel")}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.key} value={tab.key}>
                  <Icon className="size-3.5 shrink-0" />
                  <span>{t(`documents.categories.${tab.label}`)}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {isAdmin ? (
          <Button
            type="button"
            size="icon"
            variant="default"
            className="size-8 rounded-lg shrink-0 cursor-pointer shadow-xs"
            onClick={() => setUploadOpen(true)}
            aria-label={t("documents.uploadPdf")}
            title={t("documents.uploadPdf")}
          >
            <Plus className="size-4" />
          </Button>
        ) : null}
      </div>

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
                  courseSlug={courseSlug}
                  courseTitle={courseTitle}
                  isAdmin={isAdmin}
                  onDelete={setDeleteTarget}
                  open={openSection === sectionKey}
                  onOpenChange={(nextOpen) => setOpenSection(nextOpen ? sectionKey : null)}
                />
              );
            })}
            <CollapsibleDocumentSection
              badge={t("documents.examBadges.midterm")}
              title={t("documents.examSections.midterm")}
              materials={utsMaterials}
              courseId={courseId}
              courseSlug={courseSlug}
              courseTitle={courseTitle}
              isAdmin={isAdmin}
              onDelete={setDeleteTarget}
              open={openSection === "special:uts"}
              onOpenChange={(nextOpen) => setOpenSection(nextOpen ? "special:uts" : null)}
            />
            <CollapsibleDocumentSection
              badge={t("documents.examBadges.final")}
              title={t("documents.examSections.final")}
              materials={uasMaterials}
              courseId={courseId}
              courseSlug={courseSlug}
              courseTitle={courseTitle}
              isAdmin={isAdmin}
              onDelete={setDeleteTarget}
              open={openSection === "special:uas"}
              onOpenChange={(nextOpen) => setOpenSection(nextOpen ? "special:uas" : null)}
            />
            {upMaterials.length > 0 && (
              <CollapsibleDocumentSection
                badge="UP"
                title={t("documents.examSections.remedial")}
                materials={upMaterials}
                courseId={courseId}
                courseSlug={courseSlug}
                courseTitle={courseTitle}
                isAdmin={isAdmin}
                onDelete={setDeleteTarget}
                open={openSection === "special:up"}
                onOpenChange={(nextOpen) => setOpenSection(nextOpen ? "special:up" : null)}
              />
            )}
            <CollapsibleDocumentSection
              badge={t("documents.categories.questions")}
              title={t("documents.examSections.moreQuestions")}
              materials={soalLainnyaMaterials}
              courseId={courseId}
              courseSlug={courseSlug}
              courseTitle={courseTitle}
              isAdmin={isAdmin}
              onDelete={setDeleteTarget}
              open={openSection === "special:soal_lainnya"}
              onOpenChange={(nextOpen) => setOpenSection(nextOpen ? "special:soal_lainnya" : null)}
            />
            <CollapsibleDocumentSection
              badge={t("documents.other")}
              title={t("documents.examSections.other")}
              materials={lainLainMaterials}
              courseId={courseId}
              courseSlug={courseSlug}
              courseTitle={courseTitle}
              isAdmin={isAdmin}
              onDelete={setDeleteTarget}
              open={openSection === "special:lain_lain"}
              onOpenChange={(nextOpen) => setOpenSection(nextOpen ? "special:lain_lain" : null)}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border/60 bg-muted/15 px-4 py-10 text-center">
            <FileText className="size-6 text-muted-foreground" aria-hidden />
            <h2 className="mt-3 font-heading text-body-sm font-bold">{t("documents.noCourseDocuments")}</h2>
            <p className="mt-1 text-body-xs text-muted-foreground">{t("documents.noCourseDocumentsDescription")}</p>
          </div>
        )
      ) : (
        <div className="[&_[data-slot=tabs-list]]:hidden">
          <DocumentListClient
            courseId={courseId}
            courseSlug={courseSlug}
            courseTitle={courseTitle}
            materials={materials}
            chapters={chapters}
            defaultTab={activeTab}
            accessTier={accessTier}
            lockedMaterialCount={lockedMaterialCount}
            forcePageNavigation={forcePageNavigation}
            isAdmin={isAdmin}
          />
        </div>
      )}

      {isAdmin ? (
        <>
          <AdminUploadDocumentDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            courseId={courseId}
            courseTitle={courseTitle || t("courseCatalog.genericCourse")}
            chapters={chapters}
            existingTitles={materials.map((m) => m.title)}
          />
          {deleteTarget ? (
            <AdminConfirmDialog
              open={Boolean(deleteTarget)}
              onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}
              title={t("documents.deleteTitle")}
              description={t("documents.deleteDescription", { title: deleteTarget.title })}
              confirmLabel={t("documents.delete")}
              loading={isDeleting}
              onConfirm={handleDeleteConfirm}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
