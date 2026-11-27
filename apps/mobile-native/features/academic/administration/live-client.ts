import { isLiveAdministrationRead } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";

export class AdministrationReadError extends Error {
  constructor(readonly status: number) {
    super("Administration request failed.");
  }
}

export async function readAdministration(transport: AcademicTransport, path: string, signal: AbortSignal) {
  const response = await transport.get(path, signal);
  if (!response.ok) throw new AdministrationReadError(response.status);
  const payload: unknown = await response.json();
  if (!isLiveAdministrationRead(payload)) throw new AdministrationReadError(502);
  return payload;
}
