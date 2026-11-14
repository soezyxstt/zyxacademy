import { assertMcpTarget } from "@/lib/authoring/mcp-environment";
import { adminMcpFailure } from "./errors";
import { registerOperationDescriptor, sanitizeAdminOperationResult } from "./operation-contracts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chapters, courseMaterials, courses, courseVideos, groups, enrollmentTokens, academicSchedules, googleMeetSessions, aiGenerationJobs } from "@/db/schema";
import { requireMcpScope, resolveMcpAdmin, type McpPrincipal } from "@/lib/authoring/mcp-auth";

const page = { limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(100000).default(0) };
type Registrar = { registerTool(name: string, config: { description: string; inputSchema: Record<string, z.ZodType>; annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean } }, callback: (input: Record<string, unknown>) => Promise<CallToolResult>): unknown };

/** Register explicitly scoped, bounded operational reads. Never return storage URLs. */
export function registerOperationsTools(server: McpServer, principal: McpPrincipal): void {
  const registrar = server as unknown as Registrar;
  function register<T extends z.ZodObject>(name: string, scope: string, schema: T, description: string, execute: (input: z.infer<T>) => Promise<unknown>) {
    const scopedSchema = schema.safeExtend({ expectedEnvironment: z.enum(["staging", "production", "local"]), expectedOrigin: z.url().max(2048) });
    const descriptor = registerOperationDescriptor(server, { name, scope, description, schema: scopedSchema });
    registrar.registerTool(name, { description, inputSchema: scopedSchema.shape, annotations: descriptor.annotations }, async (raw) => {
      try {
        requireMcpScope(principal, scope);
        await resolveMcpAdmin(principal);
        const { expectedEnvironment, expectedOrigin, ...businessInput } = scopedSchema.strict().parse(raw);
        assertMcpTarget(expectedEnvironment, expectedOrigin);
        const result = await execute(businessInput as z.infer<T>);
        const data = sanitizeAdminOperationResult(name, result, principal);
        const payload = { ok: true, data };
        return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
      } catch (error) {
        return adminMcpFailure(error);
      }
    });
  }
  register("courses.list", "courses:read", z.object(page), "List course identifiers and titles.", async ({ limit, offset }) =>
    db.select({ id: courses.id, title: courses.title }).from(courses).orderBy(asc(courses.title), asc(courses.id)).limit(limit).offset(offset));
  register("chapters.list", "chapters:read", z.object({ courseId: z.string().min(1).max(200), ...page }), "List chapters for one course.", async ({ courseId, limit, offset }) =>
    db.select({ id: chapters.id, courseId: chapters.courseId, title: chapters.title, orderIndex: chapters.orderIndex, status: chapters.status }).from(chapters).where(eq(chapters.courseId, courseId)).orderBy(asc(chapters.orderIndex), asc(chapters.id)).limit(limit).offset(offset));
  register("materials.list", "materials:read", z.object({ courseId: z.string().min(1).max(200), ...page }), "List material metadata for one course.", async ({ courseId, limit, offset }) =>
    db.select({ id: courseMaterials.id, courseId: courseMaterials.courseId, title: courseMaterials.title, type: courseMaterials.type, subcategory: courseMaterials.subcategory, year: courseMaterials.year, chapterIds: courseMaterials.chapterIds }).from(courseMaterials).where(eq(courseMaterials.courseId, courseId)).orderBy(asc(courseMaterials.title), asc(courseMaterials.id)).limit(limit).offset(offset));
  register("videos.list", "videos:read", z.object({ courseId: z.string().min(1).max(200), ...page }), "List video metadata for a course.", async ({ courseId, limit, offset }) =>
    db.select({ id: courseVideos.id, courseId: courseVideos.courseId, playlistId: courseVideos.playlistId, chapterId: courseVideos.chapterId, title: courseVideos.title, duration: courseVideos.duration, orderIndex: courseVideos.orderIndex }).from(courseVideos).where(eq(courseVideos.courseId, courseId)).orderBy(asc(courseVideos.orderIndex), asc(courseVideos.id)).limit(limit).offset(offset));
  register("groups.list", "groups:read", z.object(page), "List study groups.", async ({ limit, offset }) =>
    db.select({ id: groups.id, name: groups.name, status: groups.status, academicYear: groups.academicYear, semester: groups.semester }).from(groups).orderBy(asc(groups.name), asc(groups.id)).limit(limit).offset(offset));
  register("tokens.list", "access:read", z.object(page), "List enrollment token metadata without token values.", async ({ limit, offset }) =>
    db.select({ id: enrollmentTokens.id, groupId: enrollmentTokens.groupId, capacity: enrollmentTokens.capacity, createdAt: enrollmentTokens.createdAt, expiresAt: enrollmentTokens.expiresAt }).from(enrollmentTokens).orderBy(asc(enrollmentTokens.id)).limit(limit).offset(offset));
  register("schedules.list", "schedules:read", z.object(page), "List academic schedule metadata.", async ({ limit, offset }) =>
    db.select({ id: academicSchedules.id, type: academicSchedules.type, title: academicSchedules.title, courseId: academicSchedules.courseId, startDate: academicSchedules.startDate, endDate: academicSchedules.endDate, status: academicSchedules.status }).from(academicSchedules).orderBy(asc(academicSchedules.startDate), asc(academicSchedules.id)).limit(limit).offset(offset));
  register("meet.list", "meet:read", z.object(page), "List meeting metadata without links or participant details.", async ({ limit, offset }) =>
    db.select({ id: googleMeetSessions.id, title: googleMeetSessions.title, accessType: googleMeetSessions.accessType, deletedAt: googleMeetSessions.deletedAt, createdAt: googleMeetSessions.createdAt }).from(googleMeetSessions).orderBy(asc(googleMeetSessions.id)).limit(limit).offset(offset));
  register("jobs.list", "jobs:read", z.object(page), "List generation job status without prompts or errors.", async ({ limit, offset }) =>
    db.select({ id: aiGenerationJobs.id, courseId: aiGenerationJobs.courseId, status: aiGenerationJobs.status, targetCount: aiGenerationJobs.targetCount, generatedCount: aiGenerationJobs.generatedCount, createdAt: aiGenerationJobs.createdAt, updatedAt: aiGenerationJobs.updatedAt }).from(aiGenerationJobs).orderBy(asc(aiGenerationJobs.id)).limit(limit).offset(offset));

}
