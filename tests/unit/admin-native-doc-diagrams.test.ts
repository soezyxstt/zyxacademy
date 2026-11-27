import { expect, test } from "bun:test";
import { getAdminDocs } from "../../lib/docs/admin";
import { getAdminDocDiagram } from "../../packages/academic/docs/admin-diagrams";

test("provides a native diagram for each signed Admin article in both languages", () => {
  for (const locale of ["id", "en"] as const) {
    const ids = new Set(getAdminDocs(locale).flatMap(doc => doc.sections.flatMap(section => section.diagram ? [section.diagram] : [])));
    expect(ids.size).toBe(9);
    for (const id of ids) {
      const diagram = getAdminDocDiagram(id, locale);
      expect(diagram?.caption.length).toBeGreaterThan(10);
      expect(diagram?.rows.length).toBeGreaterThan(1);
    }
  }
});
