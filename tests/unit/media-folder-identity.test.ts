import { beforeEach, expect, mock, test } from "bun:test";

const objects = ["media/Foo/one.pdf", "media/foo/two.pdf", "legacy/Syllabus Upper/three.pdf"];
const copied: Array<[string, string]> = [], deleted: string[] = [], uploaded: string[] = [];
mock.module("next/server", () => ({ NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } }));
mock.module("@/lib/auth/admin-guards", () => ({ assertAdmin: async () => ({}) }));
mock.module("@/lib/date-utils", () => ({ formatIsoDateUtc: () => "2026-11-14" }));
mock.module("@/lib/storage", () => ({ storage: {
  list: async (prefix: string) => objects.filter(key => key.startsWith(prefix)).map(key => ({ key, size: 1, lastModified: new Date(0) })),
  getUrl: (key: string) => `/api/storage/file/${key}`,
  exists: async () => false,
  copy: async (from: string, to: string) => { copied.push([from, to]); },
  delete: async (key: string) => { deleted.push(key); },
  upload: async (_file: unknown, _name: string, _type: string, { key }: { key: string }) => { uploaded.push(key); return { key }; },
} }));
const media = await import("@/app/api/admin/media/route");
const ops = await import("@/app/api/admin/media/ops/route");
const storage = await import("@/app/api/admin/media/storage/route");
const { buildMediaKey, existingMediaFolderPath, buildMediaFolderPath } = await import("@/lib/storage/keys");
const request = (body: unknown) => new Request("https://example.test/api/admin/media/ops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => { copied.length = 0; deleted.length = 0; uploaded.length = 0; });

test("listing distinguishes an existing uppercase folder from its lowercase neighbour", async () => {
  const response = await media.GET(new Request("https://example.test/api/admin/media?folder=Foo"));
  expect(response.status).toBe(200);
  expect((await response.json()).files.map((file: any) => file.key)).toEqual(["media/Foo/one.pdf"]);
});

test("folder deletion targets the exact existing prefix", async () => {
  expect((await ops.POST(request({ action: "delete", kind: "folder", folderPath: "Foo" }))).status).toBe(200);
  expect(deleted).toEqual(["media/Foo/one.pdf"]);
});

test("copying a file preserves the selected existing destination", async () => {
  expect((await ops.POST(request({ action: "copy", key: "media/foo/two.pdf", targetFolder: "Foo" }))).status).toBe(200);
  expect(copied[0][1]).toMatch(/^media\/Foo\//);
  expect(deleted).toEqual([]);
});

test("storage folder copies place files and marker under the same exact prefix", async () => {
  expect((await storage.POST(request({ action: "copy", kind: "folder", folderPath: "legacy/Syllabus Upper", targetFolder: "Foo" }))).status).toBe(200);
  expect(copied[0][1]).toMatch(/^media\/Foo\/Syllabus Upper\//);
  expect(uploaded).toEqual(["media/Foo/Syllabus Upper/.keep"]);
});

test("new names are normalized while existing paths keep their identity and reject traversal", () => {
  expect(buildMediaFolderPath("Foo/New Folder")).toBe("Foo/new-folder");
  expect(buildMediaKey({ folderPath: "Foo", filename: "file.pdf" })).toMatch(/^media\/foo\//);
  expect(buildMediaKey({ folderPath: "Foo", filename: "file.pdf", preserveFolderPath: true })).toMatch(/^media\/Foo\//);
  for (const folder of ["../Foo", "Foo/../foo", "/Foo", "Foo\\foo", "Foo//foo"]) {
    expect(() => existingMediaFolderPath(folder)).toThrow();
  }
});
