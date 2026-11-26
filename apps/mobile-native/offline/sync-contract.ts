import type { OfflinePolicy } from "../../../lib/offline/policy-types";
import type { NativeSessionScope } from "../network/transport";

export const NATIVE_OFFLINE_COURSE_LIMIT = 150;
export const NATIVE_OFFLINE_HEADERS = {
  accountId: "x-offline-account-id",
  sessionId: "x-offline-session-id",
  environment: "x-offline-environment",
  locale: "x-offline-locale",
} as const;

export type NativeOfflineLocale = "id" | "en";
export type NativeOfflineScope = NativeSessionScope & { readonly locale: NativeOfflineLocale };

const RESOURCE_KINDS = ["article", "diktat", "course_outline", "video_catalog", "achievement_catalog", "enrollments"] as const;
const CHANGE_KINDS = [...RESOURCE_KINDS, "course", "policy", "access"] as const;
const CHANGE_ACTIONS = ["upsert", "delete", "invalidate"] as const;
type ResourceKind = (typeof RESOURCE_KINDS)[number];

export type NativeOfflineResourceDescriptor = {
  key: string;
  kind: ResourceKind;
  id: string;
  courseId: string | null;
  chapterIds: string[];
  title: string;
  revision: string;
  updatedAt: number;
  estimatedBytes: number;
};

export type NativeOfflineCourseAccess = {
  courseId: string;
  allowed: boolean;
  fullContent: boolean;
  chapterIds: string[];
  leaseExpiresAt: number;
};

type NativeOfflineIdentity = {
  protocolVersion: 1;
  accountId: string;
  sessionId: string;
  environment: string;
  locale: NativeOfflineLocale;
  cursor: string;
  serverTime: number;
  leaseExpiresAt: number;
};

type OfflineChange = {
  cursor: string;
  kind: (typeof CHANGE_KINDS)[number];
  courseId: string | null;
  resourceId: string | null;
  action: (typeof CHANGE_ACTIONS)[number];
  revision: string | null;
};

export type NativeOfflineSyncResponse = NativeOfflineIdentity & {
  reset: boolean;
  hasMore: boolean;
  policy: OfflinePolicy;
  enrollments: Array<{ id: string; title: string; expiresAt: number | null }>;
  access: NativeOfflineCourseAccess[];
  changes: OfflineChange[];
};

export type NativeOfflineManifestResponse = NativeOfflineIdentity & {
  resource: NativeOfflineCourseAccess;
  resources: NativeOfflineResourceDescriptor[];
};

export class NativeOfflineProtocolError extends Error {
  constructor() {
    super("The offline response did not match the expected contract.");
    this.name = "NativeOfflineProtocolError";
  }
}

function expectValue(condition: unknown): asserts condition {
  if (!condition) throw new NativeOfflineProtocolError();
}

function record(value: unknown): Record<string, unknown> {
  expectValue(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  expectValue(Array.isArray(value));
  return value;
}

function string(value: unknown): string {
  expectValue(typeof value === "string");
  return value;
}

function id(value: unknown): string {
  expectValue(typeof value === "string" && value.length > 0 && value.length <= 1024);
  return value;
}

function boolean(value: unknown): boolean {
  expectValue(typeof value === "boolean");
  return value;
}

function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  expectValue(typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max);
  return value;
}

function enumValue<T extends string>(value: unknown, choices: readonly T[]): T {
  const matched = choices.find(choice => choice === value);
  expectValue(matched);
  return matched;
}

export function isNativeOfflineCursor(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value);
}

function cursor(value: unknown): string {
  expectValue(isNativeOfflineCursor(value));
  return value;
}

export function compareNativeOfflineCursors(left: string, right: string): number {
  return left.length - right.length || (left < right ? -1 : left > right ? 1 : 0);
}

function identity(row: Record<string, unknown>, scope: NativeOfflineScope): NativeOfflineIdentity {
  expectValue(row.protocolVersion === 1 && row.accountId === scope.accountId && row.sessionId === scope.sessionId
    && row.environment === scope.origin && row.locale === scope.locale);
  return {
    protocolVersion: 1,
    accountId: scope.accountId,
    sessionId: scope.sessionId,
    environment: scope.origin,
    locale: scope.locale,
    cursor: cursor(row.cursor),
    serverTime: integer(row.serverTime),
    leaseExpiresAt: integer(row.leaseExpiresAt),
  };
}

function policy(value: unknown): OfflinePolicy {
  const row = record(value);
  const schedule = record(row.schedule);
  expectValue(schedule.timeZone === "Asia/Jakarta");
  return {
    metadataMaxAgeMs: integer(row.metadataMaxAgeMs, 60_000, 7 * 86_400_000),
    contentMaxAgeMs: integer(row.contentMaxAgeMs, 60_000, 30 * 86_400_000),
    retentionMs: integer(row.retentionMs, 86_400_000, 90 * 86_400_000),
    accessLeaseMs: integer(row.accessLeaseMs, 60_000, 7 * 86_400_000),
    activeCheckIntervalMs: integer(row.activeCheckIntervalMs, 30_000, 15 * 60_000),
    maxBytes: integer(row.maxBytes, 8 * 1024 * 1024, 1024 * 1024 * 1024),
    maxEntries: integer(row.maxEntries, 25, 1000),
    autoCache: boolean(row.autoCache),
    wifiOnly: boolean(row.wifiOnly),
    schedule: {
      frequency: enumValue(schedule.frequency, ["daily", "weekly"] as const),
      weekday: integer(schedule.weekday, 0, 6),
      hour: integer(schedule.hour, 0, 23),
      timeZone: schedule.timeZone,
    },
    revision: integer(row.revision),
    updatedAt: integer(row.updatedAt),
  };
}

function access(value: unknown): NativeOfflineCourseAccess {
  const row = record(value);
  return {
    courseId: id(row.courseId),
    allowed: boolean(row.allowed),
    fullContent: boolean(row.fullContent),
    chapterIds: [...new Set(array(row.chapterIds).map(id))],
    leaseExpiresAt: integer(row.leaseExpiresAt),
  };
}

function descriptor(value: unknown): NativeOfflineResourceDescriptor {
  const row = record(value);
  return {
    key: id(row.key),
    kind: enumValue(row.kind, RESOURCE_KINDS),
    id: id(row.id),
    courseId: row.courseId === null ? null : id(row.courseId),
    chapterIds: [...new Set(array(row.chapterIds).map(id))],
    title: string(row.title),
    revision: id(row.revision),
    updatedAt: integer(row.updatedAt),
    estimatedBytes: integer(row.estimatedBytes),
  };
}

export function parseNativeOfflineSyncResponse(value: unknown, scope: NativeOfflineScope, previousCursor: string | null): NativeOfflineSyncResponse {
  const row = record(value);
  const resultIdentity = identity(row, scope);
  const reset = boolean(row.reset);
  const hasMore = boolean(row.hasMore);
  const resultPolicy = policy(row.policy);
  const accessEntries = array(row.access).map(access);
  const enrollments = array(row.enrollments).map(value => {
    const entry = record(value);
    return { id: id(entry.id), title: string(entry.title), expiresAt: entry.expiresAt === null ? null : integer(entry.expiresAt) };
  });
  expectValue(accessEntries.length <= NATIVE_OFFLINE_COURSE_LIMIT
    && new Set(accessEntries.map(entry => entry.courseId)).size === accessEntries.length);
  expectValue(resultIdentity.leaseExpiresAt >= resultIdentity.serverTime
    && resultIdentity.leaseExpiresAt - resultIdentity.serverTime <= resultPolicy.accessLeaseMs);

  let lastChangeCursor: string | null = null;
  const changes: OfflineChange[] = array(row.changes).map(value => {
    const entry = record(value);
    const changeCursor = cursor(entry.cursor);
    expectValue(previousCursor !== null && compareNativeOfflineCursors(changeCursor, previousCursor) > 0
      && compareNativeOfflineCursors(changeCursor, resultIdentity.cursor) <= 0
      && (!lastChangeCursor || compareNativeOfflineCursors(changeCursor, lastChangeCursor) >= 0));
    lastChangeCursor = changeCursor;
    return {
      cursor: changeCursor,
      kind: enumValue(entry.kind, CHANGE_KINDS),
      courseId: entry.courseId === null ? null : id(entry.courseId),
      resourceId: entry.resourceId === null ? null : id(entry.resourceId),
      action: enumValue(entry.action, CHANGE_ACTIONS),
      revision: entry.revision === null ? null : id(entry.revision),
    };
  });
  expectValue(reset ? !hasMore && changes.length === 0
    : previousCursor !== null && compareNativeOfflineCursors(resultIdentity.cursor, previousCursor) >= (hasMore ? 1 : 0));
  return { ...resultIdentity, reset, hasMore, policy: resultPolicy, access: accessEntries, enrollments, changes };
}

export function parseNativeOfflineManifestResponse(
  value: unknown,
  scope: NativeOfflineScope,
  courseId: string,
  minCursor: string,
): NativeOfflineManifestResponse {
  const row = record(value);
  const resultIdentity = identity(row, scope);
  const resource = access(row.resource);
  expectValue(compareNativeOfflineCursors(resultIdentity.cursor, minCursor) >= 0
    && resource.allowed && resource.courseId === courseId
    && resultIdentity.leaseExpiresAt <= resource.leaseExpiresAt);
  const allowedChapters = new Set(resource.chapterIds);
  const resources = array(row.resources).map(descriptor);
  expectValue(resources.every(item => (item.kind === "article" || item.kind === "diktat") && item.courseId === courseId
    && item.key === JSON.stringify([item.kind, courseId, item.id])
    && item.chapterIds.length && item.chapterIds.every(chapter => allowedChapters.has(chapter))));
  expectValue(new Set(resources.map(item => item.key)).size === resources.length);
  return { ...resultIdentity, resource, resources };
}
