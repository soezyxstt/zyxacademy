# File Naming Conventions and Directory Hierarchy

Dokumen ini adalah standar resmi penamaan berkas dan struktur direktori untuk tim admin, tutor, dan sistem *ingestion* Zyx Academy. Standar ini memastikan seluruh berkas materi, latihan, dan evaluasi terorganisasi secara konsisten, mudah dicari, dan otomatis berurutan secara kronologis.

---

## 1. Prinsip Utama

1. **Tahun dan Periode di Akhir**: Penempatan tahun di akhir nama file menjaga nama topik tetap terkelompok rapi saat diurutkan secara alfabetis, sekaligus memudahkan komparasi edisi materi antar-tahun.
2. **Deterministik dan Terurut (*Sort-Friendly*)**: Menggunakan dua digit angka untuk bab (`bab01`, `bab02`, ..., `bab12`) agar urutan tidak berantakan di sistem operasi atau *object storage*.
3. **Format Karakter Aman**: Hanya gunakan huruf kecil (`a-z`), angka (`0-9`), garis bawah (`_`) sebagai pemisah segmen utama, dan tanda hubung (`-`) sebagai pemisah kata dalam satu segmen.
4. **Bebas Karakter Ilegal**: Dilarang menggunakan spasi, tanda kurung, aksen, tanda petik, dan em dash atau en dash. Gunakan tanda hubung tunggal (`-`), koma, atau titik dua standar.
5. **Hierarki Mengikuti Domain Zyx**:
   `[Mata Kuliah / Course] -> [Bab / Topik] -> [Kategori] -> [Tahun / Semester]`

---

## 2. Struktur Formula Nama File

Format baku penamaan file adalah:

```text
[KODE_MK]_[BAB]_[KATEGORI]_[DESKRIPSI]_[ROLE]_[TAHUN-SEMESTER].[ext]
```

### Penjelasan Segmen

| Posisi | Segmen | Status | Format / Contoh | Penjelasan |
|---|---|---|---|---|
| 1 | `KODE_MK` | Wajib | `ma1101`, `fi1101`, `ki1001` | Kode resmi mata kuliah (huruf kecil). |
| 2 | `BAB` | Wajib jika spesifik bab | `bab01`, `bab02`, `modul03`, `general` | Dua digit angka untuk menjamin urutan sorting. |
| 3 | `KATEGORI` | Wajib | `materi`, `diktat`, `tutorial`, `kuis`, `uts`, `uas` | Jenis atau klasifikasi dokumen. |
| 4 | `DESKRIPSI` | Kondisional | `limit-kontinu`, `hukum-newton`, `paket-a` | Topik spesifik (kebab-case). |
| 5 | `ROLE` | Kondisional | `soal`, `solusi`, `pembahasan`, `slide` | Pembeda lembar soal dan kunci jawaban. |
| 6 | `TAHUN-SEMESTER` | Wajib | `2024-sem1`, `2025-sem2`, `2026-sp`, `2025` | Tahun akademik dan periode semester. |

---

## 3. Taksonomi Kategori dan Role

### Kategori Dokumen (`KATEGORI`)

- **Materi Pembelajaran (*Learning Content*)**:
  - `materi`: Slide presentasi dosen atau handout kuliah.
  - `diktat`: Diktat bab, modul komprehensif, atau kompilasi teori.
  - `catatan`: Catatan tutor, *cheatsheet*, atau rangkuman rumus.
  - `silabus`: Satuan Acara Perkuliahan (SAP) atau RPS.
- **Latihan & Pembelajaran Formatif (*Practice*)**:
  - `tutorial`: Lembar soal tutorial mingguan resmi.
  - `latihan`: Bank soal latihan mandiri per bab.
  - `pr`: Pekerjaan rumah atau tugas terstruktur.
- **Evaluasi & Ujian (*Summative Assessment*)**:
  - `kuis`: Kuis kelas atau evaluasi pendek per bab.
  - `uts`: Ujian Tengah Semester.
  - `uas`: Ujian Akhir Semester.
  - `tryout`: Simulasi ujian internal Zyx.

### Varian & Peran Berkas (`ROLE`)

- `soal`: Lembar pertanyaan ujian/latihan tanpa kunci.
- `solusi`: Pembahasan rinci atau kunci jawaban resmi.
- `slide`: Format presentasi ringkas.

---

## 4. Standar Periode dan Semester (`TAHUN-SEMESTER`)

Gunakan format empat digit tahun diikuti kode semester:

- `2025-sem1`: Semester 1 / Semester Ganjil (Gasal) Tahun Ajaran 2025.
- `2025-sem2`: Semester 2 / Semester Genap Tahun Ajaran 2025.
- `2025-sp`: Semester Pendek / Semester Antara Tahun Ajaran 2025.
- `2025`: Jika dokumen berlaku umum sepanjang tahun akademik penuh.

---

## 5. Struktur Hierarki Direktori

Hierarki folder untuk Google Drive, Cloudflare R2, maupun penyimpanan lokal:

```text
courses/
└── ma1101-kalkulus-1a/
    ├── bab-00-silabus/
    │   └── ma1101_bab00_silabus_2025-sem1.pdf
    ├── bab-01-limit-dan-kekontinuan/
    │   ├── materi/
    │   │   ├── ma1101_bab01_materi_slide_2024-sem1.pdf
    │   │   ├── ma1101_bab01_materi_slide_2025-sem1.pdf
    │   │   └── ma1101_bab01_diktat_limit-kontinu_2025-sem1.pdf
    │   ├── tutorial/
    │   │   ├── ma1101_bab02_tutorial_turunan_soal_2024-sem1.pdf
    │   │   ├── ma1101_bab02_tutorial_turunan_soal_2025-sem1.pdf
    │   │   ├── ma1101_bab02_tutorial_turunan_solusi_2024-sem1.pdf
    │   └── kuis/
    │       ├── ma1101_bab01_kuis_soal_2024-sem1.pdf
    │       ├── ma1101_bab01_kuis_solusi_2024-sem1.pdf
    │       ├── ma1101_bab01_kuis_soal_2025-sem1.pdf
    │       └── ma1101_bab01_kuis_solusi_2025-sem1.pdf
    ├── bab-02-turunan/
    │   ├── materi/
    │   └── tutorial/
    └── ujian-komprehensif/
        ├── uts/
        │   ├── ma1101_uts_soal_2022-sem1.pdf
        │   ├── ma1101_uts_soal_2023-sem1.pdf
        │   ├── ma1101_uts_soal_2024-sem1.pdf
        │   ├── ma1101_uts_soal_2025-sem1.pdf
        │   ├── ma1101_uts_solusi_2022-sem1.pdf
        │   ├── ma1101_uts_solusi_2023-sem1.pdf
        │   ├── ma1101_uts_solusi_2024-sem1.pdf
        │   └── ma1101_uts_solusi_2025-sem1.pdf
        └── uas/
            ├── ma1101_uas_soal_2023-sem1.pdf
            ├── ma1101_uas_solusi_2023-sem1.pdf
            ├── ma1101_uas_soal_2024-sem1.pdf
            └── ma1101_uas_solusi_2024-sem1.pdf
```

---

## 6. Katalog Contoh Penamaan Nyata

### A. Teori, Diktat, dan Catatan Kuliah
- `ma1101_bab01_diktat_limit-kontinuitas_2025-sem1.pdf`
- `fi1101_bab03_materi_hukum-newton_slide_2025-sem1.pdf`
- `ki1001_bab02_catatan_stoikiometri_2025-sem1.pdf`
- `if2110_bab04_diktat_pemrograman-berorientasi-objek_2025-sem2.pdf`

### B. Tutorial dan Problem Set
- `ma1101_bab03_tutorial_soal_2025-sem1.pdf`
- `ma1101_bab03_tutorial_solusi_2025-sem1.pdf`
- `fi1101_bab04_tutorial_usaha-energi_soal_2025-sem1.pdf`
- `fi1101_bab04_tutorial_usaha-energi_solusi_2025-sem1.pdf`

### C. Kuis, UTS, dan UAS
- `ma1101_bab01_kuis_soal_2024-sem1.pdf`
- `ma1101_bab01_kuis_solusi_2024-sem1.pdf`
- `ma1101_uts_soal_2024-sem1.pdf`
- `ma1101_uts_solusi_2024-sem1.pdf`
- `fi1101_uas_paket-a_soal_2024-sem1.pdf`
- `fi1101_uas_paket-a_solusi_2024-sem1.pdf`

### D. Media dan Aset Tambahan
- `media/courses/ma1101/diagram-garis-singgung.png`
- `thumbnails/courses/ma1101/bab01-thumbnail.webp`

---

## 7. Aturan Praktis (Do's and Don'ts)

### Lakukan (Do)
- Gunakan format angka dua digit (`bab01`, `bab02`, ..., `bab10`).
- Pisahkan berkas soal dan solusi jika memang tidak disatukan dalam satu dokumen fisik.
- Cantumkan kode mata kuliah di awal setiap nama file agar konteks berkas tidak hilang saat diunduh keluar dari folder.
- Selalu tempatkan tahun dan semester di posisi terakhir sebelum ekstensi file.

### Hindari (Don't)
- Jangan gunakan spasi: `ma1101 bab 1 materi.pdf` -> Gunakan `ma1101_bab01_materi_2025-sem1.pdf`.
- Jangan gunakan penomoran satu digit untuk bab: `bab1` -> Gunakan `bab01`.
- Jangan gunakan nama personal atau label revisi informal: `catatan-revisi-final-tutor-budi-v2.pdf`.
- Jangan gunakan em dash atau en dash dalam nama file maupun folder.
