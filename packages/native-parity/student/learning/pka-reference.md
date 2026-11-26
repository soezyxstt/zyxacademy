# Referensi Tutorial PKA dengan sesi Student

Respons di `pka-reference.json` berasal dari delapan permintaan GET yang ditandatangani ke API Student lokal. Basis data PostgreSQL hanya berisi data sintetis milik `tests/visual/native-parallel/student/product/learning-seed.ts`. Kedelapan permintaan mendapat HTTP 200 dan `Cache-Control: private, no-store`. Berkas respons berisi data tampilan sintetis.

| Rute | Anggota | Pengunjung yang masuk |
| --- | --- | --- |
| `/courses/tutorial-pka` | Pengumuman tersemat “Persiapan sesi Matematika”, sesi “Diskusi limit PKA”, sembilan simulasi dan skor terbaik 85 | Dialihkan ke `/courses/tutorial-pka/daftar` |
| `/courses/tutorial-pka/jadwal` | “Pengantar sesi tutorial” selesai. “Diskusi limit PKA” belum berlangsung dan memiliki tautan Meet sintetis. | Dialihkan ke `/courses/tutorial-pka/daftar` |
| `/courses/tutorial-pka/laporan` | Fisika 85 dan lolos Stage 1. Matematika dan Kimia belum dicoba. | Dialihkan ke `/courses/tutorial-pka/daftar` |

Skenario native `pka-signed-member` dan `pka-signed-visitor` mengulang respons GET tersebut saat membuka rute Student. Kedua skenario menolak permintaan di luar empat tampilan, parameter tambahan, bahasa selain Indonesia, serta metode tulis. Skenario pengunjung menguji otorisasi dan keadaan tujuan pendaftaran tertutup. Perbandingan gambar rute anggota membutuhkan tangkapan perangkat dari skenario anggota yang sama.

Referensi gambar web produk awal memakai viewport 380 × 844. Berkas itu mencatat keadaan anggota pada ukuran aslinya. Referensi Android memakai viewport 380 × 820. [Gambar web produk](../../../../tests/visual/native-parallel/student/learning/product)
