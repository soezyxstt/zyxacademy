import { choiceCases } from "./choice-cases";
import { controlCases } from "./control-cases";
import { separatorCases } from "./separator-cases";
import { skeletonCases } from "./skeleton-cases";

export const galleryCases = [
  ...separatorCases.map((item) => ({ ...item, family: "separator" as const })),
  ...skeletonCases.map((item) => ({ ...item, family: "skeleton" as const })),
  ...controlCases.map((item) => ({ ...item, family: "control" as const })),
  ...choiceCases.map((item) => ({ ...item, family: "choice" as const })),
];
export type GalleryCase = (typeof galleryCases)[number];

export function componentName(id: string) {
  return id.split("-", 1)[0];
}
export const componentNames = [...new Set(galleryCases.map(({ id }) => componentName(id)))];
