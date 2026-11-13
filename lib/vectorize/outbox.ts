import {
  createProviderNeutralVectorOutboxDelete,
  createProviderNeutralVectorOutboxUpsert,
  type CanonicalEntityType,
  type CanonicalNamespace,
  type CanonicalStatus,
  type ProviderNeutralVectorOutbox,
} from "@/lib/vectorize/contracts";
import { createHash } from "node:crypto";
import { canonicalVectorContent } from "./content";

export interface CanonicalOutboxRow {
  id: string;
  koId?: string | null;
  action: "upsert" | "delete";
  namespace: string;
  courseId: string;
  payload: unknown;
}

type Payload = Record<string, unknown>;

const namespaceMap: Record<string, CanonicalNamespace> = {
  learning: "canonical_ideas",
  practice: "published_questions",
  past_exams: "itb_question_references",
  canonical_ideas: "canonical_ideas",
  published_articles: "published_articles",
  source_materials: "source_materials",
  itb_question_references: "itb_question_references",
  published_questions: "published_questions",
  published_solutions: "published_solutions",
  admin_ops_knowledge: "admin_ops_knowledge",
};

const entityNamespaceMap: Partial<Record<string, CanonicalNamespace>> = {
  idea: "canonical_ideas",
  source_chunk: "source_materials",
  source_material: "source_materials",
  article: "published_articles",
  question_reference: "itb_question_references",
  question: "published_questions",
  solution: "published_solutions",
  admin_document: "admin_ops_knowledge",
};

const productNamespaceMap: Partial<Record<string, CanonicalNamespace>> = {
  article: "published_articles",
  question: "published_questions",
  solution: "published_solutions",
};

const entityTypeMap: Record<CanonicalNamespace, CanonicalEntityType> = {
  canonical_ideas: "idea",
  published_articles: "article",
  source_materials: "source_material",
  itb_question_references: "question_reference",
  published_questions: "question",
  published_solutions: "solution",
  admin_ops_knowledge: "admin_document",
};

function objectValue(value: unknown): Payload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Payload : {};
}

function statusValue(value: unknown): CanonicalStatus {
  if (value === "draft" || value === "published" || value === "active" || value === "superseded" || value === "retired" || value === "needs_review") return value;
  return "active";
}

export function canonicalNamespaceForProductType(productType: string): CanonicalNamespace | null {
  return productNamespaceMap[productType] ?? null;
}

function payloadEntityType(payload: Payload, metadata: Payload): string {
  return String(metadata.entityType ?? payload.entityType ?? "").trim();
}

function resolveNamespace(rowNamespace: string, payload: Payload, metadata: Payload): CanonicalNamespace {
  if (rowNamespace === "idea" || rowNamespace === "product") {
    const entityType = payloadEntityType(payload, metadata);
    const namespace = entityNamespaceMap[entityType];
    if (namespace) return namespace;
    if (rowNamespace === "idea" && !entityType) return "canonical_ideas";
    throw new Error(`unsupported canonical outbox entity type ${entityType || "unknown"} for namespace ${rowNamespace}`);
  }

  const namespace = namespaceMap[rowNamespace];
  if (!namespace) throw new Error(`unknown canonical outbox namespace ${rowNamespace}`);
  return namespace;
}

export function canonicalOutboxPayload(row: CanonicalOutboxRow): ProviderNeutralVectorOutbox {
  const payload = objectValue(row.payload);
  const rawMetadata = objectValue(payload.metadata);
  const namespace = resolveNamespace(row.namespace, payload, rawMetadata);
  const entityType = entityTypeMap[namespace];
  const entityId = String(rawMetadata.entityId ?? payload.entityId ?? payload.id ?? row.koId ?? row.id);
  const versionValue = Number(rawMetadata.version ?? payload.version ?? 1);
  const version = Number.isInteger(versionValue) && versionValue > 0 ? versionValue : 1;

  if (row.action === "delete") {
    return createProviderNeutralVectorOutboxDelete({ entityType, entityId, version });
  }

  const referenceVisibility = rawMetadata.authoringVisibility ?? rawMetadata.visibility ?? payload.authoringVisibility ?? payload.visibility;
  if (namespace === "itb_question_references" && referenceVisibility === "holdout") {
    throw new Error(`CANONICAL_HOLDOUT_REFERENCE_BLOCKED:${row.id}`);
  }

  const content = canonicalVectorContent(payload.text ?? payload.content ?? payload.canonicalStatement ?? payload.contentMarkdown ?? rawMetadata.content);
  if (!content) throw new Error(`canonical outbox ${row.id} has no content`);
  // Queue ownership and dispatch retain the legacy FK. Canonical publishers
  // provide the separately resolved retrieval scope, never bundle-supplied metadata.
  if (payload.canonicalCourseId !== undefined && (typeof payload.canonicalCourseId !== "string" || !payload.canonicalCourseId.trim())) throw new Error(`CANONICAL_COURSE_SCOPE_INVALID:${row.id}`);
  return createProviderNeutralVectorOutboxUpsert({
    entityType,
    entityId,
    version,
    content,
    metadata: {
      namespace,
      status: statusValue(rawMetadata.status ?? payload.status),
      accessClass: namespace === "admin_ops_knowledge" ? "admin" : namespace === "published_solutions" ? "restricted_solution" : namespace === "itb_question_references" ? "public" : "enrolled",
      language: String(rawMetadata.language ?? "id"),
      courseId: typeof payload.canonicalCourseId === "string" ? payload.canonicalCourseId : row.courseId,
      ...(typeof rawMetadata.chapterId === "string" && rawMetadata.chapterId ? { chapterId: rawMetadata.chapterId } : {}),
      contentHash: createHash("sha256").update(content, "utf8").digest("hex"),
    },
  });
}

export function canonicalOutboxTitle(row: CanonicalOutboxRow): string {
  const payload = objectValue(row.payload);
  const metadata = objectValue(payload.metadata);
  return String(payload.title ?? metadata.title ?? row.koId ?? row.id);
}
