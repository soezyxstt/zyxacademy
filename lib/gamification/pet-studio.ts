export const DEFAULT_PET_ID = "zyra-avatar-studio-cat";

// Price tiers reflect garment layers, material detail and geometry across the four pet models.
export const PET_SUITS = [
  { assetId: "itb-sport-outfit", name: "Seragam olahraga", priceLp: 500 },
  { assetId: "astronaut-outfit", name: "Baju astronaut", priceLp: 750 },
  { assetId: "zyx-shirt", name: "Kaus Zyx", priceLp: 400 },
  { assetId: "cyclist-outfit", name: "Baju pesepeda", priceLp: 400 },
  { assetId: "basketball-outfit", name: "Seragam basket", priceLp: 450 },
  { assetId: "farmer-outfit", name: "Pakaian petani", priceLp: 500 },
  { assetId: "chef-outfit", name: "Seragam koki", priceLp: 550 },
  { assetId: "police-uniform", name: "Seragam polisi", priceLp: 550 },
  { assetId: "business-suit", name: "Setelan jas", priceLp: 600 },
  { assetId: "almamater-outfit", name: "Jaket almamater ITB", priceLp: 600 },
  { assetId: "doctor-labcoat", name: "Jas lab dokter", priceLp: 650 },
  { assetId: "engineer-vest", name: "Rompi insinyur", priceLp: 650 },
  { assetId: "beach-outfit", name: "Pakaian pantai", priceLp: 700 },
  { assetId: "firefighter-coat", name: "Jaket pemadam", priceLp: 750 },
  { assetId: "graduation-gown", name: "Toga wisuda", priceLp: 900 },
] as const;

const actionPets: Readonly<Record<string, string>> = {
  "pet-action-cycle": "cat",
  "pet-action-jump": "cat",
  "pet-action-roar": "tiger",
  "pet-action-charge": "rhino",
  "pet-action-giveFlowers": "crocodile",
};

export function petForAction(actionId: string) {
  const character = actionPets[actionId];
  return character ? "zyra-avatar-studio-" + character : undefined;
}

export function petSupportsAction(petId: string | null | undefined, actionId: string) {
  return (petId ?? DEFAULT_PET_ID) === petForAction(actionId);
}
