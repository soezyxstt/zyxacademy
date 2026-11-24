export type OpsAiPresetCategory = "ask" | "action";

export type OpsAiPresetIcon =
  | "compass"
  | "layout"
  | "analytics"
  | "user-check"
  | "book-check"
  | "key"
  | "layers"
  | "form"
  | "article"
  | "calendar";

export interface OpsAiPreset {
  id: string;
  label: string;
  prompt: string;
  category: OpsAiPresetCategory;
  icon: OpsAiPresetIcon;
  /** Prefer read-only "ask" mode or action-ready "edit" mode when clicked. */
  recommendedMode?: "ask" | "edit";
}

export const CAPABILITY_OVERVIEW_PRESET: OpsAiPreset = {
  id: "capabilities",
  label: "Apa saja yang bisa dibantu Ops AI?",
  prompt: "Apa saja yang bisa dibantu Zyx Ops AI di halaman admin?",
  category: "ask",
  icon: "compass",
};

export const OPS_AI_PRESETS: OpsAiPreset[] = [
  {
    id: "explain-page",
    label: "Jelaskan fitur halaman ini",
    prompt: "Jelaskan fitur dan fungsi halaman admin yang sedang saya buka saat ini.",
    category: "ask",
    icon: "layout",
  },
  {
    id: "analytics-overview",
    label: "Cek ringkasan data dan status sistem",
    prompt: "Tampilkan ringkasan data pengguna, mata kuliah, feature flags, dan status job aktif.",
    category: "ask",
    icon: "analytics",
  },
  {
    id: "diagnose-student",
    label: "Diagnosa kendala akses siswa",
    prompt: "Bantu saya mendiagnosa kendala akses siswa. Tanyakan nama atau email siswa yang perlu diperiksa.",
    category: "ask",
    icon: "user-check",
  },
  {
    id: "audit-course",
    label: "Audit kelengkapan mata kuliah",
    prompt: "Bantu saya mengaudit kelengkapan bab, materi, dan soal pada mata kuliah. Tanyakan mata kuliah mana yang ingin diperiksa.",
    category: "ask",
    icon: "book-check",
  },
  {
    id: "create-token",
    label: "Buat token aktivasi kelompok",
    prompt: "Bantu saya membuat token aktivasi kelompok baru. Tanyakan mata kuliah, kapasitas kuota, dan paket yang dibutuhkan.",
    category: "action",
    icon: "key",
    recommendedMode: "edit",
  },
  {
    id: "manage-curriculum",
    label: "Susun bab atau rapikan materi kuliah",
    prompt: "Bantu saya menambah daftar bab baru atau memperbarui metadata berkas materi pada sebuah mata kuliah.",
    category: "action",
    icon: "layers",
    recommendedMode: "edit",
  },
  {
    id: "manage-forms",
    label: "Buat atau ubah formulir dan preset",
    prompt: "Bantu saya melihat daftar formulir, membuat formulir baru, atau mengubah preset formulir.",
    category: "action",
    icon: "form",
    recommendedMode: "edit",
  },
  {
    id: "manage-blog",
    label: "Buat atau edit draf artikel blog",
    prompt: "Bantu saya menyiapkan draf artikel blog baru atau mengedit draf yang sudah ada.",
    category: "action",
    icon: "article",
    recommendedMode: "edit",
  },
  {
    id: "manage-schedule-links",
    label: "Kelola jadwal, kelompok, atau tautan",
    prompt: "Bantu saya mengelola jadwal sesi tutorial, kelompok belajar, atau membuat shortlink baru. Tanyakan mana yang ingin dikerjakan.",
    category: "action",
    icon: "calendar",
    recommendedMode: "edit",
  },
];

const ROUTE_CONTEXT_MAP: Array<{
  match: RegExp;
  pageLabel: string;
  preset: OpsAiPreset;
}> = [
  {
    match: /^\/admin\/courses/,
    pageLabel: "Mata Kuliah",
    preset: {
      id: "route-courses",
      label: "Audit kelengkapan bab dan materi di sini",
      prompt: "Bantu saya memeriksa mata kuliah, mengaudit kelengkapan bab dan materi, atau menyusun bab baru.",
      category: "action",
      icon: "book-check",
      recommendedMode: "edit",
    },
  },
  {
    match: /^\/admin\/users/,
    pageLabel: "Pengguna",
    preset: {
      id: "route-users",
      label: "Diagnosa akses atau cari data siswa",
      prompt: "Bantu saya mencari pengguna atau mendiagnosa kendala akses siswa. Tanyakan nama atau email yang perlu dicek.",
      category: "ask",
      icon: "user-check",
    },
  },
  {
    match: /^\/admin\/tokens/,
    pageLabel: "Token Aktivasi",
    preset: {
      id: "route-tokens",
      label: "Buat atau cek sisa kuota token aktivasi",
      prompt: "Bantu saya mengecek token aktivasi yang ada atau menyiapkan pembuatan token kelompok baru.",
      category: "action",
      icon: "key",
      recommendedMode: "edit",
    },
  },
  {
    match: /^\/admin\/groups/,
    pageLabel: "Kelompok Belajar",
    preset: {
      id: "route-groups",
      label: "Kelola kelompok belajar dan kuota anggota",
      prompt: "Bantu saya memeriksa daftar kelompok belajar, menambah anggota, atau menyesuaikan kuota kelompok.",
      category: "action",
      icon: "layers",
      recommendedMode: "edit",
    },
  },
  {
    match: /^\/admin\/schedules/,
    pageLabel: "Jadwal",
    preset: {
      id: "route-schedules",
      label: "Cek atau buat jadwal sesi tutorial",
      prompt: "Bantu saya melihat jadwal sesi tutorial terdekat atau menyiapkan jadwal baru.",
      category: "action",
      icon: "calendar",
      recommendedMode: "edit",
    },
  },
  {
    match: /^\/admin\/forms/,
    pageLabel: "Formulir",
    preset: {
      id: "route-forms",
      label: "Cek formulir, preset, dan ringkasan respons",
      prompt: "Bantu saya melihat daftar formulir, meringkas respons, atau membuat formulir baru.",
      category: "action",
      icon: "form",
      recommendedMode: "edit",
    },
  },
  {
    match: /^\/admin\/blog/,
    pageLabel: "Blog",
    preset: {
      id: "route-blog",
      label: "Buat atau perbarui draf artikel blog",
      prompt: "Bantu saya melihat daftar artikel blog, membuat draf baru, atau mengedit draf artikel.",
      category: "action",
      icon: "article",
      recommendedMode: "edit",
    },
  },
  {
    match: /^\/admin\/analytics/,
    pageLabel: "Analitik",
    preset: {
      id: "route-analytics",
      label: "Ringkas performa dan tren mata kuliah",
      prompt: "Tampilkan ringkasan analitik pengguna dan performa mata kuliah saat ini.",
      category: "ask",
      icon: "analytics",
    },
  },
  {
    match: /^\/admin\/ops/,
    pageLabel: "Operasional",
    preset: {
      id: "route-ops",
      label: "Cek status job dan feature flags aktif",
      prompt: "Periksa status job latar belakang terbaru dan daftar feature flags yang sedang aktif.",
      category: "ask",
      icon: "analytics",
    },
  },
];

export function getAdminRouteContext(pathname?: string | null): {
  pageLabel: string;
  routePreset: OpsAiPreset | null;
} {
  if (!pathname) {
    return { pageLabel: "Dashboard Admin", routePreset: null };
  }
  const matched = ROUTE_CONTEXT_MAP.find((entry) => entry.match.test(pathname));
  if (matched) {
    return { pageLabel: matched.pageLabel, routePreset: matched.preset };
  }
  return { pageLabel: "Dashboard Admin", routePreset: null };
}
