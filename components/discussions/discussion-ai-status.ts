"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { discussionAiRequests, discussionMessages } from "@/db/schema";
import { requireDiscussionThreadAccess } from "@/lib/discussions/access";
import { getSessionDiscussionActor } from "@/lib/discussions/session";

function safeReason(code: string | null, status: string) {
  switch (code) {
    case "DISCUSSION_AI_FREE_TEXT_ONLY": return "ai_freeTextOnly";
    case "DISCUSSION_AI_IMAGE_LIMIT": return "ai_imageLimit";
    case "DISCUSSION_AI_IMAGE_DISABLED": return "ai_imageDisabled";
    case "DISCUSSION_AI_IMAGE_UNAVAILABLE": return "ai_imageUnavailable";
    case "REQUEST_TOO_LARGE": return "ai_requestTooLarge";
    case "DISCUSSION_AI_ASSESSMENT_ACTIVE": return "ai_assessmentActive";
    case "DISCUSSION_AI_QUOTA": return "ai_quota";
    case "DISCUSSION_AI_SOURCE_CHANGED": return "ai_sourceChanged";
    case "DISCUSSION_AI_UNCERTAIN": return "ai_uncertain";
    default: return status === "uncertain" ? "ai_uncertain" : "ai_failed";
  }
}

export async function listDiscussionAiStatuses(threadId: string, messageIds: string[]) {
  if (!Array.isArray(messageIds) || messageIds.length > 30 || messageIds.some((id) => typeof id !== "string" || !id || id.length > 160)) {
    throw new Error("Status Zyra belum tersedia.");
  }
  const actor = await getSessionDiscussionActor();
  await requireDiscussionThreadAccess(actor, threadId);
  if (!messageIds.length) return [];
  const rows = await db.select({ messageId: discussionAiRequests.messageId, status: discussionAiRequests.status, errorCode: discussionAiRequests.errorCode })
    .from(discussionAiRequests).innerJoin(discussionMessages, eq(discussionMessages.id, discussionAiRequests.messageId))
    .where(and(eq(discussionMessages.threadId, threadId), eq(discussionAiRequests.kind, "zyra"),
      eq(discussionAiRequests.requestedById, actor.id), inArray(discussionMessages.id, messageIds)))
    .limit(30);
  return rows.map(({ messageId, status, errorCode }) => ({
    messageId, status,
    reason: status === "failed" || status === "uncertain"
      ? safeReason(errorCode, status)
      : null,
  }));
}
