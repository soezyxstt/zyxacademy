import { useState, type ComponentRef, type Ref } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatNotificationTime } from "../../../../lib/date-utils/notification-display";
import en from "../../../../messages/en/notifications.json";
import id from "../../../../messages/id/notifications.json";
import { nativeColors, nativeLinkInks, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import { notificationAppearance } from "../../../../packages/ui-primitives/notification-appearance";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import { nativeTypography } from "../../typography";
import type { InboxRow } from "./client";
import { InboxIcon } from "./icons";

type Locale = "id" | "en";
type Theme = keyof typeof nativeColors;
const messages = { id, en };

export function inboxPanelSurface(theme: Theme) {
  return {
    backgroundColor: nativeColors[theme].popover,
    borderColor: nativeColors[theme].border,
    borderWidth: 1,
    borderRadius: nativeRadii.sm,
    boxShadow: "0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a",
    overflow: "hidden",
  } as const;
}

export function InboxHeader({
  locale, theme, unread, saving, onMarkAllRead, onClose, closeRef, headingRef, closeLabel, dismissDisabled, testID = "student-inbox",
}: {
  locale: Locale;
  theme: Theme;
  unread: number;
  saving?: boolean;
  onMarkAllRead(): void;
  onClose(): void;
  closeRef?: Ref<ComponentRef<typeof Pressable>>;
  headingRef?: Ref<ComponentRef<typeof Text>>;
  closeLabel?: string;
  dismissDisabled?: boolean;
  testID?: string;
}) {
  const copy = messages[locale];
  const colors = nativeColors[theme];
  return (
    <View style={[styles.header, { borderColor: colors.border }]}>
      <Text ref={headingRef} testID={`${testID}-title`} accessible accessibilityRole="header"
        style={[nativeTypography.headingSemibold, styles.heading, { color: colors.popoverForeground }]}>{copy.title}</Text>
      <View style={styles.headerActions}>
        {unread > 0 && <Button size="sm" variant="link" theme={theme} disabled={saving} testID={`${testID}-mark-all`}
          hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
          onPress={onMarkAllRead} style={styles.markAll} labelStyle={{ color: colors.brandPrimary }}
          renderIcon={() => <InboxIcon name="check-check" color={colors.brandPrimary} size={14} />}>{copy.markAllRead}</Button>}
        <Button ref={closeRef} size="icon" variant="ghost" theme={theme} accessibilityLabel={closeLabel ?? copy.close}
          disabled={dismissDisabled} testID={`${testID}-close`} onPress={onClose}
          renderIcon={() => <InboxIcon name="x" color={colors.mutedForeground} size={16} />} />
      </View>
    </View>
  );
}

export function InboxContent({
  locale, theme, rows, loading, saving, error, onRetry, onSelect, now, testID = "student-inbox",
}: {
  locale: Locale;
  theme: Theme;
  rows?: readonly InboxRow[];
  loading?: boolean;
  saving?: boolean;
  error?: "read" | "write" | null;
  onRetry?(): void;
  onSelect(row: InboxRow): void;
  now?: number;
  testID?: string;
}) {
  const copy = messages[locale];
  const colors = nativeColors[theme];
  return (
    <View>
      {error && <View style={styles.error}>
        <Text accessibilityRole="alert" style={[nativeTypography.bodyRegular, styles.body, { color: colors.destructive }]}>
          {locale === "id" ? (error === "read" ? "Notifikasi belum dapat dimuat." : "Status baca belum tersimpan.") :
            (error === "read" ? "Could not load notifications." : "Could not save read status.")}
        </Text>
        {error === "read" && <Button variant="outline" theme={theme} onPress={onRetry}>{locale === "id" ? "Coba lagi" : "Try again"}</Button>}
      </View>}
      {loading ? (
        <View accessible accessibilityLabel={copy.loading} accessibilityLiveRegion="polite" style={styles.loading}>
          {[0, 1, 2].map(index => <Skeleton key={index} theme={theme} style={styles.skeleton} />)}
        </View>
      ) : rows?.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.muted }]} testID={`${testID}-empty-icon`}>
            <InboxIcon name="inbox" color={colors.mutedForeground} size={20} />
          </View>
          <Text style={[nativeTypography.bodyRegular, styles.itemTitle, { color: colors.mutedForeground }]}>{copy.empty}</Text>
        </View>
      ) : rows?.map((row, index) => <InboxItem key={row.id} row={row} locale={locale} theme={theme} now={now}
        divided={index > 0} disabled={saving} onSelect={onSelect} testID={`${testID}-row-${row.id}`} />)}
    </View>
  );
}

function InboxItem({ row, locale, theme, now, divided, disabled, onSelect, testID }: {
  row: InboxRow;
  locale: Locale;
  theme: Theme;
  now?: number;
  divided: boolean;
  disabled?: boolean;
  onSelect(row: InboxRow): void;
  testID: string;
}) {
  const [focused, setFocused] = useState(false);
  const colors = nativeColors[theme];
  const copy = messages[locale];
  const { icon, tone } = notificationAppearance(row.type);
  const iconColor = tone === "brand-primary" ? colors.brandPrimary : tone === "muted" ? colors.mutedForeground : nativeLinkInks[tone];
  const time = formatNotificationTime(row.createdAt, locale, (unit, count) => copy.relative[unit].replace("{count}", String(count)), now);
  return (
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled}
      accessibilityLabel={[row.title, row.body, time, row.read ? null : copy.unread].filter(Boolean).join(". ")}
      onPress={() => onSelect(row)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.row,
        divided && { borderTopWidth: 1, borderColor: `${colors.border}99` },
        { backgroundColor: pressed ? `${colors.muted}${row.read ? "66" : "99"}` : row.read ? "transparent" : `${colors.muted}4d` },
        focused && { outlineColor: colors.accent, outlineWidth: 2, outlineOffset: -2 },
      ]}
    >
      <View style={[styles.itemIcon, { backgroundColor: row.read ? `${colors.muted}99` : `${colors.brandPrimary}1a` }]}>
        <InboxIcon name={icon} color={iconColor} size={16} />
      </View>
      <View style={styles.itemContent}>
        <View style={styles.itemTitleRow}>
          <Text numberOfLines={2} style={[nativeTypography.bodyMedium, styles.itemTitle, styles.itemTitleText,
            { color: row.read ? colors.mutedForeground : colors.popoverForeground }]}>{row.title}</Text>
          {time ? <Text style={[nativeTypography.bodyRegular, styles.time, { color: colors.mutedForeground }]}>{time}</Text> : null}
        </View>
        {row.body ? <Text numberOfLines={2} style={[nativeTypography.bodyRegular, styles.body, { color: colors.mutedForeground }]}>{row.body}</Text> : null}
      </View>
      {!row.read && <View accessible={false} style={[styles.unreadDot, { backgroundColor: colors.brandPrimary }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  heading: { flexShrink: 1, fontSize: 16, lineHeight: 24, includeFontPadding: false },
  headerActions: { flexDirection: "row", gap: 8, alignItems: "center", flexShrink: 0 },
  markAll: { borderWidth: 0, borderRadius: nativeRadii.sm, paddingStart: 8, paddingEnd: 8 },
  empty: { alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 40 },
  emptyIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  loading: { padding: 16, gap: 8 },
  skeleton: { height: 48, borderRadius: nativeRadii.lg },
  error: { paddingHorizontal: 16, paddingVertical: 12, alignItems: "flex-start", gap: 8 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  itemIcon: { width: 32, height: 32, marginTop: 2, flexShrink: 0, borderRadius: nativeRadii.lg, alignItems: "center", justifyContent: "center" },
  itemContent: { flex: 1, minWidth: 0, gap: 2 },
  itemTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  itemTitle: { fontSize: 14, lineHeight: 20, includeFontPadding: false },
  itemTitleText: { flex: 1, minWidth: 0 },
  body: { fontSize: 12, lineHeight: 18, includeFontPadding: false },
  time: { flexShrink: 0, fontSize: 10, lineHeight: 15, includeFontPadding: false },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 8, flexShrink: 0 },
});
