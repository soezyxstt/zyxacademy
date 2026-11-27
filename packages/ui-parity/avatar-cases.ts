import { parityFrame } from "./frame";

const avatarSize = 32;

// The data URL is syntactically valid, but its bytes cannot be decoded as a PNG.
export const invalidAvatarImage = "data:image/png;base64,bm90LWEtcG5n";

export const avatarCases = [
  { id: "avatar-image-light", theme: "light", source: "portrait", status: "loaded", label: "Foto profil Adi", initials: "A" },
  { id: "avatar-error-light", theme: "light", source: "invalid", status: "error", label: "Foto profil Bima", initials: "B" },
  { id: "avatar-initials-dark", theme: "dark", source: "none", status: "idle", label: "Foto profil Dita Putri Sari", initials: "DPS" },
] as const;

export type AvatarCaseSpec = (typeof avatarCases)[number];

export const avatarPosition = {
  position: "absolute",
  left: (parityFrame.width - avatarSize) / 2,
  top: (parityFrame.height - avatarSize) / 2,
  width: avatarSize,
  height: avatarSize,
} as const;
