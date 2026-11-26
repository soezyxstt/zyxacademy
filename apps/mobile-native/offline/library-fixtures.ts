import { projectOfflineLibrary, type OfflineLibraryData } from "./library-model";
import type { NativeOfflineResourceDescriptor } from "./sync-contract";

export const offlineLibraryFixtureCases = ["populated", "empty", "failure"] as const;
export type OfflineLibraryFixtureCase = (typeof offlineLibraryFixtureCases)[number];
export function isOfflineLibraryFixtureCase(value: unknown): value is OfflineLibraryFixtureCase {
  return offlineLibraryFixtureCases.some(id => id === value);
}

const now = Date.UTC(2026, 0, 1);
const expires = Date.UTC(2036, 0, 1);
const courseId = "integration-fixture-math";
const title = "Matematika dan penalaran kuantitatif untuk persiapan penilaian akhir";
const articleTitle = "Cara menafsirkan data dari tabel, grafik, dan kasus penalaran kuantitatif dalam soal cerita";
function material(kind: "article" | "diktat", id: string, title: string): NativeOfflineResourceDescriptor {
  return { key: JSON.stringify([kind, courseId, id]), kind, id, courseId, title, chapterIds: ["fixture-chapter"],
    revision: `revision-${id}`, updatedAt: now, estimatedBytes: 4031 };
}
const article = material("article", "reading", articleTitle);
const diktat = material("diktat", "guide", "Diktat peluang bersyarat");

export const offlineLibraryFixtureData: OfflineLibraryData = {
  metadata: { cursor: null, knownCourseIds: [courseId], courses: [{ id: courseId, title, leaseExpiresAt: expires,
    manifestLeaseExpiresAt: expires, materials: [diktat, article] }] },
  saved: [{ key: article.key, kind: "article", id: article.id, courseId, title: article.title, bytes: 4031,
    savedAt: now, leaseExpiresAt: expires, revision: article.revision }],
};

export function offlineLibraryFixtureRows(id: OfflineLibraryFixtureCase) {
  return id === "populated" ? projectOfflineLibrary(offlineLibraryFixtureData, now, expires).rows : [];
}
