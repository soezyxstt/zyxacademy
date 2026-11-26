# Font native

Font TrueType ini berasal dari [font Latin untuk referensi web](../../../../tests/visual/fixtures/fonts/README.md). Inter memakai bobot 400, 500, dan 600. Lexend memakai bobot 700 dari berkas sumber yang sudah statis. Lisensi SIL Open Font License masing-masing ada di direktori ini.

Untuk memperbarui aset setelah sumber berubah, gunakan FontTools dengan dukungan Brotli. Buka berkas WOFF2 memakai `TTFont` dengan `recalcTimestamp=False` dan atur `flavor = None` sebelum menyimpan sebagai TTF. Untuk Inter, jalankan `instantiateVariableFont(font, {"wght": weight}, updateFontNames=True)` untuk setiap bobot. Lexend hanya memerlukan konversi format.

Expo memuat font lokal sebelum galeri ditampilkan, termasuk saat dibuka di Expo Go. Alias di `typography.ts` memilih bobot yang sama di kedua platform, termasuk pada versi Android yang belum mendukung font variabel.
