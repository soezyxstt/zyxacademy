import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { getAuthSession } from "@/lib/auth-session";
import { handleAdminCourseChapterCommand } from "@/lib/native/academic/course-chapter-command";
import { saveCourseChapterFromNative } from "@/lib/native/academic/course-chapter-service";
import { handleAdminCourseSettingsCommand } from "@/lib/native/academic/course-settings-command";
import { handleAdminCourseMaterialCommand } from "@/lib/native/academic/course-material-command";
import { updateCoursePdfTitleFromNative } from "@/lib/native/academic/course-material-service";
import { updateCourseSettingsFromNative } from "@/lib/native/academic/course-settings-service";
import { handleAcademicRead } from "@/lib/native/academic/handle-read";
import { academicReadServices } from "@/lib/native/academic/read-services";

type Context = { params: Promise<{ resource: string[] }> };
export async function GET(_request: Request, { params }: Context) {
  return handleAcademicRead((await params).resource, academicReadServices);
}

const auth = { session: getAuthSession, hasAdmin: academicReadServices.hasAdmin };

export async function POST(request: Request, { params }: Context) {
  return handleAdminCourseChapterCommand(request, (await params).resource, new URL(resolveAuthBaseUrl()).origin,
    { ...auth, save: saveCourseChapterFromNative });
}

export async function PATCH(request: Request, { params }: Context) {
  const { resource } = await params;
  const origin = new URL(resolveAuthBaseUrl()).origin;
  if (resource[3] === "chapters") {
    return handleAdminCourseChapterCommand(request, resource, origin, { ...auth, save: saveCourseChapterFromNative });
  }
  if (resource[3] === "documents") {
    return handleAdminCourseMaterialCommand(request, resource, origin, { ...auth, update: updateCoursePdfTitleFromNative });
  }
  return handleAdminCourseSettingsCommand(request, resource, origin, { ...auth, update: updateCourseSettingsFromNative });
}
