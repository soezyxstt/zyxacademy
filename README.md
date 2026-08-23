# Zyx Academy

**Stack:** Next.js 16 (App Router), Drizzle ORM + Turso/SQLite, Better-Auth, Google Gemini, Cloudflare Vectorize, Cloudflare R2, Inngest.

## Docs

| File | What it covers |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full system architecture: 4-layer design, database domains, AI pipelines, directory map, data flows |
| [features.md](docs/features.md) | User-facing workflows: roles, pipelines, quota rules |
| [DB_SCHEMA.md](docs/DB_SCHEMA.md) | Detailed table-by-table schema reference |
| [DATABASE.md](docs/DATABASE.md) | Database setup, migration workflow, key design decisions |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Dev setup, commands, env vars, feature flags, code conventions |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production architecture, staging overhaul, Turso, Cloudflare Workers, services |
| [docs/bundle/](docs/bundle/) | Idea Bundle V2, Product Bundle V2, and Authoring Pack ZIP contracts |
| [docs/operations/](docs/operations/) | Production readiness checklist, Zyra runbooks, bundle manual test plan |
| [docs/audit/](docs/audit/) | Historical use-case audit snapshots (read-only record) |
| [plans/](plans/) | Active plan specs; completed program notes in [plans/README.md](plans/README.md) |

## Quick Start

```bash
bun install
cp .env.example .env.local   # fill in secrets
bun run dev                   # http://localhost:3000
```

## Kontribusi fitur

Gunakan branch turunan dari `staging`. Jangan push langsung ke branch `staging` atau `main`.

### 1. Clone repository dan buat branch

```bash
git clone https://github.com/soezyxstt/zyx-edu.git
cd zyx-edu
git fetch origin staging
git switch -c feature/nama-fitur origin/staging
```

Ganti `feature/nama-fitur` dengan nama branch yang menjelaskan perubahan.

### 2. Install dependency

```bash
bun install
cp .env.example .env.local
```

Isi `.env.local` dengan nilai lokal yang diperlukan. Jangan commit secret atau file `.env.local`.

### 3. Tambahkan fitur

- Baca `AGENTS.md` dan dokumentasi terkait sebelum mengubah kode.
- Ikuti design system dan pola arsitektur yang sudah ada.
- Jika fitur perlu feature flag, tambahkan flag tersebut melalui `lib/env.ts` dan gunakan nilai `1` untuk mengaktifkannya.
- Jika fitur mengubah database, ikuti alur schema dan migration yang dijelaskan di `AGENTS.md`.
- Perbarui dokumentasi yang terdampak.

### 4. Jalankan validasi dan perbaiki error

```bash
bun run lint
bun run build
```

Jika ada error, perbaiki perubahan di branch yang sama lalu ulangi `bun run lint` dan `bun run build` sampai keduanya berhasil. Jangan lanjut ke tahap berikutnya jika masih ada error.

### 5. Sinkronkan branch dengan staging

Setelah validasi lokal berhasil, ambil perubahan terbaru dari `staging` dan rebase branch fitur di atasnya:

```bash
git fetch origin staging
git pull --rebase origin staging
```

Jika terjadi conflict, selesaikan conflict, jalankan `git add <file>`, lalu lanjutkan dengan `git rebase --continue`. Setelah rebase selesai, ulangi validasi:

```bash
bun run lint
bun run build
git diff --check
```

### 6. Push branch ke origin

```bash
git push -u origin feature/nama-fitur
```

### 7. Buat pull request

Buat PR dengan target branch `staging`. Deskripsikan fitur dan perubahan yang dibuat. Sertakan hasil validasi serta daftar environment variable baru, atau tulis `Tidak ada` jika tidak ada env variable yang ditambahkan.

Gunakan struktur berikut dalam deskripsi PR:

```md
## Ringkasan fitur
- Jelaskan fitur dan masalah yang diselesaikan.

## Perubahan utama
- Jelaskan area kode, UI, API, database, atau dokumentasi yang berubah.

## Validasi
- [ ] `bun run lint`
- [ ] `bun run build`
- [ ] `git diff --check`

## Environment variable
- Tidak ada

<!-- Jika ada, ganti bagian di atas dengan daftar berikut:
- `NAMA_VARIABLE`: wajib atau opsional, tujuan, dan contoh nilai non-secret.
- Sudah ditambahkan ke `.env.example` dan `lib/env.ts`.
-->

## Catatan tambahan
- Jelaskan migration, feature flag, risiko, atau langkah manual yang diperlukan.
```

## Reference

- **[AGENTS.md](AGENTS.md)**; coding rules and conventions for AI agents
- **[plans/README.md](plans/README.md)**; completed program invariants and the active plan
