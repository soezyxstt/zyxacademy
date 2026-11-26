import { handleAdminCourseFlashcardCommand } from "@/lib/native/academic/course-flashcard-command";
import { saveAdminCourseFlashcard } from "@/lib/native/academic/course-flashcard-service";
import { handleAdminCourseVideoCommand } from "@/lib/native/academic/course-video-command";
import { deleteAdminCourseVideoEntry } from "@/lib/native/academic/course-video-service";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { getAuthSession } from "@/lib/auth-session";
import { handleAdminCourseChapterCommand } from "@/lib/native/academic/course-chapter-command";
import { handleAdminCourseManagementCommand } from "@/lib/native/academic/course-management-command";
import { archiveCourseFromNative, createCourseFromNative } from "@/lib/native/academic/course-management-service";
import { archiveCourseChapterFromNative, reorderCourseChaptersFromNative, saveCourseChapterFromNative } from "@/lib/native/academic/course-chapter-service";
import { handleAdminCourseSettingsCommand } from "@/lib/native/academic/course-settings-command";
import { handleAdminCourseMaterialCommand, handleAdminCoursePdfDelete } from "@/lib/native/academic/course-material-command";
import { updateCoursePdfTitleFromNative, deleteCoursePdfFromNative } from "@/lib/native/academic/course-material-service";
import { updateCourseSettingsFromNative } from "@/lib/native/academic/course-settings-service";
import { handleAcademicRead } from "@/lib/native/academic/handle-read";
import { academicReadServices } from "@/lib/native/academic/read-services";

type Context = { params: Promise<{ resource: string[] }> };
export async function GET(_request: Request, { params }: Context) {
  return handleAcademicRead((await params).resource, academicReadServices);
}

const auth = { session: getAuthSession, hasAdmin: academicReadServices.hasAdmin };
const chapter = { ...auth, save: saveCourseChapterFromNative, archive: archiveCourseChapterFromNative, reorder: reorderCourseChaptersFromNative };

export async function POST(request: Request, { params }: Context) {
  const { resource } = await params;
  const origin = new URL(resolveAuthBaseUrl()).origin;
  if (resource[3] === "flashcards") {
    return handleAdminCourseFlashcardCommand(request, resource, origin, { ...auth, save: saveAdminCourseFlashcard });
  }
  if (resource.length === 2 || resource[3] === "archive") {
    return handleAdminCourseManagementCommand(request, resource, origin, { ...auth, create: createCourseFromNative, archive: archiveCourseFromNative });
  }
  return handleAdminCourseChapterCommand(request, resource, origin, chapter);
}

export async function DELETE(request: Request, { params }: Context) {
  const { resource } = await params;
  const origin = new URL(resolveAuthBaseUrl()).origin;
  if (resource[3] === "documents") {
    return handleAdminCoursePdfDelete(request, resource, origin, { ...auth, remove: deleteCoursePdfFromNative });
  }
  if (resource[3] === "flashcards") {
    return handleAdminCourseFlashcardCommand(request, resource, origin, { ...auth, save: saveAdminCourseFlashcard });
  }
  if (resource[3] === "videos") {
    return handleAdminCourseVideoCommand(request, resource, origin, { ...auth, remove: deleteAdminCourseVideoEntry });
  }
  return handleAdminCourseChapterCommand(request, resource, origin, chapter);
}

export async function PATCH(request: Request, { params }: Context) {
  const { resource } = await params;
  const origin = new URL(resolveAuthBaseUrl()).origin;
  if (resource[3] === "flashcards") {
    return handleAdminCourseFlashcardCommand(request, resource, origin, { ...auth, save: saveAdminCourseFlashcard });
  }
  if (resource[3] === "chapters") {
    return handleAdminCourseChapterCommand(request, resource, origin, chapter);
  }
  if (resource[3] === "documents") {
    return handleAdminCourseMaterialCommand(request, resource, origin, { ...auth, update: updateCoursePdfTitleFromNative });
  }
  return handleAdminCourseSettingsCommand(request, resource, origin, { ...auth, update: updateCourseSettingsFromNative });
}
