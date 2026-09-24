import { describe, it, expect, mock } from "bun:test";
import { offloadBase64ImagesToR2, offloadQuestionItemImages } from "@/lib/question-images";
import { storage } from "@/lib/storage";

const VALID_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const VALID_JPEG_BASE64 = "/9j/4AAQSkZJRg==";

describe("offloadBase64ImagesToR2", () => {
  it("returns text untouched when no base64 images are present", async () => {
    const input = "What is the heat flux through the wall? $q = -k \\frac{dT}{dx}$";
    const result = await offloadBase64ImagesToR2(input, { courseSlug: "ms3103" });
    expect(result).toBe(input);
  });

  it("returns text untouched when images are already remote URLs", async () => {
    const input = "Diagram: ![Circuit](/api/storage/file/courses/ms3103/questions/c1.png)";
    const result = await offloadBase64ImagesToR2(input, { courseSlug: "ms3103" });
    expect(result).toBe(input);
  });

  it("extracts base64 image, uploads to R2 and replaces with storage proxy URL", async () => {
    const originalUpload = storage.upload;
    let uploadedKey = "";
    let uploadedMime = "";
    (storage as any).upload = mock(async (_file: any, _filename: string, mimeType: string, options: any) => {
      uploadedKey = options.key;
      uploadedMime = mimeType;
      return { url: `/api/storage/file/${options.key}`, key: options.key, size: 100 };
    });

    try {
      const input = `Thermal diagram: ![Composite Wall](data:image/png;base64,${VALID_PNG_BASE64}) Calculate Rtot.`;

      const result = await offloadBase64ImagesToR2(input, {
        courseSlug: "ms3103",
        questionIdentifier: "soal-3",
      });

      expect(uploadedKey).toContain("courses/ms3103/questions/question-soal-3/");
      expect(uploadedKey).toEndWith(".png");
      expect(uploadedMime).toBe("image/png");
      expect(result).toContain("![Composite Wall](/api/storage/file/courses/ms3103/questions/question-soal-3/");
      expect(result).not.toContain("data:image/png;base64");
    } finally {
      (storage as any).upload = originalUpload;
    }
  });

  it("skips payloads that do not match declared image magic bytes", async () => {
    const corruptedBase64 = "AAA="; // 0x00 0x00 0x00, invalid header
    const input = `Broken image: ![Corrupted](data:image/jpeg;base64,${corruptedBase64})`;

    const result = await offloadBase64ImagesToR2(input, {
      courseSlug: "ms3103",
      questionIdentifier: "soal-corrupt",
    });

    // Leaves corrupted data URI intact without crashing or uploading
    expect(result).toBe(input);
  });

  it("rejects SVG data URIs to prevent XML/XSS injection", async () => {
    const svgBase64 = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><circle r='10'/></svg>").toString("base64");
    const input = `SVG vector: ![Icon](data:image/svg+xml;base64,${svgBase64})`;

    const result = await offloadBase64ImagesToR2(input, {
      courseSlug: "ms3103",
    });

    // Unmatched by regex, remains as is
    expect(result).toBe(input);
  });

  it("preserves alt text containing dollar signs ($) and special replacement tokens", async () => {
    const originalUpload = storage.upload;
    (storage as any).upload = mock(async (_file: any, _filename: string, _mime: string, options: any) => {
      return { url: `/api/storage/file/${options.key}`, key: options.key, size: 50 };
    });

    try {
      const input = `Diagram: ![Formula $R_{tot} = 100$ and price $1](data:image/png;base64,${VALID_PNG_BASE64})`;
      const result = await offloadBase64ImagesToR2(input, { courseSlug: "ms3103" });

      expect(result).toContain("![Formula $R_{tot} = 100$ and price $1](/api/storage/file/");
    } finally {
      (storage as any).upload = originalUpload;
    }
  });

  it("processes question item with prompt, explanation, and string options", async () => {
    const originalUpload = storage.upload;
    (storage as any).upload = mock(async (_file: any, _filename: string, _mime: string, options: any) => {
      return { url: `/api/storage/file/${options.key}`, key: options.key, size: 50 };
    });

    try {
      const question = {
        prompt: `Prompt with ![P](data:image/jpeg;base64,${VALID_JPEG_BASE64})`,
        explanation: `Explanation with ![E](data:image/jpeg;base64,${VALID_JPEG_BASE64})`,
        options: [
          `Option A with ![OA](data:image/png;base64,${VALID_PNG_BASE64})`,
          "Option B plain",
        ],
      };

      const result = await offloadQuestionItemImages(question, {
        courseSlug: "ms3103",
        questionIdentifier: "1",
      });

      expect(result.prompt).not.toContain("data:image/");
      expect(result.explanation).not.toContain("data:image/");
      expect(result.prompt).toContain("/api/storage/file/");
      expect(result.explanation).toContain("/api/storage/file/");
      expect((result.options as string[])[0]).toContain("/api/storage/file/");
      expect((result.options as string[])[1]).toBe("Option B plain");
    } finally {
      (storage as any).upload = originalUpload;
    }
  });

  it("processes question item with object options (optionsSnapshot shape)", async () => {
    const originalUpload = storage.upload;
    (storage as any).upload = mock(async (_file: any, _filename: string, _mime: string, options: any) => {
      return { url: `/api/storage/file/${options.key}`, key: options.key, size: 50 };
    });

    try {
      const question = {
        prompt: "Identify the correct circuit diagram:",
        explanation: null,
        options: [
          { id: "opt-1", text: `Diagram A: ![DA](data:image/png;base64,${VALID_PNG_BASE64})`, isCorrect: true },
          { id: "opt-2", text: "Diagram B: none", isCorrect: false },
        ],
      };

      const result = await offloadQuestionItemImages(question, {
        courseSlug: "ms3103",
        questionIdentifier: "circuit-q",
      });

      const options = result.options as Array<{ id: string; text: string; isCorrect: boolean }>;
      expect(options[0].text).toContain("/api/storage/file/");
      expect(options[0].text).not.toContain("data:image/png;base64");
      expect(options[0].isCorrect).toBe(true);
      expect(options[1].text).toBe("Diagram B: none");
    } finally {
      (storage as any).upload = originalUpload;
    }
  });
});
