import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiQuestionBank, aiGenerationJobs, courses, enrollments, studentQuizAttempts } from "@/db/schema";
import { getAllFeatureFlagsStatus } from "@/lib/feature-flags";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";
import { adminToolkit } from "./toolkit";
import { AdminMcpError, revisionOf } from "./mutations";
import { assertSafeKey, buildMediaKey, isMediaKey, leafFilename } from "@/lib/storage/keys";
import { kindFromKey } from "@/lib/media";
export function registerSystemTools(server: McpServer, principal: McpPrincipal) {
  const { read } = adminToolkit(server, principal);
  read("settings.feature_flags", "settings:read", z.object({}), "Lihat status flag yang dikenal tanpa nilai environment atau kredensial.", async () => getAllFeatureFlagsStatus().map(({ key, name, category, enabled }) => ({ key, name, category, enabled })));
  read("analytics.overview", "analytics:read", z.object({}), "Agregat soal, job generasi, dan percobaan kuis tanpa peringkat atau identitas murid.", async () => {
    const [questionBank, generationJobs, quizAttempts] = await Promise.all([
      db.select({ status: aiQuestionBank.reviewStatus, count: count(), averageQuality: sql<number | null>`avg(${aiQuestionBank.qualityScore})` }).from(aiQuestionBank).groupBy(aiQuestionBank.reviewStatus),
      db.select({ status: aiGenerationJobs.status, count: count(), tokens: sql<number>`coalesce(sum(${aiGenerationJobs.tokenUsage}), 0)` }).from(aiGenerationJobs).groupBy(aiGenerationJobs.status),
      db.select({ status: studentQuizAttempts.status, count: count(), averageScore: sql<number | null>`avg(${studentQuizAttempts.score})` }).from(studentQuizAttempts).groupBy(studentQuizAttempts.status),
    ]); return { questionBank, generationJobs, quizAttempts };
  });
  read("analytics.courses", "analytics:read", z.object({ limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(100000).default(0) }), "Daftar mata kuliah termasuk yang belum memiliki aktivitas, urut alfabet, tanpa peringkat lintas mata kuliah.", async ({ limit, offset }) => {
    const rows = await db.select({ id: courses.id, title: courses.title, enrollmentCount: count(enrollments.id) }).from(courses).leftJoin(enrollments, eq(enrollments.courseId, courses.id)).groupBy(courses.id).orderBy(asc(courses.title), asc(courses.id)).limit(limit).offset(offset);
    return rows;
  });
  read("media.list", "media:read", z.object({ folderPath: z.string().max(500).default(""), limit: z.number().int().min(1).max(100).default(25), cursor: z.string().max(4096).optional() }), "Daftar objek media dengan pagination provider. Kunci di luar domain media tidak diizinkan.", async input => {
    if (input.folderPath) assertSafeKey(input.folderPath);
    // Use the common key builder to normalize only the folder segments.
    const sampleKey = buildMediaKey({ folderPath: input.folderPath, filename: "listing" });
    const prefix = sampleKey.slice(0, sampleKey.lastIndexOf("/") + 1);
    if (!isMediaKey(prefix)) throw new AdminMcpError("INVALID_MEDIA_PATH");
    const { storage } = await import("@/lib/storage");
    if (!storage.listPage) throw new AdminMcpError("STORAGE_PAGINATION_UNAVAILABLE");
    const page = await storage.listPage(prefix, input.limit, input.cursor);
    return { objects: page.objects.map(object => ({ key: object.key, name: leafFilename(object.key), size: object.size, kind: kindFromKey(object.key), lastModified: object.lastModified, revision: revisionOf(object) })), nextCursor: page.cursor };
  });
}
