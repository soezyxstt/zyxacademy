import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { exportAuthoringContext, listAuthoringContextExports } from "@/lib/authoring/export";

export const runtime = "nodejs";

function errorResponse(error: unknown, fallback = "AUTHORING_CONTEXT_REQUEST_FAILED") {
  const code = error instanceof Error ? error.message.split(":", 1)[0] : fallback;
  const status = code.endsWith("FORBIDDEN") ? 403 : code.endsWith("NOT_FOUND") ? 404 : 422;
  return NextResponse.json({ error: code }, { status });
}

async function requireAdmin(): Promise<{ id: string } | NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "AUTHORING_CONTEXT_FORBIDDEN" }, { status: 403 });
  return { id: session.user.id };
}

export async function GET() {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;
  try {
    const rows = await listAuthoringContextExports();
    return NextResponse.json({
      exports: rows.map((row) => ({
        id: row.id,
        packId: row.entityId,
        action: row.action,
        correlationId: row.correlationId,
        createdAt: row.createdAt,
        artifactChecksum: row.afterSnapshot?.artifactChecksum,
        courseId: row.afterSnapshot?.courseId,
        retentionUntil: row.afterSnapshot?.retentionUntil,
        byteLength: row.afterSnapshot?.byteLength,
      })),
    });
  } catch (error) {
    return errorResponse(error, "AUTHORING_CONTEXT_LIST_FAILED");
  }
}

export async function POST(request: NextRequest) {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;
  try {
    const body = (await request.json()) as { courseId?: string; snapshotId?: string; runId?: string; createdAt?: string; retentionUntil?: string };
    if (!body.courseId) return NextResponse.json({ error: "AUTHORING_CONTEXT_INPUT_REQUIRED" }, { status: 400 });
    const requestId = randomUUID();
    const result = await exportAuthoringContext({
      actorId: actor.id,
      courseId: body.courseId,
      snapshotId: body.snapshotId ?? `snapshot-${requestId}`,
      runId: body.runId ?? request.headers.get("x-correlation-id") ?? `authoring-${requestId}`,
      createdAt: body.createdAt,
      retentionUntil: body.retentionUntil,
    });
    return NextResponse.json({
      result: {
        ...result,
        objectKey: undefined,
        downloadHref: `/api/admin/authoring-context/${encodeURIComponent(result.packId)}`,
      },
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
