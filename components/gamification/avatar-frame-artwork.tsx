import Image from "next/image";
import { getFrameCollection } from "@/lib/gamification/collection-art";

/** Compatibility artwork for consumers that supply their own photo aperture. */
export function AvatarFrameArtwork({ frameId, size = 48, className }: { frameId?: string | null; size?: number; className?: string }) {
 const frame = getFrameCollection(frameId);
 if (!frame) return null;
 return <Image src={frame.src} alt="" aria-hidden="true" width={size} height={size} className={className} />;
}
export function isAvatarFrameId(frameId?: string | null): boolean { return !!getFrameCollection(frameId); }
