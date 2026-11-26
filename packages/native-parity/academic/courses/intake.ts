import { z } from "zod";
import { BATCH_MAX_FILE_BYTES } from "../../../../lib/course-batch-upload";

export const intakeAccountHeader = "x-native-intake-account";
export const intakeSessionHeader = "x-native-intake-session";
export const intakeCourseHeader = "x-native-intake-course";
export const pdfIntakeCount = 4;
export const pdfIntakeBytes = 100 * 1024 * 1024;
export const bundleIntakeBytes = 32 * 1024 * 1024;
export const pdfIntakePath = "/api/admin/course-materials/batch";
export type BundleIntakeKind = "idea" | "product";
export const bundleIntakePath = (kind: BundleIntakeKind) => "/api/admin/bundles/" + kind;
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().min(1).max(160).regex(/^[^/\\\s?#\x00-\x1f\x7f]+$/);
export const pdfIntakeEntry = z.strictObject({
  id: z.uuidv4(),
  filename: z.string().min(5).max(160).regex(/^[^/\\\x00-\x1f]+\.pdf$/i),
  title: z.string().trim().min(1).max(255),
  type: z.enum(["materi", "soal", "pembahasan_soal"]),
  subcategory: z.string().max(30).nullable(),
  year: z.number().int().min(1900).max(2100).nullable(),
  chapterIds: z.array(identifier).min(1).max(100),
  checksum,
  size: z.number().int().positive().max(BATCH_MAX_FILE_BYTES),
  keepDuplicate: z.boolean(),
  overwrite: z.strictObject({ id: identifier, revision: checksum }).nullable(),
});
export type PdfIntakeEntry = z.infer<typeof pdfIntakeEntry>;
export const pdfIntakeDuplicates = z.strictObject({ checksums: z.array(checksum).min(1).max(200) });
export const pdfIntakeEntries = z.array(pdfIntakeEntry).min(1).max(pdfIntakeCount);
export const pdfIntakeGrant = z.strictObject({ id: z.uuidv4(), uploadUrl: z.url(), proof: z.string().max(100) });
export const pdfIntakeCommit = z.strictObject({
  requestId: z.uuidv4(), entries: pdfIntakeEntries, proofs: z.array(z.string().max(100)).min(1).max(pdfIntakeCount),
});
export const pdfIntakeDuplicate = z.strictObject({ materialId: identifier, title: z.string(), revision: checksum });
export type PdfIntakeDuplicate = z.infer<typeof pdfIntakeDuplicate>;

export function validPdfGroup(entries: readonly PdfIntakeEntry[]) {
  const overwritten = entries.flatMap(entry => entry.overwrite ? [entry.overwrite.id] : []);
  return entries.length >= 1 && entries.length <= pdfIntakeCount
    && new Set(entries.map(entry => entry.id)).size === entries.length
    && new Set(overwritten).size === overwritten.length
    && entries.reduce((total, entry) => total + entry.size, 0) <= pdfIntakeBytes;
}

export function groupPdfIntake<T extends { entry: PdfIntakeEntry }>(files: readonly T[]) {
  const groups: T[][] = [];
  let group: T[] = [];
  let bytes = 0;
  for (const file of files) {
    if (group.length === pdfIntakeCount || bytes + file.entry.size > pdfIntakeBytes) {
      groups.push(group);
      group = [];
      bytes = 0;
    }
    group.push(file);
    bytes += file.entry.size;
  }
  if (group.length) groups.push(group);
  return groups;
}
