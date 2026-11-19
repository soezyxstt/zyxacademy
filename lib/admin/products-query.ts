import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requestJson } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";

const productFields = {
  id: z.string(),
  title: z.string(),
  courseId: z.string(),
  courseCode: z.string().nullable().optional(),
  courseTitle: z.string().nullable().optional(),
  chapterId: z.string().nullable().optional(),
  status: z.string(),
  fileKey: z.string().nullable().optional(),
  contentMarkdown: z.string().nullable().optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
};

export const adminProductSchema = z.discriminatedUnion("productType", [
  z.object({ ...productFields, productType: z.literal("diktat") }),
  z.object({ ...productFields, productType: z.literal("article") }),
  z.object({
    ...productFields,
    productType: z.literal("flashcard"),
    extra: z.object({
      cards: z.array(z.object({ id: z.string(), front: z.string(), back: z.string(), explanation: z.string().nullable() })),
    }),
  }),
  z.object({
    ...productFields,
    productType: z.literal("blueprint"),
    extra: z.object({
      assessmentType: z.string(),
      questionTargetCount: z.number().int().nonnegative().nullable(),
      targetChapterIds: z.array(z.string()).nullable(),
    }),
  }),
  z.object({
    ...productFields,
    productType: z.literal("question"),
    extra: z.object({
      questionType: z.enum(["multiple_choice", "multiple_choices", "short_answer", "essay"]),
      options: z.array(z.object({ id: z.string(), text: z.string(), isCorrect: z.boolean() })),
      difficulty: z.enum(["easy", "medium", "hard"]),
      cognitiveLevel: z.enum(["remember", "understand", "apply", "analyze", "evaluate", "create"]),
      reasoningPattern: z.string(),
    }),
  }),
]);

export const adminProductsSchema = z.object({
  items: z.array(adminProductSchema),
  total: z.number().int().nonnegative(),
});

export type AdminProductItem = z.infer<typeof adminProductSchema>;
export type AdminProductFilters = Readonly<{ type: string; courseId: string; search: string }>;

function normalizeFilters(filters: AdminProductFilters): AdminProductFilters {
  return {
    type: filters.type === "all" ? "" : filters.type,
    courseId: filters.courseId === "all" ? "" : filters.courseId,
    search: filters.search.trim().toLowerCase(),
  };
}

export function fetchAdminProducts(filters: AdminProductFilters, signal?: AbortSignal) {
  const normalized = normalizeFilters(filters);
  const params = new URLSearchParams();
  if (normalized.type) params.set("type", normalized.type);
  if (normalized.courseId) params.set("courseId", normalized.courseId);
  if (normalized.search) params.set("q", normalized.search);
  return requestJson(`/api/admin/products?${params}`, adminProductsSchema, { signal });
}

export function adminProductsQuery(userId: string, filters: AdminProductFilters) {
  const normalized = normalizeFilters(filters);
  return queryOptions({
    queryKey: queryKeys.admin.products(userId, normalized),
    queryFn: ({ signal }) => fetchAdminProducts(normalized, signal),
    enabled: Boolean(userId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
