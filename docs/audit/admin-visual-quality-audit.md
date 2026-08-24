# Audit Kualitas Visual: Halaman Admin

Tanggal: 2026-08-24. Sifat: read-only. Tidak ada mutasi kode atau data dalam audit ini.

## Ringkasan Eksekutif

| Kriteria | Status | Catatan |
|---|---|---|
| Overflow horizontal 380px | Lolos | 0 dari 150 muatan halaman mengalami horizontal overflow |
| PageHeader dan judul 24px | Lolos dengan catatan | H1 hilang pada state loading/error 2 halaman detail |
| Tipografi kontrol state-invariant | Lolos | Tidak ada `text-sm`/`text-xs` mentah di `app/(admin)` |
| Token warna semantik | Pelanggaran minor | 4 berkas memakai palet Tailwind mentah |
| `rounded-full` | Lolos | Semua pemakaian adalah lingkaran sejati (avatar, dot status) |
| Gradien | Pelanggaran minor | 1 aksen gradien di `quizzes-client.tsx` |
| Em dash dan en dash di copy UI | Lolos | Bebas dari em dash dan en dash |
| Mode gelap | Lolos | Token semantik terpakai konsisten pada sampel yang ditinjau |
| Dialog global dan permission modal | Pelanggaran berat | Dialog push notifikasi murid memblokir seluruh halaman admin |
| Penanganan tanggal | Pelanggaran berat | Bug tahun 58604 pada kartu kuis akibat manipulasi tanggal manual |
| Media dan penyimpanan | Defect sedang | Gambar bukti transfer PKA 500 dan thumbnail blog tanpa fallback |
| Penanganan error UI | Defect sedang | String JSON mentah dan kode enum internal diekspos ke antarmuka |
| Standarisasi empty state | Defect minor | Teks polos melayang tanpa `AdminEmptyState` di halaman job dan analitik |
| Kerapian header tabel | Pelanggaran minor | Huruf kapital penuh (ALL-CAPS) pada tabel token dan kelompok |

Total cakupan runtime: 52 rute unik x 3 varian (desktop 1440px terang, desktop 1440px gelap, mobile 380px terang) = 153 screenshot tersimpan di `artifacts/manual/2026-08-24/admin-visual-audit/`.

## Metode

1. Audit statis atas 97 berkas `.ts`/`.tsx` di bawah `app/(admin)` terhadap regulasi UI di `AGENTS.md`.
2. Crawl berbasis Puppeteer terhadap build produksi lokal yang terhubung ke database staging melalui `.env.staging` (SELECT sesi aktif, cookie ditandatangani HMAC lokal, tanpa mutasi database).
3. Pemeriksaan visual mendalam berkas per berkas atas 153 screenshot di direktori `artifacts/manual/2026-08-24/admin-visual-audit/`.
4. Evaluasi terhadap konsistensi komponen, hierarki informasi, handling error, fallback media, dan kelayakan responsif.

## Batasan

- `assessment_sources` kosong di staging sehingga `/admin/assessments/[id]` tidak memiliki data untuk diaudit runtime.
- Error konsol 404 pada `/_vercel/insights` dan CORS pada `get-session` saat build lokal adalah artefak lingkungan, bukan defect produk.
- Screenshot berisi data staging asli dan berada di folder yang diabaikan git (`artifacts/`).

## Temuan Audit Mendalam

### F1. Dialog izin notifikasi push murid memblokir seluruh halaman admin (Tinggi)
Komponen permission push notification menampilkan dialog modal terpusat "Aktifkan Notifikasi" dengan copy khusus murid ("seputar belajarmu", "kuis baru yang siap dikerjakan", "pembaruan materi di kelasmu") pada sesi admin di hampir seluruh rute admin. Dialog ini memblokir 60% hingga 70% viewport saat initial load, mengganggu alur navigasi admin.
- Rute terpengaruh: `/admin`, `/admin/courses`, `/admin/courses/[id]`, `/admin/quizzes`, `/admin/questions`, `/admin/materials`, `/admin/forms`, `/admin/meet`, `/admin/ops/*`, `/admin/tutorial-pka/registrations`.
- Rekomendasi: Pasang guard peran pengguna (`role !== 'admin'`) dan guard layout agar dialog pemicu izin murid tidak pernah dimount pada antarmuka admin.

### F2. Bug penanganan tanggal: Tahun 58604 pada kartu kuis (Tinggi)
Pada daftar kuis (`/admin/quizzes`), tanggal pembuatan pada kartu kuis tertera sebagai `19 Mei 58604`, `6 Mei 58604`, `17 Sep 58601`, `11 Jun 58593`, `20 Feb 58547`, `1 Nov 58489`.
- Akar masalah: `quizzes-client.tsx:433` memanggil `new Date(template.createdAt).toLocaleDateString(...)` secara manual pada integer SQLite.
- Rekomendasi: Gunakan `normalizeDate()` dari `lib/date-utils.ts` atau komponen `FormattedDate` sesuai regulasi repository.

### F3. Gambar bukti PKA dan thumbnail media rusak tanpa fallback visual (Sedang)
- Kolom bukti pada `/admin/tutorial-pka/registrations` menampilkan ikon gambar rusak bawaan browser akibat error 500 saat mengambil objek dari storage proxy.
- Pada formulir sunting blog (`/admin/blog/[id]/edit`), gambar thumbnail yang gagal dimuat merender kotak kosong dengan ikon rusak dan tombol "Hapus" mengambang.
- Rekomendasi: Bungkus setiap elemen gambar dengan penanganan error atau komponen gambar dengan fallback placeholder ("Bukti Belum Tersedia" / thumbnail placeholder).

### F4. Ekspos string teknis dan format JSON mentah pada antarmuka (Sedang)
- Pada detail log meet (`/admin/meet/[id]`), pesan error OAuth dicetak mentah dalam banner merah: `Failed to refresh Google OAuth token (400): { "error": "invalid_grant", "error_description": "Token has been expired or revoked." }`.
- Pada review produk materi (`/admin/materials/review/product/[id]`), pesan kegagalan bundle ditampilkan sebagai kode enum internal mentah: `PRODUCT_BUNDLE_VALIDATION_FAILED`.
- Pada pustaka media (`/admin/media`), teks merah polos `Access Denied` tampil tanpa kontainer error yang terstruktur.
- Rekomendasi: Gunakan `AdminErrorState` atau banner error terstandarisasi dengan pesan berbahasa Indonesia yang jelas serta tombol tindakan resolusi.

### F5. Cacat viewport dan scroll jumping pada form kuis baru dan edit (Sedang)
Pada `/admin/quizzes/new` dan `/admin/quizzes/[id]/edit`, rendering viewport terpotong ke bawah sehingga 90% bagian atas halaman terlihat kosong/putih, dan hanya kartu konfigurasi bawah ("Waktu Rilis Pembahasan Kuis", "Tampilkan Skor Instan") yang terlihat.
- Akar masalah: Auto-focus elemen bawah atau container flex layout tanpa penguncian batas scroll atas.
- Rekomendasi: Perbaiki container form dan pastikan scroll window berada di posisi atas saat halaman selesai dimuat.

### F6. Header halaman detail bersifat kondisional sehingga H1 hilang pada state non-data (Sedang)
- `app/(admin)/admin/forms/[id]/page.tsx`: `AdminPageHeader` hanya dirender jika data formulir ada. Pada state not found atau error, H1 hilang.
- `app/(admin)/admin/(eval)/quiz-insights/[id]/page.tsx`: Early return pada loading dan error tanpa merender `PageHeader`.
- Rekomendasi: Pastikan `PageHeader` atau skeleton header selalu dirender di semua state halaman.

### F7. Empty state tidak terstandarisasi dan pencampuran bahasa (Rendah)
- Pada generasi soal (`/admin/jobs`), tampilan data kosong hanya berupa teks polos mengambang "Belum ada generation job." tanpa kontainer dan tanpa `AdminEmptyState`.
- Pada analitik Zyra (`/admin/ops/analytics`), kartu "Tren Penggunaan Harian" berwujud kotak kosong tanpa grafik atau pesan, serta banner sistem menggunakan bahasa Inggris ("No model requests recorded yet...").
- Rekomendasi: Terapkan `AdminEmptyState` secara seragam dan standarisasi bahasa copy ke bahasa Indonesia.

### F8. Kerapian tabel dan pelanggaran huruf kapital penuh (Rendah)
- Tabel pada `/admin/tokens` dan `/admin/groups` menggunakan header ALL-CAPS (`TOKEN STRING`, `KAPASITAS KELOMPOK`, `MATA KULIAH`, `TANGGAL KEDALUWARSA`, `STATUS`, `ANGGOTA TERDAFTAR`, `AKSI`).
- Rekomendasi: Ubah header tabel ke bentuk sentence-case ("Token string", "Kapasitas kelompok", "Tanggal kedaluwarsa") sesuai pedoman penulisan.

### F9. Kepadatan data ekstrem pada bank soal (Rendah)
Daftar bank soal (`/admin/questions`) merender ratusan soal LaTeX utuh dalam satu scroll vertikal panjang tanpa paginasi, dengan 5 sampai 7 badge bertumpuk per baris, membebani DOM.
- Rekomendasi: Tambahkan paginasi atau mode baris padat (compact view).

### F10. Pemotongan label menu navigasi sidebar (Rendah)
Beberapa label menu sidebar admin terpotong elipsis yang membingungkan: "Bank Soal & Ase...", "Jadwal & Kale...", "Penggunaan Fi...", serta dua menu berdekatan yang sama-sama terpotong menjadi "Analisi... BETA" dan "Analiti... BETA".
- Rekomendasi: Sesuaikan teks menu sidebar agar ringkas dan muat tanpa elipsis.

### F11. Warna palet mentah dan aksen gradien (Rendah)
- Penggunaan warna Tailwind mentah (`emerald-500`, `amber-500`, `rose-500`, `zinc-900`) di 4 berkas admin.
- Aksen gradien `bg-linear-to-r` pada kartu kuis di `quizzes-client.tsx:222`.
- Rekomendasi: Ganti dengan token semantik (`status-success`, `status-warning`, `status-error`, `bg-muted`) dan hapus gradien.

### F12. Karakter glyph rusak pada riwayat notifikasi (Rendah)
Terdapat karakter kotak unrendered `[]` pada judul riwayat notifikasi di `/admin/notifications`.
- Rekomendasi: Ganti karakter simbol khusus dengan ikon Lucide React yang terbukti stabil lintas peramban.

### F13. Input berkas browser mentah (Rendah)
Pada `/admin/authoring-context`, input berkas masih menggunakan elemen native `<input type="file">` tanpa styling Zyx.
- Rekomendasi: Ganti dengan area dropzone atau tombol unggah terstandarisasi.

### F14. Ukuran mikro 10px tanpa token bernama (Rendah)
Terdapat 30+ penggunaan `text-[10px]` di 14 berkas admin.
- Rekomendasi: Resmikan token `text-body-2xs` di `app/globals.css` lalu normalkan semua pemakaian.

## Prioritas Perbaikan

1. **Prioritas 1 (Kritis)**: F1 (Gate dialog push notifikasi agar tidak muncul di admin), F2 (Perbaiki bug tanggal tahun 58604).
2. **Prioritas 2 (Fungsional & Error)**: F3 (Fallback gambar rusak), F4 (Sanitasi dan pemformatan pesan error), F5 (Perbaiki scroll/viewport form kuis), F6 (Pastikan H1 di semua state).
3. **Prioritas 3 (Konsistensi Desain & Konten)**: F7 (Terapkan `AdminEmptyState`), F8 (Normalisasi header tabel ke sentence-case), F10 (Perbaiki pemotongan label sidebar), F11 & F14 (Token warna semantik dan token micro UI `text-body-2xs`).
4. **Prioritas 4 (Optimasi Tampilan)**: F9 (Paginasi bank soal), F12 (Perbaiki glyph notifikasi), F13 (Styling input berkas).

## Cakupan per Rute

Semua varian: T = desktop terang, G = desktop gelap, M = mobile 380px. Overflow: tidak ada di semua sel. H1: ada kecuali yang diberi catatan.

| Rute | T | G | M | Catatan |
|---|---|---|---|---|
| /admin | ya | ya | ya | F1 |
| /admin/blog | ya | ya | ya | |
| /admin/blog/new | ya | ya | ya | |
| /admin/blog/[id]/edit | ya | ya | ya | F3 |
| /admin/courses | ya | ya | ya | F1 |
| /admin/courses/[id] | ya | ya | ya | |
| /admin/courses/[id]/quizzes/new | ya | ya | ya | F5 |
| /admin/courses/[id]/quizzes/[id]/edit | ya | ya | ya | F5 |
| /admin/schedules | ya | ya | ya | F5 |
| /admin/groups | ya | ya | ya | F8 |
| /admin/materials | ya | ya | ya | |
| /admin/materials/manual | ya | ya | ya | |
| /admin/materials/review | ya | ya | ya | |
| /admin/materials/review/idea/[id] | ya | ya | ya | |
| /admin/materials/review/product/[id] | ya | ya | ya | F4 |
| /admin/authoring-context | ya | ya | ya | F13 |
| /admin/tutorial-pka | ya | ya | ya | |
| /admin/tutorial-pka/schedules | ya | ya | ya | |
| /admin/tutorial-pka/registrations | ya | ya | ya | F1, F3 |
| /admin/tutorial-pka/announcements | ya | ya | ya | |
| /admin/bundles/idea | ya | ya | ya | |
| /admin/bundles/product | ya | ya | ya | |
| /admin/tokens | ya | ya | ya | F8 |
| /admin/notifications | ya | ya | ya | F12 |
| /admin/diktats | ya | ya | ya | |
| /admin/assessments | ya | ya | ya | |
| /admin/assessments/[id] | tidak diaudit | | | Tabel sumber kosong di staging |
| /admin/ast-inspector | ya | ya | ya | F11 |
| /admin/media | ya | ya | ya | F4 |
| /admin/questions | ya | ya | ya | F9 |
| /admin/quizzes | ya | ya | ya | F2, F11 |
| /admin/quizzes/new | ya | ya | ya | F5, F11 |
| /admin/quizzes/[id]/edit | ya | ya | ya | F5, F11 |
| /admin/quiz-insights | ya | ya | ya | |
| /admin/quiz-insights/[id] | ya | ya | ya | F6 |
| /admin/jobs | ya | ya | ya | F7 |
| /admin/distractors | ya | ya | ya | |
| /admin/leaderboard | ya | ya | ya | F7 |
| /admin/forms | ya | ya | ya | |
| /admin/forms/[id] | ya | ya | ya | F6 |
| /admin/meet | ya | ya | ya | |
| /admin/meet/[id] | ya | ya | ya | F4 |
| /admin/tautan | ya | ya | ya | |
| /admin/ops | ya | ya | ya | |
| /admin/ops/analytics | ya | ya | ya | F7 |
| /admin/ops/web-analytics | ya | ya | ya | |
| /admin/ops/feature-usage | ya | ya | ya | |
| /admin/ops/tutor-activity | ya | ya | ya | |
| /admin/ops/keys | ya | ya | ya | |
| /admin/ops/flags | ya | ya | ya | |
| /admin/ops/short-links | ya | ya | ya | |

## Lampiran: Artefak dan Reproduksi

- Screenshot: `artifacts/manual/2026-08-24/admin-visual-audit/{route-slug}/{desktop-light,desktop-dark,mobile-light}.png` (diabaikan git).
- Reproduksi: build produksi lokal dengan env staging (`next build` lalu `next start` dengan `DATABASE/TURSO_*` dari `.env.staging`), kemudian crawl dengan cookie sesi yang ditandatangani lokal mengikuti pola `scripts/staging/smoke-auth.ts`.
