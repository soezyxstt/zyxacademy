import { describe, expect, test } from "bun:test";
import { petStateForTutorEvent } from "@/lib/zyra/murid";

const base = { isOpen: true, activeMode: "chat", loading: false, chatLoading: false, attachmentsReady: true, hasAttachments: false, hasError: false, quotaExhausted: false };

describe("Zyra pet state", () => {
  test("maps real upload and request states", () => {
    expect(petStateForTutorEvent({ ...base, attachmentsReady: false, hasAttachments: true })).toBe("uploading");
    expect(petStateForTutorEvent({ ...base, chatLoading: true })).toBe("thinking");
  });
  test("maps quota and error before idle", () => {
    expect(petStateForTutorEvent({ ...base, quotaExhausted: true })).toBe("quota_resting");
    expect(petStateForTutorEvent({ ...base, hasError: true })).toBe("error");
  });
  test("does not animate a closed drawer", () => {
    expect(petStateForTutorEvent({ ...base, isOpen: false, chatLoading: true })).toBe("idle");
  });
});
