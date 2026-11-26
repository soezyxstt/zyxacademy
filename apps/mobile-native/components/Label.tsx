import { type ComponentRef, forwardRef } from "react";
import { StyleSheet, Text, useColorScheme, type TextProps } from "react-native";

import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { nativeControlLabelPosition, nativeTypography } from "../typography";

type LabelProps = TextProps & {
  disabled?: boolean;
  theme?: keyof typeof nativeColors;
};

export const Label = forwardRef<ComponentRef<typeof Text>, LabelProps>(function Label({
  disabled = false,
  onPress,
  style,
  theme,
  ...props
}, ref) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];

  return (
    <Text
      {...props}
      ref={ref}
      onPress={disabled ? undefined : onPress}
      style={[
        styles.label, nativeTypography.bodyMedium, nativeControlLabelPosition,
        { color: colors.foreground }, disabled && styles.disabled, style,
      ]}
    />
  );
});

const styles = StyleSheet.create({
  label: { fontSize: 14, lineHeight: 14, includeFontPadding: false },
  disabled: { opacity: 0.7 },
});
