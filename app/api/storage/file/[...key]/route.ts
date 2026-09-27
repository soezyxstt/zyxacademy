import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { headers as nextHeaders } from "next/headers";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { diktatMateri, diktats, mataKuliah, studentQuizAttempts, quizTemplates } from "@/db/schema";
import { auth } from "@/lib/auth";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { isProtectedProductDiktatPdfKey, leafFilename, quizAttachmentPrefix } from "@/lib/storage/keys";

const bucket = process.env.R2_BUCKET || "zyx";
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

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
        .select({ key: diktatMateri.fileKey, courseId: mataKuliah.id })
        .from(diktatMateri)
        .innerJoin(mataKuliah, eq(diktatMateri.mataKuliahId, mataKuliah.id))
        .where(and(
          eq(diktatMateri.status, "published"),
          isNotNull(diktatMateri.fileKey),
          inArray(diktatMateri.fileKey, candidates),
        )),
      db
        .select({ key: diktats.fileUrl, courseId: diktats.courseId })
        .from(diktats)
        .where(and(eq(diktats.status, "ready"), inArray(diktats.fileUrl, candidates))),
    ]);
    const matches = [
      ...canonicalRows.map((row) => ({ ...row, source: "canonical" as const })),
      ...legacyRows.map((row) => ({ ...row, source: "legacy" as const })),
    ].filter(
      (row): row is { key: string; courseId: string; source: "canonical" | "legacy" } => normalizeStorageKey(row.key) === key,
    );
    if (matches.length === 0) return { matched: false, allowed: true };

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
      allowed: access.hasCourseAccess && access.capabilities.canDownloadDiktat,
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
  const isVideoFile = key.startsWith("courses/") && key.includes("/videos/") && !key.includes("/videos/thumbnails/");
  if (!isVideoFile) return { matched: false, allowed: true };

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

    return {
      matched: true,
      allowed: access.isEnrolled || access.tier === "staff",
    };
  } catch {
    return { matched: true, allowed: false };
  }
}

/**
 * Handles object retrieval and streaming from Cloudflare R2 storage proxy.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key: keyParts } = await params;
    const requestedKey = Array.isArray(keyParts) ? keyParts.join("/") : keyParts;
    const key = normalizeStorageKey(requestedKey) ?? requestedKey;
    
    if (!key) {
      return new Response("Missing file key", { status: 400 });
    }

    // Product Bundle Diktat PDFs carry enrollment-gated course material. They
    // are served only by the authenticated admin preview and learner routes.
    if (isProtectedProductDiktatPdfKey(key)) {
      return new Response("File not found", { status: 404 });
    }

    const urlObj = new URL(req.url);
    const isDownload = urlObj.searchParams.get("download") === "1" || urlObj.searchParams.get("download") === "true";
    // Authorize Diktat delivery before fetching the object. The disposition
    // query only changes a browser hint and must never decide authorization.
    const diktatAuthorization = await resolveDiktatAuthorization(key);
    if (diktatAuthorization.matched && !diktatAuthorization.allowed) {
      return new Response("File not found", { status: 404 });
    }

    // Authorize quiz attachment delivery before fetching the object
    const quizAuthorization = await resolveQuizAttachmentAuthorization(key);
    if (quizAuthorization.matched && !quizAuthorization.allowed) {
      return new Response("File not found", { status: 404 });
    }

    // Authorize course video delivery before fetching the object
    const videoAuthorization = await resolveCourseVideoAuthorization(key);
    if (videoAuthorization.matched && !videoAuthorization.allowed) {
      return new Response("File not found", { status: 404 });
    }

    const rangeHeader = req.headers.get("range");

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: rangeHeader || undefined,
    });

    const s3Res = await s3.send(command);

    if (!s3Res.Body) {
      return new Response("File not found", { status: 404 });
    }

    // Convert S3 body stream to Response (with Edge/Serverless compatibility conversion)
    const stream = s3Res.Body as any;
    let webStream = stream;
    if (stream && typeof stream.on === "function" && typeof stream.read === "function") {
      const { Readable } = require("stream");
      webStream = Readable.toWeb(stream);
    }
    
    const headers = new Headers();
    if (s3Res.ContentType) {
      headers.set("Content-Type", s3Res.ContentType);
    } else {
      headers.set("Content-Type", "application/octet-stream");
    }
    
    if (s3Res.ContentLength) {
      headers.set("Content-Length", s3Res.ContentLength.toString());
    }

    headers.set("Accept-Ranges", "bytes");
    if (s3Res.ContentRange) {
      headers.set("Content-Range", s3Res.ContentRange);
    }
    
    // Only protected delivery depends on the current session. Keep unrelated
    // public storage objects on the cacheable response path.
    if (diktatAuthorization.matched || quizAuthorization.matched) {
      headers.set("Cache-Control", "private, no-store");
    }

    // Extract clean filename (last path segment minus the {timestamp}-{hash}- prefix)
    const filename = leafFilename(key);

    headers.set(
      "Content-Disposition",
      `${isDownload ? "attachment" : "inline"}; filename="${filename.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

    const statusCode = s3Res.ContentRange || s3Res.$metadata?.httpStatusCode === 206 ? 206 : 200;

    return new Response(webStream, {
      status: statusCode,
      headers,
    });
  } catch (err: any) {
    if (err.name === "NoSuchKey") {
      return new Response("File not found", {
        status: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    console.error("Storage proxy route error:", err);
    return new Response(err.message || "Internal server error", {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
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
