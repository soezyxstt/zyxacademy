import { putFileToPresignedUrl } from "@/lib/batch-client";

export interface AdminPdfUploadOptions {
  courseId?: string;
  filename?: string;
  onProgress?: (percent: number) => void;
}

export interface AdminPdfUploadResult {
  key: string;
  url: string;
}

/**
 * Uploads an admin PDF file using presigned direct-to-R2 upload to bypass
 * Vercel Serverless Function 4.5 MB request payload limits (HTTP 413).
 * Falls back gracefully to multipart FormData upload if presigning is unsupported.
 */
export async function uploadAdminPdfFile(
  file: File,
  options?: AdminPdfUploadOptions
): Promise<AdminPdfUploadResult> {
  const targetFilename = options?.filename?.trim() || file.name;

  // Try presigned direct upload first
  try {
    const presignRes = await fetch("/api/admin/upload-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: targetFilename,
        courseId: options?.courseId,
      }),
    });

    if (presignRes.ok) {
      const data = (await presignRes.json()) as { key: string; uploadUrl: string; url: string };
      if (data.uploadUrl) {
        await putFileToPresignedUrl(file, data.uploadUrl, options?.onProgress);
        return { key: data.key, url: data.url };
      }
    }
  } catch (error) {
    console.warn("Presigned upload attempt failed, trying multipart fallback:", error);
  }

  // Fallback: multipart FormData upload
  const formData = new FormData();
  formData.append("file", file);
  if (options?.courseId) formData.append("courseId", options.courseId);
  if (options?.filename) formData.append("filename", options.filename);

  const fallbackRes = await fetch("/api/admin/upload-pdf", {
    method: "POST",
    body: formData,
  });

  if (!fallbackRes.ok) {
    const errData = await fallbackRes.json().catch(() => ({}));
    throw new Error(errData.error || `Unggahan PDF gagal (${fallbackRes.status})`);
  }

  return (await fallbackRes.json()) as AdminPdfUploadResult;
}
