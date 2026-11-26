export const sharedUiControlFixture = {
  search: {
    label: "Cari pertanyaan",
    clear: "Hapus pencarian",
    close: "Tutup pencarian",
  },
  status: {
    loading: "Memuat pertanyaan",
    empty: "Belum ada pertanyaan",
    description: "Pertanyaan baru akan muncul di sini.",
    create: "Buat pertanyaan",
    error: "Pertanyaan gagal dimuat",
    retry: "Coba lagi",
    recovered: "3 pertanyaan dimuat",
  },
  toolbar: {
    label: "Kontrol daftar pertanyaan",
    channels: "Semua kanal",
    create: "Pertanyaan baru",
    level: "Semua tingkat kesulitan",
    size: "25 soal per halaman",
    export: "Ekspor laporan pertanyaan",
    refresh: "Muat ulang",
  },
  composer: {
    placeholder: "Tulis balasan…",
    send: "Kirim",
    attachmentTool: "Tambahkan gambar",
    attachment: "grafik.png",
    remove: "Hapus grafik.png",
    error: "Balasan belum terkirim.",
    retry: "Coba lagi",
    sent: "Balasan terkirim",
  },
} as const;

export const sharedUiControlCases = [
  { id: "shared-ui-search-collapsed", component: "search", theme: "light", expanded: false, value: "", loading: false },
  { id: "shared-ui-search-query", component: "search", theme: "dark", expanded: true, value: "Gelombang", loading: false },
  { id: "shared-ui-search-loading", component: "search", theme: "light", expanded: true, value: "Energi", loading: true },
  { id: "shared-ui-status-loading", component: "status", theme: "light", kind: "loading" },
  { id: "shared-ui-status-empty", component: "status", theme: "dark", kind: "empty" },
  { id: "shared-ui-status-recovery", component: "status", theme: "light", kind: "error" },
  { id: "shared-ui-toolbar-compact", component: "toolbar", theme: "light", variant: "compact" },
  { id: "shared-ui-toolbar-wrap", component: "toolbar", theme: "dark", variant: "wrap" },
  { id: "shared-ui-toolbar-pending", component: "toolbar", theme: "light", variant: "pending" },
  { id: "shared-ui-composer-empty", component: "composer", theme: "light", draft: "", attachment: false, error: false },
  { id: "shared-ui-composer-attachment", component: "composer", theme: "dark", draft: "Coba periksa langkah kedua.", attachment: true, error: false },
  { id: "shared-ui-composer-recovery", component: "composer", theme: "light", draft: "Bagaimana menentukan periode gelombang?", attachment: false, error: true },
] as const;

export type SharedUiControlCase = (typeof sharedUiControlCases)[number];
export type SharedUiControlCaseId = SharedUiControlCase["id"];
