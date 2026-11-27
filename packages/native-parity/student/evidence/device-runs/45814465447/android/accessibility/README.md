# Pemeriksaan hierarki aksesibilitas Student Android

Pemeriksaan ini memakai dua file asli Maestro dari build `17c0b80a` pada Android API 35, viewport 380 × 820, density 160 dpi, dan skala teks 1. Pada konfigurasi ini satu piksel sama dengan satu dp. Katalog tertangkap dengan TPB masih terpilih saat assertion hasil pencarian kosong gagal. Diskusi tertangkap sebagai daftar kanal Matematika I saat assertion pesan yang dibuka gagal. [Provenans dan SHA-256](provenance.json) · [Run CI](https://github.com/soezyxstt/zyxacademy/actions/runs/45814465447)

| Area | Atribut dalam hierarki | Ukuran node |
|---|---|---|
| Filter katalog | Grup bernama `Filter by major`. `All (5)`, `TPB` dan `PKA` masing-masing terlihat, aktif dan dapat diklik. Hanya `TPB` bertanda `selected=true`. | 64 × 44, 52 × 44, 53 × 44 dp |
| Tautan footer katalog | `View plans` dan `contact us on WhatsApp` muncul sebagai dua node clickable dengan nama terpisah. Maestro membuka kedua dialog URL fixture sebelum assertion berikutnya gagal. | 66 × 44 dan 144 × 44 dp |
| Ringkasan kursus | Empat node klik menyertakan judul dan informasi yang relevan. `Fisika Dasar I, 1 material, Limited access` menyertakan status akses dan `Matematika I, 6 materials · 2 quizzes` menyertakan jumlah. Inisial visual `BK`, `FI`, `MA` dan `ML` bertanda `important-for-accessibility=false`. | Lebar 348 dp, tinggi 64–104 dp |
| Navigasi katalog | `Home`, `Courses`, `Schedule`, `Discuss` dan `Me` masing-masing memiliki nama dan dapat diklik. Hanya `Courses` bertanda `selected=true`. | Lebar 69–70 dp, tinggi 48 dp |
| Kanal dan status diskusi | Ketiga pilihan kanal dan kedua status berupa `android.widget.Button`. `Matematika I` dan `Terbuka` terpilih. Node thread menggabungkan judul, jumlah jawaban dan jumlah belum dibaca. | Pilihan 40 dp dan thread 348 × 44 dp |
| Pencarian diskusi | `Cari diskusi` berupa `android.widget.EditText` bernama. `Cari` dan `Pertanyaan baru` berupa `android.widget.Button` dengan nama terpisah. | 348 × 40, 50 × 36, dan 133 × 36 dp |
| Bisukan kanal | `Bisukan kanal` berupa `android.widget.Switch` dengan `enabled=true`, `clickable=true` dan `checked=false`. | 44 × 24 dp |

Node dengan sisi kurang dari 48 dp tercatat sebagai target yang perlu diperiksa terhadap panduan Android. Pilihan kanal dan status memakai tinggi 40 dp. Switch memakai `hitSlop` 10 dp pada kode sumber bersama. Hierarki melaporkan batas node dan belum mengukur area sentuh efektif. Pada revisi setelah snapshot, footer katalog memakai kembali Pressable terpisah dengan target minimum 44 × 44 dp. Ukuran hasil perubahan masih menunggu tangkapan Android baru. [Panduan target sentuh Android](https://support.google.com/accessibility/android/answer/7101858)

Ekspor memberikan nama, status, kelas dan batas node. Kontrol katalog diekspor sebagai `android.view.View`. Pengumuman peran dan aktivasi saat memakai TalkBack, urutan fokus, navigasi keyboard, kontras, skala teks yang lebih besar, dan aksesibilitas iOS memerlukan pengujian terpisah.

Jalankan dari akar repo untuk memeriksa hash, atribut, koordinat, dan ambang ukuran pada kedua hierarki.

```sh
python tests/visual/native-parallel/student/audit-android-accessibility.py \
  packages/native-parity/student/evidence/device-runs/45814465447/android/accessibility
```

[Hierarki katalog TPB](catalog-tpb.json) · [Hierarki daftar diskusi](discussion-list.json)
