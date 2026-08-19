import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardPlanPreview } from "@/components/dashboard/plan-preview";

describe("student dashboard plan preview", () => {
  test("shows the three paid plan summaries and links to the full comparison", () => {
    const markup = renderToStaticMarkup(<DashboardPlanPreview />);

    expect(markup).toContain("Minimal");
    expect(markup).toContain("Essential");
    expect(markup).toContain("Premium");
    expect(markup).not.toContain(">Free<");
    expect(markup).not.toContain(">Custom<");
    expect(markup).toContain('href="/plans"');
    expect(markup).toContain("Estimasi untuk 3 orang dan 3 mata kuliah.");
  });
});
