import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readSecureZip, ZipSecurityError } from "@/lib/bundle/zip-reader";
import { serializeDeterministically, validateIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { stageIdeaBundle, listIdeaBundleImports } from "@/lib/bundle/staging";
import { sha256Text } from "@/lib/bundle/validator";
import { previewIdeaBundle } from "@/lib/bundle/idea-preview";
import { createIdeaBundleDraft, finalizeIdeaBundleDraft, type IdeaBundleDraft } from "@/lib/bundle/idea-draft";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

function errorResponse(error: unknown, fallback = "IDEA_BUNDLE_REQUEST_FAILED") {
  const code = error instanceof ZipSecurityError ? error.code : error instanceof Error ? error.message.split(":", 1)[0] : fallback;
  const status = code.endsWith("FORBIDDEN") ? 403 : code === "IDEA_BUNDLE_NOT_FOUND" ? 404 : 422;
  return NextResponse.json({ error: code }, { status });
}

async function requireAdmin(): Promise<{ id: string } | NextResponse> {
  if (process.env.FEATURE_IDEA_BUNDLE_V2 !== "1") return NextResponse.json({ error: "IDEA_BUNDLE_V2_DISABLED" }, { status: 404 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return { id: session.user.id };
}

function parseSchemaVersion(value: string): number {
  const match = value.match(/\.v(\d+)$/);
  return match ? Number(match[1]) : 2;
}

export async function GET() {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;
  try {
    const rows = await listIdeaBundleImports();
    return NextResponse.json({
      imports: rows.map((row) => ({
        id: row.id,
        bundleId: row.bundleId,
        checksum: row.checksum,
        bundleType: row.bundleType,
        courseId: row.courseId,
        version: row.version,
        status: row.status,
        requestedBy: row.requestedBy,
        validationReport: row.validationReport,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    });
  } catch (error) {
    return errorResponse(error, "IDEA_BUNDLE_LIST_FAILED");
  }
}

export async function POST(request: NextRequest) {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "IDEA_BUNDLE_FILE_REQUIRED" }, { status: 400 });
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "IDEA_BUNDLE_FILE_LIMIT" }, { status: 413 });
    const uploadedBytes = new Uint8Array(await file.arrayBuffer());
    const archive = readSecureZip(uploadedBytes);
    const validation = validateIdeaBundle(archive);
    if (!validation.success) {
      return NextResponse.json({
        error: "IDEA_BUNDLE_VALIDATION_FAILED",
        reasonCodes: validation.issues.map((issue) => issue.code),
        issues: validation.issues,
      }, { status: 422 });
    }

    const intent = form.get("intent");
    if (intent !== "stage") {
      return NextResponse.json({
        persisted: false,
        filename: file.name,
        manifest: validation.data.manifest,
        preview: previewIdeaBundle(validation.data),
        draft: createIdeaBundleDraft(validation.data),
      });
    }

    const draftValue = form.get("draft");
    if (typeof draftValue !== "string" || draftValue.length > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "IDEA_BUNDLE_DRAFT_REQUIRED" }, { status: 400 });
    }
    const finalized = finalizeIdeaBundleDraft(validation.data, JSON.parse(draftValue) as IdeaBundleDraft);
    const bundle = finalized.bundle;
    const items = [
      ...bundle.entities.sourceMaterials.map((entity) => ({ entityType: "source_material", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
      ...bundle.entities.sourceChunks.map((entity) => ({ entityType: "source_chunk", entityId: entity.id, entityVersion: entity.sourceVersion, entityHash: sha256Text(serializeDeterministically(entity)) })),
      ...bundle.entities.ideas.map((entity) => ({ entityType: "idea", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
      ...bundle.entities.provenance.map((entity) => ({ entityType: "provenance", entityId: entity.id, entityVersion: 1, entityHash: sha256Text(serializeDeterministically(entity)) })),
      ...bundle.entities.relations.map((entity) => ({ entityType: "relation", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ];
    const result = await stageIdeaBundle({
      runId: request.headers.get("x-correlation-id") ?? `api-${Date.now()}`,
      bundleId: bundle.manifest.bundleId,
      courseId: bundle.manifest.courseId,
      schemaVersion: parseSchemaVersion(bundle.manifest.schemaVersion),
      checksum: bundle.manifest.bundleChecksum,
      bytes: finalized.bytes,
      requestedBy: actor.id,
      items,
      validationReport: {
        valid: true,
        reasonCodes: [],
        fileCount: bundle.files.size,
        entityCount: items.length,
        sourceCount: bundle.entities.sourceMaterials.length,
        relationCount: bundle.entities.relations.length,
        warnings: [],
      },
      filename: file.name || "idea-bundle-v2.zip",
    });
    return NextResponse.json({ result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
