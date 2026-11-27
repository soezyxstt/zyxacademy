import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator } from "react-native";
import { OFFLINE_LIBRARY_COPY } from "../../../packages/offline/library-copy";
import { NativeStatusPanel } from "../features/shared-ui/layout";
import { ReadingDocument } from "./ReadingDocument";
import { offlineLibraryCopy, readableLibraryPackage, type OfflineLibraryRow } from "./library-model";
import type { OfflineReadingPackage, OfflineReadingTarget } from "./reading-contract";
import type { NativeOfflineLocale } from "./sync-contract";

type Props = {
  row: OfflineLibraryRow;
  observation: { getRevision(): number };
  revision: number;
  read: (target: OfflineReadingTarget) => Promise<OfflineReadingPackage | null>;
  locale: NativeOfflineLocale;
  section?: string;
};

export function SavedReading({ row, observation, revision, read, locale, section }: Props) {
  const grant = useMemo(() => ({ row, observation, revision, read }), [row, observation, revision, read]);
  const [result, setResult] = useState<{ grant: typeof grant; saved: OfflineReadingPackage | null } | null>(null);
  useEffect(() => {
    let active = true;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    function finish(saved: OfflineReadingPackage | null) {
      if (!active || revision !== observation.getRevision()) return;
      if (!saved || !readableLibraryPackage(row, saved.summary, Date.now())) {
        setResult({ grant, saved: null });
        return;
      }
      setResult({ grant, saved });
      const until = Math.min(row.savedUntil!, row.availableUntil, saved.summary.leaseExpiresAt);
      function checkExpiry() {
        const remaining = until - Date.now();
        if (remaining <= 0) finish(null);
        else expiry = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
      }
      checkExpiry();
    }
    void read(row.target).then(finish, () => finish(null));
    return () => { active = false; clearTimeout(expiry); };
  }, [grant, observation, read, revision, row]);

  if (result?.grant !== grant || revision !== observation.getRevision()) return <ActivityIndicator accessibilityLabel={offlineLibraryCopy[locale].loading} />;
  if (!result.saved || !readableLibraryPackage(row, result.saved.summary, Date.now())) return <NativeStatusPanel title={OFFLINE_LIBRARY_COPY[locale].unavailable} />;
  return <ReadingDocument saved={result.saved} locale={locale} section={section} />;
}
