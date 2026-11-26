import { useLocalSearchParams, useRouter } from "expo-router";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { OFFLINE_LIBRARY_COPY } from "../../../packages/offline/library-copy";
import { authLocale } from "../auth/auth-copy";
import { authEntryHref } from "../auth/login-intent";
import { useNativeSession } from "../auth/session-provider";
import { useNativeAccountContext } from "../auth/use-account-context";
import { NativeStatusPanel } from "../features/shared-ui/layout";
import { useOfflineLibraryData } from "../offline/library-data";
import { filterOfflineLibrary, offlineLibraryCopy, offlineLibraryFeedback, type OfflineLibraryRow } from "../offline/library-model";
import { OfflineLibraryView, type OfflineLibraryAction, type OfflineLibraryNotice } from "../offline/library-view";
import { useOfflineCourseMetadata } from "../offline/lifecycle-provider";
import type { OfflineReadingDownloadStatus } from "../offline/reading-contract";
import { useOfflineReadingPackages } from "../offline/reading-hooks";
import { useOfflineReadingSession } from "../offline/use-reading-session";

const supported = Platform.OS === "ios" || Platform.OS === "android";
const noCourses: readonly string[] = [];

export default function OfflineRoute() {
  const params = useLocalSearchParams<{ locale?: string }>();
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
  const library = useOfflineLibraryData({ scope, verifiedUntil: readingSession.verifiedUntil, list: packages.list, subscribe: packages.subscribe });
  const { observation, revision } = library;
  const [search, setSearch] = useState<{ observation: typeof observation; query: string } | null>(null);
  const query = search?.observation === observation ? search.query : "";
  const rows = useMemo(() => filterOfflineLibrary(library.rows, query, locale), [library.rows, query, locale]);
  const activeObservation = useRef<typeof observation | null>(null);
  const working = useRef<{ observation: typeof observation; key: string } | null>(null);
  const [pending, setPending] = useState<{ observation: typeof observation; key: string; action: OfflineLibraryAction } | null>(null);
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
    if (activeObservation.current !== observation || revision !== observation.getRevision() || working.current
      || row.availableUntil <= now || readingSession.verifiedUntil <= now
      || (action === "remove" && (!row.savedUntil || row.savedUntil <= now))
      || (action === "download" && !packages.canDownload)) return;
    const operation = { observation, key: row.key, action };
    working.current = operation;
    setPending(operation);
    setFeedback(null);
    let status: OfflineReadingDownloadStatus | "removed" = "retry";
    try {
      status = action === "download" ? (await packages.download(row.target)).status
        : await packages.forget(row.target) ? "removed" : "unavailable";
    } catch {
      // Native storage and network details may include private paths. Keep the in-app error fixed.
    } finally {
      if (working.current === operation) {
        working.current = null;
        setPending(null);
      }
    }
    if (activeObservation.current !== observation) return;
    const notice = offlineLibraryFeedback(locale, status);
    if (status !== "cancelled") library.retry();
    if (notice) setFeedback({ observation, revision: observation.getRevision(), notice });
  }

  function retry() {
    setFeedback(null);
    library.retry();
    if (!offline) void metadata.retry();
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
  if (scope) {
    if (feedback?.observation === observation && feedback.revision === revision) notices.push(feedback.notice);
    if (metadata.status === "error" && !library.failed) notices.push({ message: copy.syncFailed, error: true });
    if (library.expired) notices.push({ message: shared.expired });
    if (library.rows.some(row => row.savedUntil)) notices.push({ message: copy.readerPending });
  }

  return <OfflineLibraryView
    locale={locale} offline={supported && offline} loading={loading} blocked={blocked}
    rows={scope ? rows : []} query={query} onQuery={value => setSearch({ observation, query: value })}
    canDownload={Boolean(scope && packages.canDownload)} notices={notices}
    syncing={metadata.status === "syncing"}
    pending={pending?.observation === observation ? pending : null}
    onRefresh={scope && !offline ? retry : undefined} onAction={(row, action) => void runAction(row, action)}
    onBack={router.canGoBack() ? () => router.back() : undefined}
  />;
}
