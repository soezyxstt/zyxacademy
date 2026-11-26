import { afterAll, beforeEach, expect, mock, test } from "bun:test";

class FixtureHttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

const origin = "https://student.example.test";
const source = "/api/courses/course/articles/material/source-figures/figure";
const publicThumbnail = "https://i.ytimg.com/vi/preview/hqdefault.jpg";
const record = { id: "material", chapterId: "chapter", title: "Reading", version: 3, updatedAt: new Date(1), policyKind: "article" };
const article = {
  id: "material", courseId: "course", title: "Reading", chapterId: "chapter", version: 3,
  progress: { hidden: "personal" },
  sections: [{ id: "section", slug: "one", blocks: [{ id: "body", blockType: "explanation",
    content: `Article $x^2$\n\n![figure](${source})\n\n![public](${publicThumbnail})\n\n![external](https://other.example.test/private.png)` }] }],
};
let enrolled = true;
let mayRead = true;
let allowedChapter = "chapter";
let policyKind = "article";
let currentCourse: string | undefined;
let currentRecord: typeof record | null;
let legacyRecord: { source: string; format: "website" | "generated"; chapterIds: string[]; title: string; version: number; updatedAt: Date } | undefined;
const legacyBody = mock(async (..._args: unknown[]) => "Bacaan lama");
let mockResponse: { userId: string } | Response;
let upstreamRequests: { url: string; init?: RequestInit }[];
const upstream = globalThis.fetch;
const fetchAsset = mock(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  upstreamRequests.push({ url: String(input), init });
  return new Response(Uint8Array.of(1, 2, 3), { headers: { "Content-Type": "image/png" } });
});

const canonical = mock(async (..._args: unknown[]) => article);
const text = mock(async (..._args: unknown[]) => ({ id: "material", productType: "diktat", contentMarkdown: "Diktat" }));
mock.module("@/lib/offline/server-auth", () => ({ OfflineHttpError: FixtureHttpError }));
mock.module("@/lib/auth-site-url", () => ({ resolveAuthBaseUrl: () => origin }));
mock.module("@/lib/articles/structured-repository", () => ({
  getCanonicalPublishedArticle: canonical, getCanonicalPublishedTextProduct: text,
}));
mock.module("@/lib/student/course-access", () => ({
  resolveCourseAccess: async () => ({ isAuthenticated: true, hasCourseAccess: mayRead, canonicalCourseId: "canonical",
    courseId: "course", legacyCourseId: currentCourse }),
  canAccessCourseContent: (_access: unknown, kind: string, chapters: string[]) => kind === policyKind && chapters.includes(allowedChapter),
}));
mock.module("@/lib/student/canonical-material-detail", () => ({ findCanonicalDetail: async () => currentRecord, findLegacyMaterialDetail: async () => legacyRecord }));
mock.module("@/lib/student/legacy-material-body", () => ({ readLegacyMaterialBody: legacyBody }));
mock.module("@/lib/pka-enrollment", () => ({ isPkaEnrolled: async () => enrolled }));
mock.module("@/app/api/native/student/_session", () => ({ requireNativeStudent: async () => mockResponse }));
const termIndex = mock(async (_courseId: string) => [
  { courseId: "course", conceptName: "Flux", conceptId: "flux", term: "magnetic flux" },
  { courseId: "course", conceptName: "Flux", conceptId: "flux", term: "fluks" },
]);
const concept = { conceptName: "Flux", mastery: { score: 45, trend: "improving" }, quickExplain: { title: "Definition", content: "A signed definition." } };
const popover = mock(async (..._fields: string[]) => concept);
mock.module("@/lib/term-index", () => ({ buildCourseTermIndex: termIndex }));
mock.module("@/lib/student/learning-concept-popover", () => ({ loadConceptPopover: popover }));
const { GET, POST } = await import("@/app/api/native/student/reading/route");

beforeEach(() => {
  enrolled = mayRead = true;
  allowedChapter = "chapter";
  policyKind = "article";
  currentCourse = undefined;
  currentRecord = record;
  legacyRecord = undefined;
  legacyBody.mockClear();
  mockResponse = { userId: "learner" };
  upstreamRequests = [];
  canonical.mockClear();
  text.mockClear();
  fetchAsset.mockClear();
  termIndex.mockClear();
  popover.mockClear();
  globalThis.fetch = Object.assign(fetchAsset, { preconnect: () => {} }) as typeof fetch;
});
afterAll(() => { globalThis.fetch = upstream; });

function get(values: Record<string, string> = {}) {
  const path = "/api/native/student/reading?" + new URLSearchParams({ courseId: "course", materialId: "material", ...values });
  return GET(new Request(origin + path, { headers: { Cookie: "fixture-session=fake" } }));
}

test("gates canonical text on native session, chapter scope and Tutorial PKA enrollment including aliases", async () => {
  mockResponse = new Response(null, { status: 401 });
  expect((await get()).status).toBe(401);
  mockResponse = { userId: "learner" };
  allowedChapter = "outside";
  expect((await get()).status).toBe(403);
  allowedChapter = "chapter";
  currentCourse = "tutorial-pka";
  enrolled = false;
  expect((await get()).status).toBe(403);
  expect(canonical).not.toHaveBeenCalled();
  enrolled = true;
  const response = await get();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const result = await response.json();
  expect(result.data).not.toHaveProperty("progress");
  expect(result.assets).toEqual([source, publicThumbnail]);
  expect(canonical).toHaveBeenCalledWith("course", "material", "learner", undefined, { includeProgress: false });
});

test("Diktat content obeys its read policy and publishes Markdown, independent of PDF permission", async () => {
  currentRecord = { ...record, policyKind: "diktat" };
  expect((await get()).status).toBe(403);
  policyKind = "diktat";
  const ready = await get();
  expect(ready.status).toBe(200);
  expect(await ready.json()).toMatchObject({ kind: "diktat", data: { docCategory: "diktat", body: "Diktat", contentVersion: 3 } });
  expect(canonical).not.toHaveBeenCalled();
  expect((await get({ revision: "a".repeat(64) })).status).toBe(400);
});

test("scopes image bytes to the representation and forwards cookies only to the fixed private origin", async () => {
  const { revision } = await (await get()).json();
  expect((await get({ asset: source, revision: "f".repeat(64) })).status).toBe(409);
  expect((await get({ asset: "https://other.example.test/private.png", revision })).status).toBe(404);
  expect(fetchAsset).not.toHaveBeenCalled();
  const privateAsset = await get({ asset: source, revision });
  expect(privateAsset.status).toBe(200);
  expect(privateAsset.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
  expect(upstreamRequests[0].url).toBe(origin + source);
  expect(new Headers(upstreamRequests[0].init?.headers).get("cookie")).toBe("fixture-session=fake");
  expect(upstreamRequests[0].init?.redirect).toBe("error");
  expect((await get({ asset: publicThumbnail, revision })).status).toBe(200);
  expect(new Headers(upstreamRequests[1].init?.headers).get("cookie")).toBeNull();
});

test("an image fetch cannot return bytes after the publication or Student grant disappears", async () => {
  const { revision } = await (await get()).json();
  fetchAsset.mockImplementationOnce(async () => {
    currentRecord = null;
    return new Response(Uint8Array.of(1, 2, 3), { headers: { "Content-Type": "image/png" } });
  });
  expect((await get({ asset: source, revision })).status).toBe(409);
  currentRecord = record;
  fetchAsset.mockImplementationOnce(async () => {
    mayRead = false;
    return new Response(Uint8Array.of(1, 2, 3), { headers: { "Content-Type": "image/png" } });
  });
  expect((await get({ asset: source, revision })).status).toBe(403);
});

test("published compatibility articles and generated sections use the same chapter scope and active account as canonical reading", async () => {
  currentRecord = null;
  currentCourse = "old-course";
  for (const format of ["website", "generated"] as const) {
    legacyRecord = { source: "legacy-article", format, chapterIds: ["chapter"], title: "Luas", version: 1, updatedAt: new Date(1) };
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "material", structured: false,
      data: { sections: [{ blocks: [{ content: "Bacaan lama" }] }] } });
    expect(legacyBody).toHaveBeenCalledWith("old-course", "material", format, ["chapter"]);
  }
  legacyBody.mockClear();
  allowedChapter = "other";
  expect((await get()).status).toBe(403);
  expect(legacyBody).not.toHaveBeenCalled();
  legacyRecord = undefined;
  expect((await get()).status).toBe(404);
});

function postTerm(revision: string, selection: string, requestOrigin = origin) {
  return POST(new Request(origin + "/api/native/student/reading", {
    method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ courseId: "course", materialId: "material", revision, selection }),
  }));
}

test("compatibility term matching reuses signed course concept details and denies stale or unauthorized lookups", async () => {
  const articleRevision = (await (await get()).json()).revision;
  expect((await postTerm(articleRevision, "Magnetic flux")).status).toBe(404);
  expect(termIndex).not.toHaveBeenCalled();
  currentRecord = { ...record, policyKind: "diktat" };
  policyKind = "diktat";
  const { revision } = await (await get()).json();
  expect((await postTerm(revision, "Magnetic flux", "https://other.test")).status).toBe(403);
  expect((await postTerm(revision, "x".repeat(1201))).status).toBe(400);
  expect((await postTerm("b".repeat(64), "Magnetic flux")).status).toBe(409);
  expect(termIndex).not.toHaveBeenCalled();
  expect(await (await postTerm(revision, "unknown phrase")).json()).toEqual({ concept: null });
  expect(popover).not.toHaveBeenCalled();
  const response = await postTerm(revision, "Arus dan fluks");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ concept });
  expect(termIndex).toHaveBeenCalledWith("course");
  expect(popover).toHaveBeenCalledWith("learner", "course", "Flux");

  popover.mockImplementationOnce(async () => {
    mayRead = false;
    return concept;
  });
  expect((await postTerm(revision, "magnetic flux")).status).toBe(403);
});
