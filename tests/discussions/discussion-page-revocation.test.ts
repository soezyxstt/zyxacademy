import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { getTableName } from "drizzle-orm";
import ts from "typescript";

let roles = ["admin"], writes = 0;
const db = {
 select: () => {
  let table = "";
  const query = {
   from(value: never) { table = getTableName(value); return this; },
   where() { return this; }, innerJoin() { return this; }, limit() { return this; },
   then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
    const rows = table === "user" ? [{ id: "legacy-admin", role: "admin" }]
     : table === "pengguna" ? [{ id: "legacy-admin", status: "active" }]
     : table === "pengguna_peran" ? roles.map(code => ({ code })) : [];
    return Promise.resolve(rows).then(resolve, reject);
   },
  };
  return query;
 },
 transaction: async () => { writes++; throw new Error("unexpected identity write"); },
 insert: () => { writes++; throw new Error("unexpected identity write"); },
};
mock.module("@/db", () => ({ db }));
const access = await import("@/lib/discussions/access");

test("course page denies a role revoked after its session actor check without identity writes", async () => {
 roles = ["admin"]; writes = 0;
 const emptyState = () => null;
 const element = (type: unknown, props: unknown) => ({ type, props });
 const ui = new Proxy({}, { get: () => () => null });
 const deps: Record<string, unknown> = {
  "react": { Suspense: () => null },
  "react/jsx-runtime": { jsx: element, jsxs: element },
  "next/link": { default: () => null },
  "next/navigation": { redirect: () => { throw new Error("unexpected redirect"); } },
  "@/components/application-page": ui,
  "@/components/page-header": ui,
  "@/components/admin/state-panels": { AdminEmptyState: emptyState },
  "@/components/ui/button": ui,
  "lucide-react": ui,
  "@/lib/auth-session": { getAuthSession: async () => ({ user: { id: "legacy-admin", name: "Admin" } }) },
  "@/lib/discussions/access": access,
  "@/lib/discussions/session": { getSessionDiscussionActor: async () => {
   const actor = await access.getDiscussionActor("legacy-admin");
   roles = [];
   return actor;
  } },
  "@/lib/gamification/queries": { getEquippedZyraAppearance: async () => { throw new Error("unexpected page access"); } },
  "@/lib/i18n/server": { getTranslations: async () => (key: string) => key },
  "./discussion-client": ui,
  "./discussion-skeleton": ui,
 };
 const exports: Record<string, any> = {};
 const source = readFileSync("components/discussions/discussion-page.tsx", "utf8");
 const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
 runInNewContext(code, { exports, require: (name: string) => { if (!(name in deps)) throw new Error(name); return deps[name]; } });
 const page = await exports.DiscussionPage({ courseId: "course", surface: "admin" });
 expect(page.props.children[1].type).toBe(emptyState);
 expect(writes).toBe(0);
});
