import { z } from "zod";

const id = z.string().min(1);
const positiveInteger = z.number().int().positive();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i, "must be a SHA-256 hex digest");
const timestamp = z.string().datetime({ offset: true });

export const productStatusSchema = z.enum(["draft", "published", "archived", "withdrawn"]);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const difficultySchema = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof difficultySchema>;

export const cognitiveLevelSchema = z.enum([
  "remember",
  "understand",
  "apply",
  "analyze",
  "evaluate",
  "create",
]);
export type CognitiveLevel = z.infer<typeof cognitiveLevelSchema>;

export const reasoningPatternSchema = z.enum([
  "procedural",
  "conceptual",
  "analytical",
  "direct_computation",
  "graph_interpretation",
  "proof",
  "parameter_analysis",
  "modeling",
  "other",
]);
export type ReasoningPattern = z.infer<typeof reasoningPatternSchema>;

export const ideaPublicationLinkSchema = z
  .object({
    ideaId: id,
    ideaVersion: positiveInteger,
    ideaStatus: z.literal("published"),
  })
  .strict();
export type IdeaPublicationLink = z.infer<typeof ideaPublicationLinkSchema>;

export const publishedIdeaLinksSchema = z
  .array(ideaPublicationLinkSchema)
  .min(1, "a published product requires at least one published Idea")
  .superRefine((links, ctx) => {
    const seen = new Set<string>();
    links.forEach((link, index) => {
      if (seen.has(link.ideaId)) {
        ctx.addIssue({ code: "custom", message: "Idea links must be unique", path: [index, "ideaId"] });
      }
      seen.add(link.ideaId);
    });
  });

const productFields = {
  id,
  version: positiveInteger,
  status: productStatusSchema,
  generationHash: sha256,
  dependencyHash: sha256,
  creatorId: id,
  curatorId: id.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
};

const productMetadataFields = {
  difficulty: difficultySchema,
  cognitiveLevel: cognitiveLevelSchema,
  reasoningPattern: reasoningPatternSchema,
  requiredIdeaRelations: z.array(
    z
      .object({
        relationType: z.enum(["prerequisite", "related", "extends", "example_of", "misconception_of"]),
        ideaId: id,
        required: z.boolean(),
      })
      .strict(),
  ),
};

function requirePublishedIdeas<T extends z.ZodRawShape>(shape: T) {
  // `publishedIdeaLinksSchema` is required in every published-product shape
  // below, so its `.min(1)` invariant is enforced during object parsing.
  return z.object({ ...productFields, ...shape }).strict();
}

export const artikelSchema = requirePublishedIdeas({
  title: z.string().min(1),
  content: z.string().min(1),
  ideaLinks: publishedIdeaLinksSchema,
});
export type Artikel = z.infer<typeof artikelSchema>;
export const publishedArticleSchema = artikelSchema;

export const diktatMateriSchema = requirePublishedIdeas({
  title: z.string().min(1),
  markdown: z.string().min(1),
  ideaLinks: publishedIdeaLinksSchema,
});
export type DiktatMateri = z.infer<typeof diktatMateriSchema>;
export const publishedDiktatSchema = diktatMateriSchema;

export const soalIdeaLinkSchema = z
  .object({
    ideaId: id,
    ideaVersion: positiveInteger,
    ideaStatus: z.literal("published"),
    weight: z.number().finite().positive(),
  })
  .strict();

export const soalIdeaLinksSchema = z
  .array(soalIdeaLinkSchema)
  .min(1)
  .superRefine((links, ctx) => {
    const sum = links.reduce((total, link) => total + link.weight, 0);
    if (Math.abs(sum - 1) > 0.000001) {
      ctx.addIssue({ code: "custom", message: "soal_ide weights must sum to 1 within 0.000001", path: ["weight"] });
    }
    const seen = new Set<string>();
    links.forEach((link, index) => {
      if (seen.has(link.ideaId)) {
        ctx.addIssue({ code: "custom", message: "soal_ide Idea links must be unique", path: [index, "ideaId"] });
      }
      seen.add(link.ideaId);
    });
  });

export const soalSchema = requirePublishedIdeas({
  prompt: z.string().min(1),
  ideaLinks: publishedIdeaLinksSchema,
  soalIde: soalIdeaLinksSchema,
  ...productMetadataFields,
});
export type Soal = z.infer<typeof soalSchema>;
export const publishedQuestionSchema = soalSchema;

export const pembahasanSoalSchema = requirePublishedIdeas({
  soalId: id,
  explanation: z.string().min(1),
  ideaLinks: publishedIdeaLinksSchema,
});
export type PembahasanSoal = z.infer<typeof pembahasanSoalSchema>;
export const solutionSchema = pembahasanSoalSchema;
export const publishedSolutionSchema = pembahasanSoalSchema;

export const referenceVisibilitySchema = z.enum(["allowed", "holdout"]);
export type ReferenceVisibility = z.infer<typeof referenceVisibilitySchema>;

export const protectedReferenceSchema = z
  .object({
    id,
    questionId: id,
    content: z.string().min(1),
    source: z.string().min(1),
    checksum: sha256,
    authoringVisibility: referenceVisibilitySchema,
  })
  .strict();

export const authoringReferenceSetSchema = z
  .array(protectedReferenceSchema)
  .superRefine((references, ctx) => {
    references.forEach((reference, index) => {
      if (reference.authoringVisibility === "holdout") {
        ctx.addIssue({ code: "custom", message: "holdout references cannot enter authoring context", path: [index, "authoringVisibility"] });
      }
    });
  });

export function visibleReferencesForAuthoring(references: readonly z.infer<typeof protectedReferenceSchema>[]) {
  return references.filter((reference) => reference.authoringVisibility === "allowed");
}

export const flashcardSchema = requirePublishedIdeas({
  front: z.string().min(1),
  back: z.string().min(1),
  ideaLinks: publishedIdeaLinksSchema,
  dueAt: timestamp.nullable(),
  lastReviewedAt: timestamp.nullable(),
  reviewCount: z.number().int().nonnegative(),
  intervalDays: z.number().finite().nonnegative(),
  easeFactor: z.number().finite().positive(),
});
export type Flashcard = z.infer<typeof flashcardSchema>;
export const publishedFlashcardSchema = flashcardSchema;

export const kemajuanFlashcardMuridSchema = z
  .object({
    muridId: id,
    flashcardId: id,
    dueAt: timestamp,
    lastReviewedAt: timestamp.nullable(),
    reviewCount: z.number().int().nonnegative(),
    intervalDays: z.number().finite().nonnegative(),
    easeFactor: z.number().finite().positive(),
  })
  .strict();

export const reviewFlashcardSchema = z
  .object({
    id,
    muridId: id,
    flashcardId: id,
    reviewedAt: timestamp,
    rating: z.enum(["again", "hard", "good", "easy"]),
    dueAtBefore: timestamp,
    dueAtAfter: timestamp,
  })
  .strict();

export function validateSoalIdeaWeights(links: unknown) {
  return soalIdeaLinksSchema.parse(links);
}
