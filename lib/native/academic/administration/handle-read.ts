import {
  isLiveAdministrationRead, type LiveAdministrationRead, type LiveListSection, type LivePage,
} from "../../../../packages/native-parity/academic/administration/live";
import type { ReviewKind } from "../../../../packages/native-parity/academic/administration/fixtures";

const sections: readonly LiveListSection[] = ["users", "groups", "tokens", "notifications", "schedules", "registrations", "announcements", "sessions"];
const fixedAliases = {
  authoring: "/admin/courses",
  manual: "/admin/courses",
  materials: "/admin/materials/review?section=catalog",
  "bundle-idea": "/admin/materials/review?section=idea",
  "bundle-product": "/admin/materials/review?section=product",
  pka: "/admin/tutorial-pka/registrations",
} as const;

export type AdministrationQuery = {
  page: number; week: number; search: string; role: string; status: string; packageType: string;
  courseId: string; tab: string; section: string;
};

export type AdministrationReadServices = {
  session(): Promise<{ user: { id: string } } | null>;
  hasAdmin(id: string): Promise<boolean>;
  list(section: LiveListSection, query: AdministrationQuery): Promise<LivePage>;
  bundle(kind: ReviewKind, slug: string, bundleId: string): Promise<LivePage | null>;
  courseSlug(id: string): Promise<string | null>;
  bundleCourseSlug(kind: ReviewKind, id: string): Promise<string | null>;
};

const validPart = (value: string) => Boolean(value.trim()) && value.length <= 256 && !/[/\\\u0000-\u001f]/.test(value);
const safeInt = (raw: string, min: number, max: number, fallback: number) => {
  const value = Number(raw);
  return raw !== "" && Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
};
const isReviewKind = (kind: string): kind is ReviewKind => kind === "idea" || kind === "product";

function options(search: URLSearchParams): AdministrationQuery {
  const field = (name: string, limit = 128) => (search.get(name) ?? "").trim().slice(0, limit);
  return {
    page: safeInt(field("page"), 1, 100000, 1), week: safeInt(field("week"), -520, 520, 0), search: field("search", 200),
    role: field("role"), status: field("status"), packageType: field("packageType"),
    courseId: field("courseId", 256), tab: field("tab"), section: field("section"),
  };
}

const headers = { "Cache-Control": "private, no-store" };
const problem = (status: number, error: string) => Response.json({ error }, { status, headers });
const notFound = () => problem(404, "NOT_FOUND");
function output(value: LiveAdministrationRead) {
  return isLiveAdministrationRead(value) ? Response.json(value, { headers }) : problem(500, "READ_FAILED");
}

export async function handleAdministrationRead(parts: string[], search: URLSearchParams, services: AdministrationReadServices) {
  if (parts.some((part) => !validPart(part))) return problem(400, "INVALID_PATH");
  try {
    const session = await services.session();
    if (!session?.user.id) return problem(401, "UNAUTHENTICATED");
    if (!(await services.hasAdmin(session.user.id))) return problem(403, "FORBIDDEN");
    const [section, kind, id, bundleId] = parts;
    const query = options(search);
    if (parts.length === 1 && sections.includes(section as LiveListSection)) {
      return output(await services.list(section as LiveListSection, query));
    }
    if (section === "bundle" && parts.length === 4 && isReviewKind(kind)) {
      const result = await services.bundle(kind, id, bundleId);
      return result ? output(result) : notFound();
    }
    if (section === "alias" && parts.length >= 2) {
      if (parts.length === 2 && Object.hasOwn(fixedAliases, kind)) return output({ type: "redirect", target: fixedAliases[kind as keyof typeof fixedAliases] });
      if (parts.length === 2 && kind === "review") {
        const slug = query.courseId && await services.courseSlug(query.courseId);
        const tab = query.tab || (query.section ? query.section === "product" ? "product" : "idea" : "");
        return output({ type: "redirect", target: slug ? `/admin/courses/${encodeURIComponent(slug)}/review${tab ? `?tab=${encodeURIComponent(tab)}` : ""}` : "/admin/courses" });
      }
      if (isReviewKind(kind) && parts.length === 3) {
        const slug = await services.bundleCourseSlug(kind, id);
        return slug ? output({ type: "redirect", target: `/admin/courses/${encodeURIComponent(slug)}/review/${kind}/${encodeURIComponent(id)}` }) : notFound();
      }
    }
    return notFound();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") return problem(401, "UNAUTHENTICATED");
      if (error.message.startsWith("Unauthorized - admin only") || error.message.startsWith("Unauthorized ; admin only") || error.message.startsWith("Forbidden")) {
        return problem(403, "FORBIDDEN");
      }
    }
    return problem(500, "READ_FAILED");
  }
}
