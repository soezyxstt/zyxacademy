# Pilihan bahasa pada Pengaturan Student

Tangkapan web menggunakan `SettingsClient` dari aplikasi Next.js dengan batas transport dan sesi sintetis dari fixture preferensi yang sudah ada. Native membuka layar asli `SettingsScreen` melalui `StudentFixtureRoute`. Keduanya menerima pilihan bahasa dan tema yang sama.

| Keadaan | Bahasa terpilih | Tema |
| --- | --- | --- |
| `id-light` | Bahasa Indonesia | Terang |
| `en-light` | English | Terang |
| `id-dark` | Bahasa Indonesia | Gelap |

Playwright menunggu komponen terpasang dan daftar sesi sintetis selesai, membuka pemilih bahasa, lalu memeriksa kedua opsi serta pilihan aktif. Atribut bahasa dan tema, viewport, dan DPR diperiksa sebelum pengambilan gambar. Setiap manifest mencatat parameter URI native, assertion Maestro yang harus selesai sebelum screenshot, serta hash sumber dan PNG. Ukuran web yang disimpan adalah 380 × 820 @1 untuk Android dan 402 × 874 @3 untuk iOS.

Maestro memeriksa judul, tab umum, dan status pilihan bahasa sebelum setiap tangkapan. Alur juga memilih bahasa lain dan memeriksa status pilihan serta konfirmasi penyimpanan dari transport fixture. Tema native diminta melalui parameter fixture. Pengambilan gambar dan verifikasi tema di Android atau iOS belum dijalankan untuk referensi ini.

Cakupan yang dicocokkan adalah **kontrol pilihan bahasa**. Web menggunakan menu dropdown dan native menampilkan pilihan sebaris. Tampilan akun, perangkat yang masuk, bacaan offline, tautan unduhan, dan navigasi disimpan sebagai konteks frame. Tangkapan ini tidak membuktikan paritas seluruh halaman, keberhasilan sesi produk, maupun jumlah rute signed tambahan.
