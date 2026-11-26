import { afterAll, beforeEach, expect, mock, test } from "bun:test";

class FixtureHttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
const origin = "https://school.example.test";
const manual = { source: "manual-pdf", fileUrl: "courses/course/materials/lesson.pdf", chapterIds: ["chapter"], revision: new Date(1) };
const preview = new TextEncoder().encode("%PDF-1.7\nAuthorized fixture");
const signedUrl = "https://private-bucket.example.test/object?token=synthetic";
const delegated = mock(async () => signedUrl);
const previousFetch = globalThis.fetch;
let record: typeof manual | null;
let canonicalCollision: boolean;
let hasCourse: boolean;
let enrolledInPka: boolean;
let legacyCourseId: string;
let allowedChapters: string[];
let hasDiktat: boolean;
let canDownload: boolean;
let enabled: boolean;
const expiry = Date.now() + 90_000;
let downloaded: Array<{ url: string; init?: RequestInit }>;
const fetcher = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
  downloaded.push({ url: String(input), init });
  return new Response(preview, { headers: { "Content-Type": "application/pdf" } });
});
mock.module("@/lib/offline/server-auth", () => ({ OfflineHttpError: FixtureHttpError }));
mock.module("@/lib/auth-site-url", () => ({ resolveAuthBaseUrl: () => origin }));
mock.module("@/lib/pka-enrollment", () => ({ isPkaEnrolled: async () => enrolledInPka }));
mock.module("@/lib/storage", () => ({ storage: { getSignedUrl: delegated } }));
mock.module("@/lib/student/course-catalog", () => ({
  listStudentEnrollments: async () => [{ id: "course", canonicalId: "canonical", legacyId: "course", expiresAt: new Date(expiry) }],
}));
mock.module("@/lib/student/course-access", () => ({
  resolveCourseAccess: async () => ({ isAuthenticated: true, hasCourseAccess: hasCourse, canonicalCourseId: "canonical",
    legacyCourseId, courseId: "course", tier: "enrolled", scopedChapterIds: allowedChapters, isFreeNow: false, pricing: {}, capabilities: { canDownloadDiktat: canDownload } }),
  canAccessCourseContent: (_access: unknown, kind: string, chapters: string[]) => hasDiktat && kind === "diktat" && chapters.every(id => allowedChapters.includes(id)),
  hasChapterScopeWithin: (refs: string[], allowed: string[]) => refs.length > 0 && refs.every(id => allowed.includes(id)),
}));
mock.module("@/lib/student/canonical-material-detail", () => ({
  findCanonicalDetail: async () => canonicalCollision ? { id: "material" } : null,
  findLegacyMaterialDetail: async () => record,
}));
mock.module("@/app/api/native/student/_session", () => ({
  requireNativeStudent: async () => enabled ? { userId: "student" } : new Response(null, { status: 401 }),
}));
const parse = mock(async (_bytes: Uint8Array, pages: number[]) => ({
  totalPages: 3, pages: pages.map(pageNumber => ({ pageNumber, text: pageNumber === 2 ? "A long text before the example." : "No match" })),
}));
mock.module("@/lib/compute/pdf-pages", () => ({ parseStoredPdfPages: parse }));
const { GET, HEAD, POST } = await import("@/app/api/native/student/material-pdf/route");

beforeEach(() => {
  record = manual;
  canonicalCollision = false;
  hasCourse = true;
  enrolledInPka = true;
  legacyCourseId = "course";
  hasDiktat = false;
  canDownload = false;
  enabled = true;
  allowedChapters = ["chapter"];
  downloaded = [];
  fetcher.mockClear();
  delegated.mockClear();
  parse.mockClear();
  globalThis.fetch = Object.assign(fetcher, { preconnect: () => {} }) as typeof fetch;
});
afterAll(() => { globalThis.fetch = previousFetch; });

function request(method = "GET", revision?: string, download = false) {
  return new Request(origin + "/api/native/student/material-pdf?courseId=course&materialId=material" + (download ? "&download=1" : ""), {
    method, headers: { Cookie: "fixture-signed-in=synthetic", ...(revision ? { "If-Match": '"' + revision + '"' } : {}) },
  });
}

test("an authorized reader gets inline PDF bytes without a private URL or cookie leaving the origin", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toBe("inline");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-zyx-pdf-view-until")).toBe(String(expiry));
  expect(response.headers.get("x-zyx-pdf-revision")).toMatch(/^[a-f0-9]{64}$/);
  expect(response.headers.get("location")).toBeNull();
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(preview);
  expect(delegated).toHaveBeenCalledWith("courses/course/materials/lesson.pdf", "get", undefined, 60);
  expect(downloaded[0].url).toBe(signedUrl);
  expect(new Headers(downloaded[0].init?.headers).get("cookie")).toBeNull();
  expect(downloaded[0].init?.redirect).toBe("error");
});

test("revalidates chapter and PKA scope and rejects compatibility ID collisions before touching storage", async () => {
  enabled = false;
  expect((await GET(request())).status).toBe(401);
  enabled = true;
  allowedChapters = ["outside"];
  expect((await GET(request())).status).toBe(403);
  allowedChapters = ["chapter"];
  legacyCourseId = "tutorial-pka";
  enrolledInPka = false;
  expect((await GET(request())).status).toBe(403);
  enrolledInPka = true;
  canonicalCollision = true;
  expect((await GET(request())).status).toBe(404);
  expect(delegated).not.toHaveBeenCalled();
});

test("legacy Diktat read scope and metadata renewal do not grant a download", async () => {
  record = { ...manual, source: "legacy-diktat", fileUrl: "https://fixture.ufs.sh/document" };
  expect((await HEAD(request("HEAD"))).status).toBe(403);
  hasDiktat = true;
  const initial = await HEAD(request("HEAD"));
  expect(initial.status).toBe(200);
  expect(await initial.text()).toBe("");
  const revision = initial.headers.get("x-zyx-pdf-revision")!;
  expect((await HEAD(request("HEAD", revision))).status).toBe(200);
  expect((await HEAD(request("HEAD", "f".repeat(64)))).status).toBe(409);
  expect(fetcher).not.toHaveBeenCalled();
  expect(delegated).not.toHaveBeenCalled();
});

test("suppresses bytes if a file changes, document disappears, or access is revoked while fetching", async () => {
  fetcher.mockImplementationOnce(async () => {
    if (record) record = { ...record, fileUrl: "courses/course/materials/new.pdf" };
    return new Response(preview);
  });
  expect((await GET(request())).status).toBe(409);
  fetcher.mockImplementationOnce(async () => {
    record = null;
    return new Response(preview);
  });
  expect((await GET(request())).status).toBe(404);
  record = manual;
  fetcher.mockImplementationOnce(async () => {
    hasCourse = false;
    return new Response(preview);
  });
  expect((await GET(request())).status).toBe(403);
});

test("manual PDF export requires the web download entitlement and rechecks it after storage reads", async () => {
  expect((await GET(request("GET", undefined, true))).status).toBe(403);
  expect(delegated).not.toHaveBeenCalled();
  canDownload = true;
  const allowed = await GET(request("GET", undefined, true));
  expect(allowed.status).toBe(200);
  expect(allowed.headers.get("content-disposition")).toBe("attachment");
  expect(allowed.headers.get("location")).toBeNull();
  expect(new Uint8Array(await allowed.arrayBuffer())).toEqual(preview);

  fetcher.mockImplementationOnce(async () => {
    canDownload = false;
    return new Response(preview);
  });
  expect((await GET(request("GET", undefined, true))).status).toBe(403);
  canDownload = true;
  record = { ...manual, source: "legacy-diktat" };
  hasDiktat = true;
  expect((await GET(request("GET", undefined, true))).status).toBe(403);
});

test("PDF text search scans a bounded window and checks the live revision before and after reading", async () => {
  const revision = (await HEAD(request("HEAD"))).headers.get("x-zyx-pdf-revision")!;
  const search = (overrides = {}) => new Request(request("HEAD").url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision, query: "long text", from: 1, to: 3, ...overrides }),
  });
  expect((await POST(search({ to: 30 }))).status).toBe(400);
  expect((await POST(search({ revision: "f".repeat(64) }))).status).toBe(409);
  expect(delegated).not.toHaveBeenCalled();
  expect(parse).not.toHaveBeenCalled();

  const response = await POST(search());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ total: 3, matches: [{ page: 2, excerpt: "A long text before the example." }] });
  expect(parse).toHaveBeenCalledWith(preview, [1, 2, 3], { representation: "text" });

  parse.mockImplementationOnce(async () => { enabled = false; return { totalPages: 3, pages: [] }; });
  expect((await POST(search())).status).toBe(401);
});
