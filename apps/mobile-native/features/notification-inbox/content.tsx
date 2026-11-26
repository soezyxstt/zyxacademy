import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { formatNotificationTime } from "../../../../lib/date-utils/notification-display";
import en from "../../../../messages/en/notifications.json";
import id from "../../../../messages/id/notifications.json";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { Button } from "../../components/Button";
import { nativeTypography } from "../../typography";
import type { InboxRow } from "./client";

export function InboxContent({
  locale, theme, unread, rows, loading, saving, error, onRetry, onMarkAllRead, onSelect, now, testID = "student-inbox",
}: {
  locale: "id" | "en";
  theme: keyof typeof nativeColors;
  unread: number;
  rows?: readonly InboxRow[];
  loading?: boolean;
  saving?: boolean;
  error?: "read" | "write" | null;
  onRetry?(): void;
  onMarkAllRead(): void;
  onSelect(row: InboxRow): void;
  now?: number;
  testID?: string;
}) {
  const copy = locale === "id" ? id : en;
  const colors = nativeColors[theme];
  return (
    <View style={styles.content}>
      {!!unread && <Button variant="link" disabled={saving} testID={`${testID}-mark-all`} onPress={onMarkAllRead}>{copy.markAllRead}</Button>}
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error && <Text accessibilityRole="alert" style={[styles.body, { color: colors.destructive }]}>
        {locale === "id" ? (error === "read" ? "Notifikasi belum dapat dimuat." : "Status baca belum tersimpan.") :
          (error === "read" ? "Could not load notifications." : "Could not save read status.")}
      </Text>}
      {error === "read" && <Button variant="outline" onPress={onRetry}>{locale === "id" ? "Coba lagi" : "Try again"}</Button>}
      {!loading && rows?.length === 0 && <Text style={[styles.body, { color: colors.mutedForeground }]}>{copy.empty}</Text>}
      {!loading && rows?.map(row => {
        const time = formatNotificationTime(row.createdAt, locale,
          (unit, count) => copy.relative[unit].replace("{count}", String(count)), now);
        const status = row.read ? null : locale === "en" ? "Unread" : "Belum dibaca";
        return <Pressable key={row.id} testID={`${testID}-row-${row.id}`} accessibilityRole="button" disabled={saving}
          accessibilityLabel={[row.title, row.body, time, status].filter(Boolean).join(". ")}
          onPress={() => onSelect(row)} style={[styles.row, { borderColor: colors.border }]}>
          <Text style={[row.read ? nativeTypography.bodyRegular : nativeTypography.bodySemibold, styles.title, { color: colors.foreground }]}>{row.title}</Text>
          <Text style={[nativeTypography.bodyRegular, styles.body, { color: colors.mutedForeground }]}>{row.body}</Text>
          <Text style={[nativeTypography.bodyRegular, styles.body, { color: colors.mutedForeground }]}>{time}</Text>
        </Pressable>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8 },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8, gap: 2 },
  body: { fontSize: 12, lineHeight: 16 },
  title: { fontSize: 14, lineHeight: 20 },
});
