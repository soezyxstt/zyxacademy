export interface AuditEnvelopeMeta {
  auditSchemaVersion?: string;
  actorRoles?: string[];
  courseId?: string;
  entityVersion?: number;
  requestId?: string;
  reason?: string;
  outcome?: string;
  snapshotHash?: string | null;
}

export interface UnwrappedSnapshot {
  data: Record<string, unknown> | null;
  envelopeMeta: AuditEnvelopeMeta | null;
}

export type SnapshotSummaryMode = "update" | "create" | "delete" | "empty";

export interface SnapshotDiffEntry {
  key: string;
  before?: unknown;
  after?: unknown;
}

export interface SnapshotSummary {
  mode: SnapshotSummaryMode;
  entries: SnapshotDiffEntry[];
  truncated?: boolean;
}

export type AuditReasonDisplay =
  | { kind: "none" }
  | { kind: "redundant" }
  | { kind: "code"; text: string; raw: string }
  | { kind: "note"; text: string; raw: string };

export interface FormatValueOptions {
  locale?: string;
  yesLabel?: string;
  noLabel?: string;
  itemsCountLabel?: (count: number) => string;
  fieldsCountLabel?: (count: number) => string;
  moreItemsLabel?: (count: number) => string;
  timeZone?: string;
}

const NOISY_INTERNAL_FIELDS = new Set([
  "id",
  "uuid",
  "createdat",
  "updatedat",
  "deletedat",
  "courseid",
  "matakuliahid",
  "actorid",
  "userid",
  "tutorid",
  "studentid",
  "ownerid",
  "authorid",
  "reviewerid",
  "version",
  "entityversion",
  "snapshothash",
  "checksum",
  "generationhash",
  "auditschemaversion",
  "requestid",
  "correlationid",
  "legacycourseid",
  "legacyid",
  "organizationid",
  "tenantid",
  "imporbundleid",
  "stagingauditid",
  "stagingrunid",
]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_HASH_REGEX = /^(?:audit_)?[0-9a-f]{32,}$/i;
const ISO_DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SCREAMING_SNAKE_REGEX = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;

const GENERIC_REASON_STOPWORDS = new Set([
  "tutor",
  "admin",
  "override",
  "entry",
  "record",
  "item",
  "action",
  "mutation",
  "canonical",
  "legacy",
  "with",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFieldKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

export function isNoisyInternalField(key: string): boolean {
  return NOISY_INTERNAL_FIELDS.has(normalizeFieldKey(key));
}

export function isOpaqueIdentifier(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return UUID_REGEX.test(trimmed) || HEX_HASH_REGEX.test(trimmed);
}

export function isMutationAuditEnvelope(
  value: unknown,
): value is Record<string, unknown> & { snapshot: Record<string, unknown> | null } {
  if (!isPlainObject(value)) return false;
  if (!("snapshot" in value)) return false;
  if (typeof value.auditSchemaVersion === "string") return true;
  if ("snapshotHash" in value && ("requestId" in value || "actorRoles" in value)) {
    return true;
  }
  return false;
}

export function unwrapAuditSnapshot(
  raw: Record<string, unknown> | null | undefined,
): UnwrappedSnapshot {
  if (!isPlainObject(raw)) {
    return { data: null, envelopeMeta: null };
  }

  if (isMutationAuditEnvelope(raw)) {
    const envelopeMeta: AuditEnvelopeMeta = {
      auditSchemaVersion:
        typeof raw.auditSchemaVersion === "string" ? raw.auditSchemaVersion : undefined,
      actorRoles: Array.isArray(raw.actorRoles)
        ? raw.actorRoles.filter((r): r is string => typeof r === "string")
        : undefined,
      courseId: typeof raw.courseId === "string" ? raw.courseId : undefined,
      entityVersion: typeof raw.entityVersion === "number" ? raw.entityVersion : undefined,
      requestId: typeof raw.requestId === "string" ? raw.requestId : undefined,
      reason: typeof raw.reason === "string" ? raw.reason : undefined,
      outcome: typeof raw.outcome === "string" ? raw.outcome : undefined,
      snapshotHash:
        typeof raw.snapshotHash === "string" || raw.snapshotHash === null
          ? raw.snapshotHash
          : undefined,
    };

    const inner = raw.snapshot;
    return {
      data: isPlainObject(inner) ? inner : null,
      envelopeMeta,
    };
  }

  return { data: raw, envelopeMeta: null };
}

export function areSnapshotValuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!areSnapshotValuesEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!(key in b)) return false;
      if (!areSnapshotValuesEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

function isEmptyDisplayValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim().length === 0) return true;
  return false;
}

function isTruncatedPayload(obj: Record<string, unknown> | null): boolean {
  return Boolean(obj && obj._truncated === "[TRUNCATED_PAYLOAD]");
}

export function buildActivitySnapshotSummary(
  rawBefore: Record<string, unknown> | null | undefined,
  rawAfter: Record<string, unknown> | null | undefined,
): SnapshotSummary {
  const before = unwrapAuditSnapshot(rawBefore).data;
  const after = unwrapAuditSnapshot(rawAfter).data;

  const hasBefore = before !== null && Object.keys(before).length > 0;
  const hasAfter = after !== null && Object.keys(after).length > 0;

  if (!hasBefore && !hasAfter) {
    return { mode: "empty", entries: [] };
  }

  if (isTruncatedPayload(before) || isTruncatedPayload(after)) {
    return {
      mode: hasBefore && hasAfter ? "update" : hasAfter ? "create" : "delete",
      entries: [],
      truncated: true,
    };
  }

  if (hasBefore && hasAfter && before && after) {
    const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    const changedKeys = allKeys.filter(
      (key) => !areSnapshotValuesEqual(before[key], after[key]),
    );
    const meaningfulKeys = changedKeys.filter((key) => !isNoisyInternalField(key));
    const selectedKeys = meaningfulKeys.length > 0 ? meaningfulKeys : changedKeys;

    return {
      mode: "update",
      entries: selectedKeys.map((key) => ({
        key,
        before: before[key],
        after: after[key],
      })),
    };
  }

  const mode: "create" | "delete" = hasAfter ? "create" : "delete";
  const record = (hasAfter ? after : before) as Record<string, unknown>;
  const allKeys = Object.keys(record);

  const meaningfulKeys = allKeys.filter((key) => {
    if (isNoisyInternalField(key)) return false;
    const val = record[key];
    if (isEmptyDisplayValue(val)) return false;
    if (isOpaqueIdentifier(val)) return false;
    return true;
  });

  const fallbackNonEmpty = allKeys.filter((key) => !isEmptyDisplayValue(record[key]));
  const selectedKeys =
    meaningfulKeys.length > 0
      ? meaningfulKeys
      : fallbackNonEmpty.length > 0
        ? fallbackNonEmpty
        : allKeys;

  return {
    mode,
    entries: selectedKeys.map((key) =>
      mode === "create"
        ? { key, after: record[key] }
        : { key, before: record[key] },
    ),
  };
}

function stemToken(token: string): string {
  const t = token.toLowerCase();
  if (t.length <= 3) return t;
  if (t.endsWith("ied")) return `${t.slice(0, -3)}y`;
  if (t.endsWith("ed")) {
    const base = t.slice(0, -2);
    if (base.endsWith("t") || base.endsWith("v") || base.endsWith("c") || base.endsWith("g")) {
      return `${base}e`;
    }
    return base;
  }
  if (t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

function tokenizeIdentifier(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export function humanizeCodeString(value: string): string {
  const cleaned = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!cleaned) return "-";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function analyzeAuditReason(
  reason: string | null | undefined,
  action: string,
  entityType: string,
): AuditReasonDisplay {
  if (!reason) return { kind: "none" };
  const trimmed = reason.trim();
  if (!trimmed) return { kind: "none" };

  if (SCREAMING_SNAKE_REGEX.test(trimmed)) {
    const reasonTokens = tokenizeIdentifier(trimmed);
    const contextStems = new Set([
      ...tokenizeIdentifier(action).map(stemToken),
      ...tokenizeIdentifier(entityType).map(stemToken),
      ...Array.from(GENERIC_REASON_STOPWORDS).map(stemToken),
    ]);

    const isRedundant =
      reasonTokens.length > 0 &&
      reasonTokens.every((token) => contextStems.has(stemToken(token)));

    if (isRedundant) {
      return { kind: "redundant" };
    }

    return {
      kind: "code",
      text: humanizeCodeString(trimmed),
      raw: trimmed,
    };
  }

  return {
    kind: "note",
    text: trimmed,
    raw: trimmed,
  };
}

const FIELD_LABEL_KEYS: Record<string, string> = {
  title: "title",
  name: "name",
  label: "label",
  description: "description",
  summary: "summary",
  status: "status",
  state: "status",
  type: "type",
  category: "category",
  mode: "mode",
  visibility: "visibility",
  startat: "startAt",
  starttime: "startAt",
  endat: "endAt",
  endtime: "endAt",
  scheduledat: "scheduledAt",
  publishedat: "publishedAt",
  dueat: "dueAt",
  expiresat: "expiresAt",
  date: "date",
  time: "time",
  duration: "duration",
  durationminutes: "durationMinutes",
  capacity: "capacity",
  maxstudents: "maxStudents",
  maxattempts: "maxAttempts",
  passingscore: "passingScore",
  score: "score",
  points: "points",
  weight: "weight",
  order: "order",
  orderindex: "order",
  sortorder: "order",
  position: "order",
  price: "price",
  amount: "amount",
  currency: "currency",
  ispublished: "isPublished",
  isactive: "isActive",
  ispublic: "isPublic",
  isrequired: "isRequired",
  enabled: "enabled",
  active: "isActive",
  archived: "archived",
  locked: "locked",
  meetingurl: "meetingUrl",
  url: "url",
  link: "url",
  location: "location",
  room: "room",
  notes: "notes",
  note: "notes",
  reason: "reason",
  decision: "decision",
  comment: "comment",
  message: "message",
  feedback: "feedback",
  difficulty: "difficulty",
  level: "level",
  language: "language",
  tags: "tags",
  topics: "topics",
  slug: "slug",
  code: "code",
  email: "email",
  role: "role",
  roles: "roles",
  reviewerrole: "reviewerRole",
  questioncount: "questionCount",
  productcount: "productCount",
  dependencycount: "dependencyCount",
  slotcount: "slotCount",
  itemcount: "itemCount",
  count: "count",
  total: "total",
  revision: "revision",
  operation: "operation",
  bundleid: "bundleId",
  reviewstatus: "reviewStatus",
  origin: "origin",
  quizeligible: "quizEligible",
};

export function getFieldLabelKey(fieldName: string): string | null {
  return FIELD_LABEL_KEYS[normalizeFieldKey(fieldName)] ?? null;
}

export function humanizeFieldName(
  fieldName: string,
  translateField?: (key: string) => string,
): string {
  const labelKey = getFieldLabelKey(fieldName);
  if (labelKey && translateField) {
    return translateField(labelKey);
  }
  return humanizeCodeString(fieldName);
}

export function formatSnapshotValue(
  value: unknown,
  options: FormatValueOptions = {},
): string {
  const {
    locale = "en-US",
    yesLabel = "Yes",
    noLabel = "No",
    itemsCountLabel = (count: number) => `${count} items`,
    fieldsCountLabel = (count: number) => `${count} fields`,
    moreItemsLabel = (count: number) => `+${count} more`,
    timeZone,
  } = options;

  if (value === null || value === undefined) return "-";

  if (typeof value === "boolean") {
    return value ? yesLabel : noLabel;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    return new Intl.NumberFormat(locale).format(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "-";

    if (ISO_DATETIME_REGEX.test(trimmed)) {
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
          ...(timeZone ? { timeZone } : {}),
        }).format(parsed);
      }
    }

    if (ISO_DATE_REGEX.test(trimmed)) {
      const parsed = new Date(`${trimmed}T00:00:00Z`);
      if (!Number.isNaN(parsed.getTime())) {
        return new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeZone: "UTC",
        }).format(parsed);
      }
    }

    if (trimmed.length > 160) {
      return `${trimmed.slice(0, 157)}...`;
    }

    return trimmed;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    const allPrimitive = value.every(
      (item) =>
        item === null ||
        item === undefined ||
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean",
    );
    if (allPrimitive) {
      const preview = value.slice(0, 4).map((item) => formatSnapshotValue(item, options));
      if (value.length > 4) {
        return `${preview.join(", ")}, ${moreItemsLabel(value.length - 4)}`;
      }
      return preview.join(", ");
    }
    return itemsCountLabel(value.length);
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return "-";

    const primitiveEntries = entries.filter(
      ([, v]) =>
        typeof v === "string" || typeof v === "number" || typeof v === "boolean",
    );

    if (primitiveEntries.length > 0 && primitiveEntries.length <= 3 && entries.length <= 3) {
      return primitiveEntries
        .map(([k, v]) => `${humanizeCodeString(k)}: ${formatSnapshotValue(v, options)}`)
        .join("; ");
    }

    return fieldsCountLabel(entries.length);
  }

  return String(value);
}
