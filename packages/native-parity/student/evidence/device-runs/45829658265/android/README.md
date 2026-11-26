# Bukti Android Student pada 14295fc2

Job Android menjalankan APK rilis dari checkout `ae4ceeff7e5bcc75980c511075079810335aa177`, hasil merge PR head `14295fc2494a4fca8da6e82b40f9ab3d3fb15abc`. Job secara keseluruhan gagal pada dua asersi Maestro dan perbandingan yang kehilangan pasangannya. [Run](https://github.com/soezyxstt/zyxacademy/actions/runs/45829658265) · [Job Android](https://github.com/soezyxstt/zyxacademy/actions/runs/45829658265/job/139944816133) · [Provenance dan SHA-256](provenance.json)

- Smoke yang dihasilkan mencatat 200 lulus dan tiga terblokir. Satu putaran ulang memulihkan seluruh 17 kegagalan transport ADB tanpa kegagalan akhir. [Ringkasan](smoke-summary.json) · [Indeks tangkapan](smoke-captures.json)
- Maestro mandiri mencatat 25 lulus dan dua gagal. Dashboard gagal pada asersi elemen `student-dashboard-achievements` terlihat. Gerbang kuis gagal pada asersi kontrol **Mulai kuis** terlihat dan aktif. [JUnit](report.xml) · [Asersi yang gagal](standalone-status.json)
- Perbandingan 380 × 820 mengukur 26 pasangan yang berbeda, dengan enam pasangan dashboard dan gerbang kuis tanpa tangkapan, satu pembaca materi terblokir karena renderer, dan dua pasangan referensi silang berbeda input di luar 33 pasangan yang ditargetkan. Pada alur awal kelas, 11 pasangan katalog, detail kursus, daftar materi, dan pembaca berbeda, sementara pembaca peserta aktif menampilkan fallback. [Hasil piksel](comparison.json)
- Pemeriksaan kembali ke daftar materi lokal mencatat nol piksel berbeda di area daftar yang ditetapkan. [Pemulihan gulir](scroll-restoration.json)
