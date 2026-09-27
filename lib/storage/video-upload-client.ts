export interface VideoUploadOptions {
  courseId: string;
  filename?: string;
  onProgress?: (percent: number) => void;
}

export interface VideoUploadResult {
  key: string;
  url: string;
}

const UPLOAD_MAX_RETRIES = 2;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Uploads binary data directly to R2 via presigned PUT URL with progress reporting.
 */
export function putBinaryToPresignedUrl(
  body: Blob | File,
  uploadUrl: string,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  const attemptOnce = () =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl, true);
      xhr.setRequestHeader("Content-Type", contentType);
      if (xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Unggahan ditolak (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("Koneksi terputus saat mengunggah"));
      xhr.onabort = () => reject(new Error("Unggahan dibatalkan"));
      xhr.send(body);
    });

  return (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
      if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
      try {
        await attemptOnce();
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  })();
}

/**
 * Uploads a video file directly to R2 using presigned URL to bypass serverless payload limits.
 */
export async function uploadCourseVideoFile(
  file: File,
  options: VideoUploadOptions
): Promise<VideoUploadResult> {
  const targetFilename = options.filename?.trim() || file.name;
  const mimeType = file.type || "video/mp4";

  try {
    const presignRes = await fetch("/api/videos/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: targetFilename,
        courseId: options.courseId,
        size: file.size,
        mimeType,
        fileType: "video",
      }),
    });

    if (presignRes.ok) {
      const data = (await presignRes.json()) as { key: string; uploadUrl: string; url: string };
      if (data.uploadUrl) {
        await putBinaryToPresignedUrl(file, data.uploadUrl, mimeType, options.onProgress);
        return { key: data.key, url: data.url };
      }
    } else {
      const err = await presignRes.json().catch(() => ({}));
      if (err.error) {
        throw new Error(err.error);
      }
    }
  } catch (error: any) {
    if (error?.message && !error.message.includes("fetch")) {
      throw error;
    }
    console.warn("Presigned video upload attempt failed, trying multipart fallback:", error);
  }

  // Fallback: multipart FormData upload
  const formData = new FormData();
  formData.append("file", file);
  formData.append("courseId", options.courseId);
  formData.append("fileType", "video");
  if (options.filename) formData.append("filename", options.filename);

  const fallbackRes = await fetch("/api/videos/upload", {
    method: "POST",
    body: formData,
  });

  if (!fallbackRes.ok) {
    const errData = await fallbackRes.json().catch(() => ({}));
    throw new Error(errData.error || `Unggahan video gagal (${fallbackRes.status})`);
  }

  return (await fallbackRes.json()) as VideoUploadResult;
}

/**
 * Uploads a thumbnail (captured frame blob or custom image file) to R2.
 */
export async function uploadCourseVideoThumbnail(
  fileOrBlob: File | Blob,
  options: { courseId: string; filename?: string }
): Promise<VideoUploadResult> {
  const filename = options.filename || (fileOrBlob instanceof File ? fileOrBlob.name : "thumbnail.jpg");
  const mimeType = fileOrBlob.type || "image/jpeg";

  try {
    const presignRes = await fetch("/api/videos/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename,
        courseId: options.courseId,
        size: fileOrBlob.size,
        mimeType,
        fileType: "thumbnail",
      }),
    });

    if (presignRes.ok) {
      const data = (await presignRes.json()) as { key: string; uploadUrl: string; url: string };
      if (data.uploadUrl) {
        await putBinaryToPresignedUrl(fileOrBlob, data.uploadUrl, mimeType);
        return { key: data.key, url: data.url };
      }
    }
  } catch (error) {
    console.warn("Presigned thumbnail upload failed, using multipart fallback:", error);
  }

  const formData = new FormData();
  formData.append("file", fileOrBlob, filename);
  formData.append("courseId", options.courseId);
  formData.append("fileType", "thumbnail");

  const res = await fetch("/api/videos/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Gagal mengunggah thumbnail");
  }

  return (await res.json()) as VideoUploadResult;
}
