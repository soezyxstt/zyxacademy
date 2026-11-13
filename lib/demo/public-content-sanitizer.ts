import type { PublicArticleReadModel, PublicVisualSpec } from "@/lib/articles/structured-read-model";
import type { ArticlePart } from "@/lib/materials/article-parts";
import { inspectPayloadSecurity, visualSpecSchema } from "@/lib/materials/visual-contract";

/** Content must already have passed the chapter and product eligibility checks. */
function sanitizeDemoMarkdownText(text: string): string {
  // Decode common obfuscation before removing destinations. Repeat for nested encoding.
  let value = text;
  for (let i = 0; i < 3; i++) {
    value = value.replace(/&#(?:x([\da-f]+)|(\d+));?/gi, (_, hex, dec) => {
      const code = parseInt(hex ?? dec, hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }).replace(/&(colon|sol|period|tab|newline|amp|lt|gt);/gi, (_, name: string) => ({ colon: ":", sol: "/", period: ".", tab: " ", newline: " ", amp: "&", lt: "<", gt: ">" })[name.toLowerCase()] ?? "")
      .replace(/%([\da-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  }
  return value
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<(script|style|svg|iframe|object|video|audio|picture)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?[a-z][a-z0-9:-]*(?:\s[^<>]*)?\/?>/gi, "")
    .replace(/<\/?(?:img|script|style|iframe|object|embed|svg|video|audio|link|meta)\b[^>]*$/gi, "")
    .replace(/^\s*\[[^\]\n]+\]:[^\n]*(?:\n|$)/gm, "")
    .replace(/!?\[([^\]\n]*)\]\([^\n)]*(?:\)[^\n)]*)?\)/g, "$1")
    .replace(/!?\[([^\]\n]*)\]\[[^\]\n]*\]/g, "$1")
    .replace(/!\[([^\]\n]*)\]/g, "$1")
    .replace(/(?:https?\s*:\s*\/\s*\/|www\.)[^\s<>\])}]+/gi, "")
    .replace(/(?:data|javascript|vbscript|file|blob)\s*:[^\s<>\])}]*/gi, "")
    .replace(/(^|[\s("'])((?:\.{1,2}\/|\/\/|\/)[a-z0-9_~.%@+-][^\s<>\])}]*)/gi, "$1")
    .replace(/(^|[\s("'])[a-z0-9_.-]+\/(?:[^\s<>\])}]*\/)?[^\s<>\])}]+\.(?:pdf|png|jpe?g|gif|webp|svg|html?|json|zip|mp4)(?:\?[^\s<>\])}]*)?/gi, "$1");
}

export function sanitizeDemoMarkdown(text: string): string {
  const fences = /^ {0,3}(`{3,}|~{3,})zyx-visual[ \t]*\r?\n([\s\S]*?)^ {0,3}\1[ \t]*(?=\r?$)/gm;
  let result = "", cursor = 0;
  for (const match of text.matchAll(fences)) {
    result += sanitizeDemoMarkdownText(text.slice(cursor, match.index));
    let safe = false;
    if (match[2].length <= 128 * 1024) try {
      const parsed = visualSpecSchema.safeParse(JSON.parse(match[2]));
      safe = parsed.success && parsed.data.kind === "interactive_scene" && safeVisual(parsed.data);
    } catch { /* Invalid fences follow normal sanitization. */ }
    result += safe ? match[0] : sanitizeDemoMarkdownText(match[0]);
    cursor = match.index! + match[0].length;
  }
  return result + sanitizeDemoMarkdownText(text.slice(cursor));
}


/** Thrown when structural metadata cannot safely be exposed unchanged. */
export class DemoPublicContentMetadataError extends Error {
  constructor() {
    super("DEMO_PUBLIC_CONTENT_INVALID_METADATA");
    this.name = "DemoPublicContentMetadataError";
  }
}

function identifier(value: unknown): void {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || !/^[\p{L}\p{M}\p{N}_.:-]+$/u.test(value) || sanitizeDemoMarkdown(value) !== value || value === "." || value === ".." || /\.\./.test(value)) throw new DemoPublicContentMetadataError();
}
function optionalId(value: unknown): void { if (value !== null && value !== undefined) identifier(value); }
function ids(values: readonly string[] | undefined): void { values?.forEach(identifier); }
function number(value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000_000) throw new DemoPublicContentMetadataError();
}
function keep(value: object, keys: readonly string[]): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) delete (value as Record<string, unknown>)[key];
}
function time(value: PublicArticleReadModel["totalLearningTimeEstimate"]): void {
  if (!value) return;
  keep(value, ["readingMinutes", "examplesMinutes", "practiceMinutes", "totalMinutes"]);
  number(value.readingMinutes); number(value.examplesMinutes); number(value.practiceMinutes); number(value.totalMinutes);
}
function validatePart(part: ArticlePart): void {
  identifier(part.id);
  if (part.kind === "visual_ref") { keep(part, ["id", "kind", "visualId", "focusRefs"]); identifier(part.visualId); ids(part.focusRefs); }
  else if (part.kind === "markdown") keep(part, ["id", "kind", "markdown"]);
  else if (part.kind === "code_example" || part.kind === "coding_exercise") { /* discarded by sanitizePart */ }
  else if (part.kind === "math_unit") {
    keep(part, ["id", "kind", "latex", "layout", "relations", "meaningMarkdown", "conditionsMarkdown", "symbolDefinitions", "symbolRefs"]);
    if (part.layout !== undefined && !["statement", "derivation", "cases", "comparison"].includes(part.layout)) throw new DemoPublicContentMetadataError();
    ids(part.symbolRefs);
    part.relations?.forEach(r => { keep(r, ["id", "latex", "meaningMarkdown", "conditionsMarkdown", "conditionLatex"]); identifier(r.id); });
    part.symbolDefinitions?.forEach(s => { keep(s, ["id", "latex", "meaningMarkdown", "conditionsMarkdown"]); identifier(s.id); });
  } else if (part.kind === "worked_example") {
    keep(part, ["id", "kind", "title", "problemMarkdown", "steps", "verificationMarkdown"]);
    part.steps.forEach(step => { keep(step, ["id", "operationMarkdown", "reasonMarkdown", "conditionsMarkdown", "sourceElementRefs", "parts"]); identifier(step.id); ids(step.sourceElementRefs); step.parts.forEach(validatePart); });
  } else throw new DemoPublicContentMetadataError();
}
function validateMetadata(article: PublicArticleReadModel): void {
  keep(article, ["id", "courseId", "chapterId", "slug", "title", "courseTitle", "chapterTitle", "chapterNumber", "version", "sections", "totalEstimatedReadingMinutes", "totalLearningTimeEstimate", "visuals", "progress"]);
  identifier(article.id); identifier(article.courseId); optionalId(article.chapterId); identifier(article.slug);
  if (article.chapterNumber !== null) number(article.chapterNumber);
  number(article.version); number(article.totalEstimatedReadingMinutes); time(article.totalLearningTimeEstimate);
  article.progress = null;
  const checkVisualValue = (value: unknown): void => {
    if (typeof value === "number") number(value);
    else if (Array.isArray(value)) value.forEach(checkVisualValue);
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if ((key === "id" || key.endsWith("Id")) && typeof item === "string") identifier(item);
        checkVisualValue(item);
      }
    }
  };
  const checkVisuals = (visuals: PublicVisualSpec[] | undefined) => visuals?.forEach(v => { identifier(v.id); if (v.kind !== "source_figure") checkVisualValue(v); });
  checkVisuals(article.visuals);
  article.sections.forEach(section => {
    keep(section, ["id", "slug", "title", "sectionNumber", "sectionKind", "learningObjective", "estimatedReadingMinutes", "orderIndex", "parentSectionId", "blocks", "pedagogy", "learningTimeEstimate", "visuals"]);
    identifier(section.id); identifier(section.slug); identifier(section.sectionNumber); optionalId(section.parentSectionId);
    if (!["overview", "topic", "summary"].includes(section.sectionKind)) throw new DemoPublicContentMetadataError();
    number(section.estimatedReadingMinutes); number(section.orderIndex); time(section.learningTimeEstimate); checkVisuals(section.visuals);
    if (section.pedagogy) {
      keep(section.pedagogy, ["timeEstimate", "visualRequirement"]); time(section.pedagogy.timeEstimate);
      const requirement = section.pedagogy.visualRequirement;
      if (requirement) { keep(requirement, ["status", "visualIds", "reason"]); if (!["required", "not_required"].includes(requirement.status)) throw new DemoPublicContentMetadataError(); ids(requirement.visualIds); }
    }
    section.blocks.forEach(block => {
      keep(block, ["id", "blockKey", "blockType", "title", "orderIndex", "content", "parts", "visuals", "workedExample", "formativeCheck"]);
      identifier(block.id); identifier(block.blockKey); identifier(block.blockType); number(block.orderIndex); checkVisuals(block.visuals); block.parts?.forEach(validatePart);
      if (block.workedExample) { keep(block.workedExample, ["steps", "verification"]); block.workedExample.steps.forEach(step => { keep(step, ["stepIndex", "label", "explanation", "reason"]); number(step.stepIndex); }); }
      if (block.formativeCheck) {
        const check = block.formativeCheck; keep(check, ["checkKind", "options", "evaluationMode", "unit", "feedbackPolicy"]);
        identifier(check.checkKind); optionalId(check.evaluationMode);
        check.options?.forEach(option => { keep(option, ["id", "text"]); identifier(option.id); });
        if (check.feedbackPolicy) keep(check.feedbackPolicy, ["hints", "allowRetry"]);
      }
    });
  });
}

// Visuals are retained only if their entire spec is inert and contains no resource
// reference. Source figures always contain an unverified assetId and are withheld.
function safeVisual(visual: PublicVisualSpec): boolean {
  if (visual.kind === "source_figure" || !inspectPayloadSecurity(visual).safe || !visualSpecSchema.safeParse(visual).success) return false;
  const expressionFields = new Set(["x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "width", "height", "left", "right", "value"]);
  const check = (value: unknown, key = ""): boolean => {
    if (typeof value === "string") return visual.kind === "interactive_scene" && expressionFields.has(key) || sanitizeDemoMarkdownText(value) === value;
    if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) <= 1_000_000_000;
    if (Array.isArray(value)) return value.every(item => check(item));
    if (value && typeof value === "object") return Object.entries(value).every(([key, item]) => check(key) && check(item, key));
    return true;
  };
  return check(visual);
}

function sanitizePart(part: ArticlePart, allowed: Set<string>): ArticlePart {
  if (part.kind === "visual_ref") return allowed.has(part.visualId) ? { ...part, focusRefs: part.focusRefs?.slice() } : { id: part.id, kind: "markdown", markdown: "Visual belum tersedia." };
  if (part.kind === "coding_exercise" || part.kind === "code_example") return { id: part.id, kind: "markdown", markdown: "Latihan kode belum tersedia." };
  if (part.kind === "markdown") return { ...part, markdown: sanitizeDemoMarkdown(part.markdown) };
  if (part.kind === "math_unit") return {
    ...part,
    latex: part.latex === undefined ? undefined : sanitizeDemoMarkdown(part.latex),
    meaningMarkdown: sanitizeDemoMarkdown(part.meaningMarkdown),
    conditionsMarkdown: part.conditionsMarkdown === undefined ? undefined : sanitizeDemoMarkdown(part.conditionsMarkdown),
    relations: part.relations?.map(r => ({ ...r, latex: sanitizeDemoMarkdown(r.latex), conditionLatex: r.conditionLatex === undefined ? undefined : sanitizeDemoMarkdown(r.conditionLatex), meaningMarkdown: sanitizeDemoMarkdown(r.meaningMarkdown), conditionsMarkdown: r.conditionsMarkdown === undefined ? undefined : sanitizeDemoMarkdown(r.conditionsMarkdown) })),
    symbolDefinitions: part.symbolDefinitions?.map(s => ({ ...s, latex: sanitizeDemoMarkdown(s.latex), meaningMarkdown: sanitizeDemoMarkdown(s.meaningMarkdown), conditionsMarkdown: s.conditionsMarkdown === undefined ? undefined : sanitizeDemoMarkdown(s.conditionsMarkdown) })),
    symbolRefs: part.symbolRefs?.slice(),
  };
  return { ...part, title: sanitizeDemoMarkdown(part.title), problemMarkdown: sanitizeDemoMarkdown(part.problemMarkdown), verificationMarkdown: sanitizeDemoMarkdown(part.verificationMarkdown), steps: part.steps.map(step => ({ ...step, operationMarkdown: sanitizeDemoMarkdown(step.operationMarkdown), reasonMarkdown: sanitizeDemoMarkdown(step.reasonMarkdown), conditionsMarkdown: step.conditionsMarkdown === undefined ? undefined : sanitizeDemoMarkdown(step.conditionsMarkdown), sourceElementRefs: step.sourceElementRefs.slice(), parts: step.parts.map(p => sanitizePart(p, allowed) as typeof p) })) };
}

export function sanitizeDemoArticle(article: PublicArticleReadModel): PublicArticleReadModel {
  const clean = structuredClone(article);
  validateMetadata(clean);
  const visuals = [clean.visuals ?? [], ...clean.sections.flatMap(section => [section.visuals ?? [], ...section.blocks.map(block => block.visuals ?? [])])].flat();
  const allowed = new Set(visuals.filter(safeVisual).map(visual => visual.id));
  const filter = (items: PublicVisualSpec[] | undefined) => items?.filter(v => allowed.has(v.id) && safeVisual(v));
  clean.title = sanitizeDemoMarkdown(clean.title);
  clean.courseTitle = sanitizeDemoMarkdown(clean.courseTitle);
  if (clean.chapterTitle !== null) clean.chapterTitle = sanitizeDemoMarkdown(clean.chapterTitle);
  clean.visuals = filter(clean.visuals);
  clean.sections = clean.sections.map(section => ({
    ...section, title: sanitizeDemoMarkdown(section.title), learningObjective: sanitizeDemoMarkdown(section.learningObjective), visuals: filter(section.visuals),
    pedagogy: section.pedagogy ? { ...section.pedagogy, visualRequirement: section.pedagogy.visualRequirement ? { ...section.pedagogy.visualRequirement, reason: section.pedagogy.visualRequirement.reason === undefined ? undefined : sanitizeDemoMarkdown(section.pedagogy.visualRequirement.reason), visualIds: section.pedagogy.visualRequirement.visualIds?.filter(id => allowed.has(id)) } : undefined } : section.pedagogy,
    blocks: section.blocks.map(block => ({ ...block, title: block.title === null ? null : sanitizeDemoMarkdown(block.title), content: sanitizeDemoMarkdown(block.content), visuals: filter(block.visuals), parts: block.parts?.map(part => sanitizePart(part, allowed)),
      workedExample: block.workedExample ? { ...block.workedExample, verification: sanitizeDemoMarkdown(block.workedExample.verification), steps: block.workedExample.steps.map(step => ({ ...step, label: sanitizeDemoMarkdown(step.label), explanation: sanitizeDemoMarkdown(step.explanation), reason: sanitizeDemoMarkdown(step.reason) })) } : block.workedExample,
      formativeCheck: block.formativeCheck ? { ...block.formativeCheck, unit: block.formativeCheck.unit === undefined ? undefined : sanitizeDemoMarkdown(block.formativeCheck.unit), options: block.formativeCheck.options?.map(option => ({ ...option, text: sanitizeDemoMarkdown(option.text) })), feedbackPolicy: block.formativeCheck.feedbackPolicy ? { ...block.formativeCheck.feedbackPolicy, hints: block.formativeCheck.feedbackPolicy.hints.map(sanitizeDemoMarkdown) } : undefined } : block.formativeCheck,
    }))
  }));
  return clean;
}
