import type { NativeAccountContext } from "../../../packages/native-session/context";

// Entry points under the existing web Student layout.
const studentPaths = new Set([
  "achievements", "calendar", "courses", "dashboard", "discussions", "feedback",
  "leaderboard", "pet", "profile", "settings", "students",
]);

export function isStudyReminderPath(pathname: string): boolean {
  return pathname.startsWith("/") && studentPaths.has(pathname.split("/")[1]);
}

export function isStudyReminderAccount(
  context: NativeAccountContext | null,
): context is NativeAccountContext & { dashboard: "/dashboard" } {
  return Boolean(context?.dashboard === "/dashboard" && context.roles.includes("murid"));
}
