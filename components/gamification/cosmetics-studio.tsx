"use client";

import { useState } from "react";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { cosmeticNameKeys } from "@/lib/gamification/labels";
import { ZyraMascotPreview } from "./zyra-mascot-preview";
import { Check, Copy, ThumbsUp } from "lucide-react";
import { FRAME_COLLECTIONS } from "@/lib/gamification/collection-art";
import { ZYRA_AVATARS, ZYRA_CHAT_SKINS } from "@/lib/gamification/zyra-cosmetics";
import { ZyraBubbleSkin } from "./zyra-bubble-skin";
import { ZyraCosmeticAvatar } from "./zyra-cosmetic-avatar";
import { CollectibleFrame } from "./collectible-frame";
import { ProfileAvatar } from "@/app/(student)/profile/profile-avatar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type CosmeticsStudioProps = {
  appearance: { name: string; image?: string | null; frameId?: string | null };
  prices?: Readonly<Record<string, number>>;
};

export function CosmeticsStudio({ appearance, prices }: CosmeticsStudioProps) {
  const t = useTranslations("student");
  const { locale } = useAppLocale();
  const number = new Intl.NumberFormat(locale);
  const name = (item: { id: string; name: { id: string } }) => t(`gamificationUi.${cosmeticNameKeys[item.id]}`) || item.name.id;
  const [frameId, setFrameId] = useState<string>(appearance.frameId && FRAME_COLLECTIONS.some(item => item.id === appearance.frameId) ? appearance.frameId : FRAME_COLLECTIONS[0].id);
  const [animated, setAnimated] = useState(true);
  const [skinId, setSkinId] = useState<string>(ZYRA_CHAT_SKINS[0].id);
  const [mascotId, setMascotId] = useState<string>(ZYRA_AVATARS[0].id);
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(false);
  const active = FRAME_COLLECTIONS.find(item => item.id === frameId)!;
  const identity = <ProfileAvatar name={appearance.name} image={appearance.image}/>;
  return <TooltipProvider><div className="space-y-8" data-testid="cosmetics-studio">
    <section className="grid gap-6 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.4fr)]" aria-label={t("cosmeticsStudio.frames")}>
      <div className="relative flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-2xl border bg-card p-6">
        <div className="mb-3 flex w-full items-center justify-between gap-3"><span className="text-body-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("cosmeticsStudio.collection")}</span></div>
        <div className="flex min-h-64 items-center justify-center" tabIndex={0} aria-label={name(active)}>
          <CollectibleFrame frameId={frameId} size={240} animated={animated}>{identity}</CollectibleFrame>
        </div>
        <h2 className="mt-4 font-heading text-h5 font-bold" aria-live="polite">{name(active)}</h2>
        {prices?.[frameId] !== undefined && <p className="mt-1 text-body-sm text-muted-foreground">{number.format(prices[frameId])} LP</p>}
        <div className="mt-5 flex w-full items-center justify-between gap-4 border-t pt-4"><div className="flex items-center gap-3"><CollectibleFrame frameId={frameId} size={48}>{identity}</CollectibleFrame><span className="text-body-sm">{appearance.name}</span></div></div>
      </div>
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-heading text-body-base font-bold">{t("cosmeticsStudio.chooseFrame")}</h2><label className="flex items-center gap-2 text-body-sm" htmlFor="studio-motion">{t("cosmeticsStudio.motion")}<Switch id="studio-motion" checked={animated} onCheckedChange={setAnimated}/></label></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {FRAME_COLLECTIONS.map(item => <Button variant="outline" key={item.id} type="button" aria-pressed={frameId === item.id} aria-label={`${t("cosmeticsStudio.chooseFrame")} ${name(item)}`} data-frame-id={item.id} onClick={() => setFrameId(item.id)} className={cn("[&>span]:flex-col group relative flex h-auto whitespace-normal min-w-0 flex-col items-center rounded-xl border bg-card p-3 text-center text-body-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring hover:bg-muted/40", frameId === item.id && "border-primary bg-primary/5")}>
            <CollectibleFrame frameId={item.id} size={112}>{identity}</CollectibleFrame>
            <span className="mt-3">{name(item)}</span>
            {frameId === item.id && <Check className="absolute right-2 top-2 size-4 text-primary" aria-hidden="true"/>}
            {prices?.[item.id] !== undefined && <span className="mt-1 text-body-xs text-muted-foreground">{number.format(prices[item.id])} LP</span>}
          </Button>)}
        </div>
      </div>
    </section>
    <section className="grid gap-6 border-t pt-6 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.4fr)]" aria-label={t("cosmeticsStudio.zyraStyle")}>
      <div className="space-y-5"><h2 className="font-heading text-body-base font-bold">{t("cosmeticsStudio.zyraStyle")}</h2>
        <fieldset><legend className="mb-3 text-body-sm font-semibold">{t("cosmeticsStudio.mascot")}</legend><div className="grid grid-cols-2 gap-2">{ZYRA_AVATARS.map(item => <Button key={item.id} variant="outline" data-mascot-id={item.id} aria-pressed={mascotId === item.id} onClick={() => setMascotId(item.id)} className={cn("h-auto min-w-0 justify-start gap-2 whitespace-normal p-2", mascotId === item.id && "border-primary bg-primary/5")}><ZyraCosmeticAvatar cosmeticId={item.id} name={name(item)} size={40} animated={false}/><span className="min-w-0 [overflow-wrap:anywhere]">{name(item)}</span></Button>)}</div></fieldset>
        <fieldset><legend className="mb-3 text-body-sm font-semibold">{t("cosmeticsStudio.bubble")}</legend><div className="flex flex-wrap gap-2">{ZYRA_CHAT_SKINS.map(item => <Button key={item.id} variant="outline" aria-pressed={skinId === item.id} onClick={() => setSkinId(item.id)} className={cn("h-auto rounded-lg px-3 py-2 whitespace-normal", skinId === item.id && "border-primary bg-primary/5")}>{name(item)}</Button>)}</div></fieldset>
      </div>
      <div className="min-w-0 rounded-2xl border bg-card p-4 sm:p-6">
        <div data-testid="selected-mascot" data-selected-mascot-id={mascotId} className="mb-6 flex flex-col items-center gap-3 border-b pb-4">
          <ZyraMascotPreview cosmeticId={mascotId} size={240} animated={animated} />
          <h3 className="font-heading text-body-base font-bold" aria-live="polite">{name(ZYRA_AVATARS.find(item => item.id === mascotId)!)}</h3>
          {prices?.[mascotId] !== undefined && <p className="text-body-sm text-muted-foreground">{number.format(prices[mascotId])} LP</p>}
        </div>
        <div className="mb-6 flex items-center gap-3 border-b pb-4"><ZyraCosmeticAvatar cosmeticId={mascotId} name="Zyra" size={56} animated={false}/><div><h3 className="font-heading text-body-base font-bold">Zyra</h3><p className="text-body-xs text-muted-foreground">{t("cosmeticsStudio.course")}</p></div></div>
        <div className="mb-4 flex items-start justify-end gap-2"><div className="max-w-[85%] rounded-xl bg-muted p-3 text-body-sm">{t("cosmeticsStudio.question")}</div><span className="block size-8 shrink-0"><ProfileAvatar {...appearance}/></span></div>
        <div className="flex items-start gap-2"><ZyraCosmeticAvatar cosmeticId={mascotId} name="Zyra" size={36} animated={false}/><div className="min-w-0 flex-1"><ZyraBubbleSkin skinId={skinId} role="assistant"><div className="space-y-3 text-body-sm leading-relaxed"><p>{t("cosmeticsStudio.explanation")}</p><p className="font-semibold">f′(x) = 2x</p><p>{t("cosmeticsStudio.followup")}</p></div></ZyraBubbleSkin>
        <div className="mt-2 flex items-center gap-1">
          <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={copied ? t("cosmeticsStudio.copiedAnswer") : t("cosmeticsStudio.copyAnswer")} onClick={async () => { try { await navigator.clipboard.writeText("f′(x) = 2x"); setCopied(true); } catch { setCopied(false); } }}>{copied ? <Check className="size-4"/> : <Copy className="size-4"/>}</Button></TooltipTrigger><TooltipContent>{copied ? t("cosmeticsStudio.copied") : t("cosmeticsStudio.copyAnswer")}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" aria-label={t("cosmeticsStudio.helpfulAnswer")} aria-pressed={liked} onClick={() => setLiked(!liked)}><ThumbsUp className={cn("size-4", liked && "text-primary")}/></Button></TooltipTrigger><TooltipContent>{t("cosmeticsStudio.helpful")}</TooltipContent></Tooltip>
        </div></div></div>
      </div>
    </section>
  </div></TooltipProvider>;
}
