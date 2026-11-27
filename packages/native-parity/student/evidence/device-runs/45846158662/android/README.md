# Bukti Android Student pada 75843587

Job Android menjalankan APK rilis dari checkout `bdbaad76a07863f63e99528886286c7fa7c8f264`, hasil merge PR head `75843587d5ff277f2129dd1074af4f70ee76d365`. Job secara keseluruhan gagal. [Run](https://github.com/soezyxstt/zyxacademy/actions/runs/45846158662) · [Job Android](https://github.com/soezyxstt/zyxacademy/actions/runs/45846158662/job/140002198444) · [Provenance dan SHA-256](provenance.json)

- Smoke yang dihasilkan mencatat 199 lulus dan tiga terblokir. Percobaan ulang memulihkan 28 dari 29 kegagalan transport ADB. Kasus `student-course-unenrolled` kembali gagal karena emulator terputus. [Ringkasan](smoke-summary.json) · [Penyebab kegagalan](generated-failure-classification.json) · [Indeks tangkapan](smoke-captures.json)
- Maestro mandiri meluluskan pengalihan pendaftaran PKA, daftar materi panjang, dan pemulihan offline. Log mengaitkan 24 galat lain dengan ADB `device offline`, termasuk dashboard dan gerbang kuis. [JUnit](report.xml) · [Status skenario](standalone-status.json)
- Seluruh 33 pasangan yang ditargetkan kehilangan tangkapan native. Pemeriksaan kembali ke daftar materi lokal mencatat nol piksel berbeda di area daftar yang ditetapkan. [Perbandingan](comparison.json) · [Pemulihan gulir](scroll-restoration.json)
