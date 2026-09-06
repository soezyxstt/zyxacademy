import { describe, expect, it } from "bun:test";
import { auditWebBoundaries } from "../../scripts/audit-web-boundaries";

describe("Web Tier Boundaries Contract", () => {
  it("ensures app/** routes do not import native heavy compute or compute background jobs", () => {
    const violations = auditWebBoundaries();
    if (violations.length > 0) {
      console.error("Detected web tier boundary violations:", violations);
    }
    expect(violations).toHaveLength(0);
  });
});
