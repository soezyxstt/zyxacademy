import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { TelemetryBoundary } from "@/components/providers/telemetry-boundary";

test("verification preview excludes telemetry while ordinary routes retain it", () => {
  const render = (pathname: string) => renderToStaticMarkup(
    <PathnameContext.Provider value={pathname}><TelemetryBoundary><span>Tracking</span></TelemetryBoundary></PathnameContext.Provider>,
  );
  expect(render("/authoring-verification")).toBe("");
  expect(render("/v4")).toBe("");
  expect(render("/courses")).toContain("Tracking");
  expect(render("/authoring-verification-extra")).toContain("Tracking");
});
