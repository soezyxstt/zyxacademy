# Rubrik Audit Semantik (LLM Judge): Bahasa Ajar Indonesia

Jalankan audit ini pada **Tahap 3 (VERIFY)** setelah `scripts/lint_bahasa_ajar.py` selesai.

## Aturan Anti-Bias Evaluator

1. **Nilai satu dimensi per kali** secara biner (`YA` / `TIDAK`). Jangan memberi skor kabur seperti "cukup baik".
2. **Jangan bias terhadap teks panjang (*verbosity bias*).** Teks yang lebih ringkas tetapi hangat, jelas, dan akurat selalu lebih baik daripada teks bertele-tele.
3. **Tunjuk lokasi persis.** Untuk setiap jawaban `TIDAK`, kutip kalimat atau nomor paragraf yang melanggar dan sebutkan perbaikan spesifiknya.
4. **Jangan mengulang pemeriksaan kode.** Em/en dash, pleonasme, konjungsi awal kalimat, panjang kalimat, dan daftar kata diktat kaku sudah diperiksa oleh `scripts/lint_bahasa_ajar.py`.

---

## Daftar Periksa Konstitusi Pedagogis (Biner YA / TIDAK)

| ID | Dimensi | Pertanyaan Audit Biner | Tindakan Jika TIDAK |
|---|---|---|---|
| `SEM.1` | **Tes Baca Keras (Suara Tutor Sebaya)** | Jika dibaca keras-keras, apakah teks ini terasa seperti teman sebaya/kakak tingkat yang sedang menjelaskan langsung (pakai jembatan seperti `Nah,`, `Jadi,`, `Coba bayangkan...`, `Kalau menurut kalian...?`), bukan seperti diktat formal kaku (`X ialah...`)? | Ubah kalimat kaku menjadi gaya tutur akrab; tambahkan 1 sampai 2 jembatan percakapan alami atau pertanyaan pelibat. |
| `SEM.2` | **Konsep Dulu, Istilah Menyusul** | Apakah setiap konsep baru dibangunkan intuisinya lewat bahasa sehari-hari sebelum atau bersamaan dengan istilah resminya, dan istilah resmi dicetak **tebal** pada kemunculan pertama? | Jelaskan dulu apa yang terjadi secara konkret sebelum menempelkan istilah resmi. |
| `SEM.3` | **Definisi Utuh (Struktur + Fungsi)** | Apakah penjelasan istilah inti membuat pembaca paham *apa bendanya* sekaligus *apa efek/fungsinya* dalam kasus nyata? | Lengkapi definisi agar pembaca tahu kegunaan atau dampaknya, bukan sekadar label. |
| `SEM.4` | **Dekongruensi Nominalisasi** | Apakah kalimat utama bebas dari tumpukan nominalisasi abstrak yang menyembunyikan pelaku tindakan? | Ubah nomina proses menjadi kata kerja aktif dengan pelaku yang jelas. |
| `SEM.5` | **Paragraf Fokus Satu Ide** | Apakah setiap paragraf hanya memegang satu fokus pikiran dan mengalir mulus ke paragraf berikutnya? | Pecah paragraf yang menumpuk dua ide dan tambahkan jembatan singkat antarparagraf. |
| `SEM.6` | **Repetisi Istilah Konsisten** | Apakah istilah inti tetap disebut secara konsisten antarkalimat tanpa diganti-ganti dengan sinonim yang bikin bingung? | Samakan kembali penyebutan istilah inti di seluruh segmen. |
| `SEM.7` | **Contoh Konkret & Titik Rawan** | Untuk materi analitis/hitungan, apakah ada contoh konkret (*worked example*) yang mengurai langkah berpikir dan menandai bagian yang sering bikin salah paham? | Tambahkan contoh angka/kasus terurai dan catatan `Hati-hati di bagian ini...`. |
| `SEM.8` | **Hangat Tanpa Merendahkan** | Apakah teks bebas dari kata meremehkan (`gampang banget`, `tinggal gini doang`, `sudah jelas`) maupun label kemampuan (`lemah`, `lambat`)? | Hapus kata meremehkan/label dan ganti dengan panduan langkah nyata. |
| `SEM.9` | **Ketepatan Ilmiah 100%** | Apakah gaya santai tetap menjaga kebenaran konsep, rumus, satuan, dan syarat berlakunya aturan tanpa menyamakan korelasi dengan sebab-akibat? | Kembalikan syarat, satuan, atau batas penafsiran yang terlewat. |

---

## Format Catatan Audit Internal

```text
SEM.1 [YA/TIDAK] - <jika TIDAK: Paragraf X, kalimat Y -> perbaikan>
SEM.2 [YA/TIDAK] - ...
...
SEM.9 [YA/TIDAK] - ...
```

Selesaikan semua item `TIDAK` pada Tahap 4 (REVISE), lalu jalankan ulang `scripts/lint_bahasa_ajar.py`.
