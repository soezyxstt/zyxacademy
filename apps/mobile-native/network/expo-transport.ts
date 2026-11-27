import { fetch } from "expo/fetch";
import { createNativeTransport } from "./transport";

export function createExpoNativeTransport(origin: string) {
  return createNativeTransport({ origin, fetcher: fetch });
}
