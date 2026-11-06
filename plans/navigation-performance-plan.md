# Rencana Teknis Peningkatan Performa Navigasi Aplikasi Zyx

Status: `OPEN / IN PROGRESS`  
Tanggal: 2026-11-05  
Versi Target: Next.js 16.3, React 19, Neon PostgreSQL, Cloud Run Staging / Vercel Production  
Penanggung Jawab: Tech Lead / Performance Specialist  

---

## 1. Status, Ringkasan Eksekutif, dan Batasan Perencanaan

### 1.1 Latar Belakang dan Masalah Nyata
Pengguna dan tim internal melaporkan keluhan latensi navigasi, terutama saat berpindah dari halaman pemasaran publik ke halaman terotentikasi seperti `/dashboard` (student) dan `/admin`, serta kelambatan saat berpindah antar-tab pada modul evaluasi dan materi.

Namun, baseline navigasi terotentikasi saat ini **belum diukur secara formal**. Sampel kueri ringan HTTP SQL Neon dari lingkungan sandbox menunjukkan angka 14 sampai 37 ms, namun angka ini merupakan sampel kueri tunggal kecil melalui HTTP gateway, bukan bukti kesehatan menyeluruh untuk koneksi stateful `pg.Pool`, jaringan kontainer aplikasi, atau kondisi basis data dingin (*cold DB suspension*). 

Staging dan produksi menggunakan Neon PostgreSQL, sesuai konfirmasi pengguna dan pengukuran baca-saja melalui target database terverifikasi. Kredensial Turso lama adalah legacy dan tidak menjadi target aktif. Identitas runtime web yang benar-benar terpasang tetap harus diverifikasi sebelum baseline; keberhasilan akses database tidak membuktikan konfigurasi deployment web. Seluruh usulan angka di bawah ini berstatus *anggaran usulan* (*proposed budgets*) yang wajib divalidasi terhadap baseline terukur pada Fase 0 sebelum gerbang evaluasi diberlakukan.

### 1.2 Checkpoint implementasi dan batas bukti

Implementasi dan validasi lokal tetap `OPEN / IN PROGRESS`. Rincian sampel, perintah, visual, dan batas bukti tercatat di [audit validasi](../docs/audit/navigation-performance-validation.md). Tidak ada klaim deployment atau peningkatan kausal.

| Paket | Status lokal dan pekerjaan tersisa |
|---|---|
| WP0 | Kandidat terpilih memiliki 40 warm dan 3 browser-context cold valid per rute dan viewport untuk R1 sampai R5. Baseline asli 40 run tidak valid, hanya smoke R3/R5 N=2 valid, sehingga tidak mendukung perbandingan kausal. |
| WP1 | Layout admin, guard, locale, dan katalog berbagi sesi per render. Guard tetap memeriksa peran kanonikal. |
| WP2 | Metadata course memakai proyeksi judul terotorisasi dengan fallback legacy. |
| WP3 | Dashboard memakai section async, Suspense, skeleton, dan error boundary setelah gate sesi dan enrollment. |
| WP4 | Batch streak, review, next concept, materi, dan asesmen terintegrasi. Mutasi streak pada GET tetap tidak berubah. Cache rekomendasi harian memakai insert best effort tersanitasi, sementara kegagalan read atau compute tetap diteruskan. |
| WP5 | Tab aktif dan historis memakai filter dan pagination server, hidrasi terbatas, dan seleksi terotorisasi. State historis populated dan detail belum diverifikasi secara visual. |
| WP6 | Inisialisasi notifikasi dan lazy forms terintegrasi. FCM nyata dan race token browser belum diverifikasi. |
| WP7 | Kapasitas lokal diukur, tetapi Cloud Run aktual, telemetry pool lengkap, dan span server RSC belum diukur. |

Gate primary lokal lulus untuk R1 sampai R5, tetapi shell R1 desktop p95 460.8 ms melebihi 200 ms, dan long task R1 p95 114 ms serta R2 p95 95 ms melebihi 50 ms. Profil CPU mengidentifikasi frame minified dan forced layout, tanpa membuktikan penyebab tunggal. R6 tidak memiliki fixture atau link, R7 hanya satu kategori, dan R8 merupakan legacy redirect. Loading/error/retry dan onboarding zero-enrollment dengan fixture nyata juga masih terbuka.

Run browser memakai intercept yang menonaktifkan HTTP cache dan stub preload lokal, sehingga bukan pengukuran field atau RUM. Browser-context cold tidak membuktikan cold container atau database. Lihat audit untuk keterbatasan build, screenshot, dan hydration awal yang belum diketahui penyebabnya.

---

## 2. Matriks Rute Baseline dan Definisi Pengukuran Latensi

Untuk mencegah salah tafsir antara metrik Core Web Vitals (muat dokumen penuh / pendaratan awal) dan latensi navigasi internal SPA (Single Page Application via Next.js App Router), batas pengukuran didefinisikan secara presisi.

### 2.1 Koreksi Definisi: INP vs Umpan Balik Klik vs Latensi Navigasi SPA

Umpan balik klik $\le 100\text{ ms}$ **bukan definisi INP**. 
- **Interaction to Next Paint (INP)** adalah metrik Core Web Vitals pada level dokumen browser yang mengukur latensi interaksi secara menyeluruh: durasi sejak pengguna menekan tombol/layar (*input delay*), eksekusi event handler JavaScript (*processing time*), hingga browser benar-benar menggambar frame visual berikutnya (*presentation delay*). Ambang batas "Good" pada standar Core Web Vitals adalah $\le 200\text{ ms}$.
- **Umpan Balik Visual Instan ($T_{\text{feedback}} \le 100\text{ ms}$)** pada elemen yang diklik (misalnya status tombol aktif, indikator progress bar navigasi, atau spinner) merupakan teknik rekayasa antarmuka untuk memastikan frame visual berikutnya langsung terlukis dengan cepat, sehingga interaksi klik tersebut memenuhi anggaran INP yang prima.
- **Latensi Navigasi SPA ($T_{\text{primary}}$)** adalah durasi transisi rute internal aplikasi pada Next.js App Router (dari klik $T_0$ hingga komponen data utama rute tujuan selesai dirender dan siap dipakai di DOM). Ini adalah metrik transisi rute tingkat aplikasi (*soft navigation duration*), bukan metrik INP browser, dan bukan metrik muat dokumen penuh (*full page hard reload* seperti FCP atau LCP dokumen).
- **Penanda Skeleton ($T_{\text{shell}}$)** adalah kemunculan fallback visual awal untuk mencegah kesan aplikasi macet (*freeze*). Skeleton **bukan penanda selesai** dan tidak boleh dianggap sebagai rute yang siap digunakan (*not content-ready*).

```text
[Klik Pengguna: T0] ---------------------------------------------------------------------------------------------------->
   │
   ├─> [Input Delay + Event Handler + Next Paint] ──> INP Window (Frame Berikutnya T_feedback <= 100 ms, ambang CWV <= 200 ms)
   │
   ├─> [Klien Minta RSC Payload via Jaringan] ──> T_TTFB (Byte Pertama RSC Diterima Klien)
   │
   ├─> [Streaming Server Berjalan] ──> T_shell (Skeleton / Fallback Suspense Pertama Muncul)
   │
   └─> [RSC Selesai + DOM Rekonsiliasi] ──> T_primary (Data Utama Siap dan Interaktif)
```

Perbedaan jenis tab pada arsitektur aplikasi Zyx:
- **Tab Lokal Klien (`Tabs` / `useUrlTab`)**: Menggunakan Radix primitive dan manipulasi History API lokal (`replaceState`) untuk memfilter data yang sudah berada di memori klien. Tidak ada roundtrip jaringan RSC. $T_{\text{primary}}$ adalah waktu pergantian tampilan panel DOM lokal secara instan.
- **Tab Rute Halaman (`TabNav`)**: Menggunakan komponen tautan `<Link href="...">` yang memicu navigasi rute Next.js App Router sesungguhnya. Transisi ini meminta stream payload RSC baru dari server melalui jaringan dan memiliki alur $T_{\text{TTFB}}$ hingga $T_{\text{primary}}$.

### 2.2 Matriks Rute yang Terkonfirmasi Sumber Kode dan End Markers Konkret

Setiap rute wajib memiliki penanda selesai konkret (*concrete end marker*) yang jelas, dapat diuji secara otomatis (*falsifiable*), dan tidak ambigu:

| ID Rute | Rute Sumber Kode Asli | Tipe Transisi | Penanda Selesai Konkret $T_{\text{primary}}$ (Bukan Skeleton) | Karakteristik Beban Data |
|---|---|---|---|---|
| R1 | `/` (Marketing) $\to$ `/dashboard` | Navigasi Antar-Layout (SPA Nav / Cross-Layout) | Mahasiswa terdaftar: kartu materi aktif pertama dengan bilah progres dan tombol "Lanjutkan" tampil interaktif. Mahasiswa baru (zero enrollment): `StudentOnboardingView` terpasang dengan kartu rekomendasi prodi. | Memuat profil, streak, status enrollments, chapter outline, dan materi in-progress. |
| R2 | `/` (Marketing) $\to$ `/admin` | Navigasi Antar-Layout (SPA Nav / Cross-Layout) | Shell admin terpasang dan bilah ringkasan KPI `AdminStatStrip` terisi angka numerik valid (non-skeleton). | Sesi admin (`assertAdmin`), pembacaan metrik ringkasan platform. |
| R3 | `/admin/courses` | Navigasi Internal Admin | Tabel daftar mata kuliah kanonikal dan legacy menampilkan baris data lengkap (atau `AdminEmptyState` bila data nol). | Kueri `mataKuliah` dan `courses` dengan pengurutan alfabetis. |
| R4 | `/admin/courses/[slug]` | Navigasi Halaman Detail Admin | Header judul kursus, badge status, dan daftar bab kurikulum aktif siap diinteraksikan. | Pemanggilan data detail kurikulum via `getCourseDetailData`. |
| R5 | `/admin/questions` | Navigasi Studio Evaluasi | 10 baris pertama tabel bank soal sesuai filter dan halaman tampil di DOM, checkbox baris responsif. | Kueri gabungan `aiQuestionBank`, `soal`, `mataKuliah`, dan `assessmentSources`. |
| R6 | `/courses/[id]/material/[materialId]` $\to$ `/courses/[id]/quiz/[quizId]` | Alur Belajar Siswa (Belajar ke Kuis) | Form evaluasi kuis terpasang, tombol "Mulai Kuis" atau opsi radio butir soal pertama siap menerima input. | Validasi akses materi, status progres murid, pemuatan template kuis. |
| R7 | `/courses` (Tab Kategori Prodi) | Tab Lokal Klien (`Tabs` / `useUrlTab`) | Grid kartu kursus terbarui sesuai filter kategori prodi tanpa ada roundtrip jaringan ke server. | Filter in-memory di sisi klien menggunakan History API (`replaceState`), tanpa server fetch. |
| R8 | `/admin/assessments/[id]` | Tidak berlaku | Rute lama melakukan redirect dan bukan workload aktif. Cakupan render berat diarahkan ke `historicalQuestionBank` yang sudah ada di bank soal; jangan membangun fitur baru untuk R8. | Validasi render rumus pada data historis yang tersedia. |

### 2.3 Pemisahan Kondisi Lingkungan dan Keterbatasan Statistik Sampel

Pengujian latensi harus membedakan skenario eksekusi dan batas interpretasi statistik:
1. **Kondisi Hangat (*Warm Repeat Runs*)**:
   - Dijalankan pada sesi browser yang sama, aset JavaScript dan CSS sudah dicache di memori browser, kontainer backend aktif (*warm container*), koneksi basis data sudah terbuka di pool.
   - **Batas Interpretasi 40 Sampel**: Pengujian 40 sampel sekuensial pada lingkungan lab memberikan indikator terarah (*directional lab gate*) lintas batch berulang, bukan data populasi lapangan (*field population / RUM*). Pada 40 sampel, persentil p95 ditentukan oleh sampel ke-38 atau ke-39, sehingga rentan terhadap derau pencilan (*noise outlier*).
   - **Konkurensi 1 Hangat vs Saturasi Pool**: Uji coba sekuensial pada konkurensi 1 tidak menguji perebutan koneksi (*connection pool contention*) atau saturasi CPU kontainer. Evaluasi saturasi pool memerlukan uji konkurensi terpisah.
2. **Kondisi Konkurensi Bersamaan (*Concurrent Staging Runs*)**:
   - Dijalankan di lingkungan staging Cloud Run yang telah diotorisasi dengan 4 hingga 8 pengguna virtual simultan untuk menguji batas ketahanan kontainer pada konfigurasi `concurrency: 8`.
3. **Kondisi Dingin (*Cold Exploration*)**:
   - Sesi browser baru dibuka, cache aset statis kosong, kontainer aplikasi mengalami inisialisasi awal (*container cold start*).
   - Pengamatan dilakukan sebanyak **3 sampai 5 kali pengamatan deskriptif eksploratif**. Sampel 3 sampai 5 kali ini tidak memiliki validitas statistik untuk diklaim sebagai persentil p95.
4. **Pemisahan Status Kontainer vs Basis Data**:
   - Browser baru, kontainer aplikasi baru, dan DB Neon suspended adalah tiga kondisi terpisah. Label cold container hanya sah jika log platform membuktikan instance baru, bukan sekadar browser baru. Kondisi dingin kontainer aplikasi (*Cloud Run cold instance*) berbeda dari kondisi dingin basis data Neon (*DB compute suspension*). Keduanya memiliki indikator terpisah dan tidak boleh dicampuradukkan.

---

## 3. Anggaran Kinerja Terukur (Proposed Performance Budgets) dan Metodologi Uji

### 3.1 Tabel Anggaran Kinerja Usulan (Satu Gate Tegas per Kelas Rute)

Untuk mencegah ambiguitas antara target ideal dan batas toleransi, setiap kelas rute memiliki **satu gerbang evaluasi (Gate) p75 dan p95 yang tegas**. Target ambisius (stretch targets) dicantumkan secara terpisah dan opsional, tanpa menggantikan gerbang kelulusan resmi. Semua angka berstatus anggaran usulan sebelum pengukuran baseline Fase 0.

| Skenario Navigasi | Kelas Jaringan & Perangkat | Gerbang Evaluasi Resmi (Gate p75 / p95) | Target Ambisius Opsional (Stretch Goal) | Catatan Rasional Teknis |
|---|---|---|---|---|
| Umpan Balik Klik ($T_{\text{feedback}}$) | Semua Kelas Perangkat | Gate p95: $\le 100\text{ ms}$ | p95: $\le 50\text{ ms}$ | Menjaga INP Core Web Vitals tetap di zona Good ($\le 200\text{ ms}$). |
| Tab Lokal Klien (R7) | Desktop / Mobile, In-Memory | Gate p95: $\le 100\text{ ms}$ | p95: $\le 60\text{ ms}$ | Manipulasi DOM lokal via History API tanpa roundtrip jaringan. |
| Render berat historicalQuestionBank, pengganti R8 yang tidak berlaku | Desktop Laptop, CPU Klien | Gate p95: $\le 300\text{ ms}$ | p95: $\le 200\text{ ms}$ | Memperhitungkan waktu komputasi parsing rumus KaTeX pada main thread. |
| Navigasi Hangat: `/dashboard` (R1) | Desktop & Mobile, Fast 4G / Broadband | Gate p75: $\le 800\text{ ms}$<br>Gate p95: $\le 1200\text{ ms}$ | p75: $\le 600\text{ ms}$<br>p95: $\le 900\text{ ms}$ | Dekomposisi streaming Suspense pada modul sekunder dashboard siswa. |
| Navigasi Hangat: `/admin/*` (R2, R3) | Desktop Laptop, Fast 4G / Broadband | Gate p75: $\le 600\text{ ms}$<br>Gate p95: $\le 1000\text{ ms}$ | p75: $\le 450\text{ ms}$<br>p95: $\le 750\text{ ms}$ | Shell admin dan tabel data terindeks tanpa komputasi graf belajar. |
| Navigasi Hangat: Detail Kursus (R4) | Desktop Laptop, Fast 4G / Broadband | Gate p75: $\le 600\text{ ms}$<br>Gate p95: $\le 1000\text{ ms}$ | p75: $\le 500\text{ ms}$<br>p95: $\le 800\text{ ms}$ | Pembacaan kurikulum bab aktif dengan kueri terindeks. |
| Navigasi Hangat: Bank Soal (R5) | Desktop Laptop, Fast 4G / Broadband | Gate p75: $\le 700\text{ ms}$<br>Gate p95: $\le 1100\text{ ms}$ | p75: $\le 500\text{ ms}$<br>p95: $\le 850\text{ ms}$ | Paginasi server SQL 10 baris dengan payload RSC ringan. |
| Navigasi Hangat: Materi ke Kuis (R6) | Desktop & Mobile, Fast 4G / Broadband | Gate p75: $\le 700\text{ ms}$<br>Gate p95: $\le 1100\text{ ms}$ | p75: $\le 550\text{ ms}$<br>p95: $\le 850\text{ ms}$ | Alur belajar inti evaluasi kuis siswa. |
| Kondisi Dingin (Aplikasi / Kontainer Baru) | Pengamatan Eksploratif (3-5 Sampel) | Ambang Deskriptif: $\le 3500\text{ ms}$ | $\le 2500\text{ ms}$ | Termasuk inisialisasi runtime, JIT compile modul, dan koneksi pool. Bukan gate statistik p95. |

### 3.2 Tingkatan Data Uji Deterministik (Deterministic Data Tiers)
Pengujian latensi wajib menggunakan data sintetis terkontrol di staging atau sandbox terautentikasi. Dilarang menyuntikkan data uji ke basis data produksi.

1. **Tier Akun Siswa (Enrollments)**:
   - Tier 0: Akun baru tanpa enrollment (menguji alur `StudentOnboardingView`).
   - Tier 1: Akun dengan tepat 1 enrollment mata kuliah aktif.
   - Tier 5: Akun dengan 5 enrollment mata kuliah aktif (menguji dampak fanout kueri per-kursus).
2. **Tier Bank Soal (Questions Fixture)**:
   - Tier 100: 100 butir soal terdaftar.
   - Tier 1000: 1.000 butir soal terdaftar (mendekati volume riil repositori saat ini yaitu sekitar 1.375 soal).
   - Tier 5000: 5.000 butir soal sintetis untuk pengujian batas memori dan kestabilan paginasi server.

### 3.3 Metodologi Pengumpulan Data dan Ambang Sampel
- **Resolusi Perangkat Uji**: Desktop standar $1536 \times 864$ (skala efektif CSS laptop 1080p 125%) dan Ponsel pintar $380 \times 844$ (standar mobile Zyx).
- **Protokol Kondisi Hangat**: Minimal 40 pengulangan sekuensial pada konkurensi 1 untuk mengamati stabilitas directional lab gate p75/p95 antar batch.
- **Protokol Pengujian Konkurensi**: 4 hingga 8 pengguna virtual simultan hanya di staging Cloud Run untuk memverifikasi kapasitas batas kontainer.
- **Protokol Kondisi Dingin**: 3 sampai 5 observasi deskriptif kualitatif.
- **Kriteria Keberhasilan**: Keberhasilan fase dinilai berdasarkan pencapaian gerbang evaluasi terpasang DAN perbaikan relatif terhadap baseline awal terkonfirmasi yang diukur pada Fase 0.

---

## 4. Paket Kerja Teknis Terstruktur (Work Packages)

### 4.1 Rincian Paket Kerja

#### WP0: Telemetri dan Pelacak Waktu Permintaan (Request Timing Telemetry)
- **Peran Penanggung Jawab**: Observability & Performance Engineer
- **Ketergantungan**: Tidak ada. Merupakan prasyarat wajib sebelum fase implementasi kode fitur (Fase 1 hingga Fase 4).
- **Deskripsi Teknis**: Menyiapkan instrumen pengukuran latensi di server dan klien untuk mengukur $T_{\text{feedback}}$, $T_{\text{TTFB}}$, $T_{\text{shell}}$, dan $T_{\text{primary}}$ secara objektif tanpa membocorkan data sensitif (Zero-PII).
- **Kriteria Keberhasilan (Acceptance Criteria)**:
  1. Header pelacak `x-zyx-trace-id` dihasilkan per permintaan navigasi dan dicatat pada log server.
  2. Durasi eksekusi server RSC, TTFB jaringan, dan waktu render klien tercatat terpisah pada pengujian lab staging.
  3. Terbentuk dokumen baseline formal rute R1 hingga R8 sebelum kode diubah.
- **Rencana Rollback**: Revert unit instrumentasi sementara atau gunakan konfigurasi telemetri yang sudah ada. Jangan membuat flag baru tanpa keputusan eksplisit; perilaku aplikasi tetap sama.

#### WP1: Deduplikasi Sesi Autentikasi Scoped-Request
- **Peran Penanggung Jawab**: Backend Specialist
- **Ketergantungan**: WP0 selesai (baseline terukur).
- **Temuan awal sebelum implementasi**: `app/(admin)/layout.tsx` memanggil `auth.api.getSession({ headers: await headers() })` secara langsung alih-alih melalui helper `getAuthSession()` di `lib/auth-session.ts` yang memanfaatkan `React.cache()`. Pemanggilan langsung serupa juga ditemukan pada `app/(student)/courses/page.tsx`. Hal ini menyebabkan Better Auth dieksekusi berulang dalam satu siklus render RSC yang sama.
- **Batasan Keamanan dan Penjelasan Teknis**:
  - `React.cache()` hanya berlaku dalam cakupan siklus render RSC (*request-scoped*).
  - Dilarang membuat cache sesi atau otorisasi global lintas-permintaan (*no global cross-request authorization cache*).
  - Server Actions dan mutasi data tetap memvalidasi sesi dan hak akses secara langsung pada setiap pemanggilan untuk menjamin pencabutan hak akses (*revocation*) dan isolasi multi-tenant tetap aman.
  - Jumlah kueri SQL internal yang dijalankan oleh Better Auth per panggilan sesi tidak diketahui secara pasti tanpa pelacakan database langsung; tidak boleh membuat klaim spekulatif mengenai jumlah kueri Better Auth.
- **Kriteria Keberhasilan (Acceptance Criteria)**:
  1. Layout, halaman, resolver locale dan guard RSC pada route pilot R1 sampai R5 menggunakan helper sesi request-scoped yang sama; perluasan ke route lain hanya setelah pilot lulus.
  2. Eksekusi Better Auth `getSession` maksimal 1 kali per render pass RSC yang memerlukan sesi pada route pilot. Hitung terpisah dari request Server Action, API, dan prefetch.
  3. Server Actions dan proteksi rute admin (`assertAdmin`, `assertTutorOrAdmin`) tetap 100% menolak akses unauthorized.
- **Rencana Rollback**: Kembalikan pemanggilan langsung `auth.api.getSession` pada file layout terkait via revert git terisolasi.

#### WP2: Pengambilan Metadata Ringan (Lightweight Metadata Fetching)
- **Peran Penanggung Jawab**: Fullstack Specialist
- **Ketergantungan**: WP1 selesai.
- **Temuan awal sebelum implementasi**: Pada `app/(admin)/admin/(academic)/courses/[slug]/page.tsx`, fungsi `generateMetadata` memanggil `getCourseDetailData(slug)`. Fungsi ini mengeksekusi kueri kurikulum besar (mata kuliah, bab kanonikal, bab legacy, materi, template kuis, dan bank soal) hanya untuk membaca `data.course.title`. Selanjutnya, komponen halaman utama mengeksekusi `getCourseDetailData(slug)` sekali lagi.
- **Target Solusi**: Membuat kueri terisolasi `getCourseTitleOnly(slug)` yang hanya mengambil kolom judul dan status dari tabel `mataKuliah` / `courses` dengan batas 1 baris, khusus untuk kebutuhan `generateMetadata`.
- **Kriteria Keberhasilan (Acceptance Criteria)**:
  1. `generateMetadata` rute detail kursus tidak lagi memanggil `getCourseDetailData`.
  2. Durasi eksekusi `generateMetadata` berada di bawah 50 ms pada kondisi hangat.
  3. Tag `<title>` dan `<meta name="description">` yang dihasilkan di browser tetap identik dengan kondisi sebelumnya.
- **Rencana Rollback**: Kembalikan pemanggilan `getCourseDetailData` di fungsi `generateMetadata` pada berkas `page.tsx`.

#### WP3: Dekomposisi Server Components dan Streaming Suspense pada Dashboard Siswa
- **Peran Penanggung Jawab**: Frontend Architect / Performance Engineer
- **Ketergantungan**: WP1 dan WP2 selesai.
- **Temuan awal sebelum implementasi**: `app/(student)/dashboard/page.tsx` memuat seluruh data secara serial dan paralel via `Promise.all` raksasa di tingkat komponen induk sebelum mengembalikan JSX. Akibatnya, pengiriman HTML shell tertahan menunggu kueri terberat selesai.
- **Prinsip Utama Suspense**:
  - **Suspense sendiri tidak mengurangi total komputasi atau kueri database di backend**. Suspense hanya mengubah alur pengiriman dokumen: browser menerima shell awal lebih cepat, sementara potongan data lainnya dialirkan secara bertahap (*progressive streaming*).
  - Untuk menghasilkan streaming sesungguhnya, pemanggilan data asinkron **wajib dipindahkan ke dalam batasan komponen anak (*child component boundary*)**, bukan di-`await` di tingkat komponen induk.
- **Arsitektur dan Preservasi State**:
  1. *Resolusi Layout Independen*: Di tingkat induk, hanya autentikasi user dan pengecekan minimal status pendaftaran (`isEnrolledInAny`) yang diselesaikan terlebih dahulu untuk menentukan percabangan tampilan.
  2. *Preservasi State Onboarding vs Enrolled*:
     - Jika mahasiswa belum memiliki mata kuliah (`!isEnrolledInAny`), sistem merender `StudentOnboardingView` lengkap dengan preview katalog kursus sesuai program studi.
     - Jika mahasiswa memiliki mata kuliah terdaftar, sistem merender dashboard belajar siswa.
  3. *Child Boundary Async Fetching*: Komponen seperti `WeakConceptsSection`, `TodayPlanSection`, `ReviewQueueSection`, dan `RecommendedCoursesSection` melakukan kueri datanya masing-masing secara mandiri di dalam komponen dan dibungkus dalam `<Suspense fallback={<CardSkeleton />}>`.
  4. *Isolasi Penanganan Error (No Data Leaks)*: Setiap komponen streaming dibungkus dalam boundary error parsial agar kegagalan salah satu modul sekunder (misalnya refleksi mingguan) tidak meruntuhkan seluruh dashboard, serta tidak membocorkan pesan error mentah atau data sensitif ke antarmuka pengguna.
- **Kriteria Keberhasilan (Acceptance Criteria)**:
  1. Waktu kemunculan visual awal ($T_{\text{shell}}$) dashboard hangat tercapai dalam $\le 200\text{ ms}$.
  2. Konten utama interaktif ($T_{\text{primary}}$) memenuhi gerbang evaluasi p95 $\le 1200\text{ ms}$.
  3. Mahasiswa baru tetap melihat alur onboarding lengkap; mahasiswa aktif melihat seluruh modul belajar tanpa kehilangan data.
  4. Pergeseran tata letak (*Cumulative Layout Shift* / CLS) akibat penggantian skeleton menjadi kartu data terukur $\le 0.1$.
- **Rencana Rollback**: Kembalikan struktur pengambilan data terpadu `Promise.all` di komponen induk `DashboardPage`.

#### WP4: Optimasi Batch Summary Data Belajar dan Tata Kelola Mutasi Streak
- **Peran Penanggung Jawab**: Database & Backend Specialist
- **Ketergantungan**: WP1 dan WP3 selesai.
- **Temuan Kode Sumber dan Batasan Semantik**:
  - `getOrComputeStudyPath` menghitung ulang graf konsep kurikulum secara lengkap untuk setiap kursus yang diikuti siswa hanya untuk menampilkan satu lencana konsep berikutnya (*next concept badge*).
  - `getReviewQueue` dan kueri flashcard melakukan kueri individual per mata kuliah.
  - `getOrUpdateStreak` di `lib/streak-service.ts` memicu penulisan bersyarat (`insert` atau `update` ke tabel `studentStreaks`) di tengah alur baca GET dashboard.
- **Kewajiban Paritas Semantik yang Ketat**:
  1. *Antrean Review / Active Recall*: Optimalisasi batch kueri **tidak boleh disederhanakan menjadi perhitungan kasar `COUNT(*)` tanggal jatuh tempo**. Kueri harus mempertahankan semantik interval algoritma SM-2, status penguasaan konsep, serta paritas penuh antara struktur kartu kanonikal (`flashcardIde`, `setFlashcard`) dan legacy (`flashcards`).
  2. *Konsep Berikutnya (Study Path)*: Penentuan langkah belajar berikutnya **tidak boleh disederhanakan menjadi konsep pertama dalam tabel**. Kueri harus menghormati urutan bab, dependensi graf prasyarat (DAG), dan skor pemahaman kanonikal (`pemahamanIde`) maupun legacy (`studentConceptMastery`).
  3. *Entitas Tanpa Aktivitas (Zero Activity)*: Sesuai aturan repositori di `AGENTS.md`, seluruh mata kuliah kanonikal dan legacy yang menjadi hak siswa harus tetap diikutsertakan dalam ringkasan, termasuk entitas yang belum memiliki aktivitas belajar (nilai nol).
  4. *Mutasi Streak Memerlukan Keputusan Alur Kerja*: Memindahkan pembaruan streak keluar dari proses pemuatan halaman GET dashboard ke titik akhir aktivitas belajar nyata (misalnya saat menyelesaikan kuis atau materi) merupakan perubahan alur kerja produk (*product workflow change*). Ini berdampak pada pengguna yang login hanya untuk melihat dashboard. Perubahan ini **wajib diajukan sebagai usulan keputusan resmi kepada pemangku kepentingan (workflow decision), dan tidak boleh diimplementasikan secara diam-diam**.
- **Kriteria Keberhasilan (Acceptance Criteria)**:
  1. Kueri data materi, kuis, dan review queue dijalankan dalam kelompok batch terpadu, mengurangi roundtrip database.
  2. Nilai streak, antrean review, dan rekomendasi konsep siswa terbukti identik 100% dengan hasil implementasi sebelumnya.
  3. Analisis `EXPLAIN` membuktikan penggunaan indeks yang efisien tanpa table scan tak terduga.
- **Rencana Rollback**: Kembalikan fungsi layanan pembacaan individual di `lib/study-path-service.ts` dan pemanggilan inline di `lib/streak-service.ts`.

#### WP5: Paginasi Server pada Question Bank dan Rendering Matematika Asesmen
- **Peran Penanggung Jawab**: Fullstack Specialist
- **Ketergantungan**: WP1 selesai.
- **Temuan awal sebelum implementasi**:
  - Halaman `app/(admin)/admin/(eval)/questions/page.tsx` mengambil seluruh data soal dari `aiQuestionBank`, `soal`, dan `assessmentSources` secara eager dan tanpa batas (*unbounded*) ke memori server, lalu mentransfer semuanya ke komponen klien via props JSON, sementara klien hanya menampilkan 10 baris di DOM. Setiap mutasi memicu `router.refresh()` yang mengunduh ulang seluruh data tersebut.
  - Halaman detail asesmen (`detail-client.tsx`) merender seluruh butir soal lengkap dengan rumus matematika KaTeX (`MathText`) di DOM tanpa paginasi.
- **Target Solusi Teknis dan Persyaratan Detail**:
  1. *Paginasi Server SQL*: Menerapkan klausa `LIMIT` dan `OFFSET` terindeks di tingkat database yang disinkronkan dengan URL search params (misalnya `?qPage=1&qPageSize=10`).
  2. *Preservasi Deep Link dan Tab Terpisah*: Tab "Soal Aktif" dan "Riwayat / Referensi" harus menggunakan parameter URL terpisah (misalnya `?tab=ai-generated&qPage=1` vs `?tab=historical`) agar navigasi dan deep link tetap terisolasi.
  3. *Tidak Melakukan Eager Fetch Ganda*: Hanya data pada tab yang aktif yang dimuat secara eager; hindari mengambil kedua himpunan data besar secara bersamaan tanpa batasan.
  4. *Seleksi Entitas Lintas Paginasi*: Kotak centang (*checkbox*) seleksi soal untuk aksi massal harus dikelola dalam state ID terpusat (Set) agar pilihan pengguna di halaman 1 tidak hilang saat berpindah ke halaman 2.
  5. *Konsistensi Jumlah Hasil*: Angka total soal pada header atau lencana tab wajib mencerminkan hasil kueri `COUNT(*)` terfilter yang akurat di database, konsisten dengan baris yang ditampilkan.
  6. *Isolasi Perenderan Rumus KaTeX*: Menerapkan pemecahan halaman atau rendering tertunda untuk formula matematika berat guna mencegah pemblokiran main thread.
- **Kriteria Keberhasilan (Acceptance Criteria)**:
  1. Dataset soal yang dikirim maksimal 10 record per halaman aktif, ditambah metadata terikat. Pada fixture 5.000 soal, transfer RSC terkompresi turun minimal 70% dari baseline identik; laporkan byte absolut dan pisahkan aset statis. Ini target usulan, bukan hasil terukur.
  2. URL search params mencerminkan nomor halaman dan tab secara deklaratif; tombol *Back* dan *Forward* browser berfungsi sempurna.
  3. Status pilihan checkbox lintas halaman bertahan dengan benar; jumlah total data terfilter konsisten.
  4. Gerbang evaluasi latensi navigasi R5 hangat p95 $\le 1100\text{ ms}$ terpenuhi.
- **Rencana Rollback**: Kembalikan pengambilan data menyeluruh di server dan pemotongan 10 baris di sisi klien pada berkas `questions-client.tsx`.

#### WP6: Higienitas Transisi Klien, Prefetch Modul Opsional, dan Background Effect
- **Peran Penanggung Jawab**: Frontend Performance Specialist
- **Ketergantungan**: Independen terhadap perubahan backend.
- **Temuan Kode Sumber dan Klarifikasi Masalah**:
  - `components/notifications/push-permission-init.tsx` memiliki `useEffect` dengan dependensi `[isPending, session?.user, pathname]`. Akibatnya, setiap kali terjadi perpindahan rute URL, sistem mengeksekusi ulang `initFCM(false)` dan memanggil `/api/notifications/register-token`. **Catatan: Ini bukan polling berkala (interval timer), melainkan efek samping navigasi yang tidak perlu**.
  - `components/course/tutor-drawer.tsx` melakukan prefetch modul `tutor-drawer-view` pada saat idle via `requestIdleCallback`, yang menarik pustaka CodeMirror ke memori klien bahkan sebelum tombol dibuka.
  - `components/ui/page-transition.tsx` membungkus konten dalam `<motion.div key={pathname}>`, yang memaksa remount hierarki DOM pada setiap navigasi URL.
- **Target Solusi Teknis**:
  1. *Eliminasi Registrasi Ulang FCM*: Pendaftaran token FCM hanya dieksekusi satu kali saat sesi aktif terbentuk. Semantik pergantian akun (*account switch*) dan penanganan token kedaluwarsa (*stale token*) harus dikelola secara benar berdasarkan ID pengguna aktif (`userId`), **bukan menggunakan flag global mentah di `sessionStorage`** yang dapat mengabaikan login pengguna lain di browser yang sama.
  2. *Impor Dinamis Modul Berat Terukur*: Prefetch CodeMirror pada drawer tutor diubah menjadi pemuatan saat kontrol di-hover atau diklik (*on-interaction*). Klaim penghematan memori harus diukur melalui bundle analyzer, bukan diasumsikan pasti menghemat secara mutlak.
  3. *Evaluasi Transisi Halaman*: Mengukur biaya CPU `PageTransition` dan menyesuaikan pembungkus hanya bila biaya remount atau animasi terbukti dominan, dengan mempertahankan kontrak transisi bersama dan reduced motion.
- **Kriteria Keberhasilan (Acceptance Criteria)**:
  1. Panggilan jaringan ke `/api/notifications/register-token` tidak lagi terpicu saat berpindah rute URL.
  2. Pergantian akun pengguna tetap memicu validasi token FCM secara aman.
  3. Modul CodeMirror tidak masuk ke tracing bundle awal halaman sebelum interaksi terjadi.
  4. Durasi JS Long Tasks selama transisi halaman berkurang ke batas $\le 50\text{ ms}$.
- **Rencana Rollback**: Kembalikan dependensi `pathname` pada efek FCM dan kembalikan pemanggilan idle global pada drawer tutor.

#### WP7: Pemprofilan Lingkungan Staging Cloud Run dan Verifikasi Infrastruktur
- **Peran Penanggung Jawab**: DevOps / Platform Engineer
- **Ketergantungan**: WP0 hingga WP6 selesai.
- **Temuan Kode Sumber dan Batasan Verifikasi**:
  - Berkas alur kerja `.github/scripts/deploy-cloud-run.sh` dan dokumentasi `docs/operations/cloud-run-staging.md` mencantumkan konfigurasi kontainer staging: 1 vCPU, 1 GiB RAM, minimum instance 0, maksimum instance 1, dan konkurensi 8.
  - **Koreksi Status**: Nilai spesifikasi di atas bersumber dari berkas konfigurasi repositori, **bukan hasil verifikasi langsung terhadap GCP Cloud Run console aktif saat ini**.
  - Staging menggunakan basis data Neon PostgreSQL. Pengukuran latensi kueri database melalui HTTP gateway Neon berbeda dengan koneksi stateful `pg.Pool`; profil latensi harus memisahkan waktu roundtrip jaringan gateway dari waktu eksekusi kueri di basis data.
- **Target Solusi**:
  1. Menjalankan pengujian beban terkontrol (4 hingga 8 pengguna virtual) pada staging Cloud Run resmi untuk mengamati perilaku kontainer pada batas konkurensi 8 saat melayani streaming RSC dan pembacaan Neon.
  2. Mengidentifikasi tanda-tanda pembatasan CPU (*CPU throttling*) atau saturasi memori pada instance tunggal.
- **Kriteria Keberhasilan (Acceptance Criteria)**:
  1. Ambang batas saturasi CPU dan memori kontainer Cloud Run terpetakan dengan metrik objektif.
  2. Tidak terjadi *out-of-memory* (OOM) atau kegagalan koneksi basis data pada konkurensi target.
- **Rencana Rollback**: Hentikan segera skrip uji beban jika terjadi degradasi ketersediaan staging.

---

### 4.2 Matriks Ringkasan Paket Kerja

| Atribut | WP0: Telemetri & Baseline | WP1: Deduplikasi Sesi Auth | WP2: Metadata Ringan | WP3: Streaming Dashboard | WP4: Batch Belajar & Mutasi Streak | WP5: Paginasi Server Bank Soal | WP6: Higienitas Klien & Background | WP7: Profiling Staging Cloud Run |
|---|---|---|---|---|---|---|---|---|
| **Apa yang Dipercepat** | Akurasi pengukuran latensi dan pencegahan regresi. | Redundansi pemanggilan parsing sesi Better Auth pada siklus RSC tunggal. | Latensi komputasi server saat generate metadata rute detail kursus. | Waktu kemunculan visual awal ($T_{\text{shell}}$ dan $T_{\text{primary}}$) dashboard. | Eliminasi per-enrollment query waterfall dan pemisahan write lock pada GET. | Transfer payload data RSC dan waktu re-render bank soal setelah mutasi. | Beban komputasi main thread browser saat navigasi antar-halaman. | Karakteristik ketahanan server pada konkurensi terpasang (concurrency 8). |
| **Perubahan Berkas Rencana** | Middleware/telemetri instrumentasi server dan klien. | `app/(admin)/layout.tsx`, `app/(student)/courses/page.tsx`, migrasi ke `getAuthSession()`. | `app/(admin)/admin/(academic)/courses/[slug]/page.tsx`, penambahan `getCourseTitleOnly`. | `app/(student)/dashboard/page.tsx`, ekstraksi komponen kartu ke sub-komponen asinkron Suspense. | `lib/study-path-service.ts`, `lib/streak-service.ts`, pemisahan read model dari write command. | `app/(admin)/admin/(eval)/questions/page.tsx`, `questions-client.tsx`, `historical-questions-client.tsx`. | `components/notifications/push-permission-init.tsx`, `components/course/tutor-drawer.tsx`, `components/ui/page-transition.tsx`. | Skrip uji beban staging terkontrol, pencatatan log latensi Cloud Run. |
| **Gerbang Metrik Keberhasilan** | Instrumen aktif, baseline R1-R8 terdata rapi. | `getSession` tereksekusi tepat 1 kali per request render pass. | Durasi `generateMetadata` courses detail p95 $\le 50\text{ ms}$. | $T_{\text{primary}}$ dashboard hangat p95 $\le 1200\text{ ms}$, $T_{\text{shell}} \le 200\text{ ms}$. | Kueri SQL dashboard berkurang menjadi kelompok batch; paritas semantik 100%. | Maksimal 10 record soal aktif dikirim; transfer RSC fixture 5.000 soal turun minimal 70% dari baseline identik (target usulan). | Eliminasi panggilan FCM berulang per navigasi; JS Long Tasks pada transisi $\le 50\text{ ms}$. | Ambang batas saturasi CPU dan memori Cloud Run teridentifikasi dengan jelas. |
| **Kriteria Penerimaan & Paritas** | Data waktu server terpisah dari jaringan; zero PII. | Hak akses admin dan isolasi murid tetap identik; unauthorized ditolak. | Tag title dan deskripsi metadata di browser tetap sama persis. | Onboarding dan seluruh modul belajar tampil utuh; CLS $\le 0.1$. | Nilai streak, antrean review, dan konsep belajar siswa identik dengan kondisi sebelumnya. | Filter mata kuliah, status, pencarian, dan pilihan baris berfungsi sama persis. | Izin push notifikasi tetap tersimpan; drawer tutor tetap terbuka sempurna saat diklik. | Tidak ada degradasi ketersediaan pada lingkungan staging. |
| **Rencana Rollback** | Nonaktifkan middleware pelacak waktu. | Kembalikan pemanggilan langsung `auth.api.getSession`. | Kembalikan pemanggilan `getCourseDetailData`. | Kembalikan pembungkusan `Promise.all` di komponen induk. | Kembalikan pembacaan individual dan mutasi inline di `getOrUpdateStreak`. | Kembalikan pemotongan paginasi 10 baris di sisi klien. | Kembalikan efek navigasi FCM dan prefetch idle global drawer tutor. | Hentikan skrip pengujian konkurensi staging. |
| **Peran Penanggung Jawab** | Observability Engineer | Backend Specialist | Fullstack Specialist | Frontend Architect | Database Specialist | Fullstack Specialist | Frontend Specialist | DevOps / Platform Engineer |
| **Prasyarat & Urutan Kerja** | Urutan 0 (Fondasi wajib). | Urutan 1 (Tergantung WP0). | Urutan 2 (Tergantung WP1). | Urutan 3 (Tergantung WP1, WP2). | Urutan 4 (Paralel dengan WP3). | Urutan 5 (Tergantung WP1). | Urutan 6 (Independen terhadap backend). | Urutan 7 (Validasi akhir terpasang). |

---

## 5. Desain Instrumentasi dan Telemetri Masa Depan (Zero-PII)

Setiap implementasi pemantauan performa harus mematuhi kebijakan privasi data dan keamanan sistem Zyx Academy:

1. **Prinsip Zero-PII dan Redaksi Parameter SQL**:
   - Dilarang merekam teks kueri mentah dengan nilai parameter pengguna, kata sandi, token otentikasi, email, nama siswa, atau jawaban kuis.
   - Logging kueri basis data hanya boleh mencatat nama tabel, jenis operasi (`SELECT`, `UPDATE`, `INSERT`), durasi eksekusi dalam milidetik, dan jumlah baris yang terpengaruh (*affected rows*).
2. **Korelasi Jejak (*Trace & Span IDs*)**:
   - Setiap permintaan navigasi dari klien menghasilkan `x-zyx-trace-id` acak di header.
   - Server meneruskan ID ini ke seluruh sub-operasi (RSC rendering, kueri database, autentikasi) untuk memungkinkan penggabungan log latensi secara terpadu.
3. **Pemisahan Metrik Detail**:
   - **Pool Acquire Time**: Waktu tunggu aplikasi mendapatkan koneksi bebas dari pool koneksi database.
   - **Database Execution Time**: Waktu aktual eksekusi kueri di basis data Neon PostgreSQL.
   - **HTTP SQL Gateway Timing**: Waktu latensi gateway serverless (bila menggunakan driver HTTP Neon) terpisah dari eksekusi internal database.
   - **Compressed RSC Bytes**: Ukuran payload respons komponen server setelah kompresi Brotli/Gzip.
   - **Client Hydration Time vs Server Duration**: Memisahkan waktu tunggu respons server dari waktu eksekusi skrip di thread utama browser.

---

## 6. Rencana Alokasi Sumber Daya dan Validasi Visual (Resource Plan)

### 6.1 Batasan Penggunaan Sumber Daya Lokal Sandbox
Sesuai panduan di `AGENTS.md` dan `DEVELOPMENT.md`:
- **Satu Tugas Berat dalam Satu Waktu**: Dilarang menjalankan proses build, pengujian ekstensif, atau analisis typecheck secara paralel. Maksimal hanya SATU proses berat yang boleh berjalan dalam satu waktu.
- **Validasi Terfokus (*Focused Validation*)**: Tidak menjalankan `bun run lint` atau `bun run typecheck` untuk pekerjaan dokumentasi, rencana, atau perubahan kecil. Validasi lokal dilakukan dengan tes terfokus dan `git diff --check`.
- **Tidak Membuka Server Mandiri**: Jangan meluncurkan instance dev server atau daemon server baru di background sandbox tanpa otorisasi tugas.

### 6.2 Tata Kelola Pengujian Staging Jarak Jauh
- Pengujian terhadap lingkungan staging jarak jauh harus mengikuti runbook `docs/operations/visual-audit-capture.md`.
- Sesi staging diperoleh secara read-only dengan pola `scripts/staging/smoke-auth.ts`, tanpa melakukan mutasi pada tabel data pengguna nyata.
- Dilarang mengambil screenshot atau memuat data personal akun nyata dari lingkungan produksi.

### 6.3 Tanggung Jawab Pemeriksaan Kualitas Visual (Visual Quality Sign-Off)
- Perubahan antarmuka material pada klien yang memengaruhi tata letak, navigasi, atau tipografi **wajib diinspeksi langsung oleh Agen Utama (Primary Agent)**.
- Sub-agent atau agen pembantu dilarang memberikan *sign-off* visual. Klaim bahwa tampilan sudah rapi tanpa bukti inspeksi gambar nyata adalah tidak sah.
- Matriks inspeksi visual wajib menghasilkan tangkapan layar pada dua resolusi standar:
  - **Ponsel Pintar**: $380 \times 844$ piksel.
  - **Desktop Laptop**: $1536 \times 864$ piksel (skala CSS efektif pada layar 1080p).
- Evaluasi visual harus memastikan tidak ada teks yang terpotong (*clipped text*), tidak ada *horizontal overflow* (`scrollWidth <= clientWidth`), dan komponen mengikuti hierarki kartu hemat (*less cards*) dan tipografi standar Zyx.

---

## 7. Fase Rollout, Kriteria Go / No-Go, dan Tata Kelola Feature Flag

Implementasi teknis dibagi menjadi 5 fase berurutan dengan gerbang evaluasi ketat (*gates*):

```text
[Fase 0: Baseline & Telemetri] 
             │
             ▼ (Gate: Baseline Tervalidasi Sebelum Kode Diubah)
[Fase 1: Deduplikasi Sesi & Metadata Ringan] 
             │
             ▼ (Gate: Regresi Auth Nol & Metadata p95 <= 50ms)
[Fase 2: Streaming Dashboard Siswa & Batch Data Belajar] 
             │
             ▼ (Gate: Paritas Data Belajar 100% & p95 <= 1200ms)
[Fase 3: Paginasi Server Bank Soal & Rendering Asesmen] 
             │
             ▼ (Gate: Seleksi Lintas Halaman Sempurna & DOM Stabil)
[Fase 4: Optimasi Klien & Profiling Staging Cloud Run]
```

### 7.1 Rincian Gerbang Keputusan (Go / No-Go Criteria)

1. **Gerbang Fase 0 ke Fase 1 (Baseline Terverifikasi)**:
   - *Go*: Minimal 40 sampel navigasi hangat per skenario tercatat secara objektif di lingkungan staging atau sandbox terautentikasi; data baseline menjadi acuan sebelum kode diubah.
   - *No-Go*: Pengujian gagal membedakan waktu server dari waktu jaringan, atau data baseline tercampur dengan derau perangkat lokal.
2. **Gerbang Fase 1 ke Fase 2 (Integritas Sesi Terjaga)**:
   - *Go*: Sesi ter-deduplikasi menjadi tepat 1 eksekusi per request render pass; pengujian otorisasi admin dan isolasi murid 100% lulus tanpa kebocoran sesi lintas-request.
   - *No-Go*: Ditemukan kegagalan deteksi token kedaluwarsa atau Server Actions terkompromi.
3. **Gerbang Fase 2 ke Fase 3 (Paritas Belajar Terbukti)**:
   - *Go*: Tidak ada perubahan pada nilai streak, antrean kartu flashcard, atau histori progres siswa; fallback Suspense tidak menyebabkan layout jump besar (CLS $\le 0.1$).
   - *No-Go*: Terjadi inkonsistensi data antara model lama dan model streaming baru, atau mahasiswa baru gagal melihat alur onboarding.
4. **Gerbang Fase 3 ke Fase 4 (Aksesibilitas Paginasi Sempurna)**:
   - *Go*: Navigasi paginasi server bank soal mendukung tombol back browser, sinkronisasi URL search params akurat, seleksi baris lintas-halaman bertahan, dan perenderan KaTeX tidak memicu long-task $> 100\text{ ms}$.
   - *No-Go*: Status checkbox seleksi soal hilang tanpa konfirmasi saat pindah halaman, atau jumlah total soal tidak sinkron dengan database.

### 7.2 Prosedur Rollback Tingkat Unit Kode (Unit-Level Rollback)
Setiap paket kerja dirancang sebagai unit perubahan kode terisolasi:
- Rollback tidak boleh mengandalkan perubahan konfigurasi eksternal atau mutasi database destruktif.
- Jika sebuah paket kerja menimbulkan regresi, rollback dilakukan dengan membatalkan komit (*git revert*) unit kode berkas terkait tanpa mengganggu paket kerja lain yang sudah stabil.

### 7.3 Kebijakan Feature Flag
Sesuai dengan ketentuan di `AGENTS.md`:
- Perubahan performa pada rencana ini adalah optimalisasi perilaku yang sudah ada (*existing behavior performance*), sehingga **tidak menambahkan atau menghapus `FEATURE_*` flags secara diam-diam**.
- Jika di masa implementasi ditemukan kebutuhan kemampuan opsional baru yang memerlukan flag, pengembang wajib meminta persetujuan pengguna terlebih dahulu dengan menyertakan nama kunci flag, rasional, nilai default, cakupan dampak, jalur rollback, dan batas waktu penghapusan flag.

---

## 8. Ketidakpastian Eksplisit, Bukti Sumber Kode, dan Tautan Referensi

### 8.1 Inventaris Ketidakpastian Teknis (Explicit Uncertainties)
1. **Jumlah Kueri Aktual per Rute**: Jumlah kueri aktual bergantung pada jumlah mata kuliah yang diambil siswa (`enrolledCourseIds.length`), keberadaan data refleksi mingguan, dan status streak siswa. Angka pasti baru dapat dipublikasikan setelah WP0 selesai diimplementasikan.
2. **Karakteristik Latensi Jaringan Cloud Run ke Neon**: Staging berada di Taiwan (`asia-east1`) sementara basis data berada di kluster Neon. Latensi roundtrip jaringan antar-region belum diukur secara terisolasi dari waktu eksekusi SQL.
3. **Overhead Sebenarnya dari CodeMirror**: Dampak pemuatan awal modul editor terhadap memori klien ponsel berspesifikasi rendah belum dapat dipastikan sebelum uji bundle analyzer dan pengujian perangkat nyata dijalankan.
4. **Pemisahan Mutasi Streak**: Keputusan memindahkan penulisan streak keluar dari alur pembacaan dashboard GET memerlukan konfirmasi produk resmi agar tidak mengganggu ekspektasi pengguna yang login harian.

### 8.2 Bukti Sumber Kode Terkonfirmasi (Source Evidence)
- Logika Pengambilan Data Dashboard Siswa: [page.tsx](../app/(student)/dashboard/page.tsx)
- Helper Sesi Request-Scoped: [auth-session.ts](../lib/auth-session.ts)
- Layout admin dengan sesi bersama: [layout.tsx](../app/(admin)/layout.tsx)
- Halaman course dengan metadata ringan: [page.tsx](../app/(admin)/admin/(academic)/courses/[slug]/page.tsx)
- Implementasi Kueri Detail Kursus: [actions.ts](../app/(admin)/admin/(academic)/courses/actions.ts)
- Pilot paginasi server bank soal: [page.tsx](../app/(admin)/admin/(eval)/questions/page.tsx)
- Kontrol URL dan seleksi bank soal: [questions-client.tsx](../app/(admin)/admin/(eval)/questions/questions-client.tsx)
- Rendering KaTeX Asesmen tanpa Paginasi: [detail-client.tsx](../app/(admin)/admin/(content)/assessments/[id]/detail-client.tsx)
- Logika Tab History API: [use-url-tab.ts](../hooks/use-url-tab.ts)
- Tautan Navigasi Rute TabNav: [tabs.tsx](../components/ui/tabs.tsx)
- Transisi Halaman dengan Key Pathname: [page-transition.tsx](../components/ui/page-transition.tsx)
- Prefetch Idle Drawer Tutor: [tutor-drawer.tsx](../components/course/tutor-drawer.tsx)
- Inisialisasi Notifikasi Push: [push-permission-init.tsx](../components/notifications/push-permission-init.tsx)
- Spesifikasi Dokumentasi Staging Cloud Run: [cloud-run-staging.md](../docs/operations/cloud-run-staging.md)

Gerbang tersisa: pengukuran statistik kandidat pada kedua viewport dengan minimal 40 sampel warm valid per metrik untuk p95, serta 3 browser-context-cold; validasi visual state dan viewport termasuk loading/error/retry, onboarding tanpa enrollment, dan bank soal historis; verifikasi FCM terkonfigurasi; profiling CodeMirror/PageTransition; dan pengukuran kapasitas Cloud Run aktual. Browser cold tidak membuktikan cold container atau cold DB. Batch materi dan asesmen tetap dalam pengerjaan. Hasil sebelumnya tidak memverifikasi source kandidat saat ini.
