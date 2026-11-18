import type { MascotModelKey } from './zyra-mascot-models';
import type { GlbCharacter } from './zyra-glb-mascots';

export type ZyraAvatar = {
  id: string;
  name: { id: string; en: string };
  src: string;
  species: string;
  motion: 'breathe';
  modelKey?: MascotModelKey;
  glbCharacter?: GlbCharacter;
};

/** Companions belong to Zyra, never the user's identity. Persisted IDs stay stable. */
export const ZYRA_AVATARS: readonly ZyraAvatar[] = [
  { id: "zyra-avatar-komodo", modelKey: "komodo", name: { id: "Komodo cendekia", en: "Komodo scholar" }, src: "/gamification/collections/models/komodo-poster-v39.png", species: "Varanus komodoensis", motion: "breathe" },
  { id: "zyra-avatar-jalak", modelKey: "jalak", name: { id: "Jalak Bali ceria", en: "Bright Bali myna" }, src: "/gamification/collections/models/jalak-poster-v39.png", species: "Leucopsar rothschildi", motion: "breathe" },
  { id: "zyra-avatar-harimau", modelKey: "harimau", name: { id: "Harimau Sumatra tangguh", en: "Confident Sumatran tiger" }, src: "/gamification/collections/models/harimau-poster-v39.png", species: "Panthera tigris sumatrae", motion: "breathe" },
  { id: "zyra-avatar-orangutan", modelKey: "orangutan", name: { id: "Orangutan bijak", en: "Thoughtful orangutan" }, src: "/gamification/collections/models/orangutan-poster-v39.png", species: "Pongo abelii", motion: "breathe" },
  { id: "zyra-avatar-anoa", modelKey: "anoa", name: { id: "Anoa penjelajah", en: "Anoa explorer" }, src: "/gamification/collections/models/anoa-poster-v39.png", species: "Bubalus depressicornis", motion: "breathe" },
  { id: "zyra-avatar-bekantan", modelKey: "bekantan", name: { id: "Bekantan peneliti", en: "Proboscis researcher" }, src: "/gamification/collections/models/bekantan-poster-v39.png", species: "Nasalis larvatus", motion: "breathe" },
  { id: "zyra-avatar-cenderawasih", modelKey: "cenderawasih", name: { id: "Cenderawasih perintis", en: "Bird-of-paradise pioneer" }, src: "/gamification/collections/models/cenderawasih-poster-v39.png", species: "Paradisaea minor", motion: "breathe" },
  { id: "zyra-avatar-penyu", modelKey: "penyu", name: { id: "Penyu navigator", en: "Sea turtle navigator" }, src: "/gamification/collections/models/penyu-poster-v39.png", species: "Chelonia mydas", motion: "breathe" },
  { id: "zyra-avatar-badak", modelKey: "badak", name: { id: "Badak penjaga", en: "Javan rhino guardian" }, src: "/gamification/collections/models/badak-poster-v39.png", species: "Rhinoceros sondaicus", motion: "breathe" },
  { id: "zyra-avatar-elang", modelKey: "elang", name: { id: "Elang pengamat", en: "Javan eagle observer" }, src: "/gamification/collections/models/elang-poster-v39.png", species: "Nisaetus bartelsi", motion: "breathe" },
  { id: "zyra-avatar-studio-cat", glbCharacter: "cat", name: { id: "Zyra", en: "Zyra" }, src: "/gamification/mascots/v10.1/posters/cat-head.webp", species: "Felis catus", motion: "breathe" },
  { id: "zyra-avatar-studio-tiger", glbCharacter: "tiger", name: { id: "Harimau", en: "Tiger" }, src: "/gamification/mascots/v10.1/posters/tiger-head.webp", species: "Panthera tigris", motion: "breathe" },
  { id: "zyra-avatar-studio-rhino", glbCharacter: "rhino", name: { id: "Badak", en: "Rhino" }, src: "/gamification/mascots/v10.1/posters/rhino-head.webp", species: "Rhinocerotidae", motion: "breathe" },
  { id: "zyra-avatar-studio-crocodile", glbCharacter: "crocodile", name: { id: "Buaya", en: "Crocodile" }, src: "/gamification/mascots/v10.1/posters/crocodile-head.webp", species: "Crocodylidae", motion: "breathe" },
] as const;

export const ZYRA_CHAT_SKINS = [
  { id: "zyra-skin-orbit", name: { id: "Orbit", en: "Orbit" }, motif: "orbit", collectionId: "orbit" },
  { id: "zyra-skin-bara", name: { id: "Bara", en: "Ember" }, motif: "bara", collectionId: "bara" },
  { id: "zyra-skin-samudra", name: { id: "Samudra", en: "Ocean" }, motif: "samudra", collectionId: "samudra" },
  { id: "zyra-skin-lontar", name: { id: "Lontar", en: "Palm manuscript" }, motif: "lontar", collectionId: "lontar" },
  { id: "zyra-skin-merah-putih", name: { id: "Merah putih", en: "Red and white" }, motif: "merah-putih", collectionId: "merah-putih" },
  { id: "zyra-skin-rimba", name: { id: "Rimba", en: "Forest" }, motif: "rimba", collectionId: "rimba" },
] as const;

export type ZyraChatSkin = (typeof ZYRA_CHAT_SKINS)[number];

export function getZyraAvatar(id?: string | null) {
  return ZYRA_AVATARS.find(avatar => avatar.id === id);
}

export function getZyraChatSkin(id?: string | null) {
  return ZYRA_CHAT_SKINS.find(skin => skin.id === id);
}
