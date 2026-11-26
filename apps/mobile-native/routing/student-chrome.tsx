import { useIsFocused } from "expo-router";
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

type ProductActions = Pick<ComponentProps<typeof MobileNavbar>, "actions" | "actionRefs" | "notificationSlot">;

export function StudentChrome(props: FrameProps) {
  const { href, enabled, theme, locale, visit } = props;
  const focused = useIsFocused();
  const { transport } = useNativeSession();
  const request = useMemo(() => transport && bindStudentRequest({
    userId: transport.scope.accountId, origin: transport.scope.origin, sessionId: transport.scope.sessionId, role: "student", locale,
  }, (path, init) => transport.request(path, { ...init, requiredRole: "murid" })), [transport, locale]);
  const [hideTop, setHideTop] = useState(false);
  const siteSearch = useSiteSearch({ enabled: enabled && focused && !hideTop, theme, visit });
  const accountMenu = useRoleAccountMenu({ enabled: enabled && focused && !hideTop && !studentCourseId(href), theme, visit });
  return <StudentNavigationFrame {...props} courseRequest={request ?? undefined} focused={focused} onHideTopChange={setHideTop}
    productActions={{
      notificationSlot: enabled && !hideTop ? <NativeInboxBell role="student" locale={locale} theme={theme} visit={visit} /> : null,
      actions: { search: siteSearch.action, account: accountMenu.action },
      actionRefs: { search: siteSearch.trigger, account: accountMenu.trigger },
    }} onProductAction={action => action === "search" ? siteSearch.open() : accountMenu.open()}
    productOverlays={<>{siteSearch.dialog}{accountMenu.sheet}</>} />;
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
