/** Compare the current Next page inventory with committed Expo dispatch and handoff policies. */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { authEntryHref, readAuthReturnTo, resolveNativeLoginReturn, resolveNativeProtectedDestination, type NativeRouteNode } from "../../../apps/mobile-native/auth/login-intent";
import { NATIVE_STAGING_ORIGIN } from "../../../apps/mobile-native/auth/session-api";
import { resolveOperationsArea } from "../../../apps/mobile-native/features/operations/routes";
import { matchStudentRoute } from "../../../apps/mobile-native/features/student/routes";
import { productLocation } from "../../../apps/mobile-native/routing/product-location";
import { publicWebsiteUrl } from "../../../apps/mobile-native/routing/public-website";
import { matchAcademicRoute } from "../../../packages/native-parity/academic/match";
import { isAdminCourseLiveSection } from "../../../packages/native-parity/academic/courses/sections";
import { ADMINISTRATION_API_PREFIX, administrationReadPath } from "../../../packages/native-parity/academic/administration/live";
import { handleAdministrationRead } from "../../../lib/native/academic/administration/handle-read";
import { matchEvaluationRoute, resolveEvaluationAlias } from "../../../packages/native-parity/operations/evaluation-routes";
import { matchManagementPath } from "../../../packages/native-parity/operations/management-contract";
import { studentCommunityAlias } from "../../../packages/native-parity/student/community/routes";

const roles = ["murid", "tutor", "admin"] as const;
type Role = typeof roles[number];
const dashboard = { murid: "/dashboard", tutor: "/tutor", admin: "/admin" } as const;
type Owner = "student" | "academic" | "operations" | "integration";
type Kind = "native-screen" | "native-alias" | "public-browser" | "private-browser" | "protocol-endpoint" | "web-tool" | "missing";
type Page = { pattern: string; webSource: string; owner: Owner };
type RouteRow = Page & { kind: Kind; expoSource?: string; dispatch?: string; targets?: string[]; note?: string };

const host = {
  "/": { marker: "<AuthContinuation" },
  "/sign-in": { marker: '<AuthEntry entry="sign-in"' },
  "/sign-up": { marker: '<AuthEntry entry="sign-up"' },
  "/sign-out": { marker: "logout" },
  "/offline": { marker: "useNativeSession" },
} as const;

const browserNotes: Readonly<Record<string, string>> = {
  "/forms/[id]": "Public form viewer and submission remain in the website.",
  "/f/[slug]": "Next resolves the short link to its actual form or Google Meet destination.",
  "/meet/[slug]": "Next validates the invitation and resolves the Google Meet handoff.",
  "/v4": "Public noindex reference reader and linked PDF remain in the website.",
};

// The web pages authorize the signed account itself for these personal routes.
const accountPages = new Set(["/profile", "/profile/edit", "/settings", "/settings/notifications", "/settings/notifications/browser"]);

const adminAliases = {
  "/admin/authoring-context": ["authoring"],
  "/admin/materials/manual": ["manual"],
  "/admin/bundles/idea": ["bundle-idea"],
  "/admin/bundles/product": ["bundle-product"],
  "/admin/materials": ["materials"],
  "/admin/materials/review": ["review"],
  "/admin/materials/review/idea/[slug]": ["idea", "route-probe"],
  "/admin/materials/review/product/[slug]": ["product", "route-probe"],
  "/admin/tutorial-pka": ["pka"],
} as const;

export function pagePattern(source: string) {
  return "/" + source.split("/").slice(1, -1).filter(part => !part.startsWith("(")).join("/");
}

function walk(root: string, directory: string, excluded: ReadonlySet<string>): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !excluded.has(entry.name)) return walk(root, path, excluded);
    return entry.isFile() ? [relative(root, path)] : [];
  }).sort();
}

export function readRouteInventory(root: string): Page[] {
  const rows = readFileSync(join(root, "plans/native-parallel/routes.tsv"), "utf8").trimEnd().split("\n").slice(1);
  const tracked = new Set<string>();
  const patterns = new Set<string>();
  const actual = walk(root, join(root, "app"), new Set(["visual-fixtures"])).filter(path => path.endsWith("/page.tsx"));
  const actualPages = new Set(actual);
  const inventory = rows.map(row => {
    const [owner, webSource] = row.split("\t");
    const pattern = pagePattern(webSource);
    if (!["student", "academic", "operations", "integration"].includes(owner) || tracked.has(webSource) || patterns.has(pattern)) {
      throw new Error(`Invalid or duplicate inventory row: ${row}`);
    }
    if (!actualPages.has(webSource)) throw new Error(`Inventory references a missing Next page: ${webSource}`);
    tracked.add(webSource);
    patterns.add(pattern);
    return { owner: owner as Owner, webSource, pattern };
  });
  const uncovered = actual.filter(file => !tracked.has(file));
  if (uncovered.length) throw new Error(`Next pages are missing from the inventory: ${uncovered.join(", ")}`);
  return inventory.sort((a, b) => a.pattern.localeCompare(b.pattern, "en"));
}

function readExpoFiles(root: string) {
  const app = "apps/mobile-native/app";
  const files = walk(root, join(root, app), new Set(["internal", "gallery", "shared-ui"]));
  const expo = new Map<string, string>();
  for (const file of files) {
    const leaf = file.slice(app.length + 1).split("/").at(-1) ?? "";
    if (!leaf.endsWith(".tsx") || leaf.startsWith("_") || leaf.startsWith("+")) continue;
    const pattern = "/" + file.slice(app.length + 1, -4).replace(/(?:^|\/)index$/, "")
      .split("/").filter(part => part && !part.startsWith("(")).join("/");
    if (expo.has(pattern)) throw new Error(`Duplicate Expo mount: ${pattern}`);
    expo.set(pattern, file);
  }
  return expo;
}

const node = (href: string, contextKey: string): NativeRouteNode => ({ href, contextKey, isGenerated: false, isInternal: false, children: [] });
const sample = (pattern: string) => pattern.replace(/\[([^\]]+)\]/g, (_, key) => key === "stage" ? "1" : "route-probe");
const pathname = (href: string) => href.split(/[?#]/, 1)[0];
const sourceOf = (root: string, file?: string) => file ? readFileSync(join(root, file), "utf8") : "";

export async function auditProductRoutes(root: string) {
  const pages = readRouteInventory(root);
  const expo = readExpoFiles(root);
  const sitemap = { ...node("/", "app"), children: Array.from(expo, ([href, path]) => node(href, path)) };
  const account = (role: Role) => ({ roles: [role], dashboard: dashboard[role] });
  const current = (role: Role, href: string) => resolveNativeProtectedDestination(href, account(role), sitemap);
  const rows: RouteRow[] = [];
  const issues: string[] = [];
  const add = (page: Page, kind: Kind, info: Partial<RouteRow> = {}) => {
    rows.push({ ...page, kind, expoSource: expo.get(page.pattern), ...info });
  };
  const issue = (pattern: string, reason: string) => issues.push(`${pattern}: ${reason}`);
  const requireSource = (page: Page, marker: string) => {
    if (sourceOf(root, expo.get(page.pattern)).includes(marker)) return true;
    issue(page.pattern, "Expo mount is missing or points to the wrong entry");
    return false;
  };
  const alias = (page: Page, role: Role, targets: string[], note?: string) => {
    if (!targets.length || targets.some(target => !current(role, target) || pathname(target) === sample(page.pattern))) {
      issue(page.pattern, "redirect did not resolve to a permitted, installed target");
    }
    add(page, "native-alias", { targets, note });
  };

  for (const page of pages) {
    const { pattern, owner, webSource } = page;
    const href = sample(pattern);
    if (pattern in host) {
      requireSource(page, host[pattern as keyof typeof host].marker);
      if (pattern === "/") {
        if (!expo.has("/website") || publicWebsiteUrl(NATIVE_STAGING_ORIGIN + "/") !== NATIVE_STAGING_ORIGIN + "/") {
          issue(pattern, "the explicit HTTPS homepage has no public handoff");
        }
        add(page, "public-browser", { dispatch: "website", note: "Next serves the public homepage. The bare Expo launch starts the app independently." });
        continue;
      }
      if (pattern === "/offline" && !current("murid", pattern)) issue(pattern, "verified Student cannot reach offline library");
      add(page, "native-screen", { dispatch: "host" });
      continue;
    }
    if (pattern === "/auth/native-start" || pattern === "/auth/native-finish") {
      const finish = pattern.endsWith("finish");
      if (finish) requireSource(page, "useNativeSession");
      else if (expo.has(pattern)) issue(pattern, "browser-origin PKCE start must stay in Next");
      add(page, "protocol-endpoint", { note: finish ? "Native callback completes the browser login exchange." : "Browser-origin PKCE start and sign-in belong to Next." });
      continue;
    }
    if (pattern === "/authoring-verification") {
      if (expo.has(pattern)) issue(pattern, "browser-only authoring tool unexpectedly has a product mount");
      add(page, "web-tool", { note: "The verification driver supplies the document through same-origin window messages." });
      continue;
    }
    if (pattern === "/mcp/connections") {
      requireSource(page, "<AccountConnections");
      if (roles.some(role => current(role, href)?.pattern !== pattern)) issue(pattern, "signed-in role cannot open its own MCP connections");
      add(page, "native-screen", { dispatch: "account" });
      continue;
    }
    if (pattern === "/mcp/authorize") {
      requireSource(page, '<BrowserHandoff kind="authorize"');
      add(page, "private-browser", { note: "The registered OAuth client starts consent in the browser." });
      continue;
    }
    if (webSource.includes("/(marketing)/") || pattern in browserNotes || pattern === "/tautan") {
      requireSource(page, `publicWebRoute("${pattern}")`);
      if (publicWebsiteUrl(href) !== NATIVE_STAGING_ORIGIN + href || !expo.has("/website")) {
        issue(pattern, "public website handoff rejected the registered URL");
      }
      add(page, "public-browser", { note: browserNotes[pattern] });
      continue;
    }

    if (pattern === "/murid") {
      requireSource(page, 'productLocation("/dashboard"');
      alias(page, "murid", [current("murid", href)?.href ?? ""], "Legacy Student home.");
      continue;
    }
    if (pattern === "/discussions") {
      requireSource(page, "<AuthContinuation");
      const intent = readAuthReturnTo(authEntryHref({ entry: "sign-in", locale: "en", next: "/discussions?thread=sample&message=part%2Ftwo" }).params.returnTo);
      const targets = roles.flatMap(role => {
        const target = resolveNativeLoginReturn(intent, account(role), sitemap);
        if (target.status === "ready" && target.href === `${dashboard[role]}/discussions?thread=sample&message=part%2Ftwo`) return [target.href];
        issue(pattern, `verified ${role} cannot reach the corresponding discussion target`);
        return [];
      });
      if (!intent) issue(pattern, "login continuation dropped the discussion alias");
      add(page, "native-alias", { targets, note: "The verified account's Admin, Tutor or Student workspace receives the original query." });
      continue;
    }

    const role = owner === "student" ? "murid" : pattern.startsWith("/tutor") ? "tutor" : "admin";
    if (owner === "integration") {
      issue(pattern, "no reviewed host disposition");
      add(page, "missing");
      continue;
    }
    requireSource(page, `productRoute("${pattern}", "${owner}"${owner === "student" ? ", StudentProductRoute" : ""})`);
    if (pattern === "/courses/[id]/live/host") {
      const target = current("tutor", href);
      alias(page, "tutor", [target?.href ?? ""], "Legacy Student URL for the Tutor-only host surface.");
      if (current("murid", href) || current("admin", href)) issue(pattern, "legacy Tutor Live alias gains the wrong role");
      continue;
    }

    const sharedAccountPage = accountPages.has(pattern);
    if (roles.some(candidate => {
      const target = current(candidate, href);
      return sharedAccountPage || candidate === role ? target?.pattern !== pattern : Boolean(target);
    })) {
      issue(pattern, "login destination does not match the installed route and role");
    }
    if (owner === "student") {
      const matched = matchStudentRoute(href);
      if (matched?.pattern !== pattern) issue(pattern, "Student dispatcher does not match this route");
      if (pattern === "/settings/notifications/browser") {
        add(page, "private-browser", { note: "Only the browser can clear its own web push token." });
      } else if (pattern === "/leaderboard/academic") {
        alias(page, role, [studentCommunityAlias(pattern, href + "?tab=previous&courseId=route-probe") ?? ""]);
      } else add(page, "native-screen", { dispatch: matched?.area });
      continue;
    }
    if (owner === "academic") {
      const matched = matchAcademicRoute(href);
      if (!matched || matched.pattern !== pattern) issue(pattern, "Academic dispatcher does not match this route");
      if (matched?.feature === "courses" && pattern.split("/").length >= 5
        && !isAdminCourseLiveSection(pattern.split("/")[4], matched.params.quizId ?? matched.params.materialId)) {
        issue(pattern, "Academic product branch has no live course reader");
      }
      if (matched?.feature === "administration") {
        const api = administrationReadPath(pattern as Parameters<typeof administrationReadPath>[0], matched.params, {});
        if (!api) issue(pattern, "Academic administration has no read endpoint");
      }
      if (pattern === "/tutor/[courseId]/tryouts") {
        alias(page, role, [productLocation("/tutor/[courseId]", { courseId: "route-probe" }) ?? ""], "Legacy Tutor tryout link opens the course.");
      } else if (pattern in adminAliases) {
        const parts = adminAliases[pattern as keyof typeof adminAliases];
        const targets: string[] = [];
        const resolver = {
          session: async () => ({ user: { id: "route-probe" } }),
          hasAdmin: async () => true,
          courseSlug: async () => "route-probe",
          bundleCourseSlug: async () => "route-probe",
          list: async () => ({ type: "page" as const, rows: [], nextPage: false }),
          bundle: async () => null,
          pdfStatus: async () => null,
        };
        for (const query of [new URLSearchParams(), new URLSearchParams({ courseId: "route-probe", tab: "product" })]) {
          const api = administrationReadPath(pattern as Parameters<typeof administrationReadPath>[0],
            matchAcademicRoute(href)?.params ?? {}, Object.fromEntries(query));
          if (api && pathname(api).slice(ADMINISTRATION_API_PREFIX.length) !== ["alias", ...parts].join("/")) {
            issue(pattern, "Academic alias client and server paths differ");
          }
          const response = await handleAdministrationRead(["alias", ...parts], query, resolver);
          const result = await response.json() as { type?: string; target?: string };
          if (!response.ok || result.type !== "redirect" || typeof result.target !== "string") {
            issue(pattern, "Academic alias produced no usable redirect");
          } else targets.push(result.target);
        }
        alias(page, role, [...new Set(targets)]);
      } else add(page, "native-screen", { dispatch: matched?.feature });
      continue;
    }

    const area = resolveOperationsArea(href);
    const evaluation = area === "evaluation" ? matchEvaluationRoute(href) : undefined;
    if (!area || area === "public" || (area === "management" && matchManagementPath(href)?.route !== pattern)
      || (area === "evaluation" && evaluation?.route.path !== pattern)) issue(pattern, "Operations dispatcher does not match this route");
    if (evaluation?.route.kind === "alias") {
      const targets = [];
      const resolver = { course: async () => "route-probe", quiz: async () => "route-probe" };
      for (const query of [new URLSearchParams(), new URLSearchParams({ courseId: "route-probe", tags: "exam" })]) {
        const result = await resolveEvaluationAlias(evaluation.route.id, evaluation.id, query, resolver);
        if (result.kind === "redirect") targets.push(result.href);
        else issue(pattern, "Evaluation alias produced no usable redirect");
      }
      alias(page, role, [...new Set(targets)], pattern.startsWith("/admin/assessments") || pattern === "/admin/diktats"
        ? "Retired standalone UI; supported records continue in the current workspace." : undefined);
    } else add(page, "native-screen", { dispatch: area ?? undefined });
  }

  const totals = Object.fromEntries(
    (["native-screen", "native-alias", "public-browser", "private-browser", "protocol-endpoint", "web-tool", "missing"] as const)
      .map(kind => [kind, rows.filter(row => row.kind === kind).length])
  );
  return { inventory: pages.length, totals, issues, routes: rows };
}

if (import.meta.main) {
  const report = await auditProductRoutes(resolve(import.meta.dir, "../../.."));
  console.log(JSON.stringify(report, null, 2));
  if (report.issues.length) process.exitCode = 1;
}
