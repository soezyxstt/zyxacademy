type FormFileRule = {
  mime: string;
  extensions: readonly string[];
  signature: readonly number[];
  suffixes?: readonly (readonly number[])[];
  suffixOffset?: number;
};

const FORM_FILE_TYPES = [
  { mime: "image/jpeg", extensions: [".jpg", ".jpeg"], signature: [0xff, 0xd8, 0xff] },
  { mime: "image/png", extensions: [".png"], signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/gif", extensions: [".gif"], signature: [0x47, 0x49, 0x46, 0x38], suffixes: [[0x37, 0x61], [0x39, 0x61]] },
  { mime: "image/webp", extensions: [".webp"], signature: [0x52, 0x49, 0x46, 0x46], suffixes: [[0x57, 0x45, 0x42, 0x50]], suffixOffset: 8 },
  { mime: "application/pdf", extensions: [".pdf"], signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
] as const satisfies readonly FormFileRule[];

export const FORM_FILE_MIMES = FORM_FILE_TYPES.map(({ mime }) => mime);
export const FORM_IMAGE_MIMES = FORM_FILE_MIMES.filter((mime) => mime.startsWith("image/"));
export type FormFileMime = (typeof FORM_FILE_MIMES)[number];

function formFileTypes(allowedMimeTypes: unknown): readonly FormFileRule[] {
  if (allowedMimeTypes === undefined) return FORM_FILE_TYPES;
  if (!Array.isArray(allowedMimeTypes)) return [];
  return FORM_FILE_TYPES.filter(({ mime }) => allowedMimeTypes.includes(mime));
}

export function formFileAccept(allowedMimeTypes?: unknown): string {
  return formFileTypes(allowedMimeTypes).flatMap(({ extensions }) => extensions).join(",");
}

export async function detectFormFileMime(file: File, allowedMimeTypes?: unknown): Promise<string | null> {
  const name = file.name.toLowerCase();
  const type = formFileTypes(allowedMimeTypes).find(
    ({ extensions }) => extensions.some((extension) => name.endsWith(extension)),
  );
  if (!type) return null;

  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!type.signature.every((value, index) => bytes[index] === value)) return null;
  if (type.suffixes && !type.suffixes.some((suffix) =>
    suffix.every((value, index) => bytes[(type.suffixOffset ?? type.signature.length) + index] === value),
  )) return null;
  return type.mime;
}
