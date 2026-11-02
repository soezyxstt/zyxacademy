import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminOperationJobs, customForms, googleMeetSessions, knowledgeObjects, user, pengguna } from "@/db/schema";
import { AdminMcpError, revisionOf } from "./mutations";
import { formExportSnapshot, generationPayload, meetCreatePayload, meetEndPayload, notificationPayload, sheetPayload, mediaUploadPayload } from "./external-contracts";
import type { AdminOperationExecutor } from "./external-jobs";
export async function generationSnapshot(input: { courseId: string; chapterId: string; koId?: string }) {
  const rows = await db.select().from(knowledgeObjects).where(and(eq(knowledgeObjects.courseId, input.courseId), eq(knowledgeObjects.chapterId, input.chapterId), eq(knowledgeObjects.status, "active"), input.koId ? eq(knowledgeObjects.id, input.koId) : undefined)).orderBy(asc(knowledgeObjects.id)).limit(1001);
  if (!rows.length) throw new AdminMcpError("NO_ACTIVE_KNOWLEDGE_OBJECTS");
  if (rows.length > 1000) throw new AdminMcpError("NARROW_GENERATION_SCOPE");
  return { targetCount: rows.length, dataRevision: revisionOf(rows) };
}
export const executeAdminOperation: AdminOperationExecutor = async job => {
  const required = job.kind === "media_upload" ? (process.env.STORAGE_PROVIDER_MODE === "neon" ? ["AWS_ENDPOINT_URL_S3", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "NEON_STORAGE_BUCKET"] : ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) : job.kind === "notification_send" ? ["FIREBASE_SERVICE_ACCOUNT_JSON"] : ["form_sheet", "meet_create", "meet_end"].includes(job.kind) ? ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"] : ["INNGEST_EVENT_KEY"];
  if (required.some(key => !process.env[key]?.trim())) throw new AdminMcpError("PROVIDER_NOT_CONFIGURED");
  switch (job.kind) {
    case "media_upload": {
      const input = mediaUploadPayload.parse(job.payload);
      const { assertSafeKey, isMediaKey, leafFilename } = await import("@/lib/storage/keys");
      assertSafeKey(input.key);
      if (!input.key.startsWith("media/") || !isMediaKey(input.key)) throw new AdminMcpError("INVALID_MEDIA_PATH");
      const bytes = Buffer.from(input.dataBase64, "base64");
      if (!bytes.length || bytes.length > 524288) throw new AdminMcpError("FILE_TOO_LARGE");
      const { isUtf8 } = await import("node:buffer");
      const valid = input.mimeType === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : input.mimeType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : input.mimeType === "image/webp" ? bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP" : input.mimeType === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-" : isUtf8(bytes);
      if (!valid) throw new AdminMcpError("FILE_TYPE_MISMATCH");
      const { storage } = await import("@/lib/storage");
      if (await storage.exists(input.key)) throw new AdminMcpError("OBJECT_ALREADY_EXISTS");
      const result = await storage.upload(bytes, leafFilename(input.key), input.mimeType, { key: input.key });
      return { key: result.key, size: result.size };
    }
    case "notification_send": {
      const input = notificationPayload.parse(job.payload);
      const recipients = await db.select({ id: user.id }).from(user).innerJoin(pengguna, eq(user.id, pengguna.id)).where(and(inArray(user.id, input.recipientIds), eq(pengguna.status, "active"))).orderBy(asc(user.id));
      const ids = recipients.map(r => r.id);
      if (revisionOf(ids) !== input.audienceRevision) throw new AdminMcpError("AUDIENCE_CHANGED");
      const { sendAdminBroadcast } = await import("@/lib/notifications/send");
      const result = await sendAdminBroadcast(input.title, input.body, input.link, ids);
      return { recipientCount: ids.length, attempted: result.attempted, succeeded: result.succeeded, failedCount: result.failedTokens.length, errorCount: result.errors.length };
    }
    case "form_sheet": {
      const input = sheetPayload.parse(job.payload);
      const snapshot = await formExportSnapshot(input);
      if (snapshot.dataRevision !== input.expectedDataRevision || (snapshot.sheet?.spreadsheetId ?? null) !== input.expectedSpreadsheetId) throw new AdminMcpError("REVISION_CONFLICT");
      const { readSheetGrid, syncGoogleSpreadsheet } = await import("@/lib/google-sheets");
      if (snapshot.sheet) {
        const grid = await readSheetGrid(snapshot.sheet.spreadsheetId);
        if (!grid) throw new AdminMcpError("SPREADSHEET_NOT_FOUND");
        if (revisionOf(grid) !== input.expectedSheetFingerprint) throw new AdminMcpError("SPREADSHEET_CHANGED");
      }
      const overwrite = input.overwritePhrase === `TIMPA ${snapshot.form.slug}`;
      if (input.overwritePhrase && !overwrite) throw new AdminMcpError("OVERWRITE_PHRASE_INVALID");
      const result = await syncGoogleSpreadsheet({ entityType: "form", entityId: snapshot.form.id, title: `form-${snapshot.form.slug}-responses`, headers: snapshot.headers, rows: snapshot.rows, folderSubpath: `forms/${snapshot.form.slug}`, confirmOverwrite: overwrite });
      return { spreadsheetId: result.spreadsheetId, spreadsheetUrl: result.spreadsheetUrl, needsConfirmation: result.needsConfirmation ?? false, conflicts: result.conflicts?.map(c => ({ code: c.code, message: c.message })) ?? [], rowCount: snapshot.rowCount, overwritePhraseRequired: result.needsConfirmation ? `TIMPA ${snapshot.form.slug}` : null };
    }
    case "meet_create": {
      const input = meetCreatePayload.parse(job.payload);
      const forms = await db.select({ id: customForms.id }).from(customForms).where(eq(customForms.slug, input.slug)).limit(1);
      const meets = await db.select({ id: googleMeetSessions.id }).from(googleMeetSessions).where(eq(googleMeetSessions.slug, input.slug)).limit(1);
      if (forms.length || meets.length) throw new AdminMcpError("SLUG_CONFLICT");
      const [actor] = await db.select({ email: user.email }).from(user).where(eq(user.id, job.actorId)).limit(1);
      if (!actor) throw new AdminMcpError("NOT_FOUND");
      const { createGoogleMeetSpace, provisionGoogleMeetSpaceMembers } = await import("@/lib/google-meet");
      const { getAllAdminEmails } = await import("@/lib/google-drive-permissions");
      const coHosts = [...new Set([actor.email, ...await getAllAdminEmails()])];
      const space = await createGoogleMeetSpace({ accessType: input.accessType, moderation: "ON" });
      // Save the provider reference before follow-up calls so an interrupted attempt can be reconciled.
      await db.update(adminOperationJobs).set({ result: { providerRef: space.name }, updatedAt: new Date() }).where(eq(adminOperationJobs.id, job.id));
      const members = await provisionGoogleMeetSpaceMembers(space.name, [...coHosts.map(email => ({ email, role: "COHOST" as const })), ...input.invitedEmails.map(email => ({ email, role: "ROLE_UNSPECIFIED" as const }))]);
      const id = crypto.randomUUID();
      await db.transaction(async tx => {
        const conflicting = await tx.select({ id: customForms.id }).from(customForms).where(eq(customForms.slug, input.slug)).limit(1);
        if (conflicting.length) throw new Error("Provider resource requires reconciliation");
        await tx.insert(googleMeetSessions).values({ id, title: input.title, slug: input.slug, spaceName: space.name, meetingUri: space.meetingUri, meetingCode: space.meetingCode, accessType: input.accessType, createdById: job.actorId, hostEmail: actor.email, coHostEmails: members.filter(m => m.success && m.role === "COHOST").map(m => m.email), invitedEmails: members.filter(m => m.success && m.role === "ROLE_UNSPECIFIED").map(m => m.email), createdAt: new Date(), updatedAt: new Date() });
      });
      return { id, publicPath: `/f/${input.slug}`, memberFailures: members.filter(m => !m.success).length };
    }
    case "meet_end": {
      const input = meetEndPayload.parse(job.payload);
      const [meet] = await db.select().from(googleMeetSessions).where(and(eq(googleMeetSessions.id, input.id), isNull(googleMeetSessions.deletedAt))).limit(1);
      if (!meet) throw new AdminMcpError("NOT_FOUND");
      if (revisionOf(meet) !== input.expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
      const { endGoogleMeetActiveConference } = await import("@/lib/google-meet");
      await endGoogleMeetActiveConference(meet.spaceName);
      return { id: meet.id, conferenceEnded: true };
    }
    case "generation_start": {
      const input = generationPayload.parse(job.payload);
      const snapshot = await generationSnapshot(input);
      if (snapshot.dataRevision !== input.expectedDataRevision) throw new AdminMcpError("REVISION_CONFLICT");
      const { startGenerationJob } = await import("@/lib/generation-pipeline");
      const jobId = await startGenerationJob({ courseId: input.courseId, chapterId: input.chapterId, koId: input.koId, tutorId: job.actorId, targetCount: snapshot.targetCount });
      return { jobId, targetCount: snapshot.targetCount };
    }
  }
};
