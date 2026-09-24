import { describe, it, expect, mock } from "bun:test";
import { offloadBase64ImagesToR2, offloadQuestionItemImages } from "@/lib/question-images";
import { storage } from "@/lib/storage";

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
    // Mock storage.upload
    const originalUpload = storage.upload;
    let uploadedKey = "";
    let uploadedMime = "";
    (storage as any).upload = mock(async (file: any, filename: string, mimeType: string, options: any) => {
      uploadedKey = options.key;
      uploadedMime = mimeType;
      return { url: `/api/storage/file/${options.key}`, key: options.key, size: 100 };
    });

    try {
      const base64Data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const input = `Thermal diagram: ![Composite Wall](data:image/png;base64,${base64Data}) Calculate Rtot.`;

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

  it("processes question item with prompt and explanation", async () => {
    const originalUpload = storage.upload;
    (storage as any).upload = mock(async () => {
      return { url: "/api/storage/file/uploaded.png", key: "uploaded.png", size: 50 };
    });

    try {
      const base64 = "AAA=";
      const question = {
        prompt: `Prompt with ![P](data:image/jpeg;base64,${base64})`,
        explanation: `Explanation with ![E](data:image/jpeg;base64,${base64})`,
        options: ["A", "B"],
      };

      const result = await offloadQuestionItemImages(question, {
        courseSlug: "ms3103",
        questionIdentifier: "1",
      });

      expect(result.prompt).not.toContain("data:image/");
      expect(result.explanation).not.toContain("data:image/");
      expect(result.prompt).toContain("/api/storage/file/");
      expect(result.explanation).toContain("/api/storage/file/");
    } finally {
      (storage as any).upload = originalUpload;
    }
  });
});
