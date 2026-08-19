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

export const EXTERNAL_AUTHORING_WORKFLOW = {
  workflowVersion: "external-authoring.v1",
  sequence: [
    "Use the Idea Bundle contract when creating or revising canonical Ideas from operator-supplied source files.",
    "Upload and publish the Idea Bundle before creating products that reference those Ideas.",
    "Export a fresh Authoring Context Pack after Idea publication.",
    "Use only current IDs, versions, hashes, excerpts, requirements, and allowed benchmark summaries from that pack.",
    "Keep benchmark IDs separate from dedicated ITB reference IDs and exact source labels.",
    "Create one Product Bundle containing only final, publication-ready products.",
    "Upload, inspect the complete preview, approve, and publish in Zyx.",
  ],
  attribution: {
    uploader: "$UPLOADER",
    approvingReviewer: "$APPROVING_REVIEWER",
    guidance: "Use the sentinels for creatorId and curatorId when the external agent must not receive private Zyx identity IDs.",
  },
  deterministicHashes: {
    algorithm: "SHA-256 over UTF-8 bytes, lowercase hexadecimal",
    entitySerialization: "Recursively sort object keys. Preserve array order. Serialize as compact JSON.",
    bundleChecksum: "Hash the deterministic object containing the manifest without bundleChecksum and sorted pairs of non-manifest file path plus file SHA-256.",
  },
  qualityGate: [
    "Every entity is final and uses the publishable lifecycle status required by its bundle contract.",
    "Every factual claim is traceable to an included source excerpt.",
    "Every Product Idea link uses the exact current version and semantic hash.",
    "Every Product Bundle question is copied from an ITB example in the Source Pack and never authored as a Zyx-original question.",
    "Questions include a solution, valid options when applicable, Idea relations, a dedicated allowed ITB reference ID, an exact source event label, and allowed benchmark curation.",
    "Flashcards test one Idea and one prompt only.",
    "Diktat content locks its approved Article lineage when Article lineage fields are present.",
    "No unresolved conflict, placeholder, holdout content, or invented ID remains.",
  ],
} as const;
