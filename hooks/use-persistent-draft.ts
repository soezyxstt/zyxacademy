"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export type DraftStorageKind = "local" | "session";

export interface PersistentDraftEnvelope<T> {
  version: number;
  updatedAt: number;
  data: T;
}

export interface UsePersistentDraftOptions<T> {
  key: string;
  version: number;
  initialValue: T;
  storage?: DraftStorageKind;
  /** When false, defers reading and writing storage until the key is ready (e.g. session resolved). */
  enabled?: boolean;
  /** Optional validator or migrator for stored data. Return null to discard invalid payloads. */
  validate?: (raw: unknown) => T | null;
  /** Optional check to remove stored draft when value is empty or reset. */
  isEmpty?: (value: T) => boolean;
  /** Debounce delay in milliseconds before writing changes. Defaults to 150. */
  debounceMs?: number;
}

export interface UsePersistentDraftResult<T> {
  value: T;
  setValue: Dispatch<SetStateAction<T>>;
  hydrated: boolean;
  hasRestoredDraft: boolean;
  clearDraft: () => void;
  flushDraft: () => void;
}

export function getDraftStorage(kind: DraftStorageKind = "local"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function readPersistentDraft<T>(
  key: string,
  version: number,
  kind: DraftStorageKind = "local",
  validate?: (raw: unknown) => T | null
): PersistentDraftEnvelope<T> | null {
  const store = getDraftStorage(kind);
  if (!store) return null;

  let rawText: string | null = null;
  try {
    rawText = store.getItem(key);
  } catch {
    return null;
  }

  if (!rawText) return null;

  try {
    const parsed = JSON.parse(rawText) as Partial<PersistentDraftEnvelope<unknown>>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== version ||
      !("data" in parsed)
    ) {
      removePersistentDraft(key, kind);
      return null;
    }

    const validated = validate ? validate(parsed.data) : (parsed.data as T);
    if (validated === null) {
      removePersistentDraft(key, kind);
      return null;
    }

    return {
      version,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
      data: validated,
    };
  } catch {
    removePersistentDraft(key, kind);
    return null;
  }
}

export function writePersistentDraft<T>(
  key: string,
  version: number,
  data: T,
  kind: DraftStorageKind = "local"
): boolean {
  const store = getDraftStorage(kind);
  if (!store) return false;

  try {
    const envelope: PersistentDraftEnvelope<T> = {
      version,
      updatedAt: Date.now(),
      data,
    };
    const serialized = JSON.stringify(envelope);
    if (typeof serialized !== "string") return false;
    store.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

export function removePersistentDraft(
  key: string,
  kind: DraftStorageKind = "local"
): void {
  const store = getDraftStorage(kind);
  if (!store) return;

  try {
    store.removeItem(key);
  } catch {
    // Ignore storage removal errors in restricted browser contexts.
  }
}

/**
 * SSR-safe, versioned draft persistence hook for task-level state.
 * Restores stored drafts after hydration and flushes dirty drafts on unmount
 * so viewport switches or reloads preserve user input.
 */
export function usePersistentDraft<T>({
  key,
  version,
  initialValue,
  storage = "local",
  enabled = true,
  validate,
  isEmpty,
  debounceMs = 150,
}: UsePersistentDraftOptions<T>): UsePersistentDraftResult<T> {
  const [value, setValueState] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  const initialValueRef = useRef(initialValue);
  const validateRef = useRef(validate);
  const isEmptyRef = useRef(isEmpty);
  const latestValueRef = useRef(value);
  const activeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    initialValueRef.current = initialValue;
    validateRef.current = validate;
    isEmptyRef.current = isEmpty;
    latestValueRef.current = value;
  }, [initialValue, isEmpty, validate, value]);

  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingWrite = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const persistNow = useCallback(
    (nextValue: T) => {
      cancelPendingWrite();
      if (!enabled) return;
      if (isEmptyRef.current?.(nextValue)) {
        removePersistentDraft(key, storage);
        return;
      }
      writePersistentDraft(key, version, nextValue, storage);
    },
    [cancelPendingWrite, enabled, key, storage, version]
  );

  useEffect(() => {
    cancelPendingWrite();
    if (!enabled) {
      setHydrated(false);
      return;
    }

    const previousKey = activeKeyRef.current;
    activeKeyRef.current = key;

    // If the user already modified state while storage was deferred (!enabled),
    // preserve their in-memory edits and persist them to the newly resolved key.
    if (previousKey === null && dirtyRef.current) {
      setHydrated(true);
      persistNow(latestValueRef.current);
      return;
    }

    dirtyRef.current = false;
    const restored = readPersistentDraft(key, version, storage, validateRef.current);
    if (restored !== null) {
      latestValueRef.current = restored.data;
      setValueState(restored.data);
      setHasRestoredDraft(true);
    } else {
      latestValueRef.current = initialValueRef.current;
      setValueState(initialValueRef.current);
      setHasRestoredDraft(false);
    }
    setHydrated(true);
  }, [cancelPendingWrite, enabled, key, persistNow, storage, version]);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    dirtyRef.current = true;
    setValueState((prev) => {
      const resolved =
        typeof next === "function" ? (next as (previous: T) => T)(prev) : next;
      latestValueRef.current = resolved;
      return resolved;
    });
  }, []);

  useEffect(() => {
    if (!enabled || !hydrated || !dirtyRef.current) return;

    cancelPendingWrite();
    if (debounceMs <= 0) {
      persistNow(value);
      return;
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      persistNow(latestValueRef.current);
    }, debounceMs);

    return cancelPendingWrite;
  }, [cancelPendingWrite, debounceMs, enabled, hydrated, persistNow, value]);

  useEffect(() => {
    return () => {
      if (enabled && dirtyRef.current) {
        persistNow(latestValueRef.current);
      } else {
        cancelPendingWrite();
      }
    };
  }, [cancelPendingWrite, enabled, persistNow]);

  const clearDraft = useCallback(() => {
    cancelPendingWrite();
    dirtyRef.current = false;
    latestValueRef.current = initialValueRef.current;
    setValueState(initialValueRef.current);
    setHasRestoredDraft(false);
    removePersistentDraft(key, storage);
  }, [cancelPendingWrite, key, storage]);

  const flushDraft = useCallback(() => {
    dirtyRef.current = false;
    persistNow(latestValueRef.current);
  }, [persistNow]);

  return {
    value,
    setValue,
    hydrated,
    hasRestoredDraft,
    clearDraft,
    flushDraft,
  };
}
