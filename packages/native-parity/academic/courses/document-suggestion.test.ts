import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isMetadataSuggestion, isMetadataValues, materialFilename } from "./document-suggestion";

const draft = { title: "Limit", category: "materi", subcategory: "ebook", year: null };
test("accepts an editable suggestion and rejects invalid category, year and chapter data", () => {
  assert.ok(isMetadataSuggestion({ ...draft, chapterIds: ["bab-1"] }));
  assert.ok(isMetadataSuggestion({ ...draft, chapterIds: [], subcategory: null, year: 2024 }));
  for (const patch of [{ category: "lain" }, { subcategory: "uas" }, { year: 2024.5 }, { year: 2101 }, { title: " " }]) {
    assert.equal(isMetadataValues({ ...draft, ...patch }), false);
  }
  for (const chapterIds of [null, "bab", [null], [""]]) assert.equal(isMetadataSuggestion({ ...draft, chapterIds }), false);
});
test("removes storage paths, query and fragment from names used as provider input", () => {
  assert.equal(materialFilename("https://example.invalid/private/Bab%202.pdf?token=private#key", "Judul"), "Bab 2.pdf");
  assert.equal(materialFilename("courses/math/materials/mk.pdf", "Judul"), "mk.pdf");
  assert.equal(materialFilename("https://example.invalid/%ZZ?token=private", "Judul"), "Judul");
  assert.equal(materialFilename("https://example.invalid/?token=private", "Judul"), "Judul");
});
