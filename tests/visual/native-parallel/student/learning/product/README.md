# Referensi produk Learning Student

Tangkapan halaman ini diambil dari Next.js lokal dengan sesi Better Auth yang ditandatangani untuk dua akun Student sintetis. Fixture PostgreSQL membuat kelas `learning-evidence-math` dan kampanye Tutorial PKA bila slot kampanye kosong. Fixture menambahkan satu topik dengan skor 56, satu flashcard, satu aktivitas, satu video, dua jadwal PKA, satu pengumuman, satu artikel PKA dan sembilan tahap simulasi. Nilai diagnostik Fisika 85 berasal dari percobaan yang dibuat oleh seed. [Seed](../../product/learning-seed.ts) · [Runner](../../product/learning-capture.ts)

Gunakan PostgreSQL loopback dengan nama database `student_evidence` yang sudah dimigrasikan. Jalankan checkout sumber Next yang hendak direkam dengan `BETTER_AUTH_URL` loopback sesuai proses server. Env fixture berisi koneksi database lokal dan secret Better Auth sintetis yang sama dengan server. Runner menolak origin dan database non-loopback.

```sh
bun --env-file=/path/to/fixture/.env.local tests/visual/native-parallel/student/product/learning-seed.ts
STUDENT_SERVER_SHA=$(git -C /path/to/next-checkout rev-parse HEAD) \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  bun --env-file=/path/to/fixture/.env.local tests/visual/native-parallel/student/product/learning-capture.ts
```

Secara default, runner menulis PNG dan `web.json` ke `artifacts/student-evidence/learning-product`. Gunakan `STUDENT_CAPTURE_DIR` untuk direktori hasil terpisah. `STUDENT_LEARNING_CAPTURE_IDS` menerima daftar ID yang dipisahkan koma untuk mengulang kasus tertentu. Satu browser membuka kasus secara berurutan dengan konteks terpisah per akun. Runner terlebih dahulu memanaskan rute Next.js lokal melalui HTTP bertanda tangan. Permintaan pihak ketiga diblokir. Tampilan perangkat emulasi menggunakan 380 × 844, DPR 1, locale `id-ID`, tema terang dan zona `Asia/Jakarta`.

Runner menunggu kontrol notifikasi akun muncul, lalu memeriksa teks, kontrol, dan tujuan redirect yang ditetapkan untuk tiap skenario. `web.json` mencatat rantai respons dokumen, kondisi yang diperiksa, SHA checkout server, versi browser dan checksum PNG. Pengambilan bukti tidak menjalankan pemutaran video, eksekusi Python, bergabung ke ruang live atau percobaan kuis PKA. Pemeriksaan perangkat Android dan iOS serta diff piksel tetap terpisah.

Pengambilan pada checkout web `7d93b3a5` menghasilkan 21 PNG pada 380 × 844 dari 20 kasus yang mencakup 17 pola rute. Bukti host live mengikuti redirect lewat rute tutor ke beranda. Pengunjung tanpa akses simulasi PKA diarahkan ke halaman pendaftaran. Kedua tangkapan pendaftaran identik karena berakhir di halaman yang sama. [Manifest](web.json)

Mastery, jadwal PKA, dan daftar materi PKA sempat gagal hidrasi sebelum pengulangan berhasil. Manifest menyimpan hasil lulus dari beberapa pengambilan pada checkout yang sama. [Manifest](web.json)
