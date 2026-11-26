import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { choiceCases, type ChoiceCaseId } from "../../packages/ui-parity/choice-cases";
import { Checkbox } from "./components/Checkbox";
import { Switch } from "./components/Switch";

export function ChoiceCase({ id }: { id: ChoiceCaseId }) {
  const specimen = choiceCases.find((item) => item.id === id);
  if (!specimen) throw new Error(`Unknown choice fixture: ${id}`);
  const Control = specimen.kind === "checkbox" ? Checkbox : Switch;
  const [checked, setChecked] = useState<boolean>(specimen.checked);

  return (
    <View style={styles.position}>
      <Control
        accessibilityLabel={specimen.label}
        checked={checked}
        disabled={specimen.disabled}
        onCheckedChange={(next: boolean | "indeterminate") => setChecked(next === true)}
        testID={`${id}-control-${checked ? "on" : "off"}`}
        theme={specimen.theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  position: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
});
