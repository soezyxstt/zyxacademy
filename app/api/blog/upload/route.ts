import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { session } from "@/db/schema";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards";
import { getPeranCodes, hasPeranFromCodes } from "@/lib/auth/authorization";
import { getNativeOperationsAdmin } from "@/lib/auth/native-operations-admin";
import { getAuthSession } from "@/lib/auth-session";
import { readBoundedMultipart } from "@/lib/bounded-multipart";
import { blogBodyMimeTypes, blogThumbnailMimeTypes, blogUploadMaxBytes } from "@/lib/blog/upload-policy";
import { getBlogArticle, BlogServiceError } from "@/lib/blog/service";
import { detectFormFileMime } from "@/lib/forms/file-types";
import { storage } from "@/lib/storage";
import { joinKey, userFileLeaf } from "@/lib/storage/keys";
import { matchesCourseVideoUploadHeader } from "@/lib/video/upload-policy";

const nativeUserHeader = "x-native-operations-user-id";
const nativeSessionHeader = "x-native-operations-session-id";
const nativeDraftHeader = "x-native-blog-draft";
const nativeMultipartMaxBytes = blogUploadMaxBytes + 64 * 1024;
const fileExtensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm" };

function nativeReply(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function nativeBodyKey(file: File, accountId: string, sessionId: string, draft: string) {
  const hash = createHash("sha256").update(JSON.stringify([accountId, sessionId, draft, file.type]));
  const chunks = file.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await chunks.read();
      if (done) break;
      hash.update(value);
    }
  } finally {
    chunks.releaseLock();
  }
  return joinKey("blog", `${hash.digest("hex")}.${fileExtensions[file.type]}`);
}

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
    if (binding && binding.status !== 200) return nativeReply({ error: "forbidden" }, binding.status);
    if (!binding) await assertTutorOrAdmin();
    const purpose = req.headers.get("x-native-blog-upload-purpose");
    const draft = req.headers.get(nativeDraftHeader);
    const body = Boolean(binding && purpose === "body");
    if (binding && ((purpose !== null && purpose !== "thumbnail" && purpose !== "body") ||
        (draft !== null && !/^(?:new|article:[A-Za-z0-9_-]{1,180})$/.test(draft)) || (body && !draft))) {
      return nativeReply({ error: "invalid-draft" }, 400);
    }
    if (body && draft?.startsWith("article:") && binding?.status === 200) {
      await getBlogArticle(binding.accountId, draft.slice("article:".length));
    }
    let formData: FormData;
    if (native) {
      const parsed = await readBoundedMultipart(req, nativeMultipartMaxBytes);
      if (parsed.status === "size") return nativeReply({ error: "payload-too-large" }, 413);
      if (parsed.status !== "parsed" || parsed.form.getAll("file").length !== 1) return nativeReply({ error: "invalid-multipart" }, 400);
      formData = parsed.form;
    } else {
      formData = await req.formData();
    }
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const permitted: readonly string[] = native && !body ? blogThumbnailMimeTypes : blogBodyMimeTypes;
    if (!permitted.includes(file.type)) {
      if (native) return nativeReply({ error: "invalid-type" }, 400);
      return NextResponse.json({ error: "Invalid file type. Only JPEG, PNG, WEBP, GIF, MP4, and WEBM are allowed." }, { status: 400 });
    }

    if (file.size > blogUploadMaxBytes) {
      if (native) return nativeReply({ error: "payload-too-large" }, 413);
      return NextResponse.json({ error: "File size exceeds the 20MB limit." }, { status: 400 });
    }
    if (native) {
      const verified = file.size > 0 && (file.type.startsWith("image/")
        ? await detectFormFileMime(file, blogThumbnailMimeTypes) === file.type
        : matchesCourseVideoUploadHeader(new Uint8Array(await file.slice(0, 32).arrayBuffer()), file.type));
      if (!file.name || !verified) return nativeReply({ error: "invalid-type" }, 400);
    }

    // Retries of the same editor upload address the same object. Keep the
    // content identity private and leave the legacy web and thumbnail keys intact.
    const key = body && draft && binding?.status === 200
      ? await nativeBodyKey(file, binding.accountId, binding.sessionId, draft)
      : joinKey("blog", userFileLeaf(file.name));
    const previouslyUploaded = body && await storage.exists(key);

    if (binding) {
      // Recheck the uncached permissions and session after reading the multipart body.
      const [roles, active] = await Promise.all([
        getPeranCodes(binding.accountId), hasActiveSession(binding.accountId, binding.sessionId),
      ]);
      if (!active || !hasPeranFromCodes(roles, "admin")) return nativeReply({ error: "forbidden" }, 403);
    }

    if (previouslyUploaded) return nativeReply({ url: storage.getUrl(key) });
    const result = await storage.upload(file, key, file.type, { key });

    const payload = { url: storage.getUrl(result.key) };
    return native ? nativeReply(payload) : NextResponse.json(payload);
  } catch (error: any) {
    if (native) {
      if (error instanceof BlogServiceError && error.code === "NOT_FOUND") return nativeReply({ error: "not-found" }, 404);
      if (error instanceof BlogServiceError && error.code === "BLOG_FORBIDDEN") return nativeReply({ error: "forbidden" }, 403);
      return nativeReply({ error: "unavailable" }, 503);
    }
    console.error("Error in blog media upload:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: error.status || 500 }
    );
  }
}
