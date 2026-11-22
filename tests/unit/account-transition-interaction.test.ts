import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { installAccountTransitionInteractionGuard } from "@/lib/auth/account-transition-interaction";

function remoteTransition() {
  let pending = false;
  const listeners = new Set<(pending: boolean) => void>();
  return {
    isPending: () => pending,
    subscribe: (listener: (pending: boolean) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setPending(next: boolean) {
      pending = next;
      for (const listener of listeners) listener(next);
    },
  };
}

describe("receiving-tab interaction boundary", () => {
  test("blocks form and portal handlers during a remote change and restores them on cancellation", () => {
    const document = new EventTarget();
    const transition = remoteTransition();
    let saves = 0, portalClicks = 0, keyActions = 0, cancellations = 0;
    const dispose = installAccountTransitionInteractionGuard({
      target: document,
      ...transition,
      cancelQueries: async () => { cancellations++; },
    });
    // These stand for handlers below document capture, including a portal that
    // lives outside the page's React root. No target allowlist can bypass the guard.
    document.addEventListener("submit", () => { saves++; });
    document.addEventListener("click", () => { portalClicks++; });
    document.addEventListener("keydown", () => { keyActions++; });
    const dispatch = (type: string) => {
      const event = new Event(type, { cancelable: true });
      document.dispatchEvent(event);
      return event;
    };
    try {
      expect(dispatch("submit").defaultPrevented).toBe(false);
      expect(saves).toBe(1);
      transition.setPending(true);
      transition.setPending(true);
      expect(cancellations).toBe(1);
      for (const type of ["submit", "click", "keydown", "beforeinput", "drop"]) {
        expect(dispatch(type).defaultPrevented).toBe(true);
      }
      expect({ saves, portalClicks, keyActions }).toEqual({ saves: 1, portalClicks: 0, keyActions: 0 });
      transition.setPending(false);
      for (const type of ["submit", "click", "keydown"]) expect(dispatch(type).defaultPrevented).toBe(false);
      expect({ saves, portalClicks, keyActions }).toEqual({ saves: 2, portalClicks: 1, keyActions: 1 });
    } finally { dispose(); }
  });

  test("aborts an existing query when a remote transition begins", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const transition = remoteTransition();
    let requestSignal: AbortSignal | undefined;
    let started!: () => void;
    const start = new Promise<void>(resolve => { started = resolve; });
    const request = client.fetchQuery({
      queryKey: ["private-data", "original-account"],
      queryFn: ({ signal }) => new Promise<string>((resolve) => {
        requestSignal = signal;
        signal.addEventListener("abort", () => resolve("cancelled"), { once: true });
        started();
      }),
    }).catch(() => null);
    await start;
    const dispose = installAccountTransitionInteractionGuard({
      target: new EventTarget(), ...transition, cancelQueries: () => client.cancelQueries(),
    });
    try {
      transition.setPending(true);
      expect(requestSignal?.aborted).toBe(true);
      await request;
      expect(client.getQueryData(["private-data", "original-account"])).toBeUndefined();
    } finally { dispose(); client.clear(); }
  });

  test("starts paused if mounted mid-transition and removes its listeners on disposal", () => {
    const document = new EventTarget();
    const transition = remoteTransition();
    transition.setPending(true);
    let cancellations = 0, saves = 0;
    const dispose = installAccountTransitionInteractionGuard({
      target: document, ...transition, cancelQueries: async () => { cancellations++; },
    });
    document.addEventListener("submit", () => { saves++; });
    document.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(cancellations).toBe(1);
    expect(saves).toBe(0);
    dispose();
    document.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(saves).toBe(1);
    transition.setPending(false);
    transition.setPending(true);
    expect(cancellations).toBe(1);
  });
});
