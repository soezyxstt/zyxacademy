import { choiceCases } from "./choice-cases";
import { controlCases } from "./control-cases";
import { separatorCases } from "./separator-cases";
import { skeletonCases } from "./skeleton-cases";

export const galleryCases = [
  ...separatorCases.map((item) => ({ ...item, family: "separator" as const, component: "separator" as const })),
  ...skeletonCases.map((item) => ({ ...item, family: "skeleton" as const, component: "skeleton" as const })),
  ...controlCases.map((item) => ({ ...item, family: "control" as const })),
  ...choiceCases.map((item) => ({ ...item, family: "choice" as const, component: item.kind })),
];
export type GalleryCase = (typeof galleryCases)[number];

export const componentNames = [...new Set(galleryCases.map(({ component }) => component))];
