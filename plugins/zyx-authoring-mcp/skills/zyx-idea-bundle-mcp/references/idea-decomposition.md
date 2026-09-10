# Idea decomposition guide

Gunakan panduan ini sebelum membuat `ideas.json`. Tujuannya adalah menghasilkan Idea yang stabil, cukup atomic untuk ditautkan ke produk/soal, tetapi tidak memecah satu konsep menjadi fragmen yang tidak berguna.

## Prinsip utama

Satu Idea harus mewakili **satu klaim, aturan, hubungan, atau kemampuan yang dapat diajarkan dan dinilai secara mandiri**. Atomic tidak berarti satu kalimat sumber = satu Idea.

Jangan membuat Idea hanya karena ada heading, bullet, baris rumus, atau kalimat baru pada sumber. Struktur sumber adalah bukti, bukan aturan pemecahan.

## Urutan keputusan dan tie-break

Untuk setiap fragment sumber, jalankan urutan ini dan simpan keputusan serta locator bukti:

1. Apakah fragment hanya heading, simbol penjelas, data contoh, atau satu langkah mekanis? Tautkan ke konsep/prosedur induk sebagai bukti, bukan Idea baru.
2. Apakah klaim setara sudah ada? Gabungkan provenance; jangan membuat entity atau self-relation baru.
3. Apakah kandidat menyatakan klaim lengkap beserta syarat kebenarannya? Jika tidak, lengkapi dari bukti sumber sebelum split.
4. Tulis target A dan target B dalam bentuk “mahasiswa dapat ...”. Jika tidak dapat menulis dua target mandiri tanpa mengulang target yang sama, pertahankan satu Idea.
5. Terapkan tes split hanya pada dua target mandiri tersebut. Tes split tidak memisahkan nama hukum dari hukum, rumus dari syarat wajibnya, atau prosedur dari langkah mekanisnya hanya karena teks dapat dipotong.
6. Jika kondisi domain menjadi target mandiri, buat Idea kondisi dan relasinya, tetapi tetap sebutkan kondisi itu pada rumus induk. Link bukan pengganti syarat kebenaran klaim.
7. Jika dua pilihan masih sama kuat setelah memeriksa bukti, catat dua kandidat dan dampaknya, lalu minta keputusan hanya untuk kandidat tersebut. Lanjutkan bagian lain yang tidak bergantung padanya.

Tabel kerja wajib: fragment/locator, target mandiri, keputusan `new`/`merge`/`support`/`blocked`, Idea induk, alasan, primary section. Label ini hanya catatan author, bukan enum payload.

Contoh: “Luas persegi panjang A = p × l; p panjang dan l lebar” menjadi satu Idea, bukan tiga. Contoh luas dengan angka menjadi bukti pendukung. Klaim tambahan tentang hubungan luas dan faktor skala dapat menjadi Idea kedua jika sumber benar-benar mengajarkannya.

## Tes split

Pisahkan kandidat A dan B menjadi dua Idea jika salah satu kondisi berikut benar:

1. mahasiswa dapat memahami/menguasai A tanpa menguasai B;
2. A dan B dapat memiliki prasyarat yang berbeda;
3. A dan B dapat diuji dengan target yang berbeda;
4. salah satu dapat berubah atau dikoreksi tanpa mengubah yang lain;
5. hubungan A-B lebih tepat dimodelkan sebagai `prerequisite`, `extends`, `example_of`, atau `misconception_of` daripada digabungkan dalam satu statement.

Contoh:

- “Kecepatan adalah turunan posisi terhadap waktu” dan “percepatan adalah turunan kecepatan terhadap waktu” biasanya dua Idea.
- “Syarat penyebut tidak nol” untuk rumus tertentu dapat menjadi Idea terpisah bila syarat itu menentukan domain penggunaan dan sering diuji/melanggar solusi.

## Tes merge

Gabungkan kandidat bila semua kondisi berikut benar:

1. keduanya selalu dibutuhkan sebagai satu unit untuk memahami klaim;
2. memisahkannya menghasilkan fragmen yang tidak bermakna sendiri;
3. keduanya memakai prasyarat, tujuan, dan bukti utama yang sama;
4. tidak ada manfaat nyata untuk memberi link produk/soal yang terpisah.

Contoh:

- Nama hukum + pernyataan hukum yang tidak bermakna bila dipisah biasanya satu Idea.
- Rumus dan arti langsung dari rumus boleh satu Idea jika arti itu hanya menjelaskan relasi yang sama, bukan kemampuan baru.

## Aturan per jenis isi

### Definisi

Buat satu Idea untuk definisi inti. Pisahkan sifat/konsekuensi yang dapat diajarkan atau diuji sendiri.

### Rumus

Jangan otomatis membuat satu Idea per rumus. Tentukan apakah rumus adalah:

- representasi dari Idea konsep yang sama → simpan pada Idea itu;
- aturan/prosedur baru yang punya kondisi penggunaan sendiri → boleh menjadi Idea terpisah.

Arti simbol tidak perlu menjadi Idea sendiri bila hanya metadata untuk memahami rumus. Buat Idea terpisah hanya jika simbol/parameter memiliki makna konseptual yang memang diajarkan dan diuji sendiri.

### Prosedur

Satu prosedur multi-langkah dapat tetap menjadi satu Idea jika targetnya adalah kemampuan menjalankan prosedur utuh. Pecah langkah hanya bila satu langkah merupakan keputusan/aturan penting yang berdiri sendiri atau dipakai ulang di prosedur lain.

### Contoh

Contoh biasanya bukan Idea baru. Tautkan sebagai bukti, aplikasi, atau `example_of`. Buat Idea baru hanya bila contoh memperkenalkan prinsip/kasus khusus yang memang dinyatakan sumber sebagai pengetahuan yang perlu dikuasai.

### Penerapan

Aplikasi bukan otomatis Idea. Buat terpisah bila mahasiswa perlu mengetahui kapan/mengapa konsep berlaku pada konteks tersebut, bukan sekadar melihat contoh penggunaan.

### Miskonsepsi

Buat Idea miskonsepsi hanya bila sumber memberi pola salah yang cukup jelas dan koreksinya penting. Tautkan ke Idea konsep dengan `misconception_of`.

### Batas dan kondisi

Kondisi berlaku, domain, asumsi, atau pengecualian harus tetap terlacak. Gabungkan ke Idea utama jika hanya satu syarat kecil yang selalu menyertai klaim. Pisahkan bila syarat tersebut mengubah cara memilih metode atau sering menjadi target keputusan.

## Duplikat lintas sumber

Jika dua source chunk menyatakan pengetahuan yang sama:

- jangan membuat dua Idea hanya karena sumbernya berbeda;
- buat satu Idea dengan provenance yang sesuai;
- jika formulasi berbeda tetapi maknanya sama, pilih canonical statement paling jelas yang tetap source-grounded;
- jika ada konflik substantif, jangan memilih diam-diam. Tandai kebutuhan keputusan/stop sesuai skill.

## Canonical statement

Canonical statement harus:

- menyatakan satu klaim/kemampuan lengkap;
- dapat dipahami tanpa ID internal;
- tidak menyalin heading kosong seperti “Contoh 2”;
- tidak menggabungkan beberapa klaim dengan “dan” jika klaim tersebut lulus tes split;
- tetap didukung langsung oleh provenance.

`conciseExplanation` menjelaskan Idea, bukan menambahkan Idea kedua.

## Learning section

Setiap Idea wajib punya tepat satu primary section. Pilih section tempat mahasiswa pertama kali mempelajari Idea secara penuh. Supporting membership boleh ada di section lain untuk sintesis, aplikasi, atau prasyarat, tetapi jangan memakai supporting section untuk menghindari keputusan primary.

## Relation rules

Buat relation hanya bila dapat melengkapi kalimat berikut secara jelas:

- `prerequisite`: “Untuk memahami B, mahasiswa perlu menguasai A terlebih dahulu.”
- `extends`: “B menambah cakupan/ketelitian dari A.”
- `example_of`: “A adalah contoh konkret dari B.”
- `misconception_of`: “A adalah pola pemahaman salah tentang B.”
- `related`: ada hubungan berguna tetapi tidak memenuhi relasi yang lebih spesifik.

Jangan memakai `related` sebagai tempat semua pasangan Idea yang muncul berdekatan.

## Relation tanpa entity semu

`example_of` hanya dapat menghubungkan dua Idea yang memang ada; contoh biasa yang bukan Idea tetap ditautkan sebagai source/provenance pendukung. Jangan membuat Idea kosong agar tersedia endpoint.

Catat kalimat semantik lebih dulu, lalu petakan arah endpoint mengikuti schema resmi. Untuk prerequisite, nyatakan mana yang harus dikuasai lebih dulu; jangan mengasumsikan `from` selalu prerequisite tanpa membaca contract. Jika arah tidak dijelaskan contract/resource, jangan menebak. Untuk `related`, wajib tulis hubungan konkret selain “topiknya sama”; bila tidak ada, jangan buat edge.

## Preflight author

Sebelum `authoring.validate_idea_bundle`:

1. baca setiap canonical statement tanpa source di sampingnya;
2. pastikan satu statement hanya punya satu target;
3. lakukan tes split pada statement yang memuat dua klausa substantif;
4. lakukan tes merge pada Idea yang sangat pendek atau hampir sama;
5. periksa contoh/penerapan tidak berubah menjadi Idea tanpa alasan;
6. periksa formula dan kondisi tidak terpisah secara mekanis;
7. periksa duplikat lintas source;
8. pastikan setiap relation dapat dijelaskan dengan definisi relasi di atas;
9. pastikan setiap Idea punya provenance primer dan satu primary section.

Validator hijau tidak menggantikan keputusan pemecahan ini. Jika granularity masih ambigu dan akan memengaruhi produk/asesmen, berhenti untuk judgment operator/admin.
