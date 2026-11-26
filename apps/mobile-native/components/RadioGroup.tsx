import { createContext, forwardRef, useContext, useState, type ComponentRef } from "react";
import { Pressable, StyleSheet, View, useColorScheme, type PressableProps, type ViewProps } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { hapticSelection } from "../device/haptics";
import { disabledControlStyle } from "./control-opacity";

type RadioGroupProps = Omit<ViewProps, "accessibilityRole" | "accessible" | "role"> & {
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  theme?: keyof typeof nativeColors;
};

type RadioGroupContextValue = {
  value: string | undefined;
  disabled: boolean;
  colors: (typeof nativeColors)[keyof typeof nativeColors];
  select: (value: string) => void;
};

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export const RadioGroup = forwardRef<ComponentRef<typeof View>, RadioGroupProps>(function RadioGroup({
  accessibilityState,
  children,
  defaultValue,
  disabled = false,
  onValueChange,
  orientation = "vertical",
  style,
  theme,
  value,
  ...props
}, ref) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selected = value ?? internalValue;

  function select(next: string) {
    if (disabled || next === selected) return;
    if (value === undefined) setInternalValue(next);
    void hapticSelection();
    onValueChange?.(next);
  }

  return (
    <RadioGroupContext.Provider value={{ value: selected, disabled, colors, select }}>
      <View
        {...props}
        ref={ref}
        accessible={false}
        accessibilityRole="radiogroup"
        accessibilityState={{ ...accessibilityState, disabled }}
        style={[styles.group, orientation === "horizontal" && styles.horizontal, style]}
      >
        {children}
      </View>
    </RadioGroupContext.Provider>
  );
});

type RadioGroupItemProps = Omit<PressableProps, "accessibilityRole" | "children" | "onAccessibilityTap" | "onPress" | "role"> & {
  value: string;
};

export const RadioGroupItem = forwardRef<ComponentRef<typeof Pressable>, RadioGroupItemProps>(function RadioGroupItem({
  accessibilityState,
  disabled,
  hitSlop = 14,
  onBlur,
  onFocus,
  style,
  value,
  ...props
}, ref) {
  const group = useContext(RadioGroupContext);
  const [focused, setFocused] = useState(false);
  if (!group) throw new Error("RadioGroupItem requires a RadioGroup");
  const checked = group.value === value;
  const blocked = group.disabled || Boolean(disabled);
  const { colors } = group;
  const select = () => group.select(value);

  return (
    <Pressable
      {...props}
      ref={ref}
      accessibilityRole="radio"
      accessibilityState={{ ...accessibilityState, checked, disabled: blocked }}
      disabled={blocked}
      hitSlop={hitSlop}
      needsOffscreenAlphaCompositing={blocked}
      onAccessibilityTap={blocked ? undefined : select}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onPress={select}
      style={(state) => [
        styles.item,
        {
          backgroundColor: colors.background,
          borderColor: checked ? colors.primary : colors.input,
        },
        focused && !blocked && [styles.focused, { outlineColor: colors.accent }],
        blocked && disabledControlStyle,
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {checked && (
        <Svg width={10} height={10} viewBox="0 0 24 24" accessible={false} pointerEvents="none">
          <Circle cx={12} cy={12} r={10} fill={colors.primary} stroke={colors.primary} strokeWidth={2} />
        </Svg>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  group: { gap: 8 },
  horizontal: { flexDirection: "row" },
  item: {
    width: 16,
    height: 16,
    flexShrink: 0,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  focused: { outlineWidth: 2, outlineOffset: 2 },
});
