import { describe, expect, test } from "bun:test";
import { OFFLINE_LIBRARY_COPY as webCopy } from "../../lib/offline/library-copy";
import { OFFLINE_LIBRARY_COPY } from "../../packages/offline/library-copy";
import { offlineLibraryFixtureData, offlineLibraryFixtureRows } from "../../apps/mobile-native/offline/library-fixtures";
import {
  filterOfflineLibrary,
  offlineLibraryFeedback,
  offlineLibraryScopeKey,
  projectOfflineLibrary,
  readableLibraryPackage,
  offlineDocumentHref,
} from "../../apps/mobile-native/offline/library-model";
import type { NativeOfflineScope } from "../../apps/mobile-native/offline/sync-contract";

const now = Date.UTC(2026, 0, 1);
const future = now + 1000;
const scope: NativeOfflineScope = { origin: "https://staging.zyxacademy.com", accountId: "test-learner",
  sessionId: "test-session", locale: "id" };

describe("Expo offline library presentation", () => {
  test("uses the same translated vocabulary as the web library", () => {
    expect(webCopy).toBe(OFFLINE_LIBRARY_COPY);
    expect(offlineLibraryFeedback("id", "storage-full")?.message).toBe(webCopy.id.storageFailed);
    expect(offlineLibraryFeedback("en", "changed")?.error).toBe(true);
    expect(offlineLibraryFeedback("en", "cancelled")).toBeNull();
  });

  test("keys results by exact origin, account, session, locale and lease", () => {
    const keys = [scope, { ...scope, origin: "https://www.zyxacademy.com" },
      { ...scope, accountId: "other" }, { ...scope, sessionId: "other" }, { ...scope, locale: "en" as const }]
      .map(scope => offlineLibraryScopeKey(scope, future, now));
    expect(new Set(keys).size).toBe(5);
    expect(offlineLibraryScopeKey(scope, future + 1, now)).not.toBe(keys[0]);
    expect(offlineLibraryScopeKey(scope, future, future)).toBeNull();
    expect(offlineLibraryScopeKey(null, future, now)).toBeNull();
  });

  test("joins authorized manifests and saved packages by full resource identity and revision", () => {
    const rows = offlineLibraryFixtureRows("populated");
    expect(rows.map(row => [row.target.kind, Boolean(row.savedUntil)])).toEqual([["article", true], ["diktat", false]]);
    const oldPackage = { ...offlineLibraryFixtureData.saved[0], revision: "old" };
    const spoofedPackage = { ...oldPackage, revision: offlineLibraryFixtureData.saved[0].revision, courseId: "other" };
    for (const saved of [[oldPackage], [spoofedPackage], []]) {
      const data = { ...offlineLibraryFixtureData, saved };
      expect(projectOfflineLibrary(data, now, future).rows.every(row => !row.savedUntil)).toBe(true);
    }
    expect(projectOfflineLibrary({ ...offlineLibraryFixtureData, metadata: null }, now, future).rows).toEqual([]);
  });

  test("drops rows at the earlier of manifest, course and session expiry on an unchanged snapshot", () => {
    const metadata = offlineLibraryFixtureData.metadata!;
    const course = metadata.courses[0];
    for (const deadline of ["leaseExpiresAt", "manifestLeaseExpiresAt"] as const) {
      const data = { ...offlineLibraryFixtureData, metadata: { ...metadata, courses: [{ ...course, [deadline]: now + 500 }] } };
      expect(projectOfflineLibrary(data, now, future).expires).toBe(now + 500);
      expect(projectOfflineLibrary(data, now + 500, future).rows).toEqual([]);
      expect(projectOfflineLibrary(data, now + 500, future).expired).toBe(true);
    }
    expect(projectOfflineLibrary(offlineLibraryFixtureData, future, future).rows).toEqual([]);
  });

  test("opens only the saved material named by its verified course, kind, revision and current lease", () => {
    const [row] = offlineLibraryFixtureRows("populated");
    const [saved] = offlineLibraryFixtureData.saved;
    expect(readableLibraryPackage(row, saved, now)).toBe(true);
    for (const changed of [{ id: "other" }, { kind: "diktat" as const }, { key: "other" }, { courseId: "other" },
      { revision: "old" }, { leaseExpiresAt: now }]) expect(readableLibraryPackage(row, { ...saved, ...changed }, now)).toBe(false);
    expect(readableLibraryPackage({ ...row, savedUntil: null }, saved, now)).toBe(false);
    expect(readableLibraryPackage({ ...row, availableUntil: now }, saved, now)).toBe(false);
    expect(offlineDocumentHref("en", row.target, "limits")).toEqual({ pathname: "/offline", params: {
      locale: "en", courseId: row.target.courseId, materialId: row.target.id, read: row.target.kind, section: "limits",
    } });
  });

  test("expires saved status while keeping a currently authorized descriptor", () => {
    const data = { ...offlineLibraryFixtureData, saved: [{ ...offlineLibraryFixtureData.saved[0], leaseExpiresAt: now + 250 }] };
    expect(projectOfflineLibrary(data, now, future).expires).toBe(now + 250);
    const rows = projectOfflineLibrary(data, now + 250, future).rows;
    expect(rows.find(row => row.target.id === "reading")?.savedUntil).toBeNull();
    expect(rows).toHaveLength(2);
  });

  test("filters long titles and course labels without changing action identity", () => {
    const rows = offlineLibraryFixtureRows("populated");
    expect(filterOfflineLibrary(rows, "  pELUang  ", "id").map(row => row.target.id)).toEqual(["guide"]);
    expect(filterOfflineLibrary(rows, "penilaian akhir", "id")).toHaveLength(2);
    expect(filterOfflineLibrary(rows, "tidak ada", "id")).toEqual([]);
    expect(offlineLibraryFixtureRows("empty")).toEqual([]);
    expect(offlineLibraryFixtureRows("failure")).toEqual([]);
  });
});
