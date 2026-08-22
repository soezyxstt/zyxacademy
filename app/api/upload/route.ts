import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { bookings, groupMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { buildScheduleAttachmentKey, INVALID_OBJECT_KEY } from "@/lib/storage/keys";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user;

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_SIZE_BYTES + 64 * 1024) {
    return NextResponse.json(
      { error: "Ukuran berkas melebihi batas 10MB." },
      { status: 413 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Berkas tidak ditemukan." }, { status: 400 });
  }

  const folderRaw = formData.get("folder");
  const folder = typeof folderRaw === "string" ? folderRaw.trim() : "";
  const segments = folder.split("/").filter(Boolean);
  if (
    segments.length !== 4 ||
    segments[0] !== "schedules" ||
    (segments[3] !== "materials" && segments[3] !== "notes")
  ) {
    return NextResponse.json({ error: "Folder tujuan tidak valid." }, { status: 400 });
  }

  const bookingId = segments[1];
  const kind = segments[3] === "materials" ? "pre_session" : "post_session";

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    columns: { groupId: true },
    with: { slot: { columns: { tutorId: true } } },
  });

  if (!booking) {
    return NextResponse.json(
      { error: "Jadwal tutorial tidak ditemukan." },
      { status: 404 }
    );
  }

  const isAssignedTutor = booking.slot?.tutorId === user.id;

  if (kind === "pre_session") {
    const membership = await db.query.groupMembers.findFirst({
      where: and(
        eq(groupMembers.groupId, booking.groupId),
        eq(groupMembers.userId, user.id)
      ),
    });

    if (!membership && !isAssignedTutor) {
      return NextResponse.json(
        { error: "Anda tidak berwenang mengunggah berkas untuk sesi ini." },
        { status: 403 }
      );
    }
  } else if (!isAssignedTutor) {
    return NextResponse.json(
      { error: "Hanya tutor pengampu yang dapat mengunggah catatan sesi." },
      { status: 403 }
    );
  }

  const ext = getExtension(file.name);
  const expectedMime = ALLOWED_TYPES[ext];
  if (!expectedMime) {
    return NextResponse.json(
      { error: "Format berkas tidak didukung. Gunakan PDF, PNG, JPG, atau WebP." },
      { status: 415 }
    );
  }

  const normalizedMime = (file.type || "").toLowerCase();
  if (
    normalizedMime &&
    normalizedMime !== expectedMime &&
    !(normalizedMime === "image/jpg" && expectedMime === "image/jpeg")
  ) {
    return NextResponse.json(
      { error: "Tipe berkas tidak cocok dengan format yang diizinkan." },
      { status: 415 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Ukuran berkas melebihi batas 10MB." },
      { status: 413 }
    );
  }

  const key = buildScheduleAttachmentKey({
    bookingId,
    type: kind,
    filename: file.name,
  });

  try {
    const result = await storage.upload(file, file.name, expectedMime, {
      key,
      metadata: {
        uploadedBy: user.id,
        domain: kind === "pre_session" ? "schedule-materials" : "schedule-notes",
      },
    });

    return NextResponse.json({
      success: true,
      key: result.key,
      url: storage.getUrl(result.key),
      size: result.size,
      type: expectedMime,
    });
  } catch (err: any) {
    if (err?.message === INVALID_OBJECT_KEY) {
      return NextResponse.json({ error: "Kunci objek tidak aman." }, { status: 400 });
    }
    console.error("Schedule attachment upload error:", err);
    return NextResponse.json(
      { error: err?.message || "Gagal mengunggah berkas." },
      { status: 500 }
    );
  }
}
