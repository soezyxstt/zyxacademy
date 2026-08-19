import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getAuthoringCourseOption } from "@/lib/authoring/catalog";
import { authoringProductTypeSchema, buildAuthoringJobPack } from "@/lib/authoring/job-pack";
import { validateSourcePack } from "@/lib/authoring/source-pack";

export const runtime = "nodejs";

const MAX_SOURCE_PACK_BYTES = 64 * 1024 * 1024;
const mappingsSchema = z.array(z.object({ sectionId: z.string().min(1), chapterId: z.string().min(1) }).strict()).min(1);
const productsSchema = z.array(authoringProductTypeSchema).min(1);

async function requireAdmin(): Promise<{ id: string } | NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "AUTHORING_CONTEXT_FORBIDDEN" }, { status: 403 });
  return { id: session.user.id };
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message.split(":", 1)[0] : "AUTHORING_JOB_REQUEST_FAILED";
  const status = code.endsWith("NOT_FOUND") ? 404 : code.endsWith("FORBIDDEN") ? 403 : 422;
  return NextResponse.json({ error: code }, { status });
}

function parseJson<T>(value: FormDataEntryValue | null, schema: z.ZodType<T>, code: string): T {
  if (typeof value !== "string" || value.length > 1024 * 1024) throw new Error(code);
  try {
    return schema.parse(JSON.parse(value));
  } catch {
    throw new Error(code);
  }
}

export async function POST(request: NextRequest) {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "SOURCE_PACK_FILE_REQUIRED" }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_SOURCE_PACK_BYTES) return NextResponse.json({ error: "SOURCE_PACK_FILE_LIMIT" }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sourcePack = validateSourcePack(bytes);
    if (form.get("intent") !== "download") {
      return NextResponse.json({
        persisted: false,
        filename: file.name,
        archiveChecksum: sourcePack.archive.checksum,
        manifest: sourcePack.manifest,
        documents: sourcePack.documents,
        summary: {
          documentCount: sourcePack.documents.length,
          unitCount: sourcePack.documents.reduce((total, document) => total + document.expectedUnits, 0),
          sectionCount: sourcePack.documents.reduce((total, document) => total + document.sections.length, 0),
          questionCount: sourcePack.documents.reduce((total, document) => total + document.counts.questions, 0),
          solutionCount: sourcePack.documents.reduce((total, document) => total + document.counts.solutions, 0),
        },
      });
    }

    const courseId = form.get("courseId");
    if (typeof courseId !== "string" || !courseId) throw new Error("AUTHORING_JOB_COURSE_REQUIRED");
    const course = await getAuthoringCourseOption(courseId);
    if (!course) throw new Error("AUTHORING_JOB_COURSE_NOT_FOUND");
    const mappings = parseJson(form.get("mappings"), mappingsSchema, "AUTHORING_JOB_MAPPING_INVALID");
    const requestedProducts = parseJson(form.get("requestedProducts"), productsSchema, "AUTHORING_JOB_PRODUCTS_INVALID");
    const pack = buildAuthoringJobPack({ sourcePackBytes: bytes, course, mappings, requestedProducts });
    const body = pack.bytes.buffer.slice(pack.bytes.byteOffset, pack.bytes.byteOffset + pack.bytes.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${pack.filename}"; filename*=UTF-8''${encodeURIComponent(pack.filename)}`,
        "X-Authoring-Job-Id": pack.job.jobId,
        "X-Authoring-Job-Checksum": pack.manifest.jobChecksum,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
