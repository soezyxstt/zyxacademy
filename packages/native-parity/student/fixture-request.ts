import { createAssessmentFixtureRequest, assessmentFixtureScenarios } from "./assessment/fixtures";
import { isCommunityFixturePath, createCommunityFixtureRequest } from "./community/fixtures";
import { createCourseFixtureRequest, courseFixtureScenarios } from "./courses/fixtures";
import { createLearningFixtureRequest, type LearningFixtureScenario } from "./learning/fixtures";

export function createStudentFixtureRequest(scenario: string) {
  const courses = createCourseFixtureRequest(courseFixtureScenarios.find(value => value === scenario) ?? "enrolled");
  const community = createCommunityFixtureRequest(
    ["offline", "revoked", "unavailable"].includes(scenario) ? "unavailable" : ["empty", "unenrolled"].includes(scenario) ? "empty" : "loaded");
  const learningScenarios: readonly LearningFixtureScenario[] = ["enrolled", "empty", "no-enrollment", "revoked", "offline", "long"];
  const learning = createLearningFixtureRequest(scenario === "unenrolled" ? "no-enrollment" : scenario === "long-content" ? "long" :
    learningScenarios.find(value => value === scenario) ?? "enrolled");
  const assessment = createAssessmentFixtureRequest(scenario === "revoked" ? "locked" : scenario === "long-content" ? "long" :
    assessmentFixtureScenarios.find(value => value === scenario) ?? "populated");
  return (path: string, init?: RequestInit) => {
    if (path.startsWith("/api/native/student/courses?") || path === "/api/native/student/courses") return courses(path, init);
    if (path.startsWith("/api/native/student/assessment/")) return assessment(path, init);
    if (isCommunityFixturePath(path)) return community(path, init);
    return learning(path, init);
  };
}
