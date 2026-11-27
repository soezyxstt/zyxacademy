import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { headers as nextHeaders } from "next/headers";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customForms, diktatMateri, diktats, mataKuliah, studentQuizAttempts, quizTemplates, courseVideos } from "@/db/schema";
import { auth } from "@/lib/auth";
import { hasPeran } from "@/lib/auth/authorization";
import { isFormResponseAttachmentFolder } from "@/lib/forms/attachment";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { canAccessCourseContent, resolveCourseAccess } from "@/lib/student/course-access";
import { isCourseVideoKey, isCourseVideoThumbnailKey, isPrivateAttachmentKey, isProtectedCourseDiktatPdfKey, isProtectedProductDiktatPdfKey, isSafeKey, leafFilename, quizAttachmentPrefix, scopedStorageFileKind } from "@/lib/storage/keys";
import { getS3StorageConfig } from "@/lib/storage/r2";

const config = getS3StorageConfig(process.env.STORAGE_PROVIDER_MODE === "neon" ? "neon" : "r2");
const bucket = config.bucket;
const s3 = new S3Client(config.client);

function privateFileNotFound() {
  return new Response("File not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
}

function normalizeStorageKey(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim().split(/[?#]/, 1)[0];
  let candidate = raw;
  const proxyMarkers = ["/api/storage/file/", "/f/"];
  const relativeMarker = proxyMarkers.find((marker) => raw.startsWith(marker));
  if (relativeMarker) {
    candidate = raw.slice(relativeMarker.length);
  } else if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const pathname = url.pathname;
      const proxyMarker = proxyMarkers.find((marker) => pathname.includes(marker));
      if (proxyMarker) candidate = pathname.split(proxyMarker).pop() || "";
      else {
        const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
        if (!publicBase || !raw.startsWith(`${publicBase}/`)) return null;
        candidate = pathname.slice(new URL(publicBase).pathname.replace(/\/$/, "").length + 1);
      }
    } catch {
      return null;
    }
  }
  try {
    const decoded = decodeURIComponent(candidate).replace(/^\/+/, "");
    return decoded || null;
  } catch {
    return null;
  }
}

type DiktatAuthorization = {
  matched: boolean;
  allowed: boolean;
};

async function canAccessFormFile(key: string, search: string): Promise<boolean> {
  try {
    if (!isSafeKey(key)) return false;
    if (isFormResponseAttachmentFolder(key.split("/")[1])) {
      const session = await auth.api.getSession({ headers: await nextHeaders() });
      return Boolean(session?.user?.id && await hasPeran(session.user.id, "admin"));
    }
    const origin = new URL(resolveAuthBaseUrl()).origin;
    const paths = new Set([key, encodeURI(key), key.split("/").map(encodeURIComponent).join("/")]);
    const urls = [...paths].flatMap((path) => {
      const relative = `/api/storage/file/${path}`;
      return [relative, `${origin}${relative}`, ...(search.length <= 2048 && search ? [`${relative}${search}`, `${origin}${relative}${search}`] : [])];
    });
    // shortcut: image references have no JSONB index, add indexed references if form volume makes this lookup slow.
    const [publicReference] = await db.select({ id: customForms.id }).from(customForms).where(and(
      isNull(customForms.deletedAt),
      or(...urls.map((url) => sql`${customForms.questions} @> ${JSON.stringify([{ imageUrl: url }])}::jsonb`)),
    )).limit(1);
    if (publicReference) return true;

    const session = await auth.api.getSession({ headers: await nextHeaders() });
    // Submission answers are client-supplied and do not prove upload ownership.
    return Boolean(session?.user?.id && await hasPeran(session.user.id, "admin"));
  } catch {
    return false;
  }
}

function storageKeyCandidates(key: string): string[] {
  const candidates = new Set<string>();
  const keyVariants = new Set([key, encodeURI(key)]);
  const publicBase = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "");

  for (const keyVariant of keyVariants) {
    candidates.add(keyVariant);
    candidates.add(`/api/storage/file/${keyVariant}`);
    candidates.add(`/f/${keyVariant}`);
    if (publicBase) candidates.add(`${publicBase}/${keyVariant}`);
  }

  return [...candidates];
}

async function resolveDiktatAuthorization(key: string): Promise<DiktatAuthorization> {
  try {
    const candidates = storageKeyCandidates(key);
    const [canonicalRows, legacyRows] = await Promise.all([
      db
        .select({ key: diktatMateri.fileKey, courseId: mataKuliah.id, chapterId: diktatMateri.babId })
        .from(diktatMateri)
        .innerJoin(mataKuliah, eq(diktatMateri.mataKuliahId, mataKuliah.id))
        .where(and(
          eq(diktatMateri.status, "published"),
          isNotNull(diktatMateri.fileKey),
          inArray(diktatMateri.fileKey, candidates),
        )),
      db
        .select({ key: diktats.fileUrl, courseId: diktats.courseId, chapterIds: diktats.chapterIds })
        .from(diktats)
        .where(and(eq(diktats.status, "ready"), inArray(diktats.fileUrl, candidates))),
    ]);
    const matches = [
      ...canonicalRows.map((row) => ({ key: row.key, courseId: row.courseId, chapterIds: row.chapterId ? [row.chapterId] : [], source: "canonical" as const })),
      ...legacyRows.map((row) => ({ key: row.key, courseId: row.courseId, chapterIds: Array.isArray(row.chapterIds) ? row.chapterIds : [], source: "legacy" as const })),
    ].filter(
      (row): row is { key: string; courseId: string; chapterIds: string[]; source: "canonical" | "legacy" } => normalizeStorageKey(row.key) === key,
    );
    if (matches.length === 0) {
      // Rollback artifacts must not become public when no active row references them.
      const protectedKey = isProtectedCourseDiktatPdfKey(key);
      return { matched: protectedKey, allowed: !protectedKey };
    }

    const identities = await Promise.all(
      [...new Set(matches.map((row) => row.courseId))].map((courseId) => resolveCourseIdentity(courseId)),
    );
    if (identities.some((identity) => !identity || identity.status !== "active")) {
      return { matched: true, allowed: false };
    }
    const canonicalCourseIds = new Set(
      identities.map((identity) => identity?.canonicalId ?? identity?.primaryId),
    );
    if (canonicalCourseIds.size !== 1) return { matched: true, allowed: false };
    const courseId = [...canonicalCourseIds][0];
    if (!courseId) return { matched: true, allowed: false };
    const session = await auth.api.getSession({ headers: await nextHeaders() });
    if (!session?.user?.id) return { matched: true, allowed: false };
    const role = (session.user as { role?: string | null }).role;
    const access = await resolveCourseAccess({
      courseId,
      userId: session.user.id,
      roleHint: role,
    });
    return {
      matched: true,
      allowed: access.hasCourseAccess && access.capabilities.canDownloadDiktat
        && (access.tier !== "free" || matches.every((row) => canAccessCourseContent(access, "diktat-download", row.chapterIds))),
    };
  } catch {
    // A storage authorization failure must not turn into a downloadable file.
    return { matched: true, allowed: false };
  }
}

type QuizAttachmentAuthorization = {
  matched: boolean;
  allowed: boolean;
};

/**
 * Resolves access authorization for quiz essay attachment keys.
 * Ensures attachments are accessible only by the student who uploaded them, authorized tutors for the course, or admins.
 */
async function resolveQuizAttachmentAuthorization(key: string): Promise<QuizAttachmentAuthorization> {
  const isQuizAttachment = key.startsWith("quizzes/") && key.includes("/attachments/");
  if (!isQuizAttachment) return { matched: false, allowed: true };

  try {
    const session = await auth.api.getSession({ headers: await nextHeaders() });
    if (!session?.user?.id) return { matched: true, allowed: false };
    const userId = session.user.id;
    const role = (session.user as { role?: string | null }).role;

    if (role === "admin") return { matched: true, allowed: true };

    // Check if current user is the student whose attempt contains this attachment
    const userAttempts = await db
      .select({
        id: studentQuizAttempts.id,
        templateId: studentQuizAttempts.templateId,
        status: studentQuizAttempts.status,
        answersSnapshot: studentQuizAttempts.answersSnapshot,
      })
      .from(studentQuizAttempts)
      .where(eq(studentQuizAttempts.studentId, userId));

    for (const att of userAttempts) {
      const prefix = quizAttachmentPrefix(att.templateId);
      if (!key.startsWith(prefix)) continue;

      const rawSnap = typeof att.answersSnapshot === "string" 
        ? att.answersSnapshot 
        : JSON.stringify(att.answersSnapshot ?? {});
      if (rawSnap.includes(key)) {
        return { matched: true, allowed: true };
      }
    }

    // Check if user is an authorized tutor for the course of this quiz
    const allTemplates = await db
      .select({ id: quizTemplates.id, courseId: quizTemplates.courseId })
      .from(quizTemplates);

    const matchedTemplate = allTemplates.find((t) =>
      key.startsWith(quizAttachmentPrefix(t.id))
    );

    if (matchedTemplate?.courseId) {
      const { requireTutorCourseAccess } = await import("@/lib/auth/tutor-access");
      try {
        await requireTutorCourseAccess(userId, matchedTemplate.courseId, { allowAdmin: true });
        return { matched: true, allowed: true };
      } catch {
        // Not authorized as tutor for this course
      }
    }

    return { matched: true, allowed: false };
  } catch {
    return { matched: true, allowed: false };
  }
}

type CourseVideoAuthorization = {
  matched: boolean;
  allowed: boolean;
};

/**
 * Resolves access authorization for course video keys.
 * Ensures course videos can only be streamed or downloaded by enrolled students, assigned tutors, or admins.
 */
async function resolveCourseVideoAuthorization(key: string): Promise<CourseVideoAuthorization> {
  if (!isCourseVideoKey(key)) return { matched: false, allowed: true };

  try {
    const parts = key.split("/");
    const courseSlug = parts[1];
    if (!courseSlug) return { matched: true, allowed: false };

    const session = await auth.api.getSession({ headers: await nextHeaders() });
    if (!session?.user?.id) return { matched: true, allowed: false };

    const access = await resolveCourseAccess({
      courseId: courseSlug,
      userId: session.user.id,
      roleHint: (session.user as { role?: string | null }).role,
    });

    if (!access.hasFullContentAccess) return { matched: true, allowed: false };
    const validCourseIdList = [...new Set([access.courseId, access.canonicalCourseId, access.legacyCourseId].filter((id): id is string => Boolean(id)))];
    if (validCourseIdList.length === 0) return { matched: true, allowed: false };
    const rows = await db
      .select({ courseId: courseVideos.courseId, chapterId: courseVideos.chapterId })
      .from(courseVideos)
      .where(and(inArray(courseVideos.courseId, validCourseIdList), eq(courseVideos.videoUrl, key)));
    return {
      matched: true,
      allowed:
        rows.length > 0 &&
        (access.tier === "staff" ||
          rows.every((row) => !row.chapterId || access.scopedChapterIds.includes(row.chapterId))),
    };
  } catch {
    return { matched: true, allowed: false };
  }
}

type AuthorizedStorageRequest =
  | { ok: false; response: Response; isScopedFile: boolean }
  | {
      ok: true;
      key: string;
      isDownload: boolean;
      isScopedFile: boolean;
      isFormFile: boolean;
      isVideoThumbnail: boolean;
      diktatAuthorization: DiktatAuthorization;
      quizAuthorization: QuizAttachmentAuthorization;
      videoAuthorization: CourseVideoAuthorization;
      objectVersion?: string;
    };

async function authorizeStorageRequest(
  req: Request,
  params: Promise<{ key: string[] }>,
): Promise<AuthorizedStorageRequest> {
  const { key: keyParts } = await params;
  const requestedKey = Array.isArray(keyParts) ? keyParts.join("/") : keyParts;
  const key = normalizeStorageKey(requestedKey) ?? requestedKey;

  if (!key) {
    return { ok: false, response: new Response("Missing file key", { status: 400 }), isScopedFile: false };
  }

  if (isPrivateAttachmentKey(requestedKey) || isPrivateAttachmentKey(key)) {
    return { ok: false, response: privateFileNotFound(), isScopedFile: false };
  }

  // Private interactive assets are available only through scoped routes.
  const normalizedPath = new URL(`/${key.replace(/\\/g, "/").replace(/\/+/g, "/")}`, "http://storage.invalid").pathname.replace(/^\/+/, "");
  if ([key, normalizedPath].some((value) => /^overhaul\/(interactive-documents|question-visual-bindings)(?:\/|$)/.test(value))) {
    return { ok: false, response: new Response("File not found", { status: 404 }), isScopedFile: false };
  }

  // Product Bundle Diktat PDFs carry enrollment-gated course material. They
  // are served only by the authenticated admin preview and learner routes.
  if (isProtectedProductDiktatPdfKey(key)) {
    return { ok: false, response: new Response("File not found", { status: 404 }), isScopedFile: false };
  }

  const urlObj = new URL(req.url);
  const isDownload = urlObj.searchParams.get("download") === "1" || urlObj.searchParams.get("download") === "true";
  const scopedKind = scopedStorageFileKind(key) ?? scopedStorageFileKind(requestedKey);
  const isScopedFile = scopedKind !== null;
  let objectVersion: string | undefined;
  if (scopedKind) {
    if (!isSafeKey(key) || key.split("/").length !== 4 || key.split("/").some((part) => !part || part === ".")
      || scopedStorageFileKind(key) !== scopedKind) {
      return { ok: false, response: privateFileNotFound(), isScopedFile };
    }
    const session = await auth.api.getSession({ headers: await nextHeaders() });
    if (!session?.user?.id) return { ok: false, response: privateFileNotFound(), isScopedFile };
    const { authorizeScopedStorageFile } = await import("@/lib/storage/scoped-file-authorization");
    const authorization = await authorizeScopedStorageFile(
      scopedKind, key, session.user.id, storageKeyCandidates(key), urlObj.searchParams.get("submissionId"),
    );
    if (!authorization.allowed) return { ok: false, response: privateFileNotFound(), isScopedFile };
    if (authorization.owners) {
      // Submission snapshots come from the client. Confirm the uploader at the object boundary.
      const object = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      if (!object.Metadata?.uploadedby || !authorization.owners.has(object.Metadata.uploadedby) || !object.ETag) {
        return { ok: false, response: privateFileNotFound(), isScopedFile };
      }
      objectVersion = object.ETag;
    }
  }

  const isFormFile = key === "forms" || key.startsWith("forms/") || normalizedPath === "forms" || normalizedPath.startsWith("forms/");
  if (isFormFile && !(await canAccessFormFile(key, urlObj.search))) {
    return {
      ok: false,
      response: new Response("File not found", { status: 404, headers: { "Cache-Control": "private, no-store" } }),
      isScopedFile,
    };
  }

  const isVideoThumbnail = isCourseVideoThumbnailKey(key);
  const isCourseVideoAsset = isCourseVideoKey(key) || isVideoThumbnail;

  // Authorize Diktat delivery before fetching the object. The disposition
  // query only changes a browser hint and must never decide authorization.
  // Course video files and thumbnails cannot be Diktats, so skip the two
  // Diktat lookups on those hot media paths.
  const diktatAuthorization = isScopedFile || isCourseVideoAsset
    ? { matched: false, allowed: true }
    : await resolveDiktatAuthorization(key);
  if (diktatAuthorization.matched && !diktatAuthorization.allowed) {
    return { ok: false, response: new Response("File not found", { status: 404 }), isScopedFile };
  }

  // Authorize quiz attachment delivery before fetching the object
  const quizAuthorization = await resolveQuizAttachmentAuthorization(key);
  if (quizAuthorization.matched && !quizAuthorization.allowed) {
    return { ok: false, response: new Response("File not found", { status: 404 }), isScopedFile };
  }

  // Authorize course video delivery before fetching the object
  const videoAuthorization = await resolveCourseVideoAuthorization(key);
  if (videoAuthorization.matched && !videoAuthorization.allowed) {
    return { ok: false, response: new Response("File not found", { status: 404 }), isScopedFile };
  }

  return {
    ok: true,
    key,
    isDownload,
    isScopedFile,
    isFormFile,
    isVideoThumbnail,
    diktatAuthorization,
    quizAuthorization,
    videoAuthorization,
    objectVersion,
  };
}

function buildStorageResponseHeaders(
  authResult: Extract<AuthorizedStorageRequest, { ok: true }>,
  s3Res: {
    ContentType?: string;
    ContentLength?: number;
    ContentRange?: string;
    ETag?: string;
    LastModified?: Date;
  },
): Headers {
  const {
    key,
    isDownload,
    isScopedFile,
    isFormFile,
    isVideoThumbnail,
    diktatAuthorization,
    quizAuthorization,
    videoAuthorization,
  } = authResult;
  const headers = new Headers();
  if (s3Res.ContentType) {
    headers.set("Content-Type", s3Res.ContentType);
  } else {
    headers.set("Content-Type", "application/octet-stream");
  }

  if (s3Res.ContentLength !== undefined) {
    headers.set("Content-Length", s3Res.ContentLength.toString());
  }

  headers.set("Accept-Ranges", "bytes");
  if (s3Res.ContentRange) {
    headers.set("Content-Range", s3Res.ContentRange);
  }
  if (s3Res.ETag) {
    headers.set("ETag", s3Res.ETag);
  }
  if (s3Res.LastModified) {
    headers.set("Last-Modified", s3Res.LastModified.toUTCString());
  }

  // Only protected delivery depends on the current session. Keep unrelated
  // public storage objects on the cacheable response path.
  if (isScopedFile || isFormFile || diktatAuthorization.matched || quizAuthorization.matched || videoAuthorization.matched) {
    headers.set("Cache-Control", "private, no-store");
  } else if (isVideoThumbnail) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }
  if (isScopedFile || isFormFile) {
    headers.set("Content-Security-Policy", "sandbox");
    headers.set("X-Content-Type-Options", "nosniff");
  }

  // Extract clean filename (last path segment minus the {timestamp}-{hash}- prefix)
  const filename = leafFilename(key);

  headers.set(
    "Content-Disposition",
    `${isDownload ? "attachment" : "inline"}; filename="${filename.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );

  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, ETag");

  return headers;
}

function handleStorageProxyError(err: any, isScopedFile: boolean): Response {
  if (isScopedFile) return privateFileNotFound();
  if (err?.name === "NoSuchKey" || err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
    return new Response("File not found", {
      status: 404,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
  if (err?.name === "InvalidRange" || err?.$metadata?.httpStatusCode === 416) {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
  console.error("Storage proxy route error:", err);
  return new Response(err?.message || "Internal server error", {
    status: 500,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

/**
 * Handles object retrieval and streaming from storage proxy.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  let isScopedFile = false;
  try {
    const authResult = await authorizeStorageRequest(req, params);
    isScopedFile = authResult.isScopedFile;
    if (!authResult.ok) return authResult.response;

    const rangeHeader = req.headers.get("range");

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: authResult.key,
      Range: rangeHeader || undefined,
      ...(authResult.objectVersion ? { IfMatch: authResult.objectVersion } : {}),
    });

    const s3Res = await s3.send(command);

    if (!s3Res.Body) {
      return isScopedFile ? privateFileNotFound() : new Response("File not found", { status: 404 });
    }

    // Convert S3 body stream to Response (with Edge/Serverless compatibility conversion)
    const stream = s3Res.Body as any;
    let webStream = stream;
    if (stream && typeof stream.on === "function" && typeof stream.read === "function") {
      const { Readable } = require("stream");
      webStream = Readable.toWeb(stream);
    }

    const headers = buildStorageResponseHeaders(authResult, s3Res);
    const statusCode = s3Res.ContentRange || s3Res.$metadata?.httpStatusCode === 206 ? 206 : 200;

    return new Response(webStream, {
      status: statusCode,
      headers,
    });
  } catch (err: any) {
    return handleStorageProxyError(err, isScopedFile);
  }
}

/**
 * Handles metadata-only HEAD probes without opening an object body stream.
 */
export async function HEAD(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  let isScopedFile = false;
  try {
    const authResult = await authorizeStorageRequest(req, params);
    isScopedFile = authResult.isScopedFile;
    if (!authResult.ok) return authResult.response;

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: authResult.key,
      ...(authResult.objectVersion ? { IfMatch: authResult.objectVersion } : {}),
    });

    const s3Res = await s3.send(command);
    const headers = buildStorageResponseHeaders(authResult, s3Res);

    return new Response(null, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    return handleStorageProxyError(err, isScopedFile);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
    },
  });
}
