import {
  createProviderNeutralVectorOutboxDelete,
  createProviderNeutralVectorOutboxUpsert,
  type CanonicalEntityType,
  type CanonicalNamespace,
  type CanonicalStatus,
  type ProviderNeutralVectorOutbox,
} from "@/lib/vectorize/contracts";
import { createHash } from "node:crypto";

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
};

const entityTypeMap: Record<CanonicalNamespace, CanonicalEntityType> = {
  canonical_ideas: "idea",
  published_articles: "article",
  source_materials: "source_material",
  itb_question_references: "question_reference",
  published_questions: "question",
  published_solutions: "solution",
};

function objectValue(value: unknown): Payload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Payload : {};
}

function statusValue(value: unknown): CanonicalStatus {
  if (value === "draft" || value === "published" || value === "active" || value === "superseded" || value === "retired" || value === "needs_review") return value;
  return "active";
}

export function canonicalOutboxPayload(row: CanonicalOutboxRow): ProviderNeutralVectorOutbox {
  const payload = objectValue(row.payload);
  const rawMetadata = objectValue(payload.metadata);
  const namespace = namespaceMap[row.namespace];
  if (!namespace) throw new Error(`unknown canonical outbox namespace ${row.namespace}`);
  const entityType = entityTypeMap[namespace];
  const entityId = String(rawMetadata.entityId ?? payload.entityId ?? payload.id ?? row.koId ?? row.id);
  const versionValue = Number(rawMetadata.version ?? payload.version ?? 1);
  const version = Number.isInteger(versionValue) && versionValue > 0 ? versionValue : 1;

  if (row.action === "delete") {
    return createProviderNeutralVectorOutboxDelete({ entityType, entityId, version });
  }

  const content = String(payload.text ?? payload.content ?? payload.canonicalStatement ?? rawMetadata.content ?? "").trim();
  if (!content) throw new Error(`canonical outbox ${row.id} has no content`);
  return createProviderNeutralVectorOutboxUpsert({
    entityType,
    entityId,
    version,
    content,
    metadata: {
      namespace,
      status: statusValue(rawMetadata.status ?? payload.status),
      accessClass: namespace === "published_solutions" ? "restricted_solution" : "enrolled",
      language: String(rawMetadata.language ?? "id"),
      courseId: row.courseId,
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
