import "server-only";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { nativeArticleCodingHeader, nativeArticleCodingScope } from "./native-article-contract";
import { assertCodingSameOrigin } from "./server-access";

export async function requireNativeArticleCoding(request: Request, userId: string, courseId: string) {
  const raw = request.headers.get(nativeArticleCodingHeader);
  if (raw === null) return null;
  assertCodingSameOrigin(request);
  if (raw.length > 6144) throw new Error("CODING_INVALID_SURFACE");
  try {
    const { articleCodingDraftKey, formativeMarkdownCodingParts, sectionCodingParts } = await import("./native-article-parts");
    const scope = nativeArticleCodingScope.parse(JSON.parse(decodeURIComponent(raw)));
    const { loadNativePublishedReading } = await import("@/lib/student/native-published-reading");
    const reading = await loadNativePublishedReading(userId, { courseId, materialId: scope.materialId }, new URL(resolveAuthBaseUrl()).origin);
    if (reading.kind !== "article" || !reading.structured || reading.codingMode !== "native" ||
      reading.revision !== scope.revision || !("sections" in reading.data)) throw new Error();
    const { id: articleId, version: articleVersion } = reading.data;
    const section = reading.data.sections.find(entry => entry.id === scope.sectionId);
    if (!section) throw new Error();
    let match;
    if (scope.revealGrant) {
      const { verifyFormativeCodingGrant, formativeCodingContentHash } = await import("./native-formative-coding-grant");
      const grant = verifyFormativeCodingGrant(scope.revealGrant, {
        userId, courseId, articleId, articleVersion, revision: scope.revision, sectionId: section.id,
      }, process.env.BETTER_AUTH_SECRET ?? "");
      const block = grant && section.blocks.find(entry => entry.id === grant.blockId);
      if (!block || !grant || !("formativeCheck" in block) || !block.formativeCheck) throw new Error();
      const { resolvePublishedFormativeCheck } = await import("@/lib/materials/formative-check-server");
      const resolved = await resolvePublishedFormativeCheck({ articleId, articleVersion, sectionId: section.id, blockId: block.id });
      if (!resolved.ok) throw new Error();
      const { resolveNativeStudentReadingAccess } = await import("@/lib/student/native-reading-access");
      const access = await resolveNativeStudentReadingAccess(userId, courseId);
      if (!access.hasFullContentAccess || resolved.context.article.courseId !== access.canonicalCourseId) throw new Error();
      const { formativeAnswerForReveal } = await import("@/lib/materials/formative-check-answer");
      const check = resolved.context.formativeCheck;
      const text = grant.field === "answer" ? formativeAnswerForReveal(check) : check.explanation;
      if (formativeCodingContentHash(text) !== grant.contentHash) throw new Error();
      const matches = formativeMarkdownCodingParts(text, section.id, block, grant.field).filter(entry => entry.part.id === scope.partId);
      if (matches.length !== 1) throw new Error();
      match = matches[0];
    } else {
      match = sectionCodingParts(section.blocks, section.id).find(entry => entry.part.id === scope.partId);
    }
    if (!match) throw new Error();
    const { part, namespace } = match;
    return { part, draftKey: articleCodingDraftKey(articleId, articleVersion, part, namespace),
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
