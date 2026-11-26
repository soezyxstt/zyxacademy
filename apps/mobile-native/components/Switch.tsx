import { type ComponentRef, forwardRef, useEffect, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, useColorScheme, type PressableProps } from "react-native";

import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { hapticSelection } from "../device/haptics";
import { useReducedMotion } from "../device/reduced-motion";

type SwitchProps = Omit<PressableProps, "children" | "onPress" | "accessibilityRole"> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  theme?: keyof typeof nativeColors;
};

const thumbTravel = 20;
const thumbEasing = Easing.bezier(0.42, 0, 0.58, 1);

export const Switch = forwardRef<ComponentRef<typeof Pressable>, SwitchProps>(function Switch({
  accessibilityState,
  checked,
  defaultChecked = false,
  disabled,
  hitSlop = 10,
  onBlur,
  onCheckedChange,
  onFocus,
  style,
  theme,
  ...props
}, ref) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const reduceMotion = useReducedMotion();
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const [focused, setFocused] = useState(false);
  const value = checked ?? internalChecked;
  const blocked = Boolean(disabled);
  const targetOffset = value ? thumbTravel : 0;
  const [thumbOffset] = useState(() => new Animated.Value(targetOffset));

  useEffect(() => {
    if (reduceMotion) {
      thumbOffset.setValue(targetOffset);
      return;
    }
    const animation = Animated.timing(thumbOffset, {
      toValue: targetOffset,
      duration: 200,
      easing: thumbEasing,
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, targetOffset, thumbOffset]);

  return (
    <Pressable
      {...props}
      ref={ref}
      accessibilityRole="switch"
      accessibilityState={{ ...accessibilityState, checked: value, disabled: blocked }}
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
        const nextChecked = !value;
        if (checked === undefined) setInternalChecked(nextChecked);
        onCheckedChange?.(nextChecked);
        void hapticSelection();
      }}
      style={(state) => [
        styles.track,
        { backgroundColor: value ? colors.primary : colors.input },
        focused && !blocked && [styles.focused, { outlineColor: colors.ring }],
        blocked && styles.disabled,
        typeof style === "function" ? style(state) : style,
      ]}
    >
      <Animated.View
        accessible={false}
        pointerEvents="none"
        style={[styles.thumb, { transform: [{ translateX: thumbOffset }] }]}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  track: {
    width: 44,
    height: 24,
    flexShrink: 0,
    borderRadius: 12,
    paddingLeft: 2,
    justifyContent: "center",
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    boxShadow: "0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a",
  },
  focused: { outlineWidth: 2, outlineOffset: 2 },
  disabled: { opacity: 0.5 },
});
