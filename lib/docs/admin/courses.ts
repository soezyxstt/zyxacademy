import type { BilingualDocEntry } from "../types";

export const adminCourseDocs: BilingualDocEntry[] = [
  {
    slug: "mata-kuliah-dan-bab",
    id: {
      category: "Mata kuliah dan materi",
      title: "Menyiapkan mata kuliah dan bab",
      summary: "Tetapkan ID mata kuliah yang stabil dan susun urutan bab sesuai silabus sebelum menambahkan dokumen, video, atau kuis.",
      keywords: ["course", "mata kuliah", "id", "slug", "nama", "kategori", "bab", "silabus"],
      quickLinks: [
        { label: "Daftar mata kuliah", href: "/admin/courses", description: "Buat, cari, dan buka workspace mata kuliah." },
      ],
      sections: [
        {
          title: "Identitas mata kuliah",
          diagram: "course-hierarchy",
          paragraphs: [
            "Setiap mata kuliah di Zyx memakai satu **ID** yang sekaligus menjadi bagian dari URL. Saat disimpan, sistem otomatis menghapus spasi di awal dan akhir lalu mengubah seluruh huruf menjadi huruf kecil. ID hanya boleh berisi huruf `a` sampai `z`, angka `0` sampai `9`, dan tanda hubung (`-`), serta harus unik.",
            "Gunakan kode mata kuliah resmi sebagai ID bila tersedia, misalnya `ma1101` atau `fi1101`. Jika tidak memiliki kode baku, pakai nama ringkas seperti `kalkulus-1`. Untuk nama tampilan, gunakan judul resmi yang mudah dikenali murid, misalnya **Kalkulus IA**.",
          ],
          callouts: [
            {
              variant: "warning",
              title: "Jangan membuat ID baru saat nama berubah",
              body: "ID, nama tampilan, dan kode resmi memiliki peran berbeda. Jika nama mata kuliah berubah, cukup perbarui nama tampilannya. Jangan membuat mata kuliah baru atau mengubah ID langsung di database karena seluruh bab, dokumen, dan riwayat belajar terikat pada ID tersebut.",
            },
          ],
          steps: [
            {
              title: "Periksa katalog yang sudah ada",
              body: "Buka halaman [Mata kuliah](/admin/courses) lalu cari nama atau kode mata kuliah agar tidak membuat entri ganda.",
            },
            {
              title: "Buat mata kuliah baru",
              body: "Isi ID yang sudah disepakati, nama resmi, kategori yang sesuai, dan deskripsi singkat bila perlu.",
            },
            {
              title: "Verifikasi sebelum mengisi materi",
              body: "Buka workspace mata kuliah yang baru tersimpan dan pastikan ID, judul, serta kategorinya sudah tepat.",
            },
          ],
        },
        {
          title: "Menyusun bab sesuai silabus",
          paragraphs: [
            "Urutan bab bukan sekadar daftar isi. Sistem juga memakai judul dan urutan bab sebagai acuan saat mendeteksi kaitan dokumen pada unggah massal. Karena itu, ikuti urutan silabus resmi dengan penamaan yang konsisten.",
            "ID bab dibuat otomatis oleh sistem. Saat memberi tugas ke agen atau MCP, selalu gunakan ID bab yang dikembalikan oleh katalog, bukan menebak dari nomor urutnya.",
          ],
          steps: [
            {
              title: "Tambahkan seluruh bab utama",
              body: "Dari halaman [Mata kuliah](/admin/courses), buka mata kuliah terkait lalu tambahkan bab mengikuti urutan silabus.",
            },
            {
              title: "Periksa urutan dan simpan",
              body: "Pastikan tidak ada bab yang terlewat atau tertukar sebelum Anda mulai mengunggah PDF atau membuat kuis.",
            },
            {
              title: "Cocokkan berkas dengan bab",
              body: "Sebelum mengunggah materi, pastikan setiap topik berkas sudah memiliki bab tujuan yang jelas.",
            },
          ],
          callouts: [
            {
              variant: "danger",
              title: "Periksa dampak sebelum menghapus",
              body: "Menghapus mata kuliah atau bab dapat memengaruhi dokumen, video, kuis, dan pekerjaan authoring yang bergantung padanya. Untuk mengubah nama atau urutan, edit langsung entri yang ada tanpa menghapus lalu membuat ulang.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Courses and materials",
      title: "Setting up courses and chapters",
      summary: "Establish a stable course ID and ordered syllabus chapters before uploading documents, videos, or quizzes.",
      keywords: ["course", "id", "slug", "name", "category", "chapter", "syllabus"],
      quickLinks: [
        { label: "Courses", href: "/admin/courses", description: "Create, search, and open course workspaces." },
      ],
      sections: [
        {
          title: "Course identity",
          diagram: "course-hierarchy",
          paragraphs: [
            "Every course in Zyx uses a single **ID** that also forms its URL path. On save, the system trims leading and trailing spaces and converts the value to lowercase. Valid IDs contain only lowercase letters (`a` to `z`), digits (`0` to `9`), and hyphens (`-`), and must be unique.",
            "Use the official course code whenever one exists, such as `ma1101` or `fi1101`. If no official code exists, use a short slug such as `kalkulus-1`. For the display title, use the full name students recognize, such as **Kalkulus IA**.",
          ],
          callouts: [
            {
              variant: "warning",
              title: "Never create a new ID when a title changes",
              body: "Course ID, display name, and official code serve separate roles. When a course is renamed, edit the display name in place. Never recreate the course or mutate IDs directly in the database, as chapters, materials, and learning history bind to the ID.",
            },
          ],
          steps: [
            {
              title: "Search the existing catalog first",
              body: "Open [Courses](/admin/courses) and search by title or code so you do not create a duplicate course.",
            },
            {
              title: "Create the course",
              body: "Enter the agreed ID, official display name, category, and an optional short description.",
            },
            {
              title: "Verify the saved record",
              body: "Open the new course workspace and confirm the ID, title, and category before adding content.",
            },
          ],
        },
        {
          title: "Ordering chapters by syllabus",
          paragraphs: [
            "Chapter order defines the student reading sequence and acts as a matching signal during bulk document uploads. Follow the official syllabus order and keep chapter titles concise and consistent.",
            "Chapter IDs are generated by the system. When handing tasks off to an agent or MCP tool, always pass the chapter ID returned by the catalog rather than guessing from chapter numbers.",
          ],
          steps: [
            {
              title: "Add syllabus chapters",
              body: "From [Courses](/admin/courses), open the course workspace and create chapters in syllabus order.",
            },
            {
              title: "Review order and save",
              body: "Verify chapter titles and sequence before uploading PDFs or building quizzes.",
            },
            {
              title: "Map source files to chapters",
              body: "Confirm that every file you plan to upload has a matching target chapter.",
            },
          ],
          callouts: [
            {
              variant: "danger",
              title: "Check dependencies before deleting",
              body: "Deleting a course or chapter affects linked documents, videos, quizzes, and authoring runs. Edit titles or reorder chapters directly instead of deleting and recreating them.",
            },
          ],
        },
      ],
    },
  },
  {
    slug: "dokumen-materi",
    id: {
      category: "Mata kuliah dan materi",
      title: "Menamai dan mengunggah dokumen",
      summary: "Ikuti konvensi penamaan PDF, pilih kategori dan subkategori yang tepat, lalu kaitkan dokumen ke babnya.",
      keywords: ["pdf", "upload", "unggah", "nama berkas", "kategori", "soal", "pembahasan", "duplikat", "batch", "ma1101", "semester"],
      quickLinks: [
        { label: "Daftar mata kuliah", href: "/admin/courses", description: "Pilih mata kuliah lalu buka tab Dokumen." },
      ],
      sections: [
        {
          title: "Siapkan dokumen",
          diagram: "filename-anatomy",
          paragraphs: [
            "Semua dokumen materi harus berformat **PDF** dengan batas ukuran **50 MiB** per berkas, baik untuk unggah satuan maupun unggah massal. Sebelum mengunggah, pastikan teks terbaca jelas, versi berkas benar, dan tidak ada data pribadi atau label revisi informal di dalam nama berkas.",
            "Tim Zyx memakai pola nama berkas terstruktur agar metadata mudah dikenali saat unggah massal: huruf kecil dan angka saja, garis bawah (`_`) untuk memisahkan segmen, serta tanda hubung (`-`) untuk memisahkan kata di dalam satu segmen. Nomor bab memakai dua digit seperti `bab01`. Untuk ujian lintas bab (`uts`, `uas`, `up`), segmen bab boleh dihilangkan.",
          ],
          codeBlocks: [
            {
              label: "Contoh nama berkas standar tim",
              code: `ma1101_bab01_materi_limit-kontinu_slide_2025-sem1.pdf
ma1101_uts_soal_2024-sem1.pdf
ma1101_uts_solusi_2024-sem1.pdf`,
            },
          ],
          callouts: [
            {
              variant: "info",
              title: "Standar kerja tim vs validasi sistem",
              body: "Pola nama ini adalah standar operasional tim untuk mempercepat peninjauan dan deteksi otomatis. Sistem tidak menolak unggahan jika beberapa segmen tidak lengkap, tetapi tetap pisahkan berkas soal dan pembahasan agar tidak tercampur.",
            },
          ],
        },
        {
          title: "Kategori, judul, dan nama berkas",
          paragraphs: [
            "Judul yang dilihat murid berbeda dari nama berkas maupun kunci penyimpanan internal. Tulis judul yang langsung menjelaskan jenis materi, topik, dan periode bila perlu. Generator judul dan nama standar di halaman unggah membantu mempercepat pengisian, namun tetap periksa hasilnya sebelum menyimpan.",
            "Kunci penyimpanan (object key) dikelola sepenuhnya oleh aplikasi. Jangan menyusun atau mengubah kunci penyimpanan secara manual.",
          ],
          table: {
            caption: "Daftar kategori dan subkategori dokumen",
            headers: ["Kategori", "Subkategori yang tersedia", "Catatan penggunaan"],
            rows: [
              ["**Materi**", "`Materi Dosen`, `SCL`, `Modul`, `E-Book`, `Lainnya`", "Bahan bacaan, slide kuliah, atau modul konsep."],
              ["**Soal**", "`Kuis`, `KBF`, `Tutorial`, `Modul`, `UTS`, `UAS`, `UP`, `LTM`, `Lainnya`", "Naskah latihan atau ujian tanpa pembahasan."],
              ["**Pembahasan Soal**", "`Kuis`, `KBF`, `Tutorial`, `Modul`, `UTS`, `UAS`, `UP`, `LTM`, `Lainnya`", "Solusi atau kunci pembahasan yang terpisah dari berkas soal."],
            ],
          },
        },
        {
          title: "Unggah dan periksa",
          steps: [
            {
              title: "Buka bagian Dokumen pada mata kuliah",
              body: "Masuk ke [Mata kuliah](/admin/courses), pilih mata kuliah tujuan, lalu buka menu **Dokumen**. Pastikan seluruh bab tujuan sudah tersedia.",
            },
            {
              title: "Unggah PDF dan lengkapi metadata",
              body: "Pilih berkas PDF lalu periksa judul, kategori, subkategori, tahun, dan kaitan bab. Satu dokumen dapat dihubungkan ke lebih dari satu bab, tetapi minimal satu bab wajib dipilih.",
            },
            {
              title: "Simpan dan verifikasi",
              body: "Setelah tersimpan, pastikan dokumen muncul pada bab yang benar. Jika unggahan gagal, periksa format PDF, batas 50 MiB, kelengkapan metadata, dan pilihan bab sebelum mencoba ulang.",
            },
          ],
        },
        {
          title: "Unggah massal dan duplikat",
          diagram: "upload-duplicate-flow",
          paragraphs: [
            "Unggah massal menerima hingga **200 PDF** dalam satu proses. Sistem membaca nama berkas untuk memperkirakan judul, kategori, tahun, dan bab. Misalnya, berkas `UTS` diperkirakan terkait dengan separuh awal bab, sedangkan `UAS` dan `UP` dengan seluruh bab. Perkiraan ini hanya alat bantu, bukan keputusan kurikulum.",
            "Deteksi duplikat memakai **checksum** berkas pada mata kuliah yang dipilih. Dokumen lama yang belum memiliki checksum mungkin tidak otomatis terdeteksi. Tinjau setiap peringatan sebelum memilih **Lewati**, **Simpan keduanya**, atau **Timpa**.",
          ],
          callouts: [
            {
              variant: "warning",
              title: "Hati-hati saat memilih Timpa",
              body: "Opsi Timpa langsung memperbarui dokumen yang sudah ada. Pastikan target dokumen dan dampaknya pada materi aktif sudah tepat sebelum melanjutkan.",
            },
          ],
          steps: [
            {
              title: "Pilih berkas dan tinjau daftar draf",
              body: "Masukkan PDF ke antrean unggah massal lalu periksa hasil pembacaan otomatis untuk setiap baris.",
            },
            {
              title: "Koreksi metadata dan cek duplikat",
              body: "Sesuaikan judul, kategori, tahun, serta seluruh kaitan bab, terutama bila penomoran sumber berbeda dari urutan bab Zyx. Tinjau peringatan duplikat satu per satu.",
            },
            {
              title: "Jalankan unggah dan cek hasil akhir",
              body: "Pantau status tiap berkas. Jika ada yang gagal, ulangi hanya berkas yang gagal setelah memeriksa berkas yang sudah berhasil tersimpan.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Courses and materials",
      title: "Naming and uploading documents",
      summary: "Follow the PDF naming convention, pick the right category and subcategory, and link each document to its chapters.",
      keywords: ["pdf", "upload", "filename", "category", "questions", "solutions", "duplicate", "batch", "ma1101", "semester"],
      quickLinks: [
        { label: "Courses", href: "/admin/courses", description: "Select a course and open its Documents tab." },
      ],
      sections: [
        {
          title: "Prepare your PDFs",
          diagram: "filename-anatomy",
          paragraphs: [
            "All course documents must be **PDF** files up to **50 MiB** per file for both single and bulk uploads. Before uploading, confirm the text is legible, the file is the intended version, and no personal data or informal revision labels appear in the filename.",
            "The team uses a structured filename pattern so bulk upload auto-detection stays accurate: lowercase letters and digits only, underscores (`_`) between segments, and hyphens (`-`) between words inside a segment. Chapter numbers use two digits such as `bab01`. For multi-chapter exams (`uts`, `uas`, `up`), omit the chapter segment.",
          ],
          codeBlocks: [
            {
              label: "Standard team filename examples",
              code: `ma1101_bab01_materi_limit-kontinu_slide_2025-sem1.pdf
ma1101_uts_soal_2024-sem1.pdf
ma1101_uts_solusi_2024-sem1.pdf`,
            },
          ],
          callouts: [
            {
              variant: "info",
              title: "Team convention vs system validation",
              body: "This naming pattern is an operational standard that improves search and bulk auto-fill. The uploader does not reject files missing optional segments, but always keep question sheets and solution sheets in separate files.",
            },
          ],
        },
        {
          title: "Categories, titles, and filenames",
          paragraphs: [
            "The display title students see is separate from both the filename and the internal object storage key. Write titles that clearly state the material type, topic, and period when relevant. The built-in title and filename generator speeds up entry, but always review its output before saving.",
            "Storage keys are managed entirely by the application. Never construct or edit storage keys manually.",
          ],
          table: {
            caption: "Document categories and valid subcategories",
            headers: ["Category", "Available subcategories", "When to use"],
            rows: [
              ["**Materi** (Material)", "`Materi Dosen`, `SCL`, `Modul`, `E-Book`, `Lainnya`", "Lecture slides, concept handouts, or study modules."],
              ["**Soal** (Questions)", "`Kuis`, `KBF`, `Tutorial`, `Modul`, `UTS`, `UAS`, `UP`, `LTM`, `Lainnya`", "Practice sets or exam sheets without worked solutions."],
              ["**Pembahasan Soal** (Solutions)", "`Kuis`, `KBF`, `Tutorial`, `Modul`, `UTS`, `UAS`, `UP`, `LTM`, `Lainnya`", "Worked solutions or answer keys stored separately from question sheets."],
            ],
          },
        },
        {
          title: "Upload and verify",
          steps: [
            {
              title: "Open the course Documents section",
              body: "Go to [Courses](/admin/courses), open the target course, and select **Dokumen**. Confirm all needed chapters already exist.",
            },
            {
              title: "Upload the PDF and set metadata",
              body: "Select the PDF and verify its title, category, subcategory, year, and chapter links. A document can link to multiple chapters, and at least one chapter is required.",
            },
            {
              title: "Save and double-check",
              body: "Confirm the document appears under the intended chapters. If upload fails, check PDF validity, the 50 MiB limit, required metadata, and chapter selection before retrying.",
            },
          ],
        },
        {
          title: "Bulk upload and duplicates",
          diagram: "upload-duplicate-flow",
          paragraphs: [
            "Bulk upload accepts up to **200 PDFs** per batch. Filenames are parsed to suggest title, category, year, and chapter mappings. For example, `UTS` files default to the first half of chapters, while `UAS` and `UP` map to all chapters. Treat these suggestions as drafts, not curriculum rules.",
            "Duplicate detection compares file **checksums** within the selected course. Older documents uploaded without a checksum may not be flagged automatically. Review each warning before choosing **Skip**, **Keep both**, or **Overwrite**.",
          ],
          callouts: [
            {
              variant: "warning",
              title: "Verify before overwriting",
              body: "Choosing Overwrite replaces the existing document in place. Confirm the target record and downstream impact before proceeding.",
            },
          ],
          steps: [
            {
              title: "Queue files and inspect parsed rows",
              body: "Select your PDFs and review the auto-detected metadata in the staging list.",
            },
            {
              title: "Fix metadata and resolve duplicates",
              body: "Correct titles, categories, years, and chapter links, especially when source numbering differs from Zyx chapter order. Resolve each duplicate alert individually.",
            },
            {
              title: "Run upload and retry failures only",
              body: "Review per-file results once finished. Retry only failed files after confirming which records were already saved.",
            },
          ],
        },
      ],
    },
  },
  {
    slug: "video-mata-kuliah",
    id: {
      category: "Mata kuliah dan materi",
      title: "Mengelola video mata kuliah",
      summary: "Susun video ke dalam playlist per kelompok topik, lalu pastikan sumber, judul, dan thumbnail siap diputar murid.",
      keywords: ["video", "playlist", "youtube", "thumbnail", "sampul", "unggah", "mp4"],
      quickLinks: [
        { label: "Daftar mata kuliah", href: "/admin/courses", description: "Pilih mata kuliah lalu buka menu Video." },
      ],
      sections: [
        {
          title: "Siapkan playlist dan video",
          paragraphs: [
            "Setiap video wajib memiliki judul, sumber video (YouTube atau unggahan langsung), serta berada di dalam playlist milik mata kuliah yang sama. Anda juga dapat mengaitkan video ke bab tertentu agar selaras dengan silabus.",
            "Sebagai konvensi tim, beri nama playlist yang langsung menggambarkan kelompok materi seperti `Bab 1: Limit`. Gunakan judul video yang spesifik seperti `Limit fungsi aljabar` atau `Pembahasan soal limit (Bagian 1)` bila topik dibagi menjadi beberapa video.",
          ],
          steps: [
            {
              title: "Pilih atau buat playlist",
              body: "Buka [Mata kuliah](/admin/courses), pilih mata kuliah yang dituju, lalu masuk ke menu **Video** untuk membuat atau memilih playlist.",
            },
            {
              title: "Tambahkan video",
              body: "Tempel tautan/ID YouTube atau unggah berkas video langsung, lalu lengkapi judul dan pilih bab terkait bila relevan.",
            },
            {
              title: "Periksa hasil sebelum selesai",
              body: "Pastikan sumber video dapat diputar, thumbnail tampil rapi, dan video muncul di urutan playlist yang benar.",
            },
          ],
        },
        {
          title: "Format berkas, batas ukuran, dan thumbnail",
          paragraphs: [
            "Tautan atau ID YouTube yang valid otomatis dinormalisasi ke URL YouTube standar. Jika thumbnail kustom tidak diunggah, sistem memakai thumbnail bawaan YouTube. Pastikan video YouTube dapat diakses murid dan hak penggunaannya jelas.",
          ],
          table: {
            caption: "Batas format dan ukuran unggahan video",
            headers: ["Jenis aset", "Format yang didukung", "Batas ukuran"],
            rows: [
              ["**Unggah video (UI)**", "`MP4`, `WebM`, `MOV` (endpoint juga mengenali `MKV`, `M4V` sesuai MIME)", "**100 MB**"],
              ["**Thumbnail kustom**", "`JPG`, `PNG`, `WebP`", "**5 MB**"],
            ],
          },
          callouts: [
            {
              variant: "danger",
              title: "Menghapus playlist menghapus seluruh video di dalamnya",
              body: "Saat playlist dihapus, semua video di dalamnya ikut terhapus dan berkas video maupun thumbnail yang diunggah langsung dapat ikut dihapus dari penyimpanan. Periksa isi playlist sebelum menghapus.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Courses and materials",
      title: "Managing course videos",
      summary: "Organize videos into topic playlists and verify their source, title, chapter link, and thumbnail before publishing.",
      keywords: ["video", "playlist", "youtube", "thumbnail", "cover", "upload", "mp4"],
      quickLinks: [
        { label: "Courses", href: "/admin/courses", description: "Select a course and open its Videos tab." },
      ],
      sections: [
        {
          title: "Set up playlists and videos",
          paragraphs: [
            "Every video requires a title, a valid video source (YouTube or direct upload), and a playlist belonging to the same course. You can also link each video to a chapter so it aligns with the syllabus.",
            "As a team convention, name playlists by topic group such as `Bab 1: Limit`, and give videos specific titles like `Limit fungsi aljabar` or `Pembahasan soal limit (Part 1)` when splitting a topic across multiple videos.",
          ],
          steps: [
            {
              title: "Select or create a playlist",
              body: "Open [Courses](/admin/courses), pick the target course, and go to **Videos** to create or select a playlist.",
            },
            {
              title: "Add the video",
              body: "Paste a YouTube link/ID or upload a video file, then enter the title and choose a chapter if applicable.",
            },
            {
              title: "Verify playback and placement",
              body: "Check the source, title, playlist, chapter link, and thumbnail before saving, then confirm the entry in the list.",
            },
          ],
        },
        {
          title: "File formats, limits, and thumbnails",
          paragraphs: [
            "Recognized YouTube URLs and video IDs are normalized into canonical YouTube links. When no custom thumbnail is uploaded, the system falls back to the YouTube thumbnail. Confirm students can access the video and that usage rights are cleared.",
          ],
          table: {
            caption: "Video and thumbnail upload limits",
            headers: ["Asset type", "Supported formats", "Maximum size"],
            rows: [
              ["**Direct video upload**", "`MP4`, `WebM`, `MOV` (endpoint also accepts `MKV`, `M4V` with matching MIME)", "**100 MB**"],
              ["**Custom thumbnail**", "`JPG`, `PNG`, `WebP`", "**5 MB**"],
            ],
          },
          callouts: [
            {
              variant: "danger",
              title: "Deleting a playlist removes its videos",
              body: "Deleting a playlist deletes every video inside it and can remove uploaded video and thumbnail files from storage. Review playlist contents before confirming deletion.",
            },
          ],
        },
      ],
    },
  },
];
