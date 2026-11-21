import { describe, expect, test } from "bun:test";
import { formAttachmentExportUrl, formAttachmentUrl } from "./attachment";

describe("formAttachmentUrl", () => {
  test("preserves existing form URLs without creating proxy paths and rejects unsafe answers", () => {
    expect(formAttachmentUrl("/api/storage/file/forms/survey/question-1/a%20b.pdf")).toBe("/api/storage/file/forms/survey/question-1/a%20b.pdf");
    expect(formAttachmentUrl("https://old.example/forms/survey/question-1/a.pdf?token=abc")).toBe("https://old.example/forms/survey/question-1/a.pdf?token=abc");
    expect(formAttachmentUrl("forms/survey/question-1/a.pdf")).toBeNull();
    expect(formAttachmentUrl("//old.example/forms/survey/question-1/a.pdf")).toBeNull();
    expect(formAttachmentUrl("javascript:alert(1)")).toBeNull();
    expect(formAttachmentUrl("/api/storage/file/forms/survey/%2e%2e/secret")).toBeNull();
    expect(formAttachmentUrl("/api/storage/file/forms/survey/a%2Fb.pdf")).toBeNull();
    expect(formAttachmentUrl("/api/storage/file/private/secret.pdf")).toBeNull();
  });
});

describe("formAttachmentExportUrl", () => {
  const appUrl = "https://staging.example/";

  test("resolves stored proxy URLs against the app origin", () => {
    const path = "/api/storage/file/forms/survey/question-1/a%20b.pdf?download=1#page=2";
    expect(formAttachmentExportUrl(path, appUrl)).toBe(`https://staging.example${path}`);
  });

  test("preserves absolute attachment URLs and rejects missing or invalid values", () => {
    const legacyUrl = "https://old.example/forms/survey/question-1/a.pdf?token=abc";
    expect(formAttachmentExportUrl(legacyUrl, appUrl)).toBe(legacyUrl);
    expect(formAttachmentExportUrl(undefined, appUrl)).toBeNull();
    expect(formAttachmentExportUrl("//old.example/forms/survey/question-1/a.pdf", appUrl)).toBeNull();
  });
});
