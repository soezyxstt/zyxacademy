const frame = { width: 380, height: 760 } as const;

const sources = {
  student: "components/course/student-documents-view.tsx",
  tutor: "app/(tutor)/tutor/[courseId]/participants/participants-client.tsx",
  admin: "components/admin/users-dashboard.tsx",
  header: "components/page-header.tsx",
  shell: "components/application-shell.tsx",
} as const;

export const layoutFixture = {
  course: "Fisika dasar",
  documents: "Dokumen",
  longTitle: "Dokumen Fisika dasar: Mekanika, termodinamika, dan gelombang",
  back: "Kembali ke kelas",
  open: "Buka dokumen",
  participants: "Peserta",
  users: "Pengguna",
  filter: "Filter",
  apply: "Terapkan filter",
  save: "Simpan",
  reset: "Reset filter",
  loading: "Memuat daftar",
  emptyTitle: "Tidak ada pengguna yang cocok",
  emptyMessage: "Ubah filter untuk menampilkan pengguna.",
  errorTitle: "Daftar pengguna gagal dimuat",
  retry: "Coba lagi",
  rows: [
    { id: "nara", title: "Nara Pratama", subtitle: "nara@example.test", access: "Tutor", status: "Aktif" },
    { id: "sinta", title: "Sinta Ayuningtyas Kusumawardani", subtitle: "sinta@example.test", access: "Murid", status: "Aktif" },
    { id: "bagas", title: "Bagas Mahendra", subtitle: "bagas@example.test", access: "Murid", status: "Ditangguhkan" },
  ],
  materials: [
    { id: "force", title: "Gaya dan hukum Newton", subtitle: "Artikel", access: "", status: "" },
    {
      id: "energy",
      title: "Usaha dan energi pada sistem dengan gaya yang berubah terhadap posisi",
      subtitle: "Diktat",
      access: "",
      status: "",
    },
  ],
  labels: { access: "Peran", status: "Status" },
} as const;

export const layoutCases = [
  { ...frame, id: "shared-ui-shell-back-light", component: "compact-shell", theme: "light", source: sources.student },
  { ...frame, id: "shared-ui-shell-long-title-dark", component: "compact-shell", theme: "dark", source: sources.student },
  { ...frame, id: "shared-ui-shell-slots-light", component: "compact-shell", theme: "light", source: sources.shell },
  { ...frame, id: "shared-ui-header-actions-light", component: "page-header", theme: "light", source: sources.header },
  { ...frame, id: "shared-ui-header-action-states-dark", component: "page-header", theme: "dark", source: sources.admin },
  { ...frame, id: "shared-ui-header-long-title-light", component: "page-header", theme: "light", source: sources.tutor },
  { ...frame, id: "shared-ui-list-filled-light", component: "responsive-list", theme: "light", source: sources.admin },
  { ...frame, id: "shared-ui-list-empty-dark", component: "responsive-list", theme: "dark", source: sources.admin },
  { ...frame, id: "shared-ui-list-error-light", component: "responsive-list", theme: "light", source: sources.admin },
  { ...frame, width: 1024, id: "shared-ui-list-wide-light", component: "responsive-list", theme: "light", source: sources.tutor },
] as const;

export type LayoutFixtureCase = (typeof layoutCases)[number];
export type LayoutCaseId = LayoutFixtureCase["id"];
