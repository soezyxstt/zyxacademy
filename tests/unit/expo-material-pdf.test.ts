import { expect, test } from "bun:test";
import { safeMaterialPdfLink } from "../../apps/mobile-native/features/student/courses/pdf-reading";
import { nativeMaterialPdfSource } from "../../lib/student/native-material-pdf-source";

const origin = "https://academy.example.test";

test("native reading admits the verified course document source and preserves approved legacy hosting", () => {
  expect(nativeMaterialPdfSource("courses/course/materials/notes.pdf", ["course"], "manual-pdf", origin))
    .toEqual({ storageKey: "courses/course/materials/notes.pdf" });
  expect(nativeMaterialPdfSource(origin + "/api/storage/file/courses/old/diktats/notes%20v1.pdf", ["course", "old"], "legacy-diktat", origin))
    .toEqual({ storageKey: "courses/old/diktats/notes v1.pdf" });
  expect(nativeMaterialPdfSource("https://preview.ufs.sh/private-file", ["course"], "legacy-diktat", origin))
    .toEqual({ hostedUrl: "https://preview.ufs.sh/private-file" });
  for (const value of [
    "courses/another/materials/notes.pdf", "private/user/notes.pdf", "courses/course/materials/../notes.pdf",
    "https://external.example.test/api/storage/file/courses/course/materials/notes.pdf", "https://preview.ufs.sh.evil.test/file",
    "https://user:pass@preview.ufs.sh/file", "https://preview.ufs.sh:8000/file", "file:///courses/course/materials/notes.pdf",
  ]) expect(nativeMaterialPdfSource(value, ["course"], "manual-pdf", origin)).toBeNull();
});

test("PDF links can navigate to authored public HTTPS destinations without exposing file sharing links", () => {
  expect(safeMaterialPdfLink("https://university.example/lecture.pdf#page=3")).toBe("https://university.example/lecture.pdf#page=3");
  expect(safeMaterialPdfLink(origin + "/courses/course/material/another")).toBe(origin + "/courses/course/material/another");
  for (const value of [
    "file:///cache/private.pdf", "javascript:alert(1)", "https://localhost/data", "https://127.0.0.1/private",
    "https://cdn.example/download?X-Amz-Signature=private", "https://app.ufs.sh/file",
    origin + "/api/storage/file/courses/course/materials/private.pdf", origin + "/f/private.pdf",
  ]) expect(safeMaterialPdfLink(value)).toBeNull();
});
