import type { ReactNode } from "react";
import { StyleSheet, View, useColorScheme, useWindowDimensions } from "react-native";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { NativeListRow, type NativeListRowProps } from "../shared-ui";

type StudentListRowProps = Pick<NativeListRowProps, "title" | "subtitle" | "metadata" | "primary" | "theme" | "testID" | "titleRole"> & {
  children?: ReactNode;
};

export function StudentListRow({ children, theme, primary, ...props }: StudentListRowProps) {
  const systemTheme = useColorScheme();
  const { width, fontScale } = useWindowDimensions();
  const resolvedTheme = theme ?? systemTheme ?? "light";
  const label = [props.title, props.subtitle, ...(props.metadata ?? []).flatMap(field => [field.label, field.value])]
    .filter(Boolean).join(", ");
  return (
    <View style={[styles.row, { borderBottomColor: nativeColors[resolvedTheme].border }]}>
      <NativeListRow
        {...props}
        theme={resolvedTheme}
        layout={width >= 768 * Math.max(1, fontScale) ? "wide" : "compact"}
        primary={primary ? { ...primary, label: primary.label ?? label } : undefined}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
});
