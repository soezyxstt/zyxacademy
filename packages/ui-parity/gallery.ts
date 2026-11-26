import { radioCases } from "./radio-cases";
import { avatarCases } from "./avatar-cases";
import { badgeCases, betaBadgeCases } from "./badge-cases";
import { choiceCases } from "./choice-cases";
import { controlCases } from "./control-cases";
import { progressCases } from "./progress-cases";
import { formattedDateCases } from "./formatted-date-cases";
import { notificationInboxCases } from "./notification-inbox-cases";
import { separatorCases } from "./separator-cases";
import { skeletonCases } from "./skeleton-cases";
import { sliderCases } from "./slider-cases";

export const galleryCases = [
  ...separatorCases.map((item) => ({ ...item, family: "separator" as const, component: "separator" as const })),
  ...skeletonCases.map((item) => ({ ...item, family: "skeleton" as const, component: "skeleton" as const })),
  ...controlCases.map((item) => ({ ...item, family: "control" as const })),
  ...choiceCases.map((item) => ({ ...item, family: "choice" as const, component: item.kind })),
  ...radioCases.map((item) => ({ ...item, family: "radio" as const })),
  ...progressCases.map((item) => ({ ...item, family: "progress" as const, component: "progress" as const })),
  ...avatarCases.map((item) => ({ ...item, family: "avatar" as const, component: "avatar" as const })),
  ...badgeCases.map((item) => ({ ...item, family: "badge" as const, component: "badge" as const })),
  ...betaBadgeCases.map((item) => ({ ...item, family: "beta-badge" as const, component: "beta-badge" as const })),
  ...formattedDateCases.map((item) => ({ ...item, family: "formatted-date" as const, component: "formatted-date" as const })),
  ...notificationInboxCases.map((item) => ({ ...item, family: "notification-inbox" as const, component: "notification-inbox" as const })),
  ...sliderCases.map((item) => ({ ...item, family: "slider" as const, component: "slider" as const })),
];
export type GalleryCase = (typeof galleryCases)[number];

export const componentNames = [...new Set(galleryCases.map(({ component }) => component))];
