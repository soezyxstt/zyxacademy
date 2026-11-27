import { headers } from "next/headers";
import { getDemoSummaries as loadSummaries } from "@/tests/visual/demo-harness/summary-repository";

export async function getDemoSummaries() {
  if ((await headers()).get("x-fixture-state") === "empty") return [];
  return loadSummaries();
}
