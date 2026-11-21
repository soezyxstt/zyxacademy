# Penerapan beberapa provider AI di Zyx

## Hasil yang dituju

Admin bisa memilih model per fitur, mengetahui fitur yang gagal melayani pengguna, lalu menelusuri penyebabnya hingga provider, model dan kelompok kuota. Pergantian secret menggunakan alias yang sama. Angka kapasitas selalu menjelaskan apakah sumbernya batas internal Zyx atau data dari provider.

## Urutan pengerjaan

| Tahap | Pekerjaan tim implementasi | Bukti selesai |
|---|---|---|
| 1. Baseline | Inventarisasi jalur generasi interaktif, job, Ops AI, Worker dan jalur langsung. Petakan cakupan event tersimpan, lease, cache dan sampel lokal. Catat konfigurasi lama menggunakan nama variabel dan alias. | Setiap fitur punya pemanggil, kebutuhan model, sumber metrik, dan cara kembali ke konfigurasi sebelumnya. |
| 2. Kredensial | Baca empat slot Gemini lama. Kaitkan setiap kredensial dengan provider, referensi secret, transport dan kelompok kuota yang dikonfirmasi. Kirim Interactions melalui gateway terautentikasi. Pilih alias BYOK pada transport gateway yang mendukungnya. | Dua key dalam project yang sama berbagi batas saat dipanggil serentak. Rotasi secret mempertahankan riwayat pemakaian. Key invalid mengisolasi satu kredensial, batas project mengistirahatkan seluruh kelompok terkait. |
| 3. Model | Perluas registry, invoker, pemanggil lama dan kontrak Worker. Tambah satu provider kedua untuk generasi teks di staging. Filter model sesuai kebutuhan gambar, JSON, streaming dan tool calling. Validasi konfigurasi model tersimpan sebelum aktivasi. | Satu fitur selesai melalui masing-masing provider dari alur normal. Satu permintaan pengguna tetap memiliki satu reservasi aplikasi meski ada beberapa percobaan. Timeout setelah pengiriman menghentikan fallback otomatis. Uji ulang tool dan lampiran sebelum memperluas cakupan. |
| 4. Monitoring | Hubungkan hasil akhir permintaan dan percobaan provider dengan ID korelasi. Gunakan data tersimpan untuk tren antarproses. Catat fitur, model aktual, alias tersamarkan, hasil, waktu, token jika tersedia, dan alasan fallback. Gunakan agregasi berbatas waktu serta paginasi server. | Skenario primary gagal dan fallback berhasil menghasilkan satu pengguna terlayani dan dua percobaan. Cache hit menghabiskan nol panggilan provider. Periode tanpa data menunjukkan status ketersediaan. Periksa otorisasi, kesegaran data dan tampilan 380 px. |
| 5. Peluncuran | Uji staging dengan input sintetis, lalu aktifkan provider kedua untuk satu fitur setelah disetujui. Bandingkan hasil akhir, latensi, biaya jika diketahui, dan mutu dengan contoh soal yang sama. Perluas per fitur setelah lolos. | Admin bisa mengembalikan pilihan ke Gemini, melihat efeknya di permintaan berikutnya, dan menelusuri permintaan sebelumnya. Embedding dan indeks materi mempunyai siklus migrasi tersendiri. |

## Keputusan yang dilayani halaman admin

| Halaman | Tampilan utama | Tindakan admin |
|---|---|---|
| Operasi | Insiden aktif berdasarkan keparahan, fitur terdampak, waktu mulai dan data terakhir. Gunakan aturan alert dan runbook Zyra yang ada. | Buka diagnosis terkait dan langkah pemulihan. |
| Analitik AI | Keberhasilan akhir per fitur dengan jumlah sampel, persentase diselamatkan fallback, kegagalan final, serta latensi ujung ke ujung. Tampilkan distribusi atau rentang p95 sesuai presisi sumber. Filter waktu, fitur, provider dan model. | Telusuri fitur bermasalah sampai urutan percobaan. Pisahkan estimasi biaya berdasarkan tarif, biaya terverifikasi, dan data yang belum tersedia. |
| Kunci dan kuota | Kredensial bermasalah di atas, kesehatan per pasangan kredensial dan model, sisa kapasitas internal per kelompok, penyebab pembatasan dan waktu pemulihan jika diketahui. | Temukan alias yang perlu dirotasi atau kelompok yang perlu ditunggu. |
| Model per fitur | Urutan model terkonfigurasi di samping model yang benar-benar melayani, tingkat fallback dan waktu respons pada periode yang sama. | Periksa kemampuan, uji pilihan, simpan atau pulihkan konfigurasi sebelumnya. |
| Penggunaan fitur | Tautkan angka adopsi yang relevan ke analitik AI dengan filter fitur yang tepat. | Bedakan fitur yang jarang dipakai dari fitur yang sering gagal. |

## Pekerjaan manual

Pemilik memilih provider kedua dan batas pengeluaran, memasukkan secret baru melalui penyimpanan secret, serta mengonfirmasi project atau akun yang berbagi kuota bila pemetaannya belum tersedia. Tim implementasi menyiapkan konfigurasi, impor alias lama, validasi, data uji, verifikasi dan prosedur pemulihan. Untuk rotasi rutin, pemilik mengganti secret pada alias yang sama. Untuk protokol provider baru, tim menambahkan adapter dan menguji kontraknya satu kali.

## Konfigurasi gateway

Semua panggilan provider memakai CF_AI_GATEWAY_URL dan CF_AI_GATEWAY_TOKEN. URL dapat berupa root gateway atau berakhiran /google-ai-studio. Konfigurasi yang hilang atau host lain menghentikan panggilan. Gemini memakai kredensial SDK yang sudah dipasang melalui gateway. Untuk beberapa key pada satu project gunakan GEMINI_PROJECT_ALIAS yang sama dan isi GEMINI_QUOTA_GROUPS pada Worker dengan daftar kelompok aktif yang sama. Worker menghitung tiap kelompok satu kali.

Simpan key GPT dan DeepSeek di Cloudflare BYOK. Isi AI_OPENAI_MODEL dan AI_OPENAI_BYOK_ALIASES atau AI_DEEPSEEK_MODEL dan AI_DEEPSEEK_BYOK_ALIASES. Beberapa alias dipisahkan koma. Untuk Meta atau Custom, daftarkan provider kustom yang kompatibel dengan Chat Completions di gateway yang sama dan isi AI_META_GATEWAY_ROUTE atau AI_COMPATIBLE_GATEWAY_ROUTE dengan slug custom- yang terdaftar, dengan base URL hingga prefiks API (misalnya /v1 bila endpoint provider berakhir /v1/chat/completions), beserta MODEL dan BYOK_ALIASES dengan prefiks yang sama. Playground staging menyediakan tiga prioritas model. Verifikasi melalui request sintetis dan log gateway sebelum aktivasi. Verifikasi juga dukungan rute Gemini Interactions pada gateway tujuan.

Di pemilih model, admin dapat mencari nama model dan memfilter provider. Setiap provider mendukung beberapa ID melalui MODEL, MODEL_2 dan seterusnya (empat slot OpenAI, lima Meta, tiga DeepSeek atau Custom) dengan prefiks provider yang sama, misalnya AI_META_MODEL_2. Isi ID sesuai akses akun. Seluruh varian berbagi rute gateway, alias kredensial, serta batas kelompok provider. Pertahankan pemetaan slot yang sudah dipilih fitur ketika menambahkan varian baru.

### Katalog selector

Pilihan baru memakai batas enam bulan kalender (UTC), dengan pengecualian Gemma 4 31B IT. Mode Contributor memakai tanggal rilis versi Spark induknya. Daftar rilis di `lib/ai/provider/recent-models.ts` mengacu pada [Google](https://ai.google.dev/gemini-api/docs/deprecations), [OpenAI](https://developers.openai.com/api/docs/changelog), [Meta](https://dev.meta.ai/docs/muse-spark) dan [DeepSeek](https://api-docs.deepseek.com/updates/). Setiap model baru memerlukan ID API, nama tampilan, provider, tanggal rilis, dan tautan publikasi resmi dalam katalog. Pilihan lama tetap terlihat pada penugasan yang sudah ada.

Saat admin membuka atau memuat ulang daftar, server memeriksa setiap provider melalui gateway dengan satu generasi singkat pada Flash Lite, GPT Sol, Muse Spark, DeepSeek Flash, atau slot utama untuk Custom. Worker mencadangkan kuota kelompok untuk setiap percobaan generasi. Google juga memeriksa metadata ID per model pada akun yang dikonfigurasi. Provider yang gagal hilang dari daftar pilihan. Pemeriksaan bersamaan berbagi hasil dalam satu proses. Keberhasilan disimpan 24 jam, kegagalan lima menit. Akun staging dengan alias yang sudah dikonfigurasi mendapat model standar dari registry. ID eksplisit di environment tetap diutamakan.
