import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const ts = require(process.env.PUBLIC_ACCOUNT_TEST_TYPESCRIPT ?? "typescript");
const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
let user: Record<string, unknown>;
const menu = { Root: "root", Trigger: "trigger", Portal: "portal", Content: "content", Item: "item", Separator: "separator" };
const dependencies: Record<string, unknown> = {
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "next/link": { __esModule: true, default: "a" },
  "lucide-react": Object.fromEntries(["LogOut", "User", "LayoutDashboard", "GraduationCap", "ShieldCheck"].map((name) => [name, name])),
  "radix-ui": { DropdownMenu: menu },
  "@/components/auth/google-sign-in-button": { GoogleSignInButton: "sign-in" },
  "@/components/ui/button": { Button: "button" },
  "@/lib/auth-client": { useSession: () => ({ data: { user }, isPending: false }), signOut: async () => {} },
  "@/lib/utils": { cn: (...values: unknown[]) => values.filter(Boolean).join(" ") },
  "@/lib/i18n/client": { useTranslations: () => (key: string) => key },
};
const output = ts.transpileModule(readFileSync("components/nav-profile-or-sign-in.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const exports: Record<string, any> = {};
runInNewContext(output, { exports, require: (name: string) => {
  if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
  return dependencies[name];
} });

function links(node: any): string[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(links);
  return [...(node.type === "a" ? [node.props.href] : []), ...links(node.props?.children)];
}

describe("public account menu", () => {
  for (const variant of ["toolbar", "sheet"]) {
    it(`offers the same role-aware destinations in ${variant}`, () => {
      for (const [role, roles, expected] of [
        ["student", [], ["/profile", "/dashboard"]],
        ["teacher", [], ["/profile", "/dashboard", "/tutor"]],
        ["admin", [], ["/profile", "/dashboard", "/tutor", "/admin"]],
        ["student", ["admin"], ["/profile", "/dashboard", "/tutor", "/admin"]],
      ] as const) {
        user = { name: "Test", role, roles };
        expect(links(exports.NavProfileOrSignIn({ variant }))).toEqual(expected);
      }
    });
  }
});
