---
name: bahasa-ajar
description: Menulis, menyunting, dan mengaudit bahan ajar berbahasa Indonesia (modul kuliah, buku ajar, artikel penjelasan, pembahasan soal, panduan praktikum) untuk mahasiswa menengah ke bawah atau pemula dengan beban kognitif terkendali. Gunakan saat diminta membuat atau memperbaiki teks ajar Indonesia agar deduktif, aktif, kohesif, bebas nominalisasi berat, bersuara tutor semi-formal ("Anda"/"kita"), dan lolos audit deterministik.
---

# Bahasa Ajar (Indonesia)

<!-- BEGIN:environment-connection -->
Gunakan koneksi MCP `zyx-stg` untuk environment `staging` di endpoint `https://staging.zyxacademy.com/api/mcp/authoring` (`pluginVersion: "0.5.6"`, `bootstrapProtocol: 1`). Jangan gunakan koneksi Zyx dari environment lain.

Panggil nama tool dari `tools/list`. Nama bertitik di skill ini merujuk ke operasi; nama panggilan biasanya mengganti titik dengan `_`, seperti `admin_environment`. Pengecualian: `authoring.get_solution_collection_review_context` memakai `authoring_solution_review_context`. Pertahankan nama bertitik pada argumen `operation` serta identitas konfirmasi dan receipt.
<!-- END:environment-connection -->

Menghasilkan teks ajar berbahasa Indonesia yang terstruktur, kongruen, dan ramah memori kerja bagi mahasiswa menengah ke bawah tanpa menurunkan ketepatan konsep ilmiah.

Skill ini menerapkan arsitektur empat tahap (**PLAN → DRAFT → VERIFY → REVISE**) agar gaya ajar tidak melenceng (*drift*) pada naskah panjang dan seluruh aturan objektif terverifikasi lewat skrip sebelum diserahkan.

## Kapan Memuat Referensi Tambahan

- Baca [rules.yaml](rules.yaml) untuk daftar lengkap aturan biner `P0_HARD` dan `P1_STRONG` beserta aksi perbaikannya.
- Baca [references/contrastive-examples.md](references/contrastive-examples.md) sebelum menulis draf pertama agar pola transformasi (nominalisasi, pasif, konjungsi, POV, istilah) terkalibrasi.
- Baca [references/rubric-judge.md](references/rubric-judge.md) pada Tahap 3 (VERIFY) untuk audit semantik biner YA/TIDAK.
- Baca [references/panduan-lengkap.md](references/panduan-lengkap.md) hanya bila menyusun modul/buku ajar lengkap yang membutuhkan rincian Grafik Fry (`× 0,6`), struktur Kegiatan Belajar UT/Dikti, atau EYD V & Permendikbudristek 22/2022.

---

## Jangkar Gaya Inti (Selalu Aktif di Setiap Subbab)

Aturan `P0_HARD` berikut mengalahkan gaya teks sumber referensi yang padat (prinsip *Instruction Hierarchy*):

1. **DILARANG KERAS memakai em dash (`U+2014`) dan en dash (`U+2013`) di mana pun dalam naskah.** Tidak boleh ada satu pun em dash maupun en dash, baik pada judul, isi paragraf, daftar, maupun rentang angka. Selalu gunakan koma, tanda kurung, titik dua, atau kata `sampai` (untuk rentang angka, misalnya `5 sampai 15 kata`). Pelanggaran sekecil apa pun otomatis menggagalkan gerbang `P0_HARD`.
2. **Konjungsi disiplin posisi.** Konjungsi intrakalimat (`karena`, `sehingga`, `sedangkan`, `agar`, `atau`) hanya berada di tengah kalimat. Konjungsi antarkalimat (`Oleh karena itu,`, `Namun,`, `Selain itu,`, `Selanjutnya,`, `Dengan demikian,`) berada di awal kalimat diikuti koma dan tidak ditumpuk (`selain itu juga`, `namun sebaliknya`).
3. **Kalimat aktif, pendek, dan kongruen.** Definisi dan instruksi 5 sampai 8 kata; uraian 10 sampai 15 kata (pecah kalimat yang melampaui 15 kata). Urai nominalisasi abstrak menjadi klausa aktif dengan pelaku yang jelas.
4. **Rujukan tegas dan repetisi istilah murni.** Tulis `Hal ini` atau `Mekanisme tersebut`, bukan `Ini` berdiri sendiri di awal kalimat. Ulangi istilah kunci secara persis antarkalimat daripada menggantinya dengan sinonim bergaya.
5. **Konsep dulu, istilah kemudian.** Jelaskan konsep lewat jembatan bahasa sehari-hari, cetak **tebal** istilah pada kemunculan pertama diikuti definisi langsung dalam tanda kurung, dan susun glosarium alfabetis untuk modul panjang.
6. **Paragraf deduktif satu ide.** Ikuti urutan **Kalimat Topik (KT) → Kalimat Pengembang Langsung (KPL) → Kalimat Pengembang Taklangsung (KPT)** dengan pola piramida terbalik.
7. **POV tutor semi-formal.** Sapaan utama `Anda` (setara dan profesional), `kita` saat membedah contoh bersama, dan `Saudara` opsional pada pembuka/transisi topik. Hindari `kamu`/`kalian` untuk konteks perguruan tinggi kecuali diminta eksplisit oleh pengguna.

---

## Alur Kerja 4 Tahap (Wajib Diikuti Berurutan)

### Tahap 1: PLAN (Rencana Terstruktur Sebelum Prosa)

Sebelum menulis paragraf apa pun, petakan rencana per subbab (simpan singkat di catatan kerja atau `NOTES.md` untuk modul panjang):

- **Audiens & prasyarat:** Pengetahuan awal yang diasumsikan dan satu tujuan belajar terukur.
- **Peta subbab:** Prolog konteks → urutan paragraf (tipe: deduktif / perbandingan / prosedur / *worked example*) → kalimat topik tiap paragraf → istilah baru yang diperkenalkan → epilog transisi atau cek pemahaman.
- **Batas cakupan:** Pastikan panjang sesuai permintaan; jika batas kata ketat, kurangi cakupan konsep daripada memotong penjelasan alasan atau contoh.

**Kriteria selesai Tahap 1:** Setiap subbab memiliki kalimat topik, daftar istilah baru, dan minimal satu contoh konkret atau *worked example* yang direncanakan.

### Tahap 2: DRAFT (Penulisan Per Bagian Anti-Drift)

Tulis satu subbab atau satu segmen (~300 sampai 500 kata) dalam satu kali jalan agar perhatian pada aturan tidak luntur (*section-scoped writing*):

1. Mulai subbab dengan **paragraf prolog** (mengaitkan konsep ke pengalaman nyata atau pengetahuan awal).
2. Tulis setiap paragraf dengan satu gagasan utama (target 60 sampai 120 kata) mengikuti alur `KT → KPL → KPT`.
3. Untuk konsep analitis atau hitungan, sertakan **worked example** (tulis langkah berpikir secara terbuka) sebelum latihan mandiri (*completion problem* / pertanyaan Socratik).
4. Untuk teks panjang lintas beberapa subbab, perbarui catatan ringkas istilah kunci yang sudah didefinisikan agar tidak mendefinisikan ulang secara berbeda atau mengganti istilah.
5. Tutup subbab dengan **paragraf epilog** (rangkuman inti + jembatan ke bagian berikutnya) atau cek pemahaman singkat disertai rambu jawaban.
6. Pastikan sepanjang penulisan tidak ada satu pun em dash (`U+2014`) atau en dash (`U+2013`); gunakan koma, tanda kurung, titik dua, atau kata `sampai`.

**Kriteria selesai Tahap 2:** Seluruh bagian sesuai rencana tertulis lengkap dalam format yang diminta pengguna.

### Tahap 3: VERIFY (Audit Hibrida: Linter Deterministik + Rubrik Semantik)

Jangan mengandalkan koreksi diri intuitif (*intrinsic self-correction* gagal mendeteksi panjang kalimat dan tanda baca). Jalankan dua lapis verifikasi:

1. **Gerbang Deterministik (Python Linter):**
   Jalankan skrip validator pada naskah hasil draf:
   ```bash
   python scripts/lint_bahasa_ajar.py <path-ke-draf.md>
   ```
   Atau melalui stdin bila naskah belum disimpan ke file:
   ```bash
   python scripts/lint_bahasa_ajar.py --stdin < draft.md
   ```
   Skrip mengembalikan laporan JSON berisi lokasi persis pelanggaran `P0_HARD` (em/en dash, konjungsi intrakalimat di awal kalimat, konjungsi bertumpuk, pleonasme terlarang, rujukan `Ini` menggantung) dan metrik `P1_STRONG` (rerata & panjang kalimat, panjang paragraf, rasio pronomina `Anda`/`kita`, estimasi suku kata Grafik Fry `× 0,6`). Exit code `1` berarti ada pelanggaran `P0_HARD` yang wajib diperbaiki.

2. **Rubrik Semantik Terisolasi (LLM Judge):**
   Buka [references/rubric-judge.md](references/rubric-judge.md) dan nilai tiap dimensi biner `YA/TIDAK` secara terpisah (konsep sebelum jargon, struktur+fungsi definisi, alur `KT → KPL → KPT`, dekongruensi nominalisasi, kualitas *worked example*, kehangatan tutor tanpa merendahkan). Catat kalimat persis yang melanggar.

**Kriteria selesai Tahap 3:** Output linter JSON tercatat dan setiap dimensi rubrik semantik telah dinilai `YA` atau `TIDAK` beserta nomor kalimat pelanggarnya.

### Tahap 4: REVISE (Perbaikan Terarah, Maksimal 2 Putaran)

1. Sunting **hanya** kalimat atau paragraf yang ditandai oleh linter atau rubrik semantik, mengikuti kolom `repair` di [rules.yaml](rules.yaml).
2. Pertahankan akurasi fakta, rumus, satuan, dan notasi ilmiah; jangan pernah mengorbankan kebenaran konsep demi memendekkan kalimat.
3. Jalankan ulang `python scripts/lint_bahasa_ajar.py` setelah revisi. Ulangi maksimal 2 putaran hingga seluruh `P0_HARD` lolos (`exit code 0`) dan seluruh butir rubrik semantik bernilai `YA`.
4. Serahkan naskah bersih kepada pengguna tanpa menambahkan laporan audit internal, kecuali pengguna meminta laporan audit.

**Kriteria selesai Tahap 4:** Linter mengembalikan `exit code 0` (nol pelanggaran `P0_HARD`), target `P1_STRONG` terpenuhi atau deviasinya beralasan jelas (misalnya kutipan langsung/rumus), dan naskah siap pakai diserahkan.
