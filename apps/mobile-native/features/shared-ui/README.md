# Layout bersama Expo

Impor dari `apps/mobile-native/features/shared-ui`. Komponen menerima data, label terjemahan, tema, dan callback dari halaman. Halaman menyediakan izin, tujuan Back, pemuatan, filter, dan retry melalui adapter domain yang sesuai.

| Ekspor | Kontrak pemanggil |
| --- | --- |
| `NativeCompactShell` | `children` dalam safe area dengan gutter responsif. `topBar` dan `bottomBar` menerima navigasi dalam safe area. `navigationTitle` memberi judul bilah bawaan, `back` menerima `{ label, onPress }`, dan `edges` mengatur inset yang ditangani shell. Host router menangani Back sistem dan riwayat. |
| `NativePageHeader<Id>` | `title` opsional memberi heading pembaca layar ketika judul belum tersedia melalui navigasi. `actions` menerima `SharedUiAction<Id>[]` dan memerlukan `onAction(id)`. Bilah kontrol hanya memerlukan ruang ketika ada aksi. |
| `SharedUiAction<Id>` | `id` berupa union string milik halaman. `label` untuk teks, `accessibilityLabel` opsional, dan `pending` atau `disabled` mencegah aktivasi. Aksi `iconOnly` memerlukan `renderIcon`. `variant` memakai varian `Button` native. |
| `SharedUiActionButton<Id>` | Menghubungkan `action` ke `onAction(id)` dengan `theme` dan `testID` opsional. |
| `NativeResponsiveList<Row, Id>` | `label` menamai daftar. `state` menerima `{ status: "ready", rows }`, `{ status: "loading", label }`, atau `{ status: "error", title, message?, action?, onAction? }`. `empty` memasok teks dan aksi ketika data siap dengan 0 baris. Sediakan `getRowKey(row)` yang stabil dan `renderRow(row, layout)`. `layout` beralih ke `wide` saat lebar daftar setelah gutter mencapai 768 dp dikalikan skala teks (minimum 1). Daftar menggunakan `FlatList`, tempatkan dalam induk yang memiliki tinggi dan letakkan kontrol di sekelilingnya. |
| `NativeListRow<Id>` | `layout`, `title`, `subtitle`, `leading`, `metadata` berlabel, dan `primary` opsional untuk navigasi baris. `actions` terpisah menerima `onAction(id)`, sehingga aksi baris dapat diakses mandiri. |
| `NativeStatusPanel<Id>` | Teks `title` dan `message` opsional dengan `tone` `empty` atau `error`. Jika memasok `action`, sambungkan `onAction(id)`. Bisa digunakan di luar daftar. |

`theme` opsional mengikuti tema sistem. Jika host memiliki pilihan tema sendiri, teruskan nilai yang sama ke shell dan setiap komposit. Bungkus akar aplikasi dengan `SafeAreaProvider` dan muat `nativeFontSources` seperti entry Expo.

## Kasus yang dapat dijalankan

`FirstSliceExample` menerima `caseId` dari `packages/native-parity/shared-ui/layout-cases.ts`. Kasus awal `shared-ui-shell-back-light` menampilkan dokumen, membuka baris dokumen, dan kembali ke kelas. Panggilan `FirstSliceExample` tanpa `caseId` membuka kasus ini. Di harness galeri, buka `zyx-native-parity://shared-ui/shared-ui-shell-back-light`. Untuk entry lokal, pasang `<FirstSliceExample />` di dalam `SafeAreaProvider` setelah font dimuat. Jalankan `maestro test .maestro/native-parallel/shared-ui/first-slice.yaml` pada build galeri di viewport compact untuk memeriksa Back, aksi header, reset filter, dan retry. Jalankan `maestro test .maestro/native-parallel/shared-ui/layout-wide/list.yaml` di viewport 1024 dp untuk memverifikasi cabang layout lebar.

Halaman dapat mengikat aksi berdasarkan ID.

```tsx
type MaterialAction = "filter" | "upload";

<NativePageHeader<MaterialAction>
  actions={[{ id: "filter", label: "Filter" }, { id: "upload", label: "Unggah" }]}
  onAction={(id) => {
    if (id === "filter") openFilters();
    if (id === "upload") openUploadForm();
  }}
/>;
```

Contoh memakai ID `open-documents`, `filter`, `save`, `reset-filters`, dan `retry`. Aksi Back menerima fungsi tujuan eksplisit dari pemanggil. Data contoh sintetis memodelkan daftar dokumen Student, peserta Tutor, dan daftar pengguna Admin. Kasus retry mengubah state dari gagal ke berisi melalui callback yang sama dengan tombol. Contoh berjalan lokal tanpa sesi, endpoint, penulisan backend, atau dampak kontrak MCP.
