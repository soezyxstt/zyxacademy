export const AUTHORING_CONTEXT_POLICY_VERSION = "authoring-context.v1";
export const AUTHORING_CONTEXT_SCHEMA_VERSION = "authoring-context.v1";

export type AuthoringActorRole = "admin" | "tutor" | "murid" | "unknown";

export type AuthoringAccessRequest = {
  role: AuthoringActorRole;
  courseId: string;
  assignedCourseIds?: readonly string[];
  allowAssignedTutor?: boolean;
};

export type AuthoringAccessDecision = {
  allowed: boolean;
  reasonCode: "ADMIN_ALLOWED" | "TUTOR_ASSIGNMENT_REQUIRED" | "AUTHORING_CONTEXT_FORBIDDEN";
};

export function decideAuthoringAccess(input: AuthoringAccessRequest): AuthoringAccessDecision {
  if (input.role === "admin") return { allowed: true, reasonCode: "ADMIN_ALLOWED" };
  if (input.role === "tutor" && input.allowAssignedTutor === true && input.assignedCourseIds?.includes(input.courseId)) {
    return { allowed: true, reasonCode: "ADMIN_ALLOWED" };
  }
  if (input.role === "tutor") return { allowed: false, reasonCode: "TUTOR_ASSIGNMENT_REQUIRED" };
  return { allowed: false, reasonCode: "AUTHORING_CONTEXT_FORBIDDEN" };
}

export const AUTHORING_CONTEXT_CONTRACT = {
  schemaVersion: AUTHORING_CONTEXT_SCHEMA_VERSION,
  policyVersion: AUTHORING_CONTEXT_POLICY_VERSION,
  included: [
    "published current Ideas",
    "active source excerpts and citations",
    "active Idea relations",
    "active learning objectives",
    "safe content requirements",
    "allowed benchmark summaries",
  ],
  excluded: [
    "holdout benchmark content",
    "murid data",
    "attempts, answers, mastery, and chats",
    "credentials and provider secrets",
    "embeddings and signed URLs",
    "draft, stale, superseded, or unreviewed Ideas",
  ],
} as const;
