import { z } from "zod";
import { articlePartsSchema } from "./article-parts";
import { inspectPayloadSecurity, visualSpecSchema, visualStaticFallbackSchema } from "./visual-contract";

const previewSourceFigure = z.object({
  id: z.string().min(1), kind: z.literal("source_figure"), label: z.string().min(1), description: z.string().min(1),
  interactive: z.literal(false), assetId: z.string().regex(/^[a-f0-9]{64}$/), captionMarkdown: z.string().optional(), staticFallback: visualStaticFallbackSchema,
  asset: z.object({ assetId: z.string().regex(/^[a-f0-9]{64}$/), imageUrl: z.string().max(30_000_000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/), attribution: z.string().max(2000), width: z.number().int().positive().max(12000), height: z.number().int().positive().max(12000) }).strict(),
}).strict().superRefine((value, context) => { if (!inspectPayloadSecurity(value).safe) context.addIssue({ code: "custom", message: "VERIFICATION_PREVIEW_UNSAFE" }); });
const previewVisual = z.union([previewSourceFigure, visualSpecSchema.refine((visual) => visual.kind !== "source_figure", "Use the verified preview-only source asset adapter")]);

export const verificationPreviewSchema = z.object({
  type: z.literal("zyx-verification-preview.v1"),
  title: z.string().max(500),
  sections: z.array(z.object({ id: z.string().min(1), title: z.string().max(500), blocks: z.array(z.object({ id: z.string().min(1), parts: articlePartsSchema }).strict()).max(200) }).strict()).max(200),
  visuals: z.array(previewVisual).max(100),
  visualId: z.string().optional(),
  documentScope: z.string().regex(/^[a-f0-9]{32}$/).optional(),
  formative: z.object({
    sectionId: z.string().min(1), blockId: z.string().min(1),
    parts: articlePartsSchema,
    check: z.object({ checkKind: z.enum(["multiple_choice", "short_answer", "numeric_answer", "conceptual_explanation"]), options: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) }).strict()).optional(), evaluationMode: z.enum(["choice", "text_exact", "numeric", "ai_rubric"]).nullable(), unit: z.string().optional(), feedbackPolicy: z.object({ hints: z.array(z.string()), allowRetry: z.boolean() }).strict().optional() }).strict(),
  }).strict().optional(),
}).strict();
export type VerificationPreview = z.infer<typeof verificationPreviewSchema>;
