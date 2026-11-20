"use server";

import { getAuthSession } from "@/lib/auth-session";
import { completeGamificationExplanation } from "@/lib/gamification/receipts";

export async function completeExplanationAction(collectionId: string, version: number, itemIds: string[]) {
  const session = await getAuthSession();
  if (!session?.user?.id || !Number.isSafeInteger(version) || version < 1) throw new Error("EXPLANATION_UNAVAILABLE");
  await completeGamificationExplanation(session.user.id, collectionId, itemIds, version);
}
