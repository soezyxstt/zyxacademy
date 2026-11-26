import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { getAuthSession } from "@/lib/auth-session";
import { handleAdminCourseSettingsCommand } from "@/lib/native/academic/course-settings-command";
import { updateCourseSettingsFromNative } from "@/lib/native/academic/course-settings-service";
import { handleAcademicRead } from "@/lib/native/academic/handle-read";
import { academicReadServices } from "@/lib/native/academic/read-services";

export async function GET(_request: Request, context: { params: Promise<{ resource: string[] }> }) {
  return handleAcademicRead((await context.params).resource, academicReadServices);
}

export async function PATCH(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  return handleAdminCourseSettingsCommand(request, (await context.params).resource, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession,
    hasAdmin: academicReadServices.hasAdmin,
    update: updateCourseSettingsFromNative,
  });
}
