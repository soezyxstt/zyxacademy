import type { StudentRoute } from "./contracts";

export type StudentArea = "courses" | "assessment" | "learning" | "community";

const course = "/courses/[id]";
const pka = "/courses/tutorial-pka";

export const studentPatterns: Record<StudentArea, readonly string[]> = {
  courses: ["/dashboard", "/courses", course, course + "/material", course + "/material/[materialId]"],
  assessment: ["quiz", "quiz/[quizId]", "quiz/[quizId]/summary/[attemptId]", "tryout", "tryout/[tryoutId]",
    "my-results", "my-results/[submissionId]", "my-results/[submissionId]/summary", "solutions/[collectionId]"]
    .map(path => course + "/" + path),
  learning: [
    ...["concept/[slug]", "flashcard", "mastery", "path", "playground", "progress", "video", "live", "live/host"]
      .map(path => course + "/" + path),
    pka, ...["daftar", "jadwal", "laporan", "material", "material/[materialId]", "simulasi", "simulasi/[subject]/[stage]"]
      .map(path => pka + "/" + path),
  ],
  community: [
    "/achievements", "/calendar", course + "/discussions", course + "/leaderboard", "/dashboard/discussions",
    "/dashboard/groups", "/dashboard/schedule", "/discussions", "/feedback", "/leaderboard", "/leaderboard/academic",
    "/pet", "/profile", "/profile/edit", "/profile/reflections", "/settings", "/settings/notifications",
    "/settings/notifications/browser", "/students/[publicId]",
  ],
};

const definitions = Object.entries(studentPatterns).flatMap(([area, patterns]) => patterns.map(pattern => ({
  area: area as StudentArea, pattern, parts: pattern.slice(1).split("/"),
}))).sort((a, b) => a.pattern.split("[").length - b.pattern.split("[").length);

export function matchStudentRoute(path: string): (StudentRoute & { area: StudentArea }) | null {
  const pathname = path.split(/[?#]/, 1)[0];
  if (!pathname.startsWith("/") || /\/\/|\\|[\u0000-\u001f]/.test(pathname)) return null;
  let parts: string[];
  try {
    parts = pathname.replace(/\/$/, "").slice(1).split("/").map(decodeURIComponent);
  } catch { return null; }
  if (parts.some(part => !part || part === "." || part === ".." || /[/\\\u0000-\u001f]/.test(part))) return null;
  for (const definition of definitions) {
    if (parts.length !== definition.parts.length) continue;
    const params: Record<string, string> = {};
    if (!definition.parts.every((part, i) => {
      if (!part.startsWith("[")) return part === parts[i];
      params[part.slice(1, -1)] = parts[i];
      return true;
    })) continue;
    const query = Object.fromEntries(new URLSearchParams(path.split("#", 1)[0].split("?").slice(1).join("?")));
    return { area: definition.area, pattern: definition.pattern, path, params, query };
  }
  return null;
}
