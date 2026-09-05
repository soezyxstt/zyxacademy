# Product Bundle sebagai sumber belajar mandiri

Status: `COMPLETED / RESOLVED`

Tanggal: 2026-09-05

Implementasi lokal CP0 sampai CP8 selesai dan siap diajukan untuk perubahan staging. Dokumen ini tidak menyatakan deployment, mutation staging, atau validasi production telah dilakukan.

## 1. Hasil akhir dan pembagian tanggung jawab

**Artikel menjadi sumber yang cukup untuk siswa rata-rata belajar mandiri. Diktat menjadi ringkasan pra-ujian, diturunkan dari artikel, dengan ekspor PDF 2 sampai 4 halaman per bab.**

Perbaikan berlaku pada sistem authoring berikutnya, bukan hanya memperbaiki artikel limit. Audit limit menjadi kasus penerimaan utama, dilengkapi kasus lintas topik agar aturan tidak memaksakan pola kalkulus pada semua materi.

Keputusan yang sudah dikunci:

- Quality gate baru wajib untuk setiap publikasi dan publikasi ulang. Artikel yang sudah published tetap bisa dibaca.
- Admin wajib melakukan review pedagogi terstruktur atas revisi konten yang akan diterbitkan.
- MCP menyediakan kontrak, diagnostik, validasi, dan workflow review yang konsisten. MCP tetap tidak menyediakan publikasi.
- Ekspor PDF diktat benar-benar diimplementasikan dan diuji.
- Staging hanya boleh diinspeksi read-only. Deployment, upload, regenerasi konten staging, dan publish memerlukan otorisasi terpisah.
- Tidak menambahkan telemetry belajar atau mengubah produk soal ITB, flashcard, dan sistem penilaian sebagai pekerjaan sampingan.

| Pemilik | Tanggung jawab |
|---|---|
| Primary | Arsitektur, rubrik, seluruh perubahan skills, pemeriksaan diff, penilaian laporan, keputusan checkpoint, Playwright dan pemeriksaan visual langsung |
| AGY `gemini-3.8-flash-high` | Implementasi sistem, UI, MCP, PDF, dokumentasi terkait, fixture, dan tes otomatis |
| Admin produk | Review pedagogi atas konten sebelum publikasi melalui aplikasi |

Setiap checkpoint berakhir dengan keputusan primary: **PASS**, **REWORK**, atau **BLOCKED**. AGY tidak boleh memulai checkpoint berikutnya tanpa keputusan PASS yang menyebutkan checkpoint dan checksum hasil yang diterima.

## 2. Kontrak kualitas yang akan ditegakkan

### Artikel

Pertahankan struktur Article V3 dan jenis block yang sudah ada. Tambahkan metadata pedagogi dan payload terstruktur secara kompatibel, tanpa mengganti seluruh kosakata block.

Kontrak harus dapat menyatakan:

- Prasyarat dan bantuan singkat yang diperlukan untuk memahami topik.
- Tujuan belajar, intuisi, definisi, arti simbol, dan kondisi penggunaan.
- Contoh terpisah dengan langkah, alasan, dan verifikasi.
- Kebutuhan visual beserta referensi block yang memenuhinya.
- Cek pemahaman beserta jenis cek, jawaban, dan pembahasan.
- Estimasi belajar yang membedakan membaca dari mengerjakan contoh dan latihan.

Metadata harus menunjuk konten nyata. Label “memiliki visual” atau “ada pembahasan” tanpa payload terkait tidak memenuhi gate.

Ketentuan penerimaan:

1. Semua Idea tercakup dan memiliki provenance valid.
2. Setiap tujuan memiliki penjelasan dan cek pemahaman yang sesuai.
3. Topik formal memperkenalkan intuisi dan simbol sebelum menggunakannya.
4. Setiap contoh menjadi unit sendiri. Alasan langkah tidak boleh hanya diganti label “analisis” dan “bukti”.
5. Cek formatif menyertakan pembahasan yang dapat dibuka siswa. Cek formatif tidak diperlakukan sebagai soal ujian terlindungi.
6. Visual wajib ketika diperlukan untuk memahami tujuan. Pengecualian harus memiliki alasan dan keputusan reviewer.
7. Batas panjang menjadi pelindung keterbacaan, bukan alasan membuang langkah penting atau menambah filler. Pemecahan konten mempertahankan pemetaan learning section dan Idea.
8. Waktu belajar merupakan estimasi heuristik, bukan klaim hasil pengukuran siswa. Tidak menambahkan pelacakan aktivitas.

### Visual dan UI

Gunakan registry visual bertipe dengan renderer aplikasi. Implementasi pertama mencakup grafik epsilon-delta dengan parameter numerik tervalidasi dan fungsi yang didukung secara eksplisit.

- Tidak menerima JavaScript, HTML/SVG mentah, atau ekspresi executable dari bundle.
- Grafik memiliki label, deskripsi, fallback teks/tabel, dan representasi statis untuk cetak.
- Grafik limit menampilkan `c`, `L`, `L±ε`, `c±δ`, serta memperbarui tampilan ketika ε berubah.
- Preview admin dan reader siswa memakai renderer yang sama.
- Focus mode menyembunyikan navigasi yang mengambil ruang, menyediakan tombol keluar yang jelas, dan tidak meredupkan isi pelajaran.
- Contoh terpisah, rumus panjang mendapat ruang sendiri, dan ukuran huruf tidak diperkecil untuk menyembunyikan overflow.
- Chatbot tidak menutupi navigasi, jawaban, atau kontrol visual.

### Diktat dan PDF

Diktat merangkum konsep, formula beserta kondisi, prosedur, contoh kilat, jebakan, dan retrieval check yang relevan. Tidak menambahkan klaim baru di luar artikel.

- Lineage mengikat diktat ke revisi artikel.
- Edit artikel membuat hasil diktat dan bukti PDF terkait stale.
- Ekspor menggunakan render PDF nyata dengan profil A4 tetap, font tersemat/tersedia deterministik, body minimal 11 pt, dan tanpa shrink-to-fit.
- Target 2 sampai 4 halaman dihitung dari seluruh PDF per bab, termasuk judul. Tidak menambahkan halaman sampul terpisah.
- Tidak menggunakan jumlah kata sebagai pengganti pengukuran halaman.
- Jika cakupan tidak dapat dipadatkan secara aman, checkpoint berhenti untuk keputusan scope. Dilarang menghapus konsep penting atau mengecilkan font.
- Rendering memakai jalur job yang ada. Status pending atau failed memblokir publikasi, tanpa memblokir proses penyusunan draft.

### Review dan enforcement

Gunakan satu layanan evaluasi bersama untuk jalur aplikasi dan MCP.

Respons membedakan:

- `valid`: kontrak dan konten yang dapat diperiksa otomatis memenuhi syarat.
- `publicationReady`: seluruh gate publikasi, review admin, dependency, dan PDF terpenuhi.
- Diagnostik: kode, severity, target section/block, alasan, dan tindakan perbaikan.
- Versi kebijakan kualitas dan fingerprint konten yang dievaluasi.

Approval pedagogi disimpan sebagai keputusan admin, bukan field yang boleh dipercaya dari ZIP. Approval terikat pada fingerprint konten dan versi rubrik.

Rubrik memiliki delapan kriteria:

1. Ketepatan konsep.
2. Ketuntasan prasyarat.
3. Urutan penjelasan.
4. Kejelasan simbol dan kondisi.
5. Penalaran contoh.
6. Representasi atau visual.
7. Miskonsepsi dan batas berlaku.
8. Cek pemahaman dan pembahasan.

Setiap kriteria menggunakan `belum memenuhi`, `perlu revisi`, atau `memenuhi`, disertai anchor konten dan alasan. Publikasi membutuhkan seluruh kriteria relevan berstatus `memenuhi`; pengecualian harus beralasan dan disetujui admin. Nilai rata-rata tidak boleh menutupi satu kesalahan kritis.

## 3. Checkpoint dan metrik kelulusan

### CP0. Baseline dan paket penerimaan

**Eksekutor:** AGY. **Penilai:** primary.

Pekerjaan:

- Catat HEAD, perubahan staged/unstaged, dan fingerprint file yang berpotensi disentuh.
- Pisahkan pekerjaan dari perubahan pengguna yang sudah ada.
- Petakan jalur bundle → validator → compiler → review → publication → reader → PDF dan jalur MCP yang terkait.
- Inspeksi contoh limit staging read-only melalui prosedur repository, dengan kredensial dan sesi tetap dikelola lokal oleh primary.
- Ubah seluruh temuan audit menjadi matriks requirement, pemilik perbaikan, checkpoint, tes, dan bukti penerimaan.
- Buat fixture lokal: limit, topik matematika lain, dan topik nonmatematika. Fixture pembanding tidak memuat data pribadi.

**Gate:**

- 100% temuan audit memiliki disposition: diperbaiki, sudah dipenuhi dengan bukti, atau tidak berlaku dengan alasan.
- Seluruh entry point mutasi dan publikasi terkait terpetakan.
- Baseline tes dan perubahan sebelumnya tercatat.
- Tidak ada mutation staging, akses secret oleh worker, atau perubahan file pengguna.

**Bukti:** inventory, matriks audit, daftar file ownership, hasil baseline, dan daftar boundary yang belum terverifikasi.

### CP1. Kontrak, rubrik, dan tes penerimaan

**Eksekutor:** AGY. **Keputusan kontrak:** primary.

Pekerjaan:

- Implementasikan ekstensi schema, model diagnostik, fingerprint review, metadata pedagogi, visual bertipe, dan status PDF.
- Pertahankan kompatibilitas membaca dokumen lama.
- Siapkan fixture positif dan negatif untuk setiap gate deterministik.
- Siapkan rubric cases yang memerlukan penilaian manusia, terpisah dari tes otomatis.
- Jika membutuhkan schema database, gunakan Drizzle generate/migrate pada database lokal terisolasi.

**Gate:**

- Setiap gate deterministik memiliki minimal satu kasus diterima dan satu ditolak.
- Payload malformed, referensi konten putus, visual executable, dan metadata tanpa konten ditolak.
- Fixture lama tetap dapat dibaca.
- Migrasi lokal lulus dan tidak mengubah migration sebelumnya.
- Primary menyetujui kontrak sebelum implementasi jalur berikutnya.

**Tes:** schema, serialization/hash, kompatibilitas, migrasi lokal, dan security payload. Tes penerimaan untuk fitur yang belum diimplementasikan dicatat sebagai expected red, bukan kegagalan yang disembunyikan.

### CP2. Validator, compiler, dan publication gate

**Eksekutor:** AGY.

Pekerjaan:

- Hubungkan quality policy ke compiler dan layanan evaluasi bersama.
- Perluas mekanisme preservation review dan staleness yang sudah ada.
- Revalidasi fingerprint, dependency, approval, dan bukti PDF pada transaksi publikasi.
- Draft lama yang belum memenuhi kebijakan baru harus diperbaiki sebelum publikasi.
- Flag reader lama tidak boleh menjadi jalur bypass gate publikasi.
- Pertahankan idempotensi publikasi.

**Gate:**

- 100% kasus negatif deterministik CP1 ditolak pada boundary yang ditentukan.
- Konten berubah setelah approval selalu memblokir publikasi sampai review diperbarui.
- Approval reviewer lain tidak dapat dipakai oleh publisher.
- Diktat stale, PDF pending/failed, dan review tidak lengkap selalu memblokir publikasi.
- Retry publikasi identik tidak menggandakan projection atau job.
- Dokumen published lama tetap terbaca.

**Tes:** unit quality, compiler, integration SQLite lokal, edit-after-review, restage-after-review, konflik revisi, rollback transaksi, dan publication idempotency.

### CP3. MCP dan diagnostik authoring

**Eksekutor:** AGY.

Pekerjaan:

- Perbarui `workflow.get_contract` dengan kontrak pedagogi, bentuk payload, aturan PDF, dan langkah remediasi.
- Hubungkan validate, submit, restage, serta review ke layanan yang sama dengan aplikasi.
- Review MCP memerlukan otorisasi dan rubric payload yang sama dengan UI admin.
- Pisahkan validasi authoring dari kesiapan publikasi agar draft tidak memerlukan approval admin sebelum dapat direview.

**Gate:**

- Fixture yang sama menghasilkan keputusan dan kode issue yang sama melalui MCP dan jalur aplikasi.
- Setiap blocking issue menunjuk target dan tindakan perbaikan.
- Tidak tersedia tool atau scope publikasi MCP.
- Review tanpa otorisasi, rubric tidak lengkap, serta revisi stale ditolak.
- Tidak ada secret atau internal identifier pada respons learner-facing.

**Tes:** MCP handler dan transport lokal, auth/scope, validasi, submission/restage, stale context, redaction, dan pemeriksaan tool registry.

### CP4. Reader dan UI review admin

**Eksekutor kode/tes:** AGY. **Eksekutor Playwright dan sign-off:** primary.

Pekerjaan:

- Implementasikan visual nyata, unit contoh, pembahasan cek, estimasi belajar, focus mode, dan perbaikan mobile.
- Tambahkan rubric review admin, anchor bukti, daftar blocker, serta status revisi/PDF.
- Gunakan komponen, token, dan renderer yang sudah ada.
- Pertahankan navigasi, pencarian, deep link, dan progress reader.

**Gate visual pada 380×844 dan 1536×864:**

- Nol horizontal overflow halaman.
- Nol HTTP 400+, unexpected redirect, uncaught page error, dan console error akibat perubahan.
- Nol clipping, overlap, atau kontrol penting tertutup.
- Grafik berubah sesuai input dan fallback dapat digunakan.
- Tombol chatbot dan navigasi tidak beririsan.
- Focus mode dapat masuk/keluar melalui keyboard dan mengembalikan fokus.
- Semua state yang berubah memiliki screenshot yang dibuka langsung oleh primary.

**State wajib:** reader normal/focus, navigasi mobile terbuka, contoh panjang, jawaban tertutup/terbuka, visual default/berubah/fallback, review belum lengkap/lengkap/stale, serta PDF pending/failed/ready.

### CP5. Diktat dan ekspor PDF

**Eksekutor:** AGY. **Pemeriksaan visual PDF:** primary.

Pekerjaan:

- Hubungkan diktat product bundle ke fasilitas PDF yang ada melalui adapter yang sesuai.
- Pastikan ringkasan mempertahankan Idea, formula, kondisi, dan lineage.
- Buat bukti render yang mengikat checksum diktat, versi renderer, profil cetak, dan jumlah halaman.
- Sediakan download untuk pengguna yang berhak; admin dapat preview sebelum publikasi.

**Gate:**

- Ketiga fixture menghasilkan PDF 2 sampai 4 halaman per bab.
- Seluruh formula fixture berhasil dirender.
- Nol teks terpotong, halaman kosong tak sengaja, identifier internal, dan glyph rusak.
- Seluruh Idea wajib tetap tercakup.
- Edit artikel/diktat membatalkan bukti PDF lama.
- Kegagalan renderer menampilkan status yang dapat dipulihkan dan memblokir publikasi.
- Primary membuka setiap halaman PDF hasil fixture.

**Tes:** render PDF nyata, page count, font/layout, formula, lineage, stale artifact, download authorization, retry job, dan kegagalan renderer. Mock saja tidak cukup untuk meluluskan CP ini.

### CP6. Skills authoring

**Eksekutor sepenuhnya:** primary.

Perubahan utama pada skill product bundle dan pipeline beserta references yang relevan:

- Tegaskan artikel sebagai sumber belajar mandiri dan diktat sebagai review.
- Ganti instruksi berbasis durasi baca/jumlah kata dengan ketuntasan tujuan dan estimasi belajar.
- Wajibkan perencanaan prasyarat, urutan penjelasan, visual, contoh, cek, dan pembahasan sebelum drafting.
- Ajarkan penggunaan payload yang benar melalui kontrak MCP terbaru.
- Bedakan preflight author, hasil validator, review admin, dan kesiapan publikasi.
- Atur resume berdasarkan checksum dan checkpoint agar agent tidak mengandalkan ingatan.
- Tambahkan kasus limit sebagai contoh penerapan, bukan template wajib lintas topik.
- Larang klaim “PDF sesuai” tanpa hasil render dan “pedagogi lulus” hanya karena MCP hijau.
- Sinkronkan panduan pipeline agar tidak menghidupkan kembali aturan lama.

**Gate:**

- Seluruh skill yang berubah lulus `quick_validate.py`.
- Tidak ada reference putus, instruksi saling bertentangan, atau nama tool/schema yang tidak tersedia.
- Primary menguji walkthrough baru, resume, source tidak cukup, visual gagal, context stale, dan diktat terlalu panjang.
- Tidak ada edit skills oleh AGY.

### CP7. Rehearsal authoring dan uji end-to-end

**Eksekutor rehearsal:** AGY. **Penilaian konten dan visual:** primary.

Jalankan dua sesi AGY bersih untuk kasus limit serta satu sesi untuk masing-masing fixture pembanding. Input berisi sumber, scope, skills, dan kontrak; jangan memberikan artikel jawaban sebagai contoh untuk disalin.

Alur lokal:

`source/context → authoring → validate → stage → review → PDF → publish lokal → reader/download`

**Gate:**

- Empat run selesai dengan bukti tool dan artifact nyata.
- Tidak ada langkah wajib terlewati.
- Nol blocking issue yang belum diperbaiki.
- Kedua artikel limit memenuhi seluruh kasus penerimaan audit.
- Fixture pembanding tidak dipaksa memiliki bukti matematika atau grafik yang tidak relevan.
- Seluruh cek memiliki jawaban dan pembahasan yang benar menurut review primary.
- Semua retry dan perbaikan dilaporkan; kegagalan awal tidak dihapus dari laporan.
- Publication bypass, revisi stale, serta PDF gagal terbukti ditolak end-to-end.

Untuk limit, primary memeriksa khusus urutan quantifier, ketergantungan δ, pengecualian `x=c`, fungsi konstan, alasan batas awal kuadrat, counterexample lompatan, dan tiga jenis cek pemahaman. Sampling grafik bukan pengganti bukti matematis.

### CP8. Integrasi dan keputusan kesiapan

**Pemilik:** primary. AGY hanya mengerjakan perbaikan yang ditugaskan.

**Gate akhir:**

- Seluruh checkpoint sebelumnya PASS pada fingerprint integrasi yang sama.
- Seluruh diff diperiksa dan perubahan pengguna tetap terjaga.
- Focused suites, `bun run lint`, `bun run typecheck`, `bun run build`, dan `git diff --check` lulus.
- Tidak ada regresi baru. Kegagalan baseline dilaporkan terpisah dan tidak dianggap lulus.
- Dokumen kontrak, fitur, arsitektur/schema yang berubah, serta `docs/README.md` tersinkronisasi.
- Bukti visual dan PDF cocok dengan versi kode terakhir.
- Tersedia usulan rollout dan rollback staging yang konkret.

Hasil CP8 adalah **siap diajukan untuk perubahan staging**, bukan klaim sudah deployed atau tervalidasi di production.

## 4. Handoff AGY dan format laporan wajib

Saat implementasi dimulai, simpan master plan, matriks penerimaan, serta satu berkas handoff lengkap per CP. Berkas handoff tidak boleh hanya mengatakan “ikuti rencana sebelumnya”. Dokumen ini merupakan master plan.

Setiap handoff harus mengulang:

```text
Task ID: PB-CP<n>
Classification: DELEGATE_AGY_FIRST
Worker: agy / gemini-3.8-flash-high
Model authorization: instruksi eksplisit pengguna

Objective:
Hasil konkret checkpoint ini.

Working directory:
Path absolut workspace task.

Dependencies:
CP sebelumnya, keputusan PASS primary, dan fingerprint yang diterima.

Input paths:
Daftar absolut file yang boleh dibaca.

In scope:
Daftar perubahan checkpoint ini.

Excluded:
Skills, perubahan pengguna, secret, external mutation,
serta fitur checkpoint berikutnya.

Mutation policy:
Daftar exact writable paths.

File ownership:
Daftar file milik AGY; daftar file milik primary.

Requirements:
Seluruh requirement dan metrik CP, ditulis ulang secara lengkap.

Validation:
Perintah exact, fixture, expected result, dan bukti yang harus disimpan.

Evidence required:
Diff, checksum, log tes lengkap, exit status,
hasil aktual tiap acceptance case, dan keterbatasan.

Stop condition:
Hentikan setelah laporan CP. Jangan lanjut tanpa PASS primary.

Security:
Jangan membaca atau mengeluarkan secret, credential,
token produksi, private key, nilai environment rahasia,
session data, atau data pribadi sensitif.
```

Launcher investigasi:

```bash
agy --print "<HANDOFF_LENGKAP>" \
  --model gemini-3.8-flash-high \
  --mode plan \
  --sandbox \
  --output-format text \
  --print-timeout 5m \
  --log-file /tmp/agy-PB-CPn.log
```

Launcher implementasi memakai `--prompt-interactive`, `--mode accept-edits`, model yang sama, dan sandbox. Tidak menggunakan blanket permission atau `--dangerously-skip-permissions`.

Laporan AGY wajib memuat:

- Worker, status proses, durasi, dan exit status.
- File yang diperiksa dan diubah.
- Metrik `target / aktual / bukti`.
- Perintah tes exact, jumlah pass/fail/skip, exit status, serta lokasi log.
- Artifact dan checksum.
- Kegagalan baseline versus regresi.
- Klaim belum terverifikasi.
- Usulan keputusan CP, yang tetap harus diputuskan primary.

**Aturan keputusan:**

- PASS hanya jika seluruh syarat wajib terbukti.
- Tes wajib yang skipped atau tidak dijalankan berarti BLOCKED.
- Cacat hasil berarti REWORK pada CP yang sama.
- Perubahan setelah pengujian membatalkan bukti terkait.
- Exit 0 AGY tidak menggantikan tes atau review.
- Kegagalan transient mendapat maksimal satu safe retry. Tidak mengganti model atau executor secara otomatis; implementasi selain skills tetap milik AGY sesuai permintaan pengguna.

## 5. Evidence perencanaan yang sudah tersedia

Dua lane token-hungry telah didelegasikan: perbandingan validator/quality tests dan pemetaan UI/PDF/MCP. Delegasi diperlukan karena melibatkan perbandingan beberapa sumber implementasi.

- Percobaan awal memakai `gemini-3.7-flash-medium`, kemudian dihentikan mengikuti perubahan model dari pengguna; proses melaporkan exit 1.
- Kedua lane dijalankan dengan `agy --print … --model gemini-3.8-flash-high --mode plan --sandbox`, masing-masing exit 0. Tidak menggunakan fallback.
- Log lokal sesi perencanaan: `/tmp/agy-PLAN-SYSTEM-01-R2.log` dan `/tmp/agy-PLAN-UI-MCP-02.log`. Path sementara bukan artifact yang dijamin tersedia pada mesin lain.
- Primary memeriksa skills secara langsung serta sampling kontrak artikel/diktat, preservation review, publication, dan renderer PDF.
- Usulan worker tentang page count berbasis kata, telemetry, peredupan focus mode, dan payload grafik executable tidak diterima.

Baseline lokal saat perencanaan:

```bash
bun test tests/contracts/authoring-quality.test.ts \
  tests/contracts/product-bundle-v2.test.ts \
  tests/contracts/structured-article-reader.test.ts \
  tests/contracts/diktat-compression.test.ts
```

Hasil: **30 pass, 0 fail, exit 0**. `git diff --check`: **exit 0**.

Pada akhir perencanaan belum dilakukan implementasi, inspeksi artikel staging secara langsung, pengujian visual browser, render PDF penerimaan, atau mutation eksternal. Semua itu tetap mengikuti checkpoint dan batas otorisasi di atas.

## 6. Status pelaksanaan saat plan diekstrak

- CP0 dimulai pada HEAD `4ba5b5da57db0dbfb9e0b3404b74695c9c537bf2`, dengan worktree bersih saat baseline diambil. Belum ada keputusan PASS CP0.
- Primary menjalankan ulang empat baseline test files: 30 pass, 0 fail, exit 0.
- Primary memverifikasi environment staging memakai guard repository dan SELECT read-only: satu artikel limit published dengan sembilan bagian. Bagian epsilon-delta memiliki label enam menit, empat block, dan tidak ditemukan markup visual pada keempat block tersebut. Ini inspeksi struktur data, bukan bukti visual browser.
- AGY CP0 memakai `gemini-3.8-flash-high`. Eksekusi terminal sandbox mengalami error keystore Java read-only; bypass sandbox ditolak. AGY diarahkan memakai tool file, dengan status dan baseline tests dijalankan primary.
- Pekerjaan CP0 dijeda atas permintaan pengguna untuk mengekstrak, commit, dan push plan. CP1 sampai CP8 belum dijalankan. Tidak ada deployment, publikasi, atau mutation staging.
- Saat resume, verifikasi ulang baseline, worktree, artifact lokal, dan status worker. Jangan menganggap checkpoint selesai berdasarkan dokumen ini.

## 7. Hasil pelaksanaan

- CP0 sampai CP7 diputuskan `PASS` oleh primary berdasarkan kontrak, migrasi lokal, integration tests, walkthrough skills, empat rehearsal authoring bersih, dan inspeksi visual langsung.
- Suite akhir: 160 tes terfokus lulus, lint penuh exit 0 dengan warning baseline saja, Next.js production compile mode exit 0, dan `git diff --check` exit 0.
- Typecheck terpisah tidak dijalankan sesuai arahan operator. Build default sempat gagal karena cache generated `.next/dev` rusak; sesudah cache dipindahkan, production compilation sukses, lalu pemeriksaan TypeScript internal yang lama dihentikan sesuai batas waktu operator. `next build --experimental-build-mode compile` menutup exit 0.
- Tidak ada deployment, publikasi eksternal, migration staging, atau mutation production. Hasil CP8 adalah siap diajukan untuk rollout staging terjaga.
- Bukti checkpoint dan rehearsal lokal berada di `artifacts/product-bundle-self-study/` dan sengaja tidak menjadi artifact source yang dikomit.
