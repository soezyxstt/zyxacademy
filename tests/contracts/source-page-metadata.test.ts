import { expect, it } from "bun:test";
import { sourcePageMetadata } from "@/lib/authoring/source-page-metadata";
import { sourcePageErrorCode } from "@/lib/compute/pdf-read-options";

it("distinguishes PDF page and unverified printed page while flagging damaged formulas", () => {
  const result = sourcePageMetadata(500, "Formula \u0001 + \u000e\n474");
  expect(result).toMatchObject({ pdfPage: 500, printedPage: "474", printedPageVerified: false,
    textQuality: { status: "needs_visual_review", controlCharacterCount: 2 } });
  expect(sourcePageMetadata(1, "12\nBody\n13").printedPage).toBeNull();
  expect(sourcePageMetadata(1, "Text\tline\nnext").textQuality.status).toBe("extracted");
  expect(sourcePageMetadata(1, "", true).textQuality.status).toBe("not_requested");
});

it("preserves timeout and metadata diagnostics", () => {
  expect(sourcePageErrorCode(new Error("fetch timed out"))).toBe("SOURCE_READ_TIMEOUT");
  const invalid = new Error("invalid dimensions");
  invalid.name = "ZodError";
  expect(sourcePageErrorCode(invalid)).toBe("SOURCE_PAGE_METADATA_INVALID");
  expect(sourcePageErrorCode(new Error("SOURCE_PAGE_PNG_INVALID"))).toBe("SOURCE_PAGE_PNG_INVALID");
});
