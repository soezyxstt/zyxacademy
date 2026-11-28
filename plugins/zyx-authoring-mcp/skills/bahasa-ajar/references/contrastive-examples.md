# Contoh Kontras (Contrastive Few-Shot): Bahasa Ajar Indonesia

Gunakan pasangan `<bad_example>` dan `<good_example>` berikut untuk mengkalibrasi **suara tutor sebaya** sebelum menulis draf. Tiru ritme obrolan, jembatan berpikir, dan kejelasan sintaksisnya (jangan menyalin pembuka yang sama persis ke semua topik).

---

## 1. Diktat Kaku → Tutor Sebaya yang Mengalir (Sensitivitas Silang)

<bad_example>
Sensitivitas silang ialah respons terhadap percepatan yang tegak lurus sumbu ukur utama. Nilai 5 mV/g berarti percepatan 1 g pada sumbu melintang dapat menambah sekitar 5 mV pada keluaran. Jika kita menganggap semua keluaran berasal dari sumbu utama, ini setara galat terbaca 0.05 g. Konversi 0.05 g adalah pembacaan semu pada sumbu utama jika seluruh 5 mV dianggap berasal dari sensitivitas utama. Sensor tidak sedang menyatakan percepatan melintang 0.05 g; masukan melintangnya tetap 1 g dalam contoh ini.
</bad_example>

**Diagnosis:** Nada terasa seperti diktat kaku (`ialah`, `pada keluaran`, `galat terbaca`, `pembacaan semu`, `masukan melintangnya`), ada rujukan `ini` menggantung, dan langsung menghantam pembaca dengan definisi abstrak tanpa jembatan obrolan.

<good_example>
Bayangkan sensor percepatan yang tugas utamanya mengukur getaran ke atas dan ke bawah. Nah, kadang getaran dari samping ikut "bocor" masuk ke sinyal sensor. Kebocoran dari arah yang tegak lurus sumbu utama itulah yang disebut **sensitivitas silang** (cross-axis sensitivity).

Misalnya, sensitivitas silangnya 5 mV/g. Artinya, kalau ada getaran 1 g dari samping, sensor bisa ikut mengeluarkan tegangan tambahan sekitar 5 mV. Kalau menurut kalian bagaimana jadinya kalau kita mengira seluruh 5 mV itu datang dari sumbu utama? Jika sensitivitas utamanya 100 mV/g, tambahan 5 mV tadi akan terbaca seolah-olah ada percepatan 0,05 g di sumbu utama.

Hati-hati di bagian ini, soalnya sering bikin ketuker. Angka 0,05 g itu bukan berarti getaran dari sampingnya cuma 0,05 g. Getaran dari sampingnya tetap 1 g. Angka 0,05 g itu cuma efek salah baca di sumbu utama karena kita mengira sinyal 5 mV tadi dari sumbu utama.
</good_example>

---

## 2. Alur Penyelesaian Kaku → Menuntun Langkah Seperti Mengajari Teman

<bad_example>
Setelah nilai tegangan total diperoleh, dilakukan substitusi ke persamaan sensitivitas utama untuk menentukan percepatan terukur. Langkah tersebut memudahkan pencarian solusi akhir.
</bad_example>

**Diagnosis:** Pasif impersonal (`diperoleh`, `dilakukan substitusi`), tidak ada pelaku, dan terasa berjarak.

<good_example>
Nah, setelah kita dapat nilai tegangan totalnya, kita tinggal lanjut masukkan angka itu ke rumus sensitivitas utama. Dari sini, harusnya jauh lebih mudah untuk ketemu berapa percepatan yang terbaca sensor.
</good_example>

---

## 3. Dekongruensi Nominalisasi ke Klausa Aktif yang Akrab

<bad_example>
Penyebab dari berkurangnya daerah serapan air adalah terjadinya alih fungsi lahan secara masif yang mengakibatkan peningkatan risiko banjir.
</bad_example>

**Diagnosis:** Tiga nominalisasi beruntun (`berkurangnya`, `alih fungsi`, `peningkatan`) menyembunyikan pelaku dan terasa seperti laporan birokratis.

<good_example>
Kenapa risiko banjir makin tinggi? Salah satu penyebabnya, warga banyak mengubah lahan terbuka menjadi perumahan. Akibatnya, tanah yang bisa menyerap air hujan jadi makin sedikit.
</good_example>

---

## 4. Disiplin Konjungsi dan Rujukan Tegas

<bad_example>
Harga bahan pokok naik tajam bulan lalu. Sehingga daya beli warga turun. Ini membuat banyak keluarga harus memotong pengeluaran. Selain itu juga, ongkos kirim ikut naik.
</bad_example>

**Diagnosis:** Tiga pelanggaran `P0_HARD`: konjungsi intrakalimat `Sehingga` di awal kalimat, `Ini` berdiri sendiri tanpa nomina, dan konjungsi bertumpuk `Selain itu juga`.

<good_example>
Harga bahan pokok naik tajam bulan lalu, sehingga daya beli warga ikut turun. Kenaikan ini memaksa banyak keluarga memotong pengeluaran harian mereka. Selain itu, ongkos kirim juga ikut naik.
</good_example>

---

## 5. Jembatan Bahasa Sehari-hari + Istilah Resmi (Tanpa Merendahkan)

<bad_example>
Inflasi mengurangi daya beli masyarakat dan memunculkan biaya peluang dalam pengambilan keputusan konsumsi. Konsep ini gampang banget, tinggal pahami definisinya saja.
</bad_example>

**Diagnosis:** Menumpuk dua istilah teknis tanpa intuisi, lalu meremehkan pembaca dengan `gampang banget` dan `tinggal`.

<good_example>
Kalau harga hampir semua barang naik terus-menerus, uang yang kamu pegang otomatis cuma sanggup membeli barang lebih sedikit. Kondisi ini yang disebut **inflasi** (kenaikan harga barang dan jasa secara umum). Nah, gara-gara uangnya terbatas, setiap kali kamu memilih beli barang A, kamu harus merelakan barang B. Nilai pilihan terbaik yang terpaksa kamu korbankan itulah **biaya peluang** (opportunity cost).
</good_example>
