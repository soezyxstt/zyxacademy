import { describe, expect, it } from "bun:test";
import { readerPersonalStorageKeys } from "@/lib/materials/reader-personal-storage";

const material = { courseId: "course", materialId: "material", demo: false };

describe("private reader storage", () => {
  it("keeps notes and bookmarks separate for two accounts reading the same material", () => {
    const first = readerPersonalStorageKeys({ ...material, userId: "first" })!;
    const second = readerPersonalStorageKeys({ ...material, userId: "second" })!;
    const storage = new Map([[first.notes, "private notes"], [first.bookmarks, "[2]"]]);
    expect(storage.get(second.notes)).toBeUndefined();
    expect(storage.get(second.bookmarks)).toBeUndefined();
    expect(storage.get(first.notes)).toBe("private notes");
    expect(first.notes).not.toBe(first.bookmarks);
  });

  it("does not adopt legacy unowned data or persist private data without an account", () => {
    const legacy = new Map([["zyx-notes-material", "unowned"], ["zyx-bookmarks-material", "[1]"]]);
    const keys = readerPersonalStorageKeys({ ...material, userId: "first" })!;
    expect(legacy.get(keys.notes)).toBeUndefined();
    expect(legacy.get(keys.bookmarks)).toBeUndefined();
    expect(readerPersonalStorageKeys(material)).toBeNull();
  });

  it("preserves the existing demo adapter keys", () => {
    expect(readerPersonalStorageKeys({ ...material, demo: true })).toEqual({ notes: "zyx-notes-material", bookmarks: "zyx-bookmarks-material" });
  });
});
