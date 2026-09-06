export function formatReaderTocTitle(title: string): string {
  return title
    .replace(/^Bagian\s+\d+(?:\.\d+)*(?:\s*[:.-])?\s*/i, "")
    .replace(/^\d+(?:\.\d+)*(?:\s*[:.-])?\s+/i, "")
    .trim();
}
