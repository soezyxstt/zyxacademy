"use server";

import { cosmeticEquipInput } from "@/lib/gamification/cosmetic-slots";
import { revalidatePath } from "next/cache";
import { requireStudentGamificationAccess } from "@/lib/gamification/access";
import { equipGamificationCosmetics, purchaseGamificationCosmetic } from "@/lib/gamification/rewards";
import type { CosmeticSlot } from "@/lib/gamification/contracts";

export async function changeReward(id: string, operation: "buy" | "equip" | "remove", slot: CosmeticSlot) {
  try {
    const { user } = await requireStudentGamificationAccess();
    if (typeof id !== "string" || id.length > 128) throw new Error("Invalid reward");
    if (operation === "buy") await purchaseGamificationCosmetic(user.id, id);
    else if (operation === "equip") await equipGamificationCosmetics(user.id, cosmeticEquipInput(slot, id));
    else if (operation === "remove" && (slot === "pet_action" || slot === "pet_suit")) {
      await equipGamificationCosmetics(user.id, slot === "pet_action" ? {petActionId:null} : {petSuitId:null});
    } else throw new Error("Invalid operation");
    revalidatePath("/pet");
    revalidatePath("/profile");
    revalidatePath("/achievements");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
