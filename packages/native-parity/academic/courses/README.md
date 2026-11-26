# Mata kuliah Admin di Expo

`CourseScreen` melayani 13 pola rute berikut melalui `AcademicFixtureEntry` dan `AcademicLiveScreen`. Dialog menggunakan `SharedDialog`. Hasil kuis, pengerjaan, dan peringkat memakai `ResponsiveTable`. Sesi fixture diikat ke akun, peran, dan skenario. Sesi autentik mengambil proyeksi dari Next.js melalui transport yang diikat ke akun dan origin. Seluruh pembacaan autentik memerlukan sesi dan peran Admin canonical, serta menggunakan respons `private, no-store`. Ganti akun atau peran menutup sesi layar. Fokus ulang setelah kembali menyegarkan daftar dan detail sambil mempertahankan filter.

| Rute web, relatif ke `/admin/courses` | Layar dan interaksi fixture | Operasi autentik |
| --- | --- | --- |
| `/` | Pencarian, kategori, pagination, buka detail, kembali dengan filter tetap aktif, tambah | `getCoursesWithStats`, baca daftar |
| `/[slug]` | Buka bab, tambah, edit, batal, hapus, urutkan, tautan ke bagian mata kuliah | `getCourseDetailData`, baca rincian dan versi daftar bab. Tambah serta edit bab melalui `saveChapterWithCanonicalProjection` |
| `/[slug]/analytics` | Filter kuis dan buka hasil per kuis | `getCourseDetailData`, baca ringkasan kuis |
| `/[slug]/analytics/[quizId]` | Distribusi skor, soal, pengerjaan, analisis berbasis data sintetis | `readAdminQuizInsight`, baca ringkasan, distribusi, soal, pengerjaan dan analisis tersimpan |
| `/[slug]/results` | Ringkasan kelas dan hasil per kuis | `getCourseDetailData`, baca jumlah pengerjaan selesai, skor dan tingkat kelulusan |
| `/[slug]/leaderboard` | Filter jenis, cari peserta, lihat pengerjaan | `readAdminCourseLeaderboard`, baca pengerjaan selesai untuk pemeringkatan mata kuliah |
| `/[slug]/documents` | Filter jenis dan bab, cari, buka dokumen, edit dan konfirmasi hapus | `listAdminCourseMaterials`, baca katalog |
| `/[slug]/documents/[materialId]` | Pratinjau teks, edit, simpan, terbitkan atau tarik publikasi | `listAdminCourseMaterials`, baca metadata dokumen yang muncul dalam katalog mata kuliah |
| `/[slug]/questions` | Filter asal, bab, kesulitan, lihat pembahasan dan konfirmasi hapus | `getCourseDetailData(slug, true)`, baca soal setelah pencatatan disclosure |
| `/[slug]/flashcards` | Filter bab, buka set, balik kartu, edit dan hapus set atau kartu | `getCourseFlashcardsData`, baca set serta sisi kartu |
| `/[slug]/videos` | Cari dan buka daftar putar, tambah atau edit metadata video, buka tautan HTTPS | `getCourseVideosData`, baca katalog dan ketersediaan pemutaran |
| `/[slug]/review` | Pilih jenis bundle dan buka detail | `loadMaterialWorkspaceData`, baca daftar bundle mata kuliah dan buka detail melalui modul administrasi |
| `/[slug]/settings` | Edit informasi dan harga, tinjau kesiapan demo, tetapkan demo, konfirmasi hapus mata kuliah | `getCourseSettingsData`, baca status dan pengaturan. Edit nama, kategori dan deskripsi melalui `saveCourseWithCanonicalProjection` |

Adapter baca berada di `lib/native/academic/course-section-reads.ts`. Detail kuis mencocokkan ID kuis dengan ID mata kuliah canonical atau legacy sebelum membaca pengerjaan dan mencatat disclosure. Peringkat mengirim identitas peserta dan pengerjaan untuk satu mata kuliah. Detail dokumen mensyaratkan satu hasil katalog yang cocok. Pemeriksaan dan keputusan di halaman bundle berada di modul administrasi.

Simpan informasi mata kuliah melalui `PATCH /api/native/academic/admin/courses/[slug]/settings`. Permintaan mengikat origin, sesi, peran dan revisi data. Simpan dan bukti hasil berada dalam satu transaksi serializable. Coba lagi dengan ID permintaan, target dan isi yang sama. Jika dialog ditutup atau layar dibuka ulang sebelum hasil diketahui, sesi yang masih aktif menyimpan permintaan. Buka **Periksa bab baru** atau **Periksa penyimpanan** untuk memeriksa hasil sebelum memulai perubahan baru. Server memeriksa sesi serta mata kuliah dan bab aktif setiap kali receipt dipakai kembali. Versi stale menerima konflik dan layar menawarkan pemuatan ulang. Tambah bab memakai `POST /api/native/academic/admin/courses/[slug]/chapters` dan edit bab memakai `PATCH /api/native/academic/admin/courses/[slug]/chapters/[chapterId]`. Revisi berasal dari bab canonical dan legacy dalam mata kuliah. Server membatasi bab pada mata kuliah tersebut, menambahkan bab baru di akhir, dan mempertahankan urutan saat menyunting. Formulir menyegarkan rincian setelah simpan. Data canonical-only menerima judul untuk bab. Perubahan harga, demo, pembuatan dan arsip mata kuliah, hapus atau urut bab, serta mutasi subbagian lainnya memakai fixture lokal. Penyunting dan pemutar materi berformat kompleks, spreadsheet pengerjaan, dan eksekusi analisis AI masih menggunakan alur web.

Perubahan ini memakai fungsi proyeksi canonical yang sama dengan `courses.update`, `chapters.create`, dan `chapters.update`. Endpoint native memakai izin sesi Admin dan bukti mutasi native sendiri. Pendaftaran tool MCP, scope, discovery, persetujuan, skill dan host prompt tetap mengikuti kontrak yang diterbitkan. Uji kontrak memeriksa pemanggil web, kompatibilitas kategori dan harga, serta urutan pencatatan disclosure.

## Bukti lokal

- `node --import tsx --test packages/native-parity/academic/courses/*.test.ts packages/native-parity/academic/http.test.ts` menguji pencarian, alias, penyimpanan fixture, replay, konflik, validasi, origin, batas peran dan status HTTPS dengan transport lokal.
- `.maestro/native-parallel/academic/courses.yaml` memuat filter daftar, navigasi kembali serta analitik. `courses-states.yaml` memuat kosong, penolakan, validasi, dan pulih dengan coba lagi.
- Referensi web menggunakan komponen produk dan fixture sintetis dalam `tests/visual/native-parallel/academic/`. Audit piksel Android dan iOS menunggu hasil CI perangkat. Pengujian kontrak HTTP memakai layanan uji. Skrip loopback `node packages/native-parity/academic/local/course-settings-smoke.mjs` menguji handler Next.js dan PostgreSQL sintetis, termasuk penolakan lintas mata kuliah, replay satu receipt, persaingan revisi, urutan bab, dan kursus canonical-only.
