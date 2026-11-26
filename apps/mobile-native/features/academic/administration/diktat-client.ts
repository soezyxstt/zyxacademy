import { ADMINISTRATION_API_PREFIX, type DiktatEvidenceStatus, type DiktatPdfRequest } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";
import { AdministrationReadError } from "./live-client";

type Outcome =
  | { outcome: "accepted"; attemptId: string; queueUnavailable: boolean; superseded: boolean }
  | { outcome: "rejected"; conflict: boolean }
  | { outcome: "unknown" | "processing" };
const path = (request: DiktatPdfRequest) => `/api/admin/bundles/product/${encodeURIComponent(request.importId)}`;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const conflict = (code: unknown) => typeof code === "string" && (/STALE|CONFLICT|CHECKSUM_MISMATCH|TIMEOUT/).test(code);

function parseOutcome(status: number, data: unknown, request: DiktatPdfRequest): Outcome {
  if (status === 401 || status === 403) throw new AdministrationReadError(status);
  if (object(data)) {
    if (data.requestId === request.requestId) {
      if ((status === 200 || status === 202 || status === 503) && data.outcome === "accepted" && typeof data.attemptId === "string") {
        return { outcome: "accepted", attemptId: data.attemptId, queueUnavailable: data.error === "PRODUCT_DIKTAT_PDF_QUEUE_UNAVAILABLE", superseded: typeof data.supersededByAttemptId === "string" };
      }
      if (data.outcome === "rejected") return { outcome: "rejected", conflict: status === 409 || conflict(data.error) };
      if (status === 200 && (data.outcome === "processing" || data.outcome === "unknown")) return { outcome: data.outcome };
    }
    if (status === 409 && conflict(data.error)) return { outcome: "rejected", conflict: true };
  }
  if (status === 400 || status === 404 || status === 422) return { outcome: "rejected", conflict: false };
  return { outcome: "unknown" };
}

export async function requestDiktatPdf(transport: AcademicTransport, request: DiktatPdfRequest, signal: AbortSignal) {
  if (!transport.command) throw new AdministrationReadError(403);
  const response = await transport.command(`${path(request)}/pdf`, {
    method: "POST", requestId: request.requestId,
    body: { productId: request.productId, expectedRevision: request.expectedRevision, requestId: request.requestId },
  }, signal);
  return parseOutcome(response.status, await response.json().catch(() => null), request);
}

export async function checkDiktatPdfRequest(transport: AcademicTransport, request: DiktatPdfRequest, signal: AbortSignal) {
  const query = new URLSearchParams({ outcome: "1", requestId: request.requestId, productId: request.productId, expectedRevision: request.expectedRevision });
  const response = await transport.get(`${path(request)}/pdf?${query.toString()}`, signal);
  return parseOutcome(response.status, await response.json().catch(() => null), request);
}

export async function checkDiktatPdfEvidence(transport: AcademicTransport, slug: string, request: DiktatPdfRequest,
  attemptId: string, signal: AbortSignal): Promise<DiktatEvidenceStatus> {
  const query = new URLSearchParams({ productId: request.productId, expectedRevision: request.expectedRevision, attemptId });
  const response = await transport.get(
    `${ADMINISTRATION_API_PREFIX}pdf-status/${encodeURIComponent(slug)}/${encodeURIComponent(request.importId)}?${query.toString()}`,
    signal,
  );
  if (!response.ok) throw new AdministrationReadError(response.status);
  const data: unknown = await response.json();
  const status = object(data) ? data.status : undefined;
  if (status === "ready" || status === "pending" || status === "failed" || status === "stale" || status === "unavailable") return status;
  throw new AdministrationReadError(502);
}
