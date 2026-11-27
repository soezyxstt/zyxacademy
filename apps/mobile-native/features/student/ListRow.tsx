import type { ReactNode } from "react";
import { StyleSheet, Text, View, useColorScheme, useWindowDimensions } from "react-native";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { useNativeAppearance, readingDensityScales, readingFontScales, scaleReadingText } from "../../device/appearance";
import { nativeTypography } from "../../typography";
import { NativeListRow, type NativeListRowProps } from "../shared-ui";

type StudentListRowProps = Pick<NativeListRowProps, "title" | "subtitle" | "metadata" | "primary" | "theme" | "testID" | "titleRole"> & {
  children?: ReactNode;
  trailingValue?: string;
};

export function StudentListRow({ children, theme, primary, trailingValue, ...props }: StudentListRowProps) {
  const systemTheme = useColorScheme();
  const { width, fontScale } = useWindowDimensions();
  const { density, fontSize } = useNativeAppearance();
  const textScale = readingFontScales[fontSize];
  const spacingScale = readingDensityScales[density];
  const resolvedTheme = theme ?? systemTheme ?? "light";
  const label = [props.title, props.subtitle, trailingValue, ...(props.metadata ?? []).flatMap(field => [field.label, field.value])]
    .filter(Boolean).join(", ");
  return (
    <View style={[styles.row, { borderBottomColor: nativeColors[resolvedTheme].border, gap: styles.row.gap * spacingScale }]}>
      <NativeListRow
        {...props}
        theme={resolvedTheme}
        density={trailingValue ? "dense" : "default"}
        textScale={textScale} spacingScale={spacingScale}
        trailing={trailingValue ? <Text style={[styles.value, scaleReadingText(textScale, styles.value), { color: nativeColors[resolvedTheme].foreground }]}>{trailingValue}</Text> : undefined}
        layout={width >= 768 * Math.max(1, fontScale * textScale) ? "wide" : "compact"}
        primary={primary ? { ...primary, label: primary.label ?? label } : undefined}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  value: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 17, textAlign: "right", maxWidth: "45%", fontVariant: ["tabular-nums"] },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
});
