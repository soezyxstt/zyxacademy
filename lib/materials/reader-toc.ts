export function formatReaderTocTitle(title: string): string {
  return title
    .replace(/^Bagian\s+\d+(?:\.\d+)*(?:\s*[:.-])?\s*/i, "")
    .replace(/^\d+(?:\.\d+)*(?:\s*[:.-])?\s+/i, "")
    .trim();
}

export function resolveReaderBlockTitle(title: string | null | undefined, fallback: string, sectionTitle: string): string | null {
  const label = title?.trim() || fallback;
  if (label === sectionTitle || ["Penjelasan", "Representasi Konseptual", "Representasi Matematis", "Rumus", "Rumus dan syarat", "Simbol, syarat, dan makna"].includes(label)) return null;
  return label === "Penjelasan inti" ? "Teori" : label;
}
