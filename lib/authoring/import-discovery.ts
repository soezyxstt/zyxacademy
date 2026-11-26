import { createHash } from "node:crypto";
import { and, desc, eq, ilike, inArray, isNotNull, isNull, lt, ne, notExists, or, sql, type SQL } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/lib/db";
import { bab, imporBundle, itemImporBundle, mataKuliah } from "@/db/schema";
import { resolveCourseIdentity, type ResolvedCourseIdentity } from "@/lib/admin/course-identity";
import type { ProductReadSnapshot } from "@/lib/bundle/product-readiness";

import { importDiscoveryInputSchema, type ImportDiscoveryInput } from "./import-discovery-contract";

const rootId = (table: { validationReport: AnyPgColumn; id: AnyPgColumn }) => sql<string>`coalesce(nullif(${table.validationReport}->'revisionLineage'->>'rootImportId', ''), ${table.id})`;
const chapterId = sql<string | null>`${imporBundle.validationReport}->>'chapterId'`;
const title = sql<string | null>`left(coalesce(nullif(${imporBundle.validationReport}->>'bundleTitle', ''), nullif(${imporBundle.validationReport}->>'title', ''), nullif(${imporBundle.validationReport}->>'name', ''), ${bab.title}), 500)`;
const storedCourseId = sql<string | null>`coalesce(${imporBundle.courseId}, ${imporBundle.validationReport}->>'courseId')`;
const reportCourseId = sql<string | null>`${imporBundle.validationReport}->>'courseId'`;
const otherCourse = alias(mataKuliah, "other_import_course");
// The FK is a legacy ID, while a report-only scope is canonical. An OR across
// both namespaces duplicates imports when an unrelated canonical ID collides
// with a legacy ID. Do not choose an arbitrary canonical course for bad aliases.
function scopeJoin() {
  // Loading the MCP catalog or bootstrap must not access the database, even to
  // construct a query. Only an actual discovery request needs this subquery.
  return or(
    and(isNotNull(imporBundle.courseId), eq(mataKuliah.legacyCourseId, imporBundle.courseId),
      notExists(db.select({ id: otherCourse.id }).from(otherCourse).where(and(
        eq(otherCourse.legacyCourseId, imporBundle.courseId), ne(otherCourse.id, mataKuliah.id),
      )))),
    and(isNull(imporBundle.courseId), eq(mataKuliah.id, reportCourseId)),
  );
}
const metadataSelection = {
  importId: imporBundle.id, bundleId: imporBundle.bundleId, checksum: imporBundle.checksum,
  bundleType: imporBundle.bundleType, version: imporBundle.version, status: imporBundle.status,
  insertionOrder: imporBundle.insertionOrder, createdAt: imporBundle.createdAt, updatedAt: imporBundle.updatedAt,
  title, courseId: sql<string | null>`coalesce(${mataKuliah.id}, ${storedCourseId})`,
  courseTitle: mataKuliah.title, chapterId, chapterTitle: bab.title, rootImportId: rootId(imporBundle),
  hasRevisionLineage: sql<boolean>`${imporBundle.validationReport}->'revisionLineage'->>'schema' = 'authoring-revision.v1'`,
  validationValid: sql<boolean | null>`case when jsonb_typeof(${imporBundle.validationReport}->'valid') = 'boolean' then (${imporBundle.validationReport}->>'valid')::boolean else null end`,
};
type MetadataRow = {
  importId: string; bundleId: string; checksum: string; bundleType: string; version: number; status: string;
  insertionOrder: number; createdAt: Date; updatedAt: Date; title: string | null;
  courseId: string | null; courseTitle: string | null; chapterId: string | null; chapterTitle: string | null;
  rootImportId: string; hasRevisionLineage: boolean | null; validationValid: boolean | null;
};
const cursorSchema = z.object({ version: z.literal(1), before: z.number().int().positive().safe(), filters: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
function filtersHash(input: z.output<typeof importDiscoveryInputSchema>) {
  return createHash("sha256").update(JSON.stringify({ bundleType: input.bundleType, courseId: input.courseId ?? null, chapterId: input.chapterId ?? null,
    query: input.query ?? null, statuses: input.statuses ? [...new Set(input.statuses)].sort() : null, headsOnly: input.headsOnly ?? false })).digest("hex");
}
function readCursor(value: string | undefined, filters: string) {
  if (!value) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (parsed.filters !== filters) throw new Error();
    return parsed.before;
  } catch { throw new Error("AUTHORING_MCP_IMPORT_CURSOR_INVALID"); }
}
function discoveryConditions(input: z.output<typeof importDiscoveryInputSchema>, before: number | null, course: ResolvedCourseIdentity | null) {
  const conditions: SQL[] = [eq(imporBundle.bundleType, input.bundleType)];
  if (input.courseId) conditions.push(course?.canonicalId ? eq(mataKuliah.id, course.canonicalId)
    : course?.legacyId ? eq(imporBundle.courseId, course.legacyId) : sql`false`);
  if (input.chapterId) conditions.push(eq(chapterId, input.chapterId));
  if (input.statuses) conditions.push(inArray(imporBundle.status, input.statuses));
  if (input.query) {
    const pattern = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(or(ilike(imporBundle.bundleId, pattern), ilike(title, pattern), ilike(mataKuliah.title, pattern), ilike(bab.title, pattern))!);
  }
  if (before !== null) conditions.push(lt(imporBundle.insertionOrder, before));
  if (input.headsOnly) {
    // Preserve the current live head and the newest editable candidate separately.
    const newer = alias(imporBundle, "newer_authoring_import");
    conditions.push(sql`${imporBundle.status} not in ('withdrawn', 'discarding')`);
    conditions.push(notExists(db.select({ id: newer.id }).from(newer).where(and(
      eq(newer.bundleType, imporBundle.bundleType), eq(rootId(newer), rootId(imporBundle)),
      sql`${newer.status} not in ('withdrawn', 'discarding')`,
      sql`(${newer.status} = 'published') = (${imporBundle.status} = 'published')`,
      sql`${newer.insertionOrder} > ${imporBundle.insertionOrder}`,
    ))));
  }
  return and(...conditions);
}
function compactMetadata(row: MetadataRow) {
  return {
    importId: row.importId, bundleId: row.bundleId, checksum: row.checksum, bundleType: row.bundleType,
    version: row.version, status: row.status, title: row.title,
    scope: { courseId: row.courseId, courseTitle: row.courseTitle, chapterId: row.chapterId, chapterTitle: row.chapterTitle },
    rootImportId: row.rootImportId, revisionDraft: row.hasRevisionLineage === true,
    validationSnapshot: { valid: row.validationValid, source: "stored_validation_report", currentReadiness: "not_evaluated" },
    evaluation: { review: "not_requested", readiness: "not_requested" },
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

/** Metadata discovery does not read private archives or evaluate publication readiness. */
export async function listImportMetadata(raw: ImportDiscoveryInput) {
  const input = importDiscoveryInputSchema.parse(raw);
  const filters = filtersHash(input);
  const before = readCursor(input.cursor, filters);
  const course = input.courseId ? await resolveCourseIdentity(input.courseId, db) : null;
  const rows = await db.select(metadataSelection).from(imporBundle)
    .leftJoin(mataKuliah, scopeJoin()).leftJoin(bab, eq(bab.id, chapterId))
    .where(discoveryConditions(input, before, course)).orderBy(desc(imporBundle.insertionOrder)).limit(input.limit + 1);
  const page = rows.slice(0, input.limit);
  const nextCursor = rows.length > input.limit ? Buffer.from(JSON.stringify({ version: 1, before: page.at(-1)!.insertionOrder, filters })).toString("base64url") : null;
  return { ok: true, bundleType: input.bundleType, responseMode: "compact", imports: page.map(compactMetadata),
    pagination: { limit: input.limit, nextCursor }, evaluation: { review: "not_requested", readiness: "not_requested" },
    heads: input.headsOnly ? "latest_live_and_editable_per_lineage" : "all_matching_revisions" };
}

/** Optional inventory is bounded and read from admitted metadata, never from ZIP bytes. */
export async function getCompactImport(input: { bundleType: "source" | "idea" | "product"; importId: string; projections?: Array<"inventory" | "readiness"> }, readiness: (id: string, snapshot: ProductReadSnapshot) => Promise<unknown>) {
  const [row] = await db.select(metadataSelection).from(imporBundle)
    .leftJoin(mataKuliah, scopeJoin()).leftJoin(bab, eq(bab.id, chapterId))
    .where(and(eq(imporBundle.id, input.importId), eq(imporBundle.bundleType, input.bundleType))).limit(1);
  if (!row) throw new Error(input.bundleType === "product" ? "PRODUCT_BUNDLE_NOT_FOUND" : input.bundleType === "idea" ? "IDEA_BUNDLE_NOT_FOUND" : "SOURCE_PACK_NOT_FOUND");
  const wantsReadiness = input.projections?.includes("readiness") === true;
  if (wantsReadiness && input.bundleType !== "product") throw new Error("AUTHORING_MCP_IMPORT_READINESS_PRODUCT_ONLY");
  const inventory = input.projections?.includes("inventory") ? await db.select({ entityType: itemImporBundle.entityType, entityId: itemImporBundle.entityId,
    entityVersion: itemImporBundle.entityVersion, entityHash: itemImporBundle.entityHash, status: itemImporBundle.status }).from(itemImporBundle)
    .where(and(eq(itemImporBundle.imporBundleId, input.importId), sql`${itemImporBundle.entityType} <> 'dependency'`))
    .orderBy(itemImporBundle.entityType, itemImporBundle.entityId).limit(257) : null;
  const currentReadiness = wantsReadiness ? await readiness(input.importId, { checksum: row.checksum, status: row.status, version: row.version, updatedAt: row.updatedAt.toISOString() }) : undefined;
  return { ok: true, responseMode: "compact", import: { ...compactMetadata(row),
    ...(inventory ? { items: inventory.slice(0, 256), inventory: { limit: 256, truncated: inventory.length > 256, dependencies: "omitted" } } : {}),
    ...(wantsReadiness ? { currentReadiness, evaluation: { review: "evaluated", readiness: "evaluated" } } : {}),
  } };
}

