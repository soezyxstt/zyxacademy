import { useState, type ReactNode } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";

export function DashboardLink({ children, label, onPress, style, testID, theme }: {
  children: ReactNode;
  label: string;
  onPress(): void;
  style: StyleProp<ViewStyle>;
  testID: string;
  theme: keyof typeof nativeColors;
}) {
  const [focused, setFocused] = useState(false);
  const colors = nativeColors[theme];
  return <Pressable accessibilityRole="link" accessibilityLabel={label} testID={testID}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={onPress}
    style={({ pressed }) => [
      style,
      pressed && { backgroundColor: `${colors.primary}14` },
      focused && { outlineColor: colors.accent, outlineWidth: 2, outlineOffset: -2 },
    ]}>
    {children}
  </Pressable>;
}
