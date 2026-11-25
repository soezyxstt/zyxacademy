"use client";
import { createContext, useContext } from "react";
import { ZyraCosmeticAvatar } from "@/components/gamification/zyra-cosmetic-avatar";
import { ZyraBubbleSkin } from "@/components/gamification/zyra-bubble-skin";
import type { ReactNode } from "react";

export function TutorStudentMessage({ children }: { children: ReactNode }) {
  return <div className="flex justify-end"><div className="min-w-0 max-w-[85%] rounded-2xl bg-muted/90 text-foreground px-4 py-3 text-body-base shadow-2xs space-y-3">{children}</div></div>;
}
export const TutorAppearanceContext = createContext<{skinId: string | null; avatarId: string | null; petAccess?: boolean}>({skinId: null, avatarId: null});
export function TutorAssistantSurface({children}: {children: ReactNode}) {
 const appearance = useContext(TutorAppearanceContext);
 return <ZyraBubbleSkin skinId={appearance.skinId} role="assistant">{children}</ZyraBubbleSkin>;
}
export function TutorAssistantLabel({ label = "Zyra" }: { label?: string } = {}) {
  const appearance = useContext(TutorAppearanceContext);
  return <div className="flex items-center gap-1.5"><ZyraCosmeticAvatar cosmeticId={appearance.avatarId} headOnly size={28} /><span className="font-heading text-body-xs font-bold text-brand-primary">{label}</span></div>;
}
