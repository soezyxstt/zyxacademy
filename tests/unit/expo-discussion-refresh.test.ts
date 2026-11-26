import { expect, test } from "bun:test";
import { discussionAiMessage, listRefreshDelay, threadRefreshDelay } from "../../apps/mobile-native/features/student/community/discussion-refresh";

test("foreground discussion intervals match the web thread and list", () => {
  expect(listRefreshDelay()).toBe(120_000);
  expect(threadRefreshDelay({ aiStatuses: [] })).toBe(60_000);
  expect(threadRefreshDelay({ aiStatuses: [{ status: "processing", reason: null }] })).toBe(4_000);
});
test("only recognized UI messages replace the internal status", () => {
  expect(discussionAiMessage({ status: "processing", reason: null }, "id")).toBe("Zyra sedang menyiapkan jawaban.");
  expect(discussionAiMessage({ status: "uncertain", reason: "ai_uncertain" }, "en")).not.toContain("ai_uncertain");
  expect(discussionAiMessage({ status: "failed", reason: "DATABASE_ERROR" }, "id")).toContain("belum tersedia");
});
