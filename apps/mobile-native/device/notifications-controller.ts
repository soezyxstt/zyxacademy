import type { NativeRequestInit, NativeSessionTransport } from "../network/transport";

const registrationPath = "/api/notifications/register-token";
const requestTimeoutMs = 8_000;

export type NativePushPermission = {
  status: "granted" | "prompt" | "denied" | "unsupported";
  canAskAgain: boolean;
};

type NativePushPlatform =
  | { platform: "android"; transport: "fcm" }
  | { platform: "ios"; transport: "apns" };

export type NativePushStatus = NativePushPermission & {
  registered: boolean;
  transportActive: boolean;
};

export type NativePushSession = Pick<NativeSessionTransport, "scope" | "isCurrent"> & {
  // Bound to this session and origin, even while the host is switching accounts.
  request(
    path: string,
    init: Pick<NativeRequestInit, "signal"> & {
      method: "POST" | "DELETE";
      headers: Record<string, string>;
      body: string;
    },
  ): Promise<{ ok: boolean; json(): Promise<unknown>; dispose?(): void }>;
};

export type NativePushDevice = {
  registration: (NativePushPlatform & { device: string }) | null;
  getPermission(): Promise<NativePushPermission>;
  requestPermission(canPrompt: () => boolean): Promise<NativePushPermission | null>;
  getToken(): Promise<string | null>;
  onToken(listener: (token: string) => void): () => void;
  clearNotifications(): Promise<void>;
};

type ActiveAccount = {
  session: NativePushSession;
  permission: NativePushPermission | null;
  latestToken: string | null;
  tokenRevision: number;
  registeredToken: string | null;
  transportActive: boolean;
  attemptedTokens: Set<string>;
  stopTokenListener?: () => void;
  pending?: Promise<NativePushStatus | null>;
  requestingPermission: boolean;
};

const unsupportedPermission: NativePushPermission = { status: "unsupported", canAskAgain: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function sameSession(left: NativePushSession, right: NativePushSession): boolean {
  return left.scope.origin === right.scope.origin
    && left.scope.accountId === right.scope.accountId
    && left.scope.sessionId === right.scope.sessionId;
}

function canRegister(
  registration: NativePushDevice["registration"],
  token: string | null,
): token is string {
  if (!registration || !token) return false;
  if (registration.transport === "apns") return /^[a-f0-9]{64,512}$/i.test(token);
  return token.length >= 64 && token.length <= 4096 && !/\s/.test(token)
    && !/^(ExponentPushToken|ExpoPushToken)\[/.test(token);
}

export function createNativePushController(
  device: NativePushDevice,
  onStatusChange?: (status: NativePushStatus | null) => void,
) {
  let account: ActiveAccount | null = null;
  let disposed = false;
  let writes = Promise.resolve<unknown>(undefined);

  const current = (candidate: ActiveAccount) => account === candidate && candidate.session.isCurrent();

  function enqueue<T>(write: () => Promise<T>): Promise<T> {
    const result = writes.then(write);
    writes = result.catch(() => {});
    return result;
  }

  function getStatus(): NativePushStatus | null {
    if (!account?.permission || !current(account)) return null;
    const registered = account.registeredToken !== null && account.registeredToken === account.latestToken;
    return { ...account.permission, registered, transportActive: registered && account.transportActive };
  }

  async function writeRegistration(
    session: NativePushSession,
    method: "POST" | "DELETE",
    payload: { token: string },
  ) {
    if (!session.isCurrent()) return null;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await session.request(registrationPath, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      try {
        if (!response.ok) return null;
        const value = await response.json();
        return isRecord(value) && value.success === true ? value : null;
      } finally {
        response.dispose?.();
      }
    } catch {
      return null;
    } finally {
      clearTimeout(deadline);
    }
  }

  function registerToken(candidate: ActiveAccount, token: string): Promise<void> {
    const registration = device.registration;
    return enqueue(async () => {
      if (!registration || !current(candidate) || candidate.permission?.status !== "granted") return;
      if (candidate.latestToken !== token || (candidate.registeredToken === token && candidate.transportActive)) return;

      // A failed response can follow a successful write. Keep the token available
      // for logout cleanup until the server confirms registration or deletion.
      if (candidate.registeredToken !== token) {
        candidate.registeredToken = null;
        candidate.transportActive = false;
      }
      candidate.attemptedTokens.add(token);
      const result = await writeRegistration(candidate.session, "POST", { ...registration, token });
      if (result?.registered !== true || result.transport !== registration.transport
        || result.platform !== registration.platform || typeof result.transportActive !== "boolean") return;

      // The server removes older tokens for this same session and transport.
      candidate.attemptedTokens.clear();
      candidate.attemptedTokens.add(token);
      candidate.registeredToken = token;
      candidate.transportActive = result.transportActive;
      if (current(candidate)) onStatusChange?.(getStatus());
    });
  }

  async function removeTokens(candidate: ActiveAccount, session = candidate.session): Promise<boolean> {
    candidate.latestToken = null;
    candidate.registeredToken = null;
    candidate.transportActive = false;
    for (const token of candidate.attemptedTokens) {
      if (await writeRegistration(session, "DELETE", { token })) {
        candidate.attemptedTokens.delete(token);
      }
    }
    return candidate.attemptedTokens.size === 0;
  }

  async function syncAccount(candidate: ActiveAccount, canPrompt?: () => boolean) {
    try {
      const permission = await device.getPermission();
      if (!current(candidate)) return null;
      const mayPrompt = () => current(candidate) && canPrompt?.() === true;
      const resolved = permission.canAskAgain && permission.status !== "granted" && mayPrompt()
        ? await device.requestPermission(mayPrompt) ?? permission
        : permission;
      if (!current(candidate)) return null;
      candidate.permission = resolved;
      onStatusChange?.(getStatus());
      if (resolved.status !== "granted") {
        candidate.stopTokenListener?.();
        candidate.stopTokenListener = undefined;
        await enqueue(() => removeTokens(candidate));
        if (!current(candidate)) return null;
        const status = getStatus();
        onStatusChange?.(status);
        return status;
      }

      const tokenRevision = candidate.tokenRevision;
      candidate.stopTokenListener ??= device.onToken(token => {
        if (current(candidate) && candidate.permission?.status === "granted" && canRegister(device.registration, token)) {
          candidate.latestToken = token;
          candidate.tokenRevision += 1;
          onStatusChange?.(getStatus());
          void registerToken(candidate, token);
        }
      });
      const observedToken = await device.getToken();
      if (!current(candidate)) return null;
      // Prefer the token reported by a rotation event during this native read.
      const token = candidate.tokenRevision !== tokenRevision ? candidate.latestToken : observedToken;
      if (canRegister(device.registration, token)) {
        candidate.latestToken = token;
        onStatusChange?.(getStatus());
        await registerToken(candidate, token);
      }
    } catch {
      // Native credentials or the OS service may be unavailable on this build.
      candidate.permission ??= unsupportedPermission;
      if (current(candidate)) onStatusChange?.(getStatus());
    }
    return current(candidate) ? getStatus() : null;
  }

  function sync(canPrompt?: () => boolean): Promise<NativePushStatus | null> {
    const candidate = account;
    if (!candidate || !current(candidate) || !device.registration) return Promise.resolve(getStatus());
    if (candidate.pending && (!canPrompt || candidate.requestingPermission)) return candidate.pending;

    const previous = candidate.pending;
    candidate.requestingPermission = canPrompt !== undefined;
    const pending = (async () => {
      await previous;
      return current(candidate) ? syncAccount(candidate, canPrompt) : null;
    })().finally(() => {
      if (candidate.pending === pending) candidate.pending = undefined;
    });
    candidate.pending = pending;
    return pending;
  }

  function setAccount(session: NativePushSession | null, cleanupSession?: NativePushSession): Promise<boolean> {
    if (disposed) return Promise.resolve(false);
    const previous = account;
    if (previous && session && current(previous) && sameSession(previous.session, session)) {
      return Promise.resolve(true);
    }
    previous?.stopTokenListener?.();
    account = session && session.isCurrent() ? {
      session,
      permission: device.registration ? null : unsupportedPermission,
      latestToken: null,
      tokenRevision: 0,
      registeredToken: null,
      transportActive: false,
      attemptedTokens: new Set(),
      requestingPermission: false,
    } : null;
    onStatusChange?.(getStatus());
    const cleanup = enqueue(async () => {
      if (!previous) return true;
      // Remove delivered alerts before a different account can see them.
      await device.clearNotifications().catch(() => {});
      const outgoing = cleanupSession && sameSession(previous.session, cleanupSession)
        ? cleanupSession
        : previous.session;
      return removeTokens(previous, outgoing);
    });
    void sync();
    return cleanup;
  }

  return {
    getStatus,
    setAccount,
    sync: () => sync(),
    requestPermission: (canPrompt: () => boolean = () => true) => sync(canPrompt),
    dispose() {
      disposed = true;
      account?.stopTokenListener?.();
      account = null;
    },
  };
}
