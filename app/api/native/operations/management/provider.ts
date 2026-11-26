import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditMutasi, session } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { isSafeKey } from "@/lib/storage/keys";
import { ManagementFailure, type ManagementReceipt } from "@/packages/native-parity/operations/management-contract";

const path = z.string().max(1024).refine(key => isSafeKey(key) && !/[\u0000-\u001f]/.test(key));
const name = z.string().trim().min(1).max(240).refine(value => isSafeKey(value) && !value.includes("/"));
const mediaKey = path.refine(value => value.startsWith("media/"));
const mediaFolder = z.union([mediaKey, z.literal("")]);
const providerOperations = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("media.folder"), folder: mediaFolder, name }),
  z.strictObject({ type: z.literal("media.rename"), key: mediaKey, name, folder: z.boolean().optional() }),
  z.strictObject({ type: z.literal("media.move"), key: mediaKey, destination: mediaFolder, folder: z.boolean() }),
  z.strictObject({ type: z.literal("media.delete"), key: mediaKey, folder: z.boolean() }),
  z.strictObject({ type: z.literal("media.copy"), key: path.refine(key => key !== "media" && key !== "media/"), destination: mediaFolder, folder: z.boolean() }),
  z.strictObject({ type: z.literal("media.upload"), destination: mediaFolder, name, fileHash: z.string().regex(/^[a-f0-9]{64}$/), mime: z.string().max(200) }),
  z.strictObject({ type: z.literal("media.replace"), key: mediaKey, fileHash: z.string().regex(/^[a-f0-9]{64}$/), mime: z.string().max(200) }),
  z.strictObject({ type: z.literal("meet.create"), title: z.string().trim().max(500), slug: z.string().trim().max(100).regex(/^[a-z0-9_-]*$/), accessType: z.enum(["OPEN", "TRUSTED", "RESTRICTED"]), invitedEmails: z.array(z.email().max(254)).max(100).transform(items => [...new Set(items.map(value => value.toLowerCase()))].sort()) }),
  z.strictObject({ type: z.literal("meet.end"), spaceName: z.string().regex(/^spaces\/[A-Za-z0-9_-]{1,180}$/) }),
  z.strictObject({ type: z.literal("meet.delete"), id: z.string().regex(/^[A-Za-z0-9_-]{1,180}$/) }),
]);

type ProviderAction = z.infer<typeof providerOperations>;
type InvokeProvider = (action: ProviderAction) => Promise<ManagementReceipt>;
type AuditEntry = typeof auditMutasi.$inferSelect;
const providerEntity = "native_operations_provider";
const unknownAfterMs = 15 * 60 * 1000;

export function isProviderOperation(value: unknown) {
  return value !== null && typeof value === "object" && "type" in value && typeof value.type === "string" && /^(media|meet)\./.test(value.type);
}

function readOutcome(row: AuditEntry): ManagementReceipt {
  switch (row.afterSnapshot?.state) {
    case "succeeded": return row.afterSnapshot.receipt as ManagementReceipt;
    case "invalid": throw new ManagementFailure("invalid");
    case "forbidden": throw new ManagementFailure("forbidden");
    case "not-found": throw new ManagementFailure("not-found");
    case "conflict": throw new ManagementFailure("conflict");
    case "running":
      if (Date.now() - row.createdAt.getTime() < unknownAfterMs) throw new ManagementFailure("pending");
      throw new ManagementFailure("uncertain");
    default: throw new ManagementFailure("uncertain");
  }
}

export async function nativeProviderMutation(actor: { id: string; sessionId: string }, origin: string, key: string | null, raw: unknown, invoke: InvokeProvider): Promise<ManagementReceipt> {
  const requestKey = z.string().regex(/^[A-Za-z0-9_-]{16,100}$/).parse(key);
  const action = providerOperations.parse(raw);
  const sessionHash = revisionOf(actor.sessionId);
  const inputHash = revisionOf(action);
  const receiptId = `native_ops_provider_${revisionOf({ actor: actor.id, origin, requestKey })}`;
  const intentId = revisionOf({ actor: actor.id, origin, action });
  const prior = await db.transaction(async tx => {
    await assertAuthoringActor(tx, actor.id, { roles: ["admin"], error: "NATIVE_OPERATIONS_ADMIN_REQUIRED", lock: true });
    const [active] = await tx.select({ id: session.id }).from(session).where(and(eq(session.id, actor.sessionId), eq(session.userId, actor.id), gt(session.expiresAt, new Date()))).for("share").limit(1);
    if (!active) throw new ManagementFailure("forbidden");
    for (const lock of [receiptId, intentId].sort()) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lock}, 0))`);
    const [previous] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
    if (previous) {
      if (previous.actorId !== actor.id || previous.entityType !== providerEntity || previous.action !== action.type || previous.afterSnapshot?.inputHash !== inputHash || previous.afterSnapshot?.sessionHash !== sessionHash) throw new ManagementFailure("conflict");
      return previous;
    }
    // A restarted application also cannot replay an unresolved provider effect with a fresh key.
    const [unresolved] = await tx.select().from(auditMutasi).where(and(eq(auditMutasi.actorId, actor.id), eq(auditMutasi.entityType, providerEntity), eq(auditMutasi.entityId, intentId), sql`${auditMutasi.afterSnapshot}->>'state' in ('running', 'uncertain')`)).limit(1);
    if (unresolved) return unresolved;
    await tx.insert(auditMutasi).values({ id: receiptId, actorId: actor.id, entityType: providerEntity, entityId: intentId, action: action.type, correlationId: requestKey, afterSnapshot: { inputHash, sessionHash, state: "running" } });
    return null;
  });
  if (prior) return readOutcome(prior);

  async function finish(state: string, receipt?: ManagementReceipt) {
    await db.update(auditMutasi).set({ outcome: state === "succeeded" ? "success" : state === "uncertain" ? "failed" : "rejected", afterSnapshot: { inputHash, sessionHash, state, ...(receipt ? { receipt } : {}) } }).where(eq(auditMutasi.id, receiptId));
  }
  try {
    const result = await invoke(action);
    await finish("succeeded", result);
    return result;
  } catch (error) {
    const state = error instanceof ManagementFailure && ["invalid", "forbidden", "not-found", "conflict"].includes(error.code) ? error.code : "uncertain";
    await finish(state);
    throw new ManagementFailure(state as ManagementFailure["code"]);
  }
}

export function invokeOperationsProvider(origin: string, headers: Headers): InvokeProvider {
  const request = (body: Record<string, unknown>) => new Request(`${origin}/api/native/operations/management`, { method: "POST", headers, body: JSON.stringify(body) });
  async function decoded(response: Response) {
    const statusCodes: Partial<Record<number, ManagementFailure["code"]>> = { 400: "invalid", 401: "forbidden", 403: "forbidden", 404: "not-found", 409: "conflict", 415: "invalid" };
    const code = statusCodes[response.status];
    if (code) throw new ManagementFailure(code);
    if (!response.ok) throw new ManagementFailure("uncertain");
    const body = await response.json();
    if (body.success !== true) throw new ManagementFailure("uncertain");
    return body;
  }
  const folderOf = (value: string) => value.replace(/^media\//, "");
  return async action => {
    switch (action.type) {
      case "media.folder": {
        const { POST } = await import("@/app/api/admin/media/route");
        const folderPath = [folderOf(action.folder), action.name].filter(Boolean).join("/");
        const result = await decoded(await POST(request({ action: "mkdir", folderPath })));
        return { id: result.key };
      }
      case "media.rename":
      case "media.move":
      case "media.delete": {
        const { POST } = await import("@/app/api/admin/media/ops/route");
        const source = action.folder ? { kind: "folder", folderPath: folderOf(action.key) } : { kind: "file", key: action.key };
        const operation = action.type === "media.rename" ? { action: "rename", newName: action.name }
          : action.type === "media.move" ? { action: "move", targetFolder: folderOf(action.destination) } : { action: "delete" };
        const result = await decoded(await POST(request({ ...source, ...operation })));
        return { id: result.key ?? (result.folderPath ? `media/${result.folderPath}` : action.key) };
      }
      case "media.upload":
      case "media.replace":
        throw new ManagementFailure("invalid");
      case "media.copy": {
        const inLibrary = action.key.startsWith("media/");
        const { POST } = inLibrary ? await import("@/app/api/admin/media/ops/route") : await import("@/app/api/admin/media/storage/route");
        const source = action.folder ? { folderPath: inLibrary ? folderOf(action.key) : action.key, kind: "folder" } : { key: action.key, kind: "file" };
        const result = await decoded(await POST(request({ action: "copy", targetFolder: folderOf(action.destination), ...source })));
        return { id: result.key ?? `media/${result.folderPath}` };
      }
      case "meet.create": {
        const { POST } = await import("@/app/api/admin/meet/create/route");
        const { title, slug, accessType, invitedEmails } = action;
        const result = await decoded(await POST(request({ title, slug, accessType, invitedEmails })));
        const space = result.space;
        if (!space || typeof space.name !== "string") throw new ManagementFailure("uncertain");
        return {
          id: space.name,
          space: {
            name: space.name, title: space.title, meetingCode: space.meetingCode,
            ...(typeof space.meetingUri === "string" ? { meetingUri: space.meetingUri } : {}),
            ...(typeof space.slug === "string" ? { slug: space.slug } : {}),
            ...(typeof space.hostEmail === "string" ? { hostEmail: space.hostEmail } : {}),
            invitedEmails: space.invitedEmails ?? [],
          },
          warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
        };
      }
      case "meet.end": {
        const { POST } = await import("@/app/api/admin/meet/end/route");
        await decoded(await POST(request({ spaceName: action.spaceName })));
        return { id: action.spaceName };
      }
      case "meet.delete": {
        const { DELETE } = await import("@/app/api/admin/meet/records/[id]/delete/route");
        const { getConferenceRecord } = await import("@/lib/google-meet");
        await decoded(await DELETE(request({}), { params: Promise.resolve({ id: action.id }) }));
        // The web endpoint can acknowledge an attempt even when Google DELETE failed.
        try { await getConferenceRecord(action.id); }
        catch (error) {
          if (error instanceof Error && /^Google Meet API error \(404\b/.test(error.message)) return { id: action.id };
          throw error;
        }
        throw new ManagementFailure("uncertain");
      }
    }
  };
}
