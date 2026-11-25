import type { TourRole } from "@/lib/onboarding/tour-state";

const query = new URLSearchParams(window.location.search);
export const fixture = {
  role: (query.get("role") === "tutor" ? "tutor" : "student") as TourRole,
  hasCourse: query.get("course") !== "0",
  locale: (query.get("locale") === "en" ? "en" : "id") as "id" | "en",
  theme: query.get("theme") === "dark" ? "dark" : "light",
  userId: "onboarding-fixture-user",
  courseId: "matematika-1",
};

export const fixtureCourse = {
  id: fixture.courseId,
  courseId: fixture.courseId,
  title: fixture.locale === "en" ? "Mathematics 1" : "Matematika 1",
  code: "MA1101",
  legacyCourseId: null,
  source: "canonical_assignment" as const,
  isCompatibilityFallback: false,
};

export const fixtureSession = {
  user: {
    id: fixture.userId,
    name: "Nadia Pratama",
    email: "nadia@example.test",
    image: null,
    role: fixture.role === "tutor" ? "tutor" : "student",
    roles: [fixture.role === "tutor" ? "tutor" : "murid"],
  },
};
