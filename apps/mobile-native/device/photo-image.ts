export const DRAFT_PHOTO_MAX_EDGE = 2048;
export const DRAFT_PHOTO_MAX_BYTES = 7 * 1024 * 1024;
const inputMaxBytes = 48 * 1024 * 1024;
const inputMaxPixels = 50_000_000;

function localPath(uri: string, ios: boolean): string | null {
  if (!uri.startsWith("file:///") || /[?#]/.test(uri)) return null;
  try {
    const path = decodeURIComponent(uri.slice("file://".length));
    if (/[\\%\u0000-\u001f]/.test(path) || path.split("/").some(part => part === "." || part === "..")) return null;
    return ios && path.startsWith("/private/var/") ? path.slice("/private".length) : path;
  } catch {
    return null;
  }
}

export function isPhotoCacheFile(uri: string, cacheUri: string, ios = false): boolean {
  const path = localPath(uri, ios);
  const cache = localPath(cacheUri, ios)?.replace(/\/+$/, "");
  return Boolean(path && cache && path.startsWith(`${cache}/`) && path.length > cache.length + 1);
}

export type PickerPhoto = {
  uri: string;
  width: number;
  height: number;
  type?: string | null;
  mimeType?: string | null;
};

export type PreparedPhoto = {
  uri: string;
  width: number;
  height: number;
  size: number;
  mimeType: "image/jpeg" | "image/png";
};

export type PhotoImageIssue = "image-size" | "unsupported-image" | "decode";
export type PhotoPreparation = { photo: PreparedPhoto } | { issue: PhotoImageIssue };
export type PhotoOutputPolicy = Readonly<{ format: "jpeg"; maxBytes: number }>;

type PhotoFormat = "jpeg" | "png";
type PhotoResize = { width: number } | { height: number };

type PhotoImageDevice = {
  fileSize(uri: string): number | null;
  discard(uri: string): void;
  render(uri: string, resize: PhotoResize | null): Promise<{
    save(format: PhotoFormat, quality: number): Promise<{ uri: string; width: number; height: number }>;
    release(): void;
  }>;
};

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export async function prepareDraftPhoto(asset: PickerPhoto, device: PhotoImageDevice, policy?: PhotoOutputPolicy): Promise<PhotoPreparation> {
  const { uri, width, height, mimeType, type } = asset;
  if ((type && type !== "image") || (mimeType && !mimeType.toLowerCase().startsWith("image/"))) {
    return { issue: "unsupported-image" };
  }
  if (!positiveInteger(width) || !positiveInteger(height)) return { issue: "decode" };
  const longestEdge = Math.max(width, height);
  const resize = longestEdge > DRAFT_PHOTO_MAX_EDGE
    ? (width >= height ? { width: DRAFT_PHOTO_MAX_EDGE } : { height: DRAFT_PHOTO_MAX_EDGE })
    : null;

  try {
    const inputSize = device.fileSize(uri);
    if (!positiveInteger(inputSize)) return { issue: "decode" };
    if (inputSize > inputMaxBytes || width * height > inputMaxPixels) return { issue: "image-size" };

    const rendered = await device.render(uri, resize);
    try {
      const formats: PhotoFormat[] = policy?.format !== "jpeg" && mimeType?.toLowerCase() === "image/png" ? ["png", "jpeg", "jpeg"] : ["jpeg", "jpeg"];
      const maxBytes = Math.min(policy?.maxBytes ?? DRAFT_PHOTO_MAX_BYTES, DRAFT_PHOTO_MAX_BYTES);
      for (const [index, format] of formats.entries()) {
        const quality = index === formats.length - 1 ? 0.7 : 0.86;
        const output = await rendered.save(format, quality);
        let keep = false;
        try {
          if (!positiveInteger(output.width) || !positiveInteger(output.height)
            || Math.max(output.width, output.height) > DRAFT_PHOTO_MAX_EDGE) return { issue: "image-size" };
          const size = device.fileSize(output.uri);
          if (!positiveInteger(size)) return { issue: "decode" };
          if (size <= maxBytes) {
            keep = true;
            return { photo: { ...output, size, mimeType: format === "jpeg" ? "image/jpeg" : "image/png" } };
          }
        } finally {
          if (!keep) device.discard(output.uri);
        }
      }
      return { issue: "image-size" };
    } finally {
      rendered.release();
    }
  } catch {
    return { issue: "decode" };
  }
}
