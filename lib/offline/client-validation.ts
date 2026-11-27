import { z } from "zod";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { formativeCheckKindSchema } from "@/lib/materials/pedagogy-contract";
import { articlePartsSchema } from "@/lib/materials/article-parts";
import { epsilonDeltaGraphSpecSchema, learningCanvasVisualSpecSchema, geometry2dVisualSpecSchema, interactiveSceneVisualSpecSchema, visualStaticFallbackSchema } from "@/lib/materials/visual-contract";
import { interactiveDocumentSchema } from "@/lib/materials/interactive-document";
import { offlineCursorSchema, offlineLocaleSchema, offlinePolicySchema, offlineResourceKindSchema, type OfflineManifestResponse, type OfflineResourceEnvelope, type OfflineSyncResponse } from "./sync-contract";

const id = z.string().min(1).max(1024);
const timestamp = z.number().int().nonnegative();
const identity = { protocolVersion: z.literal(1), accountId: id, sessionId: id, environment: z.string().url(), locale: offlineLocaleSchema };
export const offlineDescriptorSchema = z.object({ key: id, kind: offlineResourceKindSchema, id, courseId: id.nullable(), chapterIds: z.array(id), title: z.string(), revision: id, updatedAt: timestamp, estimatedBytes: timestamp });
const access = z.object({ courseId: id, allowed: z.boolean(), fullContent: z.boolean(), chapterIds: z.array(id), leaseExpiresAt: timestamp });
const enrollment = z.object({ id, title: z.string(), expiresAt: timestamp.nullable() });
export const offlineSyncResponseSchema: z.ZodType<OfflineSyncResponse> = z.object({
  ...identity, cursor: offlineCursorSchema, reset: z.boolean(), hasMore: z.boolean(), serverTime: timestamp, leaseExpiresAt: timestamp, policy: offlinePolicySchema,
  enrollments: z.array(enrollment), access: z.array(access),
  changes: z.array(z.object({ cursor: offlineCursorSchema, kind: z.enum(["article", "diktat", "course_outline", "video_catalog", "achievement_catalog", "enrollments", "course", "policy", "access"]), resourceId: id.nullable(), courseId: id.nullable(), action: z.enum(["upsert", "delete", "invalidate"]), revision: id.nullable() })),
});
export const offlineManifestResponseSchema: z.ZodType<OfflineManifestResponse> = z.object({ ...identity, cursor: offlineCursorSchema, serverTime: timestamp, leaseExpiresAt: timestamp, resource: access, resources: z.array(offlineDescriptorSchema) });
const timeEstimate = z.object({ readingMinutes: z.number(), examplesMinutes: z.number(), practiceMinutes: z.number(), totalMinutes: z.number() });
const visual = z.union([
  epsilonDeltaGraphSpecSchema, learningCanvasVisualSpecSchema, geometry2dVisualSpecSchema, interactiveSceneVisualSpecSchema, interactiveDocumentSchema,
  z.object({ id, kind: z.literal("source_figure"), label: z.string(), description: z.string(), interactive: z.literal(false), assetId: id, captionMarkdown: z.string().optional(), staticFallback: visualStaticFallbackSchema, asset: z.object({ assetId: id, imageUrl: z.string(), attribution: z.string(), width: z.number(), height: z.number() }).optional() }),
]);
const visuals = z.array(visual);
const workedExample = z.object({ steps: z.array(z.object({ stepIndex: z.number(), label: z.string(), explanation: z.string(), reason: z.string() })), verification: z.string() });
const articleSchema = z.object({
  id, courseId: id, chapterId: id.nullable(), slug: z.string(), title: z.string(), courseTitle: z.string(), chapterTitle: z.string().nullable(), chapterNumber: z.number().nullable(), version: z.number().int().positive(), totalEstimatedReadingMinutes: z.number(), totalLearningTimeEstimate: timeEstimate.optional(), visuals: visuals.optional(),
  sections: z.array(z.object({
    id, slug: z.string(), title: z.string(), sectionNumber: z.string(), sectionKind: z.enum(["overview", "topic", "summary"]), learningObjective: z.string(), estimatedReadingMinutes: z.number(), orderIndex: z.number(), parentSectionId: id.nullable(), visuals: visuals.optional(), learningTimeEstimate: timeEstimate.optional(),
    pedagogy: z.object({ timeEstimate, visualRequirement: z.object({ status: z.enum(["required", "not_required"]), visualIds: z.array(id).optional(), reason: z.string().optional() }).optional() }).nullable().optional(),
    blocks: z.array(z.object({ id, blockKey: z.string(), blockType: z.string(), title: z.string().nullable(), orderIndex: z.number(), content: z.string(), parts: articlePartsSchema.optional(), visuals: visuals.optional(), workedExample: workedExample.nullable().optional(), formativeCheck: z.object({ checkKind: formativeCheckKindSchema, options: z.array(z.object({ id, text: z.string() })).optional(), evaluationMode: z.enum(["choice", "text_exact", "numeric", "ai_rubric"]).nullable(), unit: z.string().optional(), feedbackPolicy: z.object({ hints: z.array(z.string()), allowRetry: z.boolean() }).optional() }).nullable().optional() })),
  })),
});
// Public projections are checked recursively, and unknown fields (including
// progress and assessment evaluation secrets) are discarded before persistence.
const publicArticleSchema = articleSchema as unknown as z.ZodType<PublicArticleReadModel>;
const dataSchemas = {
  article: publicArticleSchema,
  diktat: z.object({ id, courseId: id, title: z.string(), body: z.string(), docCategory: z.enum(["diktat", "materi"]), kind: z.literal("article"), contentVersion: z.number().int().nonnegative() }),
  course_outline: z.object({ id, title: z.string(), chapters: z.array(z.object({ id, title: z.string(), orderIndex: z.number() })), materials: z.array(offlineDescriptorSchema) }),
  video_catalog: z.object({ videos: z.array(z.object({ id, title: z.string(), videoUrl: z.string(), thumbnailUrl: z.string().nullable(), playlistId: id.nullable(), durationSeconds: z.number().nullable() })), playlists: z.array(z.object({ id, title: z.string() })) }),
  achievement_catalog: z.object({ achievements: z.array(z.object({ id, title: z.string(), description: z.string(), thresholds: z.array(z.number()), icon: z.string() })) }),
  enrollments: z.array(enrollment),
};
const envelope = z.object({ ...identity, resource: offlineDescriptorSchema, cursor: offlineCursorSchema, validatedAt: timestamp, leaseExpiresAt: timestamp, data: z.unknown(), assets: z.array(z.object({ url: z.string(), revision: z.string().optional(), required: z.boolean() })) });
export const offlineEnvelopeSchema = {
  parse(raw: unknown): OfflineResourceEnvelope {
    const parsed = envelope.parse(raw);
    const data = dataSchemas[parsed.resource.kind].parse(parsed.data);
    return { ...parsed, data };
  },
};
