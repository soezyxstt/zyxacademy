import {
  HASH_WORKER_THRESHOLD_BYTES,
  UPLOAD_MAX_RETRIES,
} from "@/lib/course-batch-upload";

let workerUrl: string | null = null;

function getHashWorkerUrl(): string | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return null;
  }
  if (!workerUrl) {
    const source = `
self.onmessage = async (event) => {
  try {
    const buffer = await event.data.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
    self.postMessage({ ok: true, hex });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};`;
    workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  }
  return workerUrl;
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

/** SHA-256 checksum, off the main thread for files above the threshold. */
export async function hashFileSha256(file: File): Promise<string> {
  const useWorker = file.size > HASH_WORKER_THRESHOLD_BYTES;
  const url = useWorker ? getHashWorkerUrl() : null;

  if (url) {
    try {
      return await new Promise<string>((resolve, reject) => {
        const worker = new Worker(url);
        worker.onmessage = (event: MessageEvent) => {
          const data = event.data as { ok: boolean; hex?: string; error?: string };
          if (data.ok && data.hex) resolve(data.hex);
          else reject(new Error(data.error || "Gagal menghitung checksum"));
          worker.terminate();
        };
        worker.onerror = () => {
          reject(new Error("Worker checksum gagal"));
          worker.terminate();
        };
        worker.postMessage(file);
      });
    } catch {
      // fall through to main-thread hashing
    }
  }

  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bufferToHex(digest);
}

/** Runs tasks with a fixed-size concurrency pool. */
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await task(items[index]);
    }
  });
  await Promise.all(workers);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * PUT binary straight to R2 via presigned URL with progress reporting and
 * exponential backoff retry.
 */
export function putFileToPresignedUrl(
  file: File,
  uploadUrl: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  const attemptOnce = () =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl, true);
      xhr.setRequestHeader("Content-Type", "application/pdf");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Unggahan ditolak (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("Koneksi terputus saat mengunggah"));
      xhr.onabort = () => reject(new Error("Unggahan dibatalkan"));
      xhr.send(file);
    });

  return (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
      if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
      try {
        await attemptOnce();
        onProgress?.(100);
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Unggahan gagal");
  })();
}
