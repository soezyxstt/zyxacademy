# Flashcard authoring guide

Gunakan panduan ini untuk semua child `flashcard` pada Product Bundle V3. Flashcard adalah alat **active recall**, bukan bacaan utama, bukan ringkasan bab, dan bukan asesmen bernilai.

## Peran produk

1. Artikel adalah satu-satunya bacaan utama mahasiswa untuk belajar isi bab.
2. Diktat adalah bahan review sebelum ujian.
3. Flashcard hanya membantu mengingat hal yang **sudah diajarkan di Artikel**.

Karena itu, flashcard tidak boleh menjadi tempat pertama suatu definisi, fakta, rumus, kondisi, langkah, atau pengecualian muncul. Bila informasi yang diperlukan untuk menjawab kartu belum ada pada Artikel learner-facing, perbaiki Artikel terlebih dahulu atau hapus kartu.

## Satu kartu = satu target ingatan

Sebelum menulis kartu, tulis satu `recallTarget` internal dalam bentuk singkat, misalnya:

- definisi konsep;
- arti satu simbol;
- satu rumus beserta kondisi pakainya;
- satu langkah penting dalam prosedur;
- satu hubungan sebab-akibat yang eksplisit;
- satu pembeda antara dua konsep yang sering tertukar.

Jangan membuat satu kartu yang meminta dua target bebas. Pecah kartu jika mahasiswa dapat menjawab bagian A benar tetapi bagian B salah tanpa kontradiksi.

Contoh yang harus dipecah:

- “Apa definisi momentum dan bagaimana rumus impuls?”
- “Sebutkan tiga asumsi dan jelaskan dua akibatnya.”
- “Apa rumus, satuan, arti semua simbol, dan contoh penggunaannya?”

## Bentuk front

Front harus:

- menyebut konteks yang cukup agar hanya ada satu jawaban yang dimaksud;
- meminta recall, bukan memberi petunjuk yang hampir membocorkan jawaban;
- dapat dipahami tanpa kode Idea, source ID, nama pipeline, atau referensi internal;
- tidak mengandalkan urutan kartu lain;
- tidak memakai “sebutkan semua yang kamu tahu”, “jelaskan topik ini”, atau pertanyaan terlalu luas.

Pilih bentuk sesuai target:

| Target | Bentuk front yang disarankan |
|---|---|
| Definisi | “Apa yang dimaksud dengan …?” |
| Rumus | “Apa hubungan matematis antara … pada kondisi …?” |
| Arti simbol | “Apa arti simbol … pada persamaan …?” |
| Langkah proses | “Setelah …, langkah berikutnya apa?” |
| Reverse concept | Beri ciri/hasil, minta nama konsep yang tepat |
| Pembeda | Minta satu pembeda yang benar-benar menentukan, bukan daftar panjang |

Cloze hanya dipakai bila bagian yang dikosongkan adalah satu target bermakna. Jangan membuat cloze yang dapat dijawab dari tata bahasa tanpa memahami materi.

## Bentuk back dan explanation

`back` atau jawaban kanonik harus menjadi jawaban lengkap terpendek yang tetap benar. Jangan menambah paragraf ajar bila satu atau dua kalimat cukup.

`explanation` boleh:

- memberi konteks singkat;
- menyatakan kondisi penggunaan;
- mengingatkan satu kebingungan umum;
- menghubungkan jawaban ke istilah yang dipakai di Artikel.

`explanation` tidak boleh:

- memperkenalkan fakta baru;
- berubah menjadi mini-Artikel;
- memberi worked example panjang;
- mengajarkan prosedur yang belum ada pada Artikel.

## Apa yang layak dibuat kartu

Buat flashcard bila target memang perlu diingat agar mahasiswa dapat mengikuti atau menerapkan materi, misalnya definisi inti, notasi penting, kondisi rumus, urutan langkah yang wajib, atau miskonsepsi yang sering tertukar.

Jangan membuat kartu hanya untuk memenuhi jumlah. Hindari:

- kalimat pembuka Artikel;
- trivia sumber;
- contoh numerik spesifik yang tidak punya nilai recall umum;
- langkah aljabar biasa yang tidak khas topik;
- pertanyaan yang sebenarnya memerlukan penyelesaian soal panjang;
- duplikat parafrasa dari kartu lain.

## Dedup dan cakupan

Sebelum menambah kartu baru:

1. cari kartu dengan target yang sama;
2. jika jawaban kanoniknya sama, gabungkan atau pilih front yang paling jelas;
3. jangan membuat kartu forward dan reverse bila versi reverse tidak menambah nilai recall;
4. jangan mencoba membuat satu kartu untuk setiap Idea secara mekanis; hanya buat kartu untuk hal yang memang perlu diingat.

Flashcard set yang baik boleh tidak memiliki kartu untuk Idea tertentu jika Idea tersebut terutama menuntut penalaran, bukan hafalan.

## Source dan bahasa mahasiswa

Setiap kartu harus tetap terhubung ke Idea/source struktural sesuai kontrak, tetapi learner-facing text hanya memakai istilah manusiawi. Isi kartu harus dapat ditunjuk kembali ke Artikel yang sudah menurunkan fakta tersebut dari Source Pack/Idea.

## Preflight wajib

Sebelum `authoring.validate_product_bundle`, untuk setiap kartu jawab YA pada semua pertanyaan berikut:

1. Apakah kartu memiliki tepat satu recall target?
2. Apakah target penting untuk diingat, bukan sekadar trivia?
3. Apakah jawaban sudah diajarkan di Artikel learner-facing?
4. Apakah front cukup spesifik tetapi tidak membocorkan jawaban?
5. Apakah back singkat, lengkap, dan tidak memuat beberapa target bebas?
6. Apakah explanation tidak mengajarkan fakta baru?
7. Apakah tidak ada kartu lain dengan target yang sama?
8. Apakah learner-facing text bebas ID internal?

Jika satu jawaban TIDAK, revisi sebelum memanggil MCP. `valid: true` dari MCP tidak menggantikan preflight ini.