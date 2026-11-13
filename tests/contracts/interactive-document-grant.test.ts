import { expect, test } from "bun:test";
import { mintInteractiveDocumentGrant, verifyInteractiveDocumentGrant } from "@/lib/materials/interactive-document-grant";

test("reveal grants bind the user, field, draft revision and expiry", () => {
  const scope = { userId: "student", articleId: "article", articleVersion: 2, sectionId: "section", blockId: "block", field: "explanation" as const, draftId: "draft", draftChecksum: "a".repeat(64) };
  const token = mintInteractiveDocumentGrant(scope, "secret", 1000);
  expect(verifyInteractiveDocumentGrant(token, "student", "secret", 1000)).toEqual({ ...scope, expires: 601000 });
  expect(verifyInteractiveDocumentGrant(token, "other", "secret", 1000)).toBeNull();
  expect(verifyInteractiveDocumentGrant(token, "student", "wrong", 1000)).toBeNull();
  expect(verifyInteractiveDocumentGrant(`${token.slice(0, -1)}!`, "student", "secret", 1000)).toBeNull();
  expect(verifyInteractiveDocumentGrant(token, "student", "secret", 601000)).toBeNull();
  expect(() => mintInteractiveDocumentGrant(scope, "", 1000)).toThrow();
});
