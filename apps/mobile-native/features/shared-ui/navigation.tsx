import { forwardRef, useEffect, useRef, useState, type ComponentRef, type ReactNode, type Ref } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type PressableProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { nativeColors, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import { Button } from "../../components/Button";
import { hapticSelection } from "../../device/haptics";
import { nativeControlLabelPosition, nativeTypography } from "../../typography";
import { BrandSymbol, NavigationIcon, type NavigationIconName } from "./navigation-icons";
import { visibleNavigationTabs } from "./navigation-model";
import { SharedPopover, SharedPopoverAnchor } from "./overlays";

type NavigationTheme = keyof typeof nativeColors;

export const roleNavigationDestinations = {
  student: ["home", "courses", "schedule", "discuss", "me"],
  tutor: ["home", "schedule", "discuss", "classes"],
  admin: ["home", "courses", "people", "ops", "more"],
} as const;

export type RoleNavigationRole = keyof typeof roleNavigationDestinations;
export type RoleDestinationId<Role extends RoleNavigationRole> = (typeof roleNavigationDestinations)[Role][number];

const destinationIcons = {
  home: "home",
  courses: "book",
  schedule: "schedule",
  discuss: "discuss",
  me: "account",
  classes: "classes",
  people: "people",
  ops: "ops",
  more: "more",
} as const satisfies Record<RoleDestinationId<RoleNavigationRole>, NavigationIconName>;

export const navbarActionIds = ["back", "home", "switch-course", "search", "notifications", "account", "ops-ai"] as const;
export type NavbarActionId = (typeof navbarActionIds)[number];
type NavbarTrailingActionId = "search" | "notifications" | "account" | "ops-ai";
type NavbarAction = { label: string; expanded?: boolean; disabled?: boolean };

const roleNavbarActions = {
  student: ["search", "notifications", "account"],
  tutor: ["search", "notifications", "account"],
  admin: ["ops-ai", "search", "notifications", "account"],
} as const satisfies Record<RoleNavigationRole, readonly NavbarTrailingActionId[]>;

export type MobileNavbarProps = {
  role: RoleNavigationRole;
  title?: string;
  subtitle?: string;
  back?: NavbarAction;
  home?: NavbarAction;
  course?: NavbarAction & { title: string };
  actions?: Partial<Record<NavbarTrailingActionId, NavbarAction>>;
  actionRefs?: Partial<Record<NavbarActionId, Ref<ComponentRef<typeof Pressable>>>>;
  onAction: (id: NavbarActionId) => void;
  pageActions?: ReactNode;
  includeSafeArea?: boolean;
  hidden?: boolean;
  theme?: NavigationTheme;
  testID?: string;
};

export function MobileNavbar({
  role,
  title,
  subtitle,
  back,
  home,
  course,
  actions,
  actionRefs,
  onAction,
  pageActions,
  includeSafeArea = true,
  hidden = false,
  theme,
  testID,
}: MobileNavbarProps) {
  const insets = useSafeAreaInsets();
  const systemTheme = useColorScheme();
  const resolvedTheme = theme ?? systemTheme ?? "light";
  const colors = nativeColors[resolvedTheme];

  if (hidden) return null;

  function action(id: NavbarActionId, descriptor: NavbarAction) {
    return (
      <Button
        key={id}
        ref={actionRefs?.[id]}
        testID={testID ? `${testID}-${id}` : undefined}
        theme={resolvedTheme}
        accessibilityLabel={descriptor.label}
        accessibilityState={{ expanded: descriptor.expanded }}
        disabled={descriptor.disabled}
        onPress={() => onAction(id)}
        variant={id === "home" ? "ghost" : "outline"}
        size="icon-lg"
        renderIcon={(color, size) => id === "home"
          ? <BrandSymbol color={resolvedTheme === "dark" ? colors.foreground : colors.primary} />
          : <NavigationIcon name={id} color={id === "ops-ai" ? colors.primary : color} size={size} />}
        style={styles.navbarButton}
      />
    );
  }

  return (
    <View
      role="banner"
      testID={testID}
      style={[
        { backgroundColor: colors.background },
        includeSafeArea && { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      <View style={styles.navbar}>
        {back ? action("back", back) : home ? action("home", home) : null}
        {course ? (
          <NavigationControl
            ref={actionRefs?.["switch-course"]}
            focusColor={colors.accent}
            accessibilityRole="button"
            accessibilityLabel={`${course.label}: ${course.title}`}
            accessibilityState={{ expanded: course.expanded, disabled: course.disabled }}
            disabled={course.disabled}
            testID={testID ? `${testID}-switch-course` : undefined}
            onPress={() => onAction("switch-course")}
            style={({ pressed }) => [
              styles.courseButton,
              { borderColor: colors.border, backgroundColor: pressed ? colors.muted : colors.background },
              course.disabled && styles.disabled,
            ]}
          >
            <Text numberOfLines={2} style={[styles.courseTitle, nativeTypography.bodyMedium, { color: colors.foreground }]}>
              {course.title}
            </Text>
            <NavigationIcon name="switch-course" color={colors.mutedForeground} size={14} />
          </NavigationControl>
        ) : (
          <View style={styles.navbarTitle}>
            {title ? (
              <Text accessibilityRole="header" numberOfLines={2} style={[styles.heading, nativeTypography.headingBold, { color: colors.foreground }]}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text numberOfLines={1} style={[styles.subtitle, nativeTypography.bodyMedium, { color: colors.mutedForeground }]}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        )}
        {pageActions}
        {roleNavbarActions[role].map((id) => actions?.[id] ? action(id, actions[id]) : null)}
      </View>
    </View>
  );
}

type BottomNavigationBadge = { label: string; count: number } | { label: string; dot: true };

export type RoleBottomNavigationProps<Role extends RoleNavigationRole> = {
  role: Role;
  labels: Readonly<Record<RoleDestinationId<NoInfer<Role>>, string>>;
  activeId: RoleDestinationId<NoInfer<Role>> | null;
  onDestinationPress: (id: RoleDestinationId<NoInfer<Role>>) => void;
  accessibilityLabel: string;
  badges?: Partial<Record<RoleDestinationId<NoInfer<Role>>, BottomNavigationBadge>>;
  // A destination such as Admin More can be an action with a controlled sheet.
  actionIds?: readonly RoleDestinationId<NoInfer<Role>>[];
  expandedId?: RoleDestinationId<NoInfer<Role>>;
  itemRefs?: Partial<Record<RoleDestinationId<NoInfer<Role>>, Ref<ComponentRef<typeof Pressable>>>>;
  hidden?: boolean;
  includeSafeArea?: boolean;
  theme?: NavigationTheme;
  testID?: string;
};

export function RoleBottomNavigation<Role extends RoleNavigationRole>({
  role,
  labels,
  activeId,
  onDestinationPress,
  accessibilityLabel,
  badges,
  actionIds,
  expandedId,
  itemRefs,
  hidden = false,
  includeSafeArea = true,
  theme,
  testID,
}: RoleBottomNavigationProps<Role>) {
  const insets = useSafeAreaInsets();
  const systemTheme = useColorScheme();
  const resolvedTheme = theme ?? systemTheme ?? "light";
  const colors = nativeColors[resolvedTheme];
  const destinations: readonly RoleDestinationId<Role>[] = roleNavigationDestinations[role];

  if (hidden) return null;

  return (
    <View
      role="navigation"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[
        { backgroundColor: colors.background },
        includeSafeArea && { paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right },
      ]}
    >
      <View style={styles.bottomNavigation}>
        {destinations.map((id) => {
          const isAction = Boolean(actionIds?.includes(id));
          const active = id === activeId || id === expandedId;
          const color = active ? colors.foreground : colors.mutedForeground;
          const badge = badges?.[id];
          const count = badge && "count" in badge && badge.count > 0 ? badge.count : 0;
          const showBadge = badge && ("dot" in badge || count > 0);
          return (
            <NavigationControl
              key={id}
              ref={itemRefs?.[id]}
              focusColor={colors.accent}
              accessibilityRole={isAction ? "button" : "link"}
              accessibilityLabel={showBadge ? `${labels[id]}, ${badge.label}` : labels[id]}
              accessibilityState={{ selected: active, expanded: isAction ? id === expandedId : undefined }}
              testID={testID ? `${testID}-${id}` : undefined}
              onPress={() => {
                void hapticSelection();
                onDestinationPress(id);
              }}
              style={({ pressed }) => [
                styles.destination,
                { backgroundColor: active ? `${colors.foreground}14` : pressed ? `${colors.muted}66` : "transparent" },
              ]}
            >
              <View accessible={false}>
                <NavigationIcon name={role === "admin" && id === "courses" ? "classes" : destinationIcons[id]} color={color} size={20} />
                {showBadge ? (
                  <View style={[count ? styles.badge : styles.dot, { backgroundColor: colors.destructive }]}>
                    {count ? <Text style={[nativeTypography.bodyMedium, styles.badgeLabel, { color: colors.background }]}>{count > 99 ? "99+" : count}</Text> : null}
                  </View>
                ) : null}
              </View>
              <Text style={[styles.destinationLabel, nativeTypography.bodyMedium, { color }]}>{labels[id]}</Text>
            </NavigationControl>
          );
        })}
      </View>
    </View>
  );
}

export type NavigationTab<Id extends string> = {
  id: Id;
  label: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  renderIcon?: (color: string) => ReactNode;
  accessory?: ReactNode;
};
export type NavigationTabsProps<Id extends string> = {
  tabs: readonly NavigationTab<Id>[];
  activeId: NoInfer<Id> | null;
  onTabPress: (id: NoInfer<Id>) => void;
  accessibilityLabel: string;
  moreLabel: string;
  closeLabel: string;
  activeIndicatorColor?: string;
  trailing?: ReactNode;
  variant?: "page" | "inline";
  theme?: NavigationTheme;
  testID?: string;
};

export function NavigationTabs<Id extends string>({
  tabs,
  activeId,
  onTabPress,
  accessibilityLabel,
  moreLabel,
  closeLabel,
  activeIndicatorColor,
  trailing,
  variant = "page",
  theme,
  testID,
}: NavigationTabsProps<Id>) {
  const systemTheme = useColorScheme();
  const resolvedTheme = theme ?? systemTheme ?? "light";
  const colors = nativeColors[resolvedTheme];
  const indicatorColor = activeIndicatorColor ?? colors.primary;
  const moreRef = useRef<ComponentRef<typeof Pressable>>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [trailingWidth, setTrailingWidth] = useState(0);
  const [measuredWidths, setMeasuredWidths] = useState<Partial<Record<string, number>>>({});
  const [open, setOpen] = useState(false);
  const moreKey = JSON.stringify([null, moreLabel]);
  const inline = variant === "inline";
  const triggerStyle = inline ? [styles.tabControl, styles.inlineTabControl] : styles.tabControl;

  const widths = tabs.map(({ id, label }) => measuredWidths[JSON.stringify([id, label])] ?? 0);
  const moreWidth = measuredWidths[moreKey] ?? 0;
  const hasMeasurements = availableWidth > 0 && moreWidth > 0 && widths.every((width) => width > 0);
  const available = availableWidth - (trailing ? trailingWidth + styles.tabRow.gap : 0);
  const visibleCount = hasMeasurements ? visibleNavigationTabs(widths, available, moreWidth, styles.tabRow.gap) : inline ? tabs.length : 0;

  const visible = tabs.slice(0, visibleCount);
  const overflow = hasMeasurements ? tabs.slice(visibleCount) : [];
  const hasOverflow = overflow.length > 0;
  const activeInOverflow = overflow.some(({ id }) => id === activeId);

  useEffect(() => {
    if (!hasOverflow) setOpen(false);
  }, [hasOverflow]);

  function recordWidth(key: string, width: number) {
    setMeasuredWidths((current) => current[key] === width ? current : { ...current, [key]: width });
  }

  function select(id: Id) {
    if (id !== activeId) {
      void hapticSelection();
      onTabPress(id);
    }
  }

  function tabContent(tab: NavigationTab<Id>, color: string) {
    return <>
      {tab.renderIcon?.(color)}
      <Text style={[styles.tabLabel, nativeTypography.bodyMedium, inline && styles.inlineTabLabel,
        inline && nativeControlLabelPosition, { color }]}>{tab.label}</Text>
      {tab.accessory}
    </>;
  }

  return (
    <>
      <View
        testID={testID}
        role="tablist"
        accessibilityLabel={accessibilityLabel}
        onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
        style={[styles.tabRow, { borderBottomColor: `${colors.border}b3` }, inline && styles.inlineTabRow]}
      >
        <View style={styles.measureRow} pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants">
          {tabs.map(tab => {
            const key = JSON.stringify([tab.id, tab.label]);
            return (
              <View key={key} onLayout={(event) => recordWidth(key, event.nativeEvent.layout.width)} style={triggerStyle}>
                {tabContent(tab, colors.mutedForeground)}
              </View>
            );
          })}
          <View onLayout={(event) => recordWidth(moreKey, event.nativeEvent.layout.width)} style={triggerStyle}>
            <Text style={[styles.tabLabel, nativeTypography.bodyMedium]}>{moreLabel}</Text>
            <View style={{ width: 14 }} />
          </View>
        </View>
        {visible.map((tab) => (
          <NavigationControl
            key={tab.id}
            focusColor={colors.accent}
            accessibilityRole="tab"
            accessibilityLabel={tab.accessibilityLabel}
            accessibilityState={{ selected: tab.id === activeId, disabled: tab.disabled }}
            hitSlop={inline ? { top: 2, bottom: 2 } : undefined}
            disabled={tab.disabled}
            testID={testID ? `${testID}-${tab.id}` : undefined}
            style={({ pressed }) => [
              styles.tabControl,
              { borderBottomColor: tab.id === activeId ? indicatorColor : "transparent",
                backgroundColor: pressed ? `${colors.muted}66` : undefined },
              inline && styles.inlineTabControl,
              tab.disabled && styles.disabled,
            ]}
            onPress={() => select(tab.id)}
          >
            {tabContent(tab, tab.id === activeId ? colors.foreground : colors.mutedForeground)}
            {inline && tab.id === activeId && <View pointerEvents="none" style={[styles.inlineIndicator, { backgroundColor: indicatorColor }]} />}
          </NavigationControl>
        ))}
        {(!inline || hasOverflow || trailing) ? <View style={styles.tabEnd}>
          {hasOverflow ? (
            <SharedPopoverAnchor style={styles.moreTab}>
              <NavigationControl
                ref={moreRef}
                focusColor={colors.accent}
                accessibilityRole="button"
                accessibilityState={{ expanded: open, selected: activeInOverflow }}
                accessibilityLabel={moreLabel}
                testID={testID ? `${testID}-more` : undefined}
                onPress={() => setOpen(true)}
                style={({ pressed }) => [
                  styles.tabControl,
                  styles.moreTab,
                  {
                    borderBottomColor: activeInOverflow ? indicatorColor : "transparent",
                    backgroundColor: pressed ? `${colors.muted}66` : undefined,
                  },
                  inline && styles.inlineTabControl,
                ]}
              >
                <View accessible={false} style={[styles.moreDivider, { backgroundColor: colors.border }]} />
                <Text style={[styles.tabLabel, nativeTypography.bodyMedium, styles.courseTitle, { color: activeInOverflow ? colors.foreground : colors.mutedForeground }]}>
                  {moreLabel}
                </Text>
                <NavigationIcon name="chevron" color={colors.mutedForeground} size={14} />
                {inline && activeInOverflow && <View pointerEvents="none" style={[styles.inlineIndicator, { backgroundColor: indicatorColor }]} />}
              </NavigationControl>
              <SharedPopover
                open={open}
                title={moreLabel}
                closeLabel={closeLabel}
                theme={resolvedTheme}
                testID={testID ? `${testID}-overflow` : undefined}
                anchorRef={moreRef}
                align="end"
                onDismiss={() => setOpen(false)}
              >
                {overflow.map(tab => {
                  const { id, label, disabled, accessibilityLabel } = tab;
                  const active = id === activeId;
                  const color = active ? colors.foreground : colors.mutedForeground;
                  return (
                    <NavigationControl
                      key={id}
                      focusColor={colors.accent}
                      accessibilityRole="tab"
                      accessibilityLabel={accessibilityLabel}
                      accessibilityState={{ selected: active, disabled }}
                      testID={testID ? `${testID}-overflow-${id}` : undefined}
                      disabled={disabled}
                      onPress={() => {
                        setOpen(false);
                        select(id);
                      }}
                      style={({ pressed }) => [
                        styles.overflowItem,
                        { borderStartColor: active ? indicatorColor : "transparent",
                          backgroundColor: active || pressed ? `${colors.muted}80` : "transparent" },
                        disabled && styles.disabled,
                      ]}
                    >
                      {tab.renderIcon || tab.accessory ? <View style={styles.overflowContent}>{tabContent(tab, color)}</View>
                        : <Text style={[styles.tabLabel, nativeTypography.bodyMedium, { color }]}>{label}</Text>}
                    </NavigationControl>
                  );
                })}
              </SharedPopover>
            </SharedPopoverAnchor>
          ) : null}
          {trailing ? <View onLayout={(event) => setTrailingWidth(event.nativeEvent.layout.width)}>{trailing}</View> : null}
        </View> : null}
      </View>
    </>
  );
}

const NavigationControl = forwardRef<ComponentRef<typeof Pressable>, PressableProps & { focusColor: string }>(
  function NavigationControl({ focusColor, style, ...props }, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <Pressable
        {...props}
        ref={ref}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={(state) => [
          typeof style === "function" ? style(state) : style,
          focused && { outlineColor: focusColor, outlineWidth: 2, outlineOffset: -2 },
        ]}
      />
    );
  },
);

const styles = StyleSheet.create({
  navbar: { minHeight: 52, paddingHorizontal: 12, paddingVertical: 4, flexDirection: "row", gap: 6, alignItems: "center" },
  navbarButton: { borderRadius: 12 },
  navbarTitle: { flex: 1, minWidth: 0, paddingHorizontal: 3 },
  heading: { fontSize: 14, lineHeight: 18 },
  subtitle: { fontSize: 11, lineHeight: 14 },
  courseButton: { flex: 1, minWidth: 44, minHeight: 44, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  courseTitle: { flexShrink: 1, minWidth: 0, fontSize: 14, lineHeight: 18 },
  bottomNavigation: { minHeight: 60, paddingHorizontal: 8, paddingVertical: 6, gap: 4, flexDirection: "row" },
  destination: { flex: 1, minHeight: 48, minWidth: 0, paddingHorizontal: 2, paddingVertical: 3, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 16 },
  destinationLabel: { fontSize: 11, lineHeight: 13, textAlign: "center" },
  badge: { position: "absolute", top: -5, end: -10, paddingHorizontal: 3, minWidth: 16, alignItems: "center", borderRadius: nativeRadii.sm },
  badgeLabel: { fontSize: 10, lineHeight: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, position: "absolute", top: -2, end: -4 },
  disabled: { opacity: 0.5 },
  tabRow: { flexDirection: "row", minHeight: 44, borderBottomWidth: 1, gap: 2, overflow: "hidden" },
  inlineTabRow: { borderBottomWidth: 0, alignItems: "center", justifyContent: "center" },
  measureRow: { position: "absolute", left: 0, top: 0, width: 10000, opacity: 0, flexDirection: "row" },
  tabControl: { flexDirection: "row", minWidth: 44, minHeight: 44, paddingHorizontal: 12, paddingVertical: 6, gap: 6, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, flexShrink: 0 },
  inlineTabControl: { minHeight: 40, paddingVertical: 10, gap: 8, borderBottomWidth: 0 },
  inlineTabLabel: { lineHeight: 20, includeFontPadding: false },
  inlineIndicator: { position: "absolute", left: 0, right: 0, bottom: 0, height: 2 },
  tabLabel: { fontSize: 14, lineHeight: 19 },
  tabEnd: { marginStart: "auto", flexDirection: "row", alignItems: "center", flexShrink: 1, gap: 2 },
  moreTab: { flexShrink: 1, alignSelf: "stretch" },
  moreDivider: { position: "absolute", left: 0, top: 12, bottom: 12, width: 1 },
  overflowItem: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 6, borderStartWidth: 2, borderRadius: nativeRadii.md },
  overflowContent: { flexDirection: "row", alignItems: "center", gap: 8 },
});
