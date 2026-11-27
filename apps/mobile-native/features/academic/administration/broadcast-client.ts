import {
  isBroadcastComposeData, isBroadcastReceipt, type BroadcastDraft,
} from "../../../../../packages/academic/admin-broadcast";
import { ADMINISTRATION_API_PREFIX } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";

const path = `${ADMINISTRATION_API_PREFIX}notifications/broadcast`;

export type BroadcastCommand = { action: "prepare"; draft: BroadcastDraft } | { action: "confirm" | "discard"; id: string };

export async function readBroadcast(transport: AcademicTransport, signal: AbortSignal) {
  const response = await transport.get(path, signal);
  if (response.status === 401 || response.status === 403) return { status: "denied" } as const;
  if (!response.ok) return { status: "unavailable" } as const;
  const data = await response.json();
  return isBroadcastComposeData(data) ? { status: "ready", data } as const : { status: "unavailable" } as const;
}

export async function submitBroadcast(transport: AcademicTransport, body: BroadcastCommand, requestId: string, signal: AbortSignal) {
  if (!transport.command) return { status: "denied" } as const;
  const response = await transport.command(path, { method: "POST", body, requestId }, signal);
  if (response.status === 401 || response.status === 403) return { status: "denied" } as const;
  if (response.status === 404 || response.status === 409) return { status: "refresh" } as const;
  const value = await response.json();
  if (value && typeof value === "object") {
    if (response.ok && "receipt" in value && isBroadcastReceipt(value.receipt)) {
      return { status: "saved", receipt: value.receipt } as const;
    }
    if (response.status === 422 && "error" in value && value.error === "EMPTY_AUDIENCE") return { status: "empty" } as const;
  }
  if (response.status === 400 || response.status === 415 || response.status === 422) return { status: "invalid" } as const;
  return { status: "unknown" } as const;
}
