import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { getAuthSession } from "@/lib/auth-session";
import { handlePkaAnnouncementEdit } from "@/lib/native/academic/administration/announcement-edit-handler";
import { updateNativePkaAnnouncement } from "@/lib/native/academic/administration/announcement-edit-service";
import { handleNativePkaSchedule } from "@/lib/native/academic/administration/pka-schedule-handler";
import { updateNativePkaSchedule } from "@/lib/native/academic/administration/pka-schedule-service";
import { handleNativePkaLifecycle } from "@/lib/native/academic/administration/pka-lifecycle-handler";
import { writeNativePkaLifecycle } from "@/lib/native/academic/administration/pka-lifecycle-service";
import { handleEnrollmentTokenWrite } from "@/lib/native/academic/administration/enrollment-token-handler";
import { writeNativeEnrollmentToken } from "@/lib/native/academic/administration/enrollment-token-service";
import { handleStudyGroupWrite } from "@/lib/native/academic/administration/study-group-handler";
import { saveNativeStudyGroup } from "@/lib/native/academic/administration/study-group-service";
import { handleStudyGroupMemberWrite } from "@/lib/native/academic/administration/study-group-members-handler";
import { writeNativeStudyGroupMember } from "@/lib/native/academic/administration/study-group-members-service";
import { handleNativeUserStatus } from "@/lib/native/academic/administration/user-status-handler";
import { saveNativeUserStatus } from "@/lib/native/academic/administration/user-status-service";
import { handleNativeIdeaReview, isNativeIdeaReviewPath } from "@/lib/native/academic/administration/idea-review-handler";
import { saveNativeUserRoles } from "@/lib/native/academic/administration/user-roles-service";
import { readNativeIdeaReview, writeNativeIdeaReview } from "@/lib/native/academic/administration/idea-review-service";
import { handleAdministrationRead } from "@/lib/native/academic/administration/handle-read";
import { administrationReadServices } from "@/lib/native/academic/administration/read-services";

import { handleNativeBroadcast } from "@/lib/native/academic/administration/broadcast-handler";
import { prepareNativeBroadcast, readNativeBroadcast, transitionNativeBroadcast } from "@/lib/native/academic/administration/broadcast-service";

const isBroadcast = (resource: string[]) => resource.length === 2 && resource[0] === "notifications" && resource[1] === "broadcast";

function broadcast(request: Request) {
  return handleNativeBroadcast(request, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession, read: readNativeBroadcast, prepare: prepareNativeBroadcast, transition: transitionNativeBroadcast,
  });
}

export async function GET(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  const { resource } = await context.params;
  if (isBroadcast(resource)) return broadcast(request);
  if (isNativeIdeaReviewPath(resource)) return ideaReview(request, resource);
  return handleAdministrationRead(resource, new URL(request.url).searchParams, administrationReadServices);
}

export async function PATCH(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  const { resource } = await context.params;
  if (isNativeIdeaReviewPath(resource)) return ideaReview(request, resource);
  if (resource[0] === "sessions") return handleNativePkaSchedule(request, resource, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession, hasAdmin: administrationReadServices.hasAdmin, save: updateNativePkaSchedule,
  });
  if (resource[0] === "tokens") return enrollmentTokenWrite(request, resource);
  if (resource[0] === "groups") {
    if (resource[2] === "members") return handleStudyGroupMemberWrite(request, resource, new URL(resolveAuthBaseUrl()).origin, {
      session: getAuthSession,
      hasAdmin: administrationReadServices.hasAdmin,
      write: writeNativeStudyGroupMember,
    });
    return studyGroupWrite(request, resource);
  }
  if (resource[0] === "users") return handleNativeUserStatus(request, resource, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession,
    hasAdmin: administrationReadServices.hasAdmin,
    save: saveNativeUserStatus, saveRoles: saveNativeUserRoles,
  });
  return handlePkaAnnouncementEdit(request, resource, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession,
    hasAdmin: administrationReadServices.hasAdmin,
    update: updateNativePkaAnnouncement,
  });
}

function ideaReview(request: Request, resource: string[]) {
  return handleNativeIdeaReview(request, resource, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession, hasAdmin: administrationReadServices.hasAdmin, read: readNativeIdeaReview, write: writeNativeIdeaReview,
  });
}

function studyGroupWrite(request: Request, resource: string[]) {
  return handleStudyGroupWrite(request, resource, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession,
    hasAdmin: administrationReadServices.hasAdmin,
    write: saveNativeStudyGroup,
  });
}

function enrollmentTokenWrite(request: Request, resource: string[]) {
  return handleEnrollmentTokenWrite(request, resource, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession,
    hasAdmin: administrationReadServices.hasAdmin,
    write: writeNativeEnrollmentToken,
  });
}

export async function POST(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  const { resource } = await context.params;
  if (isBroadcast(resource)) return broadcast(request);
  if (resource.length === 1 && resource[0] === "pka-lifecycle") return handleNativePkaLifecycle(request, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession, hasAdmin: administrationReadServices.hasAdmin, write: writeNativePkaLifecycle,
  });
  return resource[0] === "tokens" ? enrollmentTokenWrite(request, resource) : studyGroupWrite(request, resource);
}
