import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { nativeColors } from "../../packages/design-tokens/native-colors";
import {
  toggleGroupLabel, toggleGroupPosition, toggleSelectionLabel, toggleSubjects, type ToggleGroupCaseSpec,
} from "../../packages/ui-parity/toggle-group-cases";
import { ToggleGroup, ToggleGroupItem } from "./components/ToggleGroup";
import { nativeTypography } from "./typography";

export function ToggleGroupCase({ item }: { item: ToggleGroupCaseSpec }) {
  const [selection, setSelection] = useState<string[] | null>(null);
  const controls = toggleSubjects.map(({ value, label }) => (
    <ToggleGroupItem key={value} value={value} testID={`${item.id}-${value}`} disabled={item.disabledItem === value}>
      {label}
    </ToggleGroupItem>
  ));
  const common = { accessibilityLabel: toggleGroupLabel, theme: item.theme, disabled: item.disabled };

  return (
    <View style={toggleGroupPosition}>
      {item.type === "single" ? (
        <ToggleGroup {...common} type="single" defaultValue={item.initial}
          onValueChange={value => setSelection(value ? [value] : [])}>
          {controls}
        </ToggleGroup>
      ) : (
        <ToggleGroup {...common} type="multiple" value={selection ?? item.initial} onValueChange={setSelection}>
          {controls}
        </ToggleGroup>
      )}
      {selection && (
        <Text testID={`${item.id}-selection`} accessibilityLiveRegion="polite"
          style={[styles.selection, { color: nativeColors[item.theme].foreground }]}>
          {toggleSelectionLabel(selection)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  selection: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 16, marginTop: 4 },
});
