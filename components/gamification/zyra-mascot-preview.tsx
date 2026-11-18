"use client";

import { useId, useState } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { getZyraAvatar } from "@/lib/gamification/zyra-cosmetics";
import { getZyraGlbMascot } from "@/lib/gamification/zyra-glb-mascots";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ZyraMascot3D, type ZyraMascot3DProps } from "./zyra-mascot-3d";

const actionLabels: Readonly<Record<string, string>> = {
  idle: "idle",
  happy: "happy",
  thinking: "thinking",
  waiting: "waiting",
  explaining: "explaining",
  apologizing: "apologizing",
  thumbsUp: "thumbsUp",
};

/** A selected large preview only. Catalog rows and chat icons keep using posters. */
export function ZyraMascotPreview({
  cosmeticId,
  animated = true,
  ...viewerProps
}: Omit<ZyraMascot3DProps, "animationName">) {
  const t = useTranslations("student");
  const selectId = useId();
  const metadata = getZyraGlbMascot(getZyraAvatar(cosmeticId)?.glbCharacter);
  const actions = metadata?.previewAnimations.filter(name => Object.hasOwn(actionLabels, name)) ?? [];
  const [selection, setSelection] = useState({ cosmeticId, animationName: "idle" });

  // Reset the control when the character changes while keeping the same 3D canvas.
  if (selection.cosmeticId !== cosmeticId) {
    setSelection({ cosmeticId, animationName: "idle" });
  }
  const animationName = selection.cosmeticId === cosmeticId && actions.some(name => name === selection.animationName)
    ? selection.animationName
    : "idle";

  return <div className="flex min-w-0 max-w-full flex-col items-center gap-3" data-testid="mascot-action-preview">
    <ZyraMascot3D {...viewerProps} cosmeticId={cosmeticId} animated={animated} animationName={animationName} />
    {actions.length > 1 && <div className="flex w-full max-w-64 items-center gap-3">
      <label htmlFor={selectId} className="shrink-0 text-body-sm">{t("cosmeticsStudio.action")}</label>
      <Select value={animationName} disabled={!animated} onValueChange={value => {
        if (actions.some(name => name === value)) setSelection({ cosmeticId, animationName: value });
      }}>
        <SelectTrigger id={selectId} data-testid="mascot-animation-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {actions.map(name => <SelectItem key={name} value={name}>{t(`cosmeticsStudio.actions.${actionLabels[name]}`)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>}
  </div>;
}
