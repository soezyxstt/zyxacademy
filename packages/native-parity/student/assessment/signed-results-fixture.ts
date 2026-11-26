import responses from "./signed-results-responses.json";

export const signedResultsFixtureScenario = "assessment-signed-results";

export async function signedResultsFixtureRequest(path: string, init?: RequestInit): Promise<Response> {
  if (init?.signal?.aborted) throw new Error("ABORTED");
  const read = !init?.method || init.method === "GET";
  const payload = read && Object.hasOwn(responses, path) ? responses[path as keyof typeof responses] : undefined;
  return new Response(JSON.stringify(payload ?? { error: "Asesmen tidak tersedia." }), {
    status: payload ? 200 : 404,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
}
