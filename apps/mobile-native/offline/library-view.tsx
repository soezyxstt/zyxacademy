import type { ReactNode } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View, useColorScheme } from "react-native";
import { OFFLINE_LIBRARY_COPY } from "../../../packages/offline/library-copy";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { Input } from "../components/Input";
import { NativeCompactShell, NativeStatusPanel, SharedUiActionButton } from "../features/shared-ui/layout";
import { nativeTypography } from "../typography";
import { offlineLibraryCopy, type OfflineLibraryRow } from "./library-model";
import type { NativeOfflineLocale } from "./sync-contract";

export type OfflineLibraryAction = "download" | "remove";
export type OfflineLibraryNotice = { message: string; error?: boolean };
export type OfflineLibraryViewProps = {
  locale: NativeOfflineLocale;
  offline: boolean;
  rows: OfflineLibraryRow[];
  query: string;
  canDownload: boolean;
  syncing?: boolean;
  pending?: { key: string; action: OfflineLibraryAction } | null;
  notices?: OfflineLibraryNotice[];
  blocked?: ReactNode;
  loading?: boolean;
  onQuery: (query: string) => void;
  onRefresh?: () => void;
  onAction: (row: OfflineLibraryRow, action: OfflineLibraryAction) => void;
  onBack?: () => void;
};

export function OfflineLibraryView({
  locale, offline, rows, query, canDownload, syncing, pending, notices = [], blocked, loading,
  onQuery, onRefresh, onAction, onBack,
}: OfflineLibraryViewProps) {
  const colors = nativeColors[useColorScheme() ?? "light"];
  const shared = OFFLINE_LIBRARY_COPY[locale];
  const copy = offlineLibraryCopy[locale];
  const date = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeStyle: "short" });
  function requestAction(row: OfflineLibraryRow, action: OfflineLibraryAction) {
    if (action === "download") {
      onAction(row, action);
      return;
    }
    Alert.alert(copy.removeTitle, row.title, [
      { text: shared.cancel, style: "cancel" },
      { text: shared.remove, style: "destructive", onPress: () => onAction(row, action) },
    ], { cancelable: true });
  }
  const content = blocked ?? (loading && rows.length === 0 ? (
    <View style={styles.progress} accessible accessibilityLabel={copy.loading} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} />
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>{copy.loading}</Text>
    </View>
  ) : (
    <FlatList
      data={rows}
      keyExtractor={row => row.key}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      accessibilityLabel={shared.readings}
      testID="offline-library-list"
      ListEmptyComponent={
        <NativeStatusPanel
          title={query.trim() ? shared.noResults : offline ? shared.emptyReadings : copy.noReadings}
          message={query.trim() ? undefined : offline ? copy.connectToDownload : undefined}
        />
      }
      ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: colors.border }]} />}
      renderItem={({ item }) => {
        const { key, title, courseTitle, target, savedUntil } = item;
        const action: OfflineLibraryAction = savedUntil ? "remove" : "download";
        const label = savedUntil ? shared.remove : shared.save;
        const working = pending?.key === key;
        const pendingLabel = pending?.action === "remove" ? copy.removing : `${shared.saving}…`;
        return (
          <View style={styles.row}>
            <View style={styles.identity}>
              <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                {target.kind === "diktat" ? shared.diktat : shared.article} · {courseTitle} · {savedUntil ? shared.saved : shared.notSaved}
              </Text>
              {savedUntil !== null && (
                <Text style={[styles.meta, styles.date, { color: colors.mutedForeground }]}>
                  {shared.accessUntil} {date.format(savedUntil)}
                </Text>
              )}
            </View>
            {(savedUntil || canDownload || working) ? (
              <SharedUiActionButton
                action={{ id: action, label: working ? pendingLabel : label, accessibilityLabel: `${working ? pendingLabel : label} ${title}`,
                  disabled: Boolean(pending), pending: working, variant: "ghost" }}
                onAction={() => requestAction(item, action)}
              />
            ) : null}
          </View>
        );
      }}
    />
  ));

  return (
    <NativeCompactShell navigationTitle={shared.title} back={onBack ? { label: copy.back, onPress: onBack } : undefined}>
      {offline && <Text style={[styles.meta, styles.offline, { color: colors.mutedForeground }]}>{shared.offline}</Text>}
      {!blocked && (
        <View style={styles.tools}>
          <Input
            accessibilityLabel={shared.search}
            autoComplete="off"
            autoCorrect={false}
            onChangeText={onQuery}
            placeholder={shared.search}
            returnKeyType="search"
            style={styles.search}
            testID="offline-library-search"
            value={query}
          />
          {onRefresh && (
            <SharedUiActionButton
              action={{ id: "refresh", label: syncing ? `${shared.syncing}…` : shared.sync, pending: syncing }}
              onAction={onRefresh}
            />
          )}
        </View>
      )}
      {notices.length > 0 && (
        <View style={styles.notices}>
          {notices.map(({ message, error }) => (
            <Text key={message} accessibilityLiveRegion="polite" style={[styles.meta, { color: error ? colors.destructive : colors.mutedForeground }]}>{message}</Text>
          ))}
        </View>
      )}
      {content}
    </NativeCompactShell>
  );
}

const styles = StyleSheet.create({
  tools: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 8 },
  search: { flexBasis: 160, flexGrow: 1, minHeight: 44, width: undefined },
  offline: { alignSelf: "flex-start", marginBottom: 8 },
  notices: { gap: 4, marginBottom: 8 },
  list: { paddingBottom: 16 },
  divider: { height: StyleSheet.hairlineWidth },
  progress: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 16 },
  row: { minHeight: 56, paddingVertical: 8, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  identity: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: 176, gap: 4 },
  title: { ...nativeTypography.bodyMedium, fontSize: 14, lineHeight: 20 },
  meta: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 16 },
  date: { fontVariant: ["tabular-nums"] },
});
