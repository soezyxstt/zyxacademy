# Prosedur Visual Capture Halaman dengan Sesi Staging

Prosedur ini menghasilkan screenshot halaman aplikasi yang terhubung ke database staging, termasuk halaman terproteksi seperti `/admin`, tanpa mutasi data dan tanpa membocorkan rahasia. Dipakai untuk audit kualitas visual; contoh hasil pemakaian: `docs/audit/admin-visual-quality-audit.md`.

## Aturan keselamatan

- Read-only terhadap database dan storage. Tidak ada INSERT, UPDATE, DELETE.
- Jangan pernah mencetak isi `.env.staging`, token sesi, tanda tangan cookie, atau nilai koneksi ke log, laporan, atau chat. Cetak hanya boolean dan metrik.
- Screenshot memuat data staging asli (nama, email). Simpan di `artifacts/` yang diabaikan git dan jangan dibagikan.
- Matikan server lokal setelah selesai.

## Fakta lingkungan yang menentukan pendekatan

1. Koneksi database bergantung `NODE_ENV`. `lib/db/index.ts` memakai `TURSO_DATABASE_URL`/`TURSO_CONNECTION_URL` + `TURSO_AUTH_TOKEN` hanya saat `NODE_ENV=production`. Saat `next dev`, koneksi memakai `DATABASE_URL` tanpa token sehingga Turso menjawab 401. Karena itu gunakan build produksi (`next build` lalu `next start`), bukan `next dev`.
2. `bun` belum tentu ada dan `node --env-file` bisa ditolak oleh `NODE_OPTIONS` lingkungan. Gunakan launcher yang mem-parse `.env.staging` sendiri.
3. Nama cookie sesi Better Auth terobservasi punya dua mode: `better-auth.session_token` (http) dan `__Secure-better-auth.session_token` (produksi/https). Mekanisme internalnya bergantung kombinasi `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, dan `NODE_ENV`. Jangan ditebak; probe seperti pada Langkah 3.
4. Sesi admin staging dipakai manusia yang aktif berdevelop. Token bisa invalid sewaktu-waktu karena rotasi atau relogin. Ambil token segar dari database tepat sebelum setiap navigasi dan pakai sekali per navigasi.
5. Memulai server baru tanpa mematikan server lama membuat proses lama menyajikan manifest build campuran; gejalanya `ChunkLoadError` dan HTTP 500 pada `/_next/static/chunks/*`.

## Langkah 1: Launcher env

Simpan di luar repo, misal `/tmp/run-next-staging.mjs`. Parser sederhana ini tidak pernah menampilkan nilai.

```js
import { readFileSync } from "node:fs";
for (const line of readFileSync("/workspaces/zyx-edu/.env.staging", "utf8").split("\n")) {
  const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!(m[1] in process.env)) process.env[m[1]] = v;
}
// build dan start butuh production agar lib/db memakai TURSO_* + token
process.env.NODE_ENV = process.argv.includes("dev") ? "development" : "production";
process.argv = [process.argv[0], "next", ...process.argv.slice(2)];
await import("/workspaces/zyx-edu/node_modules/next/dist/bin/next");
```

## Langkah 2: Build dan start

```bash
# pastikan tidak ada server lama; lihat PID dari ss, bukan pkill -f
ss -ltnp | grep 3100          # catat PID bila ada, lalu kill -9 <PID>
setsid nohup node /tmp/run-next-staging.mjs build > /tmp/next-build.log 2>&1 &
# tunggu hingga selesai, lalu:
setsid nohup node /tmp/run-next-staging.mjs start --port 3100 > /tmp/next-start.log 2>&1 &
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/sign-in   # harapan: 200
grep -c EADDRINUSE /tmp/next-start.log                                   # harapan: 0
```

Override runtime opsional: `BETTER_AUTH_URL=http://localhost:3100` dan `NEXT_PUBLIC_APP_URL=http://localhost:3100` membuat fetch sesi sisi klien same-origin sehingga tidak ada noise CORS. Jangan lupa build ulang bila mengubah `NEXT_PUBLIC_APP_URL` karena nilai itu di-inline saat build.

## Langkah 3: Cookie sesi read-only

Pola sama dengan `scripts/staging/smoke-auth.ts`: ambil satu token sesi admin aktif, tandatangani lokal dengan HMAC, pakai sebagai cookie.

```js
import { createClient } from "@libsql/client";
import { createHash, createHmac } from "node:crypto";

// ENV sudah dimuat launcher; ulangi parse bila skrip berdiri sendiri
const client = createClient({
  url: ENV.TURSO_DATABASE_URL?.trim() || ENV.TURSO_CONNECTION_URL?.trim() || ENV.DATABASE_URL?.trim(),
  authToken: ENV.TURSO_AUTH_TOKEN?.trim() || undefined,
});

async function freshSignedCookie() {
  const r = await client.execute({
    sql: `SELECT s.token FROM pengguna p
          INNER JOIN pengguna_peran pp ON pp.pengguna_id = p.id
          INNER JOIN peran r ON r.id = pp.peran_id
          INNER JOIN session s ON s.user_id = p.id
          WHERE p.status = 'active' AND r.code = 'admin'
            AND (s.expires_at > ? OR s.expires_at > ?)
          ORDER BY s.updated_at DESC LIMIT 1`,
    args: [Date.now(), Math.floor(Date.now() / 1000)],
  });
  const token = String(r.rows[0].token);
  const secret = rawSecret().length >= 32 ? rawSecret()
    : createHash("sha256").update(`zyx-edu:better-auth:secret-stretch:v1:${rawSecret()}`, "utf8").digest("base64url");
  const sig = createHmac("sha256", secret).update(token, "utf8").digest("base64");
  return encodeURIComponent(`${token}.${sig}`);
}
function rawSecret() { return ENV.BETTER_AUTH_SECRET; }
```

Tentukan nama cookie dengan probe, sekali per sesi server, dan probe ulang setelah restart server atau perubahan env:

```js
for (const name of ["better-auth.session_token", "__Secure-better-auth.session_token"]) {
  const res = await fetch("http://localhost:3100/api/auth/get-session", { headers: { cookie: `${name}=${value}` } });
  if ((await res.text()).includes('"user"')) console.log(JSON.stringify({ mode: name.includes("Secure") ? "secure" : "plain" }));
}
```

Saat memasang di Puppeteer, varian `__Secure-` butuh `secure: true`; localhost dipercaya Chrome sehingga tetap bisa dipasang di http.

## Langkah 4: Crawl Puppeteer

Prinsip yang terbukti benar; menyimpang dari salah satu poin ini berpotensi mengulang eksperimen panjang:

1. Satu `page` baru per rute. Cookie segar dari `freshSignedCookie()` tepat sebelum navigasi, dipakai tepat satu kali.
2. Tema gelap lewat emulasi media, bukan priming `localStorage`. `ThemeProvider` memakai `attribute="class"` dengan `defaultTheme="system"`, jadi `prefers-color-scheme: dark` sudah cukup. Priming ke `/sign-in` sebelum navigasi target terbukti memicu kegagalan sesi.
3. `waitUntil: "domcontentloaded"` + jeda tetap (3 sampai 4 detik) + satu pass scroll untuk memicu konten lazy. Hindari `networkidle2`: halaman berat (analytics, jobs) tidak pernah idle dan selalu timeout.
4. Jangan pakai `page.setRequestInterception`. Pada pengujian kami, mengaktifkannya berkorelasi kuat dengan kegagalan sesi masif.
5. Validasi lingkungan di halaman pertama: bila muncul `ChunkLoadError`, hentikan crawl; itu tanda server lama menyajikan artefak build campuran, bukan masalah halaman.
6. Metrik per muatan: status HTTP, URL akhir (deteksi redirect ke `/sign-in`), `scrollWidth > clientWidth` (overflow), jumlah dan teks H1, error konsol, respons >= 400. Simpan screenshot `fullPage`.

Kerangka inti:

```js
const page = await browser.newPage();
if (variant === "desktop-dark") {
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
}
await page.setViewport(variant === "mobile-light"
  ? { width: 380, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { width: 1440, height: 900, deviceScaleFactor: 1 });
await page.setCookie({ name: cookieName, value: await freshSignedCookie(), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax", secure: cookieName.includes("Secure") });
const resp = await page.goto("http://localhost:3100" + path, { waitUntil: "domcontentloaded", timeout: 60000 });
// bila finalUrl diawali /sign-in: ulangi sekali dengan token segar baru; bila tetap gagal, tandai gagal
await new Promise((r) => setTimeout(r, 3500));
// scroll pass, evaluasi metrik, lalu:
await page.screenshot({ path: `artifacts/manual/${tanggal}/${slug(path)}/${variant}.png`, fullPage: true });
await page.close();
```

Varian standar agar hasil sebanding dengan audit sebelumnya: `desktop-light`, `desktop-dark`, `mobile-light` pada seluruh rute `app/(admin)/admin/**/page.tsx`. Rute dinamis memakai satu ID nyata per entitas lewat SELECT read-only (`courses`, `quiz_templates`, `blog_articles`, `google_meet_sessions`, `custom_forms`, `assessment_sources`, `impor_bundle` dengan filter `bundle_type`).

## Jebakan yang sudah terbukti

| Gejala | Penyebab | Penanganan |
|---|---|---|
| `get-session` 500 dengan `LibsqlError 401` | `next dev` memakai `DATABASE_URL` tanpa token | Gunakan `next build` + `next start` sehingga `NODE_ENV=production` |
| 500 pada `/_next/static/chunks/*`, `ChunkLoadError` | Server lama masih hidup saat artefak build diganti | Kill PID lama dari `ss -ltnp` sebelum start; abort crawl bila ChunkLoadError muncul |
| Redirect ke `/sign-in` meski cookie tampak benar | Nama cookie salah mode, atau token sudah pernah dipakai | Probe nama cookie; token segar sekali pakai per navigasi; tanpa priming |
| `EADDRINUSE` saat start | Server sebelumnya belum mati | Kill PID dari `ss -ltnp`; proses `next-server` terpisah dari launcher |
| `pkill -f` menggantung atau membunuh shell sendiri | Pola cocok dengan baris perintah shell yang menjalankannya | Pakai kurung untuk memecah pola (`run-next-[s]taging`) atau kill PID langsung; jangan gabungkan pkill dengan perintah yang memuat pola polosnya |
| 404 `/_vercel/insights`, `/_vercel/speed-insights` | Skrip Vercel tidak ada di server lokal | Noise; abaikan, jangan laporkan sebagai defect |
| PostHog/Sentry terkirim ke proyek staging | Telemetri klien aktif | Blokir di level jaringan bila perlu; jangan pakai request interception Puppeteer |
| `assessment_sources` kosong | Data staging belum ada | Lewati rute detail terkait dan catat di laporan |

## Pembersihan

1. `kill -9 <PID>` server dari `ss -ltnp | grep <port>`.
2. `git status --short`: hanya berkas yang memang disengaja (laporan audit, dokumen prosedur). `artifacts/` diabaikan git.
3. Skrip bantu di `/tmp` tidak perlu di-commit; dokumen ini memuat semua yang dibutuhkan untuk membangunnya ulang.
