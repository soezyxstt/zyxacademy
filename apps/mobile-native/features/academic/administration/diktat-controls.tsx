import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  canReplayDiktatPdfRequest, isAuthorizedDiktatPdfTarget, isDiktatPdfRequest, type DiktatPdfRequest, type DiktatPdfTarget,
} from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";
import type { AcademicScreenProps } from "../contracts";
import { checkDiktatPdfEvidence, checkDiktatPdfRequest, requestDiktatPdf } from "./diktat-client";
import { AdministrationReadError } from "./live-client";
import { Action, CourseDialog, Ink, layout } from "./ui";

type PdfState = "unknown" | "processing" | "pending" | "ready" | "failed" | "stale" | "rejected" | "denied" | "evidence_unavailable";
const pdfLabel: Record<PdfState, string> = {
  unknown: "Status permintaan belum diketahui.",
  processing: "Server sedang mencatat permintaan.",
  pending: "Permintaan diterima. PDF sedang disiapkan.",
  ready: "Bukti PDF siap untuk revisi ini.",
  failed: "Pembuatan PDF gagal.",
  evidence_unavailable: "Permintaan tercatat. Status bukti PDF belum tersedia.",
  stale: "Revisi atau percobaan PDF telah berubah.",
  rejected: "Permintaan PDF ditolak.",
  denied: "Akses PDF ditolak. Periksa sesi admin.",
};

type DiktatProps = Pick<AcademicScreenProps, "path" | "query" | "params" | "replace"> & {
  transport: AcademicTransport;
  target?: DiktatPdfTarget;
  authorized: readonly DiktatPdfTarget[];
  title?: string;
  closeConfirmation(): void;
  refresh(): void;
};

export function readDiktatScope(query: AcademicScreenProps["query"], importId: string) {
  const value = { importId, requestId: query.pdfRequest, productId: query.pdfProduct, expectedRevision: query.pdfRevision };
  return isDiktatPdfRequest(value) ? value : undefined;
}

export function DiktatPdfControls({ path, query, params, replace, transport, target, authorized, title, closeConfirmation, refresh }: DiktatProps) {
  const persisted = readDiktatScope(query, params.bundleId);
  const [draftState, setDraft] = useState<{ transport: AcademicTransport; scope: DiktatPdfRequest }>();
  const draft = draftState?.transport === transport ? draftState.scope : undefined;
  const [state, setState] = useState<PdfState>("unknown");
  const [busy, setBusy] = useState(false);
  const current = draft ?? persisted;
  const canBegin = Boolean(target && transport.command && !current && isAuthorizedDiktatPdfTarget(target, authorized));
  const canReplay = Boolean(transport.command && canReplayDiktatPdfRequest(draft, authorized));
  const active = useRef<AbortController | undefined>(undefined);
  useEffect(() => {
    setState("unknown");
    setBusy(false);
    return () => {
      active.current?.abort();
      active.current = undefined;
    };
  }, [transport]);

  function updateUrl(scope?: DiktatPdfRequest) {
    const search = new URLSearchParams(query);
    if (scope) {
      search.set("pdfRequest", scope.requestId);
      search.set("pdfProduct", scope.productId);
      search.set("pdfRevision", scope.expectedRevision);
    } else {
      search.delete("pdfRequest");
      search.delete("pdfProduct");
      search.delete("pdfRevision");
    }
    const encoded = search.toString();
    replace(path.split("?")[0] + (encoded ? `?${encoded}` : ""));
  }

  function send(scope: DiktatPdfRequest, mode: "request" | "check") {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    const operation = mode === "request" ? requestDiktatPdf : checkDiktatPdfRequest;
    operation(transport, scope, controller.signal).then(async (outcome): Promise<PdfState> => {
      if (outcome.outcome === "rejected") return outcome.conflict ? "stale" : "rejected";
      if (outcome.outcome !== "accepted") return outcome.outcome;
      if (outcome.superseded) return "stale";
      if (outcome.queueUnavailable) return "evidence_unavailable";
      if (mode === "request") return "pending";
      try {
        const status = await checkDiktatPdfEvidence(transport, params.slug, scope, outcome.attemptId, controller.signal);
        return status === "unavailable" ? "evidence_unavailable" : status;
      } catch (error) {
        if (error instanceof AdministrationReadError && (error.status === 401 || error.status === 403)) return "denied";
        return "evidence_unavailable";
      }
    }).then((status) => {
      if (!controller.signal.aborted) setState(status);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof AdministrationReadError && (error.status === 401 || error.status === 403)) setState("denied");
      else setState("unknown");
    }).finally(() => {
      if (active.current === controller) active.current = undefined;
      if (!controller.signal.aborted) setBusy(false);
    });
  }

  function begin() {
    if (!target || !canBegin || active.current) return;
    const scope = { ...target, requestId: randomUUID() };
    setDraft({ transport, scope });
    setState("unknown");
    closeConfirmation();
    updateUrl(scope);
    send(scope, "request");
  }

  const ended = state === "failed" || state === "ready" || state === "rejected" || state === "stale";
  return <>
    {target && canBegin ? <CourseDialog title="Minta pembuatan PDF?" onClose={closeConfirmation}>
      <Ink>{title || target.productId}</Ink>
      <Ink kind="meta" tone="muted">Permintaan masuk antrean untuk revisi draf ini.</Ink>
      <View style={layout.row}>
        <Action label="Minta PDF" variation="default" onPress={begin} testID="academic-live-diktat-confirm" />
        <Action label="Batal" onPress={closeConfirmation} />
      </View>
    </CourseDialog> : null}
    {current ? <View style={layout.group} testID="academic-live-diktat-status" accessibilityLiveRegion="polite">
      <Ink kind="heading">PDF Diktat</Ink>
      <Ink kind="meta">{current.productId}</Ink>
      <Ink tone={state === "failed" || state === "rejected" || state === "stale" || state === "denied" ? "error" : "default"}>
        {busy ? "Memeriksa permintaan PDF…" : pdfLabel[state]}
      </Ink>
      <View style={layout.row}>
        {!ended && state !== "denied" ? <Action label="Periksa status" disabled={busy} onPress={() => send(current, "check")} /> : null}
        {state === "unknown" && draft && canReplay ? <Action label="Coba kirim lagi" disabled={busy} onPress={() => send(draft, "request")} /> : null}
        {ended ? <Action label={state === "ready" ? "Selesai" : "Muat revisi terbaru"} onPress={() => {
          setDraft(undefined);
          setState("unknown");
          updateUrl();
          refresh();
        }} /> : null}
      </View>
    </View> : null}
  </>;
}
