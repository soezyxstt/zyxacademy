"use server";
import { requireStudentGamificationAccess } from "@/lib/gamification/access";
import { getEquippedZyraAppearance } from "@/lib/gamification/queries";

/** Optional decoration must never prevent chat from opening. */
export async function getMyZyraAppearance() {
 try {
  const { user } = await requireStudentGamificationAccess();
  return await getEquippedZyraAppearance(user.id);
 } catch { return { skinId: null, avatarId: null }; }
}
