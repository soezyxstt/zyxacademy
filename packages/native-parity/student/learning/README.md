# Pembelajaran Student di Expo

Status implementasi lokal. `LearningScreen` menerima sesi, transport, navigasi, renderer Markdown, dan pembuka browser dari entry Student. `createLearningFixtureRequest` menyediakan data sintetis untuk rute belajar, dan `learningFixtureCases` menetapkan tiga kasus untuk masing-masing 17 pola rute. Fixture materi PKA memakai layanan fixture kursus. Skenario tahap PKA memakai kontrak assessment untuk mulai, menjawab, mengirim, dan membuka skor. [Entry Expo](../../../../apps/mobile-native/features/student/learning/index.tsx) · [Kontrak](contracts.ts) · [Fixture](fixtures.ts)

## Operasi dan pemilik

`L` menunjuk ke `/api/native/student/learning`. Handler baru memeriksa sesi dan peran Student, kecocokan akun, serta izin sumber daya melalui layanan yang tercantum. Respons privat memakai `Cache-Control: private, no-store`. [Handler](../../../../app/api/native/student/learning/route.ts) · [Pemeriksaan sesi](../../../../app/api/native/student/_session.ts)

| Rute Student | Operasi dari Expo | Pemilik kontrak dan perilaku |
|---|---|---|
| `/courses/[id]/concept/[slug]` | `GET L?view=concept&courseId&slug` | Student. Izin penuh kelas sebelum membaca konsep, prasyarat, dan penguasaan untuk akun aktif. |
| `/courses/[id]/flashcard` | `GET L?view=flashcard&courseId`, `POST L` dengan `flashcard-review` | Student. Izin flashcard dan bab ditentukan server. SM-2 dan penilaian jawaban ketik memakai layanan web. Setelah respons yang tidak pasti, pengguna dapat memuat ulang antrean tanpa mengirim grade secara otomatis. |
| `/courses/[id]/mastery` | `GET L?view=mastery&courseId&locale` | Student. Izin penuh kelas sebelum membaca penguasaan Idea atau proyeksi konsep lama. |
| `/courses/[id]/path` | `GET L?view=path&courseId`, `GET /api/student/study-path?courseId&days` | Student. Kedua operasi memeriksa izin penuh kelas. Parameter hari meminta rencana dari layanan jalur belajar yang sama dengan web. |
| `/courses/[id]/playground` | `GET L?view=playground&courseId` | Student memeriksa hak kelas. Editor, eksekusi Python, dan pemulihan draft memakai Playground web di browser. |
| `/courses/[id]/progress` | `GET L?view=progress&courseId` | Student. Izin penuh kelas sebelum membaca statistik dan aktivitas belajar akun aktif. |
| `/courses/[id]/video` | `GET L?view=video&courseId`, `GET /api/videos/[videoId]/playback-url` | Student memiliki katalog. Layanan video bersama menerapkan izin penuh dan bab ketika memintakan URL putar. Expo menampilkan daftar, pencarian, dan filter bab, lalu membuka URL yang baru diminta melalui adapter browser. |
| `/courses/[id]/live` | `GET L?view=live&courseId`, `POST L/live` dengan kode ruang | Student memiliki aksi bergabung. Kontrak live bersama mendukung kelas aktif dan enrollment aktif. Server mencocokkan kode dengan ruang kelas dan membuat token terikat peserta serta ruang selama 60 detik. Koneksi ulang meminta token baru. Latihan Python dari ruang live memakai browser. |
| `/courses/[id]/live/host` | Buka `/tutor/[id]/live` | Tutor memiliki konsol tujuan dan izinnya. Expo menampilkan aksi menuju rute web Tutor. |
| `/courses/tutorial-pka` | `GET L?view=pka-home`, `POST L` dengan `pka-announcement-read` | Student. Keanggotaan kampanye membatasi jadwal berikutnya, pengumuman, dan hitungan percobaan milik akun. Menandai pengumuman aktif yang tidak disematkan dapat diulang. |
| `/courses/tutorial-pka/daftar` | `GET L?view=pka-registration` | Student. Pendaftaran ditutup. Peserta dengan enrollment diarahkan ke halaman utama kampanye. |
| `/courses/tutorial-pka/jadwal` | `GET L?view=pka-schedule` | Student. Keanggotaan kampanye membatasi jadwal. Tautan Meet untuk sesi mendatang dibuka melalui adapter browser. |
| `/courses/tutorial-pka/laporan` | `GET L?view=pka-report` | Student. Laporan memakai aturan diagnostik PKA yang sama dan progres milik akun. |
| `/courses/tutorial-pka/material` | `GET L?view=pka-material`, `GET /api/native/student/courses?view=material-list` | Student. Keanggotaan kampanye mendahului daftar materi generik, dengan `courseId=tutorial-pka` dan rute PKA tetap aktif. |
| `/courses/tutorial-pka/material/[materialId]` | `GET L?view=pka-material`, `GET /api/native/student/courses?view=material-detail` | Student. Izin materi dan bab diperiksa oleh screen serta handler kursus yang sama dengan materi biasa. |
| `/courses/tutorial-pka/simulasi` | `GET L?view=pka-simulation` | Student. Daftar memuat simulasi terbit dan metadata percobaan milik akun. Template yang dipetakan ke tahap membuka alur tahapnya. |
| `/courses/tutorial-pka/simulasi/[subject]/[stage]` | `GET L?view=pka-stage&subject&stage&attemptId`, rute kuis dan hasil Student | Student. Handler memeriksa kampanye, tahap, izin template, kepemilikan dan cakupan snapshot sebelum mencatat hasil yang selesai. Gateway penilaian memeriksa kunci tahap saat memulai atau melanjutkan. Payload tahap memuat identitas, status, dan skor. Pembahasan menggunakan aturan rilis hasil penilaian. |

Kampanye PKA mengikuti `isPkaEnrolled` pada web. Keberadaan rekam enrollment menentukan akses ke riwayat kampanye, termasuk jadwal dan laporan. Akses ke materi, template ujian, dan snapshot percobaan juga melalui kebijakan kursus masing-masing. [Kebijakan PKA](../../../../lib/pka-enrollment.ts) · [Layanan tahap](../../../../lib/pka-simulation.ts) · [Proyeksi PKA](../../../../lib/student/native-pka-learning.ts)

## Verifikasi dan dependensi

- Uji kontrak lokal mencakup penolakan sesi, locators, review flashcard, proyeksi video, alias PKA, fixture offline, dan pemulihan pertanyaan setelah menyambung ulang. PGlite memeriksa tanda tangan token, batas kelas, dan aturan tahap PKA. Tes web yang difilter memeriksa tujuan alias Tutor. [Kontrak HTTP dan fixture](../../../../tests/contracts/native-student-learning.test.ts) · [Fixture PGlite](../../../../tests/contracts/native-student-learning-postgres.test.ts)
- Gambar Playwright per rute, perbandingan piksel Android dan iOS, interaksi pembaca layar, putar video, masuk browser, dan koneksi layanan real-time masih memerlukan bukti perangkat. Browser sistem memerlukan `openExternal` dari host. Rumus dan Markdown menggunakan renderer terinjeksi bila tersedia, dengan teks sumber sebagai tampilan cadangan. [Kriteria paritas](../../../../plans/native-parallel/README.md)
- Katalog operasi menandai endpoint belajar, penilaian recall, pengumuman pribadi, dan bergabung ruang live sebagai operasi UI Student. Registrasi tool MCP, scope OAuth, consent, discovery, playbook, packaged skill, prompt host, dan binding lingkungan menggunakan kontrak yang berlaku. [Katalog operasi](../../../../lib/admin-mcp/operations-catalog.ts)
