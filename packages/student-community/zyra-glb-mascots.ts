/** Lightweight asset registry. Safe to import in catalogs without loading Three. */
import { PET_SUITS } from "./pet-studio";

export const GLB_CHARACTERS = ["cat", "tiger", "rhino", "crocodile"] as const;
export type GlbCharacter = (typeof GLB_CHARACTERS)[number];
export type GlbMascotKey = `studio-${GlbCharacter}`;

export const MASCOT_PREVIEW_ANIMATIONS = [
  "idle", "happy", "thinking", "waiting", "explaining", "apologizing", "thumbsUp",
] as const;
export type MascotPreviewAnimation = (typeof MASCOT_PREVIEW_ANIMATIONS)[number];

const ASSET_ROOT = "/gamification/mascots/v10.1";
export type GlbMascot = {
  character: GlbCharacter;
  key: GlbMascotKey;
  src: string;
  headSrc: string;
  poster: string;
  animations: readonly string[];
  previewAnimations: readonly MascotPreviewAnimation[];
};

export const ZYRA_GLB_MASCOTS: readonly GlbMascot[] = GLB_CHARACTERS.map(character => {
  const stem = character === "cat" ? "base" : character;
  const extraAnimations = {
    cat: ["jump", "cycle", "fly", "basketball"],
    tiger: ["crawl", "roar", "prowlRoar"],
    rhino: ["charge"],
    crocodile: ["giveFlowers", "beachLounge"],
  };
  return {
    character,
    key: `studio-${character}`,
    src: `${ASSET_ROOT}/models/${stem}-full.glb`,
    headSrc: `${ASSET_ROOT}/models/${stem}-head.glb`,
    poster: `${ASSET_ROOT}/posters/${character}.webp`,
    animations: [...MASCOT_PREVIEW_ANIMATIONS, ...extraAnimations[character]],
    // Special actions remain in the assets; prop attachment needs the wardrobe pass.
    previewAnimations: MASCOT_PREVIEW_ANIMATIONS,
  };
});

export function getZyraGlbMascot(character?: string | null) {
  return ZYRA_GLB_MASCOTS.find(model => model.character === character);
}

export function getZyraGlbMascotByKey(key: string) {
  return ZYRA_GLB_MASCOTS.find(model => model.key === key);
}

export function getZyraGlbSuitSrc(character: GlbCharacter, suit: string) {
  const outfit = PET_SUITS.find(({ assetId }) => assetId === suit);
  if (!outfit) return undefined;

  const folder = character === "cat" ? "items" : `items/${character}`;
  return `${ASSET_ROOT}/models/${folder}/${outfit.assetId}.glb`;
}

export function resolveMascotAnimation(model: GlbMascot, requested?: string) {
  return model.previewAnimations.find(name => name === requested) ?? "idle";
}
