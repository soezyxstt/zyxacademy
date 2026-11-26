import { StyleSheet, useColorScheme, View, type StyleProp, type ViewStyle } from "react-native";
import { nativeColors } from "../../../packages/design-tokens/native-colors";

type SeparatorProps = {
  orientation?: "horizontal" | "vertical";
  theme?: keyof typeof nativeColors;
  style?: StyleProp<ViewStyle>;
};

export function Separator({ orientation = "horizontal", theme, style }: SeparatorProps) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.base, styles[orientation], { backgroundColor: colors.border }, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: { flexShrink: 0 },
  horizontal: { width: "100%", height: 1 },
  vertical: { width: 1, height: "100%" },
});
