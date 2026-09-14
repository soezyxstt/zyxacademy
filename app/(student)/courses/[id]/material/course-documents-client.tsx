"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  X,
} from "lucide-react";
import { Dialog as DialogNs } from "radix-ui";
import { DocumentListClient } from "./document-list-client";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { cn } from "@/lib/utils";
import type { CourseMaterial, DocCategory } from "@/lib/student-course-fixtures";
import { getSubcategoryLabel, type CourseMaterialSubcategory } from "@/lib/course-materials";

type Chapter = { id: string; title: string; orderIndex: number };
type TabKey = "all" | "materi" | "diktat" | "bank_soal" | "pdf";

type CourseDocumentsClientProps = {
  courseId: string;
  materials: CourseMaterial[];
  chapters: Chapter[];
  defaultTab?: string;
};

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

const typeStyle: Record<Exclude<TabKey, "all">, { label: string; border: string; icon: typeof FileText; iconClass: string }> = {
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

function isPageNavigationMaterial(material: CourseMaterial): boolean {
  if (material.kind === "article") return true;
  if (material.docCategory === "diktat" || material.tabGroup === "diktat") return true;
  if (material.kind === "quiz" || material.kind === "tryout") return true;
  return !material.url;
}

function documentMeta(material: CourseMaterial, typeLabel: string): string {
  const subcategory = material.subcategory
    ? getSubcategoryLabel(material.subcategory as CourseMaterialSubcategory) ?? material.subcategory
    : null;

  return [typeLabel, subcategory, material.year ? String(material.year) : null, material.fileSize]
    .filter(Boolean)
    .join(" · ");
}

function HierarchyDocumentRow({
  material,
  courseId,
  onSelectPdf,
}: {
  material: CourseMaterial;
  courseId: string;
  onSelectPdf: (material: CourseMaterial) => void;
}) {
  const group = resolveTabGroup(material);
  const style = typeStyle[group];
  const Icon = style.icon;
  const itemHref = material.href ?? `/courses/${courseId}/material/${material.id}`;
  const pageNavigation = isPageNavigationMaterial(material);
  const rowClassName = cn(
    "group flex w-full min-w-0 items-center gap-2.5 rounded-md border border-border/45 border-l-2 bg-background px-3 py-2 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
    style.border
  );

  const content = (
    <>
      <Icon className={cn("size-4 shrink-0", style.iconClass)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-medium leading-tight text-foreground" title={material.title}>
          {material.title}
        </p>
        <p className="mt-0.5 truncate text-body-xs leading-tight text-muted-foreground">
          {documentMeta(material, style.label)}
        </p>
      </div>
      {material.completed ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-status-success" aria-label="Selesai dipelajari" />
      ) : null}
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/55 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </>
  );

  if (pageNavigation) {
    return (
      <Link href={itemHref} className={rowClassName}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={rowClassName} onClick={() => onSelectPdf(material)}>
      {content}
    </button>
  );
}

function ChapterDocuments({
  chapter,
  materials,
  courseId,
  defaultOpen = false,
  onSelectPdf,
}: {
  chapter: Pick<Chapter, "title" | "orderIndex">;
  materials: CourseMaterial[];
  courseId: string;
  defaultOpen?: boolean;
  onSelectPdf: (material: CourseMaterial) => void;
}) {
  const hasDocuments = materials.length > 0;

  return (
    <Collapsible defaultOpen={defaultOpen && hasDocuments} className="border-b border-border/45 last:border-b-0">
      <CollapsibleTrigger
        disabled={!hasDocuments}
        className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/30 disabled:cursor-default disabled:hover:bg-transparent sm:px-3.5"
      >
        <span className="w-12 shrink-0 text-body-xs font-semibold text-muted-foreground">
          Bab {chapter.orderIndex}
        </span>
        <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-foreground" title={chapter.title}>
          {chapter.title}
        </span>
        <span className="shrink-0 text-body-xs text-muted-foreground">
          {materials.length} dokumen
        </span>
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
          <div className="grid gap-1.5 border-t border-border/35 bg-muted/10 p-1.5 sm:p-2">
            {materials.map((material) => (
              <HierarchyDocumentRow
                key={material.id}
                material={material}
                courseId={courseId}
                onSelectPdf={onSelectPdf}
              />
            ))}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function UnassignedDocuments({
  materials,
  courseId,
  onSelectPdf,
}: {
  materials: CourseMaterial[];
  courseId: string;
  onSelectPdf: (material: CourseMaterial) => void;
}) {
  if (materials.length === 0) return null;

  return (
    <Collapsible className="border-b border-border/45 last:border-b-0">
      <CollapsibleTrigger className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/30 sm:px-3.5">
        <span className="w-12 shrink-0 text-body-xs font-semibold text-muted-foreground">Lainnya</span>
        <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-foreground">
          Dokumen tanpa bab
        </span>
        <span className="shrink-0 text-body-xs text-muted-foreground">{materials.length} dokumen</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-1.5 border-t border-border/35 bg-muted/10 p-1.5 sm:p-2">
          {materials.map((material) => (
            <HierarchyDocumentRow
              key={material.id}
              material={material}
              courseId={courseId}
              onSelectPdf={onSelectPdf}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PdfViewerModal({ material, onClose }: { material: CourseMaterial | null; onClose: () => void }) {
  if (!material) return null;

  return (
    <DialogNs.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogNs.Portal>
        <DialogNs.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-1 md:p-1.5">
          <DialogNs.Content
            className="pointer-events-auto relative flex size-full flex-col overflow-hidden rounded-none border-0 bg-background shadow-2xl outline-none sm:rounded-lg sm:border sm:border-border/80"
            aria-label={`Pratinjau dokumen ${material.title}`}
          >
            <DialogNs.Title className="sr-only">{material.title}</DialogNs.Title>
            <DialogNs.Description className="sr-only">Pratinjau PDF {material.title}</DialogNs.Description>
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/80 bg-card px-2.5 sm:px-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="size-3.5 shrink-0 text-rose-500" aria-hidden />
                <span className="max-w-[240px] truncate text-body-xs font-semibold text-foreground sm:max-w-md md:max-w-xl" title={material.title}>
                  {material.title}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {material.url ? (
                  <>
                    <Button variant="ghost" size="icon" className="size-7 rounded-md" asChild>
                      <a href={material.url} download target="_blank" rel="noopener noreferrer" aria-label={`Unduh PDF ${material.title}`}>
                        <Download className="size-3.5" />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 rounded-md" asChild>
                      <a href={material.url} target="_blank" rel="noopener noreferrer" aria-label={`Buka PDF ${material.title} di tab baru`}>
                        <ExternalLink className="size-3.5" />
                      </a>
                    </Button>
                  </>
                ) : null}
                <Button variant="ghost" size="icon" className="size-7 rounded-md" onClick={onClose} aria-label="Tutup pratinjau">
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-muted/30">
              {material.url ? (
                <iframe src={material.url} title={material.title} className="size-full border-0" />
              ) : (
                <div className="flex size-full items-center justify-center p-6 text-body-sm text-muted-foreground">
                  Tautan berkas PDF belum tersedia.
                </div>
              )}
            </div>
          </DialogNs.Content>
        </div>
      </DialogNs.Portal>
    </DialogNs.Root>
  );
}

export function CourseDocumentsClient({
  courseId,
  materials,
  chapters,
  defaultTab,
}: CourseDocumentsClientProps) {
  const initialTab = normalizeTabKey(defaultTab);
  const [urlTab, setUrlTab] = useUrlTab("tab", initialTab);
  const activeTab = normalizeTabKey(urlTab);
  const [selectedPdf, setSelectedPdf] = useState<CourseMaterial | null>(null);

  const chapterGroups = useMemo(
    () =>
      chapters.map((chapter) => ({
        chapter,
        materials: materials.filter((material) => materialChapterIds(material).includes(chapter.id)),
      })),
    [chapters, materials]
  );

  const knownChapterIds = useMemo(() => new Set(chapters.map((chapter) => chapter.id)), [chapters]);
  const unassignedMaterials = useMemo(
    () =>
      materials.filter((material) => {
        const ids = materialChapterIds(material);
        return ids.length === 0 || !ids.some((id) => knownChapterIds.has(id));
      }),
    [knownChapterIds, materials]
  );

  return (
    <div className="space-y-3 font-sans">
      <Tabs value={activeTab} onValueChange={(value) => setUrlTab(normalizeTabKey(value))}>
        <TabsList className="max-w-full justify-start overflow-x-auto" aria-label="Kategori dokumen mata kuliah">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.key} value={tab.key} className="shrink-0">
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
            {chapterGroups.map(({ chapter, materials: chapterMaterials }, index) => (
              <ChapterDocuments
                key={chapter.id}
                chapter={chapter}
                materials={chapterMaterials}
                courseId={courseId}
                defaultOpen={index === 0}
                onSelectPdf={setSelectedPdf}
              />
            ))}
            <UnassignedDocuments
              materials={unassignedMaterials}
              courseId={courseId}
              onSelectPdf={setSelectedPdf}
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
          />
        </div>
      )}

      <PdfViewerModal material={selectedPdf} onClose={() => setSelectedPdf(null)} />
    </div>
  );
}
