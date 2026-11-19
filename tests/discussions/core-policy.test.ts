import { describe, expect, test } from "bun:test";
import { canEditDiscussionMessage, canForwardDiscussion, deriveInitialDiscussionTitle, validDiscussionReplyType } from "@/lib/discussions/policy";

describe("discussion audience and message policies", () => {
 test("explicit answers and contextual replies cannot be confused", () => {
  expect(validDiscussionReplyType("answer", null)).toBe(true);
  expect(validDiscussionReplyType("answer", "message")).toBe(false);
  expect(validDiscussionReplyType("reply", "message")).toBe(true);
  expect(validDiscussionReplyType("reply", null)).toBe(false);
  expect(validDiscussionReplyType(undefined, "message")).toBe(false);
 });
 test("course messages cannot move to a wider audience and team channels are rejected", () => {
  const global = { id: "global", kind: "global" as const, courseId: null, legacyCourseId: null };
  const course = { id: "a", kind: "course" as const, courseId: "a", legacyCourseId: "old-a" };
  const other = { id: "b", kind: "course" as const, courseId: "b", legacyCourseId: "old-b" };
  const privateChannel = { id: "private", kind: "academic" as const, courseId: "a", legacyCourseId: "old-a" };
  expect(canForwardDiscussion(global, course)).toBe(true);
  expect(canForwardDiscussion(course, global)).toBe(false);
  expect(canForwardDiscussion(course, other)).toBe(false);
  expect(canForwardDiscussion(privateChannel, course)).toBe(false);
  expect(canForwardDiscussion(privateChannel, privateChannel)).toBe(false);
 });
 test("derives bounded first-sentence initial titles without blocking", () => {
  expect(deriveInitialDiscussionTitle("Mengapa limit ini perlu difaktorkan terlebih dahulu? Saya sudah coba substitusi langsung.")).toBe("Mengapa limit ini perlu difaktorkan terlebih dahulu?");
  expect(deriveInitialDiscussionTitle("**Bagaimana** cara menurunkan $x^2$!\nLangkah kedua...")).toBe("Bagaimana cara menurunkan $x^2$!");
  expect(deriveInitialDiscussionTitle("", true)).toBe("Pertanyaan gambar");
  expect(deriveInitialDiscussionTitle("", false)).toBe("Pertanyaan baru");
  const longSentence = `${"kata ".repeat(45)}akhir.`;
  const derived = deriveInitialDiscussionTitle(longSentence);
  expect(derived.length).toBeLessThanOrEqual(160);
  expect(derived.endsWith("...")).toBe(true);
 });
 test("author edits expire at five minutes, with an admin override", () => {
  const createdAt = new Date("2026-01-01T00:00:00Z");
  const message = { authorId: "a", kind: "human", createdAt, deletedAt: null };
  expect(canEditDiscussionMessage({ id: "a", role: "student" }, message, new Date(createdAt.getTime() + 299999))).toBe(true);
  expect(canEditDiscussionMessage({ id: "a", role: "student" }, message, new Date(createdAt.getTime() + 300000))).toBe(false);
  expect(canEditDiscussionMessage({ id: "b", role: "admin" }, message, new Date(createdAt.getTime() + 300000))).toBe(true);
  expect(canEditDiscussionMessage({ id: "a", role: "student" }, { ...message, messageType: "forward" }, createdAt)).toBe(false);
 });
});
