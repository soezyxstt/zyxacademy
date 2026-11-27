import { learningEndpoint } from "../courses/contract";
import responses from "./responses.json";

export const dashboardStates = ["enrolled", "unenrolled", "revoked"] as const;
export type DashboardState = (typeof dashboardStates)[number];

export function dashboardFixtureState(scenario: string): DashboardState | undefined {
  return dashboardStates.find(state => scenario === `dashboard-parity-${state}`);
}

function fixtureJson(data: unknown): Response {
  // React Native's fetch polyfill supports the constructor, but has no static Response.json.
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
}

export function readDashboardFixture(state: DashboardState, path: string, init?: RequestInit): Response | undefined {
  if (init?.method && init.method !== "GET") return;
  if (init?.signal?.aborted) throw new Error("ABORTED");
  if (path === learningEndpoint({ view: "dashboard" })) return fixtureJson(responses[state].dashboard);
  if (path === learningEndpoint({ view: "dashboard-extras" })) return fixtureJson(responses[state].extras);
  if (path === learningEndpoint({ view: "catalog" })) {
    const dashboard = responses[state].dashboard;
    return fixtureJson({ view: "catalog", targetCategory: "preview" in dashboard ? dashboard.preview.targetCategory : null,
      courses: [...dashboard.enrolled, ...dashboard.recommended] });
  }
}
