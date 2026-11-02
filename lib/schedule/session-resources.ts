import { affectedRows } from "@/lib/mutation-result";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { asc, and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bookingResources,
  bookings,
  groupMembers,
  groups,
  pengguna,
  penggunaPeran,
  peran,
  tutorSlots,
  user,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { type DbExecutor } from "@/lib/auth/tutor-access";
import { normalizeDate } from "@/lib/date-utils";

export const BOOKING_RESOURCE_PHASES = ["pre", "post"] as const;
export type BookingResourcePhase = (typeof BOOKING_RESOURCE_PHASES)[number];

export const BOOKING_RESOURCE_KINDS = ["link", "file", "recording"] as const;
export type BookingResourceKind = (typeof BOOKING_RESOURCE_KINDS)[number];

export interface SessionResource {
  id: string;
  bookingId: string;
  phase: BookingResourcePhase;
  kind: BookingResourceKind;
  label: string;
  url: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  metadata: Record<string, unknown> | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AddBookingResourceInput {
  bookingId: string;
  phase: BookingResourcePhase;
  kind: BookingResourceKind;
  label: string;
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface BookingResourceOptions {
  actorId?: string;
  executor?: DbExecutor;
  now?: Date;
}

interface ResourceActor {
  id: string;
  isTutor: boolean;
  isAdmin: boolean;
}

interface BookingAccess {
  bookingId: string;
  groupId: string;
  tutorId: string;
}

export type ResourceMutationFailure = {
  success: false;
  error: string;
  reason: string;
};

export type AddBookingResourceResult =
  | { success: true; resource: SessionResource }
  | ResourceMutationFailure;

export type DeleteBookingResourceResult =
  | { success: true; resourceId: string }
  | ResourceMutationFailure;

export type GetBookingResourcesResult =
  | { success: true; resources: SessionResource[] }
  | ResourceMutationFailure;

function isResourceFailure(value: ResourceActor | ResourceMutationFailure): value is ResourceMutationFailure {
  return "success" in value && value.success === false;
}

function failure(error: string, reason: string): ResourceMutationFailure {
  return { success: false, error, reason };
}

function isResourcePhase(value: unknown): value is BookingResourcePhase {
  return typeof value === "string" && BOOKING_RESOURCE_PHASES.includes(value as BookingResourcePhase);
}

function isResourceKind(value: unknown): value is BookingResourceKind {
  return typeof value === "string" && BOOKING_RESOURCE_KINDS.includes(value as BookingResourceKind);
}

function toSessionResource(row: typeof bookingResources.$inferSelect): SessionResource {
  return {
    id: row.id,
    bookingId: row.bookingId,
    phase: row.phase,
    kind: row.kind,
    label: row.label,
    url: row.url,
    fileName: row.fileName ?? null,
    mimeType: row.mimeType ?? null,
    sizeBytes: row.sizeBytes ?? null,
    metadata: row.metadata ?? null,
    createdById: row.createdById,
    createdAt: normalizeDate(row.createdAt),
    updatedAt: normalizeDate(row.updatedAt),
  };
}

async function resolveResourceActor(
  options: BookingResourceOptions,
  client: typeof db,
): Promise<ResourceActor | ResourceMutationFailure> {
  let actorId: string | undefined;

  if (options.executor && options.actorId?.trim()) {
    actorId = options.actorId.trim();
  } else {
    let sessionHeaders: Headers | undefined;
    try {
      sessionHeaders = await headers();
    } catch {
      sessionHeaders = undefined;
    }
    const session = await auth.api.getSession({
      headers: sessionHeaders ?? new Headers(),
    });
    actorId = session?.user?.id;
  }

  if (!actorId) return failure("Anda harus masuk untuk mengakses resource sesi.", "AUTH_REQUIRED");

  const userRows = await client
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.id, actorId))
    .limit(1);
  if (userRows.length === 0) return failure("Pengguna tidak ditemukan.", "USER_NOT_FOUND");

  const identityRows = await client
    .select({ status: pengguna.status })
    .from(pengguna)
    .where(eq(pengguna.id, actorId))
    .limit(1);
  if (identityRows[0]?.status && identityRows[0].status !== "active") {
    return failure("Akun pengguna tidak aktif.", "USER_INACTIVE");
  }

  const roleRows = await client
    .select({ code: peran.code })
    .from(penggunaPeran)
    .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
    .where(eq(penggunaPeran.penggunaId, actorId));
  const roleCodes = new Set<string>(roleRows.map((row) => row.code));
  if (userRows[0].role) {
    roleCodes.add(userRows[0].role === "teacher" ? "tutor" : userRows[0].role);
  }

  return {
    id: actorId,
    isTutor: roleCodes.has("tutor") || roleCodes.has("teacher"),
    isAdmin: roleCodes.has("admin"),
  };
}

async function getBookingAccess(
  bookingId: string,
  client: typeof db,
): Promise<BookingAccess | null> {
  const rows = await client
    .select({
      bookingId: bookings.id,
      groupId: bookings.groupId,
      tutorId: tutorSlots.tutorId,
    })
    .from(bookings)
    .innerJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  return rows[0] ?? null;
}

async function isActiveGroupMember(
  actorId: string,
  groupId: string,
  client: typeof db,
): Promise<boolean> {
  const rows = await client
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.groupId, groups.id))
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, actorId),
        eq(groups.status, "active"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function canReadResource(
  actor: ResourceActor,
  access: BookingAccess,
  client: typeof db,
): Promise<boolean> {
  if (actor.isAdmin || actor.isTutor && actor.id === access.tutorId) return true;
  return isActiveGroupMember(actor.id, access.groupId, client);
}

async function canWriteResource(
  actor: ResourceActor,
  phase: BookingResourcePhase,
  access: BookingAccess,
  client: typeof db,
): Promise<boolean> {
  if (phase === "post") return actor.isAdmin || actor.isTutor && actor.id === access.tutorId;
  return isActiveGroupMember(actor.id, access.groupId, client);
}

function validateResourceInput(input: AddBookingResourceInput): ResourceMutationFailure | null {
  if (!input || typeof input.bookingId !== "string" || !input.bookingId.trim()) {
    return failure("Sesi tutorial tidak valid.", "BOOKING_ID_REQUIRED");
  }
  if (!isResourcePhase(input.phase)) {
    return failure("Fase resource tidak valid.", "INVALID_PHASE");
  }
  if (!isResourceKind(input.kind)) {
    return failure("Jenis resource tidak valid.", "INVALID_KIND");
  }
  if (typeof input.label !== "string" || !input.label.trim()) {
    return failure("Label resource wajib diisi.", "LABEL_REQUIRED");
  }
  if (typeof input.url !== "string" || !input.url.trim()) {
    return failure("URL resource wajib diisi.", "URL_REQUIRED");
  }
  if (
    input.sizeBytes !== undefined &&
    input.sizeBytes !== null &&
    (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 0)
  ) {
    return failure("Ukuran resource tidak valid.", "INVALID_SIZE");
  }
  return null;
}

/** Adds a normalized pre-session or post-session resource with phase-aware authorization. */
export async function addBookingResource(
  input: AddBookingResourceInput,
  options: BookingResourceOptions = {},
): Promise<AddBookingResourceResult> {
  const client = (options.executor ?? db) as typeof db;
  const inputFailure = validateResourceInput(input);
  if (inputFailure) return inputFailure;

  const actor = await resolveResourceActor(options, client);
  if (isResourceFailure(actor)) return actor;

  const access = await getBookingAccess(input.bookingId.trim(), client);
  if (!access) return failure("Jadwal tutorial tidak ditemukan.", "BOOKING_NOT_FOUND");
  if (!(await canWriteResource(actor, input.phase, access, client))) {
    return failure("Anda tidak berwenang menambahkan resource ini.", "RESOURCE_WRITE_FORBIDDEN");
  }

  const now = options.now ?? new Date();
  const row: typeof bookingResources.$inferInsert = {
    id: randomUUID(),
    bookingId: input.bookingId.trim(),
    phase: input.phase,
    kind: input.kind,
    label: input.label.trim(),
    url: input.url.trim(),
    fileName: input.fileName?.trim() || null,
    mimeType: input.mimeType?.trim() || null,
    sizeBytes: input.sizeBytes ?? null,
    metadata: input.metadata ?? null,
    createdById: actor.id,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await client.insert(bookingResources).values(row);
    return { success: true, resource: toSessionResource(row as typeof bookingResources.$inferSelect) };
  } catch (error) {
    console.error("Add booking resource error:", error);
    return failure("Resource sesi gagal disimpan.", "RESOURCE_WRITE_FAILED");
  }
}

/** Deletes one normalized resource after re-checking its booking and phase access. */
export async function deleteBookingResource(
  resourceId: string,
  options: BookingResourceOptions = {},
): Promise<DeleteBookingResourceResult> {
  const client = (options.executor ?? db) as typeof db;
  const targetResourceId = typeof resourceId === "string" ? resourceId.trim() : "";
  if (!targetResourceId) return failure("Resource tidak ditemukan.", "RESOURCE_ID_REQUIRED");

  const actor = await resolveResourceActor(options, client);
  if (isResourceFailure(actor)) return actor;

  const rows = await client
    .select({
      id: bookingResources.id,
      phase: bookingResources.phase,
      bookingId: bookings.id,
      groupId: bookings.groupId,
      tutorId: tutorSlots.tutorId,
    })
    .from(bookingResources)
    .innerJoin(bookings, eq(bookingResources.bookingId, bookings.id))
    .innerJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id))
    .where(eq(bookingResources.id, targetResourceId))
    .limit(1);
  const resource = rows[0];
  if (!resource) return failure("Resource tidak ditemukan.", "RESOURCE_NOT_FOUND");

  const access: BookingAccess = {
    bookingId: resource.bookingId,
    groupId: resource.groupId,
    tutorId: resource.tutorId,
  };
  if (!(await canWriteResource(actor, resource.phase, access, client))) {
    return failure("Anda tidak berwenang menghapus resource ini.", "RESOURCE_DELETE_FORBIDDEN");
  }

  try {
    const result = await client
      .delete(bookingResources)
      .where(eq(bookingResources.id, targetResourceId));
    if (affectedRows(result) === 0) {
      return failure("Resource tidak ditemukan.", "RESOURCE_NOT_FOUND");
    }
    return { success: true, resourceId: targetResourceId };
  } catch (error) {
    console.error("Delete booking resource error:", error);
    return failure("Resource sesi gagal dihapus.", "RESOURCE_DELETE_FAILED");
  }
}

/** Returns normalized resources for a booking after phase-independent read authorization. */
export async function getBookingResources(
  bookingId: string,
  options: BookingResourceOptions = {},
): Promise<GetBookingResourcesResult> {
  const client = (options.executor ?? db) as typeof db;
  const targetBookingId = typeof bookingId === "string" ? bookingId.trim() : "";
  if (!targetBookingId) return failure("Sesi tutorial tidak valid.", "BOOKING_ID_REQUIRED");

  const actor = await resolveResourceActor(options, client);
  if (isResourceFailure(actor)) return actor;

  const access = await getBookingAccess(targetBookingId, client);
  if (!access) return failure("Jadwal tutorial tidak ditemukan.", "BOOKING_NOT_FOUND");
  if (!(await canReadResource(actor, access, client))) {
    return failure("Anda tidak berwenang membaca resource ini.", "RESOURCE_READ_FORBIDDEN");
  }

  try {
    const rows = await client
      .select()
      .from(bookingResources)
      .where(eq(bookingResources.bookingId, targetBookingId))
      .orderBy(asc(bookingResources.createdAt), asc(bookingResources.id));

    return { success: true, resources: rows.map(toSessionResource) };
  } catch (error) {
    console.error("Get booking resources error:", error);
    return failure("Resource sesi gagal dimuat.", "RESOURCE_READ_FAILED");
  }
}
