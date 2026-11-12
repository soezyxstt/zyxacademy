import { expect, mock, test } from "bun:test";

let fetches = 0;
let queries = 0;
let sessions = 0;
let session: unknown = null;
mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class { async send() { fetches++; return { Body: "ordinary content", ContentType: "text/plain" }; } },
  GetObjectCommand: class { constructor(public input: unknown) {} },
}));
mock.module("@/lib/storage/r2", () => ({ getS3StorageConfig: () => ({ bucket: "mock", client: {} }) }));
mock.module("@/db", () => ({ db: { select: () => { queries++; return { from: () => ({ innerJoin: () => ({ where: async () => [] }), where: async () => [] }) }; } } }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => { sessions++; return session; } } } }));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/admin/course-identity", () => ({ resolveCourseIdentity: async () => null }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async () => ({}) }));
const { GET } = await import("@/app/api/storage/file/[...key]/route");
const get = (key: string, query = "") => GET(new Request(`http://localhost/api/storage/file/test${query}`), { params: Promise.resolve({ key: [key] }) });

test("private document and binding keys never reach storage, for any session or disposition", async () => {
  const hash = "a".repeat(64);
  for (const user of [null, { user: { id: "admin", role: "admin" } }]) {
    session = user;
    for (const key of [
      `overhaul/interactive-documents/${hash}.html`,
      `overhaul/interactive-documents/${hash}.png`,
      `overhaul/question-visual-bindings/${hash}.json`,
      `overhaul%2Finteractive-documents%2F${hash}.html`,
      `/api/storage/file/overhaul/interactive-documents/${hash}.html`,
      `//overhaul//question-visual-bindings/${hash}.json`,
      `overhaul/other/../interactive-documents/${hash}.html`,
      `overhaul\\question-visual-bindings\\${hash}.json`,
    ]) {
      for (const query of ["", "?download=1"]) {
        const response = await get(key, query);
        expect(response.status).toBe(404);
        expect(await response.text()).toBe("File not found");
      }
    }
  }
  expect(fetches).toBe(0);
  expect(queries).toBe(0);
  expect(sessions).toBe(0);
});

test("unrelated objects retain the ordinary proxy response", async () => {
  const response = await get("overhaul/interactive-documents-public/cover.png");
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("ordinary content");
  expect(fetches).toBe(1);
  expect(queries).toBe(2);
});
