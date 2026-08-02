import { z } from "zod";

const id = z.string().min(1);
const timestamp = z.string().datetime({ offset: true });
const boundedPercent = z.number().finite().min(0).max(100);

export const evidenceSourceSchema = z.enum(["answer", "flashcard_review", "material_completion", "tutor_assessment", "manual"]);
export const derivationStatusSchema = z.enum(["direct", "derived", "ambiguous", "invalidated"]);

export const buktiIdeJawabanSchema = z
  .object({
    id,
    answerId: id,
    ideaId: id,
    scoreContribution: z.number().finite(),
    weight: z.number().finite().nonnegative(),
    confidence: boundedPercent,
    evidenceSource: evidenceSourceSchema,
    rubricVersion: z.string().min(1),
    derivationStatus: derivationStatusSchema,
    affectsMastery: z.boolean(),
    createdAt: timestamp,
  })
  .strict()
  .superRefine((evidence, ctx) => {
    if (evidence.derivationStatus === "ambiguous" && evidence.affectsMastery) {
      ctx.addIssue({ code: "custom", message: "ambiguous evidence cannot affect mastery", path: ["affectsMastery"] });
    }
  });
export type BuktiIdeJawaban = z.infer<typeof buktiIdeJawabanSchema>;

export const buktiPembelajaranSchema = z
  .object({
    id,
    muridId: id,
    ideaId: id,
    scoreContribution: z.number().finite(),
    weight: z.number().finite().nonnegative(),
    confidence: boundedPercent,
    evidenceSource: evidenceSourceSchema,
    rubricVersion: z.string().min(1),
    derivationStatus: derivationStatusSchema,
    affectsMastery: z.boolean(),
    observedAt: timestamp,
  })
  .strict()
  .superRefine((evidence, ctx) => {
    if (evidence.derivationStatus === "ambiguous" && evidence.affectsMastery) {
      ctx.addIssue({ code: "custom", message: "ambiguous evidence cannot affect mastery", path: ["affectsMastery"] });
    }
  });

export const pemahamanIdeSchema = z
  .object({
    id,
    muridId: id,
    ideaId: id,
    skor: boundedPercent,
    keyakinan: boundedPercent,
    evidenceCount: z.number().int().nonnegative(),
    updatedAt: timestamp,
  })
  .strict();
export type PemahamanIde = z.infer<typeof pemahamanIdeSchema>;

export const perubahanPemahamanSchema = z
  .object({
    id,
    pemahamanId: id,
    previousScore: boundedPercent,
    nextScore: boundedPercent,
    previousConfidence: boundedPercent,
    nextConfidence: boundedPercent,
    evidenceId: id,
    changedAt: timestamp,
  })
  .strict();

export const rekomendasiFlashcardSchema = z
  .object({
    id,
    muridId: id,
    ideaId: id,
    flashcardId: id,
    reason: z.string().min(1),
    dueAt: timestamp,
    status: z.enum(["pending", "dismissed", "completed"]),
  })
  .strict();
