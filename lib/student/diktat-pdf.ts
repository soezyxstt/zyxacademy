import { canAccessCourseContent, type CourseAccessResult } from "@/lib/student/course-access";
import { extractStorageKey, isSafeKey, slugifySegment } from "@/lib/storage/keys";

export type DiktatPdfSource =
  | { kind: "storage"; key: string }
  | { kind: "external-url"; url: string };

export type DiktatPdfChapterScope =
  | { kind: "canonical"; chapterIds: readonly (string | null | undefined)[] }
  | { kind: "legacy"; chapterIds: readonly (string | null | undefined)[] };

const EXTERNAL_FILE_HOSTS = new Set(["utfs.io", "uploadthing.com"]);

function isExternalHostedFileUrl(raw: string): string | null {
  if (!/^https:\/\//i.test(raw)) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (EXTERNAL_FILE_HOSTS.has(host) || host.endsWith(".ufs.sh") || host.endsWith(".utfs.io")) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveDiktatPdfSource(rawValue: string | null | undefined): DiktatPdfSource | null {
  const trimmed = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!trimmed) return null;

  const externalHostedUrl = isExternalHostedFileUrl(trimmed);
  if (externalHostedUrl) {
    return { kind: "external-url", url: externalHostedUrl };
  }

  const extractedKey = extractStorageKey(trimmed);
  if (extractedKey && isSafeKey(extractedKey)) {
    return { kind: "storage", key: extractedKey };
  }

  if (/^https:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "https:") {
        return { kind: "external-url", url: parsed.toString() };
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Canonical diktats belong to a single bab that may carry both a canonical ID
 * and a legacy chapter ID. Allowing either alias prevents false 403s when the
 * caller's chapter scope was resolved from only one identifier space. Legacy
 * compiled diktats can span multiple distinct chapters, so every listed chapter
 * must remain within the caller's allowed scope.
 */
export function canAccessDiktatPdf(
  access: CourseAccessResult,
  scope: DiktatPdfChapterScope,
): boolean {
  if (scope.kind === "canonical") {
    const aliases = [...new Set(
      scope.chapterIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean),
    )];
    if (aliases.length === 0) return false;
    return aliases.some((chapterId) => canAccessCourseContent(access, "diktat", [chapterId]));
  }

  return canAccessCourseContent(access, "diktat", scope.chapterIds);
}

export async function downloadDiktatPdfBytes(
  source: DiktatPdfSource,
  deps: {
    downloadFromStorage?: (key: string) => Promise<Uint8Array>;
    fetchExternal?: (url: string) => Promise<Response>;
  },
): Promise<Uint8Array> {
  if (source.kind === "storage") {
    if (typeof deps.downloadFromStorage !== "function") {
      throw new Error("DIKTAT_STORAGE_UNAVAILABLE");
    }
    return deps.downloadFromStorage(source.key);
  }

  const fetchImpl = deps.fetchExternal ?? ((url: string) => fetch(url, { cache: "no-store" }));
  const response = await fetchImpl(source.url);
  if (!response.ok) {
    throw new Error(`DIKTAT_EXTERNAL_FETCH_FAILED:${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export function buildDiktatPdfResponse(
  bytes: Uint8Array,
  title: string,
  wantsDownload: boolean,
): Response {
  const disposition = wantsDownload ? "attachment" : "inline";
  const filename = `${slugifySegment(title, "diktat")}.pdf`;
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
