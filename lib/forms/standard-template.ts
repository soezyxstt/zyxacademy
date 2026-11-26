import type { CreateCustomQuestionInput } from "../google-forms";

export const createStandardFormQuestions = (): CreateCustomQuestionInput[] => [
  { title: "Nama Lengkap (Short Answer)", type: "TEXT", required: true },
  { title: "Saran & Masukan (Paragraph)", type: "PARAGRAPH", required: false },
  { title: "Peminatan Matkul (Multiple Choice)", type: "RADIO", options: ["Matematika", "Fisika", "Kimia"], required: true },
  { title: "Fasilitas Diinginkan (Checkboxes)", type: "CHECKBOX", options: ["Diktat PDF", "Video Rekaman", "Gmeet Live"], required: true },
  { title: "Pilih Angkatan (Dropdown)", type: "DROP_DOWN", options: ["TPB 2024", "TPB 2025", "Lainnya"], required: true },
  { title: "Unggah Berkas / Dokumen (File Upload)", type: "FILE_UPLOAD", required: false },
  { title: "Skala Penilaian Pembelajaran (Linear Scale)", type: "SCALE", scaleLow: 1, scaleHigh: 5, scaleLowLabel: "Kurang", scaleHighLabel: "Baik", required: true },
  { title: "Rating Pengajar (Rating Bintang)", type: "RATING", required: true },
  { title: "Matrix Kinerja (Multiple Choice Grid)", type: "GRID_RADIO", gridRows: ["Penguasaan Materi", "Kerapihan Slide"], gridColumns: ["Cukup", "Baik", "Sangat Baik"], required: true },
  { title: "Matrix Keahlian (Checkbox Grid)", type: "GRID_CHECKBOX", gridRows: ["Dasar", "Lanjut"], gridColumns: ["Teori", "Praktek"], required: true },
  { title: "Tanggal Pengisian (Date)", type: "DATE", required: true },
  { title: "Jam Kehadiran (Time)", type: "TIME", required: true },
];
