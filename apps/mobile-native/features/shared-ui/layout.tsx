import { type ReactNode, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import { type Edge, SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { nativeColors, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import { Button } from "../../components/Button";
import { Separator } from "../../components/Separator";
import { nativeTypography } from "../../typography";
import type { SharedUiAction, SharedUiActionGroup, SharedUiActionHandler, SharedUiTheme } from "./actions";

export type NativeCompactShellProps = {
  children: ReactNode;
  theme?: SharedUiTheme;
  /** Slots are within the shell's safe area. */
  topBar?: ReactNode;
  bottomBar?: ReactNode;
  navigationTitle?: string;
  back?: { label: string; onPress: () => void };
  /** Override when the host already applies one or more insets. */
  edges?: readonly Edge[];
};

export function NativeCompactShell({
  children,
  theme,
  topBar,
  bottomBar,
  navigationTitle,
  back,
  edges,
}: NativeCompactShellProps) {
  const systemTheme = useColorScheme();
  const resolvedTheme = theme ?? systemTheme ?? "light";
  const colors = nativeColors[resolvedTheme];
  const { width } = useWindowDimensions();
  const gutter = width >= 1024 ? 32 : width >= 640 ? 24 : 16;

  return (
    <SafeAreaView edges={edges} style={[styles.shell, { backgroundColor: colors.background }]}>
      {(back || navigationTitle) && (
        <View style={[styles.navigation, { paddingHorizontal: gutter, borderBottomColor: colors.border }]}>
          {back && (
            <SharedUiActionButton
              action={{ id: "back", label: back.label, iconOnly: true, renderIcon: BackArrow, variant: "ghost" }}
              onAction={back.onPress}
              theme={resolvedTheme}
              testID="shared-ui-back"
            />
          )}
          {navigationTitle && (
            <Text accessibilityRole="header" style={[styles.navigationTitle, { color: colors.foreground }]}>
              {navigationTitle}
            </Text>
          )}
        </View>
      )}
      {topBar}
      <View style={[styles.page, { paddingHorizontal: gutter }]}>{children}</View>
      {bottomBar}
    </SafeAreaView>
  );
}

function BackArrow(color: string, size: number) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={I18nManager.isRTL ? "M5 12h14m-7-7 7 7-7 7" : "M19 12H5m7-7-7 7 7 7"}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export type SharedUiActionButtonProps<Id extends string> = {
  action: SharedUiAction<Id>;
  onAction: SharedUiActionHandler<Id>;
  theme?: SharedUiTheme;
  testID?: string;
};

export function SharedUiActionButton<Id extends string>({
  action,
  onAction,
  theme,
  testID,
}: SharedUiActionButtonProps<Id>) {
  const { fontScale } = useWindowDimensions();
  return (
    <Button
      accessibilityLabel={action.accessibilityLabel ?? action.label}
      disabled={action.disabled}
      hitSlop={0}
      isLoading={action.pending}
      onPress={() => onAction(action.id)}
      renderIcon={action.renderIcon}
      size={action.iconOnly ? "icon-lg" : "default"}
      style={[styles.action, !action.iconOnly && { height: Math.max(44, 20 * fontScale + 16) }]}
      testID={testID}
      theme={theme}
      variant={action.variant ?? "outline"}
    >
      {action.iconOnly ? undefined : action.label}
    </Button>
  );
}

export type NativePageHeaderProps<Id extends string = string> = SharedUiActionGroup<Id> & {
  /** Optional accessibility heading when navigation has no route title. */
  title?: string;
  theme?: SharedUiTheme;
};

export function NativePageHeader<Id extends string>({
  title,
  actions,
  onAction,
  theme,
}: NativePageHeaderProps<Id>) {
  const systemTheme = useColorScheme();
  const resolvedTheme = theme ?? systemTheme ?? "light";

  if (!title && !actions?.length) return null;

  return (
    <View style={actions?.length ? styles.header : undefined}>
      {title && (
        <View pointerEvents="none" style={styles.visuallyHidden}>
          <Text accessibilityRole="header" accessibilityLabel={title}>{title}</Text>
        </View>
      )}
      {actions?.length && onAction ? (
        <View style={styles.headerActions}>
          {actions.map((action) => (
            <SharedUiActionButton key={action.id} action={action} onAction={onAction} theme={resolvedTheme} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export type NativeStatusContent<Id extends string = string> = {
  title: string;
  message?: string;
} & (
  | { action?: undefined; onAction?: undefined }
  | { action: SharedUiAction<Id>; onAction: SharedUiActionHandler<Id> }
);

export type NativeStatusPanelProps<Id extends string = string> = NativeStatusContent<Id> & {
  tone?: "empty" | "error";
  theme?: SharedUiTheme;
};

export function NativeStatusPanel<Id extends string>({
  title,
  message,
  action,
  onAction,
  tone = "empty",
  theme,
}: NativeStatusPanelProps<Id>) {
  const systemTheme = useColorScheme();
  const resolvedTheme = theme ?? systemTheme ?? "light";
  const colors = nativeColors[resolvedTheme];

  return (
    <View style={styles.notice}>
      <View
        accessible
        accessibilityLabel={message ? `${title}. ${message}` : title}
        accessibilityLiveRegion="polite"
        accessibilityRole={tone === "error" ? "alert" : undefined}
        style={styles.noticeCopy}
      >
        <Text style={[styles.noticeTitle, { color: tone === "error" ? colors.destructive : colors.foreground }]}>
          {title}
        </Text>
        {message && <Text style={[styles.supportingText, styles.noticeMessage, { color: colors.mutedForeground }]}>{message}</Text>}
      </View>
      {action && onAction && <SharedUiActionButton action={action} onAction={onAction} theme={resolvedTheme} />}
    </View>
  );
}

export type NativeListLayout = "compact" | "wide";

export type NativeListState<Row, Id extends string = string> =
  | { status: "ready"; rows: readonly Row[] }
  | { status: "loading"; label: string }
  | ({ status: "error" } & NativeStatusContent<Id>);

export type NativeResponsiveListProps<Row, Id extends string = string> = {
  label: string;
  state: NativeListState<Row, Id>;
  empty: NativeStatusContent<Id>;
  getRowKey: (row: Row) => string;
  renderRow: (row: Row, layout: NativeListLayout) => ReactNode;
  theme?: SharedUiTheme;
};

export function NativeResponsiveList<Row, Id extends string>({
  label,
  state,
  empty,
  getRowKey,
  renderRow,
  theme,
}: NativeResponsiveListProps<Row, Id>) {
  const systemTheme = useColorScheme();
  const resolvedTheme = theme ?? systemTheme ?? "light";
  const colors = nativeColors[resolvedTheme];
  const { width, fontScale } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState<number>();
  const layout: NativeListLayout = (containerWidth ?? width) >= 768 * Math.max(1, fontScale) ? "wide" : "compact";
  const rows = state.status === "ready" ? state.rows : [];
  const emptyComponent = state.status === "error" ? (
    <NativeStatusPanel {...state} tone="error" theme={resolvedTheme} />
  ) : state.status === "loading" ? (
    <View accessible accessibilityLabel={state.label} accessibilityLiveRegion="polite" accessibilityState={{ busy: true }} style={styles.notice}>
      <ActivityIndicator accessible={false} color={colors.primary} />
      <Text style={[styles.supportingText, { color: colors.mutedForeground }]}>{state.label}</Text>
    </View>
  ) : (
    <NativeStatusPanel {...empty} theme={resolvedTheme} />
  );

  return (
    <FlatList<Row>
      accessibilityLabel={label}
      accessibilityState={{ busy: state.status === "loading" }}
      data={rows}
      extraData={layout}
      ItemSeparatorComponent={() => <Separator theme={resolvedTheme} />}
      keyboardShouldPersistTaps="handled"
      keyExtractor={getRowKey}
      ListEmptyComponent={emptyComponent}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
      renderItem={({ item }) => <View role="listitem">{renderRow(item, layout)}</View>}
      role="list"
      style={styles.list}
    />
  );
}

export type NativeListRowProps<Id extends string = string> = SharedUiActionGroup<Id> & {
  layout: NativeListLayout;
  title: string;
  subtitle?: string;
  testID?: string;
  titleRole?: "header";
  leading?: ReactNode;
  metadata?: readonly { id: string; label: string; value: string }[];
  primary?: { onPress: () => void; label?: string; role?: "button" | "link"; disabled?: boolean };
  theme?: SharedUiTheme;
  testID?: string;
};

export function NativeListRow<Id extends string>({
  layout,
  title,
  subtitle,
  testID,
  titleRole,
  leading,
  primary,
  metadata,
  actions,
  onAction,
  theme,
  testID,
}: NativeListRowProps<Id>) {
  const systemTheme = useColorScheme();
  const resolvedTheme = theme ?? systemTheme ?? "light";
  const colors = nativeColors[resolvedTheme];
  const [focused, setFocused] = useState(false);
  const identity = (
    <>
      {leading && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{leading}</View>}
      <View style={styles.rowText}>
        <Text accessibilityRole={titleRole} style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle && <Text style={[styles.supportingText, { color: colors.mutedForeground }]}>{subtitle}</Text>}
      </View>
    </>
  );

  return (
    <View testID={primary ? undefined : testID} style={[styles.row, layout === "wide" && styles.wideRow]}>
      {primary ? (
        <Pressable
          testID={testID}
          accessibilityLabel={primary.label ?? (subtitle ? `${title}. ${subtitle}` : title)}
          accessibilityRole={primary.role ?? "button"}
          accessibilityState={{ disabled: primary.disabled }}
          disabled={primary.disabled}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          onPress={primary.onPress}
          style={({ pressed }) => [
            styles.identity,
            styles.rowPress,
            pressed && { backgroundColor: `${colors.primary}14` },
            focused && { outlineColor: colors.accent, outlineWidth: 2, outlineOffset: 2 },
          ]}
        >
          {identity}
        </Pressable>
      ) : <View style={styles.identity}>{identity}</View>}
      {!!metadata?.length && (
        <View style={styles.metadata}>
          {metadata.map((field) => (
            <View key={field.id} style={styles.metadataField}>
              <Text style={[styles.metadataLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
              <Text style={[styles.supportingText, { color: colors.foreground }]}>{field.value}</Text>
            </View>
          ))}
        </View>
      )}
      {actions?.length && onAction ? (
        <View style={styles.rowActions}>
          {actions.map((action) => (
            <SharedUiActionButton key={action.id} action={action} theme={resolvedTheme} onAction={onAction} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  page: { flex: 1, width: "100%", maxWidth: 1280, alignSelf: "center", paddingTop: 16 },
  navigation: { flexDirection: "row", alignItems: "center", minHeight: 48, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  navigationTitle: { ...nativeTypography.bodySemibold, flex: 1, fontSize: 16, lineHeight: 22, paddingVertical: 6 },
  action: { minWidth: 44, minHeight: 44, maxWidth: "100%" },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: 6, columnGap: 8, marginBottom: 8 },
  visuallyHidden: { position: "absolute", width: 1, height: 1, overflow: "hidden" },
  headerActions: { marginStart: "auto", maxWidth: "100%", flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 },
  notice: { alignItems: "center", gap: 12, paddingVertical: 24, paddingHorizontal: 16 },
  noticeCopy: { alignSelf: "stretch", gap: 4 },
  noticeTitle: { ...nativeTypography.bodySemibold, fontSize: 14, lineHeight: 20, textAlign: "center" },
  noticeMessage: { textAlign: "center" },
  list: { flex: 1 },
  row: { gap: 8, paddingVertical: 12 },
  wideRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  identity: { flexDirection: "row", alignItems: "center", flexGrow: 1, flexShrink: 1, gap: 10 },
  rowPress: { minHeight: 44, borderRadius: nativeRadii.md },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...nativeTypography.bodyMedium, fontSize: 14, lineHeight: 20 },
  supportingText: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 17 },
  metadata: { flexDirection: "row", flexWrap: "wrap", flexShrink: 1, gap: 12 },
  metadataField: { minWidth: 96, flexBasis: 96, flexGrow: 1, flexShrink: 1 },
  metadataLabel: { ...nativeTypography.bodySemibold, fontSize: 12, lineHeight: 17 },
  rowActions: { flexDirection: "row", flexWrap: "wrap", flexShrink: 1, gap: 6 },
});
