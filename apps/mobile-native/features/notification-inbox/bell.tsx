import { useIsFocused, useNavigation, useSitemap } from "expo-router";
import { addNotificationReceivedListener } from "expo-notifications";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import en from "../../../../messages/en/notifications.json";
import id from "../../../../messages/id/notifications.json";
import { nativeColors, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import type { NativeAccountContext } from "../../../../packages/native-session/context";
import { useNativeSession } from "../../auth/session-provider";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { Button } from "../../components/Button";
import type { NativeSessionTransport } from "../../network/transport";
import { nativeTypography } from "../../typography";
import { SharedPopover, SharedPopoverAnchor } from "../shared-ui/overlays";
import { hasVerifiedInboxAccess, inboxDestination, type InboxSurfaceRole } from "./access";
import { loadInbox, markInboxRead, type InboxPage, type InboxRow } from "./client";
import { InboxContent, InboxHeader, inboxPanelSurface } from "./content";
import { InboxIcon } from "./icons";

type BellProps = { role: InboxSurfaceRole; locale: "id" | "en"; theme: "dark" | "light"; visit(href: string): void };

export function NativeInboxBell(props: BellProps) {
  const focused = useIsFocused();
  const navigation = useNavigation();
  const { state, transport, revalidating, getSnapshot } = useNativeSession();
  const { context } = useNativeAccountContext();
  const isActive = useCallback(() => {
    const snapshot = getSnapshot();
    return !!context && !!transport && state.status === "signed-in" && state.expiresAt > Date.now() &&
      snapshot.state === state && !snapshot.revalidating &&
      snapshot.transport === transport && navigation.isFocused() && hasVerifiedInboxAccess(props.role, context, transport);
  }, [context, getSnapshot, navigation, props.role, state, transport]);
  if (!focused || state.status !== "signed-in" || state.expiresAt <= Date.now() || revalidating || !transport || !context ||
    !hasVerifiedInboxAccess(props.role, context, transport)) return null;
  return <InboxBell key={JSON.stringify([props.role, transport.scope.origin, context.accountId, context.sessionId])}
    {...props} session={transport} account={context} isActive={isActive} />;
}

function InboxBell({ role, session, account, locale, theme, visit, isActive }: BellProps & {
  session: NativeSessionTransport; account: NativeAccountContext; isActive(): boolean;
}) {
  const sitemap = useSitemap();
  const anchor = useRef<ComponentRef<typeof Pressable>>(null);
  const write = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<InboxPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"read" | "write" | null>(null);
  const [saving, setSaving] = useState(false);
  const copy = locale === "id" ? id : en;
  const colors = nativeColors[theme];
  const testID = `${role}-inbox`;
  const staff = role !== "student";

  useEffect(() => {
    const retry = () => setRefresh(value => value + 1);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") retry(); });
    const received = addNotificationReceivedListener(retry);
    return () => { foreground.remove(); received.remove(); };
  }, []);

  useEffect(() => {
    if (!isActive()) return;
    const controller = new AbortController();
    setError(null);
    setLoading(true);
    void loadInbox(session, open, controller.signal).then(result => {
      if (!controller.signal.aborted && isActive()) setData(result);
    }).catch(() => {
      if (!controller.signal.aborted && isActive()) { setData(null); setError("read"); }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [session, open, refresh, isActive]);

  useEffect(() => () => write.current?.abort(), [session]);

  function dismiss() {
    write.current?.abort();
    write.current = null;
    setSaving(false);
    setOpen(false);
  }

  async function select(row?: InboxRow) {
    if (write.current || !isActive()) return;
    const controller = new AbortController();
    write.current = controller;
    setSaving(true);
    setError(null);
    try {
      if (!row?.read) await markInboxRead(session, row ? { id: row.id } : { all: true }, controller.signal);
      if (controller.signal.aborted || !isActive()) return;
      if (!row) { setRefresh(value => value + 1); return; }
      const destination = inboxDestination(row.href, account, sitemap);
      dismiss();
      if (destination) visit(destination);
    } catch {
      if (!controller.signal.aborted && isActive()) setError("write");
    } finally {
      if (write.current === controller) { write.current = null; setSaving(false); }
    }
  }

  const unread = data?.unread;
  return <SharedPopoverAnchor>
    <Button ref={anchor} variant={staff ? "outline" : "ghost"} size={staff ? "icon-lg" : "icon"} theme={theme}
      accessibilityLabel={unread ? `${copy.bell}, ${unread} ${locale === "id" ? "belum dibaca" : "unread"}` : copy.bell}
      accessibilityState={{ expanded: open }} testID={testID}
      onPress={() => { if (isActive()) { setLoading(true); setOpen(true); } }}
      renderIcon={(color, size) => <InboxIcon name="bell" color={color} size={size} />} />
    {!!unread && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.badge, { backgroundColor: colors.destructive }]}>
      <Text style={[nativeTypography.bodyMedium, styles.count, { color: colors.background }]}>{unread > 99 ? "99+" : unread}</Text>
    </View>}
    <SharedPopover open={open} anchorRef={anchor} align="end" title={copy.title} theme={theme} onDismiss={dismiss}
      closeLabel={copy.close} maxWidth={352} sideOffset={8} panelStyle={inboxPanelSurface(theme)} bodyInsets={false} bodyMaxHeight={384}
      renderHeader={controls => <InboxHeader {...controls} locale={locale} theme={theme} unread={unread ?? 0} testID={testID}
        saving={saving} onMarkAllRead={() => void select()} />}>
      <InboxContent locale={locale} theme={theme} rows={data?.rows}
        loading={loading} saving={saving} error={error} testID={testID} onRetry={() => setRefresh(value => value + 1)}
        onSelect={row => void select(row)} />
    </SharedPopover>
  </SharedPopoverAnchor>;
}

const styles = StyleSheet.create({
  badge: { position: "absolute", top: 0, end: -2, minWidth: 14, alignItems: "center", borderRadius: nativeRadii.sm, paddingHorizontal: 2 },
  count: { fontSize: 10, lineHeight: 14 },
});
