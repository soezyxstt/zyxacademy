import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { artikel, bagianArtikel, blokArtikel } from "@/db/schema";
import {
  formativeCheckPayloadSchema,
  type FormativeCheckPayload,
} from "@/lib/materials/pedagogy-contract";
import {
  formativeLearnerResponseSchema,
  type FormativeLearnerResponse,
} from "@/lib/materials/formative-evaluation";

export const formativeCheckLocatorSchema = z.object({
  articleId: z.string().trim().min(1),
  articleVersion: z.number().int().positive(),
  sectionId: z.string().trim().min(1),
  blockId: z.string().trim().min(1),
}).strict();

export const formativeCheckEvaluationRequestSchema = formativeCheckLocatorSchema.extend({
  response: formativeLearnerResponseSchema,
}).strict();

export type FormativeCheckLocator = z.infer<typeof formativeCheckLocatorSchema>;
export type FormativeCheckEvaluationRequest = z.infer<typeof formativeCheckEvaluationRequestSchema>;

export interface CanonicalFormativeCheckContext {
  article: {
    id: string;
    courseId: string;
    title: string;
    version: number;
  };
  section: {
    id: string;
    title: string;
    learningObjective: string;
  };
  block: {
    id: string;
    blockType: string;
    content: string;
  };
  formativeCheck: FormativeCheckPayload;
}

export type FormativeCheckResolution =
  | { ok: true; context: CanonicalFormativeCheckContext }
  | {
      ok: false;
      code: "ARTICLE_NOT_FOUND" | "VERSION_MISMATCH" | "SECTION_NOT_FOUND" | "BLOCK_NOT_FOUND" | "BLOCK_NOT_FORMATIVE" | "PAYLOAD_INVALID";
    };

function decodeBlockPayload(content: string): { content: string; payload: unknown } {
  const marker = /<!--__ZYX_V3_BLOCK_PAYLOAD__:([A-Za-z0-9_-]+)-->/;
  const match = content.match(marker);
  if (!match) return { content, payload: undefined };

  try {
    const parsed: unknown = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
    const payload = parsed && typeof parsed === "object" && "formativeCheckPayload" in parsed
      ? (parsed as { formativeCheckPayload?: unknown }).formativeCheckPayload
      : undefined;
    return {
      content: content.replace(marker, "").trim(),
      payload,
    };
  } catch {
    return { content: content.replace(marker, "").trim(), payload: undefined };
  }
}

export async function resolvePublishedFormativeCheck(
  locator: FormativeCheckLocator,
): Promise<FormativeCheckResolution> {
  const [article] = await db
    .select({
      id: artikel.id,
      courseId: artikel.mataKuliahId,
      title: artikel.title,
      version: artikel.version,
      structureStatus: artikel.structureStatus,
    })
    .from(artikel)
    .where(and(eq(artikel.id, locator.articleId), eq(artikel.status, "published")))
    .limit(1);

  if (!article || article.structureStatus !== "structured") return { ok: false, code: "ARTICLE_NOT_FOUND" };
  if (article.version !== locator.articleVersion) return { ok: false, code: "VERSION_MISMATCH" };

  const [section] = await db
    .select({
      id: bagianArtikel.id,
      title: bagianArtikel.title,
      learningObjective: bagianArtikel.learningObjective,
    })
    .from(bagianArtikel)
    .where(and(
      eq(bagianArtikel.id, locator.sectionId),
      eq(bagianArtikel.artikelId, article.id),
      eq(bagianArtikel.version, article.version),
      eq(bagianArtikel.status, "published"),
    ))
    .limit(1);

  if (!section) return { ok: false, code: "SECTION_NOT_FOUND" };

  const [block] = await db
    .select({
      id: blokArtikel.id,
      blockType: blokArtikel.blockType,
      content: blokArtikel.content,
    })
    .from(blokArtikel)
    .where(and(
      eq(blokArtikel.id, locator.blockId),
      eq(blokArtikel.artikelId, article.id),
      eq(blokArtikel.bagianArtikelId, section.id),
      eq(blokArtikel.version, article.version),
      eq(blokArtikel.status, "published"),
    ))
    .limit(1);

  if (!block) return { ok: false, code: "BLOCK_NOT_FOUND" };
  if (block.blockType !== "retrieval_prompt" && block.blockType !== "retrieval_close") {
    return { ok: false, code: "BLOCK_NOT_FORMATIVE" };
  }

  const decoded = decodeBlockPayload(block.content);
  const formativeCheck = formativeCheckPayloadSchema.safeParse(decoded.payload);
  if (!formativeCheck.success) return { ok: false, code: "PAYLOAD_INVALID" };

  return {
    ok: true,
    context: {
      article: {
        id: article.id,
        courseId: article.courseId,
        title: article.title,
        version: article.version,
      },
      section: {
        id: section.id,
        title: section.title,
        learningObjective: section.learningObjective?.trim() ?? "",
      },
      block: {
        id: block.id,
        blockType: block.blockType,
        content: decoded.content,
      },
      formativeCheck: formativeCheck.data,
    },
  };
}

export function responseKindForCheckKind(checkKind: FormativeCheckPayload["checkKind"]): FormativeLearnerResponse["kind"] {
  switch (checkKind) {
    case "multiple_choice":
      return "choice";
    case "short_answer":
      return "text";
    case "numeric_answer":
      return "numeric";
    case "conceptual_explanation":
      return "conceptual";
  }
}
