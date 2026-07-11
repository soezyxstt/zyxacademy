import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BookOpen,
  CalendarRange,
  LayoutDashboard,
  Trophy,
  User,
} from 'lucide-react-native';
import { ZyxWebView } from '../components/ZyxWebView';
import { useTheme } from '../theme';

/**
 * WhatsApp/YouTube-style bottom navigation. Tabs, labels, icons, and routes
 * mirror the web student sidebar (components/student-sidebar.tsx); the web
 * sidebar itself is hidden inside the WebView (see ZyxWebView).
 * Hand-rolled instead of react-navigation: five fixed tabs need no navigator,
 * and fewer native dependencies keeps the Android build simple.
 */
const TABS = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard', Icon: LayoutDashboard },
  { key: 'schedule', label: 'Jadwal', path: '/dashboard/schedule', Icon: CalendarRange },
  { key: 'courses', label: 'Courses', path: '/courses', Icon: BookOpen },
  { key: 'leaderboard', label: 'Peringkat', path: '/leaderboard', Icon: Trophy },
  { key: 'profile', label: 'Profile', path: '/profile', Icon: User },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function MainTabs({ onSessionExpired }: { onSessionExpired: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<TabKey>('dashboard');
  // Lazy-mount: a tab's WebView loads on first visit, then stays mounted so
  // switching back is instant and scroll/-form state survives (WhatsApp-like).
  const [mounted, setMounted] = useState<Set<TabKey>>(new Set(['dashboard']));

  const selectTab = (key: TabKey) => {
    setMounted(prev => (prev.has(key) ? prev : new Set(prev).add(key)));
    setActive(key);
  };

  return (
    <View style={styles.container}>
      <View style={styles.pages}>
        {TABS.map(({ key, path }) =>
          mounted.has(key) ? (
            <View
              key={key}
              style={[styles.page, active !== key && styles.hiddenPage]}
              pointerEvents={active === key ? 'auto' : 'none'}
            >
              <ZyxWebView
                path={path}
                isActive={active === key}
                onSessionExpired={onSessionExpired}
              />
            </View>
          ) : null,
        )}
      </View>

      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.outline,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {TABS.map(({ key, label, Icon }) => {
          const isActive = active === key;
          const tint = isActive ? colors.primary : colors.muted;
          return (
            <TouchableOpacity
              key={key}
              style={styles.tabItem}
              onPress={() => selectTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={label}
            >
              <Icon size={22} color={tint} strokeWidth={isActive ? 2.4 : 2} />
              <Text
                style={[
                  styles.tabLabel,
                  { color: tint, fontWeight: isActive ? '700' : '500' },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pages: { flex: 1 },
  page: { ...StyleSheet.absoluteFillObject },
  hiddenPage: { opacity: 0, zIndex: -1 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 6,
    gap: 2,
  },
  tabLabel: { fontSize: 11 },
});
