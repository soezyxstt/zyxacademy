"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { useRouter } from "next/navigation";
import { cosmeticNameKeys } from "@/lib/gamification/labels";
import { CosmeticPreview } from "./cosmetic-preview";
import { Button } from "@/components/ui/button";
import { changeReward } from "@/app/(student)/achievements/actions";
import type { StudentAvatarProps } from "./student-avatar";
import type { GamificationReward } from "@/lib/gamification/contracts";

export function RewardList({ rewards, balance, appearance }: { rewards: GamificationReward[]; balance: number; appearance: StudentAvatarProps }) {
  const t = useTranslations("student");
  const name = (item: GamificationReward) => cosmeticNameKeys[item.id] ? t(`gamificationUi.${cosmeticNameKeys[item.id]}`) : item.name;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  return <div className="space-y-3"><p className="text-body-sm">{t("achievementPage.balance")}: {balance} LP</p>
    {error && <p role="alert" className="text-body-sm text-destructive">{t("achievementPage.error")}</p>}
    {success && <p role="status" className="text-body-sm">{t("achievementPage.success")}</p>}
    <ul className="divide-y divide-border rounded-xl border bg-card">{rewards.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3"><CosmeticPreview item={{ ...item, name: name(item) }} appearance={{ ...appearance, mode: "photo", badge: null }} /><div><p className="text-body-sm font-semibold">{name(item)}</p><p className="text-body-xs text-muted-foreground">{({ frame: t("profileCustomization.frame"), theme: t("profileCustomization.theme"), title: t("profileCustomization.title"), zyra_skin: t("profileCustomization.zyra_skin"), zyra_avatar: t("profileCustomization.zyra_avatar") })[item.slot]} · {item.priceLp} LP</p>{item.owned && !item.equipped && <p className="text-body-xs">{t("achievementPage.owned")}</p>}{!item.owned && balance < item.priceLp && <p className="text-body-xs text-muted-foreground">{t("achievementPage.insufficient")}</p>}</div></div>
      <Button disabled={pending || item.equipped || (!item.owned && balance < item.priceLp)} variant={item.owned ? "outline" : "default"} onClick={() => { setError(false); setSuccess(false); setPendingId(item.id); startTransition(async () => { try { const result = await changeReward(item.id, item.owned ? "equip" : "buy", item.slot); if (!result.ok) setError(true); else { setSuccess(true); router.refresh(); } } catch { setError(true); } finally { setPendingId(null); } }); }}>
        {pending && pendingId === item.id ? (t("achievementPage.wait")) : item.equipped ? (t("achievementPage.equipped")) : item.owned ? (t("achievementPage.equip")) : (t("achievementPage.buy"))}
      </Button>
    </li>)}</ul>
  </div>;
}
