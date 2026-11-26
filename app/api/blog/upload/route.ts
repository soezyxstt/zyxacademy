import { NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { session } from "@/db/schema";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards";
import { getPeranCodes, hasPeranFromCodes } from "@/lib/auth/authorization";
import { getNativeOperationsAdmin } from "@/lib/auth/native-operations-admin";
import { getAuthSession } from "@/lib/auth-session";
import { readBoundedMultipart } from "@/lib/bounded-multipart";
import { blogThumbnailMimeTypes, blogUploadMaxBytes } from "@/lib/blog/upload-policy";
import { detectFormFileMime } from "@/lib/forms/file-types";
import { storage } from "@/lib/storage";
import { joinKey, userFileLeaf } from "@/lib/storage/keys";

const ALLOWED_TYPES: readonly string[] = [...blogThumbnailMimeTypes, "video/mp4", "video/webm"];
const nativeUserHeader = "x-native-operations-user-id";
const nativeSessionHeader = "x-native-operations-session-id";
const nativeMultipartMaxBytes = blogUploadMaxBytes + 64 * 1024;

async function hasActiveSession(accountId: string, sessionId: string) {
  const [active] = await db.select({ id: session.id }).from(session)
    .where(and(eq(session.id, sessionId), eq(session.userId, accountId), gt(session.expiresAt, new Date()))).limit(1);
  return Boolean(active);
}

async function checkNativeAdmin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return { status: 403 } as const;
  const admin = await getNativeOperationsAdmin();
  if (!admin.ok) return { status: admin.status } as const;
  const auth = await getAuthSession();
  const sessionId = auth?.session?.id;
  if (req.headers.get(nativeUserHeader) !== admin.user.id || !sessionId ||
      req.headers.get(nativeSessionHeader) !== sessionId || auth.user.id !== admin.user.id) return { status: 403 } as const;
  if (!await hasActiveSession(admin.user.id, sessionId)) return { status: 403 } as const;
  return { status: 200, accountId: admin.user.id, sessionId } as const;
}

export async function POST(req: Request) {
  const native = req.headers.has(nativeUserHeader) || req.headers.has(nativeSessionHeader);
  try {
    const binding = native ? await checkNativeAdmin(req) : undefined;
    if (binding && binding.status !== 200) return NextResponse.json({ error: "forbidden" }, { status: binding.status });
    if (!binding) await assertTutorOrAdmin();
    let formData: FormData;
    if (native) {
      const parsed = await readBoundedMultipart(req, nativeMultipartMaxBytes);
      if (parsed.status === "size") return NextResponse.json({ error: "payload-too-large" }, { status: 413 });
      if (parsed.status !== "parsed") return NextResponse.json({ error: "invalid-multipart" }, { status: 400 });
      formData = parsed.form;
    } else {
      formData = await req.formData();
    }
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

    if (binding) {
      // Recheck the uncached permissions and session after reading the multipart body.
      const [roles, active] = await Promise.all([
        getPeranCodes(binding.accountId), hasActiveSession(binding.accountId, binding.sessionId),
      ]);
      if (!active || !hasPeranFromCodes(roles, "admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
