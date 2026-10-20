import { createHash } from "node:crypto";
import { describe, expect, it } from "bun:test";
import { strToU8, zipSync } from "fflate";
import {
  AUTHORING_MCP_MAX_STORED_BLOB_BYTES,
  assertStoredSourceFileInScope,
  classifyStoredPdfError,
  listStoredSourceFiles,
  listStoredReferenceFiles,
  getStoredReferenceSourceFile,
  loadStoredOriginals,
  mergeSourceOriginals,
  parseStoredPdfPages,
  readStoredSourceFile,
  type SourceFileDependencies,
  type StoredSourceFileRow,
  type StoredSourceScope,
} from "@/lib/authoring/mcp-source-files";
import {
  assertMcpSourceScopeBinding,
  ingestMcpSourcePack,
  issueMcpSourceFileKey,
  readMcpSourceFileKey,
  readMcpSourcePackBinding,
} from "@/lib/authoring/mcp-workflows";
import { formatSourceFileReadResult } from "@/lib/authoring/mcp-server";

process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-for-stored-source-files";

const scope: StoredSourceScope = {
  courseId: "canonical-course",
  chapterId: "canonical-chapter",
  legacyCourseId: "legacy-course",
  legacyChapterId: "legacy-chapter",
};

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function row(overrides: Partial<StoredSourceFileRow> = {}): StoredSourceFileRow {
  return {
    id: "material-1",
    courseId: scope.legacyCourseId,
    title: "Materi Vektor",
    type: "materi_kelas",
    subcategory: "catatan",
    year: 2026,
    fileUrl: "courses/legacy-course/materials/1000-abcdef12-materi.pdf",
    checksum: null,
    chapterIds: [scope.legacyChapterId, "legacy-chapter-2"],
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    ...overrides,
  };
}

function tokenFor(value: StoredSourceFileRow, tokenScope: StoredSourceScope = scope) {
  return issueMcpSourceFileKey({
    materialId: value.id,
    storageKey: value.fileUrl,
    courseId: tokenScope.courseId,
    chapterId: tokenScope.chapterId,
    legacyCourseId: tokenScope.legacyCourseId,
    legacyChapterId: tokenScope.legacyChapterId,
    updatedAtMs: new Date(value.updatedAt).getTime(),
    checksum: value.checksum,
  });
}

function dependencies(
  rows: StoredSourceFileRow[],
  overrides: Partial<SourceFileDependencies> = {},
): SourceFileDependencies {
  const byId = new Map(rows.map((item) => [item.id, item]));
  return {
    resolveScope: async () => scope,
    listRows: async () => rows,
    getRow: async (materialId) => byId.get(materialId) ?? null,
    download: async () => strToU8("stored pdf bytes"),
    parsePages: async (_bytes, pages) => ({
      totalPages: 8,
      pages: pages.map((pageNumber) => ({
        pageNumber,
        text: pageNumber === 1 ? "" : `Teks halaman ${pageNumber}`,
        png: new Uint8Array([137, 80, 78, 71]),
        width: 1280,
        height: 1810,
      })),
    }),
    issueFileKey: issueMcpSourceFileKey,
    readFileKey: readMcpSourceFileKey,
    ...overrides,
  };
}

function sourcePack(original: Uint8Array): Uint8Array {
  const markdown = strToU8("<!-- source-unit: 1 -->\n# Vektor\nBesaran memiliki arah.\n");
  const coverage = {
    documentId: "source-doc-001",
    status: "complete",
    expectedUnits: 1,
    processedUnits: [1],
    inventory: { headings: 1, formulas: 0, tables: 0, examples: 0, applications: 0, visuals: 0, questions: 0, solutions: 0 },
    outputCounts: { headings: 1, formulas: 0, tables: 0, examples: 0, applications: 0, visualExplanations: 0, questions: 0, solutions: 0 },
    unresolved: [],
    reviewPasses: ["inventory", "transcription", "visual", "reconciliation"],
  };
  const manifest = {
    schemaVersion: "zyx-source-pack.v1",
    packId: "source-pack-stored-pdf",
    name: "Stored PDF",
    language: "id",
    createdAt: "2026-08-28T00:00:00.000Z",
    generator: { provider: "google", model: "test", promptVersion: "stored-source.v1" },
    documents: [{
      id: "source-doc-001",
      title: "Materi Vektor",
      originalFilename: "materi.pdf",
      originalMediaType: "application/pdf",
      originalSha256: digest(original),
      role: "material",
      unitKind: "page",
      expectedUnits: 1,
      markdownPath: "documents/001-materi.md",
      coveragePath: "coverage/source-doc-001.json",
      markdownSha256: digest(markdown),
    }],
  };
  return zipSync({
    "manifest.json": strToU8(`${JSON.stringify(manifest)}\n`),
    "documents/001-materi.md": markdown,
    "coverage/source-doc-001.json": strToU8(`${JSON.stringify(coverage)}\n`),
  });
}

describe("stored Source Pack file catalog", () => {
  it("lists every eligible category for the selected legacy chapter without exposing IDs or R2 keys", async () => {
    const rows = [
      row(),
      row({ id: "material-2", title: "Latihan", type: "contoh_soal", fileUrl: "courses/legacy-course/materials/1001-abcdef12-soal.PDF" }),
      row({ id: "material-other-chapter", chapterIds: ["legacy-chapter-9"] }),
      row({ id: "material-other-course", courseId: "another-course" }),
      row({ id: "material-external", fileUrl: "https://example.com/file.pdf" }),
      row({ id: "material-unsafe", fileUrl: "courses/legacy-course/materials/../secret.pdf" }),
    ];
    const result = await listStoredSourceFiles({ courseKey: "course", chapterKey: "chapter" }, dependencies(rows));
    expect(result.total).toBe(2);
    expect(result.files.map((file) => file.category)).toEqual(["materi", "soal"]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("material-1");
    expect(serialized).not.toContain("courses/legacy-course/materials");
    expect(readMcpSourceFileKey(result.files[0]!.fileKey).materialId).toBe("material-1");
  });

  it("filters categories and paginates with an opaque cursor", async () => {
    const rows = [
      row(),
      row({ id: "material-2", title: "Soal", type: "soal", fileUrl: "courses/legacy-course/materials/1001-abcdef12-soal.pdf" }),
      row({ id: "material-3", title: "Pembahasan", type: "pembahasan_soal", fileUrl: "courses/legacy-course/materials/1002-abcdef12-bahas.pdf" }),
    ];
    const deps = dependencies(rows);
    const filtered = await listStoredSourceFiles({ courseKey: "course", chapterKey: "chapter", categories: ["soal"] }, deps);
    expect(filtered.files.map((file) => file.title)).toEqual(["Soal"]);
    const first = await listStoredSourceFiles({ courseKey: "course", chapterKey: "chapter", limit: 1 }, deps);
    expect(first.files).toHaveLength(1);
    expect(first.nextCursor).toBeString();
    const second = await listStoredSourceFiles({ courseKey: "course", chapterKey: "chapter", limit: 1, cursor: first.nextCursor! }, deps);
    expect(second.files[0]?.title).toBe("Soal");
    await expect(listStoredSourceFiles({ courseKey: "course", chapterKey: "chapter", cursor: "invalid" }, deps)).rejects.toThrow("AUTHORING_MCP_SOURCE_CURSOR_INVALID");
    await expect(listStoredSourceFiles({ courseKey: "course", chapterKey: "chapter" }, dependencies(rows, {
      resolveScope: async () => { throw new Error("AUTHORING_MCP_LEGACY_CHAPTER_MAPPING_MISSING"); },
    }))).rejects.toThrow("AUTHORING_MCP_LEGACY_CHAPTER_MAPPING_MISSING");
  });
});

describe("historical reference file catalog", () => {
  it("lists only course-scoped question and solution PDFs with opaque course-only keys", async () => {
    const rows = [
      row({ id: "question-pdf", title: "Tutorial Soal", type: "soal", fileUrl: "courses/legacy-course/materials/2000-abcdef12-soal.pdf" }),
      row({ id: "solution-pdf", title: "Pembahasan", type: "pembahasan_soal", fileUrl: "courses/legacy-course/materials/2001-abcdef12-pembahasan.pdf" }),
      row({ id: "course-material", title: "Materi", type: "materi", fileUrl: "courses/legacy-course/materials/2002-abcdef12-materi.pdf" }),
      row({ id: "other-course-question", courseId: "another-course", type: "soal", fileUrl: "courses/another-course/materials/2003-abcdef12-soal.pdf" }),
    ];
    const result = await listStoredReferenceFiles({ courseId: scope.courseId, legacyCourseId: scope.legacyCourseId }, dependencies(rows));
    expect(result.total).toBe(2);
    expect(result.files.map((file) => file.category)).toEqual(["soal", "pembahasan_soal"]);
    expect(result.files.every((file) => file.pageCount === null)).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("question-pdf");
    expect(serialized).not.toContain("courses/legacy-course/materials");
    const token = readMcpSourceFileKey(result.files[0]!.fileKey);
    expect(token.courseId).toBe(scope.courseId);
    expect(token.chapterId).toBeUndefined();
    const resolved = await getStoredReferenceSourceFile(result.files[0]!.fileKey, dependencies(rows));
    expect(resolved.metadata.category).toBe("soal");
    expect(resolved.metadata.pageCount).toBe(8);

    const resolvedSolution = await getStoredReferenceSourceFile(result.files[1]!.fileKey, dependencies(rows));
    expect(resolvedSolution.metadata.category).toBe("pembahasan_soal");
    expect(resolvedSolution.metadata.pageCount).toBe(8);
    expect(resolvedSolution.metadata.extractedText).toContain("<!-- source page 2 -->");
    expect(resolvedSolution.metadata.extractedText).toContain("Teks halaman 8");
  });
});

describe("stored PDF reading", () => {
  it("returns requested page text and images, including an image-only scanned page, with exact byte size and SHA-256 checksum", async () => {
    const rawPdfBytes = strToU8("stored pdf bytes");
    const expectedSize = rawPdfBytes.byteLength;
    const expectedSha256 = digest(rawPdfBytes);

    // Even when DB row has null checksum or a legacy storage path in checksum, read_file computes exact size & SHA-256 from bytes
    const material = row({ checksum: "courses/legacy-course/materials/1000-abcdef12-materi.pdf" });
    const listRes = await listStoredSourceFiles({ courseKey: "course", chapterKey: "chapter" }, dependencies([material]));
    expect(listRes.files[0]?.checksum).toBeNull(); // Legacy storage path must be sanitized to null in listings

    const result = await readStoredSourceFile({ fileKey: tokenFor(material), pages: [1, 2] }, dependencies([material]));
    expect(result.mode).toBe("pages");
    if (result.mode !== "pages") throw new Error("expected pages mode");
    expect(result.totalPages).toBe(8);
    expect(result.size).toBe(expectedSize);
    expect(result.checksum).toBe(expectedSha256);
    expect(result.pages[0]).toMatchObject({ pageNumber: 1, text: "", width: 1280 });
    expect(result.pages[0]?.png.byteLength).toBeGreaterThan(0);
    expect(result.pages[1]?.text).toBe("Teks halaman 2");
    const uploads: string[] = [];
    const response = await formatSourceFileReadResult(result, {
      upload: async (_bytes, _filename, _mime, options) => {
        uploads.push(options.key);
        return { key: options.key, url: options.key, size: 4 };
      },
      getUrl: (key) => `/api/storage/file/${key}`,
    });
    expect(response.structuredContent.size).toBe(expectedSize);
    expect(response.structuredContent.checksum).toBe(expectedSha256);
    expect(response.content[0]).toMatchObject({ type: "text" });
    expect(response.content).toHaveLength(3);
    expect(response.content.slice(1)).toMatchObject([
      { type: "resource_link", mimeType: "image/png", name: "Sumber: Materi Vektor, halaman PDF 1" },
      { type: "resource_link", mimeType: "image/png" },
    ]);
    expect(JSON.stringify(response.content)).not.toContain('"type":"image"');
    expect(uploads).toHaveLength(2);
    expect(uploads[0]).toStartWith(`courses/legacy-course/source-images/material-1/${expectedSha256}/page-1-`);
    expect(response.structuredContent.pages).toMatchObject([
      { imageUrl: new URL(`/api/storage/file/${uploads[0]}`, process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").href, citation: { title: "Materi Vektor", pageNumber: 1, label: "Sumber: Materi Vektor, halaman PDF 1" } },
      { imageUrl: new URL(`/api/storage/file/${uploads[1]}`, process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").href, citation: { pageNumber: 2 } },
    ]);
    await expect(formatSourceFileReadResult(result, {
      upload: async () => { throw new Error("upload failed"); },
      getUrl: (key) => key,
    })).rejects.toThrow("upload failed");
    const cachedResponse = await formatSourceFileReadResult(result, {
      exists: async () => true,
      upload: async () => { throw new Error("existing images must not be uploaded again"); },
      getUrl: (key) => `/api/storage/file/${key}`,
    });
    expect(cachedResponse.structuredContent.pages).toEqual(response.structuredContent.pages);
  });

  it("rejects invalid pages, stale associations, missing rows, and unsupported downloads", async () => {
    const material = row();
    const deps = dependencies([material]);
    await expect(readStoredSourceFile({ fileKey: tokenFor(material), pages: [1, 1] }, deps)).rejects.toThrow("AUTHORING_MCP_SOURCE_PAGE_INVALID");
    await expect(readStoredSourceFile({ fileKey: tokenFor(material), pages: [9] }, deps)).rejects.toThrow("AUTHORING_MCP_SOURCE_PAGE_INVALID");
    expect(() => assertStoredSourceFileInScope(row({ updatedAt: new Date("2026-08-29T00:00:00.000Z") }), readMcpSourceFileKey(tokenFor(material))))
      .toThrow("AUTHORING_MCP_SOURCE_FILE_STALE");
    expect(() => assertStoredSourceFileInScope(row({ fileUrl: "courses/legacy-course/materials/moved.pdf" }), readMcpSourceFileKey(tokenFor(material))))
      .toThrow("AUTHORING_MCP_SOURCE_FILE_NOT_IN_SCOPE");
    expect(() => assertStoredSourceFileInScope(row({ chapterIds: ["another-chapter"] }), readMcpSourceFileKey(tokenFor(material))))
      .toThrow("AUTHORING_MCP_SOURCE_FILE_NOT_IN_SCOPE");
    expect(() => assertStoredSourceFileInScope(row({ courseId: "another-course" }), readMcpSourceFileKey(tokenFor(material))))
      .toThrow("AUTHORING_MCP_SOURCE_FILE_NOT_IN_SCOPE");
    const unsafe = row({ fileUrl: "courses/legacy-course/materials/../secret.pdf" });
    await expect(readStoredSourceFile({ fileKey: tokenFor(unsafe) }, dependencies([unsafe]))).rejects.toThrow("AUTHORING_MCP_SOURCE_FILE_UNAVAILABLE");
    await expect(readStoredSourceFile({ fileKey: tokenFor(material) }, dependencies([]))).rejects.toThrow("AUTHORING_MCP_SOURCE_FILE_NOT_FOUND");
    await expect(readStoredSourceFile({ fileKey: tokenFor(material) }, dependencies([material], {
      download: async () => { throw new Error("AUTHORING_MCP_SOURCE_DOWNLOAD_UNSUPPORTED"); },
    }))).rejects.toThrow("AUTHORING_MCP_SOURCE_DOWNLOAD_UNSUPPORTED");
    const checksumRow = row({ checksum: "a".repeat(64) });
    await expect(readStoredSourceFile({ fileKey: tokenFor(checksumRow) }, dependencies([checksumRow]))).rejects.toThrow("AUTHORING_MCP_SOURCE_FILE_CHECKSUM_MISMATCH");
  });

  it("supports explicit blob fallback and enforces its smaller response limit", async () => {
    const material = row();
    const blob = await readStoredSourceFile({ fileKey: tokenFor(material), mode: "blob" }, dependencies([material]));
    expect(blob.mode).toBe("blob");
    if (blob.mode !== "blob") throw new Error("expected blob mode");
    expect(blob.bytes).toEqual(strToU8("stored pdf bytes"));
    expect((await formatSourceFileReadResult(blob)).content[1]).toMatchObject({
      type: "resource",
      resource: { mimeType: "application/pdf", blob: Buffer.from(blob.bytes).toString("base64") },
    });

    const oversized = new Uint8Array(AUTHORING_MCP_MAX_STORED_BLOB_BYTES + 1);
    await expect(readStoredSourceFile({ fileKey: tokenFor(material), mode: "blob" }, dependencies([material], {
      download: async () => oversized,
    }))).rejects.toThrow("AUTHORING_MCP_SOURCE_BLOB_SIZE_LIMIT");
    const atBlobLimit = new Uint8Array(AUTHORING_MCP_MAX_STORED_BLOB_BYTES);
    const boundary = await readStoredSourceFile({ fileKey: tokenFor(material), mode: "blob" }, dependencies([material], {
      download: async () => atBlobLimit,
    }));
    expect(boundary.size).toBe(AUTHORING_MCP_MAX_STORED_BLOB_BYTES);
    const overStoredLimit = new Uint8Array(50 * 1024 * 1024 + 1);
    await expect(readStoredSourceFile({ fileKey: tokenFor(material), mode: "pages" }, dependencies([material], {
      download: async () => overStoredLimit,
    }))).rejects.toThrow("AUTHORING_MCP_SOURCE_FILE_SIZE_LIMIT");
  });

  it("classifies corrupt and password-protected parser failures", () => {
    expect(classifyStoredPdfError(new Error("broken xref"))).toBe("AUTHORING_MCP_SOURCE_PDF_INVALID");
    const password = new Error("Password required");
    password.name = "PasswordException";
    expect(classifyStoredPdfError(password)).toBe("AUTHORING_MCP_SOURCE_PDF_PASSWORD_REQUIRED");
  });

  it("propagates corrupt and password-protected page parsing failures", async () => {
    const material = row();
    await expect(readStoredSourceFile({ fileKey: tokenFor(material) }, dependencies([material], {
      parsePages: async () => { throw new Error("AUTHORING_MCP_SOURCE_PDF_INVALID"); },
    }))).rejects.toThrow("AUTHORING_MCP_SOURCE_PDF_INVALID");
    await expect(readStoredSourceFile({ fileKey: tokenFor(material) }, dependencies([material], {
      parsePages: async () => { throw new Error("AUTHORING_MCP_SOURCE_PDF_PASSWORD_REQUIRED"); },
    }))).rejects.toThrow("AUTHORING_MCP_SOURCE_PDF_PASSWORD_REQUIRED");
    await expect(readStoredSourceFile({ fileKey: tokenFor(material) }, dependencies([material], {
      download: async () => { throw new Error("AUTHORING_MCP_SOURCE_FILE_DOWNLOAD_FAILED"); },
    }))).rejects.toThrow("AUTHORING_MCP_SOURCE_FILE_DOWNLOAD_FAILED");
  });

  it("computes real byte size and SHA-256 checksum when offloading page reading to COMPUTE_SERVICE_URL and sanitizes storage-path checksums", async () => {
    const pdfBytes = strToU8("stored pdf bytes with seven pages");
    const expectedSha = digest(pdfBytes);
    const legacyPathRow = row({
      id: "material-legacy-checksum",
      checksum: "courses/legacy-course/materials/1000-abcdef12-bab1.pdf",
    });
    const validShaRow = row({
      id: "material-valid-checksum",
      checksum: expectedSha,
    });

    const listed = await listStoredSourceFiles(
      { courseKey: "course-key", chapterKey: "chapter-key" },
      dependencies([legacyPathRow, validShaRow]),
    );
    const legacyItem = listed.files.find((f) => f.checksum === null);
    const validItem = listed.files.find((f) => f.checksum === expectedSha);
    expect(legacyItem).toBeDefined();
    expect(validItem).toBeDefined();
    expect(JSON.stringify(listed)).not.toContain("courses/legacy-course");

    const prevComputeUrl = process.env.COMPUTE_SERVICE_URL;
    const prevInternalSecret = process.env.COMPUTE_INTERNAL_SECRET;
    const prevFetch = globalThis.fetch;
    process.env.COMPUTE_SERVICE_URL = "http://compute.internal.test";
    process.env.COMPUTE_INTERNAL_SECRET = "compute-secret-test";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          totalPages: 7,
          pages: [
            {
              pageNumber: 1,
              text: "Halaman 1 dari compute",
              width: 1200,
              height: 1600,
              imageBase64: Buffer.from([137, 80, 78, 71]).toString("base64"),
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    try {
      const readRes = await readStoredSourceFile(
        { fileKey: tokenFor(legacyPathRow), mode: "pages", pages: [1] },
        dependencies([legacyPathRow], {
          download: async () => pdfBytes,
          parsePages: parseStoredPdfPages,
        }),
      );
      expect(readRes.mode).toBe("pages");
      expect(readRes.size).toBe(pdfBytes.byteLength);
      expect(readRes.size).toBeGreaterThan(0);
      expect(readRes.checksum).toBe(expectedSha);

      const formatted = await formatSourceFileReadResult(readRes, {
        upload: async (_bytes, _filename, _mime, options) => ({ key: options.key, url: options.key, size: 4 }),
        getUrl: (key) => `/api/storage/file/${key}`,
      });
      expect(formatted.structuredContent.size).toBe(pdfBytes.byteLength);
      expect(formatted.structuredContent.checksum).toBe(expectedSha);
    } finally {
      if (prevComputeUrl === undefined) delete process.env.COMPUTE_SERVICE_URL;
      else process.env.COMPUTE_SERVICE_URL = prevComputeUrl;
      if (prevInternalSecret === undefined) delete process.env.COMPUTE_INTERNAL_SECRET;
      else process.env.COMPUTE_INTERNAL_SECRET = prevInternalSecret;
      globalThis.fetch = prevFetch;
    }
  });
});

describe("stored original verification and scope binding", () => {
  it("encrypts file token payloads and expires them after one hour", () => {
    const material = row();
    const fileKey = tokenFor(material);
    const encodedBody = fileKey.split(".")[0]!;
    const signedPayload = Buffer.from(encodedBody, "base64url").toString("utf8");
    expect(signedPayload).not.toContain(material.id);
    expect(signedPayload).not.toContain(scope.legacyCourseId);
    expect(readMcpSourceFileKey(fileKey).materialId).toBe(material.id);

    const originalNow = Date.now;
    Date.now = () => originalNow() + 61 * 60 * 1000;
    try {
      expect(() => readMcpSourceFileKey(fileKey)).toThrow("AUTHORING_MCP_TOKEN_EXPIRED");
    } finally {
      Date.now = originalNow;
    }
  });

  it("loads same-scope stored originals, rejects duplicate documents and mixed scopes", async () => {
    const first = row();
    const second = row({ id: "material-2", fileUrl: "courses/legacy-course/materials/1001-abcdef12-soal.pdf" });
    const deps = dependencies([first, second]);
    const loaded = await loadStoredOriginals([
      { documentId: "source-doc-001", fileKey: tokenFor(first) },
      { documentId: "source-doc-002", fileKey: tokenFor(second) },
    ], deps);
    expect([...loaded.originals.keys()]).toEqual(["source-doc-001", "source-doc-002"]);
    expect(loaded.boundScope).toEqual({ courseId: scope.courseId, chapterId: scope.chapterId });

    await expect(loadStoredOriginals([
      { documentId: "source-doc-001", fileKey: tokenFor(first) },
      { documentId: "source-doc-001", fileKey: tokenFor(second) },
    ], deps)).rejects.toThrow("SOURCE_PACK_ORIGINAL_DOCUMENT_DUPLICATE");

    const otherScope = { ...scope, chapterId: "canonical-chapter-2", legacyChapterId: "legacy-chapter-2" };
    await expect(loadStoredOriginals([
      { documentId: "source-doc-001", fileKey: tokenFor(first) },
      { documentId: "source-doc-002", fileKey: tokenFor(second, otherScope) },
    ], deps)).rejects.toThrow("AUTHORING_MCP_SOURCE_FILE_SCOPE_MISMATCH");
  });

  it("merges local and stored originals while rejecting cross-mode duplicates and aggregate overflow", () => {
    const stored = {
      originals: new Map([["stored", new Uint8Array([1])]]),
      boundScope: { courseId: scope.courseId, chapterId: scope.chapterId },
      totalBytes: 1,
    };
    const mixed = mergeSourceOriginals(new Map([["local", new Uint8Array([2])]]), stored);
    expect([...mixed.originals!.keys()]).toEqual(["local", "stored"]);
    expect(() => mergeSourceOriginals(new Map([["stored", new Uint8Array([2])]]), stored)).toThrow("SOURCE_PACK_ORIGINAL_DOCUMENT_DUPLICATE");
    expect(() => mergeSourceOriginals(new Map([["local", new Uint8Array(96 * 1024 * 1024)]]), stored)).toThrow("AUTHORING_MCP_ORIGINALS_LIMIT");
  });

  it("issues a scope-bound Source Pack token after stored checksum verification", () => {
    const original = strToU8("stored pdf bytes");
    const pack = sourcePack(original);
    const result = ingestMcpSourcePack(
      "stored-source-pack.zip",
      Buffer.from(pack).toString("base64"),
      new Map([["source-doc-001", original]]),
      { courseId: scope.courseId, chapterId: scope.chapterId },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected valid Source Pack");
    expect(readMcpSourcePackBinding(result.sourcePackToken)).toEqual({
      courseId: scope.courseId,
      chapterId: scope.chapterId,
    });
    expect(() => assertMcpSourceScopeBinding(readMcpSourcePackBinding(result.sourcePackToken), {
      courseId: scope.courseId,
      chapterId: "another-chapter",
    })).toThrow("AUTHORING_MCP_SOURCE_SCOPE_MISMATCH");
    expect(() => assertMcpSourceScopeBinding({}, {
      courseId: "any-course",
      chapterId: "any-chapter",
    })).not.toThrow();

    const localOnly = ingestMcpSourcePack(
      "local-source-pack.zip",
      Buffer.from(pack).toString("base64"),
      new Map([["source-doc-001", original]]),
    );
    expect(localOnly.ok).toBe(true);
    if (!localOnly.ok) throw new Error("expected valid local Source Pack");
    expect(readMcpSourcePackBinding(localOnly.sourcePackToken)).toEqual({ courseId: undefined, chapterId: undefined });
  });
});
