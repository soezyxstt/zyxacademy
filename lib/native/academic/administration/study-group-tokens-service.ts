import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { enrollmentTokens, groups } from "@/db/schema";
import type { StudyGroupTokensRead } from "@/packages/academic/study-group-tokens";

export async function readNativeStudyGroupTokens(groupId: string): Promise<StudyGroupTokensRead | null> {
  const rows = await db.select({
    groupId: groups.id,
    activation: { id: enrollmentTokens.id, token: enrollmentTokens.token, capacity: enrollmentTokens.capacity },
  }).from(groups)
    .leftJoin(enrollmentTokens, eq(enrollmentTokens.groupId, groups.id))
    .where(eq(groups.id, groupId))
    .orderBy(asc(enrollmentTokens.createdAt), asc(enrollmentTokens.id));
  if (!rows.length) return null;
  return { groupId, tokens: rows.flatMap(row => row.activation ? [row.activation] : []) };
}
