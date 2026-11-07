import { buildMediaKey } from "@/lib/storage/keys";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { adminOperationJobs, enrollments, groupMembers, googleMeetSessions, notifications, user, pengguna, aiGenerationJobs } from "@/db/schema";
import { requireMcpScope, type McpPrincipal } from "@/lib/authoring/mcp-auth";
import { adminToolkit, adminId, adminRevision, adminPagination } from "./toolkit";
import { AdminMcpError, revisionOf } from "./mutations";
import { enqueueAdminOperation, externalJobView, operationEnvironment } from "./external-jobs";
import { formExportSnapshot, generationPayload, meetCreatePayload, meetEndPayload, notificationPayload, sheetPayload, mediaUploadInput } from "./external-contracts";
import { generationSnapshot } from "./external-executor";
export function registerExternalTools(server: McpServer, principal: McpPrincipal) {
  const { read, write } = adminToolkit(server, principal);
  write("media.upload", "media:write", mediaUploadInput, "Antrekan unggahan media maksimal 512 KiB ke key baru. Berkas besar memakai alur unggahan admin yang ada.", async (tx, { folderPath, ...input }) => enqueueAdminOperation(tx, principal, "media_upload", { ...input, key: buildMediaKey({ folderPath, filename: input.filename }) }), async input => ({ folderPath: input.folderPath, filename: input.filename, mimeType: input.mimeType, size: Buffer.from(input.dataBase64, "base64").length }));
  read("adminjobs.list", "jobs:read", z.object(adminPagination), "Daftar antrean operasi admin. Payload privat tidak ditampilkan.", async ({ limit, offset }) => {
    const rows = await db.select().from(adminOperationJobs).where(eq(adminOperationJobs.environment, operationEnvironment())).orderBy(asc(adminOperationJobs.id)).limit(limit).offset(offset);
    return rows.filter(row => principal.scopes.includes(row.requiredScope)).map(externalJobView);
  });
  read("adminjobs.get", "jobs:read", z.object({ id: adminId }), "Lihat hasil operasi. Status unknown memerlukan rekonsiliasi provider, jangan ulangi otomatis.", async ({ id }) => {
    const [row] = await db.select().from(adminOperationJobs).where(and(eq(adminOperationJobs.id, id), eq(adminOperationJobs.environment, operationEnvironment()))).limit(1);
    if (!row) throw new AdminMcpError("NOT_FOUND"); requireMcpScope(principal, row.requiredScope); return externalJobView(row);
  });
  write("adminjobs.cancel", "jobs:write", z.object({ id: adminId, expectedRevision: adminRevision }), "Batalkan operasi yang masih queued. Operasi berjalan tidak dapat dibatalkan lewat tool ini.", async (tx, input) => {
    const [old] = await tx.select().from(adminOperationJobs).where(and(eq(adminOperationJobs.id, input.id), eq(adminOperationJobs.environment, operationEnvironment()))).limit(1);
    if (!old) throw new AdminMcpError("NOT_FOUND"); requireMcpScope(principal, old.requiredScope);
    if (externalJobView(old).revision !== input.expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    if (old.status !== "queued") throw new AdminMcpError("JOB_NOT_QUEUED");
    const [row] = await tx.update(adminOperationJobs).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(adminOperationJobs.id, input.id), eq(adminOperationJobs.status, "queued"))).returning();
    if (!row) throw new AdminMcpError("REVISION_CONFLICT"); return externalJobView(row);
  });
  write("adminjobs.reconcile", "jobs:write", z.object({ id: adminId, expectedRevision: adminRevision, reportedOutcome: z.enum(["succeeded", "failed"]), reason: z.string().trim().min(10).max(1000), evidenceReference: z.string().trim().min(5).max(2000) }), "Catat rekonsiliasi manual setelah operator memeriksa provider. Tool ini tidak mengulang operasi dan tidak memverifikasi bukti secara otomatis.", async (tx, input) => {
    const [old] = await tx.select().from(adminOperationJobs).where(and(eq(adminOperationJobs.id, input.id), eq(adminOperationJobs.environment, operationEnvironment()))).limit(1);
    if (!old) throw new AdminMcpError("NOT_FOUND"); requireMcpScope(principal, old.requiredScope);
    if (externalJobView(old).revision !== input.expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    if (old.status !== "unknown") throw new AdminMcpError("JOB_NOT_UNKNOWN");
    const [row] = await tx.update(adminOperationJobs).set({ status: input.reportedOutcome, errorCode: input.reportedOutcome === "failed" ? "OPERATOR_RECONCILED_FAILURE" : null, result: { ...old.result, operatorReconciled: true, reconciledBy: principal.actorId, reason: input.reason, evidenceReference: input.evidenceReference }, ...(old.kind === "media_upload" ? { payload: { key: old.payload.key, mimeType: old.payload.mimeType } } : {}), updatedAt: new Date() }).where(and(eq(adminOperationJobs.id, input.id), eq(adminOperationJobs.status, "unknown"))).returning();
    if (!row) throw new AdminMcpError("REVISION_CONFLICT"); return externalJobView(row);
  });
  read("notifications.history", "notifications:read", z.object(adminPagination), "Lihat status pengiriman notifikasi tanpa identitas penerima atau token perangkat.", async ({ limit, offset }) => db.select({ id: notifications.id, title: notifications.title, type: notifications.type, attempted: notifications.attempted, succeeded: notifications.succeeded, failedCount: notifications.failedCount, createdAt: notifications.createdAt }).from(notifications).orderBy(asc(notifications.id)).limit(limit).offset(offset));
  read("notifications.audience", "notifications:send", z.object({ target: z.enum(["all", "course", "group", "users"]), targetId: adminId.optional(), userIds: z.array(adminId).min(1).max(1000).optional() }), "Siapkan snapshot penerima aktif untuk konfirmasi pengiriman. Maksimal 1000 penerima.", async input => {
    let selected: string[] | undefined;
    if (input.target === "course" || input.target === "group") {
      if (!input.targetId || input.userIds) throw new AdminMcpError("INVALID_AUDIENCE");
      selected = input.target === "course" ? (await db.select({ id: enrollments.userId }).from(enrollments).where(and(eq(enrollments.courseId, input.targetId), gt(enrollments.expiresAt, new Date()))).limit(1001)).map(r => r.id) : (await db.select({ id: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, input.targetId)).limit(1001)).map(r => r.id);
    } else if (input.target === "users") {
      if (!input.userIds || input.targetId) throw new AdminMcpError("INVALID_AUDIENCE"); selected = input.userIds;
    } else if (input.targetId || input.userIds) throw new AdminMcpError("INVALID_AUDIENCE");
    if (selected && selected.length > 1000) throw new AdminMcpError("NARROW_AUDIENCE");
    const rows = selected?.length === 0 ? [] : await db.select({ id: user.id }).from(user).innerJoin(pengguna, eq(user.id, pengguna.id)).where(and(eq(pengguna.status, "active"), selected ? inArray(user.id, selected) : undefined)).orderBy(asc(user.id)).limit(1001);
    if (rows.length > 1000) throw new AdminMcpError("NARROW_AUDIENCE");
    const recipientIds = rows.map(r => r.id); return { target: input.target, targetId: input.targetId, recipientIds, recipientCount: recipientIds.length, audienceRevision: revisionOf(recipientIds) };
  });
  write("notifications.send", "notifications:send", notificationPayload, "Antrekan notifikasi hanya kepada ID penerima yang dikonfirmasi. Tidak pernah memperluas target menjadi semua pengguna.", async (tx, input) => {
    const ids = [...new Set(input.recipientIds)].sort();
    if (revisionOf(ids) !== input.audienceRevision) throw new AdminMcpError("AUDIENCE_CHANGED");
    return enqueueAdminOperation(tx, principal, "notification_send", { ...input, recipientIds: ids });
  }, async input => ({ recipientCount: new Set(input.recipientIds).size, title: input.title, body: input.body, link: input.link }));
  read("forms.responses.sheet_state", "forms:responses:export", z.object({ formId: adminId, from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional() }), "Periksa snapshot respons dan spreadsheet yang terhubung tanpa mengubah Drive.", async input => {
    requireMcpScope(principal, "forms:responses:read");
    const snapshot = await formExportSnapshot(input);
    let fingerprint: string | null = null;
    if (snapshot.sheet) {
      const { readSheetGrid } = await import("@/lib/google-sheets");
      const grid = await readSheetGrid(snapshot.sheet.spreadsheetId);
      if (!grid) throw new AdminMcpError("SPREADSHEET_NOT_FOUND"); fingerprint = revisionOf(grid);
    }
    return { formId: input.formId, rowCount: snapshot.rowCount, expectedDataRevision: snapshot.dataRevision, expectedSpreadsheetId: snapshot.sheet?.spreadsheetId ?? null, expectedSheetFingerprint: fingerprint, overwritePhrase: `TIMPA ${snapshot.form.slug}` };
  });
  write("forms.responses.export_sheet", "forms:responses:export", sheetPayload, "Antrekan ekspor ke spreadsheet entitas yang sama. Konflik edit manual memerlukan frase TIMPA diikuti slug dan snapshot terbaru.", async (tx, input) => {
    requireMcpScope(principal, "forms:responses:read"); const snapshot = await formExportSnapshot(input, tx);
    if (snapshot.dataRevision !== input.expectedDataRevision || (snapshot.sheet?.spreadsheetId ?? null) !== input.expectedSpreadsheetId) throw new AdminMcpError("REVISION_CONFLICT");
    if (input.overwritePhrase && input.overwritePhrase !== `TIMPA ${snapshot.form.slug}`) throw new AdminMcpError("OVERWRITE_PHRASE_INVALID");
    return enqueueAdminOperation(tx, principal, "form_sheet", input);
  }, async input => ({ formId: input.formId, spreadsheetId: input.expectedSpreadsheetId, overwriteRequested: Boolean(input.overwritePhrase) }));
  read("meet.get", "meet:read", z.object({ id: adminId }), "Lihat metadata dan revisi sesi Meet tanpa email peserta atau URL provider.", async ({ id }) => {
    const [row] = await db.select().from(googleMeetSessions).where(and(eq(googleMeetSessions.id, id), isNull(googleMeetSessions.deletedAt))).limit(1);
    if (!row) throw new AdminMcpError("NOT_FOUND"); return { id: row.id, title: row.title, slug: row.slug, accessType: row.accessType, publicPath: `/f/${row.slug}`, revision: revisionOf(row) };
  });
  write("meet.create", "meet:write", meetCreatePayload, "Antrekan pembuatan Google Meet dan penetapan host. Hasil parsial memerlukan rekonsiliasi.", (tx, input) => enqueueAdminOperation(tx, principal, "meet_create", input));
  write("meet.end", "meet:write", meetEndPayload, "Antrekan pengakhiran konferensi aktif. Peserta akan keluar dari konferensi.", (tx, input) => enqueueAdminOperation(tx, principal, "meet_end", input));
  read("generation.scope", "jobs:write", generationPayload.omit({ expectedDataRevision: true }), "Periksa objek pengetahuan aktif dan snapshot sebelum memulai generasi.", generationSnapshot);
  write("generation.start", "jobs:write", generationPayload, "Antrekan pipeline generasi yang ada; penggunaan kuota dan pencatatan tetap mengikuti pipeline.", (tx, input) => enqueueAdminOperation(tx, principal, "generation_start", input));
  read("jobs.get", "jobs:read", z.object({ id: adminId }), "Lihat status generasi tanpa prompt atau detail error provider.", async ({ id }) => {
    const [row] = await db.select({ id: aiGenerationJobs.id, courseId: aiGenerationJobs.courseId, status: aiGenerationJobs.status, targetCount: aiGenerationJobs.targetCount, generatedCount: aiGenerationJobs.generatedCount, updatedAt: aiGenerationJobs.updatedAt }).from(aiGenerationJobs).where(eq(aiGenerationJobs.id, id)).limit(1);
    if (!row) throw new AdminMcpError("NOT_FOUND"); return row;
  });
}
