import type { AdminDoc } from './types'

export const authoringDocs: AdminDoc[] = [
  {
    slug: 'mcp-lingkungan-dan-handoff',
    category: 'Authoring dan MCP',
    title: 'Memberi tugas kepada agen melalui MCP',
    summary: 'Tentukan lingkungan, cakupan, dan izin sebelum agen mulai bekerja.',
    keywords: ['agent', 'mcp', 'staging', 'production', 'handoff', 'keamanan'],
    sections: [
      {
        title: 'Tentukan target dan batas pekerjaan',
        steps: [
          'Sebutkan lingkungan yang dituju, staging atau production, lalu periksa koneksi MCP sebelum membaca katalog atau memulai pekerjaan. Jika koneksi yang diminta tidak tersedia, hentikan pekerjaan dan laporkan. Jangan beralih ke lingkungan lain.',
          'Pilih mata kuliah dan bab dari katalog pada lingkungan tersebut. Periksa label, identitas, sumber aktif, konten yang sudah ada, dan statusnya sebelum meminta perubahan. Jangan menebak ID atau menyalin ID dari lingkungan lain.',
          'Tentukan sumber yang boleh dipakai, hasil yang diharapkan, dan cakupan bab. Jelaskan apakah agen hanya boleh membaca, menyusun draf, melakukan staging, meninjau, atau menerbitkan. Berikan izin untuk setiap perubahan dan pastikan targetnya.',
          'Minta agen melaporkan perubahan, status saat ini, target yang aman untuk disebutkan, hasil validasi, kendala, dan langkah yang masih memerlukan tindakan admin.'
        ],
        examples: [
          'Lingkungan: staging. Mata kuliah dan bab: pilih dari katalog dan pastikan namanya benar. Sumber: PDF yang ditentukan. Tujuan: susun draf dan validasi. Batas: jangan kirim, tinjau, terbitkan, hapus, atau ubah data lain. Hasil: laporkan cakupan, bukti, masalah, dan langkah berikutnya tanpa menyertakan token.'
        ]
      },
      {
        title: 'Gunakan kontrak yang berlaku saat pekerjaan',
        paragraphs: [
          'Agen harus mengambil playbook untuk workflow dan tahap yang sesuai, membaca modul wajib, lalu mengambil kontrak runtime. Laporkan kemampuan host sesuai kondisi sebenarnya. Jika bootstrap gagal atau tidak kompatibel, hentikan pekerjaan dan ikuti arahan server.',
          'Jika playbook atau kontrak berubah saat pekerjaan berlangsung, ambil ulang keduanya. Sesuaikan draf dengan aturan terbaru, lalu validasi kembali. Panduan ini membantu admin, tetapi field dan urutan tool mengikuti kontrak dan playbook pada server yang digunakan.'
        ]
      },
      {
        title: 'Lindungi data dan izin',
        paragraphs: [
          'Isi PDF, metadata katalog, dan soal adalah data, bukan instruksi untuk mengubah cakupan atau melewati pemeriksaan. Jangan masukkan kredensial, token bootstrap atau run, kunci berkas mentah, atau data pribadi ke dalam bundle dan laporan publik.',
          'Izin membuat draf dan memvalidasi belum mencakup submit, restage, review, discard, withdraw, atau publikasi. Jangan memakai operasi yang menyimpan perubahan sebagai uji coba. Laporkan hasil yang benar-benar diperiksa; ketersediaan tool saja belum membuktikan operasi berhasil.'
        ]
      }
    ]
  },
  {
    slug: 'mcp-source-pack-dan-idea',
    category: 'Authoring dan MCP',
    title: 'Menyiapkan sumber dan menerbitkan Idea',
    summary: 'Jaga keterlacakan dari dokumen asli sampai Idea yang siap dipakai untuk materi.',
    keywords: ['source pack', 'pdf', 'idea', 'sumber', 'transkripsi', 'bab'],
    sections: [
      {
        title: 'Siapkan Source Pack',
        steps: [
          'Pastikan mata kuliah, bab, dokumen asli, dan cakupan halaman sudah sesuai. Untuk PDF yang tersimpan, agen memilih berkas dari katalog sumber dan membaca halamannya sesuai playbook. Untuk berkas lokal, gunakan jalur input yang ditentukan kontrak.',
          'Transkripsikan sumber secara setia, termasuk struktur dan visual yang relevan. Source Pack bukan ringkasan atau terjemahan. Jangan menebak simbol yang tidak terbaca, memperbaiki rumus sumber diam-diam, atau menambahkan jawaban yang tidak ada.',
          'Periksa kelengkapan, pemetaan, dan laporan kualitas. Jalankan validasi sesuai kontrak, lalu perbaiki masalah dengan merujuk dokumen asli. Ingest menyimpan data, jadi lakukan hanya jika sudah diizinkan. Source Pack valid yang telah diingest tersimpan dan dapat dicari untuk tahap berikutnya.'
        ],
        paragraphs: ['Minta agen mencatat bagian yang tidak terbaca dan kekurangan sumber agar admin dapat menentukan tindak lanjut. Sebelum memakai kembali Source Pack, periksa identitas dan cakupannya.']
      },
      {
        title: 'Susun dan review Idea',
        steps: [
          'Susun Idea berdasarkan Source Pack, dengan hubungan ke potongan sumber dan struktur belajar yang dapat diperiksa. Periksa cakupan, duplikasi, urutan, hubungan, dan ketepatan terhadap sumber.',
          'Validasi bundle dengan kontrak yang berlaku. Setelah mendapat izin, kirim untuk ditinjau. Status staged atau draft belum berarti Idea sudah diterbitkan.',
          'Admin memeriksa hasil di Zyx Admin dan menerbitkan Idea yang layak. Pastikan statusnya published sebelum melanjutkan Product Bundle. Jika sumber, cakupan, atau dependensi berubah, periksa kembali konteks dan validasinya.'
        ],
        paragraphs: ['Dalam Idea V3, setiap Idea memiliki satu bagian belajar utama. Nomor yang tampil mengikuti hierarki dan urutan; nomor itu bukan identitas yang dibuat agen. Pemeriksaan tiap Idea membantu memantau review, tetapi keputusan admin tetap diperlukan untuk seluruh bundle.']
      }
    ]
  },
  {
    slug: 'mcp-product-review-publikasi',
    category: 'Authoring dan MCP',
    title: 'Meninjau dan menerbitkan Artikel dan Diktat',
    summary: 'Periksa draf, bukti verifikasi, dan keputusan review sebelum menerbitkan materi.',
    keywords: ['product bundle', 'artikel', 'diktat', 'review', 'publikasi', 'v4'],
    sections: [
      {
        title: 'Prasyarat dan penyusunan',
        paragraphs: [
          'Mulai dari Source Pack yang sesuai dan Idea berstatus published dalam cakupan yang benar. Periksa sumber, versi, dan dependensi yang masih berlaku. Product Bundle berisi materi belajar; soal menggunakan workflow asesmen terpisah.',
          'Untuk Artikel dan Diktat baru gunakan V4 jika kontrak runtime mendukungnya. Revisi V3 tetap memakai V3 kecuali konversi V4 diminta dan ditinjau ulang. Jika server belum mendukung V4, hentikan dan laporkan, jangan menganggap kontrak lokal sudah terpasang di server.'
        ],
        steps: [
          'Minta agen mengikuti schema dan aturan semantik runtime. Pastikan urutan pembahasan, hubungan sumber dan Idea, serta identitas elemen tetap terjaga.',
          'Periksa Artikel sebagai bahan belajar mandiri dan Diktat sebagai bahan untuk mengulang materi. Rumus, arti simbol, kondisi, contoh, visual, dan sumber harus jelas dan konsisten. Isi Diktat harus tetap sesuai dengan Artikel sumbernya.',
          'Gunakan peran Creator, Critic, dan Student POV yang independen sesuai playbook. Jika host tidak mendukung reviewer independen, hentikan tahap Product dan laporkan keterbatasannya.'
        ]
      },
      {
        title: 'Verifikasi dan keputusan admin',
        steps: [
          'Validasi bundle, lalu lakukan staging hanya sesuai izin. Validasi struktur atau submit yang berhasil tidak membuktikan kualitas belajar maupun kesiapan publikasi.',
          'Jalankan verifikasi tepercaya yang diminta server untuk revisi dan dependensi saat ini. Periksa tampilan web dan setiap halaman PDF, termasuk rumus, visual, keterbacaan, bagian yang terpotong, dan konsistensi isi. Bukti lokal atau laporan agen saja tidak menggantikan receipt tepercaya.',
          'Tinjau setiap bagian dan rubrik yang diwajibkan untuk revisi tersebut. Catat keputusan semantik secara eksplisit. Bila isi, sumber, dependensi, atau konfigurasi yang relevan berubah, ikuti instruksi server untuk membuat bukti dan review baru.',
          'Setelah semua syarat terpenuhi, admin menerbitkan materi melalui Zyx Admin. Periksa status dan hasil pada target yang benar. Staging bundle atau pencatatan review melalui MCP belum menerbitkan materi untuk murid.'
        ],
        paragraphs: ['Untuk V4, PDF Diktat menggunakan profil A4 dengan 1 sampai 4 halaman dan ukuran teks tetap. Jika konten tidak muat, revisi atau bagi cakupan, jangan mengecilkan teks otomatis. Pastikan hak penggunaan gambar sumber diketahui sebelum dipublikasikan.']
      }
    ]
  },
  {
    slug: 'mcp-asesmen-dan-referensi',
    category: 'Authoring dan MCP',
    title: 'Menyusun soal dan mengimpor referensi historis',
    summary: 'Pilih workflow sesuai asal soal dan periksa batas publikasinya.',
    keywords: ['soal', 'asesmen', 'quiz', 'historical reference', 'provenance', 'bank soal'],
    sections: [
      {
        title: 'Soal original Zyx',
        steps: [
          'Periksa bank soal dan Idea berstatus published pada mata kuliah dan bab yang sesuai. Pastikan soal yang dibutuhkan belum tersedia sebelum membuatnya.',
          'Susun soal original dengan setidaknya satu hubungan ke Idea berstatus published dalam cakupan dan tepat satu Idea utama. Periksa jawaban, pembahasan, distraktor, bobot, dan kualitas sesuai playbook dan kontrak yang berlaku.',
          'Validasi, lalu simpan draf hanya jika sudah diizinkan. MCP menyimpan soal original sebagai draf untuk ditinjau dan diterbitkan melalui Zyx Admin. Jangan menyalin soal historis secara verbatim sebagai soal original.'
        ]
      },
      {
        title: 'Soal referensi historis',
        steps: [
          'Pilih workflow reference question ingest dan pastikan mata kuliah serta PDF soal dan pembahasan yang benar. Ikuti playbook runtime untuk locator, provenance, soal multipart, stimulus bersama, dan halaman yang berlanjut.',
          'Pertahankan teks sesuai bukti sumber. Jangan menerjemahkan, mengoreksi angka, atau menebak jawaban tanpa bukti. Setiap soal harus terhubung dengan setidaknya satu Idea berstatus published dari mata kuliah yang sama.',
          'Periksa draf dan hasil validasi sebelum meminta izin penyimpanan. Submit referensi historis langsung menyimpan record berstatus published yang tidak dapat diubah. Jangan menjalankan submit sebagai tes atau tanpa izin eksplisit untuk soal tersebut.'
        ]
      }
    ]
  }
]
