import { describe, expect, it } from "bun:test";
import { extractStorageKey } from "@/lib/storage/keys";
import { buildThumbnailEventId, enqueuePdfThumbnail } from "@/lib/thumbnail";

describe("extractStorageKey", () => {
  it("returns raw keys untouched", () => {
    expect(extractStorageKey("courses/ma1101/materials/doc.pdf")).toBe("courses/ma1101/materials/doc.pdf");
  });

  it("returns null for empty values", () => {
    expect(extractStorageKey(null)).toBeNull();
    expect(extractStorageKey(undefined)).toBeNull();
    expect(extractStorageKey("   ")).toBeNull();
  });

  it("strips query strings, hashes, and leading slashes", () => {
    expect(extractStorageKey("courses/ma1101/materials/doc.pdf?retry=2#page")).toBe("courses/ma1101/materials/doc.pdf");
    expect(extractStorageKey("/courses/ma1101/materials/doc.pdf")).toBe("courses/ma1101/materials/doc.pdf");
  });

  it("resolves relative storage proxy paths", () => {
    expect(extractStorageKey("/api/storage/file/courses/ma1101/materials/doc.pdf")).toBe("courses/ma1101/materials/doc.pdf");
    expect(extractStorageKey("/f/courses/ma1101/materials/doc.pdf")).toBe("courses/ma1101/materials/doc.pdf");
  });

  it("resolves absolute storage proxy URLs", () => {
    expect(extractStorageKey("https://zyx.ac.id/api/storage/file/courses/ma1101/materials/doc.pdf")).toBe(
      "courses/ma1101/materials/doc.pdf",
    );
    expect(extractStorageKey("https://zyx.ac.id/f/courses/ma1101/materials/doc.pdf?retry=1")).toBe(
      "courses/ma1101/materials/doc.pdf",
    );
  });

  it("decodes percent-encoded keys", () => {
    expect(extractStorageKey("courses/ma1101/materials/kuliah%201.pdf")).toBe("courses/ma1101/materials/kuliah 1.pdf");
  });

  it("rejects absolute URLs outside the storage proxy and public base", () => {
    expect(extractStorageKey("https://cdn.example.com/some/doc.pdf")).toBeNull();
  });
});

describe("buildThumbnailEventId", () => {
  it("uses one deterministic hash across dispatch paths", () => {
    const first = buildThumbnailEventId({
      materialId: "mat-1",
      sourceType: "course_material",
      sourceVersion: "courses/ma1101/materials/doc.pdf",
    });
    const second = buildThumbnailEventId({
      materialId: "mat-1",
      sourceType: "course_material",
      sourceVersion: "courses/ma1101/materials/doc.pdf",
    });
    expect(first).toBe(second);
    expect(first.startsWith("thumbnail-")).toBe(true);
    expect(first).toHaveLength("thumbnail-".length + 64);
  });

  it("hashes the complete source version instead of truncating the suffix", () => {
    const prefix = "courses/c/materials/";
    const padding = "a".repeat(92);
    const first = buildThumbnailEventId({
      materialId: "mat-1",
      sourceType: "course_material",
      sourceVersion: `${prefix}a${padding}.pdf`,
    });
    const second = buildThumbnailEventId({
      materialId: "mat-1",
      sourceType: "course_material",
      sourceVersion: `${prefix}b${padding}.pdf`,
    });
    expect(first).not.toBe(second);
  });

  it("produces a fresh id for each recovery attempt but reuses one id across sender retries", () => {
    const request = {
      materialId: "mat-1",
      sourceType: "course_material" as const,
      sourceVersion: "courses/ma1101/materials/doc.pdf",
    };
    const initial = buildThumbnailEventId(request);
    const retryOne = buildThumbnailEventId({ ...request, attemptId: "attempt-1" });
    const retryOneAgain = buildThumbnailEventId({ ...request, attemptId: "attempt-1" });
    const retryTwo = buildThumbnailEventId({ ...request, attemptId: "attempt-2" });
    expect(retryOne).toBe(retryOneAgain);
    expect(retryOne).not.toBe(initial);
    expect(retryTwo).not.toBe(retryOne);
  });
});

describe("enqueuePdfThumbnail", () => {
  const request = {
    materialId: "mat-1",
    sourceType: "course_material" as const,
    sourceVersion: "courses/ma1101/materials/doc.pdf",
  };

  it("sends once when the first attempt succeeds", async () => {
    const seen: unknown[] = [];
    await enqueuePdfThumbnail(request, {
      retryDelayMs: 0,
      sender: async (event) => {
        seen.push(event);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      id: buildThumbnailEventId(request),
      name: "pdf/thumbnail.requested",
      data: request,
    });
  });

  it("retries transient failures and then succeeds", async () => {
    let calls = 0;
    const seenIds: string[] = [];
    await enqueuePdfThumbnail(request, {
      attempts: 3,
      retryDelayMs: 0,
      attemptId: "attempt-1",
      sender: async (event) => {
        calls += 1;
        seenIds.push(event.id);
        if (calls < 3) throw new Error("INNGEST_DOWN");
      },
    });
    expect(calls).toBe(3);
    expect(new Set(seenIds).size).toBe(1);
    expect(seenIds[0]).toBe(buildThumbnailEventId({ ...request, attemptId: "attempt-1" }));
  });

  it("never throws after exhausting attempts", async () => {
    let calls = 0;
    await expect(
      enqueuePdfThumbnail(request, {
        attempts: 2,
        retryDelayMs: 0,
        sender: async () => {
          calls += 1;
          throw new Error("INNGEST_DOWN");
        },
      }),
    ).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });
});
