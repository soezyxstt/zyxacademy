import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform } from "react-native";
import { OFFLINE_LIBRARY_COPY } from "../../../packages/offline/library-copy";
import { authLocale } from "../auth/auth-copy";
import { authEntryHref } from "../auth/login-intent";
import { useNativeSession } from "../auth/session-provider";
import { useNativeAccountContext } from "../auth/use-account-context";
import { NativeCompactShell, NativeStatusPanel } from "../features/shared-ui/layout";
import { useOfflineLibraryData } from "../offline/library-data";
import { offlineDocumentHref, filterOfflineLibrary, focusOfflineLibrary, offlineLibraryCopy, offlineLibraryFeedback, offlineLibraryTarget, type OfflineLibraryRow } from "../offline/library-model";
import { OfflineLibraryView, type OfflineLibraryAction, type OfflineLibraryNotice } from "../offline/library-view";
import { useOfflineCourseMetadata } from "../offline/lifecycle-provider";
import type { OfflineReadingDownloadStatus } from "../offline/reading-contract";
import { SavedReading } from "../offline/SavedReading";
import { useOfflineReadingPackages } from "../offline/reading-hooks";
import { useOfflineReadingSession } from "../offline/use-reading-session";

const supported = Platform.OS === "ios" || Platform.OS === "android";
const noCourses: readonly string[] = [];

export default function OfflineRoute() {
  const params = useLocalSearchParams<{ locale?: string; courseId?: string; materialId?: string; read?: string; section?: string }>();
  const focused = useIsFocused();
  const router = useRouter();
  const { state, revalidating, refresh: refreshSession } = useNativeSession();
  const account = useNativeAccountContext();
  const offlineLocale = state.status === "unavailable" ? state.offlineIdentity?.locale : undefined;
  const locale = account.context?.locale ?? offlineLocale ?? authLocale(params.locale);
  const copy = offlineLibraryCopy[locale];
  const shared = OFFLINE_LIBRARY_COPY[locale];
  const readingSession = useOfflineReadingSession(locale);
  const packages = useOfflineReadingPackages(locale);
  const access = readingSession.scope && packages.available ? readingSession.scope : null;
  const offline = readingSession.offline;
  const metadata = useOfflineCourseMetadata(readingSession.transport ? null : noCourses, locale);
  const scope = metadata.status === "revoked" ? null : access;
  const library = useOfflineLibraryData({ scope, verifiedUntil: readingSession.verifiedUntil, list: packages.list,
    storage: packages.storage, subscribe: packages.subscribe });
  const { observation, revision } = library;
  const [search, setSearch] = useState<{ observation: typeof observation; query: string } | null>(null);
  const query = search?.observation === observation ? search.query : "";
  const target = useMemo(() => offlineLibraryTarget(params.courseId, params.materialId), [params.courseId, params.materialId]);
  const rows = useMemo(() => filterOfflineLibrary(focusOfflineLibrary(library.rows, target), query, locale), [library.rows, query, locale, target]);
  const activeObservation = useRef<typeof observation | null>(null);
  const working = useRef<{ observation: typeof observation; key: string } | null>(null);
  const [pending, setPending] = useState<{ observation: typeof observation; key: string; action: OfflineLibraryAction } | null>(null);
  const [maintenance, setMaintenance] = useState<{ observation: typeof observation; action: "sync" | "purge" | "clear" } | null>(null);
  const [feedback, setFeedback] = useState<{ observation: typeof observation; revision: number; notice: OfflineLibraryNotice } | null>(null);

  const canRead = scope !== null;
  useLayoutEffect(() => {
    activeObservation.current = canRead ? observation : null;
    return () => {
      activeObservation.current = null;
      if (working.current?.observation === observation) working.current = null;
    };
  }, [canRead, observation]);

  async function runAction(row: OfflineLibraryRow, action: OfflineLibraryAction) {
    const now = Date.now();
    if (!focused || activeObservation.current !== observation || revision !== observation.getRevision() || working.current
      || row.availableUntil <= now || readingSession.verifiedUntil <= now
      || (action !== "download" && (!row.savedUntil || row.savedUntil <= now))
      || (action === "download" && !packages.canDownload)) return;
    const operation = { observation, key: row.key, action };
    working.current = operation;
    setPending(operation);
    setFeedback(null);
    let status: OfflineReadingDownloadStatus | "removed" | "pin-updated" = "retry";
    try {
      if (action === "download") status = (await packages.download(row.target)).status;
      else if (action === "remove") status = await packages.forget(row.target) ? "removed" : "unavailable";
      else status = await packages.setPinned(row.target, action === "pin") ? "pin-updated" : "unavailable";
    } catch {
      // Native storage and network details may include private paths. Keep the in-app error fixed.
    } finally {
      if (working.current === operation) {
        working.current = null;
        setPending(null);
      }
    }
    if (activeObservation.current !== observation) return;
    const notice = status === "pin-updated" ? null : offlineLibraryFeedback(locale, status);
    if (status !== "cancelled") library.retry();
    if (notice) setFeedback({ observation, revision: observation.getRevision(), notice });
  }

  async function runMaintenance(action: "sync" | "purge" | "clear") {
    if (!focused || activeObservation.current !== observation || working.current
      || readingSession.verifiedUntil <= Date.now() || (action === "sync" && !packages.canDownload)) return;
    const operation = { observation, key: action };
    working.current = operation;
    setMaintenance({ observation, action });
    setFeedback(null);
    let notice: OfflineLibraryNotice | null = null;
    try {
      if (action === "purge" || action === "clear") {
        const removed = action === "clear" ? await packages.clearDownloads() : await packages.purgeUnavailable();
        if (removed) notice = offlineLibraryFeedback(locale, "removed");
      } else {
        await metadata.retry();
        if (activeObservation.current !== observation) return;
        const { attempted, restored } = await packages.revalidateSaved();
        if (restored < attempted) notice = { message: copy.revalidationFailed, error: true };
      }
    } catch {
      notice = offlineLibraryFeedback(locale, "retry");
    } finally {
      if (working.current === operation) {
        working.current = null;
        setMaintenance(null);
      }
    }
    if (activeObservation.current !== observation) return;
    library.retry();
    if (notice) setFeedback({ observation, revision: observation.getRevision(), notice });
  }

  function retry() {
    if (offline) library.retry();
    else void runMaintenance("sync");
  }

  let blocked;
  let loading = false;
  if (!supported) blocked = <NativeStatusPanel title={copy.unsupported} />;
  else if (!scope) {
    if (metadata.status === "revoked" || account.denied || (account.context && !account.context.roles.includes("murid"))) {
      blocked = <NativeStatusPanel title={metadata.status === "revoked" ? shared.unavailable : copy.denied} />;
    } else if (state.status === "signed-out" && !offline) {
      blocked = <NativeStatusPanel title={copy.signInTitle} action={{ id: "sign-in", label: copy.signIn }}
        onAction={() => router.push(authEntryHref({ entry: "sign-in", locale, next: "/offline" }))} />;
    } else if (state.status === "loading" || revalidating || (state.status === "signed-in" && !account.context && !account.failed && !offline)) {
      loading = true;
    } else {
      blocked = offline ? <NativeStatusPanel title={shared.expired} /> : (
        <NativeStatusPanel title={copy.failure} tone="error" action={{ id: "retry", label: copy.retry }}
          onAction={() => { account.retry(); void refreshSession(); }} />
      );
    }
  } else if (library.failed) {
    blocked = <NativeStatusPanel title={copy.failure} tone="error" action={{ id: "retry", label: copy.retry }} onAction={retry} />;
  } else {
    loading = !library.loaded || (!library.rows.length && ["loading", "syncing"].includes(metadata.status));
  }

  const notices: OfflineLibraryNotice[] = [];
  const currentMaintenance = maintenance?.observation === observation ? maintenance.action : null;
  if (scope) {
    if (feedback?.observation === observation && feedback.revision === revision) notices.push(feedback.notice);
    if (metadata.status === "error" && !library.failed) notices.push({ message: copy.syncFailed, error: true });
    if (library.expired) notices.push({ message: shared.expired });
  }

  if (params.read !== undefined) {
    if (!focused) return null;
    const row = target?.materialId && !blocked && scope ? library.rows.find(item =>
      item.target.id === target.materialId && item.target.courseId === target.courseId && item.target.kind === params.read &&
      item.savedUntil && item.savedUntil > Date.now()) : undefined;
    return <NativeCompactShell navigationTitle={row?.title ?? shared.title} back={{ label: copy.back,
      onPress: () => router.canGoBack() ? router.back() : router.replace({ pathname: "/offline", params: { locale } }) }}>
      {blocked ?? (row ? <SavedReading key={row.key} row={row} observation={observation} revision={revision}
        read={packages.read} locale={locale} section={typeof params.section === "string" ? params.section : undefined} />
        : loading ? <ActivityIndicator accessibilityLabel={copy.loading} /> : <NativeStatusPanel title={shared.unavailable} />)}
    </NativeCompactShell>;
  }

  return <OfflineLibraryView
    locale={locale} offline={supported && offline} loading={loading} blocked={blocked}
    rows={scope ? rows : []} query={query} onQuery={value => setSearch({ observation, query: value })}
    onClearTarget={target ? () => { setSearch(null); router.replace({ pathname: "/offline", params: { locale } }); } : undefined}
    onOpen={row => {
      if (focused && activeObservation.current === observation && revision === observation.getRevision() &&
        row.savedUntil && row.savedUntil > Date.now()) router.push(offlineDocumentHref(locale, row.target));
    }}
    canDownload={Boolean(scope && packages.canDownload)} notices={notices}
    syncing={metadata.status === "syncing" || currentMaintenance === "sync"}
    purging={currentMaintenance === "purge"} clearing={currentMaintenance === "clear"}
    storageUsage={scope ? library.storageUsage : undefined}
    unavailableCount={library.unavailableCount}
    pending={pending?.observation === observation ? pending : null}
    onRefresh={scope && !offline ? retry : undefined} onAction={(row, action) => void runAction(row, action)}
    onPurgeUnavailable={scope ? () => void runMaintenance("purge") : undefined}
    onClearDownloads={scope ? () => void runMaintenance("clear") : undefined}
    onBack={router.canGoBack() ? () => router.back() : undefined}
  />;
}
