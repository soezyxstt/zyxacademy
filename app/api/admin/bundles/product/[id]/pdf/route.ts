import { hasAuthoringActor } from "@/lib/auth/authoring-actor";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { inngest } from "@/lib/inngest";
import { assertDiktatPdfBytes, assertDiktatPdfStillCurrent, getDiktatPdfContext } from "@/lib/bundle/product-diktat-evidence";
import { failLegacyDiktatPdfEnqueue, getLegacyPdfRequestOutcome, registerLegacyPdfRequest, rejectLegacyPdfRequest, reserveLegacyDiktatPdfAttempt, type LegacyPdfRequest, type LegacyPdfRequestOutcome } from "@/lib/bundle/product-diktat-queue";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

function failure(error: unknown) {
  const candidate = error instanceof Error ? error.message.split(":", 1)[0] : "";
  const code = safeErrors.has(candidate) ? candidate : "PRODUCT_DIKTAT_PDF_UNAVAILABLE";
  const stale = code.includes("STALE") || code.includes("CONFLICT") || code === "PRODUCT_BUNDLE_CHECKSUM_MISMATCH";
  const status = code === "PRODUCT_BUNDLE_NOT_FOUND" || code === "PRODUCT_DIKTAT_NOT_FOUND" ? 404 : stale ? 409 : 422;
  return NextResponse.json({ error: code, ...(stale ? { recovery: "Reload the current revision and PDF status before retrying." } : {}) }, { status });
}

const safeErrors = new Set(["PRODUCT_BUNDLE_NOT_FOUND", "PRODUCT_BUNDLE_STALE_CONTEXT", "PRODUCT_BUNDLE_CHECKSUM_MISMATCH", "PRODUCT_DIKTAT_NOT_FOUND", "PRODUCT_DIKTAT_SOURCE_MISSING", "PRODUCT_DIKTAT_SNAPSHOT_CONFLICT", "PRODUCT_DIKTAT_PDF_STALE", "PRODUCT_DIKTAT_REQUEST_CONFLICT", "PRODUCT_DIKTAT_REQUEST_TIMEOUT", "PRODUCT_DIKTAT_RENDER_DRAFT_REQUIRED", "PRODUCT_V4_TRUSTED_VERIFICATION_REQUIRED"]);
const terminalErrors = new Set(["PRODUCT_BUNDLE_NOT_FOUND", "PRODUCT_BUNDLE_STALE_CONTEXT", "PRODUCT_BUNDLE_CHECKSUM_MISMATCH", "PRODUCT_DIKTAT_NOT_FOUND", "PRODUCT_DIKTAT_SOURCE_MISSING", "PRODUCT_DIKTAT_SNAPSHOT_CONFLICT", "PRODUCT_DIKTAT_REQUEST_TIMEOUT", "PRODUCT_DIKTAT_RENDER_DRAFT_REQUIRED", "PRODUCT_V4_TRUSTED_VERIFICATION_REQUIRED"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function resolvedResponse(result: LegacyPdfRequestOutcome, scope: LegacyPdfRequest) {
  if (result.outcome === "accepted") return NextResponse.json({ ...result, duplicate: true, status: "pending", productId: scope.productId, revision: scope.expectedRevision }, { status: 202 });
  if (result.outcome === "rejected") {
    const status = result.error === "PRODUCT_BUNDLE_NOT_FOUND" || result.error === "PRODUCT_DIKTAT_NOT_FOUND" ? 404 : result.error.includes("STALE") || result.error.includes("CONFLICT") || result.error.includes("TIMEOUT") || result.error === "PRODUCT_BUNDLE_CHECKSUM_MISMATCH" ? 409 : 422;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json({ error: "PRODUCT_DIKTAT_PDF_UNAVAILABLE", requestId: scope.requestId }, { status: 503 });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAuthoringActor(session.user.id, ["admin"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { productId?: unknown; expectedRevision?: unknown; requestId?: unknown } | null;
  if (typeof body?.productId !== "string" || !body.productId.trim() || typeof body.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(body.expectedRevision)) return NextResponse.json({ error: "PRODUCT_DIKTAT_TARGET_REQUIRED" }, { status: 400 });
  if (typeof body.requestId !== "string" || !uuid.test(body.requestId.toLowerCase())) return NextResponse.json({ error: "PRODUCT_DIKTAT_REQUEST_INVALID" }, { status: 400 });
  const scope: LegacyPdfRequest = { importId: id, productId: body.productId, expectedRevision: body.expectedRevision, requestId: body.requestId.toLowerCase(), requestedBy: session.user.id };
  try {
    const registration = await registerLegacyPdfRequest(scope);
    if (registration.outcome !== "processing") return resolvedResponse(registration, scope);
    const current = await getDiktatPdfContext(id, body.productId, body.expectedRevision);
    if (current.row.version === 4) throw new Error("PRODUCT_V4_TRUSTED_VERIFICATION_REQUIRED");
    if (![2, 3].includes(current.row.version) || current.row.status !== "draft") throw new Error("PRODUCT_DIKTAT_RENDER_DRAFT_REQUIRED");
    const { attemptId, duplicate } = await reserveLegacyDiktatPdfAttempt({ snapshot: current.row, bundle: current.bundle, productId: body.productId, requestedBy: session.user.id, requestId: scope.requestId });
    if (duplicate) return NextResponse.json({ outcome: "accepted", requestId: scope.requestId, status: "pending", productId: body.productId, revision: body.expectedRevision, attemptId, duplicate: true }, { status: 202 });
    try {
      await inngest.send({ id: attemptId, name: "product.diktat.pdf.requested", data: { importId: id, requestedBy: session.user.id, productId: body.productId, expectedRevision: body.expectedRevision, attemptId } });
    } catch {
      await failLegacyDiktatPdfEnqueue(id, attemptId).catch(() => {});
      return NextResponse.json({ outcome: "accepted", requestId: scope.requestId, attemptId, duplicate: false, error: "PRODUCT_DIKTAT_PDF_QUEUE_UNAVAILABLE" }, { status: 503 });
    }
    return NextResponse.json({ outcome: "accepted", requestId: scope.requestId, status: "pending", productId: body.productId, revision: body.expectedRevision, attemptId, duplicate: false }, { status: 202 });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "";
    if (code === "PRODUCT_DIKTAT_REQUEST_FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (terminalErrors.has(code)) {
      try { return resolvedResponse(await rejectLegacyPdfRequest(scope, code), scope); } catch { /* The durable outcome may still be recovered by GET. */ }
    }
    if (code === "PRODUCT_DIKTAT_REQUEST_CONFLICT") return failure(error);
    return NextResponse.json({ error: "PRODUCT_DIKTAT_PDF_UNAVAILABLE", requestId: scope.requestId }, { status: 503 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAuthoringActor(session.user.id, ["admin"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  const params = new URL(request.url).searchParams;
  const productId = params.get("productId");
  const expectedRevision = params.get("expectedRevision");
  if (!productId?.trim() || !expectedRevision || !/^[a-f0-9]{64}$/.test(expectedRevision)) return NextResponse.json({ error: "PRODUCT_DIKTAT_TARGET_REQUIRED" }, { status: 400 });
  if (params.get("outcome") === "1") {
    const requestId = params.get("requestId")?.toLowerCase();
    if (!requestId || !uuid.test(requestId)) return NextResponse.json({ error: "PRODUCT_DIKTAT_REQUEST_INVALID" }, { status: 400 });
    try {
      const result = await getLegacyPdfRequestOutcome({ requestId, importId: id, productId, expectedRevision, requestedBy: session.user.id });
      return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      if (error instanceof Error && error.message === "PRODUCT_DIKTAT_REQUEST_FORBIDDEN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (error instanceof Error && error.message === "PRODUCT_DIKTAT_REQUEST_CONFLICT") return failure(error);
      return NextResponse.json({ error: "PRODUCT_DIKTAT_PDF_UNAVAILABLE" }, { status: 503 });
    }
  }
  try {
    const current = await getDiktatPdfContext(id, productId, expectedRevision);
    if (current.status === "stale") return NextResponse.json({ error: "PRODUCT_DIKTAT_PDF_STALE" }, { status: 409 });
    if (current.status !== "ready" || !current.evidence?.storageKey || typeof storage.download !== "function") return NextResponse.json({ error: "PRODUCT_DIKTAT_PDF_NOT_READY" }, { status: 404 });
    let bytes: Uint8Array;
    try { bytes = await storage.download(current.evidence.storageKey); }
    catch { return NextResponse.json({ error: "PRODUCT_DIKTAT_PDF_UNAVAILABLE" }, { status: 503 }); }
    assertDiktatPdfBytes(current, bytes);
    await assertDiktatPdfStillCurrent(current);
    return new Response(bytes as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${params.get("download") === "1" ? "attachment" : "inline"}; filename="diktat.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
