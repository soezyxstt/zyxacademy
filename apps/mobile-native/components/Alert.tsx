import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, useColorScheme, type StyleProp, type ViewStyle } from "react-native";

import { nativeRadii } from "../../../packages/design-tokens/native-colors";
import { nativeTypography } from "../typography";
import { alertAnnouncement, nativeAlertPresentation, type AlertTheme, type AlertVariant } from "./alert-model";

type AlertProps = {
  title: string;
  description?: string;
  icon?: (color: string, size: number) => ReactNode;
  action?: { label: string; onPress: () => void };
  variant?: AlertVariant;
  theme?: AlertTheme;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const iconSize = 16;

export function Alert({ title, description, icon, action, variant = "default", theme, testID, style }: AlertProps) {
  const systemTheme = useColorScheme();
  const { color, borderColor, backgroundColor, liveRegion } = nativeAlertPresentation(variant, theme ?? systemTheme ?? "light");
  const announcement = alertAnnouncement(title, description);
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    if (variant !== "destructive") {
      announced.current = null;
      return;
    }
    if (announced.current !== announcement) {
      announced.current = announcement;
      AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [announcement, variant]);

  return (
    <View testID={testID} style={[styles.alert, { borderColor, backgroundColor }, style]}>
      {icon && (
        <View style={styles.icon} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {icon(color, iconSize)}
        </View>
      )}
      <View style={styles.content}>
        <View accessible accessibilityRole="alert" accessibilityLabel={announcement} accessibilityLiveRegion={liveRegion} style={styles.message}>
          <Text style={[styles.title, { color }]}>{title}</Text>
          {description ? <Text style={[styles.description, { color }]}>{description}</Text> : null}
        </View>
        {action && (
          <Pressable accessibilityRole="link" accessibilityLabel={action.label} onPress={action.onPress} hitSlop={13} style={styles.link}>
            <Text style={[styles.description, styles.underline, { color }]}>{action.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  alert: { width: "100%", borderWidth: 1, borderRadius: nativeRadii.lg, padding: 12, flexDirection: "row", alignItems: "flex-start", columnGap: 12 },
  icon: { width: iconSize, height: iconSize, marginTop: 2 },
  content: { flex: 1, minWidth: 0, gap: 4 },
  message: { gap: 4 },
  title: { ...nativeTypography.bodySemibold, fontSize: 14, lineHeight: 20, includeFontPadding: false },
  description: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 18, includeFontPadding: false },
  link: { alignSelf: "flex-start" },
  underline: { textDecorationLine: "underline" },
});
