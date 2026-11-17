export function requireDiscussionPrivateStorage(mode: string): void {
  if (mode !== "neon") throw new Error("DISCUSSION_PRIVATE_STORAGE_REQUIRED");
}
