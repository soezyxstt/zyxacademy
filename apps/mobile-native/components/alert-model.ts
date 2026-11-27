import { nativeColors } from "../../../packages/design-tokens/native-colors";

export type AlertVariant = "default" | "destructive";
export type AlertTheme = keyof typeof nativeColors;

export function nativeAlertPresentation(variant: AlertVariant, theme: AlertTheme) {
  const colors = nativeColors[theme];
  if (variant === "destructive") {
    // The web uses a 30% border and 5% background of the destructive token.
    return {
      color: colors.destructive,
      borderColor: colors.destructive + "4d",
      backgroundColor: colors.destructive + "0d",
      liveRegion: "assertive",
    } as const;
  }
  return {
    color: colors.cardForeground,
    borderColor: colors.border,
    backgroundColor: colors.card,
    liveRegion: "polite",
  } as const;
}

export function alertAnnouncement(title: string, description?: string) {
  return description ? title + ". " + description : title;
}
