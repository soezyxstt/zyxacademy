import {
  aiDateRange, MonitoringError,
  type MonitoringData, type MonitoringLocale, type MonitoringReader, type MonitoringRequest,
} from "../../../../../packages/native-parity/operations/monitoring-contract";

export type MonitoringFetch = (path: string, init: RequestInit) => Promise<Response>;

function requestPath<K extends keyof MonitoringData>(
  request: MonitoringRequest<K>, locale: MonitoringLocale, now: Date,
) {
  switch (request.view) {
    case "ops": return "/api/admin/ops";
    case "ai": return "/api/admin/ai-analytics";
    case "usage": return `/api/admin/ai-analytics/usage?${aiDateRange(request.range ?? 30, now)}`;
    case "zyra": return "/api/admin/zyra/ops";
    case "proposals": return "/api/zyra/proposals";
    case "keys": return "/api/admin/key-diagnostics";
    case "offline": return "/api/admin/offline/policy";
    case "links": return "/api/admin/short-links";
    case "offlineCatalog": {
      const query = new URLSearchParams({ locale });
      if (request.id) query.set("courseId", request.id);
      return `/api/admin/offline/catalog?${query}`;
    }
    default: {
      const query = new URLSearchParams({ view: request.view });
      if (request.range) query.set("range", String(request.range));
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
  request: MonitoringFetch, locale: MonitoringLocale, now = () => new Date(),
): MonitoringReader {
  return {
    async read<K extends keyof MonitoringData>(input: MonitoringRequest<K>, signal: AbortSignal) {
      const response = await request(requestPath(input, locale, now()), {
        signal, headers: { Accept: "application/json", "Accept-Language": locale },
      });
      if (!response.ok) throw new MonitoringError(response.status);
      const body: unknown = await response.json();
      if (input.view === "usage") {
        const usage = body as { success?: boolean; data?: MonitoringData["usage"] };
        if (!usage.success || !usage.data) throw new MonitoringError(502);
        return usage.data as MonitoringData[K];
      }
      return body as MonitoringData[K];
    },
  };
}
