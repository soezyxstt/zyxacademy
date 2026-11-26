import { useNavigation, useSitemap } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { TutorCourseSummary } from "../../../components/navigation/tutor/tutor-nav-model";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import type { NativeAccountContext } from "../../../packages/native-session/context";
import { resolveNativeProtectedDestination } from "../auth/login-intent";
import { NativeInboxBell } from "../features/notification-inbox/bell";
import { NativeListRow, NativeStatusPanel } from "../features/shared-ui/layout";
import { MobileNavbar, RoleBottomNavigation } from "../features/shared-ui/navigation";
import { NavigationIcon } from "../features/shared-ui/navigation-icons";
import { SharedSheet } from "../features/shared-ui/overlays";
import type { NativeSessionTransport } from "../network/transport";
import { nativeTypography } from "../typography";
import { defaultStaffVisibility, StaffNavVisibility } from "./staff-chrome-visibility";
import { adminMoreSections, adminOtherRoleEntries, staffNavigation, tutorClassCopy, tutorClassEntries } from "./staff-navigation";

type CoursePicker = { status: "loading" } | { status: "error" } | { status: "ready"; entries: ReturnType<typeof tutorClassEntries> };

export function StaffChrome({ role, href, theme, focused, context, checkingAccess, session, visit, back, loadTutorCourses, children }: {
  role: "admin" | "tutor";
  href: string;
  theme: "light" | "dark";
  focused: boolean;
  context: NativeAccountContext;
  checkingAccess: boolean;
  session: NativeSessionTransport;
  visit(href: string): void;
  back(fallback: string): void;
  loadTutorCourses(signal: AbortSignal): Promise<readonly TutorCourseSummary[]>;
  children: ReactNode;
}) {
  const { locale } = context;
  const navigation = staffNavigation(role, href, locale);
  const screenNavigation = useNavigation();
  const sitemap = useSitemap();
  const colors = nativeColors[theme];
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const request = useRef<AbortController | null>(null);
  const [sheet, setSheet] = useState<"more" | "classes" | null>(null);
  const [coursePicker, setCoursePicker] = useState<CoursePicker>({ status: "loading" });
  const [visibility, setVisibility] = useState(defaultStaffVisibility);

  useEffect(() => {
    if (!focused) {
      request.current?.abort();
      request.current = null;
      setSheet(null);
    }
    return () => request.current?.abort();
  }, [focused, session]);

  function choose(target: string) {
    if (!screenNavigation.isFocused() || !session.isCurrent()) return;
    const destination = resolveNativeProtectedDestination(target, context, sitemap);
    if (destination) visit(destination.href);
  }

  function closeSheet() {
    request.current?.abort();
    request.current = null;
    setSheet(null);
  }

  function chooseFromSheet(target: string) {
    closeSheet();
    choose(target);
  }

  function openClasses() {
    if (role !== "tutor" || !screenNavigation.isFocused() || !session.isCurrent() || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setCoursePicker({ status: "loading" });
    setSheet("classes");
    void loadTutorCourses(controller.signal).then(courses => {
      if (controller.signal.aborted || !session.isCurrent()) return;
      const entries = tutorClassEntries(href, courses, context, sitemap);
      if (entries.length === 1) chooseFromSheet(entries[0].href);
      else setCoursePicker({ status: "ready", entries });
    }).catch(() => {
      if (!controller.signal.aborted && session.isCurrent()) setCoursePicker({ status: "error" });
    }).finally(() => { if (request.current === controller) request.current = null; });
  }

  const classes = tutorClassCopy(locale);
  const hidden = navigation.hideBottom || visibility.hideBottom;
  const moreSections = sheet === "more" ? adminMoreSections(href, context, sitemap) : [];
  const otherRoles = sheet === "more" ? adminOtherRoleEntries(context, sitemap) : [];
  const activeLabel = locale === "id" ? "Halaman saat ini" : "Current page";
  const renderLink = (item: { href: string; label: string; selected?: boolean }) => (
    <NativeListRow key={item.href} title={item.label} theme={theme} layout="compact"
      leading={item.selected ? <NavigationIcon name="check" color={colors.primary} size={16} /> : undefined}
      primary={{ role: "link", label: item.selected ? `${item.label}. ${activeLabel}` : item.label, onPress: () => chooseFromSheet(item.href) }} />
  );

  return (
    <SafeAreaView style={[styles.frame, { backgroundColor: colors.background }]}>
      <MobileNavbar role={role} theme={theme} title={navigation.title} includeSafeArea={false} testID={`${role}-navbar`}
        hidden={visibility.hideTop}
        pageActions={focused && !visibility.hideTop ? <NativeInboxBell role={role} locale={locale} theme={theme} visit={visit} /> : null}
        home={navigation.backTo === null ? { label: navigation.homeLabel } : undefined}
        back={navigation.backTo ? { label: navigation.labels.back } : undefined}
        onAction={action => {
          if (action === "home") choose(navigation.targets.home);
          if (action === "back" && navigation.backTo && screenNavigation.isFocused() && session.isCurrent()) back(navigation.backTo);
        }} />
      <View style={styles.frame}>
        <StaffNavVisibility.Provider value={setVisibility}>{children}</StaffNavVisibility.Provider>
      </View>
      {navigation.role === "admin" ?
        <RoleBottomNavigation role="admin" theme={theme} labels={navigation.labels} activeId={navigation.active}
          accessibilityLabel={navigation.labels.bottomNavLabel} includeSafeArea={false} testID="admin-bottom-nav"
          hidden={hidden} actionIds={["more"]} expandedId={sheet === "more" ? "more" : undefined} itemRefs={{ more: trigger }}
          onDestinationPress={id => {
            if (id === "more") { if (sitemap && screenNavigation.isFocused() && session.isCurrent()) setSheet("more"); }
            else choose(navigation.targets[id]);
          }} /> :
        <RoleBottomNavigation role="tutor" theme={theme} labels={navigation.labels} activeId={navigation.active}
          accessibilityLabel={navigation.labels.bottomNavLabel} includeSafeArea={false} testID="tutor-bottom-nav"
          hidden={hidden} actionIds={["classes"]} expandedId={sheet === "classes" ? "classes" : undefined} itemRefs={{ classes: trigger }}
          onDestinationPress={id => id === "classes" ? openClasses() : choose(navigation.targets[id])} />}
      <SharedSheet open={focused && sheet !== null && !hidden && !checkingAccess}
        title={navigation.role === "admin" ? navigation.labels.moreSheetTitle : classes.title}
        closeLabel={navigation.closeLabel} onDismiss={closeSheet} returnFocusRef={trigger} theme={theme}
        testID={`${role}-navigation-sheet`}>
        {moreSections.map(group => (
          <View key={group.id}>
            <Text accessibilityRole="header" style={[styles.groupTitle, { color: colors.mutedForeground }]}>{group.title}</Text>
            {group.items.map(renderLink)}
          </View>
        ))}
        {otherRoles.map(renderLink)}
        {sheet === "classes" && (coursePicker.status === "loading" ?
          <ActivityIndicator accessibilityLabel={classes.loading} color={colors.primary} /> : coursePicker.status === "error" ?
            <NativeStatusPanel theme={theme} tone="error" title={classes.failed} action={{ id: "retry", label: classes.retry }} onAction={openClasses} /> :
            (coursePicker.entries.length ? coursePicker.entries.map(renderLink) : <NativeStatusPanel theme={theme} title={classes.empty} />))}
      </SharedSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  groupTitle: { ...nativeTypography.bodySemibold, fontSize: 12, lineHeight: 18, marginVertical: 4 },
});
