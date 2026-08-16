import { z } from "zod";

export const ZYRA_MURID_EXPERIENCE_VERSION = "zyra-murid-experience-v1";
export const ZYRA_SELECTION_MAX_CHARS = 1200;

export const ZyraPetStateSchema = z.enum([
  "idle",
  "listening",
  "uploading",
  "thinking",
  "explaining",
  "checking",
  "success",
  "confused",
  "quota_resting",
  "error",
]);
export type ZyraPetState = z.infer<typeof ZyraPetStateSchema>;

export const ZyraAllowanceSummarySchema = z.object({
  peran: z.enum(["admin", "tutor", "murid"]),
  appDay: z.string().min(1),
  providerTurnsUsed: z.number().int().nonnegative(),
  providerTurnsRemaining: z.number().int().nonnegative(),
  totalInteractionsUsed: z.number().int().nonnegative(),
  totalInteractionsRemaining: z.number().int().nonnegative(),
  premiumTurnsUsed: z.number().int().nonnegative(),
  premiumTurnsRemaining: z.number().int().nonnegative(),
  cacheSaves: z.number().int().nonnegative(),
  nextResetAt: z.string().datetime(),
}).strict();
export type ZyraAllowanceSummary = z.infer<typeof ZyraAllowanceSummarySchema>;

export function normalizeZyraSelection(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ZYRA_SELECTION_MAX_CHARS);
}

export function isZyraMuridFeatureEnabled(): true {
  return true;
}

export function isZyraSelectionAskEnabled(value = process.env.NEXT_PUBLIC_FEATURE_ZYRA_SELECTION_ASK_V1): boolean {
  return value === "1";
}

export function isZyraPetFeatureEnabled(value = process.env.NEXT_PUBLIC_FEATURE_ZYRA_PET_V1): boolean {
  return value === "1";
}

export function petStateForTutorEvent(input: {
  isOpen: boolean;
  activeMode: string | null;
  loading: boolean;
  chatLoading: boolean;
  attachmentsReady: boolean;
  hasAttachments: boolean;
  hasError: boolean;
  quotaExhausted: boolean;
}): ZyraPetState {
  if (!input.isOpen) return "idle";
  if (input.quotaExhausted) return "quota_resting";
  if (input.hasError) return "error";
  if (input.hasAttachments && !input.attachmentsReady) return "uploading";
  if (input.loading || input.chatLoading) return "thinking";
  if (input.activeMode === "explain") return "explaining";
  if (input.activeMode === "mistake") return "checking";
  if (input.activeMode === "chat") return "listening";
  return "idle";
}
