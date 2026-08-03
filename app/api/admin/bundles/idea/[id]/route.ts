import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getIdeaBundleImport } from "@/lib/bundle/staging";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (process.env.FEATURE_IDEA_BUNDLE_V2 !== "1") return NextResponse.json({ error: "IDEA_BUNDLE_V2_DISABLED" }, { status: 404 });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const bundle = await getIdeaBundleImport(id);
  if (!bundle) return NextResponse.json({ error: "IDEA_BUNDLE_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({
    bundle: {
      ...bundle,
      sourceUriOrKey: undefined,
    },
  });
}
