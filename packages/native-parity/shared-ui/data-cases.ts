const frame = { width: 380, height: 760 } as const;

const cards = [
  { id: "mechanics", title: "Mekanika", caption: "12 materi" },
  { id: "thermodynamics", title: "Termodinamika", caption: "8 materi" },
  { id: "waves", title: "Gelombang", caption: "6 materi" },
] as const;

const rows = [
  { id: "nara", name: "Nara Pratama", concepts: "Gerak lurus, momentum", lastActive: "Hari ini" },
  { id: "sinta", name: "Sinta Dewi", concepts: "Kesetimbangan termal", lastActive: "Kemarin" },
  {
    id: "maya",
    name: "Maya Ayuningtyas Kusumawardani",
    concepts: "Hubungan perubahan entalpi dengan perpindahan kalor pada sistem tertutup",
    lastActive: "Minggu lalu",
  },
] as const;

const week = [
  { id: "2026-03-02", weekday: "Sen", day: "2", label: "Senin, 2 Maret 2026" },
  { id: "2026-03-03", weekday: "Sel", day: "3", label: "Selasa, 3 Maret 2026" },
  { id: "2026-03-04", weekday: "Rab", day: "4", label: "Rabu, 4 Maret 2026" },
  { id: "2026-03-05", weekday: "Kam", day: "5", label: "Kamis, 5 Maret 2026" },
  { id: "2026-03-06", weekday: "Jum", day: "6", label: "Jumat, 6 Maret 2026" },
  { id: "2026-03-07", weekday: "Sab", day: "7", label: "Sabtu, 7 Maret 2026" },
  { id: "2026-03-08", weekday: "Min", day: "8", label: "Minggu, 8 Maret 2026" },
] as const;

export const dataCalendarPeriods = [
  { label: "2–8 Mar 2026", days: week },
  {
    label: "9–15 Mar 2026",
    days: [
      { id: "2026-03-09", weekday: "Sen", day: "9", label: "Senin, 9 Maret 2026" },
      { id: "2026-03-10", weekday: "Sel", day: "10", label: "Selasa, 10 Maret 2026" },
      { id: "2026-03-11", weekday: "Rab", day: "11", label: "Rabu, 11 Maret 2026" },
      { id: "2026-03-12", weekday: "Kam", day: "12", label: "Kamis, 12 Maret 2026" },
      { id: "2026-03-13", weekday: "Jum", day: "13", label: "Jumat, 13 Maret 2026" },
      { id: "2026-03-14", weekday: "Sab", day: "14", label: "Sabtu, 14 Maret 2026" },
      { id: "2026-03-15", weekday: "Min", day: "15", label: "Minggu, 15 Maret 2026" },
    ],
  },
] as const;

const events = [
  {
    id: "momentum",
    dateId: "2026-03-04",
    title: "Tutorial momentum",
    caption: "09.00–10.00 WIB · Daring",
    detail: "Tinjau hukum kekekalan momentum dan contoh tumbukan.",
  },
] as const;

export const dataLabels = {
  table: {
    empty: "Belum ada peserta yang perlu ditinjau.",
    name: "Peserta",
    concepts: "Konsep yang menurun",
    lastActive: "Terakhir aktif",
  },
  calendar: {
    previous: "Minggu sebelumnya",
    next: "Minggu berikutnya",
    empty: "Tidak ada jadwal pada tanggal ini.",
    today: "Hari ini",
  },
  pagination: {
    previous: "Halaman sebelumnya",
    next: "Halaman berikutnya",
    busy: "Memuat halaman…",
  },
} as const;

export const dataCases = [
  { ...frame, id: "shared-ui-grid-narrow", component: "grid", theme: "light", cards },
  { ...frame, width: 768, id: "shared-ui-grid-wide", component: "grid", theme: "light", cards },
  {
    ...frame,
    id: "shared-ui-grid-long",
    component: "grid",
    theme: "dark",
    cards: [
      {
        id: "energy",
        title: "Usaha dan energi pada sistem dengan gaya yang berubah terhadap posisi",
        caption: "Pembahasan, contoh soal, dan latihan mandiri",
      },
      cards[0],
    ],
  },
  { ...frame, id: "shared-ui-table-empty", component: "table", theme: "light", rows: [] },
  { ...frame, id: "shared-ui-table-single", component: "table", theme: "light", rows: [rows[2]] },
  { ...frame, width: 768, id: "shared-ui-table-many", component: "table", theme: "dark", rows },
  {
    ...frame, id: "shared-ui-calendar-empty", component: "calendar", theme: "light",
    selectedDateId: week[0].id, selectedEventId: undefined, events: [],
  },
  {
    ...frame, id: "shared-ui-calendar-available", component: "calendar", theme: "light",
    selectedDateId: week[2].id, selectedEventId: undefined, events,
  },
  {
    ...frame, id: "shared-ui-calendar-selected", component: "calendar", theme: "dark",
    selectedDateId: week[2].id, selectedEventId: events[0].id, events,
  },
  { ...frame, id: "shared-ui-pagination-first", component: "pagination", theme: "light", initialPage: 1, pageCount: 3, pending: false },
  { ...frame, id: "shared-ui-pagination-middle", component: "pagination", theme: "light", initialPage: 2, pageCount: 3, pending: false },
  { ...frame, id: "shared-ui-pagination-pending", component: "pagination", theme: "dark", initialPage: 2, pageCount: 5, pending: true },
] as const;

export type DataCase = (typeof dataCases)[number];
