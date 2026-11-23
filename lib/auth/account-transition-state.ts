/** Pause writers before the shared session cookie changes, including other open tabs. */
let pending = false;
const listeners = new Set<(pending: boolean) => void>();
const remoteListeners = new Set<(pending: boolean) => void>();
const remoteTransitions = new Map<string, ReturnType<typeof setTimeout>>();
let missedRemoteCommit = false;
const EVENT_KEY = "zyx-account-transition-v1";
const COMMIT_KEY = "zyx-account-change-v1";
const REDIRECT_KEY = "zyx-account-redirect-v1";
const source = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
  ? crypto.randomUUID() : Math.random().toString(36).slice(2);
type Message = { source: string; phase: "begin" | "commit" | "cancel"; at: number };
let channel: BroadcastChannel | undefined;
let initialCommit: string | null = null;
let lastNotified = false;
let lastRemoteNotified = false;

function notify() {
  const next = isAccountTransitionPending();
  if (next !== lastNotified) {
    lastNotified = next;
    for (const listener of listeners) {
      try { listener(next); } catch { /* One observer must not leave other writers running. */ }
    }
  }
  const remote = isRemoteAccountTransitionPending();
  if (remote !== lastRemoteNotified) {
    lastRemoteNotified = remote;
    for (const listener of remoteListeners) {
      try { listener(remote); } catch { /* Keep the other account boundaries active. */ }
    }
  }
}

function receive(data: unknown) {
  if (typeof data !== "object" || data === null) return;
  const message = data as Partial<Message>;
  if (typeof message.source !== "string" || message.source === source ||
      typeof message.at !== "number" || Math.abs(Date.now() - message.at) > 120_000) return;
  if (message.phase !== "begin" && message.phase !== "commit" && message.phase !== "cancel") return;
  const existing = remoteTransitions.get(message.source);
  if (existing) clearTimeout(existing);
  if (message.phase === "cancel") {
    remoteTransitions.delete(message.source);
    notify();
    return;
  }
  // A closed/crashed initiating tab must not leave this tab paused indefinitely.
  remoteTransitions.set(message.source, setTimeout(() => window.location.reload(), 120_000));
  notify();
  if (message.phase === "commit") window.location.reload();
}

function publish(phase: Message["phase"]) {
  if (typeof window === "undefined") return;
  const message: Message = { source, phase, at: Date.now() };
  try { channel?.postMessage(message); } catch { /* Use the storage-event fallback. */ }
  try {
    const serialized = JSON.stringify(message);
    window.localStorage.setItem(EVENT_KEY, serialized);
    if (phase === "commit") {
      window.localStorage.setItem(COMMIT_KEY, serialized);
      initialCommit = serialized;
    }
  } catch {
    // BroadcastChannel still works when browser storage is unavailable.
  }
}

if (typeof window !== "undefined") {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("zyx-account-transition");
      channel.onmessage = (event) => receive(event.data);
    }
  } catch { /* Channels are optional in restricted WebViews. */ }
  try { initialCommit = window.localStorage.getItem(COMMIT_KEY); } catch { /* Storage is optional. */ }
  window.addEventListener("storage", (event) => {
    if (event.key !== EVENT_KEY || !event.newValue) return;
    try { receive(JSON.parse(event.newValue)); } catch { /* Ignore unrelated data. */ }
  });
  const recheck = () => {
    try {
      const latest = window.localStorage.getItem(COMMIT_KEY);
      if (latest && latest !== initialCommit) {
        missedRemoteCommit = true;
        notify();
        window.location.reload();
      }
    } catch { /* Live channel messages remain available. */ }
  };
  window.addEventListener("pageshow", (event) => { if (event.persisted) recheck(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) recheck(); });
}

export function isAccountTransitionPending(): boolean {
  return pending || isRemoteAccountTransitionPending();
}

/** The initiating document keeps its busy UI until rollback or a fresh load. */
export function isLocalAccountTransitionPending(): boolean {
  return pending;
}

/** A different document is changing the shared cookie; block this tab's UI. */
export function isRemoteAccountTransitionPending(): boolean {
  return missedRemoteCommit || remoteTransitions.size > 0;
}

export function subscribeAccountTransition(listener: (pending: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function subscribeRemoteAccountTransition(listener: (pending: boolean) => void): () => void {
  remoteListeners.add(listener);
  return () => { remoteListeners.delete(listener); };
}

export function setAccountTransitionPending(next: boolean): void {
  if (pending === next) return;
  pending = next;
  notify();
  publish(next ? "begin" : "cancel");
}

export function announceAccountTransitionCommitted(): void {
  publish("commit");
}

/** Only nonsecret flow metadata survives the Google browser redirect. */
export function markBrowserAccountRedirect(previousUserId: string | null): void {
  window.sessionStorage.setItem(REDIRECT_KEY, JSON.stringify({ previousUserId, source }));
}

/** Called after Better Auth confirms the session in the callback's new document. */
export function finishBrowserAccountRedirect(userId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(REDIRECT_KEY);
    if (!raw) return;
    const marker = JSON.parse(raw) as { previousUserId?: unknown; source?: unknown };
    // A pending useSession request may settle while this document prepares to
    // leave. Only the callback's new document can confirm the redirect result.
    if (marker.source === source) return;
    window.sessionStorage.removeItem(REDIRECT_KEY);
    if (typeof marker.source !== "string") return;
    // The initiating document had a different source ID; release its lock in
    // other tabs on cancellation, or make them read the changed cookie on success.
    const message: Message = {
      source: marker.source,
      phase: marker.previousUserId === userId ? "cancel" : "commit",
      at: Date.now(),
    };
    try { channel?.postMessage(message); } catch { /* Use the storage-event fallback. */ }
    const serialized = JSON.stringify(message);
    window.localStorage.setItem(EVENT_KEY, serialized);
    if (message.phase === "commit") {
      window.localStorage.setItem(COMMIT_KEY, serialized);
      initialCommit = serialized;
    }
  } catch { /* Authentication still completes if optional cross-tab storage is unavailable. */ }
}
