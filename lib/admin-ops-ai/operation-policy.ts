/** Browser Ops AI exposes only reviewed operations from the shared registrars. */
const reads = new Set([
  "analytics.overview", "analytics.courses", "settings.feature_flags",
  "courses.get", "courses.list", "chapters.get", "chapters.list", "chapters.order",
  "materials.get", "materials.list", "videos.get", "videos.list", "videos.playlists.list",
  "groups.get", "groups.inspect", "groups.list", "groups.members.list",
  "users.get", "users.list", "enrollments.get", "enrollments.list", "tokens.get", "tokens.list",
  "blog.list", "blog.search", "blog.get", "blog.get_edit_context", "blog.validate",
  "forms.list", "forms.get", "forms.preview", "forms.validate_answers", "forms.simulate_submission",
  "forms.presets.list", "forms.presets.get", "forms.responses.summarize",
  "links.list", "links.get", "shortlinks.list", "shortlinks.get", "schedules.get", "schedules.list",
  "media.list", "media.get", "meet.get", "meet.list", "jobs.get", "jobs.list", "notifications.history",
]);

const approvals = new Set([
  "blog.create", "blog.set_publication",
  "forms.create", "forms.update", "forms.set_acceptance", "forms.archive",
  "forms.presets.create", "forms.presets.delete",
  "shortlinks.create", "shortlinks.update", "shortlinks.delete",
  "links.create", "links.update", "links.delete",
  "courses.create", "courses.update", "courses.archive",
  "chapters.create", "chapters.update", "chapters.reorder", "chapters.archive",
  "materials.update_metadata", "videos.playlists.create", "videos.create", "videos.update", "videos.delete",
  "groups.create", "groups.update", "groups.set_status", "groups.members.add", "groups.members.remove", "groups.adjust_quota",
  "schedules.create", "schedules.update", "schedules.delete",
  "users.set_status", "users.set_roles", "tokens.revoke",
]);

// Editing a template leaves existing forms intact. A grant covers one existing preset.
export function opsOperationPolicy(name: string) {
  if (name === "blog.update") return "draft-only" as const;
  if (name === "forms.presets.update") return "chat" as const;
  if (approvals.has(name)) return "once" as const;
  if (reads.has(name)) return "read" as const;
  return undefined;
}

export function opsGrantTarget(name: string, input: Record<string, unknown>, impact: unknown): string | undefined {
  if (typeof input.id !== "string" || !input.id) return undefined;
  if (opsOperationPolicy(name) === "chat") return input.id;
  if (opsOperationPolicy(name) === "draft-only" && impact && typeof impact === "object"
    && "previousStatus" in impact && impact.previousStatus === "draft"
    && "isPublic" in impact && impact.isPublic === false) return input.id;
  return undefined;
}
