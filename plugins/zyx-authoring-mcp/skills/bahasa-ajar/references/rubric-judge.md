# Rubrik Audit Semantik (LLM Judge): Bahasa Ajar Indonesia

Jalankan audit ini pada **Tahap 3 (VERIFY)** setelah `scripts/lint_bahasa_ajar.py` selesai.

## Aturan Anti-Bias Evaluator

1. **Nilai satu dimensi per kali** secara biner (`YA` / `TIDAK`). Jangan memberi skor kabur seperti "cukup baik".
2. **Jangan bias terhadap teks panjang (*verbosity bias*).** Teks yang lebih ringkas tetapi memenuhi semua syarat selalu lebih baik daripada teks bertele-tele.
3. **Tunjuk lokasi persis.** Untuk setiap jawaban `TIDAK`, kutip kalimat atau nomor paragraf yang melanggar dan sebutkan perbaikan spesifiknya.
4. **Jangan mengulang pemeriksaan kode.** Panjang kalimat, em/en dash, pleonasme, dan konjungsi awal kalimat sudah diperiksa oleh `scripts/lint_bahasa_ajar.py`.

---

## Daftar Periksa Konstitusi Pedagogis (Biner YA / TIDAK)

| ID | Dimensi | Pertanyaan Audit Biner | Tindakan Jika TIDAK |
|---|---|---|---|
| `SEM.1` | **Konsep Sebelum Jargon** | Apakah setiap konsep baru dijelaskan maknanya dalam bahasa sehari-hari sebelum atau bersamaan dengan istilah resminya, dan istilah resmi dicetak **tebal** + definisi kurung pada kemunculan pertama? | Sisipkan jembatan bahasa sehari-hari dan definisi kurung pada kemunculan pertama istilah. |
| `SEM.2` | **Definisi Utuh (Struktur + Fungsi)** | Apakah definisi istilah inti menjelaskan *apa bendanya/strukturnya* sekaligus *apa fungsinya/perannya*? | Lengkapi definisi agar tidak hanya menyebut kategori tanpa fungsi. |
| `SEM.3` | **Dekongruensi Nominalisasi** | Apakah klausa utama bebas dari tumpukan nominalisasi abstrak yang menyembunyikan pelaku tindakan? | Ubah nomina proses menjadi kata kerja aktif dan tampilkan pelakunya sebagai subjek. |
| `SEM.4` | **Paragraf Deduktif (KT → KPL → KPT)** | Apakah setiap paragraf hanya memegang satu gagasan pokok yang diletakkan di kalimat pertama (KT), lalu diikuti penjelas langsung (KPL) dan contoh/rincian (KPT)? | Pecah paragraf bergagasan ganda; pindahkan gagasan utama ke kalimat pertama. |
| `SEM.5` | **Repetisi Leksikal Murni** | Apakah istilah inti diulang secara konsisten antarkalimat tanpa diganti-ganti dengan sinonim bergaya yang memutus rujukan? | Samakan kembali penyebutan istilah inti di seluruh subbab. |
| `SEM.6` | **Scaffolding & Worked Example** | Untuk materi analitis/prosedural, apakah tersedia *worked example* yang memperlihatkan alur nalar langkah demi langkah sebelum meminta mahasiswa berlatih mandiri? | Tambahkan satu *worked example* terurai sebelum soal latihan atau pertanyaan refleksi. |
| `SEM.7` | **Prolog & Epilog Subbab** | Untuk naskah multi-paragraf/modul, apakah subbab dibuka dengan pengantar konteks (prolog) dan ditutup dengan penegasan inti/transisi (epilog)? | Tambahkan 2 sampai 3 kalimat prolog atau epilog yang mengaitkan subbab. |
| `SEM.8` | **Suara Tutor & Empati Bermartabat** | Apakah teks menyapa pembaca secara setara (`Anda`/`kita`), memberi arahan nyata, serta bebas dari kata meremehkan (`gampang`, `tinggal`, `sudah jelas`) maupun label kemampuan (`lemah`, `lambat`)? | Hapus kata meremehkan/label dan ganti dengan langkah bantu konkret. |
| `SEM.9` | **Ketepatan Ilmiah & Batas Konsep** | Apakah penyederhanaan bahasa tetap menjaga kebenaran konsep, syarat berlakunya rumus/aturan, satuan, dan tidak menyamakan korelasi dengan sebab-akibat? | Kembalikan syarat, satuan, atau batas penafsiran yang terlewat. |

---

## Format Catatan Audit Internal

```text
SEM.1 [YA/TIDAK] - <jika TIDAK: Paragraf X, kalimat Y -> perbaikan>
SEM.2 [YA/TIDAK] - ...
...
SEM.9 [YA/TIDAK] - ...
```

Selesaikan semua item `TIDAK` pada Tahap 4 (REVISE), lalu jalankan ulang `scripts/lint_bahasa_ajar.py`.
