import { type ComponentRef, forwardRef, useState } from "react";
import { StyleSheet, TextInput, useColorScheme, type TextInputProps } from "react-native";

import { nativeColors, nativeRadii } from "../../../packages/design-tokens/native-colors";
import { nativeTypography } from "../typography";

type InputProps = TextInputProps & {
  disabled?: boolean;
  theme?: keyof typeof nativeColors;
};

export const Input = forwardRef<ComponentRef<typeof TextInput>, InputProps>(function Input({
  accessibilityState,
  disabled = false,
  editable = true,
  multiline = false,
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
      multiline={multiline}
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
        multiline && styles.multiline,
        multiline && disabled && styles.disabled,
        nativeTypography.bodyRegular,
        { backgroundColor: colors.background, borderColor: colors.input, color: colors.foreground },
        focused && !disabled && {
          outlineWidth: multiline ? 0 : 2,
          outlineOffset: 2,
          outlineColor: colors.accent,
          borderColor: multiline ? colors.input : colors.primary,
          boxShadow: `0 0 0 2px ${colors.background}, 0 0 0 4px ${multiline ? colors.ring : colors.primary + "80"}`,
        },
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
  multiline: { height: "auto", minHeight: 80, borderRadius: nativeRadii.lg, textAlignVertical: "top" },
  disabled: { opacity: 0.5 },
});


export const Textarea = forwardRef<ComponentRef<typeof TextInput>, Omit<InputProps, "multiline">>(function Textarea(props, ref) {
  return <Input {...props} multiline ref={ref} />;
});
