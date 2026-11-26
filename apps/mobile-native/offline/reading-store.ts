import type { NativeSessionScope } from "../network/transport";
import { offlineMetadataSchema, readOfflineReadingAuthority } from "./metadata-store";
import {
  OfflineReadingError,
  READING_ASSET_COUNT_LIMIT,
  READING_ASSET_LIMIT,
  READING_BODY_LIMIT,
  READING_ENTRY_LIMIT,
  READING_PACKAGE_LIMIT,
  READING_STORAGE_LIMIT,
  readingKey,
  type OfflineReadingAsset,
  type OfflineReadingData,
  type OfflineReadingPackage,
  type OfflineReadingSummary,
  type OfflineReadingTarget,
} from "./reading-contract";
import { notifyOfflineReadingChanges } from "./reading-events";
import { compareNativeOfflineCursors, type NativeOfflineScope } from "./sync-contract";

const CHUNK_BYTES = 256 * 1024;
const INFO_BYTES = 384 * 1024;
const DEVICE_BYTES = 2 * READING_STORAGE_LIMIT;
const schema = `
  CREATE TABLE IF NOT EXISTS expo_reading_packages_v1 (
    entry INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL,
    account_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    locale TEXT NOT NULL,
    resource_key TEXT NOT NULL,
    course_id TEXT NOT NULL,
    revision TEXT NOT NULL,
    chapter_ids TEXT NOT NULL,
    validated_at INTEGER NOT NULL,
    lease_expires_at INTEGER NOT NULL,
    info TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    saved_at INTEGER NOT NULL,
    UNIQUE (origin, account_id, session_id, locale, resource_key)
  );
  CREATE TABLE IF NOT EXISTS expo_reading_parts_v1 (
    entry INTEGER NOT NULL,
    part INTEGER NOT NULL,
    chunk INTEGER NOT NULL,
    data BLOB NOT NULL,
    PRIMARY KEY (entry, part, chunk)
  );
  CREATE TRIGGER IF NOT EXISTS expo_reading_package_delete_v1 AFTER DELETE ON expo_reading_packages_v1
    BEGIN
      DELETE FROM expo_reading_parts_v1 WHERE entry = OLD.entry;
    END;
`;

type Bind = string | number | null | Uint8Array;
type Connection = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: Bind[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(sql: string, ...params: Bind[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: Bind[]): Promise<T[]>;
};
export type OfflineReadingDatabase = Connection & {
  withExclusiveTransactionAsync(work: (tx: Connection) => Promise<void>): Promise<void>;
};

type Authority = NonNullable<Awaited<ReturnType<typeof readOfflineReadingAuthority>>>;
type Guard = { verifiedUntil: number; assertCurrent(): void };
type EntryRow = {
  entry: number; resource_key: string; course_id: string; revision: string; chapter_ids: string;
  validated_at: number; lease_expires_at: number; bytes: number; saved_at: number;
};
type EntryInfo = {
  bodyBytes: number;
  assets: Array<{ url: string; mime: string; size: number }>;
};

export type ReadingCandidate = {
  target: OfflineReadingTarget;
  revision: string;
  cursor: string;
  leaseExpiresAt: number;
  validatedAt: number;
  body: Uint8Array;
  assets: OfflineReadingAsset[];
};

const keys = (scope: NativeOfflineScope) => [scope.origin, scope.accountId, scope.sessionId, scope.locale] as const;
const scopeFilter = "origin = ? AND account_id = ? AND session_id = ? AND locale = ?";
const entryColumns = "entry, resource_key, course_id, revision, chapter_ids, validated_at, lease_expires_at, bytes, saved_at";

function entryTarget(key: string): OfflineReadingTarget | null {
  try {
    const [kind, courseId, id] = JSON.parse(key);
    const target = { kind, courseId, id };
    return readingKey(target) === key ? target : null;
  } catch { return null; }
}

function decodeChapterIds(value: string): string[] {
  try {
    const chapters = JSON.parse(value);
    if (Array.isArray(chapters) && chapters.every(chapter => typeof chapter === "string")) return chapters;
  } catch { /* A damaged row supplies no proof. */ }
  return [];
}

function decodeInfo(entry: EntryRow & { info: string }): EntryInfo | null {
  try {
    const info = JSON.parse(entry.info) as EntryInfo;
    if (!Array.isArray(info.assets) || info.assets.length > READING_ASSET_COUNT_LIMIT
      || !Number.isSafeInteger(info.bodyBytes) || info.bodyBytes <= 0 || info.bodyBytes > READING_BODY_LIMIT
      || !info.assets.every(asset => Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= READING_ASSET_LIMIT)
      || info.bodyBytes + info.assets.reduce((sum, asset) => sum + asset.size, 0) > entry.bytes) return null;
    return info;
  } catch { return null; }
}

function activeCourse(authority: Authority, courseId: string, cutoff: number) {
  const course = authority.courses.find(item => item.courseId === courseId);
  return course && course.allowed && Math.min(authority.leaseExpiresAt, course.leaseExpiresAt) > cutoff ? course : null;
}

function proof(authority: Authority, target: OfflineReadingTarget, cutoff: number) {
  const course = activeCourse(authority, target.courseId, cutoff);
  if (!course?.manifest || course.manifest.leaseExpiresAt <= cutoff) return null;
  const { manifest } = course;
  const descriptor = manifest.materials.find(item => item.key === readingKey(target));
  if (!descriptor || !descriptor.chapterIds.length || !descriptor.chapterIds.every(chapter => course.chapterIds.includes(chapter))) return null;
  const leaseExpiresAt = Math.min(authority.leaseExpiresAt, course.leaseExpiresAt, manifest.leaseExpiresAt);
  return { descriptor, cursor: manifest.cursor, checkedAt: manifest.checkedAt, leaseExpiresAt };
}

function readyEntry(authority: Authority, entry: EntryRow, verifiedUntil: number, now: number): OfflineReadingSummary | null {
  const target = entryTarget(entry.resource_key);
  if (!target || entry.bytes < 1 || entry.bytes > READING_PACKAGE_LIMIT) return null;
  const access = proof(authority, target, now);
  if (!access || access.descriptor.revision !== entry.revision) return null;
  const renewed = access.checkedAt !== null && access.checkedAt > entry.validated_at;
  const retainedUntil = authority.readingPolicy ? entry.saved_at + authority.readingPolicy.retentionMs : 0;
  const leaseExpiresAt = Math.min(verifiedUntil, access.leaseExpiresAt, retainedUntil, renewed ? access.leaseExpiresAt : entry.lease_expires_at);
  if (!Number.isFinite(leaseExpiresAt) || leaseExpiresAt <= now) return null;
  return { ...target, key: entry.resource_key, title: access.descriptor.title,
    revision: entry.revision, bytes: entry.bytes, savedAt: entry.saved_at, leaseExpiresAt };
}

export function createOfflineReadingStore(db: OfflineReadingDatabase, now = Date.now) {
  let ready: Promise<void> | undefined;
  let writer: Promise<unknown> = Promise.resolve();
  function initialize() {
    ready ??= db.execAsync(offlineMetadataSchema + schema).catch(error => {
      ready = undefined;
      throw error;
    });
    return ready;
  }

  function transaction<T>(work: (tx: Connection) => Promise<T>): Promise<T> {
    const run = async () => {
      await initialize();
      let value: T | undefined;
      await db.withExclusiveTransactionAsync(async tx => {
        await tx.execAsync("PRAGMA busy_timeout = 2000; PRAGMA secure_delete = ON");
        value = await work(tx);
      });
      return value as T;
    };
    const pending = writer.then(run, run);
    writer = pending;
    return pending;
  }

  function assertGrant(guard: Guard) {
    guard.assertCurrent();
    if (guard.verifiedUntil <= now()) throw new OfflineReadingError("cancelled");
  }

  const rows = (tx: Connection, scope: NativeOfflineScope) => tx.getAllAsync<EntryRow>(
    `SELECT ${entryColumns} FROM expo_reading_packages_v1 WHERE ${scopeFilter} ORDER BY saved_at DESC`, ...keys(scope),
  );
  const entry = (tx: Connection, scope: NativeOfflineScope, target: OfflineReadingTarget) => tx.getFirstAsync<EntryRow & { info: string }>(
    `SELECT ${entryColumns}, info FROM expo_reading_packages_v1 WHERE ${scopeFilter} AND resource_key = ?`,
    ...keys(scope), readingKey(target),
  );

  async function remove(entryId: number, tx: Connection = db) {
    return (await tx.runAsync("DELETE FROM expo_reading_packages_v1 WHERE entry = ?", entryId)).changes;
  }

  async function reconcileScope(tx: Connection, scope: NativeOfflineScope, authority: Authority) {
    let changes = 0;
    for (const row of await rows(tx, scope)) {
      const chapters = decodeChapterIds(row.chapter_ids);
      const course = authority.courses.find(item => item.courseId === row.course_id);
      const withdrawn = course?.manifest && !authority.pending && !course.manifest.materials.some(item => item.key === row.resource_key);
      const expired = authority.readingPolicy && now() - row.saved_at >= authority.readingPolicy.retentionMs;
      if (!chapters.length || !course || !chapters.every(chapter => course.chapterIds.includes(chapter)) || withdrawn || expired) {
        changes += await remove(row.entry, tx);
      }
    }
    return changes;
  }

  async function list(scope: NativeOfflineScope, guard: Guard) {
    assertGrant(guard);
    await initialize();
    const entries = await rows(db, scope);
    // Read current authority after the rows to avoid publishing a package invalidated during the query.
    const authority = await readOfflineReadingAuthority(db, scope);
    assertGrant(guard);
    return authority ? entries.flatMap(row => {
      const result = readyEntry(authority, row, guard.verifiedUntil, now());
      return result ? [result] : [];
    }) : [];
  }

  async function read(scope: NativeOfflineScope, target: OfflineReadingTarget, guard: Guard): Promise<OfflineReadingPackage | null> {
    assertGrant(guard);
    await initialize();
    const authority = await readOfflineReadingAuthority(db, scope);
    const row = authority && await entry(db, scope, target);
    const initial = authority && row && readyEntry(authority, row, guard.verifiedUntil, now());
    const info = initial && row && decodeInfo(row);
    if (!row || !info) return null;
    const parts = [new Uint8Array(info.bodyBytes), ...info.assets.map(asset => new Uint8Array(asset.size))];
    const offsets = parts.map(() => 0);
    const chunks = await db.getAllAsync<{ part: number; data: Uint8Array }>(
      "SELECT part, data FROM expo_reading_parts_v1 WHERE entry = ? ORDER BY part, chunk", row.entry,
    );
    for (const { part, data } of chunks) {
      const destination = parts[part];
      if (!destination || offsets[part] + data.byteLength > destination.byteLength) return null;
      destination.set(data, offsets[part]);
      offsets[part] += data.byteLength;
    }
    if (offsets.some((offset, index) => offset !== parts[index].byteLength)) return null;
    const unchanged = (await entry(db, scope, target))?.entry === row.entry;
    const latest = await readOfflineReadingAuthority(db, scope);
    assertGrant(guard);
    const current = unchanged && latest && readyEntry(latest, row, guard.verifiedUntil, now());
    if (!current) return null;
    const data = JSON.parse(new TextDecoder().decode(parts[0])) as OfflineReadingData;
    const assets = info.assets.map(({ url, mime }, index) => ({ url, mime, bytes: parts[index + 1] }));
    return { summary: current, data, assets };
  }

  async function store(scope: NativeOfflineScope, candidate: ReadingCandidate, guard: Guard) {
    const key = readingKey(candidate.target);
    const infoBytes = candidate.body.byteLength + candidate.assets.reduce((sum, asset) => sum + asset.bytes.byteLength, 0);
    if (infoBytes > READING_PACKAGE_LIMIT) throw new OfflineReadingError("too-large");
    let committedEntry: number | undefined;
    try {
      committedEntry = await transaction(async tx => {
        assertGrant(guard);
        const authority = await readOfflineReadingAuthority(tx, scope);
        const access = authority && proof(authority, candidate.target, now());
        if (!authority?.readingPolicy || !access || access.descriptor.revision !== candidate.revision
          || compareNativeOfflineCursors(candidate.cursor, access.cursor) < 0
          || Math.min(candidate.leaseExpiresAt, access.leaseExpiresAt) <= now()) throw new OfflineReadingError("changed");
        await reconcileScope(tx, scope, authority);
        const previous = await entry(tx, scope, candidate.target);
        if (previous && previous.validated_at > candidate.validatedAt) throw new OfflineReadingError("changed");
        const info = JSON.stringify({
          bodyBytes: candidate.body.byteLength, assets: candidate.assets.map(({ url, mime, bytes }) => ({ url, mime, size: bytes.byteLength })),
        } satisfies EntryInfo);
        const chapters = JSON.stringify(access.descriptor.chapterIds);
        const extra = new TextEncoder().encode(info + chapters).byteLength;
        if (extra > INFO_BYTES) throw new OfflineReadingError("too-large");
        const size = infoBytes + extra;
        if (size > READING_PACKAGE_LIMIT) throw new OfflineReadingError("too-large");
        const totals = await tx.getFirstAsync<{ count: number; bytes: number }>(
          `SELECT COUNT(*) AS count, COALESCE(SUM(bytes), 0) AS bytes FROM expo_reading_packages_v1 WHERE ${scopeFilter}`, ...keys(scope),
        );
        const device = await tx.getFirstAsync<{ bytes: number }>("SELECT COALESCE(SUM(bytes), 0) AS bytes FROM expo_reading_packages_v1");
        const previousBytes = previous?.bytes ?? 0;
        if ((totals?.count ?? 0) + Number(!previous) > Math.min(authority.readingPolicy.maxEntries, READING_ENTRY_LIMIT)
          || (totals?.bytes ?? 0) - previousBytes + size > Math.min(authority.readingPolicy.maxBytes, READING_STORAGE_LIMIT)
          || (device?.bytes ?? 0) - previousBytes + size > DEVICE_BYTES) throw new OfflineReadingError("storage-full");
        if (previous) await remove(previous.entry, tx);
        const { lastInsertRowId } = await tx.runAsync(`
          INSERT INTO expo_reading_packages_v1 (
            origin, account_id, session_id, locale, resource_key, course_id, revision,
            chapter_ids, validated_at, lease_expires_at, info, bytes, saved_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, ...keys(scope), key, candidate.target.courseId, candidate.revision, chapters, candidate.validatedAt,
        Math.min(candidate.leaseExpiresAt, access.leaseExpiresAt), info, size, now());
        const parts = [candidate.body, ...candidate.assets.map(asset => asset.bytes)];
        for (const [part, bytes] of parts.entries()) {
          for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
            assertGrant(guard);
            await tx.runAsync("INSERT INTO expo_reading_parts_v1 (entry, part, chunk, data) VALUES (?, ?, ?, ?)",
              lastInsertRowId, part, offset / CHUNK_BYTES, bytes.slice(offset, offset + CHUNK_BYTES));
          }
        }
        assertGrant(guard);
        return lastInsertRowId;
      });
      assertGrant(guard);
    } catch (error) {
      // If a native commit completed as the session changed, remove only this writer's row.
      if (committedEntry !== undefined) await remove(committedEntry).catch(() => {});
      throw error;
    } finally {
      if (committedEntry !== undefined) notifyOfflineReadingChanges();
    }
  }

  return {
    read,
    list,
    store,
    async authorize(scope: NativeOfflineScope, target: OfflineReadingTarget, guard: Guard) {
      assertGrant(guard);
      await initialize();
      const authority = await readOfflineReadingAuthority(db, scope);
      assertGrant(guard);
      const access = authority?.readingPolicy && proof(authority, target, now());
      if (!access || Math.min(access.leaseExpiresAt, guard.verifiedUntil) <= now()) return null;
      return access;
    },
    async forget(scope: NativeOfflineScope, target: OfflineReadingTarget, guard: Guard, revision?: string) {
      const changed = await transaction(async tx => {
        assertGrant(guard);
        const current = await entry(tx, scope, target);
        assertGrant(guard);
        return current && (!revision || current.revision === revision) ? await remove(current.entry, tx) : 0;
      });
      if (changed) notifyOfflineReadingChanges();
      return Boolean(changed);
    },
    async reconcile(scope: NativeOfflineScope, assertCurrent: () => void) {
      const changed = await transaction(async tx => {
        assertCurrent();
        const authority = await readOfflineReadingAuthority(tx, scope);
        const changes = authority ? await reconcileScope(tx, scope, authority) : 0;
        assertCurrent();
        return changes;
      });
      if (changed) notifyOfflineReadingChanges();
    },
    async clearSession({ origin, accountId, sessionId }: NativeSessionScope) {
      await transaction(tx => tx.runAsync("DELETE FROM expo_reading_packages_v1 WHERE origin = ? AND account_id = ? AND session_id = ?", origin, accountId, sessionId));
      notifyOfflineReadingChanges();
    },
  };
}

export type NativeOfflineReadingStore = ReturnType<typeof createOfflineReadingStore>;
