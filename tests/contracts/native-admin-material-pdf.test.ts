import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { MATERIAL_PDF_HEADERS } from "@/packages/native-parity/student/courses/pdf";
import { ADMIN_PDF_ACCOUNT, ADMIN_PDF_SESSION, adminMaterialPdfPath } from "@/packages/native-parity/academic/courses/pdf";

const origin = "https://school.example.test";
const fixture = new TextEncoder().encode("%PDF-1.7\nScoped Admin fixture");
const firstRevision = "1".repeat(64);
const signedUrl = "https://private-storage.example.test/object?ticket=synthetic";
const realFetch = globalThis.fetch;
let role = "admin";
let session: { user: { id: string }; session: { id: string; expiresAt: Date } } | null;
let record: { revision: string; source: { storageKey: string } } | null;
class FixtureHttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
const signedRead = mock(async () => signedUrl);
const fetcher = mock(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(fixture));
const hasAuthoringActor = mock(async (_account: string, _roles: readonly string[]) => role === "admin");
const authorizeAdminCoursePdf = mock(async (target: { courseId: string; materialId: string }) => {
  if (target.courseId !== "course" || target.materialId !== "pdf" || !record) throw new FixtureHttpError(404, "PDF_NOT_FOUND");
  return record;
});

mock.module("@/lib/offline/server-auth", () => ({ OfflineHttpError: FixtureHttpError }));
mock.module("@/lib/storage", () => ({ storage: { getSignedUrl: signedRead } }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async (input: { query: object }) => {
  expect(input.query).toEqual({ disableCookieCache: true, disableRefresh: true });
  return session;
} } } }));
mock.module("@/lib/auth/authoring-actor", () => ({ hasAuthoringActor }));
mock.module("@/lib/native/academic/course-pdf", () => ({ authorizeAdminCoursePdf }));
const { GET, HEAD } = await import("@/app/api/native/academic/material-pdf/route");

beforeEach(() => {
  role = "admin";
  session = { user: { id: "administrator" }, session: { id: "admin-session", expiresAt: new Date(Date.now() + 180_000) } };
  record = { revision: firstRevision, source: { storageKey: "courses/course/materials/file.pdf" } };
  fetcher.mockClear(); signedRead.mockClear(); hasAuthoringActor.mockClear(); authorizeAdminCoursePdf.mockClear();
  globalThis.fetch = Object.assign(fetcher, { preconnect: () => {} }) as typeof fetch;
});
afterAll(() => { globalThis.fetch = realFetch; });

function request(method: "GET" | "HEAD" = "GET", headers: HeadersInit = {}, courseId = "course") {
  const outgoing = new Headers({ Cookie: "session=synthetic", [ADMIN_PDF_ACCOUNT]: "administrator", [ADMIN_PDF_SESSION]: "admin-session" });
  new Headers(headers).forEach((value, key) => outgoing.set(key, value));
  return new Request(origin + "/api/native/academic/material-pdf?" + new URLSearchParams({ courseId, materialId: "pdf" }), { method, headers: outgoing });
}

test("requires the verified Admin account and session before reading meaningful PDF metadata", async () => {
  expect((await GET(request("GET", { Origin: "https://foreign.example" }))).status).toBe(403);
  expect((await GET(request("GET", { [ADMIN_PDF_ACCOUNT]: "other" }))).status).toBe(409);
  expect((await HEAD(request("HEAD", { [ADMIN_PDF_SESSION]: "old-session" }))).status).toBe(409);
  for (const wrongRole of ["tutor", "murid"]) {
    role = wrongRole;
    expect((await HEAD(request("HEAD"))).status).toBe(403);
  }
  role = "admin";
  session!.session.expiresAt = new Date(0);
  expect((await GET(request())).status).toBe(401);
  expect(hasAuthoringActor).toHaveBeenLastCalledWith("administrator", ["admin"]);
  expect(authorizeAdminCoursePdf).not.toHaveBeenCalled();
  expect(signedRead).not.toHaveBeenCalled();
});

test("authenticates inline bytes without a storage URL and renews only the pinned revision", async () => {
  const first = await GET(request());
  expect(first.status).toBe(200);
  expect(first.headers.get("content-disposition")).toBe("inline");
  expect(first.headers.get("location")).toBeNull();
  expect(first.headers.get("cache-control")).toBe("private, no-store");
  expect(first.headers.get(MATERIAL_PDF_HEADERS.revision)).toBe(firstRevision);
  expect(first.headers.get(MATERIAL_PDF_HEADERS.expiresAt)).toBe(String(session!.session.expiresAt.getTime()));
  expect(new Uint8Array(await first.arrayBuffer())).toEqual(fixture);
  expect(signedRead).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe(signedUrl);
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("cookie")).toBeNull();
  const renewed = await HEAD(request("HEAD", { "If-Match": '"' + firstRevision + '"' }));
  expect(renewed.status).toBe(200);
  expect(await renewed.text()).toBe("");
  expect(signedRead).toHaveBeenCalledTimes(1);
  expect((await HEAD(request("HEAD", { "If-Match": '"' + "2".repeat(64) + '"' }))).status).toBe(409);
  expect((await GET(request("GET", {}, "foreign-course"))).status).toBe(404);
  expect(signedRead).toHaveBeenCalledTimes(1);
});

test("suppresses staged bytes when authorization or the selected revision changes while reading", async () => {
  fetcher.mockImplementationOnce(async () => { role = "tutor"; return new Response(fixture); });
  const revoked = await GET(request());
  expect(revoked.status).toBe(403);
  expect(await revoked.text()).toBe("");
  role = "admin";
  fetcher.mockImplementationOnce(async () => { record = { ...record!, revision: "2".repeat(64) }; return new Response(fixture); });
  const replaced = await GET(request());
  expect(replaced.status).toBe(409);
  expect(await replaced.text()).toBe("");
});

test("the signed transport only accepts a complete revision-bound bundle target", async () => {
  const bundle = { importId: "import", expectedRevision: "a".repeat(64) };
  const target = { courseId: "course", materialId: "pdf" };
  const path = adminMaterialPdfPath(target, bundle)!;
  const req = request("HEAD");
  expect((await HEAD(new Request(origin + path, req))).status).toBe(200);
  expect(authorizeAdminCoursePdf).toHaveBeenCalledWith(target, bundle);
  expect(signedRead).not.toHaveBeenCalled();
  const url = new URL(path, origin);
  url.searchParams.delete("expectedRevision");
  expect((await HEAD(new Request(url, req))).status).toBe(400);
  expect(adminMaterialPdfPath(target, { ...bundle, importId: "../other" })).toBeNull();
  expect(adminMaterialPdfPath(target, { ...bundle, expectedRevision: "unknown" })).toBeNull();
});
