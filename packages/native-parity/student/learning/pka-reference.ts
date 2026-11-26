import { learningApi } from "./contracts";
import reference from "./pka-reference.json";

export type PkaReferenceScenario = "pka-signed-member" | "pka-signed-visitor";

function response(data: unknown, status: number) {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json", "cache-control": "private, no-store",
  } });
}

/** Replay only the four signed read responses in the selected synthetic account. */
export function createPkaReferenceRequest(scenario: PkaReferenceScenario) {
  const data = scenario === "pka-signed-member" ? reference.member : reference.visitor;
  return async (path: string, init?: RequestInit): Promise<Response> => {
    if (init?.signal?.aborted) throw Object.assign(new Error("Request was aborted"), { name: "AbortError" });
    const end = path.indexOf("?");
    if (end < 0 || path.slice(0, end) !== learningApi) return response({ code: "NOT_FOUND" }, 404);
    if ((init?.method ?? "GET").toUpperCase() !== "GET") return response({ code: "METHOD_NOT_ALLOWED" }, 405);
    const query = new URLSearchParams(path.slice(end + 1));
    const views = query.getAll("view");
    const locales = query.getAll("locale");
    if (views.length !== 1 || locales.length > 1 || (locales.length && locales[0] !== reference.locale)
      || Array.from(query.keys()).some(key => key !== "view" && key !== "locale")) {
      return response({ code: "INVALID_QUERY" }, 400);
    }
    const view = views[0];
    if (!Object.hasOwn(data, view)) return response({ code: "NOT_FOUND" }, 404);
    return response(data[view as keyof typeof data], 200);
  };
}
