"use client";

import { ProductCatalogSkeleton } from "@/components/admin/content-loading-skeletons";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n/client";
import {
  BookOpen,
  FileCheck2,
  FileText,
  HelpCircle,
  Layers,
  LayoutGrid,
  RefreshCw,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchBar } from "@/components/ui/search-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { StatusBadge } from "@/components/admin/status-badges";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/state-panels";
import { FormattedDate } from "@/components/ui/formatted-date";
import {
  ArticleProductView,
  DiktatProductView,
  FlashcardProductView,
  QuestionProductView,
  AssessmentBlueprintProductView,
} from "@/components/admin/material-review-detail";
import type { AdminProductItem } from "@/app/api/admin/products/route";
import type { LockedCourseInfo } from "@/lib/admin/course-identity";

const TYPE_LABELS: Record<string, string> = {
  all: "Semua",
  diktat: "Diktat",
  article: "Artikel",
  flashcard: "Flashcard",
  question: "Soal",
  blueprint: "Blueprint",
};

const TYPE_ICONS: Record<string, typeof FileText> = {
  diktat: FileText,
  article: BookOpen,
  flashcard: Layers,
  question: HelpCircle,
  blueprint: FileCheck2,
};

type Props = {
  courseLabels?: Record<string, string>;
  lockedCourse?: LockedCourseInfo;
};

export function ProductCatalogPanel({ courseLabels = {}, lockedCourse }: Props) {
  const t = useTranslations("admin.products");
  const [items, setItems] = useState<AdminProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [activeType, setActiveType] = useUrlTab("productType", "all");
  const [selectedCourse, setSelectedCourse] = useState(lockedCourse ? lockedCourse.id : "all");
  const [searchQuery, setSearchQuery] = useState("");

  // Preview Drawer
  const [previewItem, setPreviewItem] = useState<AdminProductItem | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeType !== "all") params.set("type", activeType);
      const effectiveCourse = lockedCourse ? lockedCourse.id : selectedCourse;
      if (effectiveCourse !== "all") params.set("courseId", effectiveCourse);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());

      const res = await fetch(`/api/admin/products?${params.toString()}`);
      if (!res.ok) {
        throw new Error(t("loadFailed"));
      }
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [activeType, selectedCourse, searchQuery, lockedCourse, t]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  const uniqueCourseIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (item.courseId) ids.add(item.courseId);
    }
    return Array.from(ids);
  }, [items]);

  return (
    <div className="space-y-5">
      {/* Inline Responsive Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="min-w-[140px] flex-1 max-w-xs">
            <SearchBar
              size="sm"
              value={searchQuery}
              onSearch={setSearchQuery}
              onClear={() => setSearchQuery("")}
              placeholder="Cari judul produk..."
            />
          </div>

          {/* Course Select */}
          {!lockedCourse && (
            <div className="min-w-[180px]">
              <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                <SelectTrigger className="h-8 text-body-sm">
                  <SelectValue placeholder="Semua mata kuliah" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua mata kuliah</SelectItem>
                  {uniqueCourseIds.map((cid) => (
                    <SelectItem key={cid} value={cid}>
                      {courseLabels[cid] || cid}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void fetchProducts()}
            disabled={loading}
            className="h-8 gap-1.5 text-body-xs"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Segarkan
          </Button>
        </div>
      </div>

      {/* Type Filter Tabs */}
      <Tabs value={activeType} onValueChange={setActiveType}>
        <TabsList>
          <TabsTrigger value="all">
            Semua
          </TabsTrigger>
          <TabsTrigger value="diktat">
            <FileText className="size-3.5" />
            Diktat
          </TabsTrigger>
          <TabsTrigger value="article">
            <BookOpen className="size-3.5" />
            Artikel
          </TabsTrigger>
          <TabsTrigger value="flashcard">
            <Layers className="size-3.5" />
            Flashcard
          </TabsTrigger>
          <TabsTrigger value="question">
            <HelpCircle className="size-3.5" />
            Soal
          </TabsTrigger>
          <TabsTrigger value="blueprint">
            <FileCheck2 className="size-3.5" />
            Blueprint
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Product List Content */}
      {loading ? (
        <ProductCatalogSkeleton />
      ) : error ? (
        <AdminErrorState message={error} onRetry={() => void fetchProducts()} />
      ) : items.length === 0 ? (
        <AdminEmptyState
          icon={LayoutGrid}
          title="Belum ada produk"
          description="Terbitkan produk dari Review materi."
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {items.map((item) => {
            const IconComponent = TYPE_ICONS[item.productType] || FileText;
            const courseText = item.courseTitle
              ? `${item.courseCode ? item.courseCode + " · " : ""}${item.courseTitle}`
              : courseLabels[item.courseId] || item.courseId;

            return (
              <article
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="gap-1 text-[11px]">
                      <IconComponent className="size-3" />
                      {TYPE_LABELS[item.productType] || item.productType}
                    </Badge>
                    <StatusBadge tone={item.status === "published" ? "success" : "muted"}>
                      {item.status}
                    </StatusBadge>
                    {item.productType === "diktat" && (
                      <Badge
                        variant="secondary"
                        className={`text-[10px] ${
                          item.fileKey ? "bg-status-success/15 text-status-success" : "text-muted-foreground"
                        }`}
                      >
                        {item.fileKey ? "PDF Siap" : "Belum ada PDF"}
                      </Badge>
                    )}
                  </div>

                  <h3 className="truncate font-heading text-body-base font-semibold text-foreground">
                    {item.title}
                  </h3>

                  <div className="flex flex-wrap items-center gap-2 text-body-xs text-muted-foreground">
                    <span>{courseText}</span>
                    <span>·</span>
                    <span className="font-mono text-[11px]">{item.id}</span>
                    <span>·</span>
                    <span><FormattedDate date={item.createdAt} /></span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.productType === "diktat" && item.fileKey && (
                    <Button asChild type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-body-xs">
                      <a href={`/api/admin/diktats/${encodeURIComponent(item.id)}/pdf`} target="_blank" rel="noreferrer">
                        <FileText className="size-3.5" />
                        PDF
                      </a>
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPreviewItem(item)}
                    className="h-8 gap-1.5 text-body-xs"
                  >
                    <Eye className="size-3.5" />
                    Pratinjau
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Preview Sheet Dialog */}
      <Sheet open={Boolean(previewItem)} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <SheetContent side="right" className="flex flex-col w-full sm:max-w-2xl p-6 overflow-y-auto">
          {previewItem && (
            <div className="space-y-5">
              <SheetHeader className="border-b border-border pb-3 text-left">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-body-xs">
                    {TYPE_LABELS[previewItem.productType] || previewItem.productType}
                  </Badge>
                  <span className="text-body-xs font-mono text-muted-foreground">{previewItem.id}</span>
                </div>
                <SheetTitle className="font-heading text-body-base font-bold text-foreground">
                  {previewItem.title}
                </SheetTitle>
              </SheetHeader>

              {/* Dynamic Product Visualizer */}
              {previewItem.productType === "diktat" && (
                <DiktatProductView
                  product={{
                    id: previewItem.id,
                    title: previewItem.title,
                    contentMarkdown: previewItem.contentMarkdown || "",
                    fileKey: previewItem.fileKey,
                  }}
                  onPdfRendered={fetchProducts}
                />
              )}

              {previewItem.productType === "article" && (
                <ArticleProductView
                  product={{
                    id: previewItem.id,
                    productType: "article",
                    title: previewItem.title,
                    contentMarkdown: previewItem.contentMarkdown || "",
                    version: 1,
                    generationHash: "",
                    blocks: [
                      {
                        orderIndex: 0,
                        blockType: "explanation",
                        contentMarkdown: previewItem.contentMarkdown || "",
                        ideaIds: [],
                        sourceCitations: [],
                      },
                    ],
                    sections: [],
                    ideaLinks: [],
                  } as any}
                  viewMode="student"
                  onViewModeChange={() => undefined}
                  bundleId={previewItem.id}
                  bundleStatus={previewItem.status}
                  dependencies={[]}
                />
              )}

              {previewItem.productType === "flashcard" && (
                <div className="space-y-4">
                  {((previewItem.extra?.cards as any[]) || []).length > 0 ? (
                    ((previewItem.extra?.cards as any[]) || []).map((c, idx) => (
                      <FlashcardProductView
                        key={c.id || idx}
                        product={{
                          id: c.id || `card-${idx + 1}`,
                          front: c.front || "",
                          back: c.back || "",
                          explanation: c.explanation,
                        }}
                      />
                    ))
                  ) : (
                    <FlashcardProductView
                      product={{
                        id: previewItem.id,
                        front: previewItem.title,
                        back: previewItem.contentMarkdown || "",
                      }}
                    />
                  )}
                </div>
              )}

              {previewItem.productType === "question" && (
                <QuestionProductView
                  product={{
                    prompt: previewItem.contentMarkdown || previewItem.title,
                    options: Array.isArray(previewItem.extra?.options)
                      ? (previewItem.extra?.options as any)
                      : [],
                    difficulty: (previewItem.extra?.difficulty as any) || "medium",
                    cognitiveLevel: (previewItem.extra?.cognitiveLevel as any) || "understand",
                  }}
                />
              )}

              {previewItem.productType === "blueprint" && (
                <AssessmentBlueprintProductView
                  product={{
                    title: previewItem.title,
                    assessmentType: (previewItem.extra?.assessmentType as string) || "quiz",
                    chapterIds: Array.isArray(previewItem.extra?.targetChapterIds)
                      ? (previewItem.extra?.targetChapterIds as string[])
                      : [],
                    questionIds: [],
                  }}
                />
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
