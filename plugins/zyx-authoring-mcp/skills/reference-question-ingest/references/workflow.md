# Payload dan preflight ingest historis

Baca bersama SKILL.md. Schema tool/contract aktif menentukan representasi yang sah. Petunjuk berikut membedakan informasi yang disimpan payload dari catatan fidelity author; jangan menambah field agar terlihat lengkap.

## Bentuk draft yang berlaku

`reference-question-draft.v1` memakai envelope `schemaVersion`, `source`, dan `questions`. Tidak memakai `draftId` atau field soal original seperti `explanation`, `tags`, dan `referenceLinks`.

- `source`: `sourceFileKey`, `solutionFileKey` nullable, `institution`, `assessmentType`, `year` nullable, `academicYearLabel` nullable, `term` nullable, dan `title` yang cocok dengan metadata katalog.
- Setiap question: `localId`, `questionNumber`, `part` nullable, `page`, `prompt`, `questionType`, `options`, `correctIndices`, `acceptableAnswers`, `answerProvenance`, `solutionProvenance`, `difficulty`, `cognitiveLevel`, `ideaLinks`, `quizEligible`.
- Satu draft memiliki satu file soal utama dan paling banyak satu file pembahasan. Kelompokkan beberapa file menjadi draft terpisah; jangan mencampur locator file lain dalam envelope yang sama.
- `page` adalah nomor halaman fisik PDF mulai 1 tempat soal/part dimulai, bukan nomor cetak yang mungkin memakai angka Romawi. Simpan rentang halaman lanjutan dan locator rinci pada catatan kerja jika schema tidak menyediakan field rentang.
- `localId` stabil untuk file/nomor/part yang sama menurut identity contract. Pertahankan pada retry; jangan mengacak identity untuk menghindari conflict.

Pada schema ini **tidak ada field teks solusi, solution-page range, gambar biner, atau shared-stimulus entity**. `solutionFileKey` dan provenance tidak membuktikan teks solusi per soal telah tersimpan. Jangan mengirim `solution`, `solutionText`, `stimulusId`, `pageEnd`, atau metadata rekaan. Jika operator memerlukan kemampuan yang tidak tersedia, laporkan batasnya sebelum mengklaim selesai.

## Contoh envelope tanpa kunci

Contoh sintaks berikut bukan data sumber nyata. Ganti seluruh placeholder dan isi soal dengan bukti PDF/katalog scope aktual sebelum validate. Jangan menyalin institution, tipe ujian, nomor, atau Idea contoh sebagai fakta. Case ini menunjukkan bahwa prompt lengkap tanpa kunci disimpan dengan eligibility false, bukan jawaban buatan.

```json
{
  "schemaVersion": "reference-question-draft.v1",
  "source": {
    "sourceFileKey": "REPLACE_WITH_CATALOG_FILE_KEY",
    "solutionFileKey": null,
    "institution": "REPLACE_WITH_VERIFIED_INSTITUTION",
    "assessmentType": "other",
    "year": null,
    "academicYearLabel": null,
    "term": null,
    "title": "REPLACE_WITH_EXACT_CATALOG_TITLE"
  },
  "questions": [
    {
      "localId": "local-question-1",
      "questionNumber": "1",
      "part": null,
      "page": 1,
      "prompt": "REPLACE_WITH_VERBATIM_COMPLETE_PROMPT",
      "questionType": "short_answer",
      "options": [],
      "correctIndices": [],
      "acceptableAnswers": [],
      "answerProvenance": "unavailable",
      "solutionProvenance": "unavailable",
      "difficulty": "easy",
      "cognitiveLevel": "remember",
      "ideaLinks": [
        { "ideaId": "REPLACE_WITH_SAME_COURSE_PUBLISHED_IDEA", "weight": 1, "role": "primary" }
      ],
      "quizEligible": false
    }
  ]
}
```

Gunakan `draftJson` berupa serialisasi seluruh envelope. `sourceFileKey` diambil fresh dari katalog saat eksekusi, bukan literal placeholder atau token yang disimpan di Git.

## Catatan fidelity per question/part

Buat tabel kerja di luar payload: file label/checksum, nomor, part, halaman fisik dan nomor cetak bila ada, rentang stem/opsi/stimulus, locator kunci, locator pembahasan, Idea evidence, status kelengkapan, dan blocker. Jangan menyimpan fileKey atau token pada laporan; ambil ulang dari katalog saat diperlukan.

Pertahankan shared stimulus di setiap `prompt` yang memerlukannya bila schema tidak menyediakan referensi stimulus. Salin teks yang sama persis dan label konteksnya, bukan parafrasa berbeda. Duplikasi literal konteks di sini menjaga row dapat dibaca mandiri dan bukan duplicate soal baru.

Pisahkan part bila tiap part punya jawaban sendiri dan row dapat mempertahankan konteks lengkap. Jika part b bergantung pada hasil part a, jangan menyisipkan jawaban a buatan agar b mandiri. Pertahankan satu row multipart bila dapat direpresentasikan secara jujur dengan type yang sesuai dan `quizEligible: false`; bila penggabungan akan mengubah tuntutan sumber, laporkan blocker.

Untuk tabel gunakan Markdown yang menjaga nilai/header/unit. Untuk visual penentu, gunakan representasi yang benar-benar didukung payload/renderer. Jangan menganggap locator halaman saja cukup untuk quiz eligibility. Bila visual tidak bisa direpresentasikan dengan fidelity atau dibaca, jangan submit row tersebut sebagai lengkap.

## Keputusan jawaban dan pembahasan

Nilai answer dan solution provenance secara terpisah:

| Bukti terbaca | Keputusan |
|---|---|
| Kunci resmi cocok nomor/part | `answerProvenance: official`; isi kunci sesuai bukti |
| Hasil akhir eksplisit pada file pembahasan yang terpasang | `answerProvenance: source_solution`; salin hasil, jangan menyelesaikan sendiri langkah yang hilang |
| Pembahasan cocok nomor/part dan span jelas pada file pembahasan | `solutionProvenance: source_solution`; catat locator sebagai bukti author |
| Pembahasan lengkap resmi pada file soal utama | `solutionProvenance: official`; catat locator, jangan memasang file yang sama sebagai `solutionFileKey` |
| Tidak ada kunci | `answerProvenance: unavailable`, `correctIndices: []`, `acceptableAnswers: []`, `quizEligible: false` |
| Kunci ada tetapi pembahasan tidak ada | Answer mengikuti bukti; `solutionProvenance: unavailable`; pembahasan kosong bukan blocker otomatis |
| Kunci dan pembahasan konflik | Block row dan laporkan dua locator; jangan memilih yang cocok dengan perhitungan model |

`official` hanya dari bukti otoritas sumber, bukan karena nama file mengandung “resmi”. Metadata non-nullable seperti institution/type yang tidak dapat dipastikan memerlukan keputusan; jangan menebak institusi dari course. Gunakan null untuk metadata opsional yang tidak diketahui. `zyx_generated` tersedia pada schema untuk kompatibilitas; jangan membuat answer/solution baru dalam ingest verbatim ini.

## Kunci dan eligibility

- Salin urutan opsi sumber; `correctIndices` memakai indeks mulai 0. Jangan menyimpan huruf A/B sebagai indeks dan jangan mengurutkan ulang opsi.
- Single choice dengan kunci tersedia harus memiliki tepat satu indeks benar. Multi-select mengikuti semua indeks yang dibuktikan sumber, tanpa duplikat.
- Jangan menambah opsi yang tidak ada atau memperbaiki distraktor buruk dari sumber.
- Short answer hanya eligible bila acceptable answer bersumber dan exact evaluation aman. Jangan menambahkan jawaban setara berdasarkan inferensi model agar dapat dinilai otomatis.
- Essay selalu `quizEligible: false`. Kunci unavailable selalu false. Eligibility true masih membutuhkan stimulus lengkap serta jawaban tidak ambigu; validasi schema saja tidak membuktikannya.
- Historical difficulty/cognitive level adalah klasifikasi author berdasarkan tuntutan soal; bukan izin mengganti isi atau mengklaim label itu berasal dari sumber.

## Pemeriksaan dan submit

Per row, wajib punya bukti: prompt/opsi lengkap, seluruh part/stimulus terwakili, page/identity benar, minimal satu Idea published same-course yang benar-benar menilai target, bobot positif total 1 tanpa duplikat, provenance jujur, kunci sesuai urutan, dan eligibility aman. Catat PASS/FAIL serta locator masing-masing. Row tanpa kunci dapat lulus fidelity dengan eligibility false; row kehilangan stem/visual penting tidak dapat lulus.

Bila sebagian row gagal, selesaikan row independen dan laporkan jumlah siap versus blocked. Jangan diam-diam menghapus row dari jumlah yang diminta. Submit subset hanya jika scope mengizinkan hasil parsial; bila kelengkapan seluruh dokumen diminta, simpan draft siap dan laporkan blocker sebelum submit parsial.

Jalankan `assessment.validate_reference_draft` pada envelope final. Revisi kegagalan tanpa menebak, ulangi fidelity preflight, dan submit payload yang sama hanya dengan otorisasi staging yang berlaku. Setelah timeout submit, inspeksi list/detail sebelum retry agar tidak membuat duplikat. Setelah sukses, cocokkan jumlah, nomor/part, source attribution, Idea links, provenance dan status melalui read tools. Laporan membedakan pasangan file pembahasan, teks solusi yang benar-benar disimpan (jangan diasumsikan), status review, dan eligibility; tidak mengklaim publish/runtime quiz.
