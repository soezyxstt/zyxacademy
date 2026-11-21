/**
 * lib/offline/reading-position.ts
 *
 * Persists and restores reading scroll and section position across online and
 * offline reading sessions (web localStorage, Capacitor native store, Tauri).
 */

import { getCapacitor, getTauri } from "@/lib/native/runtime";

export const READING_POSITION_STORAGE_PREFIX = "zyx:offline-reading-pos:";

export interface OfflineReadingPosition {
  key: string;
  sectionSlug?: string | null;
  sectionIndex?: number;
  scrollY: number;
  scrollRatio: number;
  updatedAt: number;
}

export function buildOfflineReadingKey(
  userId: string,
  courseId: string,
  materialId: string,
): string {
  return `${userId}::${courseId}::${materialId}`;
}

export function clampScrollRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(1, ratio));
}

export function computeScrollRatio(
  scrollY: number,
  scrollHeight: number,
  viewportHeight: number,
): number {
  const maxScroll = Math.max(0, scrollHeight - viewportHeight);
  if (maxScroll <= 0) return 0;
  return clampScrollRatio(scrollY / maxScroll);
}

export function resolveRestoredScrollY(
  position: Pick<OfflineReadingPosition, "scrollY" | "scrollRatio">,
  scrollHeight: number,
  viewportHeight: number,
): number {
  const maxScroll = Math.max(0, scrollHeight - viewportHeight);
  if (maxScroll <= 0) return 0;
  if (Number.isFinite(position.scrollRatio) && position.scrollRatio > 0) {
    return Math.round(clampScrollRatio(position.scrollRatio) * maxScroll);
  }
  if (Number.isFinite(position.scrollY) && position.scrollY > 0) {
    return Math.min(maxScroll, Math.round(position.scrollY));
  }
  return 0;
}

export function normalizeReadingPosition(
  raw: unknown,
  fallbackKey?: string,
): OfflineReadingPosition | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const key = typeof obj.key === "string" && obj.key.trim() ? obj.key : (fallbackKey ?? "");
  if (!key) return null;

  const scrollY = typeof obj.scrollY === "number" && Number.isFinite(obj.scrollY)
    ? Math.max(0, Math.round(obj.scrollY))
    : 0;
  const scrollRatio = typeof obj.scrollRatio === "number" && Number.isFinite(obj.scrollRatio)
    ? clampScrollRatio(obj.scrollRatio)
    : 0;
  const updatedAt = typeof obj.updatedAt === "number" && Number.isFinite(obj.updatedAt)
    ? obj.updatedAt
    : 0;
  const sectionSlug = typeof obj.sectionSlug === "string" && obj.sectionSlug.trim()
    ? obj.sectionSlug.trim()
    : null;
  const sectionIndex = typeof obj.sectionIndex === "number" && Number.isInteger(obj.sectionIndex) && obj.sectionIndex >= 0
    ? obj.sectionIndex
    : undefined;

  return {
    key,
    sectionSlug,
    sectionIndex,
    scrollY,
    scrollRatio,
    updatedAt,
  };
}

export function pickLatestReadingPosition(
  a: OfflineReadingPosition | null | undefined,
  b: OfflineReadingPosition | null | undefined,
): OfflineReadingPosition | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}

export function loadOfflineReadingPosition(key: string): OfflineReadingPosition | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage?.getItem(`${READING_POSITION_STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    return normalizeReadingPosition(JSON.parse(raw), key);
  } catch {
    return null;
  }
}

export function saveOfflineReadingPosition(position: OfflineReadingPosition): void {
  const normalized = normalizeReadingPosition(position, position.key);
  if (!normalized) return;

  const serialized = JSON.stringify(normalized);

  if (typeof window !== "undefined") {
    try {
      window.localStorage?.setItem(
        `${READING_POSITION_STORAGE_PREFIX}${normalized.key}`,
        serialized,
      );
    } catch {
      // Quota or private mode
    }
  }

  try {
    const capStore = getCapacitor()?.Plugins?.ZyxOfflineStore;
    if (capStore?.saveReadingPosition) {
      void capStore
        .saveReadingPosition({
          key: normalized.key,
          positionJson: serialized,
        })
        .catch(() => {});
    }
  } catch {
    // Non-fatal
  }

  try {
    const tauriInvoke = getTauri()?.core?.invoke;
    if (tauriInvoke) {
      void tauriInvoke("save_offline_reading_position", {
        key: normalized.key,
        positionJson: serialized,
      }).catch(() => {});
    }
  } catch {
    // Non-fatal
  }
}

export function removeOfflineReadingPosition(key: string): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage?.removeItem(`${READING_POSITION_STORAGE_PREFIX}${key}`);
  } catch {
    // Non-fatal
  }
}
