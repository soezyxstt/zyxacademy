/**
 * lib/zyra/drawer-persistence.ts
 *
 * Persists Zyra AI drawer state (open flag, active chat session ID, and
 * unsent prompt / work-step drafts) per course and account so OS WebView
 * reloads or brief app backgrounding restore the active conversation.
 */

import {
  readPersistentDraft,
  removePersistentDraft,
  writePersistentDraft,
} from "@/hooks/use-persistent-draft";

const STORAGE_VERSION = 1;
export const ZYRA_DRAWER_STATE_TTL_MS = 24 * 60 * 60 * 1000;

export interface PersistedZyraDrawerDraft {
  inputVal: string;
  workStep: string;
  sessionId: string | null;
  updatedAt: number;
}

export interface PersistedZyraDrawerOpen {
  isOpen: boolean;
  updatedAt: number;
}

export function getZyraDrawerDraftKey(accountId: string, courseId: string): string {
  return `zyx:zyra-drawer:v${STORAGE_VERSION}:${accountId}:${courseId}`;
}

export function getZyraDrawerOpenKey(courseId: string): string {
  return `zyx:zyra-drawer-open:v${STORAGE_VERSION}:${courseId}`;
}

export function validatePersistedZyraDrawerDraft(
  raw: unknown,
  now = Date.now(),
): PersistedZyraDrawerDraft | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.inputVal !== "string" || typeof record.workStep !== "string") {
    return null;
  }
  const sessionId =
    typeof record.sessionId === "string" && record.sessionId.trim().length > 0
      ? record.sessionId.trim()
      : null;
  const updatedAt =
    typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : now;

  if (now - updatedAt > ZYRA_DRAWER_STATE_TTL_MS || now - updatedAt < -60_000) {
    return null;
  }
  if (!record.inputVal.trim() && !record.workStep.trim() && !sessionId) {
    return null;
  }

  return {
    inputVal: record.inputVal,
    workStep: record.workStep,
    sessionId,
    updatedAt,
  };
}

export function readPersistedZyraDrawerDraft(
  accountId: string | null | undefined,
  courseId: string | null | undefined,
  now = Date.now(),
): PersistedZyraDrawerDraft | null {
  if (!accountId || !courseId) return null;
  const envelope = readPersistentDraft<PersistedZyraDrawerDraft>(
    getZyraDrawerDraftKey(accountId, courseId),
    STORAGE_VERSION,
    "local",
    (raw) => validatePersistedZyraDrawerDraft(raw, now),
  );
  return envelope?.data ?? null;
}

export function savePersistedZyraDrawerDraft(
  accountId: string | null | undefined,
  courseId: string | null | undefined,
  state: { inputVal: string; workStep: string; sessionId: string | null },
  now = Date.now(),
): void {
  if (!accountId || !courseId) return;
  const key = getZyraDrawerDraftKey(accountId, courseId);
  const hasContent =
    state.inputVal.trim().length > 0 ||
    state.workStep.trim().length > 0 ||
    Boolean(state.sessionId);
  if (!hasContent) {
    removePersistentDraft(key, "local");
    return;
  }
  writePersistentDraft<PersistedZyraDrawerDraft>(
    key,
    STORAGE_VERSION,
    {
      inputVal: state.inputVal,
      workStep: state.workStep,
      sessionId: state.sessionId,
      updatedAt: now,
    },
    "local",
  );
}

export function readPersistedZyraDrawerOpen(
  courseId: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!courseId) return false;
  const envelope = readPersistentDraft<PersistedZyraDrawerOpen>(
    getZyraDrawerOpenKey(courseId),
    STORAGE_VERSION,
    "local",
    (raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const record = raw as Record<string, unknown>;
      if (record.isOpen !== true) return null;
      const updatedAt =
        typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
          ? record.updatedAt
          : now;
      if (now - updatedAt > ZYRA_DRAWER_STATE_TTL_MS || now - updatedAt < -60_000) {
        return null;
      }
      return { isOpen: true, updatedAt };
    },
  );
  return Boolean(envelope?.data.isOpen);
}

export function savePersistedZyraDrawerOpen(
  courseId: string | null | undefined,
  isOpen: boolean,
  now = Date.now(),
): void {
  if (!courseId) return;
  const key = getZyraDrawerOpenKey(courseId);
  if (!isOpen) {
    removePersistentDraft(key, "local");
    return;
  }
  writePersistentDraft<PersistedZyraDrawerOpen>(
    key,
    STORAGE_VERSION,
    { isOpen: true, updatedAt: now },
    "local",
  );
}

export function clearPersistedZyraDrawerOpenFlags(): void {
  if (typeof window === "undefined") return;
  try {
    const prefix = `zyx:zyra-drawer-open:v${STORAGE_VERSION}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) keysToRemove.push(k);
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
    }
  } catch {
    // Ignore restricted storage errors.
  }
}
