import { type ComponentRef, forwardRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type PressableProps,
} from "react-native";

import { nativeColors, nativeRadii } from "../../../packages/design-tokens/native-colors";
import { nativeTypography } from "../typography";

type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link" | "marketingPrimary" | "marketingSecondary";
type ButtonSize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg" | "marketing";
type ButtonProps = Omit<PressableProps, "children"> & {
  children?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  theme?: keyof typeof nativeColors;
  isLoading?: boolean;
  renderIcon?: (color: string, size: number) => ReactNode;
  iconPosition?: "start" | "end";
};

const buttonSizes = {
  default: { height: 32, padding: 10, iconPadding: 8, gap: 6, iconSize: 16 },
  xs: { height: 24, padding: 8, iconPadding: 6, gap: 4, iconSize: 12 },
  sm: { height: 28, padding: 10, iconPadding: 6, gap: 4, iconSize: 14 },
  lg: { height: 36, padding: 10, iconPadding: 12, gap: 6, iconSize: 16 },
  marketing: { height: 40, padding: 16, iconPadding: 16, gap: 8, iconSize: 16 },
  icon: { height: 32, width: 32, iconSize: 16 },
  "icon-xs": { height: 24, width: 24, iconSize: 12 },
  "icon-sm": { height: 28, width: 28, iconSize: 16 },
  "icon-lg": { height: 36, width: 36, iconSize: 16 },
};

const compactSizes: ReadonlySet<ButtonSize> = new Set(["xs", "sm", "icon-xs", "icon-sm"]);

export const Button = forwardRef<ComponentRef<typeof Pressable>, ButtonProps>(function Button({
  accessibilityRole = "button",
  accessibilityLabel,
  accessibilityState,
  children,
  disabled,
  hitSlop,
  iconPosition = "start",
  isLoading = false,
  needsOffscreenAlphaCompositing,
  onBlur,
  onFocus,
  renderIcon,
  size = "default",
  style,
  theme,
  variant = "default",
  ...props
}, ref) {
  const systemTheme = useColorScheme();
  const resolvedTheme = theme ?? systemTheme ?? "light";
  const colors = nativeColors[resolvedTheme];
  const dark = resolvedTheme === "dark";
  const [focused, setFocused] = useState(false);
  const blocked = Boolean(disabled || isLoading);
  const dimensions = buttonSizes[size];
  const iconOnly = "width" in dimensions;

  const palette = {
    marketingPrimary: { fill: colors.marketingNavy, pressedFill: colors.marketingNavy, ink: "#ffffff" },
    marketingSecondary: { fill: colors.background, pressedFill: colors.background, ink: colors.marketingNavy },
    default: { fill: colors.primary, pressedFill: colors.primaryHover, ink: colors.primaryForeground },
    outline: { fill: dark ? `${colors.input}4d` : colors.background, pressedFill: `${colors.primary}14`, ink: colors.foreground },
    secondary: { fill: colors.secondary, pressedFill: colors.secondaryHover, ink: colors.secondaryForeground },
    ghost: { fill: "transparent", pressedFill: colors.muted, ink: colors.foreground },
    destructive: { fill: `${colors.destructive}${dark ? "33" : "1a"}`, pressedFill: `${colors.destructive}${dark ? "4d" : "33"}`, ink: colors.destructive },
    link: { fill: "transparent", pressedFill: "transparent", ink: colors.primary },
  }[variant];
  const icon = renderIcon?.(palette.ink, dimensions.iconSize);

  return (
    <Pressable
      {...props}
      ref={ref}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityState={{ ...accessibilityState, disabled: blocked, busy: isLoading }}
      disabled={blocked}
      hitSlop={hitSlop ?? Math.max(0, (44 - dimensions.height) / 2)}
      needsOffscreenAlphaCompositing={blocked || needsOffscreenAlphaCompositing}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={(state) => [
        styles.base,
        iconOnly
          ? { height: dimensions.height, width: dimensions.width }
          : {
              height: dimensions.height,
              paddingStart: renderIcon && iconPosition === "start" ? dimensions.iconPadding : dimensions.padding,
              paddingEnd: renderIcon && iconPosition === "end" ? dimensions.iconPadding : dimensions.padding,
            },
        {
          borderRadius: size === "marketing" || variant.startsWith("marketing") || compactSizes.has(size) ? nativeRadii.md : nativeRadii.lg,
          borderWidth: variant === "marketingSecondary" ? 2 : 1,
          borderColor: variant === "marketingSecondary" ? colors.marketingNavy : variant === "outline" ? (dark ? colors.input : colors.border) : "transparent",
          backgroundColor: state.pressed ? palette.pressedFill : palette.fill,
        },
        state.pressed && styles.pressed,
        focused && !blocked && [styles.focused, { outlineColor: colors.accent }],
        blocked && styles.disabled,
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {isLoading && (
        <ActivityIndicator accessible={false} color={palette.ink} size="small" style={styles.loading} />
      )}
      <View style={[
        styles.content,
        !iconOnly && { gap: dimensions.gap },
        iconPosition === "end" && styles.contentReversed,
        isLoading && styles.hidden,
      ]}>
        {icon}
        {children != null && (
          <Text numberOfLines={1} style={[styles.label, nativeTypography.bodyMedium, { color: palette.ink }]}>
            {children}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: { flexShrink: 0, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  pressed: { transform: [{ translateY: 1 }] },
  focused: { outlineWidth: 2, outlineOffset: 2 },
  disabled: { opacity: 0.5 },
  loading: { position: "absolute" },
  hidden: { opacity: 0 },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  contentReversed: { flexDirection: "row-reverse" },
  label: { fontSize: 14, lineHeight: 20, includeFontPadding: false },
});
