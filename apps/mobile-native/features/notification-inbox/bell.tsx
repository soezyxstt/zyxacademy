import { useIsFocused, useSitemap } from "expo-router";
import { addNotificationReceivedListener } from "expo-notifications";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import en from "../../../../messages/en/notifications.json";
import id from "../../../../messages/id/notifications.json";
import { nativeColors, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import type { NativeAccountContext } from "../../../../packages/native-session/context";
import { resolveNativeLoginReturn } from "../../auth/login-intent";
import { useNativeSession } from "../../auth/session-provider";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { Button } from "../../components/Button";
import type { NativeSessionTransport } from "../../network/transport";
import { nativeTypography } from "../../typography";
import { NavigationIcon } from "../shared-ui/navigation-icons";
import { SharedPopover } from "../shared-ui/overlays";
import { loadInbox, markInboxRead, type InboxPage, type InboxRow } from "./client";

type BellProps = { locale: "id" | "en"; theme: "dark" | "light"; visit(href: string): void };

export function StudentInboxBell(props: BellProps) {
  const focused = useIsFocused();
  const { transport } = useNativeSession();
  const { context } = useNativeAccountContext();
  if (!focused || !transport?.isCurrent() || !context?.roles.includes("murid") ||
    transport.scope.accountId !== context.accountId || transport.scope.sessionId !== context.sessionId) return null;
  return <InboxBell key={JSON.stringify([transport.scope.origin, context.accountId, context.sessionId])}
    {...props} session={transport} account={context} />;
}

function InboxBell({ session, account, locale, theme, visit }: BellProps & { session: NativeSessionTransport; account: NativeAccountContext }) {
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

  useEffect(() => {
    const retry = () => setRefresh(value => value + 1);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") retry(); });
    const received = addNotificationReceivedListener(retry);
    return () => { foreground.remove(); received.remove(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setLoading(true);
    void loadInbox(session, open, controller.signal).then(result => {
      if (!controller.signal.aborted && session.isCurrent()) setData(result);
    }).catch(() => {
      if (!controller.signal.aborted) { setData(null); setError("read"); }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [session, open, refresh]);

  useEffect(() => () => write.current?.abort(), [session]);

  function dismiss() {
    write.current?.abort();
    write.current = null;
    setSaving(false);
    setOpen(false);
  }

  async function select(row?: InboxRow) {
    if (write.current || !session.isCurrent()) return;
    const controller = new AbortController();
    write.current = controller;
    setSaving(true);
    setError(null);
    try {
      if (!row?.read) await markInboxRead(session, row ? { id: row.id } : { all: true }, controller.signal);
      if (controller.signal.aborted || !session.isCurrent()) return;
      if (!row) { setRefresh(value => value + 1); return; }
      const destination = resolveNativeLoginReturn(row.href ?? undefined, account, sitemap);
      dismiss();
      if (destination.status === "ready") visit(destination.href);
      else if (destination.dashboard) visit(destination.dashboard);
    } catch {
      if (!controller.signal.aborted && session.isCurrent()) setError("write");
    } finally {
      if (write.current === controller) { write.current = null; setSaving(false); }
    }
  }

  const unread = data?.unread;
  return <View>
    <Button ref={anchor} variant="ghost" size="icon" theme={theme}
      accessibilityLabel={unread ? `${copy.bell}, ${unread} ${locale === "id" ? "belum dibaca" : "unread"}` : copy.bell}
      accessibilityState={{ expanded: open }} testID="student-inbox"
      onPress={() => { setLoading(true); setOpen(true); }}
      renderIcon={(color, size) => <NavigationIcon name="notifications" color={color} size={size} />} />
    {!!unread && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.badge, { backgroundColor: colors.destructive }]}>
      <Text style={[nativeTypography.bodyMedium, styles.count, { color: colors.background }]}>{unread > 99 ? "99+" : unread}</Text>
    </View>}
    <SharedPopover open={open} anchorRef={anchor} align="end" title={copy.title} theme={theme} onDismiss={dismiss}
      closeLabel={locale === "id" ? "Tutup" : "Close"}>
      {!!unread && <Button variant="link" disabled={saving} onPress={() => void select()}>{copy.markAllRead}</Button>}
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error && <Text accessibilityRole="alert" style={[styles.body, { color: colors.destructive }]}>
        {locale === "id" ? (error === "read" ? "Notifikasi belum dapat dimuat." : "Status baca belum tersimpan.") :
          (error === "read" ? "Could not load notifications." : "Could not save read status.")}
      </Text>}
      {error === "read" && <Button variant="outline" onPress={() => setRefresh(value => value + 1)}>{locale === "id" ? "Coba lagi" : "Try again"}</Button>}
      {!loading && data?.rows.length === 0 && <Text style={[styles.body, { color: colors.mutedForeground }]}>{copy.empty}</Text>}
      {!loading && data?.rows.map(row => <Pressable key={row.id} accessibilityRole="button" disabled={saving}
        accessibilityLabel={[row.title, row.body, row.read ? null : locale === "en" ? "Unread" : "Belum dibaca"].filter(Boolean).join(". ")}
        onPress={() => void select(row)} style={[styles.row, { borderColor: colors.border }]}>
        <Text style={[row.read ? nativeTypography.bodyRegular : nativeTypography.bodySemibold, styles.title, { color: colors.foreground }]}>{row.title}</Text>
        <Text style={[nativeTypography.bodyRegular, styles.body, { color: colors.mutedForeground }]}>{row.body}</Text>
        <Text style={[nativeTypography.bodyRegular, styles.body, { color: colors.mutedForeground }]}>{formatInboxTime(row.createdAt, locale, copy.relative)}</Text>
      </Pressable>)}
    </SharedPopover>
  </View>;
}

function formatInboxTime(value: string, locale: BellProps["locale"], copy: typeof en.relative) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return copy.justNow;
  if (minutes < 60) return copy.minutes.replace("{count}", String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return copy.hours.replace("{count}", String(hours));
  const days = Math.floor(hours / 24);
  if (days < 7) return copy.days.replace("{count}", String(days));
  return date.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", { day: "numeric", month: "short" });
}

const styles = StyleSheet.create({
  badge: { position: "absolute", top: 0, end: -2, minWidth: 14, alignItems: "center", borderRadius: nativeRadii.sm, paddingHorizontal: 2 },
  count: { fontSize: 10, lineHeight: 14 },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8, gap: 2 },
  body: { fontSize: 12, lineHeight: 16 },
  title: { fontSize: 14, lineHeight: 20 },
});
