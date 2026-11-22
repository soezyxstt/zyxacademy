import { afterEach, describe, expect, it } from "bun:test";
import { setAccountTransitionPending } from "@/lib/auth/account-transition-state";
import { createCodingDraftRequestScope } from "@/lib/coding/draft-request-scope";

afterEach(() => setAccountTransitionPending(false));

describe("coding draft account transitions", () => {
  it("aborts in-flight work and rejects queued work before the session changes", () => {
    const scope = createCodingDraftRequestScope(() => true);
    try {
      const request = scope.begin()!;
      expect(request.isCurrent()).toBe(true);
      setAccountTransitionPending(true);
      expect(request.signal.aborted).toBe(true);
      expect(request.isCurrent()).toBe(false);
      expect(scope.begin()).toBeNull();
    } finally { scope.dispose(); }
  });

  it("resumes for the original account after a failed switch without accepting its late response", () => {
    let resumes = 0;
    const scope = createCodingDraftRequestScope(() => true, () => { resumes++; });
    try {
      const previous = scope.begin()!;
      setAccountTransitionPending(true);
      setAccountTransitionPending(false);
      expect(resumes).toBe(1);
      expect(previous.isCurrent()).toBe(false);
      const resumed = scope.begin()!;
      expect(resumed.isCurrent()).toBe(true);
      resumed.finish();
    } finally { scope.dispose(); }
  });

  it("never resumes an old account after a successful switch", () => {
    let owner = "first", resumes = 0;
    const scope = createCodingDraftRequestScope(() => owner === "first", () => { resumes++; });
    try {
      const previous = scope.begin()!;
      setAccountTransitionPending(true);
      owner = "second";
      setAccountTransitionPending(false);
      expect(resumes).toBe(0);
      expect(scope.begin()).toBeNull();
      expect(previous.isCurrent()).toBe(false);
    } finally { scope.dispose(); }
  });

  it("invalidates requests on unmount even if the same account mounts again", () => {
    const previousScope = createCodingDraftRequestScope(() => true);
    const previous = previousScope.begin()!;
    previousScope.dispose();
    const nextScope = createCodingDraftRequestScope(() => true);
    try {
      expect(previous.signal.aborted).toBe(true);
      expect(previous.isCurrent()).toBe(false);
      expect(previousScope.begin()).toBeNull();
      expect(nextScope.begin()!.isCurrent()).toBe(true);
    } finally { nextScope.dispose(); }
  });
});
