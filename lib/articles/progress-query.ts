import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requestJson } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";
import {
  articleProgressSchema,
  articleProgressResultSchema,
  articleProgressUpdateSchema,
  type ArticleProgressUpdate,
} from "./progress-contract";

export function articleProgressQuery(userId: string, articleId: string, articleVersion: number) {
  return queryOptions({
    queryKey: queryKeys.articles.progress(userId, articleId, articleVersion),
    queryFn: ({ signal }) => requestJson(
      `/api/student/articles/${encodeURIComponent(articleId)}/progress?version=${articleVersion}`,
      articleProgressSchema.extend({ articleId: z.literal(articleId), articleVersion: z.literal(articleVersion) }),
      { signal, headers: { "x-student-id": userId }, cache: "no-store" },
    ),
    staleTime: 60_000,
  });
}

export function updateArticleProgress(
  userId: string,
  articleId: string,
  articleVersion: number,
  update: ArticleProgressUpdate,
) {
  const body = articleProgressUpdateSchema.parse({ ...update, articleVersion });
  return requestJson(
    `/api/student/articles/${encodeURIComponent(articleId)}/progress`,
    articleProgressResultSchema.extend({
      articleId: z.literal(articleId),
      articleVersion: z.literal(articleVersion),
      sectionId: z.literal(body.sectionId),
    }),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-student-id": userId },
      body: JSON.stringify(body),
      // Tiny progress writes should survive section navigation and page exit.
      keepalive: true,
    },
  );
}
