import { administrationRoutes } from "./administration/routes";
import { academicRoutes } from "./routes";

const fixturePath = (pattern: string) => administrationRoutes.find(route => route.pattern === pattern)?.fixture ??
  pattern.replace("[courseId]", "academic-course-1").replace("[slug]", pattern.startsWith("/tutor/docs/") ? "ruang-kerja-tutor" : "biologi-dasar")
    .replace("[materialId]", "academic-document-1").replace(/\[(templateId|id|quizId)\]/g, "academic-quiz-1");

const screens = { courses: "CourseScreen", assessment: "AssessmentScreen", administration: "AdministrationScreen", tutor: "TutorScreen" } as const;

/** Reproducible entry points. A case in this manifest still needs separate platform evidence. */
export const academicCases = academicRoutes.flatMap(([pattern, feature]) => {
  const path = fixturePath(pattern);
  const role = pattern.startsWith("/admin/") ? "admin" : "tutor";
  const cases = [
    { variant: "populated", role, scenario: "populated", theme: "light" },
    { variant: "empty", role, scenario: "empty", theme: "dark" },
    { variant: "denied", role: "student", scenario: "populated", theme: "light" },
  ] as const;
  return cases.map(({ variant, role: actorRole, scenario, theme }) => ({
    id: `academic-${pattern.slice(1).replaceAll("/", "-").replace(/[\[\]]/g, "")}-${variant}`,
    pattern, path, component: screens[feature], theme, role: actorRole, scenario,
    href: `zyx-native-parity://academic?role=${actorRole}&scenario=${scenario}&theme=${theme}&path=${encodeURIComponent(path)}`,
  }));
});
