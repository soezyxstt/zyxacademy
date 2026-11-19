"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, Inbox, Plus } from "lucide-react";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { useRouter } from "next/navigation";
import { cosmeticNameKeys } from "@/lib/gamification/labels";
import { CatPractice } from "./cat-practice";
import { CosmeticPreview } from "./cosmetic-preview";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { changeReward } from "@/app/(student)/achievements/actions";
import type { StudentAvatarProps } from "./student-avatar";
import type { CosmeticSlot, GamificationReward } from "@/lib/gamification/contracts";

const slots: CosmeticSlot[] = ["frame", "title", "theme", "zyra_skin", "zyra_avatar", "pet_action", "pet_suit"];

export function RewardList({ rewards, balance, appearance, onChangeReward, missionsHref = "/achievements?tab=missions" }: { rewards: GamificationReward[]; balance: number; appearance: StudentAvatarProps; onChangeReward?: (id: string, action: "buy" | "equip", slot: CosmeticSlot) => Promise<{ ok: boolean }>; missionsHref?: string }) {
  const t = useTranslations("student");
  const { locale } = useAppLocale();
  const number = new Intl.NumberFormat(locale);
  const name = (item: GamificationReward) => cosmeticNameKeys[item.id] ? t(`gamificationUi.${cosmeticNameKeys[item.id]}`) : item.name;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selected, setSelected] = useState<GamificationReward | null>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();
  const displayAppearance = { ...appearance, mode: "photo" as const, badge: null, publicId: null };
  const insufficientBalance = (item: GamificationReward) => !item.owned && balance < item.priceLp && (
    <span className="block text-body-xs text-muted-foreground">{t("achievementPage.insufficient")}</span>
  );
  const accessory = (item: GamificationReward) => item.slot === "pet_action" || item.slot === "pet_suit";
  const action = (item: GamificationReward) => item.id === "zyra-avatar-studio-cat" ? <span className="text-body-xs">{t("petStudio.free")}</span> : accessory(item) && item.owned ? <span className="text-body-xs">{t("achievementPage.owned")}</span> : <Button disabled={pending || item.equipped || (!item.owned && balance < item.priceLp)} variant={item.owned ? "outline" : "default"} onClick={() => {
    setError(false); setSuccess(false); setPendingId(item.id);
    startTransition(async () => { try { const result = await (onChangeReward ?? changeReward)(item.id, item.owned ? "equip" : "buy", item.slot); if (!result.ok) setError(true); else { setSuccess(true); if (!onChangeReward) router.refresh(); } } catch { setError(true); } finally { setPendingId(null); } });
  }}>
    {pending && pendingId === item.id ? t("achievementPage.wait") : item.equipped ? t("achievementPage.equipped") : item.owned ? t("achievementPage.equip") : t("achievementPage.buy")}
  </Button>;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><p className="text-body-sm font-semibold">{t("achievementPage.balance")}: {number.format(balance)} LP</p><TooltipProvider><Tooltip><TooltipTrigger asChild><Button asChild variant="outline" size="icon"><Link href={missionsHref} aria-label={t("achievementPage.goToMissions")}><Plus className="size-4" /></Link></Button></TooltipTrigger><TooltipContent>{t("achievementPage.goToMissions")}</TooltipContent></Tooltip></TooltipProvider>
      <CatPractice rewards={rewards} />
      {!onChangeReward && <Button asChild variant="outline"><Link href="/pet">{t("petStudio.open")}</Link></Button>}
    </div>
    {error && <p role="alert" className="text-body-sm text-destructive">{t("achievementPage.error")}</p>}
    {success && <p role="status" className="text-body-sm">{t("achievementPage.success")}</p>}
    {rewards.length === 0 ? <AdminEmptyState icon={Inbox} title={t("achievementPage.noRewards")} /> : <div className="divide-y divide-border">
      {slots.map(slot => {
        const items = rewards.filter(item => item.slot === slot && (item.slot !== "zyra_avatar" || item.id.startsWith("zyra-avatar-studio-")));
        if (!items.length) return null;
        return <Collapsible key={slot} defaultOpen={slot === "frame"}>
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-body-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
            {t(slot === "pet_action" ? "petStudio.pet_action" : `achievementPage.rewardGroups.${slot}`)}<ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent><ul className="divide-y divide-border border-t">{items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            {accessory(item) ? <span className="min-w-0 flex-1 break-words text-body-sm">{name(item)} · {number.format(item.priceLp)} LP{insufficientBalance(item)}</span> : <button type="button" onClick={event => { previewTrigger.current = event.currentTarget; setSelected(item); }} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label={t("achievementPage.previewItem", { name: name(item) })}>
              <div className="shrink-0"><CosmeticPreview item={{ ...item, name: name(item) }} appearance={displayAppearance} /></div>
              <span className="min-w-0"><span className="block break-words text-body-sm font-semibold">{name(item)}</span><span className="block text-body-xs text-muted-foreground">{number.format(item.priceLp)} LP{item.owned && !item.equipped ? ` · ${t("achievementPage.owned")}` : ""}</span>{insufficientBalance(item)}</span>
            </button>}
            {action(item)}
          </li>)}</ul></CollapsibleContent>
        </Collapsible>;
      })}
    </div>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
      {selected && <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); previewTrigger.current?.focus(); }}>
        <DialogHeader><DialogTitle>{name(selected)}</DialogTitle></DialogHeader>
        <div className="flex min-w-0 justify-center py-2"><CosmeticPreview item={{ ...selected, name: name(selected) }} appearance={displayAppearance} detailed labels={{ before: t("achievementPage.before"), after: t("achievementPage.after"), explanation: t("achievementPage.previewExplanation"), followup: t("achievementPage.previewFollowup") }} /></div>
        <p className="text-body-sm">{number.format(selected.priceLp)} LP</p>
      </DialogContent>}
    </Dialog>
  </div>;
}
