# Uji API akademik di mesin lokal

Fixture ini memakai database PostgreSQL sekali pakai, tiga akun sintetis, autentikasi Better Auth, dan Route Handler Next.js asli. Perintah memakai checkout tanpa file .env layanan. Jalankan dari root repo dengan dependensi Bun terpasang. Port 55434 untuk PostgreSQL dan 3314 untuk Next.js harus tersedia.

```sh
docker run --rm -d --name academic-smoke -p 127.0.0.1:55434:5432 \
  -e POSTGRES_DB=academic -e POSTGRES_PASSWORD=academic-local-only postgres:17-alpine
until docker exec academic-smoke pg_isready -U postgres -d academic; do sleep 1; done
cat drizzle-postgres/*.sql packages/native-parity/academic/local/seed.sql | \
  docker exec -i academic-smoke psql -v ON_ERROR_STOP=1 -U postgres -d academic
DATABASE_URL=postgres://postgres:academic-local-only@127.0.0.1:55434/academic \
  BETTER_AUTH_SECRET=academic-local-fixture-secret-for-smoke-only \
  BETTER_AUTH_URL=http://localhost:3314 NEXT_PUBLIC_APP_URL=http://localhost:3314 \
  SKIP_ENV_VALIDATION=1 NEXT_TELEMETRY_DISABLED=1 \
  node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3314
```

Jalankan dari terminal kedua.

```sh
node packages/native-parity/academic/local/smoke.mjs
node packages/native-parity/academic/local/course-settings-smoke.mjs
node packages/native-parity/academic/local/pka-announcement-smoke.mjs
node packages/native-parity/academic/local/study-group-smoke.mjs
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/visual/native-parallel/academic/route-smoke.mjs
```

Kontainer menyimpan data dalam penyimpanan sementara. Setelah pengujian, hentikan server Next.js dan jalankan `docker stop academic-smoke`. Referensi rute bersesi disimpan di `artifacts/native-parity/academic/routes`.

Capture web menyembunyikan indikator pengembangan Next.js pada elemen `nextjs-portal`. Font, isi halaman, navigasi dan ukuran viewport tetap berasal dari halaman web yang diuji.

Untuk menelusuri alur lewat tautan dan kontrol web yang dirender, jalankan:

```sh
PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium node tests/visual/native-parallel/academic/first-journeys.mjs
```

Tutor sintetis sudah menyelesaikan tur pengenalan. Entri menyimpan tanggal pendaftaran peserta secara tetap. Sesi autentikasi lokal berlaku dua hari setelah seed dijalankan. Di web Tutor, informasi peserta muncul langsung di kartu. Di web Admin, kembali dari detail mengembalikan kategori ke “Semua”. Skenario native `courses.yaml` menguji perilaku yang diminta untuk aplikasi, yaitu mempertahankan pencarian dan kategori. Hasil observasi web ada di [first-journeys](../../../../tests/visual/native-parallel/academic/web/first-journeys/manifest.json).
