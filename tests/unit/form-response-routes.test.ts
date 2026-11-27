import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import * as fileTypes from "@/lib/forms/file-types";
import * as presentation from "@/lib/forms/presentation";
import * as responsePolicy from "@/lib/forms/response-policy";
import { formResponseAttachmentFolder } from "@/lib/forms/response-attachment-key";
import * as storageUtils from "@/lib/forms/storage-utils";

const origin = "https://zyx.example";
const require = createRequire(import.meta.url);
const { transformSync } = require(process.env.UI_TEST_ESBUILD ?? "esbuild");
const verifiedUser = { id: "student", email: "account@example.test", emailVerified: true };

type FormSettings = Parameters<typeof responsePolicy.getFormClosedReason>[0];
type Form = {
  id: string;
  slug: string;
  title: string;
  questions: Array<{ type: string; maxFileSizeMb?: number; allowedFileTypes?: fileTypes.FormFileMime[] }>;
  settings: FormSettings;
  deletedAt: Date | null;
};

function fixture() {
  const form: Form = {
    id: "f1",
    slug: "public-survey",
    title: "Tim akademik",
    settings: {},
    deletedAt: null,
    questions: [{ type: "TEXT" }, { type: "FILE_UPLOAD", maxFileSizeMb: 0.001 }],
  };
  const current = { user: null as typeof verifiedUser | null, isAdmin: false };
  const submissions: Array<{ responderEmail: string | null; responderUserId: string | null }> = [];
  const uploads: Array<{ key: string; mime: string }> = [];
  const customForms = {
    id: "id", slug: "slug", title: "title", questions: "questions", settings: "settings", deletedAt: "deletedAt",
  };
  type Predicate = (row: Form) => boolean;
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "drizzle-orm": {
      and: (...predicates: Predicate[]) => (row: Form) => predicates.every((predicate) => predicate(row)),
      or: (...predicates: Predicate[]) => (row: Form) => predicates.some((predicate) => predicate(row)),
      eq: (field: keyof Form, expected: unknown) => (row: Form) => row[field] === expected,
      isNull: (field: keyof Form) => (row: Form) => row[field] === null,
    },
    "@/db": { db: {
      select: () => ({ from: () => ({ where: (predicate: Predicate) => ({ limit: async () => predicate(form) ? [form] : [] }) }) }),
      insert: () => ({ values: (record: typeof submissions[number]) => ({ returning: async () => {
        submissions.push(record);
        return [record];
      } }) }),
    } },
    "@/db/schema": { customForms, customFormResponses: {} },
    "@/lib/auth": { auth: { api: { getSession: async () => current.user ? { user: current.user } : null } } },
    "@/lib/auth/authorization": { hasPeran: async (_id: string, role: string) => role === "admin" && current.isAdmin },
    "@/lib/forms/short-entry": { findShortFormEntry: async () => null, findFullFormEntry: async () => form },
    "@/lib/forms/file-types": fileTypes,
    "@/lib/forms/presentation": presentation,
    "@/lib/forms/response-policy": responsePolicy,
    "@/lib/forms/storage-utils": storageUtils,
    "@/lib/storage": { storage: {
      upload: async (_file: File, _name: string, mime: string, { key }: { key: string }) => {
        uploads.push({ key, mime });
        return { key };
      },
      getUrl: (key: string) => `/api/storage/file/${key}`,
    } },
  };
  function route(path: string) {
    const module = { exports: {} as {
      POST: (req: Request, ctx?: { params: Promise<{ idOrSlug: string }> }) => Promise<Response>;
    } };
    const source = readFileSync(path, "utf8");
    runInNewContext(transformSync(source, { loader: "ts", format: "cjs" }).code, {
      module, exports: module.exports, require: (name: string) => modules[name] ?? require(name), File, crypto, console, URL,
    });
    return module.exports.POST;
  }

  return { form, current, route, submissions, uploads };
}

test("submission stores only the address permitted by the form's email mode", async () => {
  const { form, current, route, submissions } = fixture();
  const post = route("app/api/forms/[idOrSlug]/route.ts");
  const submit = (responderEmail?: unknown) => post(new Request(`${origin}/api/forms/f1`, {
    method: "POST",
    body: JSON.stringify({ answers: {}, responderEmail }),
  }), { params: Promise.resolve({ idOrSlug: form.id }) });

  form.settings.collectEmail = "verified";
  expect((await submit()).status).toBe(401);
  current.user = { ...verifiedUser, emailVerified: false };
  expect((await submit()).status).toBe(403);
  expect(submissions).toHaveLength(0);
  current.user = verifiedUser;
  expect((await submit("input@example.test")).status).toBe(200);
  expect(submissions.at(-1)?.responderEmail).toBe(verifiedUser.email);

  form.settings.collectEmail = "none";
  expect((await submit()).status).toBe(200);
  expect((await submit("input@example.test")).status).toBe(200);
  expect(submissions.slice(-2).map((response) => response.responderEmail)).toEqual([null, null]);
  expect(submissions.at(-1)?.responderUserId).toBe(verifiedUser.id);

  form.settings.collectEmail = "input";
  expect((await submit()).status).toBe(400);
  expect((await submit("invalid-address")).status).toBe(400);
  expect((await submit("  input@example.test  ")).status).toBe(200);
  expect(submissions.at(-1)?.responderEmail).toBe("input@example.test");
  current.user = null;
  form.settings.requireLogin = true;
  expect((await submit("input@example.test")).status).toBe(401);
  expect(submissions).toHaveLength(4);
});

test("public upload requires an open form and validates the stored question and its size limit", async () => {
  const { form, current, route, uploads } = fixture();
  const post = route("app/api/forms/upload/route.ts");
  const pdf = new File(["%PDF-1.4\n"], "receipt.pdf", { type: "application/pdf" });
  const submit = (file = pdf, formId = form.id, question = "2") => {
    const body = new FormData();
    body.append("file", file);
    body.append("formTitle", "Ignored title");
    body.append("formSlug", formId);
    body.append("questionNumber", question);
    return post(new Request(`${origin}/api/forms/upload`, { method: "POST", body }));
  };

  expect((await submit(pdf, "")).status).toBe(400);
  expect((await submit(pdf, "unknown")).status).toBe(404);
  form.deletedAt = new Date();
  expect((await submit()).status).toBe(404);
  form.deletedAt = null;
  for (const settings of [
    { acceptingResponses: false },
    { openAt: "2999-01-01T00:00:00Z" },
    { closeAt: "2000-01-01T00:00:00Z" },
  ]) {
    form.settings = settings;
    expect((await submit()).status).toBe(403);
  }
  form.settings = { requireLogin: true };
  expect((await submit()).status).toBe(401);
  form.settings = { collectEmail: "verified" };
  current.user = { ...verifiedUser, emailVerified: false };
  expect((await submit()).status).toBe(403);
  current.user = verifiedUser;
  expect((await submit(pdf, form.id, "1")).status).toBe(404);
  expect((await submit(pdf, form.id, "3")).status).toBe(404);
  expect((await submit(new File(["%PDF-1.4\n", "0".repeat(2048)], "large.pdf"))).status).toBe(400);
  expect((await submit(new File(["ordinary text"], "notes.txt", { type: "text/plain" }))).status).toBe(415);
  expect((await submit(new File(["ordinary text"], "receipt.pdf", { type: "application/pdf" }))).status).toBe(415);
  form.questions[1].allowedFileTypes = ["image/png"];
  expect(fileTypes.formFileAccept(form.questions[1].allowedFileTypes)).toBe(".png");
  expect((await submit()).status).toBe(415);
  expect(uploads).toHaveLength(0);

  form.questions[1].allowedFileTypes = ["application/pdf"];
  expect((await submit()).status).toBe(200);

  form.settings = {};
  current.user = null;
  delete form.questions[1].allowedFileTypes;
  const response = await submit(pdf, form.slug);
  expect(response.status).toBe(200);
  expect(uploads).toHaveLength(2);
  expect(uploads[1].mime).toBe("application/pdf");
  expect(uploads[1].key).toMatch(new RegExp(`^forms/${formResponseAttachmentFolder(form.id)}/question-2/`));
  expect((await response.json()).url).toBe(`/api/storage/file/${uploads[1].key}`);
});

test("a draft question image requires canonical admin access and a supported raster image", async () => {
  const { current, route, uploads } = fixture();
  const post = route("app/api/admin/custom-forms/image/route.ts");
  const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "question.png", { type: "image/png" });
  const submit = (file = png) => {
    const body = new FormData();
    body.append("file", file);
    body.append("formTitle", "Draft survey");
    body.append("questionNumber", "1");
    return post(new Request(`${origin}/api/admin/custom-forms/image`, { method: "POST", body }));
  };

  expect((await submit()).status).toBe(403);
  current.user = verifiedUser;
  expect((await submit()).status).toBe(403);
  current.isAdmin = true;
  expect((await submit(new File(["%PDF-1.4\n"], "receipt.pdf", { type: "application/pdf" }))).status).toBe(415);
  expect(uploads).toHaveLength(0);
  const response = await submit();
  expect(response.status).toBe(200);
  expect(uploads).toHaveLength(1);
  expect(uploads[0].mime).toBe("image/png");
  expect(uploads[0].key).toMatch(/^forms\/draft-survey\/question-1\//);
});

test("recognizes legacy builder defaults and preserves custom respondent messages", () => {
  for (const closedMessage of ["Formulir ini telah ditutup dan tidak lagi menerima tanggapan.", "This form is closed and no longer accepts responses."]) {
    expect(responsePolicy.getFormClosure({ acceptingResponses: false, closedMessage })).toEqual({ kind: "closed", message: "" });
  }
  expect(responsePolicy.customFormMessage("customSuccessMessage", "Jawaban Anda telah berhasil disimpan.")).toBe("");
  for (const key of ["closedMessage", "customSuccessMessage"] as const) {
    expect(responsePolicy.customFormMessage(key, "Terima kasih, kelas A.")).toBe("Terima kasih, kelas A.");
  }
});
