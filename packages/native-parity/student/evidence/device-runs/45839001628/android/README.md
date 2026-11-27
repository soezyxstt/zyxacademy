# Bukti Android Student pada 0cc3c835

Job Android menjalankan APK rilis dari checkout `863ba52c773dcadcb4e20cc3734e6d922d37c0c5`, hasil merge PR head `0cc3c835251cead65ff838cde0c3e9c9ad3ccc0b`. Job secara keseluruhan gagal. [Run](https://github.com/soezyxstt/zyxacademy/actions/runs/45839001628) · [Job Android](https://github.com/soezyxstt/zyxacademy/actions/runs/45839001628/job/139977462101) · [Provenance dan SHA-256](provenance.json)

- Smoke yang dihasilkan mencatat 183 lulus, 17 gagal karena transport ADB, dan tiga terblokir. Percobaan ulang memulihkan 41 dari 58 kegagalan transport awal. [Ringkasan](smoke-summary.json) · [Penyebab kegagalan](generated-failure-classification.json) · [Indeks tangkapan](smoke-captures.json)
- Maestro mandiri meluluskan pemulihan jawaban setelah proses dimulai ulang serta navigasi peringkat komunitas. Log mengaitkan 25 galat lain dengan ADB `device offline`. Keadaan dashboard, gerbang kuis, dan pemulihan gulir setelah kembali belum terverifikasi dari run ini. [JUnit](report.xml) · [Status skenario](standalone-status.json)
- Seluruh 33 pasangan yang ditargetkan kehilangan tangkapan native. Kedua tangkapan region pemeriksaan posisi gulir juga tidak tersedia. [Perbandingan](comparison.json) · [Pemulihan gulir](scroll-restoration.json)
