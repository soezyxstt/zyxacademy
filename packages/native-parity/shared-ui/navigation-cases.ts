const studentNavLabels = {
  home: "Beranda",
  courses: "Kelas",
  schedule: "Jadwal",
  discuss: "Diskusi",
  me: "Saya",
} as const;

const tutorNavLabels = {
  home: "Beranda",
  schedule: "Jadwal",
  discuss: "Diskusi",
  classes: "Kelas",
} as const;

const adminNavLabels = {
  home: "Beranda",
  courses: "Kelas",
  people: "Pengguna",
  ops: "Ops",
  more: "Lainnya",
} as const;

export const navigationFixture = {
  studentNavLabels,
  tutorNavLabels,
  adminNavLabels,
  navbarLabels: {
    back: "Kembali",
    home: "Dashboard Zyx",
    "switch-course": "Ganti kelas",
    search: "Cari",
    notifications: "Pemberitahuan",
    account: "Akun",
    "ops-ai": "Ops AI",
  },
  tutorCourse: "Dasar Pemrograman dan Penyelesaian Masalah",
  adminTitle: "Tinjau materi",
  adminEditor: { title: "Editor materi", open: "Buka editor" },
  leaderboardTabs: [
    { id: "rank", label: "Rank" },
    { id: "academic", label: "Akademik" },
  ],
  courseTabs: [
    { id: "summary", label: "Ringkasan" },
    { id: "documents", label: "Dokumen" },
    { id: "video", label: "Video" },
    { id: "quiz", label: "Kuis" },
    { id: "flashcard", label: "Flashcard" },
    { id: "progress", label: "Progres dan penguasaan materi" },
  ],
  close: "Tutup",
  more: "Lebih",
  dialog: {
    trigger: "Perubahan jadwal",
    title: "Permohonan perubahan jadwal & pembatalan",
    description: "Perubahan jadwal perlu persetujuan tutor.",
    field: "Alasan permohonan",
    placeholder: "Jelaskan alasan permohonan dan waktu yang diharapkan...",
    error: "Alasan permohonan wajib diisi.",
    submit: "Ajukan permohonan",
    cancel: "Batal",
    success: "Permohonan berhasil diajukan kepada tutor.",
    longReason: "Jadwal usulan bertabrakan dengan jadwal praktikum. Kelompok kami dapat mengikuti sesi dalam waktu pengganti yang tersedia pada akhir pekan.",
  },
  sheet: {
    title: "Daftar isi",
    chapters: [
      "Pendahuluan",
      "Representasi dan tipe data",
      "Percabangan dan perulangan",
      "Perancangan fungsi dan penanganan kesalahan",
      "Pengujian program dan pembacaan keluaran",
      "Latihan mandiri dengan pemantauan hasil",
      "Rangkuman konsep dan istilah penting",
    ],
  },
  popover: {
    title: "Filter",
    field: "Periode",
    options: ["Semua waktu", "Minggu", "Bulan"],
    courseField: "Kelas",
    courses: ["Semua kelas", "Dasar Pemrograman dan Penyelesaian Masalah"],
  },
} as const;

export const navigationCases = [
  { id: "mobile-navbar-student-light", component: "mobile-navbar", theme: "light", role: "student" },
  { id: "mobile-navbar-tutor-light", component: "mobile-navbar", theme: "light", role: "tutor" },
  { id: "mobile-navbar-admin-dark", component: "mobile-navbar", theme: "dark", role: "admin" },
  { id: "bottom-navigation-student-light", component: "bottom-navigation", theme: "light", role: "student" },
  { id: "bottom-navigation-tutor-light", component: "bottom-navigation", theme: "light", role: "tutor" },
  { id: "bottom-navigation-admin-dark", component: "bottom-navigation", theme: "dark", role: "admin" },
  { id: "navigation-tabs-first-light", component: "navigation-tabs", theme: "light", active: "rank" },
  { id: "navigation-tabs-academic-dark", component: "navigation-tabs", theme: "dark", active: "academic" },
  { id: "navigation-tabs-overflow-light", component: "navigation-tabs", theme: "light", active: "progress" },
  { id: "shared-dialog-closed-light", component: "shared-dialog", theme: "light", open: false },
  { id: "shared-dialog-validation-light", component: "shared-dialog", theme: "light", open: true },
  { id: "shared-dialog-long-dark", component: "shared-dialog", theme: "dark", open: true },
  { id: "shared-sheet-closed-light", component: "shared-sheet", theme: "light", open: false },
  { id: "shared-sheet-outline-light", component: "shared-sheet", theme: "light", open: true },
  { id: "shared-sheet-back-dark", component: "shared-sheet", theme: "dark", open: true },
  { id: "shared-popover-closed-light", component: "shared-popover", theme: "light", open: false },
  { id: "shared-popover-filters-light", component: "shared-popover", theme: "light", open: true },
  { id: "shared-popover-long-dark", component: "shared-popover", theme: "dark", open: true },
] as const;

export type NavigationFixtureCase = (typeof navigationCases)[number];
export type NavigationCaseId = NavigationFixtureCase["id"];
