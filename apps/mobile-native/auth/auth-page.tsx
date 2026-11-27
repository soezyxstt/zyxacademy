import type { ReactNode } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { nativeTypography } from "../typography";

export function AuthPage({ title, compact = false, children }: {
  title: string;
  compact?: boolean;
  children: ReactNode;
}) {
  const colors = nativeColors[useColorScheme() === "dark" ? "dark" : "light"];
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.scroll, compact && styles.compact]}>
        <View style={styles.content}>
          <Text accessibilityRole="header" style={[
            styles.heading, nativeTypography.headingBold, { color: colors.foreground },
            !compact && styles.center,
          ]}>{title}</Text>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function AuthStatus({ children, error, busy, body = false, center = false, reference = false }: {
  children: string;
  error?: boolean;
  busy?: boolean;
  body?: boolean;
  center?: boolean;
  reference?: boolean;
}) {
  const colors = nativeColors[useColorScheme() === "dark" ? "dark" : "light"];
  return (
    <View style={busy ? styles.busy : undefined}>
      {busy && <ActivityIndicator accessible={false} color={colors.mutedForeground} />}
      <Text
        accessibilityRole={error ? "alert" : undefined}
        accessibilityLiveRegion={reference ? "none" : "polite"}
        style={[
          body ? styles.body : styles.text, nativeTypography.bodyRegular,
          { color: error ? colors.destructive : colors.mutedForeground },
          center && styles.center,
          error && [styles.error, { borderLeftColor: colors.destructive }],
        ]}
      >{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20, paddingVertical: 24 },
  compact: { justifyContent: "flex-start" },
  content: { width: "100%", maxWidth: 448, gap: 12 },
  heading: { fontSize: 24, lineHeight: 32 },
  text: { fontSize: 14, lineHeight: 20 },
  body: { fontSize: 16, lineHeight: 24 },
  center: { textAlign: "center" },
  error: { borderLeftWidth: 2, paddingLeft: 8, paddingVertical: 4 },
  busy: { alignItems: "center", gap: 8 },
});
