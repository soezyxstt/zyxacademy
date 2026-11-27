import { expect, test } from "bun:test";
import { createAcademicClient } from "../../apps/mobile-native/features/academic/client";
import { handleAdminCourseManagementCommand } from "../../lib/native/academic/course-management-command";

const origin = "https://staging.zyxacademy.com";
const requestId = "test-course-write-01";
const viewer = { user: { id: "admin" }, session: { id: "primary" } };
const create = { id: "matematika-baru", title: "Matematika", category: "Matematika", description: null,
  pricing: { category: "premium" as const, startsAt: null, endsAt: null } };
const archive = { expectedRevision: "a".repeat(64), confirmed: true as const };
const prefix = ["admin", "courses"];

test("requires a signed-in administrator, same-origin writes, pricing validity and explicit archive consent", async () => {
  const writes: unknown[] = [];
  let active = true;
  let admin = true;
  const services = {
    session: async () => active ? viewer : null,
    hasAdmin: async () => admin,
    async create(...input: unknown[]) { writes.push(input); },
    async archive(...input: unknown[]) { writes.push(input); },
  };
  const run = (parts: string[], body: unknown, site = origin) => handleAdminCourseManagementCommand(new Request(origin, {
    method: "POST", headers: { origin: site, "content-type": "application/json", "idempotency-key": requestId },
    body: JSON.stringify(body),
  }), parts, origin, services);
  const archiveTarget = [...prefix, create.id, "archive"];
  expect((await run(archiveTarget, archive, "https://example.test")).status).toBe(403);
  expect((await run(archiveTarget, { ...archive, confirmed: false })).status).toBe(422);
  expect((await run(prefix, { ...create, pricing: { ...create.pricing, category: "limited_time_free" } })).status).toBe(422);
  active = false;
  expect((await run(prefix, create)).status).toBe(401);
  active = true;
  admin = false;
  expect((await run(archiveTarget, archive)).status).toBe(403);
  expect(writes).toEqual([]);
  admin = true;
  expect(await (await run(prefix, create)).json()).toEqual({ status: "saved", requestId });
  expect(await (await run(archiveTarget, archive)).json()).toEqual({ status: "saved", requestId });
  expect(writes).toEqual([[create, requestId, viewer], [create.id, archive, requestId, viewer]]);
});

test("uses the real course routes and retains the exact nested draft during recovery", async () => {
  const writes: unknown[] = [];
  let status = 503;
  let code = "";
  const client = createAcademicClient({ accountId: "admin", origin, locale: "id",
    get: async () => Response.json(null),
    command: async (path, command) => {
      writes.push([path, command]);
      return Response.json(status === 200 ? { status: "saved", requestId } : { error: code }, { status });
    },
  });
  const createTarget = client.createCourse!;
  const signal = new AbortController().signal;
  expect(await createTarget.submit(create, requestId, signal)).toEqual({ status: "retry" });
  expect(await createTarget.submit({ ...create, pricing: { ...create.pricing, category: "free" } }, requestId, signal)).toEqual({ status: "retry" });
  expect(writes).toHaveLength(1);
  status = 200;
  expect(await createTarget.submit(createTarget.pending()!.draft, requestId, signal)).toEqual({ status: "saved" });
  expect(writes).toEqual(Array(2).fill(["/api/native/academic/admin/courses", { method: "POST", body: create, requestId }]));
  createTarget.acknowledge(requestId);
  expect(createTarget.pending()).toBeNull();
  status = 409;
  code = "COURSE_ALREADY_EXISTS";
  expect(await createTarget.submit(create, requestId, signal)).toEqual({ status: "exists" });
  code = "DEPENDENCIES_EXIST";
  expect(await client.archiveCourse!(create.id).submit(archive, requestId, signal)).toEqual({ status: "dependencies" });
  expect(writes.at(-1)).toEqual([`/api/native/academic/admin/courses/${create.id}/archive`, { method: "POST", body: archive, requestId }]);
});
