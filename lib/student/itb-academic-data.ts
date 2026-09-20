export interface ItbFaculty {
  code: string;
  name: string;
  majors: string[];
}

export const ITB_FACULTIES: ItbFaculty[] = [
  {
    code: "STEI",
    name: "Sekolah Teknik Elektro dan Informatika",
    majors: [
      "TPB STEI (Belum Penjurusan)",
      "Teknik Informatika",
      "Sistem dan Teknologi Informasi",
      "Teknik Elektro",
      "Teknik Tenaga Listrik",
      "Teknik Telekomunikasi",
      "Teknik Biomedis",
    ],
  },
  {
    code: "FMIPA",
    name: "Fakultas Matematika dan Ilmu Pengetahuan Alam",
    majors: [
      "TPB FMIPA (Belum Penjurusan)",
      "Matematika",
      "Fisika",
      "Kimia",
      "Astronomi",
      "Aktuaria",
    ],
  },
  {
    code: "FTI",
    name: "Fakultas Teknologi Industri",
    majors: [
      "TPB FTI (Belum Penjurusan)",
      "Teknik Industri",
      "Manajemen Rekayasa Industri",
      "Teknik Kimia",
      "Teknik Fisika",
      "Teknik Pangan",
      "Teknik Bioenergi dan Kemurgi",
    ],
  },
  {
    code: "FTMD",
    name: "Fakultas Teknik Mesin dan Dirgantara",
    majors: [
      "TPB FTMD (Belum Penjurusan)",
      "Teknik Mesin",
      "Teknik Dirgantara",
      "Teknik Material",
    ],
  },
  {
    code: "FTTM",
    name: "Fakultas Teknik Pertambangan dan Perminyakan",
    majors: [
      "TPB FTTM (Belum Penjurusan)",
      "Teknik Pertambangan",
      "Teknik Perminyakan",
      "Teknik Geofisika",
      "Teknik Metalurgi",
    ],
  },
  {
    code: "FTSL",
    name: "Fakultas Teknik Sipil dan Lingkungan",
    majors: [
      "TPB FTSL (Belum Penjurusan)",
      "Teknik Sipil",
      "Teknik Lingkungan",
      "Rekayasa Tata Kelola Air Terpadu",
      "Rekayasa dan Pengelolaan Sumber Daya Air",
    ],
  },
  {
    code: "FITB",
    name: "Fakultas Ilmu dan Teknologi Kebumian",
    majors: [
      "TPB FITB (Belum Penjurusan)",
      "Teknik Geologi",
      "Teknik Geodesi dan Geomatika",
      "Meteorologi",
      "Oseanografi",
    ],
  },
  {
    code: "SAPPK",
    name: "Sekolah Arsitektur, Perencanaan dan Pengembangan Kebijakan",
    majors: [
      "TPB SAPPK (Belum Penjurusan)",
      "Arsitektur",
      "Perencanaan Wilayah dan Kota",
    ],
  },
  {
    code: "SBM",
    name: "Sekolah Bisnis dan Manajemen",
    majors: [
      "TPB SBM (Belum Penjurusan)",
      "Manajemen",
      "Kewirausahaan",
    ],
  },
  {
    code: "SF",
    name: "Sekolah Farmasi",
    majors: [
      "TPB SF (Belum Penjurusan)",
      "Sains dan Teknologi Farmasi",
      "Farmasi Klinik dan Komunitas",
    ],
  },
  {
    code: "SITH",
    name: "Sekolah Ilmu dan Teknologi Hayati",
    majors: [
      "TPB SITH (Belum Penjurusan)",
      "Biologi",
      "Mikrobiologi",
      "Rekayasa Hayati",
      "Rekayasa Pertanian",
      "Rekayasa Kehutanan",
      "Teknologi Pasca Panen",
    ],
  },
  {
    code: "FSRD",
    name: "Fakultas Seni Rupa dan Desain",
    majors: [
      "TPB FSRD (Belum Penjurusan)",
      "Seni Rupa",
      "Kriya",
      "Desain Komunikasi Visual",
      "Desain Interior",
      "Desain Produk",
    ],
  },
];

/**
 * Returns the list of valid academic majors and study programs for a specific ITB faculty code.
 */
export function getMajorsForFaculty(facultyCode: string): string[] {
  const faculty = ITB_FACULTIES.find((f) => f.code === facultyCode);
  return faculty ? faculty.majors : [];
}

/**
 * Generates a descending range of valid student entry years based on the current calendar year.
 */
export function generateEntryYears(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= currentYear - 6; y--) {
    years.push(y);
  }
  return years;
}

/**
 * Checks whether a student is currently in TPB (Tahap Persiapan Bersama).
 * Returns true if the major explicitly contains "TPB" or the entry year is the current academic year.
 */
export function isTpbStudent(entryYear?: number | null, major?: string | null): boolean {
  if (major && major.toUpperCase().includes("TPB")) {
    return true;
  }
  const currentYear = new Date().getFullYear();
  if (entryYear && entryYear >= currentYear) {
    return true;
  }
  return false;
}
