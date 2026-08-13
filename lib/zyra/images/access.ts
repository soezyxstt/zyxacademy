import type { ZyraAttachmentOwnerContext } from "./contracts";

export function canAccessZyraAttachment(input: ZyraAttachmentOwnerContext): boolean {
  if (!input.actorId) return false;
  if (input.courseId !== input.authorizedCourseId) return false;
  if (input.actorId === input.ownerId) return true;
  return input.role === "admin";
}

export function sameZyraAttachmentScope(input: {
  requestedCourseId: string;
  storedCourseId: string;
  requestedSessionId: string;
  storedSessionId: string;
}): boolean {
  return input.requestedCourseId === input.storedCourseId && input.requestedSessionId === input.storedSessionId;
}
