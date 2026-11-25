import { applyTourAction, parseTourMutation, type TourRole, type TourState } from "@/lib/onboarding/tour-state";
import { fixture } from "./config";

const key = (role: TourRole) => `onboarding-fixture:${fixture.userId}:${role}`;
const read = (role: TourRole): TourState | null => JSON.parse(localStorage.getItem(key(role)) ?? "null");
export type FixtureMutation = { action: string; role: TourRole; generation: number; stepIndex?: number };
type HoldableSave = "start" | "restart" | "progress";

declare global {
  interface Window {
    __tourFixture: {
      mutations: FixtureMutation[];
      readState: (role?: TourRole) => TourState | null;
      seedState: (state: TourState | null, role?: TourRole) => void;
      failNextSave: boolean;
      holdNextSave: (action: HoldableSave) => void;
      heldSave: HoldableSave | null;
      releaseSave: () => void;
    };
  }
}

export function installFixtureApi() {
  const originalFetch = window.fetch.bind(window);
  let saveHold: { action: HoldableSave; received: boolean; wait: Promise<void>; release: () => void } | null = null;
  window.__tourFixture = {
    mutations: [],
    readState: (role = fixture.role) => read(role),
    seedState: (state, role = fixture.role) => localStorage.setItem(key(role), JSON.stringify(state)),
    failNextSave: false,
    holdNextSave: action => {
      if (saveHold) throw new Error("A fixture save is already held");
      let release!: () => void;
      const wait = new Promise<void>(resolve => { release = resolve; });
      saveHold = { action, received: false, wait, release };
    },
    heldSave: null,
    releaseSave: () => {
      if (!saveHold?.received) throw new Error("No fixture save is waiting for release");
      const pending = saveHold;
      saveHold = null;
      window.__tourFixture.heldSave = null;
      pending.release();
    },
  };
  const fixtureFetch = async (input: Parameters<typeof window.fetch>[0], init?: Parameters<typeof window.fetch>[1]) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (url.pathname === "/api/onboarding/tour") {
      const role: TourRole = url.searchParams.get("role") === "tutor" ? "tutor" : fixture.role;
      if ((init?.method ?? "GET") === "GET") return Response.json({ state: read(role) });
      if (window.__tourFixture.failNextSave) {
        window.__tourFixture.failNextSave = false;
        return Response.json({ error: "Fixture save failure" }, { status: 503 });
      }
      const mutation = parseTourMutation(JSON.parse(String(init?.body ?? "{}")));
      if (!mutation) return Response.json({ error: "Invalid mutation" }, { status: 400 });
      window.__tourFixture.mutations.push(mutation);
      // Pause before applying so a test can model another tab winning the write.
      const pending = saveHold;
      if (pending && !pending.received && pending.action === mutation.action) {
        pending.received = true;
        window.__tourFixture.heldSave = pending.action;
        await pending.wait;
      }
      const previous = read(mutation.role);
      const state = applyTourAction(previous, mutation, "2026-11-25T12:00:00.000Z");
      localStorage.setItem(key(mutation.role), JSON.stringify(state));
      return Response.json({ state, applied: state !== previous });
    }
    if (url.pathname === "/api/discussions/counts") return Response.json({ total: { unreadThreads: 0, activeThreads: 0 }, course: null });
    if (url.pathname === "/api/notifications/history") return Response.json({ notifications: [], unreadCount: 0, page: 1, limit: 20 });
    if (url.pathname === "/api/zyra/allowance") return Response.json({ summary: {
      peran: "murid", appDay: "2026-11-25", accessTier: "standard",
      providerTurnsUsed: 0, providerTurnsRemaining: 10, totalInteractionsUsed: 0,
      totalInteractionsRemaining: 10, premiumTurnsUsed: 0, premiumTurnsRemaining: 0,
      cacheSaves: 0, nextResetAt: "2026-11-26T00:00:00.000Z",
    } });
    if (url.pathname.startsWith("/api/")) return Response.json({ items: [], data: [], success: true });
    return originalFetch(input, init);
  };
  window.fetch = Object.assign(fixtureFetch, window.fetch);
}
