"use client";

import { useEffect, useState } from "react";
import type { GamificationReward } from "@/lib/gamification/contracts";
import { cosmeticNameKeys } from "@/lib/gamification/labels";
import { useTranslations } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ZyraMascot3D } from "./zyra-mascot-3d";

function question() {
  const left = 2 + Math.floor(Math.random() * 8);
  const right = 2 + Math.floor(Math.random() * 8);
  const answer = left * right;
  const start = answer - Math.floor(Math.random() * 3);
  return { left, right, answer, choices: [start, start + 1, start + 2] };
}

function Practice({rewards}: {rewards: GamificationReward[]}) {
  const t = useTranslations("student");
  const [pet, setPet] = useState("zyra-avatar-studio-cat");
  const pets = rewards.filter(item => item.owned && item.slot === "zyra_avatar" && item.id !== "zyra-avatar-studio-cat");
  const cat = pet === "zyra-avatar-studio-cat";
  const fitted = pet.startsWith("zyra-avatar-studio-");
  const [score, setScore] = useState(0);
  const [cheering, setCheering] = useState(false);
  useEffect(() => {
    if (!cheering) return;
    const timer = window.setTimeout(() => setCheering(false), 1500);
    return () => window.clearTimeout(timer);
  }, [cheering, score]);
  const [round, setRound] = useState(question);
  const [miss, setMiss] = useState(false);
  const [action, setAction] = useState("idle");
  const [suit, setSuit] = useState("none");
  const controls = (slot: "pet_action" | "pet_suit", value: string, update: (value: string) => void) => {
    const items = rewards.filter(item => item.owned && item.slot === slot);
    if (!items.length) return null;
    const label = t(`achievementPage.rewardGroups.${slot}`);
    return <Select value={value} onValueChange={update}><SelectTrigger variant="inline" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value={slot === "pet_action" ? "idle" : "none"}>{t(`achievementPage.rewardGroups.${slot === "pet_action" ? "idle" : "plain"}`)}</SelectItem>
        {items.map(item => <SelectItem key={item.id} value={item.id}>{t(`gamificationUi.${cosmeticNameKeys[item.id]}`)}</SelectItem>)}
      </SelectContent></Select>;
  };
  const actionControl = cat ? controls("pet_action", action, setAction) : null;
  const suitControl = fitted ? controls("pet_suit", suit, setSuit) : null;
  return <>
    <div className="flex justify-center"><ZyraMascot3D cosmeticId={pet} size={240} animationReplay={score} animationName={cheering ? "happy" : cat ? action.replace("pet-action-", "") : "idle"} practiceSuit={fitted ? suit.replace("pet-suit-", "") : "none"} practiceCycle={cat && action === "pet-action-cycle"} /></div>
    {(pets.length > 0 || actionControl || suitControl) && <div className="flex flex-wrap items-center gap-2">{pets.length > 0 && <Select value={pet} onValueChange={setPet}><SelectTrigger variant="inline" aria-label={t("cosmeticsStudio.mascot")}><SelectValue /></SelectTrigger><SelectContent>
      <SelectItem value="zyra-avatar-studio-cat">Zyra</SelectItem>{pets.map(item => <SelectItem key={item.id} value={item.id}>{t(`gamificationUi.${cosmeticNameKeys[item.id]}`)}</SelectItem>)}
    </SelectContent></Select>}{actionControl}{suitControl}</div>}
    <p aria-live="polite" className="font-heading text-h5">{round.left} × {round.right} = ?</p>
    <div aria-label={t("achievementPage.rewardGroups.answer")} role="group" className="flex gap-2">{round.choices.map(value => <Button key={value} variant="outline" onClick={() => {
      if (value !== round.answer) { setMiss(true); return; }
      setCheering(true); setMiss(false); setScore(score + 1); setRound(question());
    }}>{value}</Button>)}</div>
    <p role="status" className="text-body-sm">{miss && t("achievementPage.rewardGroups.retry") + " · "}{t("achievementPage.rewardGroups.correct")} {score}</p>
  </>;
}

export function CatPractice({rewards}: {rewards: GamificationReward[]}) {
  const t = useTranslations("student");
  return <Dialog><DialogTrigger asChild><Button variant="outline">{t("achievementPage.rewardGroups.play")}</Button></DialogTrigger>
    <DialogContent aria-describedby={undefined} className="max-h-[90dvh] overflow-auto"><DialogTitle>{t("achievementPage.rewardGroups.play")}</DialogTitle><Practice rewards={rewards} /></DialogContent>
  </Dialog>;
}
