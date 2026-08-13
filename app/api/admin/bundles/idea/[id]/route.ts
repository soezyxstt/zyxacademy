import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { previewIdeaBundle } from "@/lib/bundle/idea-preview";
import { getIdeaBundleImport, parseStagedIdeaBundle } from "@/lib/bundle/staging";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.FEATURE_IDEA_BUNDLE_V2 !== "1") return NextResponse.json({ error: "IDEA_BUNDLE_V2_DISABLED" }, { status: 404 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const bundle = await getIdeaBundleImport(id);
    if (!bundle) return NextResponse.json({ error: "IDEA_BUNDLE_NOT_FOUND" }, { status: 404 });
    const parsed = await parseStagedIdeaBundle(id);
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
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "IDEA_BUNDLE_DETAIL_FAILED";
    return NextResponse.json({ error: code }, { status: code === "IDEA_BUNDLE_NOT_FOUND" ? 404 : 422 });
  }
}
