import { useIsFocused, useNavigation } from "expo-router";
import { randomUUID } from "expo-crypto";
import { openBrowserAsync } from "expo-web-browser";
import { useLayoutEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { useNativeSession } from "../auth/session-provider";
import { VisibleNavbarTitle } from "./visible-navbar-title";
import { MobileNavbar, RoleBottomNavigation } from "../features/shared-ui/navigation";
import { NativeInboxBell } from "../features/notification-inbox/bell";
import { useSiteSearch } from "../features/site-search/search";
import type { StudentRequest } from "../features/student/contracts";
import { bindStudentRequest } from "../features/student/transport";
import { CourseZyra } from "../features/student/zyra/CourseZyra";
import { CourseZyraContext, type CourseZyraContextInput, type CourseZyraHandoff } from "../features/student/zyra/context";
import { courseZyraAvailable, courseZyraContextForPath } from "../features/student/zyra/conversation";
import { useRoleAccountMenu } from "./account-menu";
import { useStudentCourseChrome } from "./student-course-chrome";
import { defaultStudentChromeVisibility, StudentChromeVisibilityContext, StudentCourseNavbarContext } from "./student-course-chrome-context";
import { studentCourseId, studentNavigation } from "./student-navigation";

export { useHasStudentCourseNavbar, useStudentChromeVisibility } from "./student-course-chrome-context";

type FrameProps = {
  href: string;
  pattern: string;
  locale: "id" | "en";
  theme: "light" | "dark";
  enabled: boolean;
  visit(href: string): void;
  back(fallback: string): void;
  children: ReactNode;
};

type ProductActions = Pick<ComponentProps<typeof MobileNavbar>, "actions" | "actionRefs" | "notificationSlot" | "pageActions">;

export function StudentChrome(props: FrameProps) {
  const { href, enabled, theme, locale, visit } = props;
  const focused = useIsFocused();
  const navigation = useNavigation();
  const { state, transport, getSnapshot } = useNativeSession();
  const request = useMemo(() => transport && bindStudentRequest({
    userId: transport.scope.accountId, origin: transport.scope.origin, sessionId: transport.scope.sessionId, role: "student", locale,
  }, (path, init) => transport.request(path, { ...init, requiredRole: "murid" })), [transport, locale]);
  const [hideTop, setHideTop] = useState(false);
  const [handoff, setHandoff] = useState<CourseZyraHandoff | null>(null);
  const pathname = href.split(/[?#]/, 1)[0];
  const courseId = studentCourseId(pathname);
  const current = () => {
    const snapshot = getSnapshot();
    return enabled && navigation.isFocused() && state.status === "signed-in" && state.expiresAt > Date.now() &&
      !!transport?.isCurrent() && snapshot.state === state && snapshot.transport === transport && !snapshot.revalidating;
  };
  const available = enabled && focused && transport?.isCurrent() && courseId && courseZyraAvailable(pathname);
  const activeHandoff = handoff?.pathname === pathname ? handoff : null;
  const zyra = available && transport && courseId ? <CourseZyra key={JSON.stringify([transport.scope, pathname])}
    courseId={courseId} pathname={pathname} session={transport} locale={locale} theme={theme} current={current} launcher={!hideTop}
    handoff={activeHandoff} onHandoffConsumed={id => setHandoff(previous => previous?.id === id ? null : previous)}
    openExternal={href => { if (current()) void openBrowserAsync(new URL(href, transport.scope.origin).href).catch(() => {}); }} /> : null;
  const openZyra = available ? (input: CourseZyraContextInput) => {
    if (!current()) return;
    const scoped = courseZyraContextForPath(pathname, input);
    if (scoped) setHandoff({ id: randomUUID(), pathname, input: scoped });
  } : undefined;
  useLayoutEffect(() => {
    setHandoff(null);
  }, [focused, pathname, transport]);
  const siteSearch = useSiteSearch({ enabled: enabled && focused && !hideTop, theme, visit });
  const accountMenu = useRoleAccountMenu({ enabled: enabled && focused && !hideTop && !courseId, theme, visit });
  return <CourseZyraContext.Provider value={openZyra}><StudentNavigationFrame {...props} courseRequest={request ?? undefined} focused={focused} onHideTopChange={setHideTop}
    productActions={{
      notificationSlot: enabled && !hideTop ? <NativeInboxBell role="student" locale={locale} theme={theme} visit={visit} /> : null,
      pageActions: !hideTop ? zyra : null,
      actions: { search: siteSearch.action, account: accountMenu.action },
      actionRefs: { search: siteSearch.trigger, account: accountMenu.trigger },
    }} onProductAction={action => action === "search" ? siteSearch.open() : accountMenu.open()}
    productOverlays={<>{hideTop ? zyra : null}{siteSearch.dialog}{accountMenu.sheet}</>} /></CourseZyraContext.Provider>;
}

export function StudentNavigationFrame({ href, pattern, locale, theme, enabled, focused, courseRequest, visit, back,
  onHideTopChange, productActions, onProductAction, productOverlays, testID, children }: FrameProps & {
  focused: boolean;
  courseRequest?: StudentRequest;
  onHideTopChange?(hidden: boolean): void;
  productActions?: ProductActions;
  onProductAction?(action: "search" | "account"): void;
  productOverlays?: ReactNode;
  testID?: string;
}) {
  const [visibility, setVisibility] = useState(defaultStudentChromeVisibility);
  const { active, title, labels, targets, homeLabel, backTo, hideBottom: hideBottomByRoute } = studentNavigation(href, pattern, locale);
  const hideTop = Boolean(visibility.hideTop);
  const hideBottom = visibility.hideBottom ?? hideBottomByRoute;
  const course = useStudentCourseChrome({ href, locale, theme, request: courseRequest, focused,
    topVisible: enabled && !hideTop, tabsVisible: !hideBottom, visit });

  useLayoutEffect(() => { onHideTopChange?.(hideTop); }, [hideTop, onHideTopChange]);

  return (
    <SafeAreaView testID={testID} style={{ flex: 1, backgroundColor: nativeColors[theme].background }}>
      <MobileNavbar role="student" theme={theme} title={title} includeSafeArea={false} testID="student-navbar"
        hidden={!enabled || hideTop}
        {...productActions} course={course?.descriptor} actionRefs={{ ...productActions?.actionRefs, "switch-course": course?.trigger }}
        home={backTo === null ? { label: homeLabel } : undefined}
        back={backTo ? { label: labels.back } : undefined}
        onAction={action => {
          if (action === "back" && backTo) {
            if (course) visit(backTo);
            else back(backTo);
          }
          if (action === "home") visit(targets.home);
          if (action === "switch-course") course?.open();
          if (action === "search" || action === "account") onProductAction?.(action);
        }} />
      {course?.tabs}
      <View style={{ flex: 1 }}>
        <StudentChromeVisibilityContext.Provider value={setVisibility}>
          <StudentCourseNavbarContext.Provider value={Boolean(course)}>
            <VisibleNavbarTitle.Provider value={enabled && !hideTop && !course?.descriptor ? title : undefined}>
              {children}
            </VisibleNavbarTitle.Provider>
          </StudentCourseNavbarContext.Provider>
        </StudentChromeVisibilityContext.Provider>
      </View>
      <RoleBottomNavigation role="student" theme={theme} labels={labels} activeId={active}
        accessibilityLabel={labels.bottomNavLabel} includeSafeArea={false} testID="student-bottom-nav"
        hidden={!enabled || hideBottom}
        onDestinationPress={destination => visit(targets[destination])} />
      {course?.sheet}
      {productOverlays}
    </SafeAreaView>
  );
}
