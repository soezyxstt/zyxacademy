import { useNavigation, useSitemap } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { useNativeAccountContext } from "../auth/use-account-context";
import { useNativeSession } from "../auth/session-provider";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { RadioGroup, RadioGroupItem } from "../components/RadioGroup";
import { Switch } from "../components/Switch";
import { useDevicePreferences } from "../device/preferences-provider";
import { NativeListRow } from "../features/shared-ui/layout";
import { SharedSheet } from "../features/shared-ui/overlays";
import { nativeTypography } from "../typography";
import { accountMenuCopy, accountMenuEntries } from "./account-menu-model";

const themes = ["system", "light", "dark"] as const;

export function useRoleAccountMenu({ enabled, theme, visit }: {
  enabled: boolean; theme: "light" | "dark"; visit(href: string): void;
}) {
  const { context } = useNativeAccountContext();
  const { state, transport, getSnapshot } = useNativeSession();
  const preferences = useDevicePreferences();
  const navigation = useNavigation();
  const sitemap = useSitemap();
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const [panel, setPanel] = useState<"account" | "preferences" | null>(null);
  const colors = nativeColors[theme];
  const ready = enabled && !!context && !!transport?.isCurrent() && state.status === "signed-in" &&
    state.accountId === context.accountId && state.sessionId === context.sessionId;

  useEffect(() => {
    if (!ready) setPanel(null);
  }, [ready]);

  const current = () => ready && navigation.isFocused() && transport?.isCurrent() &&
    getSnapshot().state === state && !getSnapshot().revalidating;
  if (!ready) return { trigger, action: undefined, open: () => {}, sheet: null };

  const copy = accountMenuCopy(context.locale);
  const entries = accountMenuEntries(context, sitemap);
  const name = context.display?.name.trim();
  const email = context.display?.email.trim();
  function choose(href: string) {
    if (!current()) return;
    setPanel(null);
    visit(href);
  }

  return {
    trigger,
    action: { label: name ? copy.accountNamed.replace("{name}", name) : copy.account, expanded: panel !== null },
    open: () => { if (current()) setPanel("account"); },
    sheet: <SharedSheet open={panel !== null} testID="role-account-menu" theme={theme}
      title={panel === "preferences" ? copy.devicePreferences : copy.account} closeLabel={copy.close}
      returnFocusRef={trigger} onDismiss={() => setPanel(null)}>
      {panel === "preferences" ? <>
        <Text style={[styles.name, { color: colors.foreground }]}>{copy.appearance}</Text>
        <RadioGroup value={preferences.theme} accessibilityLabel={copy.appearance} theme={theme} onValueChange={value => {
          const next = themes.find(label => label === value);
          if (next && current()) preferences.setTheme(next);
        }}>
          {themes.map(value => <RadioGroupItem key={value} value={value} label={copy[value]} />)}
        </RadioGroup>
        <View style={styles.switchRow}>
          <Text style={[styles.name, { color: colors.foreground }]}>{copy.haptics}</Text>
          <Switch accessibilityLabel={copy.haptics} checked={preferences.haptics} theme={theme}
            onCheckedChange={value => { if (current()) preferences.setHaptics(value); }} />
        </View>
      </> : <>
        {(name || email) && <NativeListRow layout="compact" theme={theme} title={name || email || copy.userFallback}
          subtitle={name && email ? email : undefined} leading={<Avatar decorative initials={Array.from(name || email || "?")[0].toUpperCase()} theme={theme} />} />}
        {entries.map(entry => <NativeListRow key={entry.id} layout="compact" theme={theme} title={entry.label}
          testID={`role-account-${entry.id}`} primary={{ role: "link", onPress: () => choose(entry.href) }} />)}
        {!context.roles.includes("murid") && <NativeListRow layout="compact" theme={theme}
          title={copy.devicePreferences} testID="role-account-device-preferences"
          primary={{ onPress: () => { if (current()) setPanel("preferences"); } }} />}
        <Button variant="destructive" testID="role-account-sign-out" theme={theme}
          onPress={() => choose(`/sign-out?locale=${context.locale}`)}>{copy.logOut}</Button>
      </>}
    </SharedSheet>,
  };
}

const styles = StyleSheet.create({
  name: { ...nativeTypography.bodyMedium, fontSize: 14, lineHeight: 20 },
  switchRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 },
});
