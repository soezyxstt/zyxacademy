export type SettingsTab = "general" | "appearance" | "notifications" | "profile";

export function resolveSettingsTab(value: unknown): SettingsTab {
  // Keep saved links and optional-email links from older clients working.
  if (value === "email") return "notifications";
  if (value === "appearance" || value === "notifications" || value === "profile") return value;
  return "general";
}
