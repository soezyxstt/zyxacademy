import { forwardRef, useState } from "react";
import { StyleSheet, TextInput, useColorScheme, type TextInputProps } from "react-native";

import { nativeColors, nativeRadii } from "../../../packages/design-tokens/native-colors";
import { nativeTypography } from "../typography";

type InputProps = TextInputProps & {
  disabled?: boolean;
  theme?: keyof typeof nativeColors;
};

export const Input = forwardRef<TextInput, InputProps>(function Input({
  accessibilityState,
  disabled = false,
  editable = true,
  onBlur,
  onFocus,
  placeholderTextColor,
  style,
  theme,
  ...props
}, ref) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      {...props}
      ref={ref}
      editable={!disabled && editable}
      accessibilityState={{ ...accessibilityState, disabled }}
      placeholderTextColor={placeholderTextColor ?? colors.mutedForeground}
      underlineColorAndroid="transparent"
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        styles.input,
        nativeTypography.bodyRegular,
        { backgroundColor: colors.background, borderColor: colors.input, color: colors.foreground },
        focused && !disabled && [styles.focused, { outlineColor: colors.accent, borderColor: colors.primary, boxShadow: `0 0 0 2px ${colors.background}, 0 0 0 4px ${colors.primary}80` }],
        style,
      ]}
    />
  );
});

const styles = StyleSheet.create({
  input: {
    width: "100%",
    height: 40,
    borderWidth: 1,
    borderRadius: nativeRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  focused: { outlineWidth: 2, outlineOffset: 2 },
});
