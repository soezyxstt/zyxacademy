export function formAttachmentUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const rawParts = value.split(/[?#]/, 1)[0].split("/").map(decodeURIComponent);
    if (rawParts.some((part) => part === "." || part === ".." || /[\\/]/.test(part))) return null;
    const url = new URL(value, "https://storage.invalid");
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const prefix = "/api/storage/file/";
    if (!/^https?:\/\//i.test(value) && !value.startsWith(prefix)) return null;
    const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname.slice(1);
    const parts = path.split("/").map(decodeURIComponent);
    if (parts[0] !== "forms" || parts.length < 3 || parts.some((part) => !part || part === "." || part === ".." || /[\\/]/.test(part))) return null;
    return value;
  } catch {
    return null;
  }
}

export function formAttachmentExportUrl(value: unknown, appUrl: string): string | null {
  const href = formAttachmentUrl(value);
  return href?.startsWith("/") ? new URL(href, appUrl).href : href;
}

export function isFormResponseAttachmentFolder(value: string | undefined): boolean {
  return typeof value === "string" && /^response-[a-f0-9]{40}$/.test(value);
}

/** Resolve a saved attachment into an approved storage key for one answer slot. */
export function protectedFormAttachmentKey(value: unknown, options: {
  origin: string;
  legacyBase?: string;
  folders: readonly string[];
  responseFolder?: string;
  questionIndex: number;
}): string[] | null {
  const href = formAttachmentUrl(value);
  if (!href || !Number.isSafeInteger(options.questionIndex) || options.questionIndex < 0) return null;
  try {
    const url = new URL(href, options.origin);
    if (url.username || url.password) return null;
    const proxy = "/api/storage/file/";
    const legacy = options.legacyBase ? new URL(options.legacyBase) : null;
    const legacyPrefix = legacy ? `${legacy.pathname.replace(/\/+$/, "")}/` : null;
    let path = "";
    if (url.origin === options.origin && url.pathname.startsWith(proxy)) path = url.pathname.slice(proxy.length);
    else if (legacy && legacyPrefix && url.origin === legacy.origin && url.pathname.startsWith(legacyPrefix)) {
      path = url.pathname.slice(legacyPrefix.length);
    }
    const key = path.split("/").map(decodeURIComponent);
    const boundFolder = isFormResponseAttachmentFolder(key[1]);
    const belongsToForm = boundFolder ? key[1] === options.responseFolder : options.folders.includes(key[1]);
    if (key.length !== 4 || key[0] !== "forms" || !belongsToForm ||
      key[2] !== `question-${options.questionIndex + 1}` ||
      key.some(segment => !segment || segment === "." || /[/%\\\x00-\x1f\x7f]/.test(segment) || segment.includes(".."))) return null;
    return key;
  } catch {
    return null;
  }
}

/** Only form storage image paths can be loaded into the native authoring preview. */
export function formQuestionImageProxyPath(value: unknown, origin: string): string | null {
  const href = formAttachmentUrl(value);
  if (!href) return null;
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash) return null;
    const proxy = "/api/storage/file/";
    if (!url.pathname.startsWith(proxy)) return null;
    const parts = url.pathname.slice(proxy.length).split("/").map(decodeURIComponent);
    if (parts.length !== 4 || parts[0] !== "forms" || !/^[a-z0-9-]+$/.test(parts[1]) ||
      isFormResponseAttachmentFolder(parts[1]) || !/^question-\d+$/.test(parts[2]) || !/^[a-z0-9_-]+\.(?:jpe?g|png|webp|gif)$/i.test(parts[3])) return null;
    return proxy + parts.map(encodeURIComponent).join("/");
  } catch { return null; }
}
