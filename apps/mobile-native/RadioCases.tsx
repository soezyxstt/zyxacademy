import { useState } from "react";
import { StyleSheet } from "react-native";

import { radioCases, radioGroupLabel, radioOptionGap, radioOptions, type RadioCaseId } from "../../packages/ui-parity/radio-cases";
import { RadioGroup, RadioGroupItem } from "./components/RadioGroup";

export function RadioCase({ id }: { id: RadioCaseId }) {
  const specimen = radioCases.find((item) => item.id === id);
  if (!specimen) throw new Error(`Unknown radio fixture: ${id}`);
  const [value, setValue] = useState<string>(specimen.value);

  return (
    <RadioGroup
      accessibilityLabel={radioGroupLabel}
      disabled={specimen.disabled}
      orientation="horizontal"
      onValueChange={setValue}
      style={[StyleSheet.absoluteFill, styles.group]}
      theme={specimen.theme}
      value={value}
    >
      {radioOptions.map((option) => (
        <RadioGroupItem
          key={option.value}
          accessibilityLabel={option.label}
          testID={`${id}-${option.value}-${value === option.value ? "on" : "off"}`}
          value={option.value}
        />
      ))}
    </RadioGroup>
  );
}

const styles = StyleSheet.create({
  group: { alignItems: "center", justifyContent: "center", gap: radioOptionGap },
});
