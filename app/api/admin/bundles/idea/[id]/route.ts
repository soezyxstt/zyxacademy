import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { previewIdeaBundle } from "@/lib/bundle/idea-preview";
import { getIdeaBundleImport, listIdeaItemReviews, parseStagedIdeaBundle } from "@/lib/bundle/staging";
import { createIdeaBundleDraft, finalizeIdeaBundleDraft, type IdeaBundleDraft } from "@/lib/bundle/idea-draft";
import { serializeDeterministically } from "@/lib/bundle/idea-bundle-v2";
import { sha256Text } from "@/lib/bundle/validator";
import { stageIdeaBundle } from "@/lib/bundle/staging";
import { isStructuredArticleReaderEnabled } from "@/lib/articles/feature";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const bundle = await getIdeaBundleImport(id);
    if (!bundle) return NextResponse.json({ error: "IDEA_BUNDLE_NOT_FOUND" }, { status: 404 });
    const parsed = await parseStagedIdeaBundle(id);
    const itemReviews = await listIdeaItemReviews(id, session.user.id);
    return NextResponse.json({
      bundle: {
        id: bundle.id,
        bundleId: bundle.bundleId,
        checksum: bundle.checksum,
        courseId: bundle.courseId,
        status: bundle.status,
        validationReport: bundle.validationReport,
        createdAt: bundle.createdAt,
        updatedAt: bundle.updatedAt,
        reviews: bundle.reviews,
      },
      manifest: parsed.manifest,
      preview: previewIdeaBundle(parsed),
      draft: createIdeaBundleDraft(parsed),
      itemReviews,
      structuredReaderEnabled: isStructuredArticleReaderEnabled(),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "IDEA_BUNDLE_DETAIL_FAILED";
    return NextResponse.json({ error: code }, { status: code === "IDEA_BUNDLE_NOT_FOUND" ? 404 : 422 });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const body = await request.json() as { draft?: IdeaBundleDraft; expectedRevision?: string };
    if (!body.draft) return NextResponse.json({ error: "IDEA_BUNDLE_DRAFT_REQUIRED" }, { status: 400 });
    const stored = await getIdeaBundleImport(id);
    if (!stored) return NextResponse.json({ error: "IDEA_BUNDLE_NOT_FOUND" }, { status: 404 });
    if (body.expectedRevision !== stored.checksum) return NextResponse.json({ error: "IDEA_BUNDLE_REVISION_CONFLICT" }, { status: 409 });
    const original = await parseStagedIdeaBundle(id);
    const finalized = finalizeIdeaBundleDraft(original, body.draft);
    const bundle = finalized.bundle;
    const items = [
      ...bundle.entities.sourceMaterials.map((entity) => ({ entityType: "source_material", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
      ...bundle.entities.sourceChunks.map((entity) => ({ entityType: "source_chunk", entityId: entity.id, entityVersion: entity.sourceVersion, entityHash: sha256Text(serializeDeterministically(entity)) })),
      ...bundle.entities.ideas.map((entity) => ({ entityType: "idea", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
      ...bundle.entities.provenance.map((entity) => ({ entityType: "provenance", entityId: entity.id, entityVersion: 1, entityHash: sha256Text(serializeDeterministically(entity)) })),
      ...bundle.entities.relations.map((entity) => ({ entityType: "relation", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
      ...bundle.entities.learningSections.map((entity) => ({ entityType: "learning_section", entityId: entity.id, entityVersion: 1, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ];
    const result = await stageIdeaBundle({
      runId: request.headers.get("x-correlation-id") ?? `admin-edit-${Date.now()}`,
      replaceImportId: id,
      bundleId: bundle.manifest.bundleId,
      courseId: bundle.manifest.courseId,
      schemaVersion: Number(bundle.manifest.schemaVersion.match(/\.v(\d+)$/)?.[1] ?? 2),
      checksum: bundle.manifest.bundleChecksum,
      bytes: finalized.bytes,
      requestedBy: session.user.id,
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
      filename: bundle.manifest.schemaVersion === "idea-bundle.v3" ? "idea-bundle-v3.zip" : "idea-bundle-v2.zip",
    });
    return NextResponse.json({ result });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "IDEA_BUNDLE_UPDATE_FAILED";
    const status = code === "IDEA_BUNDLE_NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ error: code }, { status });
  }
}
