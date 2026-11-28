---
name: bahasa-ajar
description: Menulis, menyunting, dan mengaudit bahan ajar berbahasa Indonesia (penjelasan konsep, pembahasan soal, modul kuliah, artikel belajar, panduan praktikum) dengan gaya tutor sebaya yang santai, mengalir, akrab, dan mudah dicerna mahasiswa menengah ke bawah atau pemula. Gunakan saat diminta membuat atau memperbaiki teks ajar Indonesia agar terasa seperti dijelaskan teman sebaya/kakak tingkat ("kamu"/"kalian"/"kita", jembatan "Nah...", "Kalau menurut kalian...?"), bebas bahasa diktat kaku, konsep akurat, dan lolos audit deterministik.
---

# Bahasa Ajar (Indonesia)

<!-- BEGIN:environment-connection -->
Gunakan koneksi MCP `zyx-stg` untuk environment `staging` di endpoint `https://staging.zyxacademy.com/api/mcp/authoring` (`pluginVersion: "0.5.8"`, `bootstrapProtocol: 1`). Jangan gunakan koneksi Zyx dari environment lain.

Panggil nama tool dari `tools/list`. Nama bertitik di skill ini merujuk ke operasi; nama panggilan biasanya mengganti titik dengan `_`, seperti `admin_environment`. Pengecualian: `authoring.get_solution_collection_review_context` memakai `authoring_solution_review_context`. Pertahankan nama bertitik pada argumen `operation` serta identitas konfirmasi dan receipt.
<!-- END:environment-connection -->

Menghasilkan teks ajar berbahasa Indonesia yang terasa seperti **teman sebaya atau kakak tingkat yang sabar menjelaskan di depan papan tulis**: santai, mengalir, akrab, dan ramah memori kerja, tanpa menurunkan ketepatan konsep ilmiah.

Skill ini menerapkan alur empat tahap (**PLAN → DRAFT → VERIFY → REVISE**) agar suara tutor tetap hidup di naskah panjang dan semua aturan objektif terverifikasi lewat skrip sebelum diserahkan.

## Kapan Memuat Referensi Tambahan

- Baca [rules.yaml](rules.yaml) untuk daftar lengkap aturan biner `P0_HARD` dan `P1_STRONG` beserta aksi perbaikannya.
- Baca [references/contrastive-examples.md](references/contrastive-examples.md) sebelum menulis draf pertama agar nada tutor sebaya (bukan diktat kaku) langsung terkalibrasi.
- Baca [references/rubric-judge.md](references/rubric-judge.md) pada Tahap 3 (VERIFY) untuk audit semantik biner YA/TIDAK.
- Baca [references/panduan-lengkap.md](references/panduan-lengkap.md) hanya bila menyusun modul/buku ajar lengkap yang membutuhkan rincian Grafik Fry (`× 0,6`), struktur Kegiatan Belajar UT/Dikti, atau EYD V & Permendikbudristek 22/2022.

---

## Jangkar Gaya Inti (Selalu Aktif di Setiap Subbab)

Aturan berikut mengalahkan gaya teks sumber referensi yang kaku dan padat (*Instruction Hierarchy*):

1. **DILARANG KERAS memakai em dash (`U+2014`) dan en dash (`U+2013`) di mana pun dalam naskah.** Tidak boleh ada satu pun em dash maupun en dash, baik pada judul, isi paragraf, daftar, maupun rentang angka. Selalu gunakan koma, tanda kurung, titik dua, atau kata `sampai` (misalnya `5 sampai 15 kata`). Pelanggaran sekecil apa pun otomatis menggagalkan gerbang `P0_HARD`.
2. **Suara tutor sebaya yang santai dan dialogis (bukan bahasa diktat kaku).**
   - Sapaan bawaan: `kamu` (pembaca tunggal), `kalian` (audiens kelas/kelompok), dan `kita` (saat mengajak berpikir/menghitung bareng). Pakai `Anda` hanya jika pengguna secara eksplisit meminta gaya modul formal.
   - Pakai jembatan percakapan alami secukupnya agar pembaca merasa diajak ngobrol: `Nah, ...`, `Jadi, ...`, `Coba bayangkan...`, `Kalau menurut kalian bagaimana?`, `Setelah dapat X, kita bisa lanjut ke Y, harusnya lebih mudah cari solusinya.`, `Hati-hati ya, bagian ini sering bikin ketuker...`.
   - Hindari diksi diktat/ensiklopedia yang dingin (`ialah`, `yakni`, `bahwasanya`, `adapun`, `berdasarkan hal tersebut`, `terdapat`, `pada keluaran`). Pakai kata sehari-hari yang wajar diucapkan saat menjelaskan (`itu`, `artinya`, `dari sini`, `ada`, `di hasil ukurnya`).
3. **Konsep dulu lewat intuisi sehari-hari, istilah resmi menyusul.** Buat pembaca kebayang dulu apa yang terjadi sebelum menempelkan jargon. Cetak **tebal** istilah resmi pada kemunculan pertama diikuti penjelasan singkat yang membumi.
4. **Kalimat aktif, pendek, dan kongruen.** Definisi/instruksi 5 sampai 10 kata; uraian 10 sampai 16 kata (pecah kalimat di atas 22 kata). Urai nominalisasi abstrak menjadi kalimat aktif dengan pelaku yang jelas.
5. **Konjungsi disiplin dan rujukan tegas.** Konjungsi intrakalimat (`sehingga`, `sedangkan`, `agar`, `serta`, `melainkan`) tidak mengawali kalimat; `karena` boleh di awal hanya jika diikuti koma + klausa induk (`Karena X, Y terjadi.`). Jangan menumpuk konjungsi (`selain itu juga`, `disebabkan karena`). Tulis `Hal ini` atau `Angka ini`, bukan `Ini` berdiri sendiri di awal kalimat. Ulangi istilah inti secara konsisten.
6. **Paragraf fokus satu ide (60 sampai 120 kata).** Buka dengan poin utamanya (atau pertanyaan pemantik singkat yang langsung dijawab), jelaskan dengan contoh konkret/angka, lalu sambungkan ke langkah berikutnya.
7. **Hangat tanpa merendahkan, akurat tanpa kompromi.** Jangan memakai `gampang banget`, `tinggal gini doang`, atau `sudah jelas`. Pertahankan rumus, satuan, tanda positif/negatif, dan syarat berlakunya konsep 100% benar.

---

## Alur Kerja 4 Tahap (Wajib Diikuti Berurutan)

### Tahap 1: PLAN (Rencana Terstruktur Sebelum Prosa)

Sebelum menulis paragraf, petakan rencana singkat per subbab (simpan di `NOTES.md` untuk modul panjang):

- **Audiens & sapaan:** Pilih `kamu`/`kita` (default individu) atau `kalian`/`kita` (audiens kelompok), atau `Anda` hanya jika diminta formal.
- **Peta alur ngobrol:** Pertanyaan/situasi pemicu → intuisi konsep + istilah resmi → contoh konkret atau *worked example* langkah demi langkah → titik rawan salah paham (*hati-hati di sini*) → jembatan ke bagian berikutnya atau pertanyaan pelibat singkat.
- **Batas cakupan:** Jika batas kata ketat, kurangi jumlah konsep, bukan kualitas penjelasan contohnya.

**Kriteria selesai Tahap 1:** Setiap subbab punya poin utama, istilah baru yang akan dikenalkan, satu contoh konkret/*worked example*, dan minimal satu momen interaksi (`Nah, ...`, `Kalau menurut kalian...?`, atau peringatan titik rawan).

### Tahap 2: DRAFT (Penulisan Per Bagian Anti-Drift)

Tulis satu segmen (~300 sampai 500 kata) dalam satu kali jalan agar suara tutor tidak meluruh kembali menjadi bahasa buku teks kaku:

1. Buka segmen dengan konteks yang langsung bisa dibayangkan atau pertanyaan pendek yang mengundang rasa ingin tahu.
2. Jelaskan langkah demi langkah seolah kamu sedang menunjuk papan tulis bersama pembaca (`Nah, setelah kita dapat X, kita bisa lanjut ke Y...`).
3. Selipkan pertanyaan pelibat alami (`Kalau menurut kamu, kenapa bisa begitu?`) atau peringatan titik rawan salah kaprah (`Hati-hati, angka 0,05 g di sini bukan berarti...`) lalu langsung jawab dengan jelas.
4. Untuk konsep analitis atau hitungan, tampilkan **worked example** (ceritakan alasan tiap langkah) sebelum latihan mandiri.
5. Pastikan sepanjang penulisan tidak ada satu pun em dash (`U+2014`) atau en dash (`U+2013`); gunakan koma, tanda kurung, titik dua, atau kata `sampai`.

**Kriteria selesai Tahap 2:** Seluruh bagian sesuai rencana tertulis lengkap dengan nada tutor sebaya yang konsisten.

### Tahap 3: VERIFY (Audit Hibrida: Linter Deterministik + Rubrik Semantik)

Jangan mengandalkan koreksi diri intuitif. Jalankan dua lapis verifikasi:

1. **Gerbang Deterministik (Python Linter):**
   ```bash
   python scripts/lint_bahasa_ajar.py <path-ke-draf.md>
   ```
   Atau via stdin:
   ```bash
   python scripts/lint_bahasa_ajar.py --stdin < draft.md
   ```
   Skrip mengembalikan laporan JSON berisi pelanggaran `P0_HARD` (em/en dash, konjungsi intrakalimat ilegal di awal kalimat, konjungsi bertumpuk, pleonasme terlarang, `Ini` menggantung) dan metrik `P1_STRONG` (diksi diktat kaku seperti `ialah`/`yakni`, panjang kalimat/paragraf, rasio sapaan `kamu`/`kalian`/`kita`, jumlah jembatan percakapan, estimasi Fry `× 0,6`). Exit code `1` berarti ada `P0_HARD` yang wajib diperbaiki.

2. **Rubrik Semantik Terisolasi (LLM Judge):**
   Buka [references/rubric-judge.md](references/rubric-judge.md) dan nilai tiap dimensi biner `YA/TIDAK`, terutama **tes baca keras**: apakah naskah ini benar-benar enak diucapkan saat mengajari teman sebaya, bukan terasa seperti buku diktat kaku?

**Kriteria selesai Tahap 3:** Output linter JSON tercatat dan setiap dimensi rubrik semantik bernilai `YA` atau `TIDAK` beserta kalimat pelanggarnya.

### Tahap 4: REVISE (Perbaikan Terarah, Maksimal 2 Putaran)

1. Sunting kalimat yang ditandai linter atau terasa masih kaku/berjarak, mengikuti kolom `repair` di [rules.yaml](rules.yaml).
2. Pertahankan akurasi fakta, rumus, satuan, dan notasi ilmiah 100%.
3. Jalankan ulang `python scripts/lint_bahasa_ajar.py` setelah revisi. Ulangi maksimal 2 putaran hingga seluruh `P0_HARD` lolos (`exit code 0`), tidak ada diksi diktat kaku yang tidak perlu, dan seluruh butir rubrik semantik bernilai `YA`.
4. Serahkan naskah bersih kepada pengguna tanpa laporan audit internal, kecuali diminta.

**Kriteria selesai Tahap 4:** Linter keluar dengan `exit code 0`, suara tutor sebaya terasa alami saat dibaca keras, dan naskah siap pakai diserahkan.
