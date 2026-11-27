import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { Skeleton } from "../../../components/Skeleton";
import { nativeTypography } from "../../../typography";
import { SharedDialog, type SharedDialogProps } from "../../shared-ui/overlays";
import { NavigationIcon } from "../../shared-ui/navigation-icons";

type Theme = keyof typeof nativeColors;
export const CourseTheme = createContext<Theme>("light");
const type = StyleSheet.create({
  title: { ...nativeTypography.headingBold, fontSize: 24, lineHeight: 32 },
  heading: { ...nativeTypography.bodySemibold, fontSize: 17, lineHeight: 24 },
  body: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 21 },
  strong: { ...nativeTypography.bodySemibold, fontSize: 14, lineHeight: 21 },
  meta: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 17 },
});

export const layout = StyleSheet.create({
  page: { gap: 16, padding: 16, paddingBottom: 40, alignSelf: "center", width: "100%", maxWidth: 840 },
  scrollBody: { gap: 16, paddingBottom: 40 },
  listBody: { flex: 1, gap: 12, paddingBottom: 12 },
  group: { gap: 10 },
  compact: { gap: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  split: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  section: { paddingBottom: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  list: { borderTopWidth: StyleSheet.hairlineWidth },
  item: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 44, justifyContent: "center" },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  metric: { flexGrow: 1, flexBasis: 90, paddingVertical: 6, gap: 2 },
});

export function Ink({ children, kind = "body", tone = "default" }: {
  children: ReactNode;
  kind?: keyof typeof type;
  tone?: "default" | "muted" | "error" | "accent";
}) {
  const palette = useCourseColors();
  const color = { default: palette.foreground, muted: palette.mutedForeground, error: palette.destructive, accent: palette.primary }[tone];
  return <Text accessibilityRole={kind === "title" || kind === "heading" ? "header" : undefined} style={[type[kind], { color, flexShrink: 1 }]}>{children}</Text>;
}

export function useCourseColors() {
  return nativeColors[useContext(CourseTheme)];
}

export function Action({ label, onPress, testID, selected, disabled, variation = "outline" }: {
  label: string;
  onPress(): void;
  testID?: string;
  selected?: boolean;
  disabled?: boolean;
  variation?: "default" | "outline" | "destructive" | "ghost";
}) {
  const theme = useContext(CourseTheme);
  return (
    <Button
      theme={theme}
      onPress={onPress}
      testID={testID}
      variant={selected ? "default" : variation}
      accessibilityRole={selected === undefined ? "button" : "tab"}
      accessibilityState={selected === undefined ? undefined : { selected }}
      disabled={disabled}
      style={{ minHeight: 44, maxWidth: "100%" }}
    >
      {label}
    </Button>
  );
}

export function SearchBox({ label, value, onChange, testID }: {
  label: string; value: string; onChange(value: string): void; testID?: string;
}) {
  const theme = useContext(CourseTheme);
  return <Input theme={theme} accessibilityLabel={label} placeholder={label} value={value} onChangeText={onChange} autoCorrect={false} testID={testID} style={{ minHeight: 44 }} />;
}

export function Field({ label, ...props }: ComponentProps<typeof Input> & { label: string }) {
  const theme = useContext(CourseTheme);
  return (
    <View style={layout.compact}>
      <Ink kind="strong">{label}</Ink>
      <Input accessibilityLabel={label} theme={theme} {...props} />
    </View>
  );
}

export function Tabs<T extends string>({ options, selected, onSelect, testID }: {
  options: readonly { id: T; label: string }[];
  selected: T;
  onSelect(id: T): void;
  testID?: string;
}) {
  return (
    <View accessibilityRole="tablist" style={layout.tabs}>
      {options.map((item) => <Action key={item.id} label={item.label} selected={selected === item.id} onPress={() => onSelect(item.id)} testID={testID && `${testID}-${item.id}`} />)}
    </View>
  );
}

export function Picker({ label, options, selected, onSelect, testID, compact = false, disabled = false }: {
  label: string; options: readonly { id: string; label: string }[];
  selected: string; onSelect(id: string): void; testID?: string; compact?: boolean; disabled?: boolean;
}) {
  const theme = useContext(CourseTheme);
  const [open, setOpen] = useState(false);
  const selection = options.find((item) => item.id === selected)?.label ?? label;
  return (
    <View style={layout.compact}>
      {compact ? <Button theme={theme} variant="ghost" disabled={disabled} onPress={() => setOpen(!open)} testID={testID}
        accessibilityLabel={`${label}, ${selection}`} accessibilityState={{ expanded: open }} iconPosition="end"
        renderIcon={(color, size) => <NavigationIcon name="chevron" color={color} size={size} />} style={{ height: 44 }}>
        {selection}
      </Button> : <Action
        testID={testID}
        label={selection}
        disabled={disabled}
        onPress={() => setOpen(!open)}
      />}
      {open && !disabled ? (
        <View accessibilityLabel={label} style={layout.compact}>
          {options.map((item) => (
            <DataRow key={item.id} title={item.label} detail={item.id === selected ? "Dipilih" : undefined}
              testID={testID && `${testID}-${item.id || "all"}`}
              onPress={() => { onSelect(item.id); setOpen(false); }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

type CourseDialogProps = Pick<SharedDialogProps, "title" | "children" | "dismissDisabled" | "testID"> & {
  open?: boolean;
  onClose(): void;
};

export function CourseDialog({ title, open = true, onClose, children, dismissDisabled, testID }: CourseDialogProps) {
  const theme = useContext(CourseTheme);
  return (
    <SharedDialog open={open} onDismiss={onClose} title={title} closeLabel="Tutup" theme={theme}
      dismissOnBackdrop={false} dismissDisabled={dismissDisabled} testID={testID}>
      {children}
    </SharedDialog>
  );
}

export function Panel({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  const palette = useCourseColors();
  return (
    <View style={layout.group}>
      <View style={[layout.split, layout.section, { borderColor: palette.border }]}>
        <Ink kind="heading">{title}</Ink>
        {action}
      </View>
      {children}
    </View>
  );
}

export function DataRow({ title, description, detail, onPress, testID, expanded }: {
  title: string;
  description?: string | null;
  detail?: string;
  onPress?(): void;
  testID?: string;
  expanded?: boolean;
}) {
  const palette = useCourseColors();
  const content = (
    <View style={layout.split}>
      <View style={[layout.flex, layout.compact]}>
        <Ink kind="strong">{title}</Ink>
        {description ? <Ink kind="meta" tone="muted">{description}</Ink> : null}
      </View>
      {detail ? <Ink kind="meta" tone="muted">{detail}</Ink> : null}
      {onPress && expanded === undefined ? <Ink kind="strong" tone="accent">›</Ink> : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityState={expanded === undefined ? undefined : { expanded }}
      testID={testID} onPress={onPress} android_ripple={{ color: palette.muted }}
      style={({ pressed }) => [layout.item, { borderColor: palette.border }, pressed && { opacity: 0.75 }]}>
      {content}
    </Pressable>
  ) : <View testID={testID} style={[layout.item, { borderColor: palette.border }]}>{content}</View>;
}

export function CourseStatus({ label, retry, error = false }: { label: string; retry?(): void; error?: boolean }) {
  return (
    <View style={[layout.group, { alignItems: "flex-start", paddingVertical: 8 }]} accessibilityLiveRegion="polite">
      <Ink tone={error ? "error" : "muted"}>{label}</Ink>
      {retry ? <Action label="Coba lagi" onPress={retry} testID="course-retry" /> : null}
    </View>
  );
}

export function PendingCourses() {
  const theme = useContext(CourseTheme);
  return (
    <View accessible accessibilityLabel="Memuat mata kuliah" accessibilityState={{ busy: true }} style={layout.group}>
      <Skeleton theme={theme} style={{ width: 168, height: 26 }} />
      <Skeleton theme={theme} style={{ width: "100%", height: 44 }} />
      <Skeleton theme={theme} style={{ width: "100%", height: 44 }} />
    </View>
  );
}

export function Metrics({ values }: { values: readonly { label: string; value: number | string }[] }) {
  const palette = useCourseColors();
  return (
    <View style={[layout.row, layout.list, layout.section, { borderColor: palette.border }]}>
      {values.map((item) => (
        <View key={item.label} style={layout.metric} accessible accessibilityLabel={`${item.label}, ${item.value}`}>
          <Ink kind="heading">{item.value}</Ink>
          <Ink kind="meta" tone="muted">{item.label}</Ink>
        </View>
      ))}
    </View>
  );
}
