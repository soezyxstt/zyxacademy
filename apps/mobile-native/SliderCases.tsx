import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { nativeColors } from "../../packages/design-tokens/native-colors";
import { sliderPosition, type SliderCaseSpec } from "../../packages/ui-parity/slider-cases";
import { Slider } from "./components/Slider";
import { nativeTypography } from "./typography";

export function SliderCase({ item }: { item: SliderCaseSpec }) {
  const [value, setValue] = useState<number>(item.value);
  const [committed, setCommitted] = useState<number | null>(null);
  return (
    <View style={sliderPosition}>
      <Slider value={value} onValueChange={setValue} onValueCommit={setCommitted}
        min={item.min} max={item.max} step={item.step} dir={item.dir} disabled={item.disabled}
        theme={item.theme} accessibilityLabel={item.label} testID={`${item.id}-control`} />
      {committed !== null && (
        <Text testID={`${item.id}-commit`} accessibilityLiveRegion="polite"
          style={[styles.commit, { color: nativeColors[item.theme].foreground }]}>
          Nilai {committed}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  commit: { ...nativeTypography.bodyRegular, marginTop: 4, textAlign: "center", fontSize: 12, lineHeight: 16 },
});
