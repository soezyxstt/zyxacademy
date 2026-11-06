import { describe, expect, test } from "bun:test";
import { renderWithMessages } from "../helpers/render-with-messages";
import { DashboardPlanPreview } from "@/components/dashboard/plan-preview";
import { QueryProvider } from "@/components/providers/query-provider";

describe("student dashboard plan preview", () => {
  test("shows the three paid plan summaries and links to the full comparison", () => {
    const markup = renderWithMessages(<QueryProvider><DashboardPlanPreview /></QueryProvider>);

    expect(markup).toContain("Minimal");
    expect(markup).toContain("Essential");
    expect(markup).toContain("Premium");
    expect(markup).not.toContain(">Free<");
    expect(markup).not.toContain(">Custom<");
    expect(markup).toContain('href="/plans"');
    expect(markup).toContain("Memuat harga...");
    expect(markup).not.toContain("Estimasi untuk 3 orang dan 3 mata kuliah.");
    expect(markup).not.toContain("Bandingkan akses belajar mandiri, tutorial, dan konsultasi dalam satu semester.");
  });
});
