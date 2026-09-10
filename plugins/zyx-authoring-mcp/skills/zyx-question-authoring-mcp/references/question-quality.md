# Question quality guide

Gunakan panduan ini untuk semua soal `zyx_original` yang dibuat atau diperbarui melalui workflow `quiz_bank`. Validator MCP memeriksa kontrak dan sebagian mutu agregat; author tetap wajib menjalankan preflight ini sebelum validasi.

## Invariant authoring

Setiap soal baru atau soal `zyx_original` yang diperbarui wajib:

1. memiliki minimal satu `ideaLink` ke Idea published dalam scope;
2. memiliki **tepat satu target utama** yang dinilai dan tepat satu link `role: "primary"`;
3. memakai Idea lain hanya sebagai `supporting` atau `required` bila benar-benar dibutuhkan untuk menyelesaikan target utama;
4. memiliki jawaban/kunci yang dapat dibuktikan dari Idea/source yang tersedia;
5. memiliki pembahasan yang menjelaskan alasan, bukan hanya menyebut jawaban;
6. berbeda secara substantif dari soal Zyx yang sudah ada;
7. tidak menyalin historical reference secara verbatim kecuali workflow yang dipakai memang `reference-question-ingest`.

Schema lama dapat menerima soal tanpa Idea link untuk kompatibilitas. **Jangan gunakan kelonggaran schema itu untuk authoring baru.**

## Pilih target sebelum menulis stem

Untuk setiap soal, tulis rencana internal:

```text
Primary Idea: <satu Idea>
Required/supporting Ideas: <jika ada>
Observable target: <apa yang harus dilakukan mahasiswa>
Question type: <multiple_choice | multiple_choices | short_answer | essay>
Cognitive level: <remember | understand | apply | analyze | evaluate | create>
Difficulty: <easy | medium | hard>
Reasoning pattern: <dari contract aktif>
Expected reasoning: <langkah inti, bukan prose jawaban akhir>
Historical relation: <none | inspired_by | adapted_from | derived_from>
```

Jangan mulai dari “buat soal hard” lalu mencari materi yang cocok. Mulai dari Idea dan target belajar, baru pilih bentuk soal.

## Catatan bukti per soal

Tambahkan ke rencana internal: gap yang ditutup, ID/detail soal pembanding yang dibaca, lokasi bukti Idea/source, lokasi Artikel bila isi tersedia, derivasi jawaban, dan hasil setiap opsi. Rencana ini tidak dikirim sebagai field draft baru.

Untuk pembatasan “hanya dari Artikel”, setiap konsep/kondisi yang diperlukan solusi harus ada pada teks Artikel yang dibaca. Data hipotetis baru boleh diletakkan lengkap pada stem untuk menerapkan aturan yang sudah diajarkan; jangan mengubahnya menjadi klaim fakta dunia nyata tanpa sumber. Jika Artikel belum tersedia dan tugas hanya meminta draft Idea-linked, laporkan `Article alignment: NOT_VERIFIED`, jangan mengklaim ready untuk ujian berbasis Artikel.

Jangan membuat default jumlah atau distribusi yang mengalahkan permintaan operator. Jika jumlah tidak ditentukan, buat satu kandidat per gap berbeda yang dapat dibuktikan dan laporkan cakupan yang dipilih. Penuhi batas yang diminta atau laporkan kekurangan secara eksplisit.

## Cognitive level operasional

Gunakan level berdasarkan pekerjaan mental yang benar-benar diperlukan, bukan kata kerja di stem.

- `remember`: mengambil fakta, definisi, rumus, istilah, atau urutan yang sudah dipelajari tanpa transformasi berarti.
- `understand`: menjelaskan makna, memilih interpretasi, membedakan konsep, atau membaca representasi sederhana.
- `apply`: memakai konsep/prosedur pada kasus yang jelas dan kondisi penggunaan sudah dapat dikenali.
- `analyze`: memilih informasi relevan, memecah kasus, menghubungkan beberapa representasi/Idea, atau menentukan penyebab kesalahan.
- `evaluate`: menilai klaim/metode berdasarkan kriteria yang harus diterapkan, bukan sekadar memilih hasil numerik.
- `create`: menghasilkan rancangan, model, argumen, atau solusi terbuka yang memiliki beberapa jawaban layak. Jangan memakai `create` untuk pilihan ganda biasa.

Jika jawaban dapat diperoleh dengan recall langsung, jangan memberi label `apply` hanya karena stem memakai konteks cerita.

## Difficulty operasional

Difficulty mengukur beban penalaran yang wajar bagi mahasiswa yang sudah mempelajari materi, bukan panjang kalimat atau angka jelek.

- `easy`: satu keputusan utama; informasi relevan eksplisit; sedikit atau tanpa transformasi.
- `medium`: dua atau lebih langkah terkait; mahasiswa harus memilih prosedur/representasi yang tepat atau menghindari satu miskonsepsi umum.
- `hard`: beberapa keputusan saling bergantung, integrasi Idea, kondisi batas, representasi tidak langsung, atau evaluasi metode. Tetap harus dapat diselesaikan dari materi yang diajarkan.

Dilarang menaikkan difficulty dengan angka besar, aritmetika membosankan, kalimat sengaja membingungkan, data tak relevan berlebih, atau jebakan bahasa.

## Pemilihan question type

### Multiple choice

Gunakan bila tepat satu opsi benar di bawah asumsi stem. Untuk authoring baru, gunakan empat opsi jika operator/contract tidak menentukan lain. Bila tiga distraktor yang masuk akal tidak dapat dibuat, revisi stem atau pilih tipe yang sesuai jika operator tidak mengunci tipe; jangan isi opsi acak.

Distraktor harus masuk akal bagi mahasiswa yang punya miskonsepsi tertentu. Prioritas sumber distraktor:

1. miskonsepsi yang tercatat pada Idea/source;
2. salah memilih kondisi penggunaan;
3. salah tanda, satuan, arah, atau transformasi yang masuk akal;
4. konsep dekat yang memang sering tertukar.

Jangan membuat distraktor dari angka acak atau pernyataan jelas tidak masuk akal hanya untuk melengkapi opsi. Hindari “semua benar”, “semua salah”, dan wording yang bergantung posisi opsi.

### Multiple choices

Gunakan hanya bila beberapa pilihan secara independen dapat benar dan kombinasi itu memang bagian dari target belajar. Stem wajib mengatakan “Pilih semua jawaban yang benar”. Harus ada minimal dua opsi benar dan minimal satu salah untuk authoring baru; `correctIndices` memuat seluruh opsi benar tanpa duplikat. Jangan mengubah soal single-answer menjadi multi-answer hanya untuk variasi.

### Short answer

Gunakan bila jawaban singkat dapat dinilai dengan bentuk yang jelas: istilah, nilai, satuan, atau ekspresi pendek yang didukung contract. Isi `acceptableAnswers` untuk variasi yang benar-benar setara. Jangan memakai short answer untuk jawaban panjang yang membutuhkan penilaian manusia.

### Essay

Gunakan bila targetnya penjelasan, analisis, evaluasi, pembuktian, atau sintesis yang tidak aman dipaksa menjadi opsi. Pertanyaan harus menjelaskan keluaran yang diharapkan. Pembahasan harus memuat elemen jawaban yang dinilai, bukan satu kalimat contoh.

## Stem dan data soal

Stem harus:

- menyatakan masalah lengkap tanpa bergantung pada opsi untuk memberi data penting;
- memakai simbol dan satuan konsisten dengan Artikel/Idea/source;
- menyebut asumsi atau kondisi yang diperlukan bila tidak standar;
- tidak memuat petunjuk tata bahasa menuju jawaban;
- tidak menguji trivia yang tidak berhubungan dengan target Idea;
- bebas internal ID dan istilah pipeline.

Untuk soal numerik, hitung jawaban secara independen sebelum finalisasi. Pastikan satuan, pembulatan, domain, tanda, dan toleransi konsisten. Jangan mengubah angka pada historical reference dan lalu menyebut soal itu sebagai referensi historis; soal hasil adaptasi tetap `zyx_original` dengan lineage yang tepat.

## Pemeriksaan kunci dan opsi sebelum payload

1. Selesaikan stem tanpa melihat opsi. Simpan hasil dan langkah pemeriksaannya.
2. Verifikasi dengan substitusi balik, cara kedua, pemeriksaan domain/satuan, atau penelusuran bukti untuk soal konseptual. Mengulang teks pembahasan bukan verifikasi independen.
3. Evaluasi setiap opsi di bawah asumsi stem. Catat benar/salah dan alasan; setiap distraktor harus punya pola salah yang spesifik.
4. Periksa ekuivalensi: `1/2` dan `0,5` bukan dua opsi berbeda jika keduanya menjawab hal yang sama. Periksa pula overlap, rentang, pembulatan, dan kondisi tersembunyi.
5. Setelah urutan opsi final, bentuk `correctIndices` dengan indeks **mulai 0**. Bila opsi diubah/diacak, hitung ulang indeks dan cocokkan dengan pembahasan.
6. Untuk short answer, gunakan hanya bentuk yang evaluator dukung. Jangan mengirim field `tolerance` atau `unit` milik cek Artikel ke draft soal. Jika toleransi numerik/equivalence yang dibutuhkan tidak tersedia, ubah format jawaban menjadi exact yang jelas atau gunakan tipe lain yang diizinkan.
7. Untuk essay, isi model jawaban, elemen yang wajib dinilai, dan alasan dalam `explanation`; jangan mengarang field rubric runtime jika schema tidak memilikinya.

Contoh editorial, hanya jika aturannya ada pada Idea/source scope:

- Stem: “Selesaikan -2x > 6.” Hasil independen: x < -3.
- Opsi final: `["x > -3", "x < -3", "x < 3", "x > 3"]`, sehingga `correctIndices: [1]`.
- Opsi 0 salah karena tidak membalik arah saat membagi negatif; opsi 2 salah tanda batas; opsi 3 salah tanda dan arah. Pembahasan harus menyebut pembagian negatif dan memeriksa nilai contoh/domain, bukan hanya “B benar”.

Jangan memakai contoh ini sebagai payload siap submit atau mengganti angka saja untuk menambah bank.

## Historical reference

Historical reference adalah konteks read-only untuk memahami bentuk ujian nyata dan gap bank soal.

Gunakan maksimal kandidat yang diizinkan skill/workflow. Untuk setiap referensi yang dipakai, tentukan role secara jujur:

- `inspired_by`: hanya pola/tema umum memengaruhi soal baru;
- `adapted_from`: struktur masalah cukup dekat tetapi wording/data/representasi diubah untuk soal original;
- `derived_from`: soal original diturunkan secara kuat dari referensi dan lineage perlu jelas.

Jangan menyamarkan salinan verbatim sebagai `inspired_by`. Jika tujuan operator adalah memasukkan soal historis apa adanya, hentikan `quiz_bank` dan gunakan `reference-question-ingest`.

## Cegah duplikat semantik

Sebelum membuat soal baru untuk satu Idea:

1. baca soal Zyx original yang sudah ada untuk Idea tersebut;
2. bandingkan target, reasoning pattern, representasi, dan jebakan utama;
3. jangan membuat soal baru jika yang berubah hanya angka, nama benda, atau susunan kalimat;
4. buat soal baru hanya jika ia menutup gap target, tingkat kognitif, tipe soal, difficulty, atau miskonsepsi yang nyata;
5. bandingkan juga dengan seluruh kandidat draft yang sedang dibuat; jangan hanya dedup terhadap bank lama. Label difficulty/type berbeda tidak membuktikan gap jika pekerjaan mentalnya tetap sama.

Coverage bukan tujuan jumlah. Satu Idea tidak membutuhkan banyak soal yang setara.

## Pembahasan wajib

Pembahasan harus dapat membantu mahasiswa memperbaiki cara berpikir. Minimal:

1. nyatakan konsep/aturan yang dipakai;
2. tunjukkan langkah atau alasan utama;
3. berikan jawaban akhir dengan satuan/kondisi bila relevan;
4. untuk pilihan ganda, jelaskan alasan benar/salah setiap opsi secara ringkas, dengan menggabungkan penjelasan bila beberapa opsi memiliki pola salah yang sama;
5. jangan hanya menulis “jawaban B karena sesuai rumus”.

Jika soal membutuhkan beberapa langkah, pembahasan harus menunjukkan langkah tersebut. Jika solusi memerlukan fakta yang tidak ada di Idea/source/Artikel yang terkait, soal belum layak.

## Preflight author wajib

Sebelum `assessment.validate_quiz_draft`, periksa setiap soal:

- [ ] tepat satu primary target dan satu link primary;
- [ ] minimal satu published Idea link dalam scope;
- [ ] cognitive level sesuai pekerjaan mental nyata;
- [ ] difficulty berasal dari penalaran, bukan noise;
- [ ] question type cocok dengan target;
- [ ] kunci/jawaban sudah diverifikasi;
- [ ] semua opsi masuk akal dan tidak ambigu bila ada;
- [ ] tidak ada semantic duplicate dengan bank yang dibaca maupun kandidat dalam batch lain;
- [ ] historical lineage jujur bila dipakai;
- [ ] pembahasan lengkap dan dapat diajarkan ulang;
- [ ] learner-facing text bebas ID internal;
- [ ] tidak ada fakta yang tidak dapat ditelusuri.

Jangan submit hanya karena `valid: true`. Jika preflight gagal, revisi walaupun MCP tidak mengeluarkan blocking issue.
