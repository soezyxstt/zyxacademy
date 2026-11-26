import "server-only";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { articleCodingDraftKey, nativeArticleCodingHeader, nativeArticleCodingScope, sectionCodingParts } from "./native-article-contract";
import { assertCodingSameOrigin } from "./server-access";

export async function requireNativeArticleCoding(request: Request, userId: string, courseId: string) {
  const raw = request.headers.get(nativeArticleCodingHeader);
  if (raw === null) return null;
  assertCodingSameOrigin(request);
  if (raw.length > 2048) throw new Error("CODING_INVALID_SURFACE");
  try {
    const scope = nativeArticleCodingScope.parse(JSON.parse(decodeURIComponent(raw)));
    const { loadNativePublishedReading } = await import("@/lib/student/native-published-reading");
    const reading = await loadNativePublishedReading(userId, { courseId, materialId: scope.materialId }, new URL(resolveAuthBaseUrl()).origin);
    if (reading.kind !== "article" || !reading.structured || reading.codingMode !== "native" ||
      reading.revision !== scope.revision || !("sections" in reading.data)) throw new Error();
    const section = reading.data.sections.find(entry => entry.id === scope.sectionId);
    const matches = sectionCodingParts(section?.blocks ?? []);
    const part = matches.find(entry => entry.part.id === scope.partId)?.part;
    if (!part) throw new Error();
    const { id: articleId, version: articleVersion } = reading.data;
    return { part, draftKey: articleCodingDraftKey(articleId, articleVersion, part),
      surface: { kind: "article" as const, articleId, articleVersion, partId: part.id } };
  } catch { throw new Error("CODING_FORBIDDEN"); }
}

export function assertNativeArticleProblem(
  article: Awaited<ReturnType<typeof requireNativeArticleCoding>>,
  problem: { problemId: string; version: number },
  surface: { kind: string; articleId?: string; articleVersion?: number; partId?: string } | null,
) {
  if (!article) return;
  if (article.part.kind !== "coding_exercise" || article.part.problem.problemId !== problem.problemId ||
    article.part.problem.version !== problem.version || surface?.kind !== "article" ||
    surface.articleId !== article.surface.articleId || surface.articleVersion !== article.surface.articleVersion ||
    surface.partId !== article.surface.partId) throw new Error("CODING_INVALID_SURFACE");
}
