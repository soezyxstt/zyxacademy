import { afterEach, describe, expect, test } from "bun:test";
import { AccountSwitchError } from "@/lib/auth/account-switch-contract";
import { runAccountTransition, type AccountTransitionDependencies } from "@/lib/auth/account-transition";
import { isAccountTransitionPending, setAccountTransitionPending, subscribeAccountTransition } from "@/lib/auth/account-transition-state";

afterEach(() => setAccountTransitionPending(false));

function setup() {
  const events: string[] = [];
  let userId: string | null = "a";
  const deps: AccountTransitionDependencies = {
    isOnline: () => true,
    hasPendingChanges: () => false,
    currentUserId: async () => userId,
    rememberCurrent: async () => { events.push("remember"); },
    cancelRequests: async () => { events.push("cancel"); },
    detachPush: async () => {
      events.push("detach-old-push");
      return async () => { events.push("restore-old-push"); };
    },
    commit: async (id) => { events.push(`clear-for-${id}`); },
    resume: () => { events.push("resume"); },
    reload: () => { events.push("reload"); },
  };
  return { events, deps, setUser: (id: string | null) => { userId = id; } };
}

describe("account transition boundary", () => {
  test("pauses writers synchronously and cleans old data only after the new session succeeds", async () => {
    const { deps, events, setUser } = setup();
    const unsubscribe = subscribeAccountTransition((pending) => events.push(`pending-${pending}`));
    const result = runAccountTransition(async () => {
      events.push("change-cookie");
      setUser("b");
      return "b";
    }, deps);
    expect(isAccountTransitionPending()).toBe(true);
    expect(await result).toBe("b");
    expect(events).toEqual(["pending-true", "remember", "cancel", "detach-old-push", "change-cookie", "clear-for-b"]);
    expect(isAccountTransitionPending()).toBe(true);
    unsubscribe();
  });

  test("cancel or failed auth preserves the old identity, cache and reminders and restores push", async () => {
    const { deps, events } = setup();
    await expect(runAccountTransition(async () => { throw new AccountSwitchError("CANCELLED"); }, deps))
      .rejects.toMatchObject({ code: "CANCELLED" });
    expect(events).toEqual(["remember", "cancel", "detach-old-push", "restore-old-push", "resume"]);
    expect(isAccountTransitionPending()).toBe(false);
  });

  test("busy, offline and unsaved work refuse the operation before altering notifications or sessions", async () => {
    const { deps, events } = setup();
    let called = false;
    const operation = async () => { called = true; return "b"; };
    deps.isOnline = () => false;
    await expect(runAccountTransition(operation, deps)).rejects.toMatchObject({ code: "OFFLINE" });
    deps.isOnline = () => true;
    deps.hasPendingChanges = () => true;
    await expect(runAccountTransition(operation, deps)).rejects.toMatchObject({ code: "PENDING_CHANGES" });
    deps.hasPendingChanges = () => false;
    setAccountTransitionPending(true);
    await expect(runAccountTransition(operation, deps)).rejects.toMatchObject({ code: "BUSY" });
    expect(called).toBe(false);
    expect(events).toEqual([]);
  });

  test("interrupted successful responses reconcile the real cookie identity instead of restoring old push", async () => {
    const { deps, events, setUser } = setup();
    expect(await runAccountTransition(async () => {
      setUser("b");
      throw new Error("connection lost after Set-Cookie");
    }, deps)).toBe("b");
    expect(events).toEqual(["remember", "cancel", "detach-old-push", "clear-for-b"]);
    expect(isAccountTransitionPending()).toBe(true);
  });

  test("uncertain session state keeps old writers paused until a fresh document loads", async () => {
    const { deps, events } = setup();
    await expect(runAccountTransition(async () => {
      deps.currentUserId = async () => { throw new Error("offline"); };
      throw new Error("connection lost");
    }, deps)).rejects.toMatchObject({ code: "SWITCH_FAILED" });
    expect(events).toEqual(["remember", "cancel", "detach-old-push", "reload"]);
    expect(isAccountTransitionPending()).toBe(true);
  });

  test("failed push detachment never reaches the cookie-changing operation", async () => {
    const { deps, events } = setup();
    deps.detachPush = async () => { throw new Error("delete rejected"); };
    let called = false;
    await expect(runAccountTransition(async () => { called = true; return "b"; }, deps))
      .rejects.toMatchObject({ code: "SWITCH_FAILED" });
    expect(called).toBe(false);
    expect(events).toEqual(["remember", "cancel", "resume"]);
    expect(isAccountTransitionPending()).toBe(false);
  });
});
