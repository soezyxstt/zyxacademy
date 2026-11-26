# Bukti Android Student pada e2b8f44a

Job Android menjalankan APK rilis dari checkout `00d7045041fc83d87e82dc6f671a724e7555298a`, hasil merge PR head `e2b8f44a7885a87e20eb2ff71f937ed66aae7218`. Job secara keseluruhan gagal. [Run](https://github.com/soezyxstt/zyxacademy/actions/runs/45834308919) · [Job Android](https://github.com/soezyxstt/zyxacademy/actions/runs/45834308919/job/139960846941) · [Provenance dan SHA-256](provenance.json)

- Smoke yang dihasilkan mencatat 175 lulus, 25 gagal karena transport ADB, dan tiga terblokir. Percobaan ulang memulihkan 51 dari 76 kegagalan transport awal. [Ringkasan](smoke-summary.json) · [Penyebab kegagalan](generated-failure-classification.json) · [Indeks tangkapan](smoke-captures.json)
- Maestro mandiri meluluskan pemulihan draf kuis dan peringkat kursus. Log mengaitkan 25 galat lain, termasuk skenario gerbang kuis, dengan ADB `device offline`. Run ini belum memverifikasi perilaku tombol **Mulai kuis**. [JUnit](report.xml) · [Status skenario](standalone-status.json)
- Tiga pasangan peringkat kursus memiliki selisih piksel pada gambar penuh 380 × 820. Tiga puluh pasangan yang ditargetkan dan tangkapan pemeriksaan posisi gulir setelah kembali tidak tersedia. [Hasil piksel](comparison.json) · [Pemulihan gulir](scroll-restoration.json)
