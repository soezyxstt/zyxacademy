import { StyleSheet, useColorScheme, View, type StyleProp, type ViewStyle } from "react-native";

import { nativeColors, nativeRadii } from "../../../packages/design-tokens/native-colors";
import { getIntegerProgressRange, getProgressValue } from "../../../packages/ui-primitives/progress";

type ProgressProps = {
  value: number;
  max?: number;
  accessibilityLabel: string;
  theme?: keyof typeof nativeColors;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Progress({ value, max, accessibilityLabel, theme, style, testID }: ProgressProps) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const progress = getProgressValue(value, max);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={getIntegerProgressRange(progress)}
      testID={testID}
      style={[styles.track, { backgroundColor: colors.muted }, style]}
    >
      <View style={[styles.indicator, { width: `${progress.percent}%`, backgroundColor: colors.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, width: "100%", overflow: "hidden", borderRadius: nativeRadii.md },
  indicator: { height: "100%", borderRadius: nativeRadii.md },
});
