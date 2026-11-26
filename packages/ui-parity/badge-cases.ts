import { parityFrame } from "./frame";

export const badgeCases = [
  // components/pricing/plan-preview-grid.tsx
  { id: "badge-default-light", theme: "light", variant: "default", label: "Rekomendasi" },
  // components/schedule/academic-schedule-detail-dialog.tsx
  { id: "badge-secondary-dark", theme: "dark", variant: "secondary", label: "Ujian ITB" },
  // components/admin/idea-bundle-v2-panel.tsx
  { id: "badge-outline-light", theme: "light", variant: "outline", label: "Belum disimpan" },
] as const;

// The Quiz Insights AI evaluation tab is the only direct consumer of BetaBadge.
export const betaBadgeCases = [
  { id: "beta-badge-active-light", theme: "light", selected: "ai-insights" },
  { id: "beta-badge-inactive-light", theme: "light", selected: "questions" },
  { id: "beta-badge-active-dark", theme: "dark", selected: "ai-insights" },
] as const;

export type BadgeCaseSpec = (typeof badgeCases)[number];
export type BetaBadgeCaseSpec = (typeof betaBadgeCases)[number];

export const quizInsightsBadgeTabs = [
  { value: "ai-insights", label: "Evaluasi AI" },
  { value: "questions", label: "Analisis soal" },
] as const;

export const badgePosition = {
  position: "absolute",
  left: 0,
  top: 0,
  width: parityFrame.width,
  height: parityFrame.height,
} as const;
