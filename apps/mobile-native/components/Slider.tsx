import { useLayoutEffect, useRef, useState } from "react";
import { I18nManager, StyleSheet, View, useColorScheme, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";

import { nativeColors, nativeRadii } from "../../../packages/design-tokens/native-colors";
import { clampSliderValue, getSliderRange, sliderGeometry, sliderStartsAtRight, sliderValueAtOffset, snapSliderValue } from "../../../packages/ui-primitives/slider";

const thumbWidth = 16;

type SliderProps = {
  value: number;
  onValueChange?(value: number): void;
  onValueCommit?(value: number): void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  inverted?: boolean;
  dir?: "ltr" | "rtl";
  accessibilityLabel: string;
  accessibilityValueText?(value: number): string;
  theme?: keyof typeof nativeColors;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function Slider({
  value, onValueChange, onValueCommit, min = 0, max = 100, step = 1, disabled = false, inverted = false,
  dir = I18nManager.isRTL ? "rtl" : "ltr", accessibilityLabel, accessibilityValueText, theme, testID, style,
}: SliderProps) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const [width, setWidth] = useState(0);
  const [draft, setDraft] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const drag = useRef<{ origin: number; start: number; value: number } | null>(null);
  const range = getSliderRange(min, max, step);
  const blocked = disabled || range.max <= range.min;
  const fromRight = sliderStartsAtRight(dir, inverted);
  const selected = clampSliderValue(draft ?? value, range);
  const geometry = sliderGeometry(selected, width, thumbWidth, range, fromRight);

  useLayoutEffect(() => {
    drag.current = null;
    setDraft(null);
  }, [blocked, fromRight, max, min, step, width]);

  function move(offset: number) {
    const active = drag.current;
    if (!active || blocked) return;
    const next = sliderValueAtOffset(offset, width, range, fromRight);
    if (next === active.value) return;
    active.value = next;
    setDraft(next);
    onValueChange?.(next);
  }

  function start({ nativeEvent }: GestureResponderEvent) {
    if (blocked || width <= 0) return;
    const offset = nativeEvent.locationX;
    drag.current = { origin: nativeEvent.pageX - offset, start: selected, value: selected };
    setDraft(selected);
    if (offset < geometry.thumbStart || offset > geometry.thumbStart + thumbWidth) move(offset);
  }

  function end(commit: boolean) {
    const active = drag.current;
    drag.current = null;
    setDraft(null);
    if (commit && !blocked && active && active.value !== active.start) onValueCommit?.(active.value);
  }

  function adjust(action: string) {
    if (blocked || drag.current || (action !== "increment" && action !== "decrement")) return;
    const next = snapSliderValue(selected + (action === "increment" ? range.step : -range.step), range);
    if (next === selected) return;
    onValueChange?.(next);
    onValueCommit?.(next);
  }

  return (
    <View accessible focusable={!blocked} accessibilityRole="adjustable" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: blocked }}
      accessibilityValue={{ min: range.min, max: range.max, now: selected, text: accessibilityValueText?.(selected) }}
      accessibilityActions={blocked ? undefined : [{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={event => adjust(event.nativeEvent.actionName)}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onStartShouldSetResponder={() => !blocked && width > 0}
      onResponderGrant={start}
      onResponderMove={event => {
        if (event.nativeEvent.touches.length > 1) end(false);
        else if (drag.current) move(event.nativeEvent.pageX - drag.current.origin);
      }}
      onResponderRelease={() => end(true)} onResponderTerminate={() => end(false)}
      onResponderTerminationRequest={() => true}
      testID={testID} style={[styles.target, style, styles.bounds]}>
      <View pointerEvents="none" style={[styles.rail, { backgroundColor: colors.muted }]}>
        <View style={[styles.fill, { start: geometry.fillStart, width: geometry.fillWidth, backgroundColor: colors.primary }]} />
      </View>
      {width > 0 && <View pointerEvents="none" style={[
        styles.thumb, { start: geometry.thumbStart, borderColor: colors.primary + "80", backgroundColor: colors.background },
        blocked && styles.disabled, focused && !blocked && { outlineColor: colors.accent, outlineOffset: 2, outlineWidth: 2 },
      ]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  target: { width: "100%", justifyContent: "center" },
  bounds: { minHeight: 44, minWidth: 44, direction: "ltr" },
  rail: { height: 6, borderRadius: nativeRadii.md, overflow: "hidden" },
  fill: { position: "absolute", height: "100%" },
  thumb: { position: "absolute", top: "50%", transform: [{ translateY: -thumbWidth / 2 }], width: thumbWidth, height: thumbWidth,
    borderRadius: thumbWidth / 2, borderWidth: 1,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" },
  disabled: { opacity: 0.5 },
});
