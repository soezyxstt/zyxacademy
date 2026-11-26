import { useRef, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, Text, View, type TextInput } from "react-native";
import Svg, { Path } from "react-native-svg";

import { nativeColors } from "../../packages/design-tokens/native-colors";
import {
  controlPosition,
  getControlCase,
  type ButtonFixture,
  type ControlCaseId,
  type FieldFixture,
} from "../../packages/ui-parity/control-cases";
import { Button } from "./components/Button";
import { Input } from "./components/Input";
import { Label } from "./components/Label";
import { nativeTypography } from "./typography";

function renderPlus(color: string, size: number) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d="M5 12h14" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M12 5v14" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function ButtonCase({ id, fixture }: { id: ControlCaseId; fixture: ButtonFixture }) {
  const [activated, setActivated] = useState(false);

  return (
    <View style={[controlPosition, styles.button]}>
      <Button
        testID={`${id}-control`}
        theme={fixture.theme}
        disabled={fixture.disabled}
        size={fixture.icon ? "icon" : "default"}
        variant={fixture.icon ? "outline" : "default"}
        accessibilityLabel={fixture.icon ? fixture.label : undefined}
        renderIcon={fixture.icon ? renderPlus : undefined}
        onPress={() => {
          setActivated(true);
          if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(fixture.response);
        }}
      >
        {fixture.icon ? undefined : fixture.label}
      </Button>
      {activated && (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.feedback, nativeTypography.bodyRegular, { color: nativeColors[fixture.theme].foreground }]}
        >
          {fixture.response}
        </Text>
      )}
    </View>
  );
}

function FieldCase({ id, fixture }: { id: ControlCaseId; fixture: FieldFixture }) {
  const input = useRef<TextInput>(null);
  const labelId = `${id}-control`;
  const showLabel = fixture.component === "label";
  const labelledBy = showLabel && Platform.OS === "android" ? labelId : undefined;

  return (
    <View style={[controlPosition, styles.field]}>
      {showLabel && (
        <Label
          testID={labelId}
          nativeID={labelId}
          theme={fixture.theme}
          disabled={fixture.disabled}
          onPress={() => input.current?.focus()}
        >
          {fixture.label}
        </Label>
      )}
      <Input
        ref={input}
        testID={showLabel ? `${id}-input` : `${id}-control`}
        theme={fixture.theme}
        disabled={fixture.disabled}
        accessibilityLabel={labelledBy ? undefined : fixture.label}
        accessibilityLabelledBy={labelledBy}
        placeholder={fixture.placeholder}
        defaultValue={fixture.value}
      />
    </View>
  );
}

export function ControlCase({ id }: { id: ControlCaseId }) {
  const fixture = getControlCase(id);
  return fixture.component === "button" ? <ButtonCase id={id} fixture={fixture} /> : <FieldCase id={id} fixture={fixture} />;
}

const styles = StyleSheet.create({
  button: { justifyContent: "center", alignItems: "center" },
  feedback: { position: "absolute", top: 74, fontSize: 12, lineHeight: 16, includeFontPadding: false },
  field: { justifyContent: "center", gap: 8 },
});
