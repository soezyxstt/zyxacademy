import { ZyraCosmeticAvatar } from "./zyra-cosmetic-avatar";
import { ZyraMascotPreview } from "./zyra-mascot-preview";
import { ZyraBubbleSkin } from "./zyra-bubble-skin";
import { StudentAvatar, type StudentAvatarProps } from "./student-avatar";
import type { GamificationReward } from "@/lib/gamification/contracts";

type PreviewLabels = { before: string; after: string; explanation: string; followup: string };

export function CosmeticPreview({ item, appearance, detailed = false, labels }: { item: GamificationReward; appearance: StudentAvatarProps; detailed?: boolean; labels?: PreviewLabels }) {
  if (item.slot === "zyra_avatar") return detailed
    ? <ZyraMascotPreview cosmeticId={item.id} size={220} />
    : <ZyraCosmeticAvatar cosmeticId={item.id} size={56} name={item.name} />;
  if (item.slot === "zyra_skin") {
    if (!detailed || !labels) return <ZyraBubbleSkin skinId={item.id} role="assistant"><span className="text-body-xs">Zyra</span></ZyraBubbleSkin>;
    const message = <div className="space-y-3 text-body-sm leading-relaxed"><p>{labels.explanation}</p><p className="font-semibold">f′(x) = 2x</p><p>{labels.followup}</p></div>;
    return <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-2"><h3 className="text-body-sm font-semibold">{labels.before}</h3><div className="rounded-xl border bg-card p-3">{message}</div></div>
      <div className="min-w-0 space-y-2"><h3 className="text-body-sm font-semibold">{labels.after}</h3><ZyraBubbleSkin skinId={item.id} role="assistant">{message}</ZyraBubbleSkin></div>
    </div>;
  }
  return <div className={detailed ? "flex flex-col items-center gap-3 text-center" : "flex items-center gap-2"}>
    <StudentAvatar {...appearance} frameId={item.slot === "frame" ? item.id : appearance.frameId} themeId={item.slot === "theme" ? item.id : appearance.themeId} size={detailed ? 200 : 48} animated={detailed} />
    {detailed && <span className="text-body-sm font-semibold">{appearance.name}</span>}
    {detailed && item.slot === "title" && <span className="text-body-xs">{item.name}</span>}
  </div>;
}
