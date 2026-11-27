import { Image, type ImageSourcePropType } from "react-native";
import { rankLabels } from "../../../../../packages/student-community/labels";

// Bundled PNGs from public/gamification/rank--*.svg, including the original transparent margins.
const artwork: Record<keyof typeof rankLabels, ImageSourcePropType> = {
  rakyat: require("../../../assets/ranks/rakyat.png"),
  kades: require("../../../assets/ranks/kades.png"),
  camat: require("../../../assets/ranks/camat.png"),
  bupati: require("../../../assets/ranks/bupati.png"),
  gubernur: require("../../../assets/ranks/gubernur.png"),
  presiden: require("../../../assets/ranks/presiden.png"),
};

export function RankArtwork({ rank, size }: { rank: string; size: number }) {
  const key = rank.toLowerCase();
  if (!Object.hasOwn(artwork, key)) return null;
  return <Image accessible={false} source={artwork[key as keyof typeof artwork]} resizeMode="contain" style={{ width: size, height: size }} />;
}
