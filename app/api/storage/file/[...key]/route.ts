import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { headers as nextHeaders } from "next/headers";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { diktatMateri, diktats, mataKuliah } from "@/db/schema";
import { auth } from "@/lib/auth";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { isProtectedProductDiktatPdfKey, leafFilename } from "@/lib/storage/keys";

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

async function canDownloadDiktat(key: string): Promise<boolean> {
  try {
    const [canonicalRows, legacyRows] = await Promise.all([
      db
        .select({ key: diktatMateri.fileKey, courseId: mataKuliah.id, source: "canonical" as const })
        .from(diktatMateri)
        .innerJoin(mataKuliah, eq(diktatMateri.mataKuliahId, mataKuliah.id))
        .where(and(eq(diktatMateri.status, "published"), isNotNull(diktatMateri.fileKey))),
      db
        .select({ key: diktats.fileUrl, courseId: diktats.courseId, source: "legacy" as const })
        .from(diktats)
        .where(eq(diktats.status, "ready")),
    ]);
    const matches = [...canonicalRows, ...legacyRows].filter(
      (row): row is { key: string; courseId: string; source: "canonical" | "legacy" } => normalizeStorageKey(row.key) === key,
    );
    if (matches.length === 0) return true;

    const identities = await Promise.all(
      [...new Set(matches.map((row) => row.courseId))].map((courseId) => resolveCourseIdentity(courseId)),
    );
    if (identities.some((identity) => !identity || identity.status !== "active")) return false;
    const canonicalCourseIds = new Set(
      identities.map((identity) => identity?.canonicalId ?? identity?.primaryId),
    );
    if (canonicalCourseIds.size !== 1) return false;
    const courseId = [...canonicalCourseIds][0];
    if (!courseId) return false;
    const session = await auth.api.getSession({ headers: await nextHeaders() });
    if (!session?.user?.id) return false;
    const role = (session.user as { role?: string | null }).role;
    const access = await resolveCourseAccess({
      courseId,
      userId: session.user.id,
      roleHint: role,
    });
    return access.hasCourseAccess && access.capabilities.canDownloadDiktat;
  } catch {
    // A storage authorization failure must not turn into a downloadable file.
    return false;
  }
}

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
    if (!(await canDownloadDiktat(normalizeStorageKey(key) ?? key))) {
      return new Response("File not found", { status: 404 });
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
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
    
    // Authorization depends on the current session, so never let a shared
    // cache replay the bytes to a different user.
    headers.set("Cache-Control", "private, no-store");

    // Extract clean filename (last path segment minus the {timestamp}-{hash}- prefix)
    const filename = leafFilename(key);

    headers.set(
      "Content-Disposition",
      `${isDownload ? "attachment" : "inline"}; filename="${filename.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");

    return new Response(webStream, {
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
