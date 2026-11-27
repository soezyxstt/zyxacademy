import { getAuthSession } from "@/lib/auth-session";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { handleAdminCommand } from "@/lib/native/academic/administration/admin-command-handler";
import { administrationReadServices } from "@/lib/native/academic/administration/read-services";
import { tutorialOperation, tutorialRejectionStatus } from "@/lib/native/academic/administration/tutorial-operations-handler";
import { saveNativeTutorialOperation } from "@/lib/native/academic/administration/tutorial-operations-service";

export function POST(request: Request) {
  return handleAdminCommand(request, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession, hasAdmin: administrationReadServices.hasAdmin,
  }, tutorialOperation, saveNativeTutorialOperation, tutorialRejectionStatus);
}
