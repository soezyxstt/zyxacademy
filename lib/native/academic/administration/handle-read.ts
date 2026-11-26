import { isEnrollmentTokenEditor, type EnrollmentTokenEditor } from "../../../../packages/academic/enrollment-token-admin";
import { isStudyGroupEditorRead, type StudyGroupEditorRead } from "../../../../packages/academic/study-group-edit";
import { isStudyGroupMembersRead, type StudyGroupMemberRecovery, type StudyGroupMembersRead } from "../../../../packages/academic/study-group-members";
import { parseStudyGroupTokens, type StudyGroupTokensRead } from "../../../../packages/academic/study-group-tokens";
import type { NativeAdminViewer } from "./admin-transaction";
import {
  isLiveAdministrationRead, type DiktatEvidenceStatus, type DiktatPdfTarget, type LiveAdministrationRead, type LiveListSection, type LivePage,
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
  session(): Promise<{ user: { id: string }; session?: { id: string } } | null>;
  hasAdmin(id: string): Promise<boolean>;
  list(section: LiveListSection, query: AdministrationQuery): Promise<LivePage>;
  registrationsForExport?(search: string): Promise<unknown>;
  groupEditor?(id?: string): Promise<StudyGroupEditorRead | null>;
  groupMembers?(id: string, page: number, search: string, recovery?: { request: StudyGroupMemberRecovery; viewer: NativeAdminViewer }): Promise<StudyGroupMembersRead | null>;
  groupTokens?(groupId: string): Promise<StudyGroupTokensRead | null>;
  tokenEditor?(id?: string): Promise<EnrollmentTokenEditor | null>;
  bundle(kind: ReviewKind, slug: string, bundleId: string, page: number): Promise<LivePage | null>;
  pdfStatus(slug: string, target: DiktatPdfTarget, attemptId: string): Promise<DiktatEvidenceStatus | null>;
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
    if (section === "registrations" && kind === "export" && parts.length === 2 && services.registrationsForExport) {
      const { pkaExportRead } = await import("../../../../packages/academic/pka-registrations");
      const result = pkaExportRead.safeParse(await services.registrationsForExport(query.search));
      return result.success && result.data.search === query.search ? Response.json(result.data, { headers }) : problem(500, "READ_FAILED");
    }
    if (section === "group-editor" && parts.length <= 2 && services.groupEditor) {
      const result = await services.groupEditor(kind);
      if (!result) return notFound();
      return isStudyGroupEditorRead(result) ? Response.json(result, { headers }) : problem(500, "READ_FAILED");
    }
    if (section === "groups" && id === "tokens" && parts.length === 3 && services.groupTokens) {
      if (!session.session?.id) return problem(401, "UNAUTHENTICATED");
      const result = await services.groupTokens(kind);
      if (!result) return notFound();
      const parsed = parseStudyGroupTokens(result);
      return parsed?.groupId === kind ? Response.json(parsed, { headers }) : problem(500, "READ_FAILED");
    }
    if (section === "groups" && id === "members" && parts.length === 3 && services.groupMembers) {
      const [userId, action, expectedRevision, requestId] = ["retryUserId", "retryAction", "retryRevision", "retryRequestId"].map((field) => search.get(field));
      let recovery: { request: StudyGroupMemberRecovery; viewer: NativeAdminViewer } | undefined;
      if ([userId, action, expectedRevision, requestId].some((value) => value !== null)) {
        if (!session.session?.id) return problem(401, "UNAUTHENTICATED");
        if (!userId || !validPart(userId) || (action !== "add" && action !== "remove")
          || !expectedRevision || !/^[a-f0-9]{64}$/.test(expectedRevision) || !requestId
          || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)) return problem(400, "INVALID_RECOVERY");
        recovery = { request: { userId, action, expectedRevision, requestId }, viewer: { user: session.user, session: session.session } };
      }
      const result = await services.groupMembers(kind, query.page, query.search, recovery);
      if (!result) return notFound();
      return isStudyGroupMembersRead(result) ? Response.json(result, { headers }) : problem(500, "READ_FAILED");
    }
    if (section === "token-editor" && parts.length <= 2 && services.tokenEditor) {
      const result = await services.tokenEditor(kind);
      if (!result) return notFound();
      return isEnrollmentTokenEditor(result) ? Response.json(result, { headers }) : problem(500, "READ_FAILED");
    }
    if (section === "pdf-status" && parts.length === 3) {
      const productId = search.get("productId") ?? "";
      const expectedRevision = search.get("expectedRevision") ?? "";
      const attemptId = search.get("attemptId") ?? "";
      if (!validPart(productId) || !validPart(attemptId) || !/^[a-f0-9]{64}$/.test(expectedRevision)) return problem(400, "INVALID_PDF_SCOPE");
      const result = await services.pdfStatus(kind, { importId: id, productId, expectedRevision }, attemptId);
      return result ? Response.json({ status: result }, { headers }) : notFound();
    }
    if (section === "bundle" && parts.length === 4 && isReviewKind(kind)) {
      const result = await services.bundle(kind, id, bundleId, query.page);
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
