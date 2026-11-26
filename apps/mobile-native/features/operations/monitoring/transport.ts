import {
  aiDateRange, MonitoringError,
  type MonitoringActions, type MonitoringData, type MonitoringLocale, type MonitoringReader, type MonitoringRequest,
} from "../../../../../packages/native-parity/operations/monitoring-contract";

import type { NativeRequestInit, NativeSessionTransport } from "../../../network/transport";

type MonitoringResponse = Pick<Response, "ok" | "status"> & {
  json(): Promise<unknown>;
  dispose?(): void;
};
export type MonitoringFetch = (path: string, init: NativeRequestInit) => Promise<MonitoringResponse>;

function requestPath<K extends keyof MonitoringData>(
  request: MonitoringRequest<K>, locale: MonitoringLocale, now: Date,
) {
  switch (request.view) {
    case "offline": return "/api/admin/offline/policy";
    case "links": return "/api/admin/short-links";
    case "offlineCatalog": {
      const query = new URLSearchParams({ locale });
      if (request.id) query.set("courseId", request.id);
      return `/api/admin/offline/catalog?${query}`;
    }
    default: {
      const query = new URLSearchParams({ view: request.view });
      if (request.view === "features" && request.range) query.set("range", String(request.range));
      if (request.view === "usage") {
        const range = aiDateRange(request.range ?? 30, now);
        range.forEach((value, key) => query.set(key, value));
      }
      if (request.id) query.set("id", request.id);
      for (const [key, value] of Object.entries(request.filters ?? {})) {
        if (value !== undefined && value !== "") query.set(key, String(value));
      }
      if (request.cursor) {
        query.set("cursorId", request.cursor.id);
        query.set("cursorAt", request.cursor.createdAt);
      }
      return `/api/admin/native-monitoring?${query}`;
    }
  }
}

/** The integrator supplies an origin-bound authenticated fetch for the active account. */
export function createMonitoringReader(
  request: MonitoringFetch, locale: MonitoringLocale, now = () => new Date(), checkSession?: () => void,
): MonitoringReader {
  return {
    async read<K extends keyof MonitoringData>(input: MonitoringRequest<K>, signal: AbortSignal) {
      const response = await request(requestPath(input, locale, now()), {
        signal, headers: { Accept: "application/json", "Accept-Language": locale },
      });
      try {
        if (!response.ok) throw new MonitoringError(response.status);
        const body = await response.json();
        checkSession?.();
        if (input.view === "usage") {
          const usage = body as { success?: boolean; data?: MonitoringData["usage"] } | null;
          if (!usage?.success || !usage.data) throw new MonitoringError(502);
          return usage.data as MonitoringData[K];
        }
        return body as MonitoringData[K];
      } finally {
        response.dispose?.();
      }
    },
  };
}

function sessionHeaders(path: string, session: NativeSessionTransport, headers?: HeadersInit) {
  const scoped = new Headers(headers);
  if (path.startsWith("/api/admin/offline/")) {
    scoped.set("x-offline-account-id", session.scope.accountId);
    scoped.set("x-offline-session-id", session.scope.sessionId);
  }
  return scoped;
}

export function createSessionMonitoringReader(session: NativeSessionTransport, locale: MonitoringLocale) {
  return createMonitoringReader((path, init) => session.request(path, {
    ...init, headers: sessionHeaders(path, session, init.headers),
  }), locale, undefined, () => session.assertCurrent());
}

/** Existing protected web writes, called once and reconciled with a read by the screen. */
export function createSessionMonitoringActions(session: NativeSessionTransport): MonitoringActions {
  async function write(path: string, method: "POST" | "PATCH", body: unknown) {
    const response = await session.request(path, {
      method,
      headers: sessionHeaders(path, session, {
        Accept: "application/json", "Content-Type": "application/json", Origin: session.scope.origin,
      }),
      body: JSON.stringify(body),
    });
    try {
      if (!response.ok) throw new MonitoringError(response.status);
      session.assertCurrent();
    } finally {
      response.dispose();
    }
  }
  return {
    syncAnalytics: () => write("/api/admin/native-monitoring?view=sync", "POST", {}),
    saveModel: input => write("/api/admin/native-monitoring?view=saveModel", "POST", input),
    resetModel: input => write("/api/admin/native-monitoring?view=resetModel", "POST", input),
    measureModelLatency: () => write("/api/admin/native-monitoring?view=measureLatency", "POST", {}),
    createProposal: () => write("/api/admin/native-monitoring?view=createProposal", "POST", {}),
    transitionProposal: input => write("/api/admin/native-monitoring?view=transitionProposal", "POST", input),
    createLink: input => write("/api/admin/native-monitoring?view=links", "POST", input),
    saveOffline: input => write("/api/admin/offline/policy", "PATCH", input),
    revalidateOffline: input => write("/api/admin/offline/revalidate", "POST", input),
  };
}
