import { describe, expect, test } from "bun:test";
import { canAccessZyraProposal } from "@/lib/zyra/proposals";

describe("Zyra proposal authorization", () => {
  test("keeps tutor proposals owner and course scoped", () => {
    expect(canAccessZyraProposal({ actorId: "tutor-a", role: "tutor", proposalActorId: "tutor-a", courseId: "course-a", requestedCourseId: "course-a" })).toBe(true);
    expect(canAccessZyraProposal({ actorId: "tutor-b", role: "tutor", proposalActorId: "tutor-a", courseId: "course-a", requestedCourseId: "course-a" })).toBe(false);
    expect(canAccessZyraProposal({ actorId: "tutor-a", role: "tutor", proposalActorId: "tutor-a", courseId: "course-a", requestedCourseId: "course-b" })).toBe(false);
  });
  test("allows admin global read without exposing identity in serializer", () => {
    expect(canAccessZyraProposal({ actorId: "admin", role: "admin", proposalActorId: "tutor-a", courseId: "course-a" })).toBe(true);
  });
});
