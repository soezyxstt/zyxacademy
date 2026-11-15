"use server";

import { COSMETIC_FIELDS, cosmeticEquipInput } from "@/lib/gamification/cosmetic-slots";
import { revalidatePath } from "next/cache";
import { requireStudentGamificationAccess } from "@/lib/gamification/access";
import { equipGamificationCosmetics, purchaseGamificationCosmetic } from "@/lib/gamification/rewards";
import type { CosmeticSlot } from "@/lib/gamification/contracts";

export async function changeReward(id: string, operation: "buy" | "equip", slot: CosmeticSlot) {
  try {
    const { user } = await requireStudentGamificationAccess();
    if (typeof id !== "string" || id.length > 128 || !COSMETIC_FIELDS.some(field => field.slot === slot)) throw new Error("Invalid reward");
    if (operation === "buy") await purchaseGamificationCosmetic(user.id, id);
    else if (operation === "equip") await equipGamificationCosmetics(user.id, cosmeticEquipInput(slot, id));
    else throw new Error("Invalid operation");
    revalidatePath("/achievements");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
