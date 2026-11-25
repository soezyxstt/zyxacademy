"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAppReducedMotion } from "@/components/appearance-preferences";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { changeReward } from "@/app/(student)/achievements/actions";
import type { GamificationReward } from "@/lib/gamification/contracts";
import { cosmeticNameKeys } from "@/lib/gamification/labels";
import { DEFAULT_PET_ID, petForAction, petSupportsAction } from "@/lib/gamification/pet-studio";
import { useTranslations, useAppLocale } from "@/lib/i18n/client";
import { ZyraCosmeticAvatar } from "./zyra-cosmetic-avatar";
import { ZyraMascot3D } from "./zyra-mascot-3d";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ZyraMascotPreview } from "./zyra-mascot-preview";
import { CatPractice } from "./cat-practice";

const slots = ["zyra_avatar", "pet_suit", "pet_action"] as const;
const freeZyra: GamificationReward = {
  id: DEFAULT_PET_ID,
  name: "Zyra",
  slot: "zyra_avatar",
  priceLp: 0,
  owned: true,
  equipped: false,
};

export function StudentPetStudio({ rewards, balance, onChangeReward }: { rewards: GamificationReward[]; balance: number; onChangeReward?: typeof changeReward }) {
  const t = useTranslations("student");
  const { locale } = useAppLocale();
  const reducedMotion = useAppReducedMotion();
  const format = new Intl.NumberFormat(locale);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [playing, setPlaying] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState(false);
  const active = (slot: string) => rewards.find(item => item.slot === slot && item.equipped && item.owned);
  const pet = active("zyra_avatar")?.id ?? DEFAULT_PET_ID;
  const suit = active("pet_suit")?.id;
  const action = active("pet_action")?.id;
  const name = (id: string) => t(`gamificationUi.${cosmeticNameKeys[id]}`);
  function change(item: GamificationReward, operation: "equip" | "buy" | "remove") {
    setError(false);
    start(async () => {
      try {
        const result = await (onChangeReward ?? changeReward)(item.id, operation, item.slot);
        if (!result.ok) throw new Error();
        if (!onChangeReward) router.refresh();
      } catch { setError(true); }
    });
  }
  const collection = rewards.some(item => item.id === DEFAULT_PET_ID) ? rewards : [freeZyra, ...rewards];
  return <div className="flex min-w-0 flex-wrap gap-(--section-gap)">
    <section aria-label={t("petStudio.active")} className="flex min-w-0 flex-[1_1_15rem] flex-col items-center gap-2">
      {playing || previewing ? <ZyraCosmeticAvatar cosmeticId={pet} size={240} /> : <ZyraMascot3D animated={!reducedMotion} cosmeticId={pet} size={240} practiceSuit={suit?.replace("pet-suit-", "")} practiceFlowers={action === "pet-action-giveFlowers"} practiceCycle={action === "pet-action-cycle"} animationName={action?.replace("pet-action-", "")} />}
      <h2 className="font-heading text-body-base font-bold">{name(pet)}</h2>
      <CatPractice rewards={rewards} onOpenChange={setPlaying} />
    </section>
    <section className="min-w-0 flex-[2_1_28rem]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2"><h2 className="font-heading text-body-base font-bold">{t("petStudio.collection")}</h2><span className="text-body-sm tabular-nums">{t("achievementPage.balance")} {format.format(balance)} LP</span></div>
      {error && <p role="alert" className="text-body-xs text-status-error">{t("achievementPage.error")}</p>}
      <Tabs defaultValue="zyra_avatar"><TabsList variant="inline">{slots.map(slot => <TabsTrigger key={slot} value={slot}>{t(`petStudio.${slot}`)}</TabsTrigger>)}</TabsList>
        {slots.map(slot => {
          const items = collection.filter(item => item.slot === slot);
          return <TabsContent key={slot} value={slot}>
            {items.length === 0 ? <AdminEmptyState compact title={t("petStudio.unavailable")} /> : <ul className="divide-y divide-border/25">{items.map(item => {
          const free = item.id === DEFAULT_PET_ID;
          const owned = free || item.owned;
          const equipped = slot === "zyra_avatar" ? pet === item.id : item.equipped;
          const incompatible = slot === "pet_action" && !petSupportsAction(pet, item.id);
          const requiredPet = incompatible ? petForAction(item.id) : null;
          const insufficient = !owned && balance < item.priceLp;
          const removable = equipped && slot !== "zyra_avatar";
          return <li key={item.id} className="flex items-center gap-3 py-3">
            {slot === "zyra_avatar" && <ZyraCosmeticAvatar cosmeticId={item.id} size={56} name={name(item.id)} />}
            <div className="min-w-0 flex-1"><span className="text-body-sm font-semibold">{name(item.id)}</span>
              <p className="text-body-xs text-muted-foreground">{owned ? t(equipped ? "achievementPage.equipped" : "achievementPage.owned") : format.format(item.priceLp) + " LP"}</p>
              {requiredPet && <p className="text-body-xs text-muted-foreground">{t("petStudio.forPet",{pet:name(requiredPet)})}</p>}
              {insufficient && <p className="text-body-xs text-muted-foreground">{t("achievementPage.insufficient")}</p>}
            </div>
            <Dialog onOpenChange={setPreviewing}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" aria-label={t("petStudio.tryItem", { item: name(item.id) })}>{t("petStudio.try")}</Button>
              </DialogTrigger>
              <DialogContent aria-describedby={undefined}>
                <DialogTitle>{t("petStudio.tryItem", { item: name(item.id) })}</DialogTitle>
                {slot === "zyra_avatar" ? <ZyraMascotPreview animated={!reducedMotion} cosmeticId={item.id} size={240} /> :
                  <div className="flex flex-col items-center gap-2">
                    <ZyraMascot3D animated={!reducedMotion} cosmeticId={requiredPet ?? pet} size={240}
                      practiceSuit={(slot === "pet_suit" ? item.id : suit)?.replace("pet-suit-", "")}
                      animationName={slot === "pet_action" ? item.id.replace("pet-action-", "") : "idle"}
                      practiceCycle={item.id === "pet-action-cycle"} practiceFlowers={item.id === "pet-action-giveFlowers"} />
                    <span className="text-body-sm">{name(requiredPet ?? pet)}</span>
                  </div>}
              </DialogContent>
            </Dialog>
            {(!equipped || removable) && <Button size="sm" variant={owned ? "outline" : "default"} disabled={pending || insufficient || (owned && incompatible && !removable)} onClick={() => change(item, removable ? "remove" : owned ? "equip" : "buy")}>{t(removable ? "petStudio.remove" : owned ? "achievementPage.equip" : "achievementPage.buy")}</Button>}
          </li>;
        })}</ul>}
          </TabsContent>;
        })}
      </Tabs>
    </section>
  </div>;
}
