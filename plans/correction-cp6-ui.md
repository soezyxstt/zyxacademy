# Verdict REVISE (Round 2): Checkpoint 6 (OPS-AI-V2-CP6-UI)

Task ID: `OPS-AI-V2-CP6-UI` (Correction Pass 2)
Target Worker: `agy, gemini-3.7-flash-high`
Verdict: **REVISE**

## 1. Temuan Cacat Visual dari Inspeksi Tangkapan Layar Playwright

Primary orchestrator telah menjalankan ulang Playwright dan memeriksa tangkapan layar biner terbaru di `artifacts/visual-ops-ai/`.

### Progres Positif:
- Perbaikan Cacat 2 (judul proposal aksi) dan Cacat 3 (label sitasi resmi) berhasil dengan sangat baik: judul proposal sekarang membungkus secara natural di mobile dan label sitasi resmi tidak lagi terpotong.
- Seluruh 7 pengujian desktop (laptop 1536x864) dan resizing min-width (360px) / wide-width (640px) lulus 100%.

### Cacat Kritis yang Tersisa:

#### Cacat 1 (Kritis): Hilangnya `z-50` pada Kontainer Panel Mobile (`ops-ai-panel.tsx:465`)
- **Bukti Visual**: Pada tangkapan layar `artifacts/visual-ops-ai/mobile-380-open-empty.png` dan `mobile-380-action-proposal.png`, panel tampak gelap gulita dan teks bertumpuk tembus pandang dengan halaman latar belakang.
- **Penyebab**:
  Saat mengubah kelas kontainer menjadi `fixed inset-0`, kelas `z-50` **tidak sengaja terhapus**:
  ```tsx
  // Baris 465 saat ini (SALAH):
  "fixed inset-0 w-full sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[480px] h-full shadow-2xl",
  ```
  Sementara itu, backdrop overlay mobile di baris 450 memiliki `z-40`:
  ```tsx
  className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity lg:hidden"
  ```
  Karena panel tidak memiliki z-index di mobile (default `z-0` / `auto`), panel terperangkap di bawah lapisan hitam backdrop `z-40`, sehingga seluruh konten panel tertutup lapisan gelap dan konten utama di belakangnya tembus pandang.
- **Perbaikan Wajib**:
  Tambahkan kembali `z-50` pada kelas mobile di baris 465:
  ```tsx
  "fixed inset-0 z-50 w-full sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[480px] h-full shadow-2xl",
  ```

#### Cacat 2: React Hydration Warning pada Nilai Width & Aria Separator (`ops-ai-panel.tsx`)
- **Penyebab**: Pada saat SSR, server menganggap desktop default (`isDesktop = true`, `width = 480`), sedangkan pada viewport mobile (380px), client langsung melakukan clamp ke `360` dan `isDesktop = false`. React 19 mendeteksi perbedaan atribut `style={{ width }}` dan `aria-valuenow`.
- **Perbaikan Wajib**:
  1. Tambahkan `suppressHydrationWarning` pada `<aside id="ops-ai-panel">` dan `<div role="separator">`.
  2. Atau gunakan state `mounted` (`const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), []);`) sehingga atribut yang bergantung pada ukuran viewport jendela (`isDesktop ? ... : undefined`) hanya diaktifkan setelah komponen ter-mount di client.

## 2. File Ownership Tetap
- `components/admin/ops-ai/ops-ai-panel.tsx`
- `components/admin/ops-ai/ops-ai-context.tsx`
- `tests/unit/admin-ops-ai-ui.test.tsx`

## 3. Tugas Anda
1. Tambahkan `z-50` pada kontainer mobile di `components/admin/ops-ai/ops-ai-panel.tsx`.
2. Hilangkan hydration warning pada `ops-ai-panel.tsx`.
3. Jalankan `bun test tests/unit/admin-ops-ai-ui.test.tsx` dan `git diff --check`.
4. Laporkan kembali sesuai Format Report Wajib.
