import { describe, expect, test } from "bun:test";
import { formAttachmentExportUrl, formAttachmentUrl, formQuestionImageProxyPath, protectedFormAttachmentKey } from "./attachment";

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

import { formResponseAttachmentFolder } from "./response-attachment-key";

describe("protectedFormAttachmentKey", () => {
  const options = { origin: "https://zyx.example", legacyBase: "https://legacy.example", folders: ["survey"], questionIndex: 2 };
  test("accepts the trusted proxy and configured legacy origin for the saved question slot", () => {
    expect(protectedFormAttachmentKey("/api/storage/file/forms/survey/question-3/a%20b.pdf", options))
      .toEqual(["forms", "survey", "question-3", "a b.pdf"]);
    expect(protectedFormAttachmentKey("https://legacy.example/forms/survey/question-3/a.pdf", options))
      .toEqual(["forms", "survey", "question-3", "a.pdf"]);
  });
  test("rejects external origins, other forms or questions, arbitrary directories, and encoded separators", () => {
    for (const href of [
      "https://spoof.example/forms/survey/question-3/a.pdf",
      "/api/storage/file/forms/other/question-3/a.pdf",
      "/api/storage/file/forms/survey/question-2/a.pdf",
      "/api/storage/file/forms/survey/question-3/a%252fb.pdf",
      "/api/storage/file/forms/survey/question-3/../question-3/a.pdf",
      "/api/storage/file/forms/survey/question-3/folder/a.pdf",
      "https://user:passwd@zyx.example/api/storage/file/forms/survey/question-3/a.pdf",
    ]) expect(protectedFormAttachmentKey(href, options)).toBeNull();
  });
});

test("form ID attachment namespaces survive rename and cannot match another form's current slug", () => {
  const responseFolder = formResponseAttachmentFolder("form-a");
  const foreign = formResponseAttachmentFolder("form-b");
  const options = { origin: "https://zyx.example", responseFolder, folders: ["new-title", foreign], questionIndex: 0 };
  expect(protectedFormAttachmentKey(`/api/storage/file/forms/${responseFolder}/question-1/upload.pdf`, options))
    .toEqual(["forms", responseFolder, "question-1", "upload.pdf"]);
  expect(protectedFormAttachmentKey(`/api/storage/file/forms/${foreign}/question-1/answer.pdf`, options)).toBeNull();
  expect(protectedFormAttachmentKey("/api/storage/file/forms/old-title/question-1/unknown.pdf", options)).toBeNull();
  expect(formQuestionImageProxyPath(`/api/storage/file/forms/${responseFolder}/question-1/answer.gif`, options.origin)).toBeNull();
  expect(formQuestionImageProxyPath("/api/storage/file/forms/new-title/question-1/draft.gif", options.origin))
    .toBe("/api/storage/file/forms/new-title/question-1/draft.gif");
});
