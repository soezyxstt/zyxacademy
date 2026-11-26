import { useIsFocused } from "expo-router";
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { MobileNavbar, RoleBottomNavigation } from "../features/shared-ui/navigation";
import { NativeInboxBell } from "../features/notification-inbox/bell";
import { useSiteSearch } from "../features/site-search/search";
import { useRoleAccountMenu } from "./account-menu";
import { studentNavigation } from "./student-navigation";

type Visibility = { hideTop?: boolean; hideBottom?: boolean };
const defaultVisibility: Visibility = {};
const VisibilityContext = createContext<((visibility: Visibility) => void) | null>(null);

export function useStudentChromeVisibility({ hideTop, hideBottom }: Visibility) {
  const setVisibility = useContext(VisibilityContext);
  useLayoutEffect(() => {
    if (!setVisibility) return;
    setVisibility({ hideTop, hideBottom });
    return () => setVisibility(defaultVisibility);
  }, [hideTop, hideBottom, setVisibility]);
}

export function StudentChrome({ href, pattern, locale, theme, enabled, visit, back, children }: {
  href: string;
  pattern: string;
  locale: "id" | "en";
  theme: "light" | "dark";
  enabled: boolean;
  visit(href: string): void;
  back(fallback: string): void;
  children: ReactNode;
}) {
  const [visibility, setVisibility] = useState(defaultVisibility);
  const focused = useIsFocused();
  const siteSearch = useSiteSearch({ enabled: enabled && focused && !visibility.hideTop, theme, visit });
  const accountMenu = useRoleAccountMenu({ enabled: enabled && focused && !visibility.hideTop, theme, visit });
  const { active, title, labels, targets, homeLabel, backTo, hideBottom } = studentNavigation(href, pattern, locale);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: nativeColors[theme].background }}>
      <MobileNavbar role="student" theme={theme} title={title} includeSafeArea={false} testID="student-navbar"
        hidden={!enabled || visibility.hideTop}
        notificationSlot={enabled && !visibility.hideTop ? <NativeInboxBell role="student" locale={locale} theme={theme} visit={visit} /> : null}
        actions={{ search: siteSearch.action, account: accountMenu.action }} actionRefs={{ search: siteSearch.trigger, account: accountMenu.trigger }}
        home={backTo === null ? { label: homeLabel } : undefined}
        back={backTo ? { label: labels.back } : undefined}
        onAction={action => {
          if (action === "back" && backTo) back(backTo);
          if (action === "home") visit(targets.home);
          if (action === "search") siteSearch.open();
          if (action === "account") accountMenu.open();
        }} />
      <View style={{ flex: 1 }}>
        <VisibilityContext.Provider value={setVisibility}>{children}</VisibilityContext.Provider>
      </View>
      <RoleBottomNavigation role="student" theme={theme} labels={labels} activeId={active}
        accessibilityLabel={labels.bottomNavLabel} includeSafeArea={false} testID="student-bottom-nav"
        hidden={!enabled || hideBottom || visibility.hideBottom}
        onDestinationPress={destination => visit(targets[destination])} />
      {siteSearch.dialog}
      {accountMenu.sheet}
    </SafeAreaView>
  );
}
