import { Text } from "react-native";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { readDocInline } from "../../../../packages/academic/docs/inline";
import { getSafeRedirectPath } from "../../../../packages/native-session/auth-redirect";
import { nativeTypography } from "../../typography";

export function DocInlineContent({ value, theme, navigate }: {
  value: string;
  theme: keyof typeof nativeColors;
  navigate(href: string): void;
}) {
  return <>{readDocInline(value).map((part, index) => {
    if (part.kind === "link" && getSafeRedirectPath(part.href) === part.href) {
      return <Text accessibilityRole="link" key={index} style={{ color: nativeColors[theme].primary, textDecorationLine: "underline" }}
        onPress={() => navigate(part.href)}>{part.text}</Text>;
    }
    if (part.kind === "code") return <Text key={index} style={nativeTypography.mono}>{part.text}</Text>;
    if (part.kind === "strong") return <Text key={index} style={nativeTypography.bodySemibold}>{part.text}</Text>;
    return part.text;
  })}</>;
}
