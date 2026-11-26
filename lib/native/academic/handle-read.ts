import { isAdminCourseLiveSection } from "../../../packages/native-parity/academic/courses/sections";

export interface AcademicReadServices {
  session(): Promise<{ user: { id: string } } | null>;
  hasTutor(userId: string): Promise<boolean>;
  hasAdmin(userId: string): Promise<boolean>;
  dashboard(userId: string): Promise<unknown>;
  participants(userId: string, courseId: string): Promise<unknown>;
  analytics(userId: string, courseId: string): Promise<unknown>;
  grading(userId: string, courseId: string): Promise<unknown>;
  // Both admin readers call assertAdmin before reading any records.
  courses(): Promise<unknown>;
  course(slug: string): Promise<unknown>;
  courseSection?(slug: string, section: string, itemId?: string): Promise<unknown>;
}

function json(status: number, data: unknown) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function handleAcademicRead(parts: string[], services: AcademicReadServices) {
  const [role, section, id, item, itemId] = parts;
  if (parts.some(part => !part.trim() || part.length > 256 || /[/\\]/.test(part))) {
    return json(400, { error: "INVALID_PATH" });
  }
  try {
    const session = await services.session();
    if (!session?.user.id) return json(401, { error: "UNAUTHENTICATED" });
    if (role === "tutor") {
      const dashboard = section === "dashboard" && parts.length === 2;
      const course = section === "courses" && parts.length === 4 && (item === "participants" || item === "grading" || item === "analytics");
      if (!dashboard && !course) return json(404, { error: "NOT_FOUND" });
      const userId = session.user.id;
      if (!(await services.hasTutor(userId))) return json(403, { error: "FORBIDDEN" });
      if (dashboard) return json(200, await services.dashboard(userId));
      if (item === "analytics") {
        const data = await services.analytics(userId, id);
        return data ? json(200, data) : json(404, { error: "NOT_FOUND" });
      }
      return json(200, await services[item === "grading" ? "grading" : "participants"](userId, id));
    }
    if (role === "admin" && section === "courses") {
      if (!(await services.hasAdmin(session.user.id))) return json(403, { error: "FORBIDDEN" });
      if (parts.length === 2) return json(200, await services.courses());
      if (parts.length === 3) {
        const data = await services.course(id);
        if (data) return json(200, data);
      }
      if ((parts.length === 4 || parts.length === 5) && isAdminCourseLiveSection(item, itemId) && services.courseSection) {
        const data = await services.courseSection(id, item, itemId);
        if (data) return json(200, data);
      }
    }
    return json(404, { error: "NOT_FOUND" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized") return json(401, { error: "UNAUTHENTICATED" });
    if (message.startsWith("TUTOR_ACCESS_DENIED") || message === "Forbidden, admin role required." ||
        message === "TUTOR_INACTIVE" || message === "USER_NOT_FOUND") {
      return json(403, { error: "FORBIDDEN" });
    }
    return json(500, { error: "READ_FAILED" });
  }
}
