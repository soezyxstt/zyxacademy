export type MediaKind = "image" | "video" | "audio" | "pdf" | "markdown" | "text" | "other";

export type MediaFile = {
  key: string;
  name: string;
  folderPath: string;
  size: number;
  lastModified: string;
  kind: MediaKind;
  url: string;
};

export type MediaFolder = {
  name: string;
  path: string;
};

export type MediaTreeNode = {
  name: string;
  path: string;
  children: MediaTreeNode[];
};

export type MediaListing = {
  path: string;
  folders: MediaFolder[];
  files: MediaFile[];
  tree: MediaTreeNode[];
};

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  flac: "audio/flac",
  aac: "audio/aac",
  pdf: "application/pdf",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  log: "text/plain",
  json: "application/json",
  ts: "text/typescript",
  tsx: "text/plain",
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  html: "text/html",
  xml: "text/xml",
};

const MARKDOWN_EXTS = new Set(["md", "markdown"]);
const TEXT_EXTS = new Set(["txt", "csv", "log", "json", "ts", "tsx", "js", "mjs", "css", "html", "xml"]);

export const MEDIA_MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export const MEDIA_ACCEPT_ATTR = [
  "image/*",
  "video/*",
  "audio/*",
  "application/pdf",
  ".md",
  ".markdown",
  ".txt",
  ".csv",
  ".log",
  ".json",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".css",
  ".html",
  ".xml",
].join(",");

export function extOf(nameOrKey: string): string {
  const leaf = nameOrKey.split("/").filter(Boolean).pop() || nameOrKey;
  const dot = leaf.lastIndexOf(".");
  return dot > 0 ? leaf.slice(dot + 1).toLowerCase() : "";
}

export function mimeFromKey(key: string): string {
  const ext = extOf(key);
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

export function kindFromKey(key: string): MediaKind {
  const mime = mimeFromKey(key);
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const ext = extOf(key);
  if (ext === "pdf") return "pdf";
  if (MARKDOWN_EXTS.has(ext)) return "markdown";
  if (TEXT_EXTS.has(ext)) return "text";
  return "other";
}

export function isFolderMarkerKey(key: string): boolean {
  const leaf = key.split("/").filter(Boolean).pop() || "";
  return leaf === ".keep";
}

export function normalizeFolderPath(path?: string | null): string {
  return (path || "")
    .split("/")
    .map((seg) => seg.trim())
    .filter(Boolean)
    .join("/");
}

export function folderPathOfKey(key: string): string {
  const parts = key.split("/").filter(Boolean);
  return parts.slice(1, -1).join("/");
}

export function parentFolderPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}

export function storageFolderPathOfKey(key: string): string {
  const parts = key.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}

export const STORAGE_DOMAIN_LABELS: Record<string, string> = {
  courses: "Course materials",
  blog: "Blog media",
  pka: "PKA follow proofs",
  forms: "Form uploads",
  overhaul: "Bundle & authoring artifacts",
  uploads: "Generic uploads",
  legacy: "Legacy drive files",
};

export function baseFolderName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

export function buildFolderTree(paths: string[]): MediaTreeNode[] {
  const root: MediaTreeNode[] = [];
  const nodes = new Map<string, MediaTreeNode>();
  const sorted = [...new Set(paths.filter(Boolean))].sort();

  for (const path of sorted) {
    const segments = path.split("/");
    let list = root;
    let acc = "";
    for (const segment of segments) {
      acc = acc ? `${acc}/${segment}` : segment;
      let node = nodes.get(acc);
      if (!node) {
        node = { name: segment, path: acc, children: [] };
        nodes.set(acc, node);
        list.push(node);
      }
      list = node.children;
    }
  }

  const sortNodes = (nodesList: MediaTreeNode[]) => {
    nodesList.sort((a, b) => a.name.localeCompare(b.name));
    nodesList.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root);

  return root;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v < 10 && u > 0 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}
