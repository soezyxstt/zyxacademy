import { type ComponentRef, forwardRef, useState } from "react";
import { Platform, StyleSheet, TextInput, useColorScheme, type TextInputProps } from "react-native";

import { nativeColors, nativeRadii } from "../../../packages/design-tokens/native-colors";
import { nativeTypography } from "../typography";
import { disabledControlStyle } from "./control-opacity";

type InputProps = TextInputProps & {
  disabled?: boolean;
  theme?: keyof typeof nativeColors;
};

export const Input = forwardRef<ComponentRef<typeof TextInput>, InputProps>(function Input({
  accessibilityState,
  defaultValue,
  disabled = false,
  editable = true,
  multiline = false,
  onBlur,
  onChangeText,
  onFocus,
  placeholderTextColor,
  renderToHardwareTextureAndroid,
  style,
  theme,
  value,
  ...props
}, ref) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const [focused, setFocused] = useState(false);
  const [uncontrolledEmpty, setUncontrolledEmpty] = useState(!defaultValue);
  const empty = value === undefined ? uncontrolledEmpty : value.length === 0;
  // Android lays out native hints without the editable text's custom line height.
  const androidInset = empty ? styles.hintInset : multiline ? styles.multilineInset : undefined;

  return (
    <TextInput
      {...props}
      ref={ref}
      defaultValue={defaultValue}
      value={value}
      editable={!disabled && editable}
      multiline={multiline}
      renderToHardwareTextureAndroid={renderToHardwareTextureAndroid ?? (multiline && disabled)}
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
      onChangeText={(next) => {
        if (Platform.OS === "android" && value === undefined) setUncontrolledEmpty(next.length === 0);
        onChangeText?.(next);
      }}
      style={[
        styles.input,
        multiline && styles.multiline,
        multiline && disabled && disabledControlStyle,
        Platform.OS === "android" && androidInset,
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
  hintInset: { paddingTop: 9, paddingBottom: 7 },
  multilineInset: { paddingTop: 7, paddingBottom: 9 },
});


export const Textarea = forwardRef<ComponentRef<typeof TextInput>, Omit<InputProps, "multiline">>(function Textarea(props, ref) {
  return <Input {...props} multiline ref={ref} />;
});
