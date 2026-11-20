import { expect, mock, test } from "bun:test";

let fetches = 0;
let queries = 0;
let sessions = 0;
let heads = 0;
let session: unknown = null;
let uploader = "owner";
let lastRead: { Range?: string; IfMatch?: string } | undefined;
class HeadObjectCommand {}
class GetObjectCommand {
  constructor(public input: { Range?: string; IfMatch?: string }) {}
}
mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send(command: HeadObjectCommand | GetObjectCommand) {
      if (command instanceof GetObjectCommand) {
        fetches++;
        lastRead = command.input;
        return { Body: "ordinary content", ContentType: "text/plain", ContentRange: command.input.Range ? "bytes 0-3/16" : undefined };
      }
      heads++;
      return { Metadata: { uploadedby: uploader }, ETag: '"fixture"' };
    }
  },
  GetObjectCommand,
  HeadObjectCommand,
}));
mock.module("@/lib/storage/r2", () => ({ getS3StorageConfig: () => ({ bucket: "mock", client: {} }) }));
mock.module("@/db", () => ({ db: { select: () => { queries++; return { from: () => ({ innerJoin: () => ({ where: async () => [] }), where: async () => [] }) }; } } }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => { sessions++; return session; } } } }));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/admin/course-identity", () => ({ resolveCourseIdentity: async () => null }));
const coursePolicy = await import("@/lib/student/course-access");
mock.module("@/lib/student/course-access", () => ({ ...coursePolicy, resolveCourseAccess: async () => ({}) }));
mock.module("@/lib/storage/scoped-file-authorization", () => ({
  authorizeScopedStorageFile: async (kind: string, _key: string, userId: string) => ({
    allowed: userId === (kind === "product-bundle" ? "admin" : "authorized"),
    ...(kind === "tryout" ? { owners: new Set(["owner"]) } : {}),
  }),
}));
const { GET } = await import("@/app/api/storage/file/[...key]/route");
const get = (key: string, query = "", range?: string) => GET(new Request(`http://localhost/api/storage/file/test${query}`, { headers: range ? { range } : {} }), { params: Promise.resolve({ key: [key] }) });

test("private document and binding keys never reach storage, for any session or disposition", async () => {
  const hash = "a".repeat(64);
  for (const user of [null, { user: { id: "admin", role: "admin" } }]) {
    session = user;
    for (const key of [
      `overhaul/interactive-documents/${hash}.html`,
      `overhaul/interactive-documents/${hash}.png`,
      `overhaul/interactive-documents/admission-v1/${hash}.json`,
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

test("private attachment and archive namespaces require scoped authorization before reading bytes", async () => {
  const before = fetches;
  const paths = [
    "exams/exam/attachments/answer.pdf",
    "schedules/booking/pre_session/notes.pdf",
    "schedules/booking/post_session/notes.pdf",
    "overhaul/product-bundles/run/archive.zip",
    "zyx-attachments/2026-11-20/attachment.png",
    "discussions/channel/images/attachment.png",
  ];
  for (const user of [null, { user: { id: "unrelated", role: "admin" } }]) {
    session = user;
    for (const path of paths) {
      for (const key of [path, encodeURIComponent(path), `other/../${path}`]) {
        for (const [query, range] of [["", undefined], ["?download=1", undefined], ["", "bytes=0-3"]] as const) {
          const response = await get(key, query, range);
          expect(response.status).toBe(404);
          expect(response.headers.get("cache-control")).toBe("private, no-store");
        }
      }
    }
  }
  expect(fetches).toBe(before);
  expect(heads).toBe(0);
});

test("authorized scoped files are private, and tryout reads verify uploader and object version", async () => {
  session = { user: { id: "authorized" } };
  for (const path of ["exams/exam/attachments/answer.pdf", "schedules/booking/pre_session/notes.pdf"]) {
    const response = await get(path, "?download=1", "bytes=0-3");
    expect(response.status).toBe(206);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toStartWith("attachment");
    expect(lastRead?.Range).toBe("bytes=0-3");
    if (path.startsWith("exams/")) expect(lastRead?.IfMatch).toBe('"fixture"');
  }
  const before = fetches;
  uploader = "different-uploader";
  expect((await get("exams/exam/attachments/answer.pdf")).status).toBe(404);
  expect(fetches).toBe(before);
  session = { user: { id: "admin" } };
  const archive = await get("overhaul/product-bundles/run/archive.zip");
  expect(archive.status).toBe(200);
  expect(archive.headers.get("cache-control")).toBe("private, no-store");
});
