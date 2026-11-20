import { expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { discussionAttachments, discussionMessages, discussionThreads } from "@/db/schema";

test("discussion image integration uses the core schema fields", () => {
  const columns = (table: Parameters<typeof getTableConfig>[0]) => new Set(getTableConfig(table).columns.map((column) => column.name));
  const attachmentColumns = columns(discussionAttachments);
  for (const name of ["id", "channel_id", "uploader_id", "message_id", "status", "storage_key", "preview_storage_key", "preview_size", "name", "mime", "size", "width", "height", "created_at", "expires_at"]) expect(attachmentColumns.has(name)).toBe(true);
  expect(getTableConfig(discussionAttachments).checks.some((check) => check.name === "discussion_attachments_preview_check")).toBe(true);
  expect(columns(discussionMessages).has("deleted_at")).toBe(true);
  expect(columns(discussionThreads).has("channel_id")).toBe(true);
});
