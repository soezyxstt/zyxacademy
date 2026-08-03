import { z } from "zod";

const id = z.string().min(1);
const timestamp = z.string().datetime({ offset: true });
const checksum = z.string().regex(/^[a-f0-9]{64}$/i, "must be a SHA-256 hex digest");

export const bundleImportStatusSchema = z.enum(["received", "review", "approved", "rejected"]);
export type BundleImportStatus = z.infer<typeof bundleImportStatusSchema>;

export const imporBundleSchema = z
  .object({
    id,
    bundleId: id,
    version: z.number().int().positive(),
    checksum,
    status: bundleImportStatusSchema,
    importedAt: timestamp,
    approvedAt: timestamp.nullable(),
  })
  .strict()
  .superRefine((bundle, ctx) => {
    if (bundle.status === "approved" && bundle.approvedAt === null) {
      ctx.addIssue({ code: "custom", message: "an approved import requires approvedAt", path: ["approvedAt"] });
    }
  });
export type ImporBundle = z.infer<typeof imporBundleSchema>;

export const itemImporBundleSchema = z
  .object({
    id,
    importId: id,
    entityType: z.enum(["artikel", "diktat_materi", "soal", "pembahasan_soal", "flashcard"]),
    entityId: id,
    entityChecksum: checksum,
  })
  .strict();

export const uniqueBundleImportIdentitySchema = z.array(imporBundleSchema).superRefine((imports, ctx) => {
  const seen = new Set<string>();
  imports.forEach((bundle, index) => {
    const key = `${bundle.bundleId}:${bundle.checksum}`;
    if (seen.has(key)) {
      ctx.addIssue({ code: "custom", message: "bundleId plus checksum must be unique", path: [index, "checksum"] });
    }
    seen.add(key);
  });
});

export const reviewBundleSchema = z
  .object({
    id,
    importId: id,
    reviewerId: id,
    decision: z.enum(["approved", "rejected"]),
    reviewedAt: timestamp,
    notes: z.string().optional(),
  })
  .strict();

export const publikasiBundleSchema = z
  .object({
    id,
    bundleId: id,
    approvedImportId: id,
    approvedImportStatus: z.literal("approved"),
    publishedEntityIds: z.array(id).min(1),
    atomic: z.literal(true),
    publishedAt: timestamp,
  })
  .strict();
export type PublikasiBundle = z.infer<typeof publikasiBundleSchema>;

export const auditMutasiSchema = z
  .object({
    id,
    bundleId: id,
    actorId: id,
    action: z.enum(["imported", "reviewed", "published", "rejected", "withdrawn"]),
    entityIds: z.array(id).min(1),
    occurredAt: timestamp,
  })
  .strict();
