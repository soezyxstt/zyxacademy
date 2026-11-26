# Kontrak komposit bersama Expo

Halaman meneruskan label terjemahan, data, dan callback. Router mengikat ID navigasi ke tujuan. Adapter halaman menangani izin, permintaan, penyimpanan draft, dan pemulihan sesuai domain. Gunakan ID stabil dari data atau union string, dan berikan label aksesibel untuk setiap aksi ikon. ID pengujian di bawah memakai `T` untuk nilai prop `testID`.

## Kontrol

| Ekspor | Props dan callback | ID pengujian |
| --- | --- | --- |
| `SharedUiSearch` | `value` dan `onValueChange(value)` menerima teks mentah, termasuk string kosong saat hapus. `label` menamai input dan pemicu. `clearLabel` menamai aksi hapus. `expansion` menambahkan `expanded`, `onExpandedChange(expanded)`, dan `closeLabel`. Query terisi menjaga input terbuka. `pending` memberi indikator sibuk sambil input tetap dapat diedit. `onSubmit(value)` opsional untuk pencarian eksplisit. | `T-trigger`, `T-input`, `T-clear`, `T-close` |
| `SharedUiStatus` | `kind` menerima `status`, `loading`, `empty`, atau `error`. Berikan `message` dan `description` opsional. `layout="center"` cocok untuk ruang kosong. Jika `action` disediakan, sambungkan `onAction(id)` untuk membuat data, mereset filter, atau mencoba lagi. | `T`, `T-action` |
| `SharedUiToolbar` | `label` menamai grup. `leading` menerima kontrol fleksibel seperti filter atau pencarian. `trailing` dan `actions` mengikuti urutan baca. Aksi memakai `SharedUiAction<Id>` dan `onAction(id)`. | `T`, `T-<id>` |
| `SharedUiComposer` | `label`, `draft`, `onDraftChange(draft)`, `submitLabel` dan `onSubmit(draft)`. Gunakan `beforeInput` untuk konteks balasan dan lampiran. `canSubmitEmpty` mengizinkan kirim lampiran saja. `inputRef`, `selection` dan `onSelectionChange(selection)` mendukung penyisipan pada posisi kursor. `tools` dan `onTool(id)` menghubungkan alat penulisan. `pending` mengunci editor dan kirim selama permintaan. | `T`, `T-input`, `T-submit`, `T-error`, `T-tools-<id>` |

Untuk error yang dapat dikoreksi, pertahankan `draft` agar pengguna bisa mengedit sebelum mencoba lagi. Jika hasil kirim belum pasti, gunakan `editingDisabled` dan kaitkan `recovery.retry.onRetry()` ke payload dan ID permintaan asli yang dimiliki adapter. Isi `recovery.message` dengan pesan yang aman ditampilkan. Kosongkan draft setelah adapter mengonfirmasi keberhasilan.

Toolbar daftar diskusi dapat memberi ruang pencarian saat dibuka, dengan query dan filter tetap di layar pemanggil. Contoh interaktif tersedia di [ControlCases.tsx](ControlCases.tsx).

```tsx
<SharedUiSearch
  label="Cari pertanyaan"
  clearLabel="Hapus pencarian"
  value={query}
  onValueChange={setQuery}
  pending={loadingQuestions}
  expansion={{ expanded: searchOpen, onExpandedChange: setSearchOpen, closeLabel: "Tutup pencarian" }}
/>
```

## Data

| Ekspor | Props dan callback | ID pengujian |
| --- | --- | --- |
| `ResponsiveGrid<Item>` | `items`, `getItemKey(item)`, dan `renderItem(item)`. Secara bawaan, grid dokumen Student beralih ke 2–5 kolom pada lebar kontainer 464, 704, 944, dan 1184 dp yang disesuaikan dengan skala teks. `minItemWidth` atau `gap` mengaktifkan hitungan berdasarkan lebar kartu minimum. `maxColumns` membatasi jumlah kolom. | `T` |
| `ResponsiveTable<Row>` | `rows`, `getRowKey(row)`, dan `columns` dengan `id`, label kolom, dan `renderCell(row)`. `empty` memberikan isi saat hasil kosong. Kolom berubah menjadi baris bertumpuk pada kontainer sempit atau skala teks besar. | `T` |
| `Calendar` | Berikan `periodLabel`, `days`, dan `events` dalam zona waktu layar. `CalendarDay.label` adalah tanggal lengkap untuk pembaca layar. `CalendarEvent.dateId` mengacu ke `CalendarDay.id`. Kelola `selectedDateId` dan `selectedEventId` melalui `onDateChange(id)` dan `onEventPress(id)`. `onPeriodChange` menerima `-1` atau `1`. `labels` memasok nama periode, penanda hari ini, kondisi kosong, dan jumlah acara. | `T-previous`, `T-next`, `T-date-<id>`, `T-event-<id>` |
| `Pagination` | `page` berbasis 1, `pageCount`, dan `onPageChange(page)`. 0 hasil tampil sebagai 0 / 0 jika memakai formatter berikut. `labels` memberi nama navigasi dan teks sibuk. `pending` mengunci perpindahan selama pemuatan. | `T-previous`, `T-next` |

Contoh navigasi untuk daftar pertanyaan yang dimuat per halaman. Contoh data lengkap ada di [DataCases.tsx](DataCases.tsx).

```tsx
<Pagination
  page={page}
  pageCount={pageCount}
  onPageChange={loadPage}
  labels={{ previous: "Halaman sebelumnya", next: "Halaman berikutnya", busy: "Memuat halaman…" }}
  formatSummary={(current, count) => `${current} / ${count}`}
  pending={pending}
/>
```

## Navigasi dan overlay

| Ekspor | Props dan callback | ID pengujian |
| --- | --- | --- |
| `MobileNavbar` | `role` memilih aksi yang tersedia. Beri label pada setiap descriptor dan tangani `onAction(id)` untuk `back`, `home`, `switch-course`, `search`, `notifications`, `account`, atau `ops-ai`. `actionRefs` dapat memasok fokus kembali. Atur `includeSafeArea` bila shell sudah memberi inset. | `T-<id>` |
| `RoleBottomNavigation<Role>` | `labels` dan `activeId` bertipe sesuai peran. `onDestinationPress(id)` mengirim pilihan ke router. Gunakan `actionIds`, `expandedId`, dan `itemRefs` untuk tujuan seperti menu Admin. Beri nama grup melalui `accessibilityLabel` dan beri label pada badge bila ada. | `T-<id>` |
| `NavigationTabs<Id>` | `tabs` berisi `{ id, label, disabled? }`. Kelola `activeId` dan `onTabPress(id)`, termasuk pilihan dari overflow. Berikan `accessibilityLabel`, `moreLabel`, dan `closeLabel` untuk akses layar sempit. | `T-<id>`, `T-more`, `T-overflow-<id>` |
| `SharedDialog`, `SharedSheet`, `SharedPopover` | Kelola `open` melalui `onDismiss(reason)`. Berikan `title`, `closeLabel`, dan `description` bila diperlukan. Pertahankan overlay dalam pohon saat menutup agar `onAfterDismiss` dan pemulihan fokus berjalan. `initialFocusRef` dan `returnFocusRef` menunjuk target fokus. Popover juga memakai `anchorRef`. Host mengikat validasi serta kondisi pending dan dapat mengatur `dismissDisabled`. | `T`, `T-close`, `T-backdrop` |

ID tujuan mengikuti `roleNavigationDestinations`.

- Student memakai `home`, `courses`, `schedule`, `discuss`, dan `me`.
- Tutor memakai `home`, `schedule`, `discuss`, dan `classes`.
- Admin memakai `home`, `courses`, `people`, `ops`, dan `more`.

Contoh pilihan tab tetap melalui callback yang sama ketika tab ada di overflow. Contoh overlay dapat mempertahankan formulir saat validasi gagal dan mengembalikan fokus ke pemicu setelah ditutup.

```tsx
<NavigationTabs
  accessibilityLabel="Tampilan peringkat"
  moreLabel="Lainnya"
  closeLabel="Tutup"
  tabs={[{ id: "rank", label: "Rank" }, { id: "academic", label: "Akademik" }] as const}
  activeId={leaderboardTab}
  onTabPress={setLeaderboardTab}
/>
<SharedDialog
  open={requestOpen}
  onDismiss={() => setRequestOpen(false)}
  title="Perubahan jadwal"
  closeLabel="Tutup"
  initialFocusRef={reasonRef}
  returnFocusRef={requestButtonRef}
>
  {requestForm}
</SharedDialog>
```

Tombol tutup, backdrop, Back Android, dan gestur Escape VoiceOver memiliki alasan penutupan masing-masing. Verifikasi fokus pembaca layar dan keyboard perangkat pada build Android dan iOS.

## Uji perilaku kontrol

Dari akar repo dengan dependensi repo terpasang, jalankan pengujian handler React pada host uji terisolasi.

```sh
ZYX_CONTROL_TEST_DEPS="$(mktemp -d)"
npm install --prefix "$ZYX_CONTROL_TEST_DEPS" --no-save --package-lock=false --ignore-scripts react@19.3.0 react-test-renderer@19.3.0
ZYX_CONTROL_TEST_DEPS="$ZYX_CONTROL_TEST_DEPS" node --test tests/native-parity/shared-ui/controls.behavior.cjs
```

Uji ini menjalankan komponen dan primitif asli dengan pengganti binding React Native. Periksa interaksi perangkat melalui empat flow Maestro `control-*.yaml` di `.maestro/native-parallel/shared-ui/`.
