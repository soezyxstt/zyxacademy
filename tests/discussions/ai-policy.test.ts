import { describe, expect, it } from "bun:test";
import {
  assertDiscussionImagesAllowed,
  assertDiscussionStoredImage,
  deterministicDiscussionLabel,
  discussionAiErrorMessage,
  discussionAiKey,
  discussionAiTier,
  discussionContext,
  discussionFingerprint,
  discussionRecoveryAction,
  discussionTutorPrompt,
  isSafeDiscussionAnswer,
  mergeDiscussionLabel,
  packDiscussionResult,
  parseDiscussionLabel,
  unpackDiscussionResult,
  type DiscussionContextMessage,
} from "@/lib/discussions/ai-policy";

function message(seq: number, extra: Partial<DiscussionContextMessage> = {}): DiscussionContextMessage {
  return { id: `message-${seq}`, seq, revision: 1, kind: "human", body: `text ${seq}`,
    deletedAt: null, forwardedFromId: null, ...extra };
}

describe("discussion AI context and policy", () => {
  it("takes at most five prior nondeleted turns strictly before the invoking turn", () => {
    const invoking = message(10);
    const selected = discussionContext([message(11), message(9), message(8, { deletedAt: new Date() }),
      message(7), message(6), message(5), message(4), message(3), invoking], invoking);
    expect(selected.map((item) => item.seq)).toEqual([4, 5, 6, 7, 9, 10]);
    expect(() => discussionContext([], message(1, { deletedAt: new Date() }))).toThrow("DISCUSSION_AI_SOURCE_CHANGED");
  });

  it("bounds untrusted text and does not send message IDs or profile data in the prompt", () => {
    const prompt = discussionTutorPrompt([message(1, { body: `${"x".repeat(2000)}SECRET_AFTER_BOUND` }), message(2, { body: `${"x".repeat(11980)}QUESTION_AT_END` })]);
    expect(prompt).not.toContain("message-1");
    expect(prompt).not.toContain("SECRET_AFTER_BOUND");
    expect(prompt).toContain("QUESTION_AT_END");
    expect(prompt).toContain("data tidak tepercaya");
    expect(prompt).toContain("jawaban penilaian yang belum dirilis");
    const titled = discussionTutorPrompt([message(1, { body: "@Zyra jelaskan konsepnya" })], "Apa itu limit?");
    expect(titled).toContain('"questionTitle":"Apa itu limit?"');
    expect(discussionTutorPrompt([], "x".repeat(161))).not.toContain("x".repeat(161));
    expect(isSafeDiscussionAnswer("Jawaban akhir adalah opsi B.")).toBe(false);
    expect(isSafeDiscussionAnswer("Answer: C")).toBe(false);
    expect(isSafeDiscussionAnswer("Perhatikan hubungan gaya dan percepatan.")).toBe(true);
  });

  it("uses the course AI tier rather than course content access or XP", () => {
    expect(discussionAiTier("student")).toBe("free");
    expect(discussionAiTier("student", "free")).toBe("free");
    expect(discussionAiTier("student", "enrolled")).toBe("standard");
    expect(discussionAiTier("tutor", "staff")).toBe("standard");
    expect(discussionAiTier("admin")).toBe("standard");
    expect(discussionAiKey("request-1", "free")).toBe("zyra-free:discussion:request-1");
    expect(discussionAiKey("request-1", "free")).toBe(discussionAiKey("request-1", "free"));
    expect(discussionAiKey("request-2", "free")).not.toBe(discussionAiKey("request-1", "free"));
  });

  it("rejects image turns explicitly for free access and bounds image count", () => {
    expect(() => assertDiscussionImagesAllowed("free", 1)).toThrow("DISCUSSION_AI_FREE_TEXT_ONLY");
    expect(() => assertDiscussionImagesAllowed("standard", 4)).not.toThrow();
    expect(() => assertDiscussionImagesAllowed("standard", 5)).toThrow("DISCUSSION_AI_IMAGE_LIMIT");
    expect(() => assertDiscussionImagesAllowed("standard", -1)).toThrow("DISCUSSION_AI_IMAGE_LIMIT");
    expect(discussionAiErrorMessage("DISCUSSION_AI_FREE_TEXT_ONLY")).toContain("teks");
    expect(discussionAiErrorMessage("PRIVATE_BACKEND_DETAIL")).not.toContain("PRIVATE_BACKEND_DETAIL");
  });

  it("validates stored image metadata and bytes without reprocessing the image", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
    const image = { mime: "image/png", size: bytes.length, width: 1024, height: 768 };
    expect(() => assertDiscussionStoredImage(image, bytes)).not.toThrow();
    expect(() => assertDiscussionStoredImage({ ...image, size: 9 }, bytes)).toThrow("DISCUSSION_AI_IMAGE_UNAVAILABLE");
    expect(() => assertDiscussionStoredImage({ ...image, width: 4097 })).toThrow("DISCUSSION_AI_IMAGE_UNAVAILABLE");
    expect(() => assertDiscussionStoredImage({ ...image, width: 4000, height: 4001 })).toThrow("DISCUSSION_AI_IMAGE_UNAVAILABLE");
    expect(() => assertDiscussionStoredImage({ ...image, mime: "image/jpeg" }, bytes)).toThrow("DISCUSSION_AI_IMAGE_UNAVAILABLE");
  });

  it("does not call a provider again after an interrupted or ambiguous claim", () => {
    const initial = { kind: "zyra" as const, status: "pending" as const, attempts: 0, resultText: null };
    const fingerprint = discussionFingerprint({ body: "current message", revision: 1 });
    const saved = packDiscussionResult("Petunjuk konsep", fingerprint);
    expect(discussionRecoveryAction(initial)).toBe("generate");
    expect(discussionRecoveryAction({ ...initial, status: "processing", attempts: 1 })).toBe("uncertain");
    expect(discussionRecoveryAction({ ...initial, attempts: 1 })).toBe("uncertain");
    expect(discussionRecoveryAction({ ...initial, status: "processing", attempts: 1, resultText: saved })).toBe("recover");
    expect(unpackDiscussionResult(saved)).toEqual({ answer: "Petunjuk konsep", fingerprint });
    expect(discussionFingerprint({ body: "edited message", revision: 2 })).not.toBe(fingerprint);
    expect(discussionRecoveryAction({ ...initial, attempts: 1, resultText: "malformed" })).toBe("uncertain");
    expect(discussionRecoveryAction({ ...initial, kind: "label", status: "processing", attempts: 1 })).toBe("generate");
  });

  it("validates the entire classification shape and keeps unrelated labels", () => {
    expect(parseDiscussionLabel({ label: "academic" })).toBe("academic");
    expect(parseDiscussionLabel({ label: "admin" })).toBeNull();
    expect(parseDiscussionLabel({ label: "bug", role: "admin" })).toBeNull();
    expect(parseDiscussionLabel("bug")).toBeNull();
    expect(parseDiscussionLabel({ label: ["bug"] })).toBeNull();
    expect(deterministicDiscussionLabel("Aplikasi gagal saat masuk")).toBe("bug");
    expect(deterministicDiscussionLabel("Halo")).toBe("unclassified");
    expect(mergeDiscussionLabel(["custom", "bug"], "academic")).toEqual(["custom", "academic"]);
  });
});
