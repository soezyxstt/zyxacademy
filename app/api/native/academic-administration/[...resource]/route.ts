import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { getAuthSession } from "@/lib/auth-session";
import { handlePkaAnnouncementEdit } from "@/lib/native/academic/administration/announcement-edit-handler";
import { updateNativePkaAnnouncement } from "@/lib/native/academic/administration/announcement-edit-service";
import { handleStudyGroupWrite } from "@/lib/native/academic/administration/study-group-handler";
import { saveNativeStudyGroup } from "@/lib/native/academic/administration/study-group-service";
import { handleAdministrationRead } from "@/lib/native/academic/administration/handle-read";
import { administrationReadServices } from "@/lib/native/academic/administration/read-services";

export async function GET(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  return handleAdministrationRead((await context.params).resource, new URL(request.url).searchParams, administrationReadServices);
}

export async function PATCH(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  const { resource } = await context.params;
  if (resource[0] === "groups") return studyGroupWrite(request, resource);
  return handlePkaAnnouncementEdit(request, resource, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession,
    hasAdmin: administrationReadServices.hasAdmin,
    update: updateNativePkaAnnouncement,
  });
}


function studyGroupWrite(request: Request, resource: string[]) {
  return handleStudyGroupWrite(request, resource, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession,
    hasAdmin: administrationReadServices.hasAdmin,
    write: saveNativeStudyGroup,
  });
}

export async function POST(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  return studyGroupWrite(request, (await context.params).resource);
}
