"use server";
import { requireStudentGamificationAccess } from "@/lib/gamification/access";
import { equipGamificationCosmetics } from "@/lib/gamification/rewards";
import type { EquipGamificationCosmeticsInput } from "@/lib/gamification/contracts";
export async function equipProfileCosmetics(input: EquipGamificationCosmeticsInput) {
 const { user } = await requireStudentGamificationAccess();
 await equipGamificationCosmetics(user.id, input);
}
