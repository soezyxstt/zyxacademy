export const DEFAULT_PET_ID = "zyra-avatar-studio-cat";
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
