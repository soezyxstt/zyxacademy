import { createContext, forwardRef, useContext, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, useColorScheme, type PressableProps, type ViewProps } from "react-native";

import { nativeColors, nativeRadii } from "../../../packages/design-tokens/native-colors";
import { toggleGroupSelection, type ToggleGroupType } from "../../../packages/ui-primitives/toggle-group";
import { hapticSelection } from "../device/haptics";
import { nativeControlLabelPosition, nativeTypography } from "../typography";

type ToggleGroupProps = Omit<ViewProps, "accessibilityRole" | "accessible" | "role"> & {
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
  theme?: keyof typeof nativeColors;
} & ({
  type: "single";
  value?: string;
  defaultValue?: string;
  onValueChange?(value: string): void;
} | {
  type: "multiple";
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?(value: string[]): void;
});

function selectionOf(value: string | readonly string[] | undefined): readonly string[] {
  return typeof value === "string" ? (value ? [value] : []) : value ?? [];
}

const ToggleContext = createContext<{
  type: ToggleGroupType;
  selection: readonly string[];
  disabled: boolean;
  colors: (typeof nativeColors)[keyof typeof nativeColors];
  toggle(value: string): void;
} | null>(null);

export const ToggleGroup = forwardRef<ComponentRef<typeof View>, ToggleGroupProps>(function ToggleGroup({
  children, orientation = "horizontal", theme, disabled = false, style, accessibilityState, ...props
}, ref) {
  const { type, value, defaultValue, onValueChange, ...viewProps } = props;
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const [selection, setSelection] = useState(() => selectionOf(defaultValue));
  const latestSelection = useRef(selection);
  const controlled = value !== undefined;
  const selected = controlled ? selectionOf(value) : selection;

  function toggle(item: string) {
    if (disabled) return;
    const current = controlled ? selected : latestSelection.current;
    const next = toggleGroupSelection(type, current, item);
    if (next === current) return;
    if (!controlled) {
      latestSelection.current = next;
      setSelection(next);
    }
    void hapticSelection();
    if (type === "single") onValueChange?.(next[0] ?? "");
    else onValueChange?.([...next]);
  }

  return (
    <ToggleContext.Provider value={{ type, disabled, colors, selection: selected, toggle }}>
      <View {...viewProps} ref={ref} accessible={false}
        role={type === "multiple" ? "group" : undefined}
        accessibilityRole={type === "single" ? "radiogroup" : undefined}
        accessibilityState={{ ...accessibilityState, disabled }}
        style={[styles.group, orientation === "vertical" ? styles.vertical : styles.horizontal, style]}>
        {children}
      </View>
    </ToggleContext.Provider>
  );
});

type ToggleGroupItemProps = Omit<PressableProps,
  "children" | "accessibilityRole" | "role" | "accessible" | "onPress" | "onAccessibilityTap" | "aria-checked" | "aria-disabled"
> & {
  value: string;
  children?: ReactNode;
};

export const ToggleGroupItem = forwardRef<ComponentRef<typeof Pressable>, ToggleGroupItemProps>(function ToggleGroupItem({
  accessibilityLabel, accessibilityState, children, disabled, focusable, hitSlop = 3, onBlur, onFocus, style, value, ...props
}, ref) {
  const group = useContext(ToggleContext);
  const [focused, setFocused] = useState(false);
  if (!group) throw new Error("ToggleGroupItem requires a ToggleGroup");
  const checked = group.selection.includes(value);
  const blocked = group.disabled || Boolean(disabled);
  const { colors } = group;
  const activate = () => { if (!blocked) group.toggle(value); };
  const text = typeof children === "string" || typeof children === "number" ? String(children) : null;

  return (
    <Pressable {...props} ref={ref} accessible
      accessibilityRole={group.type === "single" ? "radio" : "togglebutton"}
      accessibilityLabel={accessibilityLabel ?? text ?? undefined}
      accessibilityState={{ ...accessibilityState, checked, disabled: blocked }}
      disabled={blocked} focusable={!blocked && focusable !== false} hitSlop={hitSlop}
      onAccessibilityTap={blocked ? undefined : activate}
      onPress={activate}
      onFocus={event => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={event => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={state => [
        styles.item,
        { borderColor: colors.border },
        focused && !blocked && [styles.focused, { outlineColor: colors.accent }],
        typeof style === "function" ? style(state) : style,
      ]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fill,
        { backgroundColor: checked ? colors.primary : colors.background }]} />
      {text === null ? children : (
        <Text numberOfLines={1} style={[
          styles.label, nativeControlLabelPosition, { color: checked ? colors.primaryForeground : colors.foreground },
        ]}>
          {text}
        </Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  group: { gap: 8, alignItems: "center", minHeight: 44 },
  horizontal: { flexDirection: "row" },
  vertical: { alignItems: "flex-start", paddingVertical: 3 },
  item: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: nativeRadii.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  fill: { borderRadius: nativeRadii.md - 1 },
  focused: { outlineWidth: 2, outlineOffset: 2 },
  label: { ...nativeTypography.bodyMedium, fontSize: 14, lineHeight: 20, includeFontPadding: false },
});
