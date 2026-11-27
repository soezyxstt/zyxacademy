import type { NativeSessionScope, NativeSessionTransport } from "../network/transport";
import type { PhotoImageIssue, PhotoOutputPolicy, PhotoPreparation, PickerPhoto, PreparedPhoto } from "./photo-image";

export const DRAFT_PHOTO_RECOVERY_TTL_MS = 15 * 60 * 1000;

export type PhotoSource = "camera" | "library";
export type PhotoSession = Pick<NativeSessionTransport, "scope" | "isCurrent">;

export type PhotoDraftTarget = Readonly<{
  route: string;
  locale: "id" | "en";
  draftId: string;
}>;

export type PhotoDraftRequest = {
  session: PhotoSession;
  target: PhotoDraftTarget;
  output?: PhotoOutputPolicy;
  discardOnRestore?: true;
  isDraftCurrent(): boolean;
};

type PhotoBinding = Readonly<{ scope: NativeSessionScope; target: PhotoDraftTarget }>;

type PendingPhoto = PhotoBinding & { version: 1; createdAt: number; id: string; recoverable: boolean; discardOnRestore?: true };
const orphanedRecord = JSON.stringify({ version: 0 });
const orphanedFormRecord = JSON.stringify({ version: 0, kind: "form-camera" });

export type DraftPhoto = PreparedPhoto & PhotoBinding & {
  name: string;
  release(): void;
};

export type PhotoOutcome =
  | { status: "ready"; photo: DraftPhoto; recovered: boolean }
  | { status: "permission-denied"; canAskAgain: boolean }
  | { status: "error"; issue: "storage" | "picker" | PhotoImageIssue }
  | { status: "cancelled" | "busy" | "no-pending" | "stale" | "unavailable" };

export type PhotoPickerResult =
  | { status: "selected"; asset: PickerPhoto }
  | { status: "cancelled" }
  | { status: "error" };

type PhotoDevice = {
  available: boolean;
  supportsRecovery: boolean;
  checkCameraPermission(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestCameraPermission(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  launch(source: PhotoSource): Promise<PhotoPickerResult>;
  getPending(): Promise<PhotoPickerResult | null>;
  prepare(asset: PickerPhoto, output?: PhotoOutputPolicy): Promise<PhotoPreparation>;
  discard(uri: string): void;
};

type PendingStore = {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
};

function isIdentity(value: unknown): value is string {
  return typeof value === "string" && /^[\w:.-]{1,192}$/.test(value);
}

function isScope(scope: Partial<NativeSessionScope> | undefined): scope is NativeSessionScope {
  if (!scope || !isIdentity(scope.accountId) || !isIdentity(scope.sessionId) || typeof scope.origin !== "string") return false;
  try {
    const origin = new URL(scope.origin);
    return origin.protocol === "https:" && origin.origin === scope.origin;
  } catch {
    return false;
  }
}

function isRoute(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 1024 || !value.startsWith("/") || value.startsWith("//")
    || /[\\#\s\u0000-\u001f\u007f]/.test(value)) return false;
  const path = value.split("?", 1)[0];
  return !/(?:^|\/)(?:\.|\.\.)(?:\/|$)|%(?:2e|2f|5c|00)/i.test(path);
}

function isTarget(target: Partial<PhotoDraftTarget> | undefined): target is PhotoDraftTarget {
  return Boolean(target && isRoute(target.route) && isIdentity(target.draftId)
    && (target.locale === "id" || target.locale === "en"));
}

function sameScope(left: NativeSessionScope, right: NativeSessionScope): boolean {
  return left.origin === right.origin && left.accountId === right.accountId && left.sessionId === right.sessionId;
}

function sameTarget(left: PhotoDraftTarget, right: PhotoDraftTarget): boolean {
  return left.route === right.route && left.locale === right.locale && left.draftId === right.draftId;
}

function isCurrent(binding: PhotoBinding, request: PhotoDraftRequest): boolean {
  return request.session.isCurrent() && sameScope(binding.scope, request.session.scope)
    && sameTarget(binding.target, request.target) && request.isDraftCurrent();
}

export function belongsToPhotoDraft(photo: DraftPhoto, request: PhotoDraftRequest): boolean {
  return isCurrent(photo, request);
}

function isFresh(createdAt: unknown, now: number): createdAt is number {
  return typeof createdAt === "number" && Number.isSafeInteger(createdAt)
    && createdAt <= now + 60_000 && now - createdAt <= DRAFT_PHOTO_RECOVERY_TTL_MS;
}

function parsePending(value: string | null): PendingPhoto | null {
  if (!value) return null;
  try {
    const pending = JSON.parse(value) as Partial<PendingPhoto> | null;
    return pending?.version === 1 && typeof pending.recoverable === "boolean"
      && isIdentity(pending.id) && typeof pending.createdAt === "number" && Number.isSafeInteger(pending.createdAt)
      && isScope(pending.scope) && isTarget(pending.target) ? pending as PendingPhoto : null;
  } catch {
    return null;
  }
}

function discardOnRestore(pending: PendingPhoto): boolean {
  // Existing versions identified form uploads by the canonical route and question draft ID.
  return pending.discardOnRestore === true ||
    (/^\/(?:forms|f)\/[^/?]+$/.test(pending.target.route) && /:q[1-9]\d*$/.test(pending.target.draftId));
}

function readPending(value: string | null, now: number): PendingPhoto | null {
  const pending = parsePending(value);
  return pending && isFresh(pending.createdAt, now) ? pending : null;
}

export function createDraftPhotoController({
  device,
  store,
  createId,
  now = Date.now,
}: {
  device: PhotoDevice;
  store: PendingStore;
  createId(): string;
  now?(): number;
}) {
  let busy = false;
  let cleanup: Promise<void> | null = null;
  let cleanAfterPicker = false;

  function draftRequest(request: PhotoDraftRequest): PendingPhoto | null {
    const { session, target } = request;
    if (!session.isCurrent() || !request.isDraftCurrent() || !isScope(session.scope) || !isTarget(target)) return null;
    return {
      version: 1, scope: { ...session.scope }, target: { ...target },
      id: createId(), createdAt: now(), recoverable: true, discardOnRestore: request.discardOnRestore,
    };
  }

  function discardResult(result: PhotoPickerResult | null) {
    if (result?.status === "selected") device.discard(result.asset.uri);
  }

  function discardOrphanedFormCapture(): Promise<void> {
    if (!device.available || !device.supportsRecovery) return Promise.resolve();
    if (busy) {
      cleanAfterPicker = true;
      return Promise.resolve();
    }
    if (cleanup) return cleanup;
    cleanup = (async () => {
      const raw = await store.read();
      const pending = parsePending(raw);
      if (raw !== orphanedFormRecord && (!pending || !discardOnRestore(pending))) return;
      // This draft cannot be recovered, so the discard marker needs no account or draft identity.
      if (raw !== orphanedFormRecord) await store.write(orphanedFormRecord);
      const result = await device.getPending();
      // An activity can deliver its result after the first foreground read.
      // Keep the scoped record so the next attempt can discard that result.
      if (result === null) return;
      discardResult(result);
      await store.remove();
    })().catch(() => {
      // Keep the record for a later foreground attempt when storage or the SDK fails.
    }).finally(() => { cleanup = null; });
    return cleanup;
  }

  function finishPicker() {
    busy = false;
    if (cleanAfterPicker) {
      cleanAfterPicker = false;
      void discardOrphanedFormCapture();
    }
  }

  async function finalize(
    result: PhotoPickerResult,
    binding: PendingPhoto,
    request: PhotoDraftRequest,
    recovered: boolean,
  ): Promise<PhotoOutcome> {
    if (!isCurrent(binding, request) || !isFresh(binding.createdAt, now())) {
      discardResult(result);
      return { status: "stale" };
    }
    if (result.status === "cancelled") return { status: "cancelled" };
    if (result.status === "error") return { status: "error", issue: "picker" };
    try {
      const normalized = await device.prepare(result.asset, request.output);
      if ("issue" in normalized) {
        return isCurrent(binding, request) ? { status: "error", issue: normalized.issue } : { status: "stale" };
      }
      const { photo } = normalized;
      if (!isCurrent(binding, request) || !isFresh(binding.createdAt, now())) {
        device.discard(photo.uri);
        return { status: "stale" };
      }
      const extension = photo.mimeType === "image/png" ? "png" : "jpg";
      return {
        status: "ready",
        recovered,
        photo: {
          ...photo,
          scope: binding.scope,
          target: binding.target,
          name: `foto-soal-${binding.id}.${extension}`,
          release: () => device.discard(photo.uri),
        },
      };
    } finally {
      discardResult(result);
    }
  }

  async function pick(source: PhotoSource, request: PhotoDraftRequest): Promise<PhotoOutcome> {
    if (!device.available) return { status: "unavailable" };
    while (cleanup) await cleanup;
    if (busy) return { status: "busy" };
    const binding = draftRequest(request);
    if (!binding) return { status: "stale" };
    busy = true;
    try {
      if (source === "camera") {
        let permission = await device.checkCameraPermission();
        if (!isCurrent(binding, request)) return { status: "stale" };
        if (!permission.granted && permission.canAskAgain) permission = await device.requestCameraPermission();
        if (!isCurrent(binding, request)) return { status: "stale" };
        if (!permission.granted) return { status: "permission-denied", canAskAgain: permission.canAskAgain };
      }
      if (device.supportsRecovery) {
        // The SDK pending result is process-wide and carries no draft identity.
        // Consume any old result before recording the newly authorized launch.
        let previous: string | null;
        try {
          previous = await store.read();
        } catch {
          return { status: "error", issue: "storage" };
        }
        const oldResult = await device.getPending();
        discardResult(oldResult);
        // A previous activity can complete after a null read. A live launch
        // is still safe, but its unlabelled pending result would be ambiguous.
        binding.recoverable = previous === null || oldResult !== null;
        if (!isCurrent(binding, request)) return { status: "stale" };
        try {
          await store.write(JSON.stringify(binding));
          if (!isCurrent(binding, request)) {
            await store.remove();
            return { status: "stale" };
          }
        } catch {
          return { status: "error", issue: "storage" };
        }
      }

      const result = await device.launch(source).catch((): PhotoPickerResult => ({ status: "error" }));
      if (device.supportsRecovery) {
        if (result.status === "error" && discardOnRestore(binding)) {
          // The Android contract may still deliver a result after a failed launch promise.
          cleanAfterPicker = true;
          return await finalize(result, binding, request, false);
        }
        try {
          await store.remove();
        } catch {
          discardResult(result);
          return { status: "error", issue: "storage" };
        }
      }
      return await finalize(result, binding, request, false);
    } catch {
      return { status: "error", issue: "picker" };
    } finally {
      finishPicker();
    }
  }

  async function recover(request: PhotoDraftRequest): Promise<PhotoOutcome> {
    if (!device.available || !device.supportsRecovery) return { status: "unavailable" };
    while (cleanup) await cleanup;
    if (busy) return { status: "busy" };
    const binding = draftRequest(request);
    if (!binding) return { status: "stale" };
    busy = true;
    try {
      const raw = await store.read();
      if (!isCurrent(binding, request)) return { status: "stale" };
      if (raw === null || raw === orphanedFormRecord) return { status: "no-pending" };
      const stored = parsePending(raw);
      if (stored && discardOnRestore(stored)) return { status: "no-pending" };
      const pending = stored && isFresh(stored.createdAt, now()) ? stored : null;
      if (pending?.recoverable && sameScope(pending.scope, binding.scope) && !sameTarget(pending.target, binding.target)) {
        return { status: "no-pending" };
      }
      const result = await device.getPending().catch((): PhotoPickerResult => ({ status: "error" }));
      if (result === null) {
        if (!pending || !sameScope(pending.scope, binding.scope)) await store.write(orphanedRecord);
        return { status: "no-pending" };
      }
      try {
        await store.remove();
      } catch {
        discardResult(result);
        return { status: "error", issue: "storage" };
      }
      if (!pending?.recoverable || !sameScope(pending.scope, binding.scope)) {
        discardResult(result);
        return { status: "no-pending" };
      }
      return await finalize(result, pending, request, true);
    } catch {
      return { status: "error", issue: "storage" };
    } finally {
      finishPicker();
    }
  }

  return {
    pick,
    recover,
    discardOrphanedFormCapture,
    async getPendingTarget(session: PhotoSession): Promise<PhotoDraftTarget | null> {
      if (!device.available || !device.supportsRecovery || busy || !session.isCurrent()) return null;
      try {
        const pending = readPending(await store.read(), now());
        return pending?.recoverable && !discardOnRestore(pending) && session.isCurrent() && sameScope(pending.scope, session.scope)
          ? pending.target : null;
      } catch {
        return null;
      }
    },
  };
}
