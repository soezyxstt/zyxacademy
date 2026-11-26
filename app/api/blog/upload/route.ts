import { NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { session } from "@/db/schema";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards";
import { getNativeOperationsAdmin } from "@/lib/auth/native-operations-admin";
import { getAuthSession } from "@/lib/auth-session";
import { blogThumbnailMimeTypes, blogUploadMaxBytes } from "@/lib/blog/upload-policy";
import { detectFormFileMime } from "@/lib/forms/file-types";
import { storage } from "@/lib/storage";
import { joinKey, userFileLeaf } from "@/lib/storage/keys";

const ALLOWED_TYPES: readonly string[] = [...blogThumbnailMimeTypes, "video/mp4", "video/webm"];
const nativeUserHeader = "x-native-operations-user-id";
const nativeSessionHeader = "x-native-operations-session-id";

async function checkNativeAdmin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return 403;
  const admin = await getNativeOperationsAdmin();
  if (!admin.ok) return admin.status;
  const auth = await getAuthSession();
  const sessionId = auth?.session?.id;
  if (req.headers.get(nativeUserHeader) !== admin.user.id || !sessionId ||
      req.headers.get(nativeSessionHeader) !== sessionId || auth.user.id !== admin.user.id) return 403;
  const [active] = await db.select({ id: session.id }).from(session)
    .where(and(eq(session.id, sessionId), eq(session.userId, admin.user.id), gt(session.expiresAt, new Date()))).limit(1);
  return active ? 200 : 403;
}

export async function POST(req: Request) {
  const native = req.headers.has(nativeUserHeader) || req.headers.has(nativeSessionHeader);
  try {
    if (native) {
      const status = await checkNativeAdmin(req);
      if (status !== 200) return NextResponse.json({ error: "forbidden" }, { status });
    } else {
      await assertTutorOrAdmin();
    }

    const formData = await req.formData().catch(error => {
      if (!native) throw error;
      return null;
    });
    if (!formData) return NextResponse.json({ error: "invalid-multipart" }, { status: 400 });
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const permitted: readonly string[] = native ? blogThumbnailMimeTypes : ALLOWED_TYPES;
    if (!permitted.includes(file.type)) {
      if (native) return NextResponse.json({ error: "invalid-type" }, { status: 400 });
      return NextResponse.json({ error: "Invalid file type. Only JPEG, PNG, WEBP, GIF, MP4, and WEBM are allowed." }, { status: 400 });
    }

    if (file.size > blogUploadMaxBytes) {
      if (native) return NextResponse.json({ error: "payload-too-large" }, { status: 413 });
      return NextResponse.json({ error: "File size exceeds the 20MB limit." }, { status: 400 });
    }
    if (native && (!file.name || file.size === 0 || await detectFormFileMime(file, blogThumbnailMimeTypes) !== file.type)) {
      return NextResponse.json({ error: "invalid-type" }, { status: 400 });
    }

    const key = joinKey("blog", userFileLeaf(file.name));

    // Upload to R2 via generic storage interface (pass standard File directly)
    const result = await storage.upload(file, key, file.type, { key });

    return NextResponse.json({ url: storage.getUrl(result.key) });
  } catch (error: any) {
    if (native) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    console.error("Error in blog media upload:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: error.status || 500 }
    );
  }
}
