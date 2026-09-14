"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
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

function HierarchyDocumentRow({ material, courseId }: { material: CourseMaterial; courseId: string }) {
  const group = resolveTabGroup(material);
  const style = typeStyle[group];
  const Icon = style.icon;
  const itemHref = material.href ?? `/courses/${courseId}/material/${material.id}`;

  return (
    <Link
      href={itemHref}
      className={cn(
        "group flex w-full min-w-0 items-center gap-2.5 rounded-md border border-border/45 border-l-2 bg-background px-3 py-2 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        style.border
      )}
    >
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
      <ChevronRight
        className="size-3.5 shrink-0 text-muted-foreground/55 transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}

function ChapterDocuments({
  chapter,
  materials,
  courseId,
  defaultOpen = false,
}: {
  chapter: Pick<Chapter, "title" | "orderIndex">;
  materials: CourseMaterial[];
  courseId: string;
  defaultOpen?: boolean;
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
          <div className="grid gap-1.5 border-t border-border/35 bg-muted/10 p-1.5 sm:p-2">
            {materials.map((material) => (
              <HierarchyDocumentRow key={material.id} material={material} courseId={courseId} />
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
  defaultOpen = false,
}: {
  materials: CourseMaterial[];
  courseId: string;
  defaultOpen?: boolean;
}) {
  if (materials.length === 0) return null;

  return (
    <Collapsible defaultOpen={defaultOpen} className="border-b border-border/45 last:border-b-0">
      <CollapsibleTrigger className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/30 sm:px-3.5">
        <span className="w-12 shrink-0 text-body-xs font-semibold text-muted-foreground">Lainnya</span>
        <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-foreground">
          Dokumen tanpa bab
        </span>
        <span className="shrink-0 text-body-xs text-muted-foreground">{materials.length} dokumen</span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-1.5 border-t border-border/35 bg-muted/10 p-1.5 sm:p-2">
          {materials.map((material) => (
            <HierarchyDocumentRow key={material.id} material={material} courseId={courseId} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
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

  const chapterGroups = useMemo(
    () =>
      chapters.map((chapter) => ({
        chapter,
        materials: materials.filter((material) => materialChapterIds(material).includes(chapter.id)),
      })),
    [chapters, materials]
  );

  const firstPopulatedChapterId = useMemo(
    () => chapterGroups.find(({ materials: chapterMaterials }) => chapterMaterials.length > 0)?.chapter.id,
    [chapterGroups]
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
            {chapterGroups.map(({ chapter, materials: chapterMaterials }) => (
              <ChapterDocuments
                key={chapter.id}
                chapter={chapter}
                materials={chapterMaterials}
                courseId={courseId}
                defaultOpen={chapter.id === firstPopulatedChapterId}
              />
            ))}
            <UnassignedDocuments
              materials={unassignedMaterials}
              courseId={courseId}
              defaultOpen={!firstPopulatedChapterId}
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
    </div>
  );
}
