import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { downloadAuthoringContextExport } from "@/lib/authoring/export";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.FEATURE_AUTHORING_CONTEXT_V1 !== "1") {
    return NextResponse.json({ error: "AUTHORING_CONTEXT_V1_DISABLED" }, { status: 404 });
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "AUTHORING_CONTEXT_FORBIDDEN" }, { status: 403 });
  }
  try {
    const { id } = await context.params;
    const artifact = await downloadAuthoringContextExport(id);
    const body = artifact.bytes.buffer.slice(
      artifact.bytes.byteOffset,
      artifact.bytes.byteOffset + artifact.bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${artifact.filename}"; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "AUTHORING_CONTEXT_DOWNLOAD_FAILED";
    const status = code === "AUTHORING_CONTEXT_NOT_FOUND" ? 404 : code === "AUTHORING_CONTEXT_EXPIRED" ? 410 : 422;
    return NextResponse.json({ error: code }, { status });
  }
}
