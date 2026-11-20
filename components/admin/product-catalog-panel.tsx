"use client";

import { ProductCatalogSkeleton } from "@/components/admin/content-loading-skeletons";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { adminProductsQuery, type AdminProductItem } from "@/lib/admin/products-query";
import { queryKeys } from "@/lib/query/keys";
import { useQueryAccountId } from "@/hooks/use-query-account";
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

const EMPTY_PRODUCTS: AdminProductItem[] = [];

export function ProductCatalogPanel(props: Props) {
  const userId = useQueryAccountId();
  return <ProductCatalogContent key={userId ?? "pending"} {...props} userId={userId} />;
}

function ProductCatalogContent({ courseLabels = {}, lockedCourse, userId }: Props & { userId: string | undefined }) {
  const t = useTranslations("admin.products");
  const queryClient = useQueryClient();

  // Filters
  const [activeType, setActiveType] = useUrlTab("productType", "all");
  const [selectedCourse, setSelectedCourse] = useState(lockedCourse ? lockedCourse.id : "all");
  const [searchQuery, setSearchQuery] = useState("");

  // Preview Drawer
  const [previewItem, setPreviewItem] = useState<AdminProductItem | null>(null);
  const effectiveCourse = lockedCourse ? lockedCourse.id : selectedCourse;
  const { data, isPending, isFetching, error, refetch } = useQuery(adminProductsQuery(userId ?? "", {
    type: activeType,
    courseId: effectiveCourse,
    search: searchQuery,
  }));
  const items = data?.items ?? EMPTY_PRODUCTS;
  const loading = isPending || !userId;

  const invalidateProducts = useCallback(async () => {
    if (!userId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.admin.productsAll(userId) });
  }, [queryClient, userId]);

  const uniqueCourseIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (item.courseId) ids.add(item.courseId);
    }
    return Array.from(ids);
  }, [items]);

  return (
    <div className="space-y-5">
      {/* Inline Type Tabs + Responsive Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
            <div className="min-w-[180px] shrink-0">
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

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
            disabled={loading || isFetching}
            className="h-8 shrink-0 gap-1.5 text-body-xs"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Segarkan
          </Button>
        </div>
      </div>

      {/* Product List Content */}
      {loading ? (
        <ProductCatalogSkeleton />
      ) : error ? (
        <AdminErrorState message={t("loadFailed")} onRetry={() => void refetch()} />
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
                  onPdfRendered={invalidateProducts}
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
                  {previewItem.extra.cards.length > 0 ? (
                    previewItem.extra.cards.map((c, idx) => (
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
                    options: previewItem.extra.options,
                    difficulty: previewItem.extra.difficulty,
                    cognitiveLevel: previewItem.extra.cognitiveLevel,
                  }}
                />
              )}

              {previewItem.productType === "blueprint" && (
                <AssessmentBlueprintProductView
                  product={{
                    title: previewItem.title,
                    assessmentType: previewItem.extra.assessmentType,
                    chapterIds: previewItem.extra.targetChapterIds ?? [],
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
