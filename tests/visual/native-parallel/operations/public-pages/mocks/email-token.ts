export function verifyEmailUnsubscribeToken(token: string) {
  if (token !== "fixture-course-updates") throw new Error("Invalid fixture token");
  return { category: "course_updates" as const };
}
