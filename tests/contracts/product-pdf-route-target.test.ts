import { afterAll, expect, mock, test } from "bun:test";

const originalAuthoringActor = { ...await import("@/lib/auth/authoring-actor") };
const originalAuth = { ...await import("@/lib/auth") };
const originalHeaders = { ...await import("next/headers") };
const originalInngest = { ...await import("@/lib/inngest") };
const originalEvidence = { ...await import("@/lib/bundle/product-diktat-evidence") };
const originalQueue = { ...await import("@/lib/bundle/product-diktat-queue") };
const originalStorage = { ...await import("@/lib/storage") };
let version = 3;
let sent: unknown;
let staleAfterDownload = false;
let duplicate = false;
let queueRejects = false;
let failedAttempt: unknown;
let reserveCount = 0;
let requestOutcome: "unknown" | "processing" | "accepted" | "rejected" = "unknown";
mock.module("@/lib/auth/authoring-actor", () => ({ ...originalAuthoringActor, hasAuthoringActor: async () => true }));
mock.module("next/headers", () => ({ ...originalHeaders, headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ ...originalAuth, auth: { api: { getSession: async () => ({ user: { id: "admin", role: "admin" } }) } } }));
mock.module("@/lib/inngest", () => ({ ...originalInngest, inngest: { send: async (event: unknown) => { sent = event; if (queueRejects) throw new Error("private provider error"); } } }));
mock.module("@/lib/bundle/product-diktat-evidence", () => ({ ...originalEvidence,
  getDiktatPdfContext: async (_id: string, productId: string, revision: string) => ({ row: { version, status: "draft" }, bundle: {}, productId, revision, status: "ready", evidence: { id: "evidence", storageKey: "private.pdf" } }),
  assertDiktatPdfStillCurrent: async () => { if (staleAfterDownload) throw new Error("PRODUCT_DIKTAT_PDF_STALE"); },
}));
mock.module("@/lib/bundle/product-diktat-queue", () => ({ ...originalQueue,
  registerLegacyPdfRequest: async (scope: { requestId: string }) => version === 4
    ? { requestId: scope.requestId, outcome: "rejected", error: "PRODUCT_V4_TRUSTED_VERIFICATION_REQUIRED" }
    : { requestId: scope.requestId, outcome: "processing" },
  getLegacyPdfRequestOutcome: async (scope: { requestId: string }) => requestOutcome === "accepted"
    ? { requestId: scope.requestId, outcome: "accepted", attemptId: "attempt-1", duplicate: false }
    : requestOutcome === "rejected" ? { requestId: scope.requestId, outcome: "rejected", error: "PRODUCT_DIKTAT_NOT_FOUND" } : { requestId: scope.requestId, outcome: requestOutcome },
  rejectLegacyPdfRequest: async (scope: { requestId: string }, error: string) => ({ requestId: scope.requestId, outcome: "rejected", error }),
  reserveLegacyDiktatPdfAttempt: async () => { reserveCount++; return { attemptId: "attempt-1", duplicate }; },
  failLegacyDiktatPdfEnqueue: async (...args: unknown[]) => { failedAttempt = args; },
}));
mock.module("@/lib/storage", () => ({ ...originalStorage, storage: { download: async () => new Uint8Array([1, 2]) } }));
const { GET, POST } = await import("@/app/api/admin/bundles/product/[id]/pdf/route");
const context = { params: Promise.resolve({ id: "import" }) };
const revision = "a".repeat(64);
const requestId = "00000000-0000-4000-8000-000000000001";
afterAll(() => {
  mock.module("@/lib/auth/authoring-actor", () => originalAuthoringActor);
  mock.module("next/headers", () => originalHeaders);
  mock.module("@/lib/auth", () => originalAuth);
  mock.module("@/lib/inngest", () => originalInngest);
  mock.module("@/lib/bundle/product-diktat-evidence", () => originalEvidence);
  mock.module("@/lib/bundle/product-diktat-queue", () => originalQueue);
  mock.module("@/lib/storage", () => originalStorage);
});

test("PDF queue requires an exact target and rejects V4 before enqueue", async () => {
  sent = undefined;
  reserveCount = 0;
  expect((await POST(new Request("https://example.test", { method: "POST", body: "{}" }), context)).status).toBe(400);
  version = 4;
  const request = () => new Request("https://example.test", { method: "POST", body: JSON.stringify({ productId: "second", expectedRevision: revision, requestId }) });
  const rejected = await POST(request(), context);
  expect(rejected.status).toBe(422);
  expect((await rejected.json()).error).toBe("PRODUCT_V4_TRUSTED_VERIFICATION_REQUIRED");
  expect(sent).toBeUndefined();
  expect(reserveCount).toBe(0);
  version = 3;
  const accepted = await POST(request(), context);
  expect(accepted.status).toBe(202);
  expect(await accepted.json()).toMatchObject({ outcome: "accepted", requestId, status: "pending", attemptId: "attempt-1", duplicate: false });
  expect(sent).toEqual({ id: "attempt-1", name: "product.diktat.pdf.requested", data: { importId: "import", requestedBy: "admin", productId: "second", expectedRevision: revision, attemptId: "attempt-1" } });
  sent = undefined;
  duplicate = true;
  const repeated = await POST(request(), context);
  expect(repeated.status).toBe(202);
  expect(await repeated.json()).toMatchObject({ attemptId: "attempt-1", duplicate: true });
  expect(sent).toBeUndefined();
  duplicate = false;
});

test("queue rejection fails only the reserved attempt and hides provider errors", async () => {
  queueRejects = true;
  failedAttempt = undefined;
  const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify({ productId: "second", expectedRevision: revision, requestId }) }), context);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ outcome: "accepted", requestId, attemptId: "attempt-1", duplicate: false, error: "PRODUCT_DIKTAT_PDF_QUEUE_UNAVAILABLE" });
  expect(failedAttempt).toEqual(["import", "attempt-1"]);
  queueRejects = false;
});

test("outcome lookup distinguishes unknown, processing, acceptance and rejection", async () => {
  const url = `https://example.test?outcome=1&requestId=${requestId}&productId=second&expectedRevision=${revision}`;
  for (const outcome of ["unknown", "processing", "accepted", "rejected"] as const) {
    requestOutcome = outcome;
    const response = await GET(new Request(url), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ requestId, outcome });
  }
});

test("preview rejects stale evidence after download before returning bytes", async () => {
  staleAfterDownload = true;
  const response = await GET(new Request(`https://example.test?productId=second&expectedRevision=${revision}`), context);
  expect(response.status).toBe(409);
  expect((await response.json()).error).toBe("PRODUCT_DIKTAT_PDF_STALE");
  staleAfterDownload = false;
  expect((await GET(new Request(`https://example.test?productId=second&expectedRevision=${revision}`), context)).status).toBe(200);
});
