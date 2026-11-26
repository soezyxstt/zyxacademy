# Referensi web flashcard Student

Tangkapan Playwright menggunakan komponen flashcard web dan data sintetis pada Chromium 154.0.8037.57 dengan Playwright 1.62.1. Project `mobile-380` menetapkan viewport 380 × 844, DPR 1, tema terang, locale `id-ID`, dan zona waktu `Asia/Jakarta`. Fixture membekukan waktu pada 18 November 2026 untuk mengontrol percobaan review. [Spec Playwright](../../../learning-query.spec.ts) · [Fixture UI](../../../fixtures/learning-query.tsx)

| Kasus | Tangkapan asli | SHA-256 |
|---|---|---|
| Pertanyaan sebelum kartu dibalik. Panel penilaian belum terlihat. | [question.png](web/question.png) | `cb6abc4721c6a0dd21161e0aab1d7436fa5efccdee8bd0c7c9761317912cabf2` |
| Jawaban terbuka. Empat nilai dibekukan sementara saat permintaan berjalan. | [review-pending.png](web/review-pending.png) | `f86768e330e130a5aeb20dabd218161e4d4ea6a5fd55e90b9e778e21dc0f0ca6` |
| Respons review tidak valid. Kartu dan panel penilaian tetap terlihat. | [review-failed.png](web/review-failed.png) | `05d571c64ae2858324f9cdc7b69ecc31dca11ad86462e2d4788f328e19943026` |

Blob Git untuk komponen flashcard web adalah `3c70ac7be0f98b67866aace9a86b9e7b4519978c`. Blob spec adalah `35139f8e79a1cf8cb42931c51329d3149b3f1fa6`, fixture UI `f8efa7f7ba80082b99a9d46d8c5bc88345ac3d41`, dan builder fixture `dbaf7276e15ccf9d36a0f473f48d89af9ece8ec9`. File PNG disalin tanpa perubahan dari hasil Playwright.

```sh
PLAYWRIGHT_BASE_URL=http://learning-query.invalid \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
bun run test:visual tests/visual/learning-query.spec.ts \
  --project mobile-380 --grep 'flashcards keep the active card'
```

Ketiga tes flashcard web lulus di viewport 380 × 844 dan 1536 × 864. Spec memeriksa perubahan akun, status simpan, pemulihan, koordinat overflow horizontal, serta error HTTP dan konsol. Pada kedua tangkapan sisi jawaban di sini, batas atas panel penilaian web mulai pada y=777 dan menyisakan 67 px hingga dasar viewport. [Komponen web](../../../../../app/(student)/courses/[id]/flashcard/flashcard-client.tsx)

## Perbedaan yang perlu diukur pada perangkat

Expo menempatkan panel penilaian di bawah area gulir pada lebar kurang dari 768 dp, di dalam safe area host. Tombol tetap mengikuti ukuran teks perangkat. Pada layout lebar, panel mengikuti urutan isi halaman. Kartu memakai rotasi perspektif 600 ms ketika pengurangan gerak dinonaktifkan. Pada preferensi pengurangan gerak aktif, sisi kartu berganti langsung dan sisi tersembunyi keluar dari pohon aksesibilitas.

Referensi web memakai radius kartu `rounded-2xl`, empat warna grade terpisah, dan toast kegagalan di tepi atas. Expo memakai radius kartu 10 dp, palet tombol bersama, pesan kegagalan inline, dan header rute dari shell native. Respons simpan yang tidak valid mempertahankan kartu dan panel. Expo meminta pengguna memuat ulang antrean sebelum mengirim grade lagi. Android dan iOS perlu merekam koordinat panel setelah safe area, perubahan sisi dengan dan tanpa pengurangan gerak, fokus aksesibilitas, dan diff piksel memakai data, tema, serta density yang sama.
