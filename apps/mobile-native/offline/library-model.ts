import { OFFLINE_LIBRARY_COPY } from "../../../packages/offline/library-copy";
import type { NativeOfflineMetadataSnapshot } from "./metadata-store";
import type { OfflineReadingDownloadStatus, OfflineReadingSummary, OfflineReadingTarget } from "./reading-contract";
import type { NativeOfflineLocale, NativeOfflineScope } from "./sync-contract";

export type OfflineLibraryRow = {
  key: string;
  target: OfflineReadingTarget;
  revision: string;
  title: string;
  courseTitle: string;
  availableUntil: number;
  savedUntil: number | null;
};

export type OfflineLibraryTarget = { courseId: string; materialId?: string };

export function offlineLibraryTarget(courseId: unknown, materialId: unknown): OfflineLibraryTarget | null {
  const validId = (value: unknown): value is string => typeof value === "string"
    && value.length > 0 && value.length <= 256 && !/[/?#\\\u0000-\u001f]/u.test(value);
  if (!validId(courseId) || (materialId !== undefined && !validId(materialId))) return null;
  return { courseId, materialId: validId(materialId) ? materialId : undefined };
}

export function focusOfflineLibrary(rows: OfflineLibraryRow[], target: OfflineLibraryTarget | null) {
  if (!target) return rows;
  return rows.filter(row => row.target.courseId === target.courseId
    && (target.materialId === undefined || row.target.id === target.materialId));
}

export type OfflineLibraryData = {
  metadata: NativeOfflineMetadataSnapshot | null;
  saved: readonly OfflineReadingSummary[];
};

export function offlineLibraryScopeKey(scope: NativeOfflineScope | null, verifiedUntil: number, now: number) {
  return scope && verifiedUntil > now
    ? JSON.stringify([scope.origin, scope.accountId, scope.sessionId, scope.locale, verifiedUntil])
    : null;
}

export function projectOfflineLibrary({ metadata, saved }: OfflineLibraryData, now: number, verifiedUntil: number) {
  const rows: OfflineLibraryRow[] = [];
  let expires = verifiedUntil;
  let expired = false;
  if (verifiedUntil <= now || !metadata) return { rows, expires, expired };

  const availablePackages = new Map(saved.map(item => [item.key, item]));
  for (const course of metadata.courses) {
    const expiresAt = Math.min(verifiedUntil, course.leaseExpiresAt, course.manifestLeaseExpiresAt ?? 0);
    if (expiresAt <= now) {
      expired ||= course.manifestLeaseExpiresAt !== undefined;
      continue;
    }
    expires = Math.min(expires, expiresAt);
    for (const item of course.materials) {
      if ((item.kind !== "article" && item.kind !== "diktat") || item.courseId !== course.id) continue;
      const entry = availablePackages.get(item.key);
      const matchingPackage = entry && entry.revision === item.revision && entry.courseId === course.id
        && entry.kind === item.kind && entry.id === item.id;
      const savedUntil = matchingPackage ? Math.min(entry.leaseExpiresAt, expiresAt) : 0;
      if (savedUntil > now) expires = Math.min(expires, savedUntil);
      rows.push({ key: item.key, revision: item.revision, target: { kind: item.kind, courseId: course.id, id: item.id },
        title: item.title, courseTitle: course.title, availableUntil: expiresAt, savedUntil: savedUntil > now ? savedUntil : null });
    }
  }
  expired ||= metadata.knownCourseIds.length > metadata.courses.length;
  // Keep the manifest order within both groups so positions stay stable after a refresh.
  rows.sort((a, b) => Number(Boolean(b.savedUntil)) - Number(Boolean(a.savedUntil)));
  return { rows, expires, expired };
}

export function filterOfflineLibrary(rows: OfflineLibraryRow[], query: string, locale: NativeOfflineLocale) {
  const normalize = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase(locale);
  const search = normalize(query.trim());
  return search ? rows.filter(row => normalize(`${row.title} ${row.courseTitle}`).includes(search)) : rows;
}

export const offlineLibraryCopy = {
  id: {
    loading: "Memuat bacaan…", retry: "Coba lagi", failure: "Daftar bacaan belum dapat dimuat.",
    signIn: "Masuk", signInTitle: "Masuk untuk melihat bacaan Anda", denied: "Bacaan offline tersedia untuk murid.",
    unsupported: "Unduhan bacaan tersedia di Android dan iOS.", noReadings: "Belum ada bacaan tersedia",
    connectToDownload: "Hubungkan ke internet untuk mengunduh bacaan.",
    syncFailed: "Daftar bacaan belum berhasil diperbarui.",
    removeTitle: "Hapus unduhan?", removing: "Menghapus…", removed: "Unduhan dihapus.",
    removeUnavailable: "Hapus unduhan yang tidak tersedia",
    removeUnavailableTitle: "Hapus unduhan yang tidak tersedia?",
    removeUnavailableBody: "Anda dapat mengunduhnya kembali saat akses tersedia.",
    revalidationFailed: "Ada unduhan yang belum dapat diperbarui.",
    retryOperation: "Tindakan belum berhasil. Coba lagi.", tooLarge: "Bacaan ini melampaui batas ukuran unduhan.",
    unsupportedReading: "Bacaan ini belum dapat diunduh.", changed: "Bacaan berubah. Perbarui daftar lalu coba lagi.",
    back: "Kembali", allReadings: "Semua bacaan",
  },
  en: {
    loading: "Loading readings…", retry: "Try again", failure: "Could not load the reading list.",
    signIn: "Sign in", signInTitle: "Sign in to see your readings", denied: "Offline readings are available to students.",
    unsupported: "Reading downloads are available on Android and iOS.", noReadings: "No readings available yet",
    connectToDownload: "Connect to the internet to download readings.",
    syncFailed: "Could not update the reading list.",
    removeTitle: "Remove download?", removing: "Removing…", removed: "Download removed.",
    removeUnavailable: "Remove unavailable downloads",
    removeUnavailableTitle: "Remove unavailable downloads?",
    removeUnavailableBody: "You can download them again when access is available.",
    revalidationFailed: "Some downloads could not be updated.",
    retryOperation: "Something went wrong. Try again.", tooLarge: "This reading exceeds the download size limit.",
    unsupportedReading: "This reading cannot be downloaded yet.", changed: "The reading has changed. Refresh the list and try again.",
    back: "Back", allReadings: "All readings",
  },
} as const;

export function offlineLibraryFeedback(locale: NativeOfflineLocale, status: OfflineReadingDownloadStatus | "removed") {
  const shared = OFFLINE_LIBRARY_COPY[locale];
  const copy = offlineLibraryCopy[locale];
  switch (status) {
    case "saved": return { message: shared.saved, error: false };
    case "removed": return { message: copy.removed, error: false };
    case "cancelled": return null;
    case "unavailable": return { message: shared.unavailable, error: true };
    case "storage-full": return { message: shared.storageFailed, error: true };
    case "too-large": return { message: copy.tooLarge, error: true };
    case "unsupported": return { message: copy.unsupportedReading, error: true };
    case "changed": return { message: copy.changed, error: true };
    case "retry": return { message: copy.retryOperation, error: true };
  }
}

export function offlineDocumentHref(locale: NativeOfflineLocale, { kind, id, courseId }: OfflineReadingTarget, section?: string) {
  return { pathname: "/offline" as const, params: {
    locale, courseId, materialId: id, read: kind, ...(section ? { section } : {}),
  } };
}

/** The store verifies the current account, session and course grants before returning bytes. */
export function readableLibraryPackage(row: OfflineLibraryRow, saved: OfflineReadingSummary, now: number) {
  return !!row.savedUntil && Math.min(row.savedUntil, row.availableUntil, saved.leaseExpiresAt) > now &&
    row.key === saved.key && row.revision === saved.revision && row.target.id === saved.id &&
    row.target.courseId === saved.courseId && row.target.kind === saved.kind;
}
