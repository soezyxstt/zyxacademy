import { describe, expect, test } from "bun:test";
import { canAccessZyraAttachment, sameZyraAttachmentScope } from "@/lib/zyra/images";

const own = {
  actorId: "student-a",
  ownerId: "student-a",
  courseId: "course-a",
  authorizedCourseId: "course-a",
};

describe("Zyra attachment authorization", () => {
  test("allows only the owner or an explicitly authorized admin in the same course", () => {
    expect(canAccessZyraAttachment(own)).toBe(true);
    expect(canAccessZyraAttachment({ ...own, actorId: "student-b" })).toBe(false);
    expect(canAccessZyraAttachment({ ...own, actorId: "admin-a", role: "admin" })).toBe(true);
  });

  test("rejects missing actor and cross-course scope", () => {
    expect(canAccessZyraAttachment({ ...own, actorId: null })).toBe(false);
    expect(canAccessZyraAttachment({ ...own, authorizedCourseId: "course-b" })).toBe(false);
  });

  test("requires exact course and conversation scope", () => {
    expect(sameZyraAttachmentScope({ requestedCourseId: "a", storedCourseId: "a", requestedSessionId: "s", storedSessionId: "s" })).toBe(true);
    expect(sameZyraAttachmentScope({ requestedCourseId: "a", storedCourseId: "b", requestedSessionId: "s", storedSessionId: "s" })).toBe(false);
    expect(sameZyraAttachmentScope({ requestedCourseId: "a", storedCourseId: "a", requestedSessionId: "s", storedSessionId: "t" })).toBe(false);
  });

  test("does not treat an attachment id as a conversation authorization", () => {
    const stored = { requestedCourseId: "course-a", storedCourseId: "course-a", requestedSessionId: "session-b", storedSessionId: "session-a" };
    expect(sameZyraAttachmentScope(stored)).toBe(false);
  });
});
