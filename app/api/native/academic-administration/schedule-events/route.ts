import { getAuthSession } from "@/lib/auth-session";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { handleAdminCommand } from "@/lib/native/academic/administration/admin-command-handler";
import { administrationReadServices } from "@/lib/native/academic/administration/read-services";
import { academicEventCommand } from "@/lib/native/academic/administration/schedule-events-handler";
import { saveNativeAcademicEvent } from "@/lib/native/academic/administration/schedule-events-service";

export function POST(request: Request) {
  return handleAdminCommand(request, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession, hasAdmin: administrationReadServices.hasAdmin,
  }, academicEventCommand, saveNativeAcademicEvent);
}
