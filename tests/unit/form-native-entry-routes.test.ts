import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import * as fileTypes from "../../lib/forms/file-types";
import * as presentation from "../../lib/forms/presentation";
import * as responsePolicy from "../../lib/forms/response-policy";

const require = createRequire(import.meta.url);
const { transformSync } = require(process.env.UI_TEST_ESBUILD ?? "esbuild");
const origin = "https://zyx.example";

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;
type Handler = (request: Request, context: { params: Promise<{ idOrSlug: string }> }) => Promise<Response>;
function fixture() {
  const form = { id: "form-id", slug: "schedule", title: "Tutorial", deletedAt: null as Date | null,
    settings: { acceptingResponses: false }, questions: [{ type: "FILE_UPLOAD", maxFileSizeMb: 1 }] };
  const alias = { ...form, id: "alias", slug: form.id, settings: {}, questions: [] };
  const meeting = { slug: "schedule", meetingUri: "https://meet.google.com/abc-defg-hij", deletedAt: null as Date | null };
  const customForms = { id: "id", slug: "slug", title: "title", settings: "settings", questions: "questions", deletedAt: "deletedAt" };
  const meetings = { slug: "slug", meetingUri: "meetingUri", deletedAt: "deletedAt" };
  const submissions: Row[] = [];
  const uploadKeys: string[] = [];
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "drizzle-orm": {
      and: (...predicates: Predicate[]) => (row: Row) => predicates.every(predicate => predicate(row)),
      or: (...predicates: Predicate[]) => (row: Row) => predicates.some(predicate => predicate(row)),
      eq: (field: string, expected: unknown) => (row: Row) => row[field] === expected,
      isNull: (field: string) => (row: Row) => row[field] === null,
    },
    "@/db": { db: {
      select: () => ({ from: (table: unknown) => ({
        where: (predicate: Predicate) => ({
          limit: async () => (table === meetings ? [meeting] : [alias, form]).filter(predicate).slice(0, 1),
        }),
      }) }),
      insert: () => ({ values: (row: Row) => ({ returning: async () => {
        submissions.push(row);
        return [row];
      } }) }),
    } },
    "@/db/schema": { customForms, googleMeetSessions: meetings, customFormResponses: {} },
    "@/lib/auth": { auth: { api: { getSession: async () => null } } },
    "@/lib/forms/file-types": fileTypes,
    "@/lib/forms/presentation": presentation,
    "@/lib/forms/response-policy": responsePolicy,
    "@/lib/forms/storage-utils": { buildFormStorageKey: ({ formSlug }: { formSlug: string }) => `forms/${formSlug}/question-1/answer.pdf` },
    "@/lib/storage": { storage: {
      upload: async (_file: File, _name: string, _mime: string, { key }: { key: string }) => {
        uploadKeys.push(key);
        return { key };
      },
      getUrl: (key: string) => "/api/storage/file/" + key,
    } },
  };
  function run(path: string) {
    const target = { exports: {} as { GET: Handler; POST: Handler; findShortFormMeeting(slug: string): Promise<string | null> } };
    runInNewContext(transformSync(readFileSync(path, "utf8"), { loader: "ts", format: "cjs" }).code, {
      module: target, exports: target.exports, require: (name: string) => modules[name] ?? require(name), File, crypto, console, URL,
    });
    return target.exports;
  }
  modules["@/lib/forms/short-entry"] = run("lib/forms/short-entry.ts");
  return { form, alias, meeting, submissions, uploadKeys, route: run("app/api/forms/[idOrSlug]/route.ts"),
    upload: run("app/api/forms/upload/route.ts").POST };
}

function context(idOrSlug: string) {
  return { params: Promise.resolve({ idOrSlug }) };
}

test("native short GET uses exact form slug before meeting and then the original alias lookup", async () => {
  const { form, alias, meeting, route } = fixture();
  const load = (id: string, short: boolean) => route.GET(new Request(`${origin}/api/forms/${id}${short ? "?entry=short" : ""}`), context(id));
  expect(await (await load("SCHEDULE", true)).json()).toMatchObject({ isClosed: true, form: { id: form.id } });
  form.deletedAt = new Date();
  expect(await (await load("SCHEDULE", true)).json()).toEqual({ success: true, destination: "meeting", meetingUri: meeting.meetingUri });
  expect((await load("SCHEDULE", false)).status).toBe(404);
  meeting.deletedAt = new Date();
  expect((await load("SCHEDULE", true)).status).toBe(404);
  form.deletedAt = null;
  alias.deletedAt = new Date();
  meeting.deletedAt = null;
  meeting.slug = form.id;
  expect(await (await load(form.id, true)).json()).toMatchObject({ destination: "meeting" });
  meeting.deletedAt = new Date();
  expect(await (await load(form.id, true)).json()).toMatchObject({ form: { id: form.id } });
});

test("native POST and upload bind to the canonical form ID even when another form has that slug", async () => {
  const { form, route, upload, submissions, uploadKeys } = fixture();
  form.settings.acceptingResponses = true;
  const submit = (id: string) => route.POST(new Request(`${origin}/api/forms/${id}?target=id`, {
    method: "POST", body: JSON.stringify({ answers: {} }),
  }), context(id));
  expect((await submit(form.slug)).status).toBe(404);
  expect(submissions).toHaveLength(0);
  expect((await submit(form.id)).status).toBe(200);
  expect(submissions).toMatchObject([{ formId: form.id }]);

  const send = (id: string) => {
    const body = new FormData();
    body.set("formSlug", id);
    body.set("questionNumber", "1");
    body.set("file", new File(["%PDF-"], "tiny.pdf", { type: "application/pdf" }));
    return upload(new Request(`${origin}/api/forms/upload?target=id`, { method: "POST", body }), context(id));
  };
  expect((await send(form.slug)).status).toBe(404);
  expect((await send(form.id)).status).toBe(200);
  expect(uploadKeys).toEqual([`forms/${form.slug}/question-1/answer.pdf`]);
});
