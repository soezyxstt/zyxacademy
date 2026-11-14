import { ZyraCosmeticAvatar } from "./zyra-cosmetic-avatar";
import { ZyraBubbleSkin } from "./zyra-bubble-skin";
import { StudentAvatar, type StudentAvatarProps } from "./student-avatar";
import type { GamificationReward } from "@/lib/gamification/contracts";

export function CosmeticPreview({ item, appearance }: { item: GamificationReward; appearance: StudentAvatarProps }) {
  if (item.slot === "zyra_avatar") return <ZyraCosmeticAvatar cosmeticId={item.id} size={56} name={item.name} />;
  if (item.slot === "zyra_skin") return <ZyraBubbleSkin skinId={item.id} role="assistant"><span className="text-body-xs">Zyra</span></ZyraBubbleSkin>;
  return <div className="flex items-center gap-2"><StudentAvatar {...appearance} frameId={item.slot === "frame" ? item.id : appearance.frameId} themeId={item.slot === "theme" ? item.id : appearance.themeId} />{item.slot === "title" && <span className="text-body-xs">{item.name}</span>}</div>;
}
