import { describe, expect, it } from "bun:test";
import { visibleOfflineLibrary } from "../../lib/offline/library-access";
import type { NativeOfflineLibrarySnapshot } from "../../lib/offline/library-contract";
import { DEFAULT_OFFLINE_POLICY } from "../../lib/offline/sync-contract";

function library(): NativeOfflineLibrarySnapshot {
  return {
    schemaVersion: 2, userId: "u", environment: "https://staging.zyxacademy.com", locale: "id",
    scopeKey: '["https://staging.zyxacademy.com","u","id"]', accessValidUntil: 3000, lastVerifiedAt: 1000,
    syncCursor: "1", policy: DEFAULT_OFFLINE_POLICY, syncState: "ready", achievements: [],
    courses: [{ id: "expired", title: "Expired", accessValidUntil: 1200 }, { id: "valid", title: "Valid", accessValidUntil: 2500 }],
    materials: [
      { id: "old-course", courseId: "expired", title: "Hidden", kind: "article", contentVersion: "1" },
      { id: "old-material", courseId: "valid", title: "Hidden", kind: "article", contentVersion: "1", accessValidUntil: 1200 },
      { id: "current", courseId: "valid", title: "Visible", kind: "video", contentVersion: "1", accessValidUntil: 2500 },
    ],
  };
}

describe("native metadata leases", () => {
  it("hides a course and its video/reading metadata when its own grant expires", () => {
    const snapshot = library(); const visible = visibleOfflineLibrary(snapshot, 1500)!;
    expect(visible.courses.map(course => course.id)).toEqual(["valid"]);
    expect(visible.materials.map(material => material.id)).toEqual(["current"]);
    expect(snapshot.courses).toHaveLength(2);
  });
  it("never extends a global lease with a longer material lease", () => {
    const snapshot = library(); snapshot.materials[2].accessValidUntil = 9000;
    expect(visibleOfflineLibrary(snapshot, 3000)).toBeNull();
  });
});
