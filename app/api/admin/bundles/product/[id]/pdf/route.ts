import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { inngest } from "@/lib/inngest";
import { latestReadyProductDiktatEvidence } from "@/lib/bundle/product-diktat-evidence";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    await inngest.send({ name: "product.diktat.pdf.requested", data: { importId: id, requestedBy: session.user.id } });
    return NextResponse.json({ status: "pending" }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "PRODUCT_DIKTAT_PDF_QUEUE_UNAVAILABLE" }, { status: 503 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const evidence = await latestReadyProductDiktatEvidence(id);
  if (!evidence?.storageKey || typeof storage.download !== "function") return NextResponse.json({ error: "PRODUCT_DIKTAT_PDF_NOT_READY" }, { status: 404 });
  try {
    const bytes = await storage.download(evidence.storageKey);
    const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="diktat.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "PRODUCT_DIKTAT_PDF_UNAVAILABLE" }, { status: 503 });
  }
}
