import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withdrawProductBundle } from "@/lib/bundle/product-publication";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    return NextResponse.json({ result: await withdrawProductBundle({ importId: id, withdrawnBy: session.user.id }) });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "PRODUCT_BUNDLE_WITHDRAW_FAILED";
    const status = code.endsWith("FORBIDDEN") ? 403 : code === "PRODUCT_BUNDLE_NOT_FOUND" ? 404 : 422;
    return NextResponse.json({ error: code }, { status });
  }
}
