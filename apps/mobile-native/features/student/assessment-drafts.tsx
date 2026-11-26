import { openDatabaseAsync } from "expo-sqlite";
import { useEffect, useMemo } from "react";
import { useNativeSession } from "../../auth/session-provider";
import type { NativeSessionTransport } from "../../network/transport";
import { createAssessmentDraftRepository } from "./assessment-draft-store";

const repository = createAssessmentDraftRepository(() => openDatabaseAsync("zyx-assessment-drafts.db"));

export function useAssessmentDrafts(transport: NativeSessionTransport | null, locale: "en" | "id") {
  const binding = useMemo(() => transport
    ? repository.bind({ ...transport.scope, locale }, () => transport.assertCurrent())
    : undefined, [transport, locale]);
  useEffect(() => {
    // A failed reconciliation leaves the binding retryable. Draft operations
    // report the failure to their existing assessment recovery UI.
    void binding?.reconcile().catch(() => {});
  }, [binding]);
  return binding?.drafts;
}

/** Mount for the lifetime of the native session host. */
export function AssessmentDraftCleanup() {
  const { subscribeBeforeLogout } = useNativeSession();
  useEffect(() => subscribeBeforeLogout(cleanup => repository.purgeSession(cleanup.scope)), [subscribeBeforeLogout]);
  return null;
}
