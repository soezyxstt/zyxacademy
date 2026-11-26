import { StyleSheet, Text, View, useColorScheme, type ViewProps } from "react-native";

import { nativeColors, nativeRadii } from "../../../packages/design-tokens/native-colors";
import { nativeTypography } from "../typography";

type BadgeVariant = "default" | "secondary" | "outline";
type BadgeFrameProps = Omit<ViewProps, "children"> & { theme?: keyof typeof nativeColors };
type BadgeProps = BadgeFrameProps & { children: string; variant?: BadgeVariant };

export function Badge({ accessibilityLabel, children, style, theme, variant = "default", ...props }: BadgeProps) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const palette = {
    default: { backgroundColor: colors.primary, borderColor: "transparent", color: colors.primaryForeground },
    secondary: { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground },
    outline: { backgroundColor: "transparent", borderColor: colors.border, color: colors.foreground },
  }[variant];
  const { color, ...surface } = palette;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? children}
      {...props}
      style={[styles.frame, styles.badge, surface, style]}
    >
      <Text accessible={false} style={[styles.badgeText, { color }]}>{children}</Text>
    </View>
  );
}

export function BetaBadge({ accessibilityLabel = "Beta", style, theme, ...props }: BadgeFrameProps) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      {...props}
      style={[styles.frame, styles.beta, { backgroundColor: `${colors.muted}99`, borderColor: `${colors.border}99` }, style]}
    >
      <Text accessible={false} style={[styles.betaText, { color: colors.mutedForeground }]}>Beta</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderWidth: 1, paddingVertical: 2, maxWidth: "100%" },
  badge: { borderRadius: nativeRadii.md, paddingHorizontal: 10, flexShrink: 1 },
  badgeText: { ...nativeTypography.bodyMedium, fontSize: 12, lineHeight: 18, includeFontPadding: false, flexShrink: 1 },
  beta: { borderRadius: nativeRadii.lg, paddingHorizontal: 6, flexShrink: 0 },
  betaText: { ...nativeTypography.bodySemibold, fontSize: 10, lineHeight: 10, letterSpacing: 0.5, textTransform: "uppercase", includeFontPadding: false },
});
