import { useRef, useState, type ComponentRef, type ReactNode } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View, useColorScheme } from "react-native";
import { OFFLINE_LIBRARY_COPY } from "../../../packages/offline/library-copy";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { NativeCompactShell, NativeListRow, NativeStatusPanel, SharedUiActionButton } from "../features/shared-ui/layout";
import { nativeTypography } from "../typography";
import { offlineLibraryCopy, type OfflineLibraryRow } from "./library-model";
import type { NativeOfflineLocale } from "./sync-contract";
import type { OfflineLibraryStorage } from "./library-data";
import type { OfflineLibrarySection } from "./catalog-view";
import { SharedSheet } from "../features/shared-ui/overlays";

export type OfflineLibraryAction = "download" | "remove" | "pin" | "unpin";
export type OfflineLibraryNotice = { message: string; error?: boolean };
export type OfflineLibraryViewProps = {
  locale: NativeOfflineLocale;
  offline: boolean;
  rows: OfflineLibraryRow[];
  query: string;
  canDownload: boolean;
  syncing?: boolean;
  purging?: boolean;
  unavailableCount?: number;
  storageUsage?: OfflineLibraryStorage;
  clearing?: boolean;
  management?: {
    section: OfflineLibrarySection;
    content?: ReactNode;
    select(section: OfflineLibrarySection): void;
  };
  pending?: { key: string; action: OfflineLibraryAction } | null;
  notices?: OfflineLibraryNotice[];
  blocked?: ReactNode;
  loading?: boolean;
  onQuery: (query: string) => void;
  onOpen?: (row: OfflineLibraryRow) => void;
  onClearTarget?: () => void;
  onRefresh?: () => void;
  onPurgeUnavailable?: () => void;
  onClearDownloads?: () => void;
  onAction: (row: OfflineLibraryRow, action: OfflineLibraryAction) => void;
  onBack?: () => void;
};

export function OfflineLibraryView({
  locale, offline, rows, query, canDownload, syncing, purging, unavailableCount = 0, pending, notices = [], blocked, loading, storageUsage, clearing, management,
  onQuery, onOpen, onClearTarget, onRefresh, onPurgeUnavailable, onClearDownloads, onAction, onBack,
}: OfflineLibraryViewProps) {
  const theme = useColorScheme() ?? "light";
  const colors = nativeColors[theme];
  const [managementOpen, setManagementOpen] = useState(false);
  const managementButton = useRef<ComponentRef<typeof Button>>(null);
  const shared = OFFLINE_LIBRARY_COPY[locale];
  const copy = offlineLibraryCopy[locale];
  const date = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeStyle: "short" });
  const unavailable = new Intl.NumberFormat(locale).format(unavailableCount);
  function requestAction(row: OfflineLibraryRow, action: OfflineLibraryAction) {
    if (action !== "remove") {
      onAction(row, action);
      return;
    }
    Alert.alert(copy.removeTitle, row.title, [
      { text: shared.cancel, style: "cancel" },
      { text: shared.remove, style: "destructive", onPress: () => onAction(row, action) },
    ], { cancelable: true });
  }
  function requestUnavailablePurge() {
    Alert.alert(copy.removeUnavailableTitle, copy.removeUnavailableBody, [
      { text: shared.cancel, style: "cancel" },
      { text: shared.remove, style: "destructive", onPress: onPurgeUnavailable },
    ], { cancelable: true });
  }
  function requestClear() {
    Alert.alert(shared.clearTitle, shared.clearBody, [
      { text: shared.cancel, style: "cancel" },
      { text: shared.clear, style: "destructive", onPress: onClearDownloads },
    ], { cancelable: true });
  }
  const usageNumber = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const storageLabel = (bytes: number) => bytes >= 1024 * 1024
    ? `${usageNumber.format(bytes / 1024 / 1024)} MB` : `${usageNumber.format(bytes / 1024)} KB`;
  const maintenance = Boolean(purging || clearing || syncing);
  const managementSection = management?.section ?? "readings";
  const showReadings = !management?.content && managementSection !== "storage";
  const showStorage = !management || managementSection === "storage";
  const content = blocked ?? management?.content ?? (showReadings && (loading && rows.length === 0 ? (
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
        const pinLabel = item.pinned ? shared.unpin : shared.pin;
        return (
          <View style={styles.row}>
            <View style={styles.identity}>
              <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
              <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                {target.kind === "diktat" ? shared.diktat : shared.article} · {courseTitle} · {savedUntil ? item.pinned ? shared.pinned : shared.saved : shared.notSaved}
              </Text>
              {savedUntil !== null && (
                <Text style={[styles.meta, styles.date, { color: colors.mutedForeground }]}>
                  {shared.accessUntil} {date.format(savedUntil)}
                </Text>
              )}
            </View>
            {savedUntil && onOpen ? <SharedUiActionButton
              action={{ id: "open", label: shared.open, accessibilityLabel: `${shared.open} ${title}`, variant: "outline",
                disabled: Boolean(working || purging || clearing) }}
              onAction={() => onOpen(item)}
            /> : null}
            {savedUntil && storageUsage ? <SharedUiActionButton
              testID={`offline-library-pin-${target.id}`}
              action={{ id: item.pinned ? "unpin" : "pin", label: pinLabel, accessibilityLabel: `${pinLabel} ${title}`,
                variant: "ghost", disabled: Boolean(pending || maintenance) }}
              onAction={() => requestAction(item, item.pinned ? "unpin" : "pin")}
            /> : null}
            {(savedUntil || canDownload || working) ? (
              <SharedUiActionButton
                action={{ id: action, label: working && pending?.action === action ? pendingLabel : label, accessibilityLabel: `${label} ${title}`,
                  disabled: Boolean(pending || maintenance), pending: working && pending?.action === action, variant: "ghost" }}
                onAction={() => requestAction(item, action)}
              />
            ) : null}
          </View>
        );
      }}
    />
  )));

  return (
    <NativeCompactShell navigationTitle={shared.title} back={onBack ? { label: copy.back, onPress: onBack } : undefined}>
      {offline && <Text style={[styles.meta, styles.offline, { color: colors.mutedForeground }]}>{shared.offline}</Text>}
      {!blocked && (
        <View style={styles.tools}>
          {management && <Button ref={managementButton} theme={theme} variant="outline" onPress={() => setManagementOpen(true)}
            accessibilityLabel={shared.manage} testID="offline-library-management">{shared[managementSection]}</Button>}
          {showReadings && <Input
            accessibilityLabel={shared.search}
            autoComplete="off"
            autoCorrect={false}
            onChangeText={onQuery}
            placeholder={shared.search}
            returnKeyType="search"
            style={styles.search}
            testID="offline-library-search"
            value={query}
          />}
          {showReadings && onClearTarget && (
            <SharedUiActionButton action={{ id: "all-readings", label: copy.allReadings, variant: "outline" }} onAction={onClearTarget} />
          )}
          {onRefresh && (
            <SharedUiActionButton
              action={{ id: "refresh", label: syncing ? `${shared.syncing}…` : shared.sync, pending: syncing,
                disabled: Boolean(pending || purging || clearing) }}
              onAction={onRefresh}
            />
          )}
        </View>
      )}
      {!blocked && management && <SharedSheet theme={theme} open={managementOpen} title={shared.manage} closeLabel={shared.cancel}
        returnFocusRef={managementButton} onDismiss={() => setManagementOpen(false)}>
        {(["readings", "courses", "videos", "achievements", "storage"] as const).map(section =>
          <NativeListRow key={section} layout="compact" theme={theme} title={shared[section]} testID={`offline-library-section-${section}`}
            primary={{ role: "button", onPress: () => { setManagementOpen(false); management.select(section); } }} />)}
      </SharedSheet>}
      {!blocked && showStorage && storageUsage && <View style={styles.storageAction}>
        <Text testID="offline-library-storage" style={[styles.meta, { color: colors.mutedForeground }]}>
          {shared.usage} {storageLabel(storageUsage.bytes)} {shared.of} {storageLabel(storageUsage.maxBytes)} · {storageUsage.pinnedCount} {shared.pinned.toLocaleLowerCase(locale)}
        </Text>
        {onClearDownloads && (storageUsage.count > 0 || clearing) && <SharedUiActionButton testID="offline-library-clear"
          action={{ id: "clear", label: clearing ? copy.removing : shared.clear, pending: clearing,
            disabled: Boolean(pending || purging || syncing), variant: "outline" }} onAction={requestClear} />}
      </View>}
      {showStorage && onPurgeUnavailable && (unavailableCount > 0 || purging) && (
        <View style={styles.storageAction}>
          <SharedUiActionButton
            action={{ id: "purge-unavailable", label: purging ? copy.removing : `${copy.removeUnavailable} (${unavailable})`,
              pending: purging, disabled: Boolean(pending || syncing || clearing), variant: "outline" }}
            onAction={requestUnavailablePurge}
            testID="offline-library-purge"
          />
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
  storageAction: { alignItems: "flex-start", gap: 4, marginBottom: 8 },
  list: { paddingBottom: 16 },
  divider: { height: StyleSheet.hairlineWidth },
  progress: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 16 },
  row: { minHeight: 56, paddingVertical: 8, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  identity: { minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: 176, gap: 4 },
  title: { ...nativeTypography.bodyMedium, fontSize: 14, lineHeight: 20 },
  meta: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 16 },
  date: { fontVariant: ["tabular-nums"] },
});
