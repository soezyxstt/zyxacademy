"use client";
import { useAppLocale } from "@/lib/i18n/client";
import { getZyraAvatar } from "@/lib/gamification/zyra-cosmetics";
import { ZyraMascot3D } from "./zyra-mascot-3d";
import { ZyraCosmeticAvatar } from "./zyra-cosmetic-avatar";

/** Large profile presentation only. Identity rows retain lightweight static avatars. */
export function ProfileMascot({ cosmeticId, suitId, actionId }: { cosmeticId?: string | null; suitId?: string | null; actionId?: string | null }) {
  const { locale } = useAppLocale();
  const mascot = getZyraAvatar(cosmeticId);
  if (!mascot) return null;
  return <div className="flex shrink-0 flex-col items-center text-center" data-profile-mascot={mascot.id}>
    {suitId || actionId ? <ZyraMascot3D cosmeticId={cosmeticId} size={128} animationName={actionId?.replace("pet-action-", "")} practiceSuit={suitId?.replace("pet-suit-", "")} practiceCycle={actionId === "pet-action-cycle"} /> : <ZyraCosmeticAvatar cosmeticId={mascot.id} name={mascot.name[locale === "en" ? "en" : "id"]} size={128} interactive={Boolean(cosmeticId)} animated />}
    <span className="max-w-36 text-body-xs text-muted-foreground">{mascot.name[locale === "en" ? "en" : "id"]}</span>
  </div>;
}
