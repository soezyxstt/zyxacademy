export const siteName = "Zyx Academy";

export const siteDescription =
  "Tutorial dan pembelajaran untuk mahasiswa ITB tahun pertama dan kedua, materi, kuis, dan pendampingan yang terstruktur.";

export function pageTitle(segment?: string) {
  if (!segment) return siteName;
  return `${segment} · ${siteName}`;
}
