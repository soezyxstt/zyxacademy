import Link from "next/link";
import { ProfileAvatar } from "@/app/(student)/profile/profile-avatar";
import type { BadgeFamily } from "@/lib/gamification/contracts";
import { CollectibleFrame } from "./collectible-frame";

/** Supply publicId only when the viewer is authorized to open the profile. */
export type StudentAvatarProps = {
  name: string;
  image?: string | null;
  publicId?: string | null;
  /** @deprecated Badge artwork is no longer used as an avatar. */
  badge?: { family: BadgeFamily; tier: number } | null;
  /** @deprecated Avatars always show the user's photo or initial. */
  mode?: "photo" | "badge";
  frameId?: string | null;
  themeId?: string | null;
  size?: number;
  animated?: boolean;
};

export function StudentAvatar({ name, image, publicId, frameId, themeId, size = 48, animated = false }: StudentAvatarProps) {
  const avatar = <CollectibleFrame frameId={frameId} size={size} animated={animated} className={themeId === "theme-academy" ? "bg-brand-primary/20" : undefined}><ProfileAvatar name={name} image={image} /></CollectibleFrame>;
  return publicId ? <Link href={`/students/${encodeURIComponent(publicId)}`} aria-label={name} className="inline-block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{avatar}</Link> : avatar;
}
