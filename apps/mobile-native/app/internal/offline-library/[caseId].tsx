import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { NativeStatusPanel } from "../../../features/shared-ui/layout";
import { isOfflineLibraryFixtureCase, offlineLibraryFixtureRows, type OfflineLibraryFixtureCase } from "../../../offline/library-fixtures";
import { filterOfflineLibrary, offlineLibraryCopy } from "../../../offline/library-model";
import { OfflineLibraryView } from "../../../offline/library-view";

export default function InternalOfflineLibraryFixture() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  if (!isOfflineLibraryFixtureCase(caseId)) return <Redirect href="/" />;
  return <OfflineLibraryFixture key={caseId} id={caseId} />;
}

function OfflineLibraryFixture({ id }: { id: OfflineLibraryFixtureCase }) {
  const router = useRouter();
  const locale = id === "failure" ? "en" : "id";
  const copy = offlineLibraryCopy[locale];
  const [query, setQuery] = useState("");
  const [retried, setRetried] = useState(false);
  const [unavailableCount, setUnavailableCount] = useState(id === "cleanup" ? 2 : id === "refresh" ? 1 : 0);
  const [fixtureRows, setFixtureRows] = useState(() => offlineLibraryFixtureRows(id));
  const rows = filterOfflineLibrary(fixtureRows, query, locale);
  return <OfflineLibraryView
    locale={locale} offline={id === "empty" || id === "cleanup"} rows={rows} query={query} onQuery={setQuery}
    canDownload={id === "populated" || id === "refresh"}
    blocked={id === "failure" && !retried ? <NativeStatusPanel tone="error" title={copy.failure}
      action={{ id: "retry", label: copy.retry }} onAction={() => setRetried(true)} /> : undefined}
    onAction={(item, action) => setFixtureRows(current => current.map(row => row.key === item.key
      ? { ...row, savedUntil: action === "download" ? row.availableUntil : null } : row))}
    onRefresh={id === "refresh" ? () => {
      setFixtureRows(offlineLibraryFixtureRows("populated"));
      setUnavailableCount(0);
    } : undefined}
    unavailableCount={unavailableCount}
    onPurgeUnavailable={id === "cleanup" || id === "refresh" ? () => setUnavailableCount(0) : undefined}
    onBack={() => router.replace("/")}
  />;
}
