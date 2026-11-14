import { parseInteractiveDocumentsInMarkdown } from "./interactive-document-markdown";
import { publicQuizOptionTexts, canViewAttemptDiscussion } from "@/lib/quiz/review-release";
import { interactiveDocumentSchema, type InteractiveDocumentSpec } from "./interactive-document";
import { articlePartsSchema, flattenArticleParts } from "@/lib/materials/article-parts";

export function interactiveDocumentsInMarkdown(markdown: unknown): InteractiveDocumentSpec[] {
  try { return parseInteractiveDocumentsInMarkdown(markdown); } catch { return []; }
}

function hiddenDocumentConflict(markdown: unknown, spec: InteractiveDocumentSpec): boolean {
  try {
    return parseInteractiveDocumentsInMarkdown(markdown).some(hidden => hidden.documentSha256 === spec.documentSha256 || hidden.printSha256 === spec.printSha256);
  } catch { return true; }
}

/** Bind a published visual reference to both canonical content and its archived product. */
export function authorizeArticleDocument(input: {
  articleId: string; version: number; sectionId: string; blockId?: string; partId?: string; field: "visual_ref" | "markdown" | "content" | "section_visual"; visualId: string; hash: string; kind: "document" | "print";
  canonical: { id: string; version: number; sections: Array<{ id: string; sectionKey: string | null; pedagogy?: unknown }>; blocks: Array<{ id: string; bagianArtikelId: string | null; blockKey: string | null; content?: string; parts?: unknown }>; visuals: unknown[] };
  product: { id: string; version: number; visuals?: unknown[]; sections: Array<{ id: string; pedagogy?: unknown; blocks: Array<{ id: string; contentMarkdown?: string; parts?: unknown; formativeCheckPayload?: { answer?: string; explanation?: string } }> }> };
}): InteractiveDocumentSpec | null {
  const { canonical, product } = input;
  const productId = product.version === 1 ? product.id : `${product.id}:v${product.version}`;
  if (canonical.id !== input.articleId || canonical.version !== input.version || productId !== input.articleId || product.version !== input.version) return null;
  const section = canonical.sections.find((item) => item.id === input.sectionId);
  const sourceSection = product.sections.find((item) => item.id === section?.sectionKey);
  if (input.field === "section_visual") {
    if (input.blockId || input.partId || !section?.sectionKey || !sourceSection) return null;
    const ids = (value: unknown) => {
      if (!value || typeof value !== "object") return [];
      const requirement = (value as { visualRequirement?: { status?: unknown; visualIds?: unknown } }).visualRequirement;
      return requirement?.status === "required" && Array.isArray(requirement.visualIds) ? requirement.visualIds : [];
    };
    if (!ids(section.pedagogy).includes(input.visualId) || !ids(sourceSection.pedagogy).includes(input.visualId)) return null;
    const current = canonical.visuals.flatMap(value => { const parsed = interactiveDocumentSchema.safeParse(value); return parsed.success && parsed.data.id === input.visualId ? [parsed.data] : []; });
    const archived = (product.visuals ?? []).flatMap(value => { const parsed = interactiveDocumentSchema.safeParse(value); return parsed.success && parsed.data.id === input.visualId ? [parsed.data] : []; });
    if (current.length !== 1 || archived.length !== 1 || JSON.stringify(current[0]) !== JSON.stringify(archived[0])) return null;
    const spec = current[0];
    if ((input.kind === "document" ? spec.documentSha256 : spec.printSha256) !== input.hash) return null;
    if (product.sections.flatMap(item => item.blocks).some(item => hiddenDocumentConflict(item.formativeCheckPayload?.answer, spec) || hiddenDocumentConflict(item.formativeCheckPayload?.explanation, spec))) return null;
    return spec;
  }
  const block = canonical.blocks.find((item) => item.id === input.blockId && item.bagianArtikelId === section?.id);
  if (!section?.sectionKey || !block?.blockKey) return null;
  const sourceBlock = sourceSection?.blocks.find((item) => item.id === block.blockKey);
  if (!sourceBlock) return null;
  const findSpec = (values: unknown[] | undefined) => (values ?? []).flatMap((value) => {
    const parsed = interactiveDocumentSchema.safeParse(value);
    return parsed.success && parsed.data.id === input.visualId ? [parsed.data] : [];
  });
  let current: InteractiveDocumentSpec[];
  let archived: InteractiveDocumentSpec[];
  if (input.field === "content") {
    if (input.partId || (Array.isArray(block.parts) && block.parts.length > 0) || typeof block.content !== "string" || block.content !== sourceBlock.contentMarkdown) return null;
    current = interactiveDocumentsInMarkdown(block.content).filter((spec) => spec.id === input.visualId);
    archived = interactiveDocumentsInMarkdown(sourceBlock.contentMarkdown).filter((spec) => spec.id === input.visualId);
  } else {
    if (!input.partId) return null;
    const canonicalParts = articlePartsSchema.safeParse(block.parts);
    const sourceParts = articlePartsSchema.safeParse(sourceBlock.parts);
    if (!canonicalParts.success || !sourceParts.success) return null;
    const currentPart = flattenArticleParts(canonicalParts.data).find((part) => part.id === input.partId);
    const sourcePart = flattenArticleParts(sourceParts.data).find((part) => part.id === input.partId);
    if (input.field === "visual_ref") {
      if (currentPart?.kind !== "visual_ref" || sourcePart?.kind !== "visual_ref" || currentPart.visualId !== input.visualId || sourcePart.visualId !== input.visualId) return null;
      current = findSpec(canonical.visuals);
      archived = findSpec(product.visuals);
    } else {
      if (currentPart?.kind !== "markdown" || sourcePart?.kind !== "markdown" || currentPart.markdown !== sourcePart.markdown) return null;
      current = interactiveDocumentsInMarkdown(currentPart.markdown).filter((spec) => spec.id === input.visualId);
      archived = interactiveDocumentsInMarkdown(sourcePart.markdown).filter((spec) => spec.id === input.visualId);
    }
  }
  if (current.length !== 1 || archived.length !== 1 || JSON.stringify(current[0]) !== JSON.stringify(archived[0])) return null;
  const spec = current[0];
  if ((input.kind === "document" ? spec.documentSha256 : spec.printSha256) !== input.hash) return null;
  for (const item of product.sections.flatMap((item) => item.blocks)) {
    const hidden = item.formativeCheckPayload;
    if (hiddenDocumentConflict(hidden?.answer, spec) || hiddenDocumentConflict(hidden?.explanation, spec)) return null;
  }
  return spec;
}

export function authorizeDraftArticleDocument(input: {
  articleId: string; version: number; sectionId: string; blockId: string; partId?: string; field: "visual_ref" | "markdown" | "content"; visualId: string; hash: string; kind: "document" | "print";
  product: Parameters<typeof authorizeArticleDocument>[0]["product"];
}): InteractiveDocumentSpec | null {
  if (input.product.id !== input.articleId || input.product.version !== input.version) return null;
  const sourceSection = input.product.sections.find((section) => section.id === input.sectionId);
  const sourceBlock = sourceSection?.blocks.find((block) => block.id === input.blockId);
  if (!sourceSection || !sourceBlock) return null;
  const canonicalId = input.version === 1 ? input.articleId : `${input.articleId}:v${input.version}`;
  return authorizeArticleDocument({ ...input, articleId: canonicalId, canonical: { id: canonicalId, version: input.version, sections: [{ id: input.sectionId, sectionKey: input.sectionId }], blocks: [{ id: input.blockId, bagianArtikelId: input.sectionId, blockKey: input.blockId, content: sourceBlock.contentMarkdown, parts: sourceBlock.parts }], visuals: input.product.visuals ?? [] } });
}

type Template = Parameters<typeof canViewAttemptDiscussion>[0] & { courseId: string };

/** Resolves only a displayed field of the owner's immutable attempt snapshot. */
export function authorizeAttemptDocument(input: {
  userId: string; courseId: string; attemptId: string; questionId: string;
  field: "prompt" | "option" | "explanation"; option?: number;
  visualId: string; hash: string; kind: "document" | "print";
  attempt: { id: string; studentId: string; status: string; questionsSnapshot: unknown } | undefined;
  template: Template | undefined; now?: Date;
}): InteractiveDocumentSpec | null {
  const { attempt, template } = input;
  if (!attempt || !template || attempt.id !== input.attemptId || attempt.studentId !== input.userId || template.courseId !== input.courseId || !["in_progress", "completed"].includes(attempt.status) || !Array.isArray(attempt.questionsSnapshot)) return null;
  const matches = attempt.questionsSnapshot.filter((value): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).id === input.questionId);
  if (matches.length !== 1) return null;
  const question = matches[0];
  const released = canViewAttemptDiscussion(template, attempt.status, input.now);
  if (input.field === "explanation" && !released) return null;
  const options = publicQuizOptionTexts(question.options);
  const source = input.field === "prompt" ? question.prompt : input.field === "explanation" ? question.explanation : Number.isInteger(input.option) && input.option! >= 0 ? options[input.option!] : undefined;
  const found = interactiveDocumentsInMarkdown(source).filter((spec) => spec.id === input.visualId && (input.kind === "document" ? spec.documentSha256 : spec.printSha256) === input.hash);
  if (found.length !== 1) return null;
  if (!released && input.field !== "explanation" && attempt.questionsSnapshot.some((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    return hiddenDocumentConflict((entry as Record<string, unknown>).explanation, found[0]);
  })) return null;
  return found[0];
}
