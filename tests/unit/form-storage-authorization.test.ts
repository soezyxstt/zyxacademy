import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

test("form proxy checks public image references or canonical admin before fetching bytes", async () => {
  const require = createRequire(import.meta.url);
  const { transformSync } = require(process.env.UI_TEST_ESBUILD ?? "esbuild");
  const table = (name: string) => new Proxy({ name }, { get: (target, key) => key === "name" ? target.name : { table: name, key } });
  const schema = Object.fromEntries(["customForms", "diktatMateri", "diktats", "mataKuliah", "studentQuizAttempts", "quizTemplates", "courseVideos"].map((name) => [name, table(name)]));
  const formRows: Array<{ deletedAt: Date | null; questions: unknown[] }> = [];
  let user: { id: string; role: string } | null = null;
  let admin = false, databaseFails = false, fetches = 0, formQueries = 0, roleChecks = 0;
  const predicate = (op: string) => (...args: any[]) => ({ op, args });
  const db = { select: () => ({ from: (source: any) => ({
    innerJoin: () => ({ where: async () => [] }),
    where: (condition: any) => source.name !== "customForms" ? Promise.resolve([]) : ({
      limit: async (limit: number) => {
        expect(limit).toBe(1);
        formQueries++;
        if (databaseFails) throw new Error("database unavailable");
        const terms = condition.args[1].args;
        expect(terms.every((term: any) => term.parts.join("").includes(" @> "))).toBe(true);
        const images = terms.map((term: any) => JSON.parse(term.values[1])[0].imageUrl);
        return formRows.some((row) => !row.deletedAt && row.questions.some((question: any) => images.includes(question.imageUrl))) ? [{ id: "form" }] : [];
      },
    }),
  }) }) };
  const modules: Record<string, unknown> = {
    "@aws-sdk/client-s3": { S3Client: class { async send() { fetches++; return { Body: "bytes", ContentType: "image/png" }; } }, GetObjectCommand: class {} },
    "next/headers": { headers: async () => new Headers() },
    "drizzle-orm": { and: predicate("and"), or: predicate("or"), eq: predicate("eq"), inArray: predicate("in"), isNotNull: predicate("notNull"), isNull: predicate("isNull"), sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({ parts, values }) },
    "@/db": { db }, "@/db/schema": schema,
    "@/lib/auth": { auth: { api: { getSession: async () => user ? { user } : null } } },
    "@/lib/auth/authorization": { hasPeran: async (_id: string, role: string) => { roleChecks++; expect(role).toBe("admin"); return admin; } },
    "@/lib/auth-site-url": { resolveAuthBaseUrl: () => "https://zyx.example" },
    "@/lib/admin/course-identity": {}, "@/lib/student/course-access": {},
    "@/lib/storage/keys": { isProtectedCourseDiktatPdfKey: () => false, isProtectedProductDiktatPdfKey: () => false, isSafeKey: (key: string) => Boolean(key) && !key.startsWith("/") && !key.includes("\\") && !key.includes(".."), leafFilename: () => "file.png", quizAttachmentPrefix: () => "" },
    "@/lib/storage/r2": { getS3StorageConfig: () => ({ bucket: "mock", client: {} }) },
  };
  const module = { exports: {} as any };
  const source = readFileSync("app/api/storage/file/[...key]/route.ts", "utf8");
  runInNewContext(transformSync(source, { loader: "ts", format: "cjs" }).code, {
    module, exports: module.exports, require: (name: string) => modules[name] ?? require(name),
    process: { env: {} }, URL, Request, Response, Headers, console,
  });
  const get = (key: string, search = "") => module.exports.GET(new Request(`https://zyx.example/api/storage/file/${key}${search}`), { params: Promise.resolve({ key: [key] }) });
  const key = "forms/survey/question-1/private.pdf";

  expect((await get(key)).status).toBe(404);
  user = { id: "other", role: "admin" };
  expect((await get(key, "?download=1")).status).toBe(404);
  expect(fetches).toBe(0);
  expect(roleChecks).toBe(1);
  user = { id: "respondent", role: "student" };
  expect((await get(key)).status).toBe(404);

  formRows.push({ deletedAt: null, questions: [{ imageUrl: `/api/storage/file/${key}-other` }, { title: `/api/storage/file/${key}` }] });
  expect((await get(key)).status).toBe(404);
  formRows[0].questions = [{ imageUrl: `https://external.example/api/storage/file/${key}?token=secret` }];
  expect((await get(key, "?token=secret")).status).toBe(404);
  formRows[0].questions = [{ imageUrl: `/api/storage/file/${key}` }];
  user = null;
  const publicImage = await get(key);
  expect(publicImage.status).toBe(200);
  expect(publicImage.headers.get("cache-control")).toBe("private, no-store");
  expect((await get(key, "?download=1")).status).toBe(200);
  formRows[0].questions = [{ imageUrl: "/api/storage/file/forms/survey/question-1/a%20b.png" }];
  expect((await get("forms/survey/question-1/a b.png")).status).toBe(200);
  formRows[0].deletedAt = new Date();
  expect((await get(key)).status).toBe(404);

  formRows[0] = { deletedAt: null, questions: [{ imageUrl: `https://zyx.example/api/storage/file/${key}?token=abc` }] };
  expect((await get(key, "?token=abc")).status).toBe(200);
  expect((await get(key)).status).toBe(404);
  user = { id: "admin", role: "student" };
  admin = true;
  const preview = await get("forms/survey/question-1/unsaved.png");
  expect(preview.status).toBe(200);
  expect(preview.headers.get("cache-control")).toBe("private, no-store");
  expect(preview.headers.get("content-security-policy")).toBe("sandbox");
  expect((await get("forms/survey/../secret.png")).status).toBe(404);
  databaseFails = true;
  expect((await get(key)).status).toBe(404);
  expect(fetches).toBe(5);
  expect(formQueries).toBe(13);
});
