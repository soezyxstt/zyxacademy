import { forwardRef, useState } from "react";
import { Pressable, StyleSheet, useColorScheme, type PressableProps, type View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { nativeColors, nativeRadii } from "../../../packages/design-tokens/native-colors";
import { hapticSelection } from "../device/haptics";

type CheckedState = boolean | "indeterminate";
type CheckboxProps = Omit<PressableProps, "children" | "onPress" | "accessibilityRole"> & {
  checked?: CheckedState;
  defaultChecked?: CheckedState;
  onCheckedChange?: (checked: CheckedState) => void;
  theme?: keyof typeof nativeColors;
};

export const Checkbox = forwardRef<View, CheckboxProps>(function Checkbox({
  accessibilityState,
  checked,
  defaultChecked = false,
  disabled,
  hitSlop = 14,
  onBlur,
  onCheckedChange,
  onFocus,
  style,
  theme,
  ...props
}, ref) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const [focused, setFocused] = useState(false);
  const value = checked ?? internalChecked;
  const selected = value !== false;
  const blocked = Boolean(disabled);

  return (
    <Pressable
      {...props}
      ref={ref}
      accessibilityRole="checkbox"
      accessibilityState={{ ...accessibilityState, checked: value === "indeterminate" ? "mixed" : value, disabled: blocked }}
      disabled={blocked}
      hitSlop={hitSlop}
      needsOffscreenAlphaCompositing={blocked}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onPress={() => {
        const nextChecked = value !== true;
        if (checked === undefined) setInternalChecked(nextChecked);
        void hapticSelection();
        onCheckedChange?.(nextChecked);
      }}
      style={(state) => [
        styles.box,
        {
          backgroundColor: selected ? colors.primary : colors.background,
          borderColor: selected ? colors.primary : colors.input,
        },
        focused && !blocked && [styles.focused, { outlineColor: colors.accent }],
        blocked && styles.disabled,
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {selected && (
        <Svg width={14} height={14} viewBox="0 0 24 24" accessible={false} pointerEvents="none">
          <Path
            d={value === "indeterminate" ? "M5 12h14" : "M20 6 9 17l-5-5"}
            fill="none"
            stroke={colors.primaryForeground}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  box: {
    width: 16,
    height: 16,
    flexShrink: 0,
    borderRadius: nativeRadii.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  focused: { outlineWidth: 2, outlineOffset: 2 },
  disabled: { opacity: 0.5 },
});
