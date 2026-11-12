import { articlePartsSchema, materializeArticleParts, collectArticleVisualIds, validateArticlePartReferences, articlePartSearchEntries, type ArticlePart } from "@/lib/materials/article-parts";
import {
  inspectPayloadSecurity,
  epsilonDeltaGraphSpecSchema,
  learningCanvasVisualSpecSchema,
  geometry2dVisualSpecSchema,
  sourceFigureVisualSpecSchema,
  interactiveSceneVisualSpecSchema,
  type Geometry2dVisualSpec,
  type SourceFigureVisualSpec,
} from "@/lib/materials/visual-contract";
import type { InteractiveSceneSpec } from "@/lib/materials/interactive-scene";
import { interactiveDocumentSchema, type InteractiveDocumentSpec } from "@/lib/materials/interactive-document";
import { parseInteractiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-markdown";
import type { CanvasSpec } from "@/lib/zyra/canvas";
import {
  formativeCheckPayloadSchema,
  type FormativeCheckEvaluation,
  type FormativeCheckKind,
} from "@/lib/materials/pedagogy-contract";

export interface PublicWorkedExampleStep {
  stepIndex: number;
  label: string;
  explanation: string;
  reason: string;
}

export interface PublicWorkedExamplePayload {
  steps: PublicWorkedExampleStep[];
  verification: string;
}

export interface PublicFormativeCheckOption {
  id: string;
  text: string;
}

export interface PublicFormativeCheckPayload {
  checkKind: FormativeCheckKind;
  options?: PublicFormativeCheckOption[];
  evaluationMode: FormativeCheckEvaluation["mode"] | null;
  unit?: string;
  feedbackPolicy?: {
    hints: string[];
    allowRetry: boolean;
  };
}

export interface PublicEpsilonDeltaGraphSpec {
  id: string;
  kind: "epsilon_delta_graph";
  label: string;
  description: string;
  bounds: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
  staticFallback:
    | {
        type: "table";
        summary: string;
        headers: string[];
        rows: Array<Array<string | number>>;
      }
    | {
        type: "text";
        summary: string;
        content: string;
      };
  limitPoint: number;
  limitValue: number;
  defaultEpsilon: number;
  defaultDelta: number;
  functionModel:
    | { kind: "constant"; c: number }
    | { kind: "linear"; m: number; b: number }
    | { kind: "quadratic"; a: number; b: number; c: number };
}

export interface PublicLearningCanvasVisualSpec {
  id: string;
  kind: "learning_canvas";
  label: string;
  description: string;
  interactive: boolean;
  canvas: CanvasSpec;
}

export type PublicGeometry2dVisualSpec = Geometry2dVisualSpec;
export type PublicSourceFigureVisualSpec = Omit<SourceFigureVisualSpec, "materialId" | "sourceChecksum"> & {
  asset?: { assetId: string; imageUrl: string; attribution: string; width: number; height: number };
};
export type PublicVisualSpec = PublicEpsilonDeltaGraphSpec | PublicLearningCanvasVisualSpec | PublicGeometry2dVisualSpec | PublicSourceFigureVisualSpec | InteractiveSceneSpec | InteractiveDocumentSpec;

export interface PublicLearningTimeEstimate {
  readingMinutes: number;
  examplesMinutes: number;
  practiceMinutes: number;
  totalMinutes: number;
}

export interface PublicSectionPedagogy {
  timeEstimate: PublicLearningTimeEstimate;
  visualRequirement?: {
    status: "required" | "not_required";
    visualIds?: string[];
    reason?: string;
  };
}

export interface PublicBlockReadModel {
  id: string;
  blockKey: string;
  blockType: string;
  title: string | null;
  orderIndex: number;
  content: string;
  parts?: ArticlePart[];
  visuals?: PublicVisualSpec[];
  workedExample?: PublicWorkedExamplePayload | null;
  formativeCheck?: PublicFormativeCheckPayload | null;
}

export interface PublicSectionReadModel {
  id: string;
  slug: string;
  title: string;
  sectionNumber: string;
  sectionKind: "overview" | "topic" | "summary";
  learningObjective: string;
  estimatedReadingMinutes: number;
  orderIndex: number;
  parentSectionId: string | null;
  blocks: PublicBlockReadModel[];
  pedagogy?: PublicSectionPedagogy | null;
  learningTimeEstimate?: PublicLearningTimeEstimate;
  visuals?: PublicVisualSpec[];
}

export interface SectionProgressDetail {
  maxReadPercent: number;
  completed: boolean;
  timeSpentSeconds: number;
  lastReadAt?: string | null;
}

export interface PublicArticleProgress {
  completed: boolean;
  overallPercent: number;
  lastSectionSlug: string | null;
  sectionProgress: Record<string, SectionProgressDetail>;
}

export interface PublicArticleReadModel {
  id: string;
  courseId: string;
  chapterId: string | null;
  slug: string;
  title: string;
  courseTitle: string;
  chapterTitle: string | null;
  chapterNumber: number | null;
  version: number;
  sections: PublicSectionReadModel[];
  totalEstimatedReadingMinutes: number;
  totalLearningTimeEstimate?: PublicLearningTimeEstimate;
  visuals?: PublicVisualSpec[];
  progress?: PublicArticleProgress | null;
}

export interface SearchMatchResult {
  sectionId: string;
  sectionSlug: string;
  sectionTitle: string;
  sectionNumber: string;
  snippet: string;
  matchType: "title" | "objective" | "block";
  blockTitle?: string | null;
  elementId?: string;
}

/**
 * Deterministically computes section numbers (e.g., 1, 2, 3 or hierarchical 1.1, 1.2).
 */
export function computeDeterministicSectionNumbering<
  T extends { id: string; orderIndex: number; parentSectionId?: string | null; sectionKind?: "overview" | "topic" | "summary" | string },
>(sections: readonly T[], chapterNumber?: number): Map<string, string> {
  const numberMap = new Map<string, string>();
  if (!sections || sections.length === 0) return numberMap;

  // Separate root sections vs child sections
  const roots: T[] = [];
  const childrenByParent = new Map<string, T[]>();
  const sectionIds = new Set(sections.map((s) => s.id));

  for (const s of sections) {
    if (s.parentSectionId && sectionIds.has(s.parentSectionId)) {
      const existing = childrenByParent.get(s.parentSectionId) ?? [];
      existing.push(s);
      childrenByParent.set(s.parentSectionId, existing);
    } else {
      roots.push(s);
    }
  }

  // Sort roots by orderIndex then id
  roots.sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));

  const numberedRoots = roots.filter((root) => !chapterNumber || !root.sectionKind || root.sectionKind === "topic");
  const visitChildren = (parent: T, parentNumber: string, depth: number): void => {
    if (depth >= (chapterNumber ? 2 : 3)) return;
    const children = [...(childrenByParent.get(parent.id) ?? [])].sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));
    children.forEach((child, childIdx) => {
      const childNumber = `${parentNumber}.${childIdx + 1}`;
      numberMap.set(child.id, childNumber);
      visitChildren(child, childNumber, depth + 1);
    });
  };

  roots.forEach((root) => {
    if (chapterNumber && root.sectionKind === "overview") {
      numberMap.set(root.id, "Ikhtisar");
      return;
    }
    if (chapterNumber && root.sectionKind === "summary") {
      numberMap.set(root.id, "Ringkasan");
      return;
    }
    const rootIdx = numberedRoots.findIndex((candidate) => candidate.id === root.id);
    const rootNumber = chapterNumber ? `${chapterNumber}.${rootIdx + 1}` : String(rootIdx + 1);
    numberMap.set(root.id, rootNumber);
    visitChildren(root, rootNumber, 1);
  });

  // Safety fallback for any unvisited sections
  sections.forEach((s, idx) => {
    if (!numberMap.has(s.id)) {
      numberMap.set(s.id, String(idx + 1));
    }
  });

  return numberMap;
}

/**
 * Resolves the currently active section from URL slug or last read progress,
 * falling back to the first available section.
 */
export function resolveActiveSection(
  sections: readonly PublicSectionReadModel[],
  requestedSlug?: string | null,
  lastReadSlug?: string | null,
): PublicSectionReadModel | null {
  if (!sections || sections.length === 0) return null;

  if (requestedSlug) {
    const normalizedReq = requestedSlug.trim().toLowerCase();
    const found = sections.find((s) => s.slug.toLowerCase() === normalizedReq);
    if (found) return found;
  }

  if (lastReadSlug) {
    const normalizedLast = lastReadSlug.trim().toLowerCase();
    const found = sections.find((s) => s.slug.toLowerCase() === normalizedLast);
    if (found) return found;
  }

  return sections[0];
}

/**
 * Extracts a clean snippet around a search match.
 */
function extractSnippet(text: string, query: string, maxLength = 140): string {
  const lowerText = normalizeSearchText(text);
  const lowerQuery = normalizeSearchText(query);
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return text.slice(0, maxLength).trim() + (text.length > maxLength ? "..." : "");
  }

  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + query.length + 80);
  let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();

  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";

  return snippet;
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("id-ID");
}

/**
 * Searches sections and blocks for matching queries within an article.
 */
export function searchArticleContent(
  sections: readonly PublicSectionReadModel[],
  query: string,
): SearchMatchResult[] {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2 || !sections) return [];

  const lowerQuery = normalizeSearchText(trimmed);
  const results: SearchMatchResult[] = [];

  for (const section of sections) {
    // Check section title
    if (normalizeSearchText(section.title).includes(lowerQuery)) {
      results.push({
        sectionId: section.id,
        sectionSlug: section.slug,
        sectionTitle: section.title,
        sectionNumber: section.sectionNumber,
        snippet: section.title,
        matchType: "title",
      });
      continue;
    }

    // Check section learning objective
    if (section.learningObjective && normalizeSearchText(section.learningObjective).includes(lowerQuery)) {
      results.push({
        sectionId: section.id,
        sectionSlug: section.slug,
        sectionTitle: section.title,
        sectionNumber: section.sectionNumber,
        snippet: extractSnippet(section.learningObjective, trimmed),
        matchType: "objective",
      });
      continue;
    }

    // Check section blocks
    for (const block of section.blocks) {
      if (block.title && normalizeSearchText(block.title).includes(lowerQuery)) {
        results.push({
          sectionId: section.id,
          sectionSlug: section.slug,
          sectionTitle: section.title,
          sectionNumber: section.sectionNumber,
          snippet: block.title,
          matchType: "block",
          blockTitle: block.title,
        });
        break;
      }

      const partMatch = block.parts ? articlePartSearchEntries(block.parts).find((entry) => normalizeSearchText(entry.text).includes(lowerQuery)) : undefined;
      if (partMatch) {
        results.push({ sectionId: section.id, sectionSlug: section.slug, sectionTitle: section.title, sectionNumber: section.sectionNumber, snippet: extractSnippet(partMatch.text, trimmed), matchType: "block", blockTitle: block.title, elementId: partMatch.id });
        break;
      }

      if (block.content && normalizeSearchText(block.content).includes(lowerQuery)) {
        // Strip markdown code fences or symbols for cleaner snippet preview
        const cleanContent = block.content.replace(/[`#*_~]/g, " ");
        results.push({
          sectionId: section.id,
          sectionSlug: section.slug,
          sectionTitle: section.title,
          sectionNumber: section.sectionNumber,
          snippet: extractSnippet(cleanContent, trimmed),
          matchType: "block",
          blockTitle: block.title,
        });
        break;
      }
    }
  }

  return results;
}

/**
 * Sanitizes a worked example payload. Returns null if invalid or unsafe.
 */
export function sanitizeWorkedExample(payload: unknown): PublicWorkedExamplePayload | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.steps) || typeof p.verification !== "string" || !p.verification.trim()) return null;

  const secCheck = inspectPayloadSecurity(payload);
  if (!secCheck.safe) return null;

  const steps: PublicWorkedExampleStep[] = [];
  for (let i = 0; i < p.steps.length; i++) {
    const s = p.steps[i];
    if (!s || typeof s !== "object") return null;
    const item = s as Record<string, unknown>;
    if (
      typeof item.stepIndex !== "number" ||
      typeof item.label !== "string" ||
      typeof item.explanation !== "string" ||
      typeof item.reason !== "string" ||
      !item.label.trim() ||
      !item.explanation.trim() ||
      !item.reason.trim()
    ) {
      return null;
    }
    steps.push({
      stepIndex: item.stepIndex,
      label: item.label.trim(),
      explanation: item.explanation.trim(),
      reason: item.reason.trim(),
    });
  }

  // Contiguity check
  const sorted = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].stepIndex !== i) return null;
  }

  return {
    steps: sorted,
    verification: p.verification.trim(),
  };
}

/**
 * Sanitizes a formative check payload. Returns null if invalid or unsafe.
 */
export function sanitizeFormativeCheck(payload: unknown): PublicFormativeCheckPayload | null {
  if (!payload || typeof payload !== "object") return null;

  const secCheck = inspectPayloadSecurity(payload);
  if (!secCheck.safe) return null;

  const parsed = formativeCheckPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;

  const options = parsed.data.options?.map((option) => ({
    id: option.id,
    text: option.text,
  }));

  return {
    checkKind: parsed.data.checkKind,
    options: options && options.length > 0 ? options : undefined,
    evaluationMode: parsed.data.evaluation?.mode ?? null,
    unit: parsed.data.evaluation?.mode === "numeric" ? parsed.data.evaluation.unit : undefined,
    feedbackPolicy: parsed.data.feedbackPolicy
      ? {
          hints: [...parsed.data.feedbackPolicy.hints],
          allowRetry: parsed.data.feedbackPolicy.allowRetry,
        }
      : undefined,
  };
}

/**
 * Sanitizes a visual specification. Only the legacy epsilon graph and the
 * application-owned bounded Learning Canvas are exposed to learners.
 */
export function sanitizeVisualSpec(payload: unknown): PublicVisualSpec | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  const secCheck = inspectPayloadSecurity(payload);
  if (!secCheck.safe) return null;

  if (p.kind === "interactive_document") {
    const document = interactiveDocumentSchema.safeParse(payload);
    return document.success ? document.data : null;
  }

  if (p.kind === "interactive_scene") {
    const scene = interactiveSceneVisualSpecSchema.safeParse(payload);
    return scene.success ? scene.data : null;
  }

  if (p.kind === "geometry_2d") {
    const geometry = geometry2dVisualSpecSchema.safeParse(payload);
    return geometry.success ? geometry.data : null;
  }
  if (p.kind === "source_figure") {
    const figure = sourceFigureVisualSpecSchema.safeParse(payload);
    if (!figure.success) return null;
    const { materialId: _materialId, sourceChecksum: _sourceChecksum, ...publicFigure } = figure.data;
    return publicFigure;
  }

  if (p.kind === "learning_canvas") {
    const parsedCanvas = learningCanvasVisualSpecSchema.safeParse(payload);
    if (!parsedCanvas.success) return null;
    const data = parsedCanvas.data;
    return {
      id: data.id,
      kind: "learning_canvas",
      label: data.label,
      description: data.description,
      interactive: data.interactive,
      canvas: data.canvas,
    };
  }

  if (p.kind !== "epsilon_delta_graph") return null;
  const parsed = epsilonDeltaGraphSpecSchema.safeParse(payload);
  if (!parsed.success) return null;

  const data = parsed.data;
  return {
    id: data.id,
    kind: "epsilon_delta_graph",
    label: data.label,
    description: data.description,
    bounds: {
      xMin: data.bounds.xMin,
      xMax: data.bounds.xMax,
      yMin: data.bounds.yMin,
      yMax: data.bounds.yMax,
    },
    staticFallback: data.staticFallback,
    limitPoint: data.limitPoint,
    limitValue: data.limitValue,
    defaultEpsilon: data.defaultEpsilon,
    defaultDelta: data.defaultDelta,
    functionModel: data.functionModel,
  };
}

/**
 * Pure function to build a sanitized, serializable public article read model.
 * Strictly redacts all internal Idea/source/provenance/hash/identity fields.
 */
export function buildPublicArticleReadModel(
  rawArticle: {
    id: string;
    mataKuliahId?: string;
    courseId?: string;
    babId?: string | null;
    slug: string;
    title: string;
    version: number;
    status?: string;
    visuals?: unknown[];
    [key: string]: unknown;
  },
  rawSections: Array<{
    id: string;
    artikelId?: string;
    parentSectionId?: string | null;
    sectionKind?: "overview" | "topic" | "summary" | string;
    slug: string;
    title: string;
    learningObjective?: string | null;
    orderIndex?: number | null;
    estimatedReadingMinutes?: number | null;
    version?: number;
    status?: string;
    pedagogy?: unknown;
    visuals?: unknown[];
    [key: string]: unknown;
  }>,
  rawBlocks: Array<{
    id: string;
    bagianArtikelId?: string | null;
    blockKey?: string;
    blockType: string;
    title?: string | null;
    orderIndex?: number | null;
    content: string;
    version?: number;
    status?: string;
    workedExamplePayload?: unknown;
    formativeCheckPayload?: unknown;
    visualIds?: unknown;
    parts?: unknown;
    [key: string]: unknown;
  }>,
  rawProgress?: Array<{
    bagianArtikelId: string;
    maxReadPercent: number;
    timeSpentSeconds?: number | null;
    completedAt?: Date | string | null;
    lastReadAt?: Date | string | null;
    [key: string]: unknown;
  }> | null,
  chapter?: string | { id: string | null; title?: string | null; number?: number | null; courseTitle?: string | null } | null,
): PublicArticleReadModel {
  const chapterId = typeof chapter === "string" ? chapter : chapter?.id ?? rawArticle.babId ?? null;
  const chapterNumber = typeof chapter === "object" && chapter ? chapter.number ?? null : null;
  // Filter published sections only if status is present
  const validSections = (rawSections || [])
    .filter((s) => !s.status || s.status === "published")
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.id.localeCompare(b.id));

  // Compute numbering
  const sectionNumberMap = computeDeterministicSectionNumbering(
    validSections.map((s, idx) => ({
      id: s.id,
      orderIndex: s.orderIndex ?? idx,
      parentSectionId: s.parentSectionId ?? null,
      sectionKind: s.sectionKind,
    })),
    chapterNumber ?? undefined,
  );

  // Filter published blocks only if status is present
  const validBlocks = (rawBlocks || [])
    .filter((b) => !b.status || b.status === "published")
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.id.localeCompare(b.id));
  // A visual shared with an answer is hidden everywhere until the reveal endpoint grants it.
  const hiddenHashes = new Set<string>();
  const hiddenIds = new Set<string>();
  let unknownHiddenVisual = false;
  for (const block of rawBlocks) {
    const payload = block.formativeCheckPayload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const answer = payload as Record<string, unknown>;
    for (const field of [answer.answer, answer.explanation]) {
      try {
        for (const spec of parseInteractiveDocumentsInMarkdown(field)) {
          hiddenHashes.add(spec.documentSha256);
          hiddenHashes.add(spec.printSha256);
        }
      } catch { unknownHiddenVisual = true; }
    }
  }
  const hiddenVisual = (visual: PublicVisualSpec) => visual.kind === "interactive_document" &&
    (unknownHiddenVisual || hiddenHashes.has(visual.documentSha256) || hiddenHashes.has(visual.printSha256));
  for (const raw of [...(rawArticle.visuals ?? []), ...validSections.flatMap(section => section.visuals ?? [])]) {
    const visual = sanitizeVisualSpec(raw);
    if (visual && hiddenVisual(visual)) hiddenIds.add(visual.id);
  }
  function redact<T>(value: T): T {
    if (typeof value === "string") {
      let hiddenDocument = false;
      try {
        hiddenDocument = parseInteractiveDocumentsInMarkdown(value).some(spec => unknownHiddenVisual || hiddenHashes.has(spec.documentSha256) || hiddenHashes.has(spec.printSha256));
      } catch {
        hiddenDocument = unknownHiddenVisual || hiddenHashes.size > 0;
      }
      return (hiddenDocument || [...hiddenHashes].some(hash => value.includes(hash)) ? "Visual tidak tersedia." : value) as T;
    }
    if (Array.isArray(value)) return value.map(redact) as T;
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      if (object.kind === "visual_ref" && typeof object.visualId === "string" && hiddenIds.has(object.visualId)) return { id: object.id, kind: "markdown", markdown: "Visual tidak tersedia." } as T;
      return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, redact(item)])) as T;
    }
    return value;
  }
  const rawVisualIdsByBlock = new Map<string, string[]>();
  for (const block of validBlocks) {
    const ids = Array.isArray(block.visualIds)
      ? block.visualIds.filter((id): id is string => typeof id === "string")
      : [];
    rawVisualIdsByBlock.set(block.id, ids);
  }

  // Group blocks by section, sanitizing worked examples and formative checks
  const blocksBySection = new Map<string, PublicBlockReadModel[]>();
  for (const b of validBlocks) {
    if (!b.bagianArtikelId) continue;
    const existing = blocksBySection.get(b.bagianArtikelId) ?? [];

    const workedExample =
      b.blockType === "worked_example" ? sanitizeWorkedExample(b.workedExamplePayload) : null;
    const formativeCheck =
      b.blockType === "retrieval_prompt" || b.blockType === "retrieval_close"
        ? sanitizeFormativeCheck(b.formativeCheckPayload)
        : null;

    existing.push({
      id: b.id,
      blockKey: b.blockKey || `block-${b.id}`,
      blockType: b.blockType,
      title: b.title ?? null,
      orderIndex: b.orderIndex ?? 0,
      content: b.parts === undefined ? redact(b.content) : materializeArticleParts(redact(articlePartsSchema.parse(b.parts))),
      parts: b.parts === undefined ? undefined : redact(articlePartsSchema.parse(b.parts)),
      workedExample: workedExample ? redact(workedExample) : undefined,
      formativeCheck: formativeCheck ? redact(formativeCheck) : undefined,
    });
    blocksBySection.set(b.bagianArtikelId, existing);
  }

  // Sanitize article visuals
  const sanitizedArticleVisuals: PublicVisualSpec[] = [];
  if (Array.isArray(rawArticle.visuals)) {
    for (const v of rawArticle.visuals) {
      const sv = sanitizeVisualSpec(v);
      if (sv && !hiddenVisual(sv)) sanitizedArticleVisuals.push(sv);
    }
  }
  const visualMap = new Map(sanitizedArticleVisuals.map((v) => [v.id, v]));
  for (const sectionBlocks of blocksBySection.values()) {
    for (const block of sectionBlocks) {
      const partVisualIds = block.parts ? collectArticleVisualIds(block.parts) : undefined;
      if (partVisualIds?.some((id) => !visualMap.has(id))) throw new Error("ARTICLE_PART_VISUAL_UNAVAILABLE");
      const visuals = (partVisualIds ?? rawVisualIdsByBlock.get(block.id) ?? [])
        .map((id) => visualMap.get(id))
        .filter((visual): visual is PublicVisualSpec => Boolean(visual));
      if (visuals.length > 0) block.visuals = visuals;
    }
  }

  const partErrors = validateArticlePartReferences([...blocksBySection.values()].flatMap((blocks) => blocks.flatMap((block) => block.parts ?? [])), [...visualMap.keys()]);
  if (partErrors.length) throw new Error(partErrors.join(", "));

  // Build public sections
  const publicSections: PublicSectionReadModel[] = validSections.map((s, idx) => {
    const rawKind = s.sectionKind;
    const sectionKind: "overview" | "topic" | "summary" =
      rawKind === "overview" || rawKind === "summary" ? rawKind : "topic";

    const sectionBlocks = blocksBySection.get(s.id) ?? [];
    const workedCount = sectionBlocks.filter((b) => b.blockType === "worked_example").length;
    const practiceCount = sectionBlocks.filter(
      (b) => b.blockType === "retrieval_prompt" || b.blockType === "retrieval_close",
    ).length;

    const baseReadingMinutes =
      typeof s.estimatedReadingMinutes === "number" && s.estimatedReadingMinutes > 0
        ? s.estimatedReadingMinutes
        : 3;

    const rawPed = (s.pedagogy && typeof s.pedagogy === "object" ? s.pedagogy : null) as Record<
      string,
      unknown
    > | null;

    let learningTimeEstimate: PublicLearningTimeEstimate;
    if (rawPed?.timeEstimate && typeof rawPed.timeEstimate === "object") {
      const te = rawPed.timeEstimate as Record<string, unknown>;
      const r =
        typeof te.readingMinutes === "number" ? Math.max(0, te.readingMinutes) : baseReadingMinutes;
      const e =
        typeof te.examplesMinutes === "number"
          ? Math.max(0, te.examplesMinutes)
          : workedCount * 2;
      const p =
        typeof te.practiceMinutes === "number"
          ? Math.max(0, te.practiceMinutes)
          : practiceCount * 2;
      learningTimeEstimate = {
        readingMinutes: r,
        examplesMinutes: e,
        practiceMinutes: p,
        totalMinutes: r + e + p,
      };
    } else {
      learningTimeEstimate = {
        readingMinutes: baseReadingMinutes,
        examplesMinutes: workedCount * 2,
        practiceMinutes: practiceCount * 2,
        totalMinutes: baseReadingMinutes + workedCount * 2 + practiceCount * 2,
      };
    }

    let visualReq: PublicSectionPedagogy["visualRequirement"] = undefined;
    if (rawPed?.visualRequirement && typeof rawPed.visualRequirement === "object") {
      const vr = rawPed.visualRequirement as Record<string, unknown>;
      if (vr.status === "required" && Array.isArray(vr.visualIds)) {
        const visibleIds = vr.visualIds.filter((id): id is string => typeof id === "string" && !hiddenIds.has(id));
        if (visibleIds.length) visualReq = { status: "required", visualIds: visibleIds };
      } else if (vr.status === "not_required" && typeof vr.reason === "string") {
        visualReq = {
          status: "not_required",
          reason: vr.reason,
        };
      }
    }

    const sectionPedagogy: PublicSectionPedagogy = {
      timeEstimate: learningTimeEstimate,
      visualRequirement: visualReq,
    };

    // Attach section visuals
    const sectionVisuals: PublicVisualSpec[] = [];
    if (Array.isArray(s.visuals)) {
      for (const v of s.visuals) {
        const sv = sanitizeVisualSpec(v);
        if (sv && !hiddenVisual(sv)) sectionVisuals.push(sv);
      }
    }
    if (visualReq?.status === "required" && visualReq.visualIds) {
      for (const vid of visualReq.visualIds) {
        const matched = visualMap.get(vid);
        if (matched && !sectionVisuals.some((v) => v.id === matched.id)) {
          sectionVisuals.push(matched);
        }
      }
    }

    const blockVisualIds = new Set(sectionBlocks.flatMap((block) => (block.visuals ?? []).map((visual) => visual.id)));
    const standaloneVisuals = sectionVisuals.filter((visual) => !blockVisualIds.has(visual.id));

    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      sectionNumber: sectionNumberMap.get(s.id) || String(idx + 1),
      sectionKind,
      learningObjective: s.learningObjective || "",
      estimatedReadingMinutes: learningTimeEstimate.readingMinutes,
      orderIndex: s.orderIndex ?? idx,
      parentSectionId: s.parentSectionId ?? null,
      blocks: sectionBlocks,
      pedagogy: sectionPedagogy,
      learningTimeEstimate,
      visuals: standaloneVisuals.length > 0 ? standaloneVisuals : undefined,
    };
  });

  const totalEstimatedReadingMinutes = publicSections.reduce(
    (acc, s) => acc + s.estimatedReadingMinutes,
    0,
  );

  const totalReading = publicSections.reduce(
    (acc, s) => acc + (s.learningTimeEstimate?.readingMinutes ?? s.estimatedReadingMinutes),
    0,
  );
  const totalExamples = publicSections.reduce(
    (acc, s) => acc + (s.learningTimeEstimate?.examplesMinutes ?? 0),
    0,
  );
  const totalPractice = publicSections.reduce(
    (acc, s) => acc + (s.learningTimeEstimate?.practiceMinutes ?? 0),
    0,
  );
  const totalLearningTimeEstimate: PublicLearningTimeEstimate = {
    readingMinutes: totalReading,
    examplesMinutes: totalExamples,
    practiceMinutes: totalPractice,
    totalMinutes: totalReading + totalExamples + totalPractice,
  };

  // Compute progress if provided
  let progress: PublicArticleProgress | null = null;
  if (rawProgress && rawProgress.length > 0) {
    const sectionProgress: Record<string, SectionProgressDetail> = {};
    let mostRecentDate: number = 0;
    let lastSectionSlug: string | null = null;
    let completedCount = 0;

    const sectionSlugById = new Map(publicSections.map((s) => [s.id, s.slug]));

    for (const p of rawProgress) {
      const isCompleted = p.maxReadPercent >= 90 || Boolean(p.completedAt);
      if (isCompleted) completedCount++;
      const lastReadDate = p.lastReadAt ? new Date(p.lastReadAt).getTime() : 0;
      if (lastReadDate > mostRecentDate) {
        mostRecentDate = lastReadDate;
        lastSectionSlug = sectionSlugById.get(p.bagianArtikelId) ?? null;
      }

      sectionProgress[p.bagianArtikelId] = {
        maxReadPercent: Math.min(100, Math.max(0, p.maxReadPercent || 0)),
        completed: isCompleted,
        timeSpentSeconds: Math.max(0, p.timeSpentSeconds || 0),
        lastReadAt: p.lastReadAt ? new Date(p.lastReadAt).toISOString() : null,
      };
    }

    const totalSectionsCount = publicSections.length || 1;
    const overallPercent = Math.min(100, Math.round((completedCount / totalSectionsCount) * 100));
    const completed = completedCount >= totalSectionsCount;

    progress = {
      completed,
      overallPercent,
      lastSectionSlug,
      sectionProgress,
    };
  }

  const courseId = (rawArticle.courseId || rawArticle.mataKuliahId || "") as string;

  return {
    id: rawArticle.id,
    courseId,
    chapterId: chapterId ?? rawArticle.babId ?? null,
    slug: rawArticle.slug,
    title: typeof chapter === "object" && chapter ? chapter.title?.trim() || rawArticle.title : rawArticle.title,
    courseTitle: typeof chapter === "object" && chapter ? chapter.courseTitle ?? "" : "",
    chapterTitle: typeof chapter === "object" && chapter ? chapter.title ?? null : null,
    chapterNumber,
    version: rawArticle.version,
    sections: publicSections,
    totalEstimatedReadingMinutes: Math.max(1, totalEstimatedReadingMinutes),
    totalLearningTimeEstimate,
    visuals: sanitizedArticleVisuals.length > 0 ? sanitizedArticleVisuals : undefined,
    progress,
  };
}
