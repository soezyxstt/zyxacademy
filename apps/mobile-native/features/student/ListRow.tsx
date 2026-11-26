import { createContext, useContext, useState, type ComponentType, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from "react-native";
import { nativeColors, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import { nativeTypography } from "../../typography";

type RowMetadata = { id: string; label: string; value: string };
type RowPrimary = { onPress: () => void; label?: string; role?: "button" | "link"; disabled?: boolean };

export type StudentListRowPresentationProps = {
  layout: "compact" | "wide";
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  metadata?: readonly RowMetadata[];
  primary?: RowPrimary;
  theme?: keyof typeof nativeColors;
};

export type StudentListRowComponent = ComponentType<StudentListRowPresentationProps>;
const ListRowContext = createContext<StudentListRowComponent | undefined>(undefined);

export function StudentListRowProvider({ component, children }: { component?: StudentListRowComponent; children: ReactNode }) {
  return <ListRowContext.Provider value={component}>{children}</ListRowContext.Provider>;
}

type StudentListRowProps = Omit<StudentListRowPresentationProps, "layout"> & {
  children?: ReactNode;
  chevron?: boolean;
  testID?: string;
  titleHeading?: boolean;
};

function FallbackListRow({ title, subtitle, leading, metadata, primary, theme = "light", layout, testID, chevron, titleHeading }: StudentListRowPresentationProps & Pick<StudentListRowProps, "testID" | "chevron" | "titleHeading">) {
  const colors = nativeColors[theme];
  const [focused, setFocused] = useState(false);
  const identity = (
    <>
      {leading ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{leading}</View> : null}
      <View style={styles.identity}>
        <Text accessibilityRole={titleHeading ? "header" : undefined} style={[styles.title, titleHeading ? nativeTypography.headingBold : nativeTypography.bodyMedium, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.supporting, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      {metadata?.length ? (
        <View style={[styles.metadata, layout === "wide" && styles.metadataWide]}>
          {metadata.map(({ id, label, value }) => (
            <View key={id} style={styles.field}>
              {label ? <Text style={[styles.supporting, { color: colors.mutedForeground }]}>{label}</Text> : null}
              <Text style={[styles.supporting, { color: colors.mutedForeground }]}>{value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {chevron && primary ? <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no" style={[styles.chevron, { color: colors.mutedForeground }]}>›</Text> : null}
    </>
  );
  if (!primary) return <View testID={testID} style={styles.content}>{identity}</View>;
  return (
    <Pressable
      accessibilityLabel={primary.label}
      accessibilityRole={primary.role ?? "button"}
      accessibilityState={{ disabled: primary.disabled }}
      disabled={primary.disabled}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={primary.onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.content,
        pressed && { backgroundColor: `${colors.primary}14` },
        focused && { outlineColor: colors.accent, outlineWidth: 2, outlineOffset: 2 },
      ]}
    >
      {identity}
    </Pressable>
  );
}

export function StudentListRow({ children, chevron, testID, titleHeading, theme, primary, ...props }: StudentListRowProps) {
  const Component = useContext(ListRowContext);
  const systemTheme = useColorScheme();
  const { width, fontScale } = useWindowDimensions();
  const currentTheme = theme ?? systemTheme ?? "light";
  const colors = nativeColors[currentTheme];
  const accessibleContents = [props.title, props.subtitle, ...(props.metadata ?? []).flatMap(({ label, value }) => [label, value])]
    .filter(Boolean).join(", ");
  const presentation = {
    ...props,
    layout: width >= 768 * Math.max(1, fontScale) ? "wide" as const : "compact" as const,
    theme: currentTheme,
    primary: primary ? { ...primary, label: primary.label ?? accessibleContents } : undefined,
  };

  return (
    <View testID={Component ? testID : undefined} collapsable={Component && testID ? false : undefined} style={[styles.row, { borderBottomColor: colors.border }]}>
      {Component ? <Component {...presentation} /> : <FallbackListRow {...presentation} testID={testID} chevron={chevron} titleHeading={titleHeading} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  content: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderRadius: nativeRadii.sm },
  identity: { flexGrow: 1, flexShrink: 1, gap: 2, minWidth: 0 },
  title: { fontSize: 14, lineHeight: 21 },
  supporting: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 18 },
  metadata: { maxWidth: "38%", flexShrink: 1, gap: 3 },
  metadataWide: { flexDirection: "row", gap: 10 },
  field: { flexShrink: 1 },
  chevron: { fontSize: 22, paddingHorizontal: 4 },
});
