# Pengelolaan Admin di Expo

`ManagementScreen` menerima path, navigasi, client, akses Admin, dan kunci akun aktif. Integrator mengikat `createManagementClient` ke `NativeSessionTransport`. `ManagementFixtureScreen` dan `createManagementFixture` berjalan tanpa backend. Regresi rute dan status menggunakan 39 kasus deterministik dari `managementCases`. Draft editor tetap tersedia selama area pengelolaan dan sesi yang sama masih terpasang.

| Rute | Alur native dan kontrak web | Batas yang masih tersisa |
| --- | --- | --- |
| `/admin/blog` | Daftar dari `blogArticles` dengan urutan tanggal pembuatan. Artikel publik menuju proyeksi blog publik. Draf menuju pratinjau editor Admin. | Handoff berbagi bergantung pada host native. |
| `/admin/blog/new` | Isi judul atau heading Markdown, ringkasan, konten, media URL, kategori, status, dan tag. Pratinjau terpisah dari tulis. Terbit membutuhkan konfirmasi dan publikasi terjadwal ditolak. Simpan memakai `createBlogArticle`. | Unggah thumbnail atau media dari perangkat dan ringkasan AI web belum terhubung. Editor memakai ringkasan deterministik dari layanan blog ketika ringkasan kosong. |
| `/admin/blog/[id]/edit` | Baca dan simpan melalui `getBlogArticle` dan `updateBlogArticle` dengan revisi teramati. Konflik menahan perubahan lokal sampai editor memilih revisi yang ditinjau. Penarikan publikasi membutuhkan konfirmasi. | Renderer Markdown kompleks berasal dari host. Tanpa renderer, pratinjau menampilkan teks sumber. |
| `/admin/forms` | Editor, pratinjau, pengaturan, daftar dan pencarian. Konfirmasi saat preset 12 tipe mengganti isi draf dan saat membuat atau menghapus formulir. Baca melalui API custom forms. Simpan, konflik dan idempotensi melalui adapter Admin. | Preset tersimpan, lampiran gambar, opsi lanjutan per jenis dan ekspor belum terhubung. Pratinjau berkas memakai nama sintetis. |
| `/admin/forms/[id]` | Ringkasan, pertanyaan, individu, dan pengaturan memakai form dan respons yang telah diotorisasi. Denominator adalah jumlah responden. Pengaturan waktu dan perubahan penerimaan divalidasi. | Grafik web, tautan lampiran, dan Google Sheets memerlukan implementasi tambahan. |
| `/admin/media` | Buka folder, pustaka dan storage. Gunakan endpoint media yang sama untuk membuat folder, mengganti nama berkas, penghapusan dengan konfirmasi dan penyalinan dari storage. | Picker dokumen dan unggah/replace, pemindahan, rename folder, dan seleksi massal belum terhubung. |
| `/admin/docs` | Pencarian dan kelompok kategori memakai `searchAdminDocs` untuk katalog ID/EN. | Padding dan tipografi belum dibandingkan per perangkat. |
| `/admin/docs/[slug]` | Isi katalog yang sama, termasuk bagian, langkah, callout, tabel, kode, tautan cepat, Sebelumnya dan Berikutnya. Slug yang tidak dikenal menghasilkan pesan tidak ditemukan. | Diagram dan rich text inline web belum memiliki padanan penuh. |
| `/admin/meet` | Direktori peserta dan filter peran/kursus, pilihan akses, pencatatan riwayat paginasi, create/end/delete dengan konfirmasi. Adapter meneruskan ke handler Meet yang sama dan mengembalikan jumlah peringatan provisioning. | Rekonsiliasi status provider tidak pasti mengandalkan inspeksi web Admin. |
| `/admin/meet/[id]` | Analitik provider, kehadiran dan sesi, jumlah transkrip, dan tautan rekaman bila tersedia. Endpoint native mengambil data tanpa sinkronisasi izin Drive. | Baris transkrip lengkap dan operasi izin Drive belum terhubung. |
| `/admin/discussions` | Pencarian/filter, halaman berikutnya dan sebelumnya, riwayat pesan, balasan, status selesai dan buka kembali. `markRead` memakai bukti pengamatan dari layanan dan tombol eksplisit untuk halaman yang ditinjau. | Kanal khusus, composer kaya, lampiran, reaksi, laporan dan notifikasi live belum terhubung. |
| `/admin/pricing` | Kalkulator harga/fee memakai fungsi perhitungan web, tanggal Jakarta dan pengaturan yang sama. Voucher dan diskon komponen memakai transport Admin terpisah dari paket publik. | Perbandingan visual terhadap kedua kalkulator web belum dijalankan. |
| `/admin/tautan` | Filter kategori, buat, sunting, aktif/nonaktif, ubah urutan atomik dan hapus dengan konfirmasi. | Membuka tautan eksternal bergantung pada host native. |

## Otorisasi dan hasil operasi

- `GET /api/native/operations/management` memerlukan sesi aktif dan peran Admin. ID akun pada request harus cocok. Form, direktori Meet, tautan dan media tetap memanggil endpoint terotorisasi yang ada. Semua request Expo memakai transport yang mengikat origin, akun dan sesi.
- `POST /api/native/operations/management` memeriksa origin jika dikirim, tipe JSON, akun, dan sesi. Database memeriksa kembali sesi dan hak Admin saat blog, formulir, harga dan tautan ditulis. Mutasi dan receipt idempotensi disimpan secara atomik. Aksi diskusi meneruskan ke pemeriksaan peran dan akses kanal layanan yang sama. Balasan meneruskan ID percobaan yang sama.
- Efek media dan Meet dicatat sebelum handler provider dipanggil. Satu intent yang belum pasti tetap diblokir meskipun perangkat mengirim kunci berbeda. Tentukan hasil di Admin web sebelum aksi lanjutan. Meet delete hanya melaporkan sukses setelah pembacaan provider mengonfirmasi rekaman sudah hilang. Aksi uji memakai implementasi provider sintetis.
- Jalur native menggunakan sesi Admin UI. Tidak ada perubahan registrasi alat, OAuth scopes, consent, capability discovery, playbook, skill atau prompt MCP. Audit receipt native memiliki tipe entitas terpisah dari receipt MCP. Katalog yang sudah ada mencatat `blog.*`, `forms.*`, `media.*`, `meet.*`, dan `links.*`. Harga dan diskusi mempertahankan kontrak UI.

## Verifikasi lokal

```sh
bun test packages/native-parity/operations/management.test.ts
SKIP_ENV_VALIDATION=1 bun tests/integration/operations-management-authoring.mjs
SKIP_ENV_VALIDATION=1 bun tests/integration/operations-management-provider.mjs
```

Tes pertama mencakup inventaris 13 pola, isolasi fixture, penolakan akses, pemulihan baca, revisi draf, konsistensi respons, dan binding transport. Kedua skrip integrasi memakai PGlite dengan migrasi PostgreSQL repo. Cakupannya termasuk sesi dan peran yang dicabut, pengulangan permintaan, benturan payload dan revisi, hak peserta yang gagal sebagian, pending dan hasil provider tak pasti. Maestro `management.yaml` menjalankan pratinjau draf, validasi editor, detail formulir, pembatalan penghapusan, pemulihan, dan penolakan akses. Bukti perangkat dan diff mengikuti workflow operasi. Paritas piksel belum dinyatakan.

## Referensi web

Fixture `/management` merender halaman Formulir Admin, detail respons, dan komponen Dokumentasi Next.js asli tanpa shell Admin. Playwright memakai data sintetis yang sama dengan Expo, font fixture Zyx, zona UTC, locale `id-ID`, dan sRGB. Server berjalan di port 3211. Capture browser tidak menentukan hasil perangkat.

```sh
NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next dev tests/visual/native-parallel/operations --webpack -p 3211
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium node --import tsx tests/visual/native-parallel/operations/capture-management.ts
```

Enam PNG tersimpan. Lima dibuat pada viewport 380 × 844 DPR 1, termasuk editor formulir, daftar kosong, ringkasan respons, daftar dokumentasi, dan artikel dokumentasi gelap. Capture editor tambahan memakai viewport 402 × 874 DPR 3. Fixture editor mengukur lebar scroll 521 px pada kedua viewport. Daftar berisi belum mencapai data fixture saat batas tunggu. Percobaan berikutnya juga melewati batas tunggu hidrasi dan dihentikan agar capture lain dapat berjalan. [Manifest capture](../../../tests/visual/native-parallel/operations/references/management-reference-results.json)
