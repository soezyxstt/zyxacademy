import type { AdministrationPattern } from "./routes";

export type LiveField = { label: string; value: string };
export type LiveRow = { id: string; title: string; subtitle?: string; detail?: string; fields?: LiveField[] };
export type LivePage = { type: "page"; rows: LiveRow[]; nextPage: boolean; summary?: LiveField[] };
export type LiveRedirect = { type: "redirect"; target: string };
export type LiveAdministrationRead = LivePage | LiveRedirect;
export type LiveListSection = "users" | "groups" | "tokens" | "notifications" | "schedules" | "registrations" | "announcements" | "sessions";
type Query = Readonly<Record<string, string>>;

export const ADMINISTRATION_API_PREFIX = "/api/native/academic-administration/";

export function administrationReadPath(pattern: AdministrationPattern, params: Query, query: Query) {
  const segments = (parts: string[], search: Query = {}) => {
    const filtered = Object.fromEntries(Object.entries(search).filter(([, value]) => value));
    const encoded = new URLSearchParams(filtered).toString();
    return ADMINISTRATION_API_PREFIX + parts.map(encodeURIComponent).join("/") + (encoded ? `?${encoded}` : "");
  };
  switch (pattern) {
    case "/admin/users": return segments(["users"], query);
    case "/admin/groups": return segments(["groups"], query);
    case "/admin/tokens": return segments(["tokens"], query);
    case "/admin/notifications": return segments(["notifications"], query);
    case "/admin/schedules": return segments(["schedules"], query);
    case "/admin/tutorial-pka/registrations": return segments(["registrations"], query);
    case "/admin/tutorial-pka/announcements": return segments(["announcements"], query);
    case "/admin/tutorial-pka/schedules": return segments(["sessions"], query);
    case "/admin/courses/[slug]/review/idea/[bundleId]": return segments(["bundle", "idea", params.slug, params.bundleId]);
    case "/admin/courses/[slug]/review/product/[bundleId]": return segments(["bundle", "product", params.slug, params.bundleId]);
    case "/admin/materials/review/idea/[slug]": return segments(["alias", "idea", params.slug]);
    case "/admin/materials/review/product/[slug]": return segments(["alias", "product", params.slug]);
    case "/admin/materials/review": return segments(["alias", "review"], query);
    case "/admin/materials": return segments(["alias", "materials"]);
    case "/admin/materials/manual": return segments(["alias", "manual"]);
    case "/admin/tutorial-pka": return segments(["alias", "pka"]);
    case "/admin/bundles/idea": return segments(["alias", "bundle-idea"]);
    case "/admin/bundles/product": return segments(["alias", "bundle-product"]);
    case "/admin/authoring-context": return segments(["alias", "authoring"]);
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function field(value: unknown): value is LiveField {
  return object(value) && typeof value.label === "string" && typeof value.value === "string";
}

function fields(value: unknown): boolean {
  return Array.isArray(value) && value.every(field);
}

function row(value: unknown): value is LiveRow {
  return object(value) && typeof value.id === "string" && typeof value.title === "string"
    && (value.subtitle === undefined || typeof value.subtitle === "string")
    && (value.detail === undefined || typeof value.detail === "string")
    && (value.fields === undefined || fields(value.fields));
}

export function isLiveAdministrationRead(value: unknown): value is LiveAdministrationRead {
  if (!object(value)) return false;
  if (value.type === "redirect") return typeof value.target === "string" && /^\/admin\/[^\\\s]*$/.test(value.target);
  return value.type === "page" && Array.isArray(value.rows) && value.rows.every(row) && typeof value.nextPage === "boolean"
    && (value.summary === undefined || fields(value.summary));
}
