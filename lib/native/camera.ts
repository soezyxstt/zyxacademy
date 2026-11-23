/**
 * lib/native/camera.ts
 *
 * Native camera capture (Capacitor) and client-side image downscaling so
 * high-megapixel phone camera photos always pass server dimension and byte limits.
 */

import {
  clearPendingCameraCapture,
  decodeBase64ToImageFile,
  savePendingCameraCapture,
  type CameraRecoveryTargetInput,
} from "./camera-recovery";
import { getCapacitor } from "./runtime";

const DEFAULT_MAX_EDGE = 2048;
const DEFAULT_MAX_BYTES = 7 * 1024 * 1024;
const DEFAULT_QUALITY = 0.86;

export function hasNativeCameraBridge(): boolean {
  return Boolean(getCapacitor()?.Plugins?.Camera);
}

/**
 * Opens the native camera when running inside Capacitor.
 * Persists optional recovery context before launching so Android OS process kills
 * can route `appRestoredResult` back to the originating composer.
 * Returns null if the user cancels or if native camera is unavailable.
 */
export async function captureNativeQuestionPhoto(
  recoveryTarget?: CameraRecoveryTargetInput,
): Promise<File | null> {
  const camera = getCapacitor()?.Plugins?.Camera;
  if (!camera) return null;

  if (recoveryTarget) {
    savePendingCameraCapture(recoveryTarget);
  }

  try {
    const photo = await camera.getPhoto({
      source: "CAMERA",
      resultType: "base64",
      quality: 85,
      width: DEFAULT_MAX_EDGE,
      height: DEFAULT_MAX_EDGE,
      correctOrientation: true,
      saveToGallery: false,
    });
    if (!photo.base64String) return null;
    const file = decodeBase64ToImageFile(photo.base64String, photo.format ?? "jpeg");
    return downscaleImageFile(file);
  } catch {
    // Cancellation or permission denial should fail quietly without breaking the composer.
    return null;
  } finally {
    if (recoveryTarget) {
      clearPendingCameraCapture();
    }
  }
}

/**
 * Downscales oversized camera photos (for example 12MP to 48MP mobile shots)
 * to stay safely under the server 4096 px edge, 16 MP, and 8 MiB limits.
 */
export async function downscaleImageFile(
  file: File,
  options?: { maxEdge?: number; maxBytes?: number; quality?: number },
): Promise<File> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return file;
  }
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    return file;
  }

  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const quality = options?.quality ?? DEFAULT_QUALITY;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("image_decode_failed"));
      element.src = objectUrl;
    });

    const longestEdge = Math.max(img.naturalWidth, img.naturalHeight);
    if (longestEdge <= maxEdge && file.size <= maxBytes) {
      return file;
    }

    const scale = longestEdge > maxEdge ? maxEdge / longestEdge : 1;
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const outputType = file.type === "image/png" && file.size <= maxBytes ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputType, quality);
    });
    if (!blob || blob.size === 0) return file;

    const nextName =
      outputType === "image/jpeg" && !/\.jpe?g$/i.test(file.name)
        ? `${file.name.replace(/\.[^.]+$/, "")}.jpg`
        : file.name;

    return new File([blob], nextName, {
      type: outputType,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareQuestionImageFiles(files: readonly File[]): Promise<File[]> {
  return Promise.all(files.map((file) => downscaleImageFile(file)));
}
