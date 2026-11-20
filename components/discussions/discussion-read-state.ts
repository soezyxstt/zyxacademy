"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { discussionThreadReads } from "@/db/schema";
import { requireDiscussionThreadAccess } from "@/lib/discussions/access";
import { getSessionDiscussionActor } from "@/lib/discussions/session";

export async function getDiscussionReadThrough(threadId: string) {
  const actor = await getSessionDiscussionActor();
  await requireDiscussionThreadAccess(actor, threadId);
  const [row] = await db.select({ throughSeq: discussionThreadReads.throughSeq }).from(discussionThreadReads)
    .where(and(eq(discussionThreadReads.threadId, threadId), eq(discussionThreadReads.userId, actor.id))).limit(1);
  return row?.throughSeq ?? 0;
}
