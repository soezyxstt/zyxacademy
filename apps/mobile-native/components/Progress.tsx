import { useState } from "react";
import { StyleSheet, useColorScheme, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, FeComposite, Filter, Rect } from "react-native-svg";

import { nativeColors, nativeRadii } from "../../../packages/design-tokens/native-colors";
import { getIntegerProgressRange, getProgressCornerRadius, getProgressValue } from "../../../packages/ui-primitives/progress";

const trackHeight = 8;

type ProgressProps = {
  value: number;
  max?: number;
  accessibilityLabel: string;
  theme?: keyof typeof nativeColors;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function CompleteIndicator({ color }: { color: string }) {
  const [radius, setRadius] = useState(trackHeight / 2);
  return (
    <Svg width="100%" height="100%" accessible={false} importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      onLayout={({ nativeEvent: { layout } }) => setRadius(getProgressCornerRadius(layout.width, layout.height, nativeRadii.md))}>
      <Defs>
        <Filter id="progress-track-clip" x={0} y={0} width="100%" height="100%">
          <FeComposite in="SourceGraphic" in2="SourceAlpha" operator="in" />
        </Filter>
      </Defs>
      <Rect width="100%" height="100%" rx={radius} ry={radius} fill={color} filter="url(#progress-track-clip)" />
    </Svg>
  );
}

export function Progress({ value, max, accessibilityLabel, theme, style, testID }: ProgressProps) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const progress = getProgressValue(value, max);
  // Preserve explicit track shapes and clipping. For coincident rounded edges,
  // composite the fill through its coverage mask, as the web track clips it.
  const useCoincidentClip = progress.percent === 100
    && !Object.keys(StyleSheet.flatten(style) ?? {}).some(key => /^(border|padding|overflow)/.test(key));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={getIntegerProgressRange(progress)}
      testID={testID}
      style={[styles.track, { backgroundColor: colors.muted }, style, useCoincidentClip && styles.svgClip]}
    >
      {useCoincidentClip
        ? <CompleteIndicator color={colors.primary} />
        : <View pointerEvents="none" accessible={false}
          style={[styles.indicator, { width: `${progress.percent}%`, backgroundColor: colors.primary }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: trackHeight, width: "100%", overflow: "hidden", borderRadius: nativeRadii.md },
  svgClip: { overflow: "visible" },
  indicator: { height: "100%", borderRadius: nativeRadii.md },
});
