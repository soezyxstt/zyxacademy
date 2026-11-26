import type { PublicLink } from "./directory";

const community: PublicLink = {
  id: "community", category: null, icon: null, color: null,
  title: "Komunitas mahasiswa", description: null, url: "https://example.org/community",
};
export const directoryCases = {
  empty: { theme: "light", locale: "id", links: [] },
  single: { theme: "light", locale: "en", links: [community] },
  grouped: {
    theme: "dark", locale: "id", links: [
      { ...community, category: "Komunitas", icon: "📚", color: "brand" },
      { ...community, id: "materials", title: "Materi dan jadwal pertemuan untuk mahasiswa baru",
        url: "https://example.org/materials", description: "Jadwal kegiatan semester ini.", color: "info", icon: "📅" },
    ],
  },
} satisfies Record<string, { theme: "dark" | "light"; locale: "id" | "en"; links: PublicLink[] }>;

export function getDirectoryCase(id: string) {
  return Object.hasOwn(directoryCases, id) ? directoryCases[id as keyof typeof directoryCases] : null;
}
