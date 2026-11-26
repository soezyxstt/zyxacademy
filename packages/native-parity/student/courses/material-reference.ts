import { learningEndpoint } from "./contract";
import fixture from "./material-reference.json";

const states = ["enrolled", "unenrolled", "revoked"] as const;
export const materialReferenceScenarios = states.map(state => `course-material-${state}` as const);
type MaterialReferenceScenario = (typeof materialReferenceScenarios)[number];

/** Replay the signed local product responses for exactly the recorded resource identities. */
export function courseMaterialReferenceRequest(scenario: MaterialReferenceScenario) {
  const state = states[materialReferenceScenarios.indexOf(scenario)];
  const { courseId, materialId, previewId } = fixture;
  const data = fixture.responses[state];
  const recorded = new Map<string, object>([
    [learningEndpoint({ view: "course", courseId }), data.course],
    [learningEndpoint({ view: "material-list", courseId }), data["material-list"]],
    [learningEndpoint({ view: "material-detail", courseId, materialId }), data["material-detail"]],
    [learningEndpoint({ view: "material-detail", courseId, materialId: previewId }), data.preview],
  ]);

  return async (path: string, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new Error("ABORTED");
    const response = !init?.method || init.method === "GET" ? recorded.get(path) : undefined;
    return new Response(JSON.stringify(response ?? { error: "COURSE_RESOURCE_NOT_FOUND" }), {
      status: response ? 200 : 404,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
    });
  };
}
