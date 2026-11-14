import { describe, expect, test } from "bun:test";
import { formAttachmentUrl } from "./attachment";

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
