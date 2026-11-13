import { expect, mock, test } from "bun:test";

let fullContent = true;
const enrollment = mock(async () => false);
const contentAccess = mock(async () => fullContent);
const attempt = { id: "attempt", templateId: "simulation", status: "completed", score: 80, questionsSnapshot: [{ prompt: "PRIVATE QUESTION", correct_indices: [0] }], answersSnapshot: { answer: "PRIVATE ANSWER" } };
mock.module("server-only", () => ({}));
mock.module("@/lib/pka-enrollment", () => ({ requirePkaSession: async () => "registered-student" }));
mock.module("@/app/(student)/dashboard/actions", () => ({ checkEnrollment: enrollment, checkFullCourseContentAccess: contentAccess }));
mock.module("@/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({
  orderBy: async () => [{ id: "simulation", title: "Simulation" }],
  then: (resolve: (value: unknown) => void) => resolve([attempt]),
}) }) }) } }));
mock.module("@/lib/site", () => ({ createMetadata: (value: unknown) => value }));
mock.module("@/lib/i18n/server", () => ({ getTranslations: async () => (key: string) => key }));
mock.module("@/components/i18n/translated-text", () => ({ TranslatedText: () => null }));
mock.module("@/components/course/course-page-shell", () => ({ CoursePageShell: () => null }));
mock.module("@/components/ui/reveal", () => ({ Reveal: () => null }));
mock.module("@/app/(student)/courses/[id]/quiz/quiz-list-client", () => ({ QuizListClient: () => null }));
const { default: Page } = await import("@/app/(student)/courses/tutorial-pka/simulasi/page");

test("PKA list uses current content entitlement independently of factual enrollment", async () => {
  for (const allowed of [true, false]) {
    fullContent = allowed;
    const page = await Page();
    const props = page.props.children.props.children.props;
    expect(props.hasFullContentAccess).toBe(allowed);
    expect(props.attempts).toEqual([{ id: "attempt", templateId: "simulation", status: "completed", score: 80 }]);
    expect(JSON.stringify(props)).not.toContain("PRIVATE");
  }
  expect(contentAccess).toHaveBeenCalledWith("tutorial-pka");
  expect(enrollment).not.toHaveBeenCalled();
});
