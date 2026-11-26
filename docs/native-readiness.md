# Audit kesiapan aplikasi Expo

**Baseline 26 November 2026. Sasaran 95% belum tercapai.** Audit membandingkan klien Expo dengan web Zyx pada commit `fa3ce04ed78181810b31ff1b3bf5852c24f6ec5f`. Entry Expo membuka `ParityGallery` tanpa rute produk, sesi, atau klien data LMS. Aplikasi Capacitor memiliki jalur distribusi dan implementasi tersendiri. Bukti pengujian bersumber dari CI PR 511 pada commit tersebut. Perubahan lokal setelah commit ini memerlukan bukti baru. [PR 511](https://github.com/soezyxstt/zyxacademy/pull/511), [entry Expo](../apps/mobile-native/App.tsx), [aplikasi Capacitor](../apps/mobile/README.md).

| Sumbu | Cakupan pada baseline | Bukti Expo yang lulus | Ambang |
|---|---|---|---|
| Komponen | 668 modul UI TSX di luar halaman dan fixture. Satu modul dapat memuat beberapa komponen. 44 modul di `components/ui` termasuk di dalamnya. | 1/668 modul (0,15%) memiliki tiga kasus visual lulus di kedua platform. 0/668 memiliki bukti seluruh kontrak. | Minimal 635/668 modul pada baseline, dan minimal 95% komponen individual setelah semua ekspor dan komponen lokal dipetakan. |
| Halaman | 168 pola rute aplikasi, termasuk rute publik, otorisasi dan kompatibilitas. 59 rute `visual-fixtures` dicatat terpisah. | 0/168 (0%). Galeri internal dapat dijalankan oleh CI. | Minimal 160/168 halaman dengan navigasi, data dan state yang telah diverifikasi. |
| Fungsi backend yang dibutuhkan klien | 222 kandidat metode HTTP setelah pemilahan awal, 246 Server Actions, serta pembacaan langsung dari Server Components dan operasi dinamis. Inventaris fungsi produk masih terbuka. | 0 operasi terintegrasi dan teruji melalui Expo (0%). | Setelah pemetaan dan deduplikasi, minimal `ceil(0.95 × jumlah operasi produk relevan)`. |

Ketiga ambang berlaku sendiri-sendiri. Persentase komponen terhadap jumlah berkas hanya membantu menemukan celah. Modul dengan lima komponen baru mendapat kredit modul ketika kelimanya lulus. Sebelum keputusan akhir, buat entri per komponen dengan ID berkas dan simbol, termasuk komponen di halaman atau renderer, subkomponen, variasi aksesibel dan alias. Catat alasan untuk modul utilitas, ekspor ulang atau implementasi desktop yang dilayani oleh padanan mobile. Laporkan juga item belum dipetakan, sebab item tersebut masih masuk lingkup audit.

## Bukti visual pada commit baseline

Run 45784124155 membandingkan separator horizontal terang, vertikal terang dan horizontal gelap. Masing-masing mencatat 0 piksel berbeda pada emulator Android dan simulator iOS. Implementasi web juga menerima `decorative={false}`, sementara komponen Expo di commit tersebut selalu tersembunyi dari pembaca layar. Belum ada bukti semantik untuk varian itu atau pengujian perangkat fisik. Skeleton yang tersedia di working tree saat audit belum tercakup dalam run ini. [Hasil Android](https://github.com/soezyxstt/zyxacademy/actions/runs/45784124155/job/139786898021), [hasil iOS](https://github.com/soezyxstt/zyxacademy/actions/runs/45784124155/job/139786897915), [kontrak Separator web](https://github.com/soezyxstt/zyxacademy/blob/fa3ce04ed78181810b31ff1b3bf5852c24f6ec5f/components/ui/separator.tsx), [implementasi Expo saat diuji](https://github.com/soezyxstt/zyxacademy/blob/fa3ce04ed78181810b31ff1b3bf5852c24f6ec5f/apps/mobile-native/components/Separator.tsx).

## Inventaris per permukaan

| Permukaan web | Jumlah | Bukti yang diperlukan untuk lulus |
|---|---:|---|
| Komponen dalam `components/` | 467 | Tiga kasus per komponen dengan web pembanding, termasuk renderer artikel, formula, media atau interaksi jika relevan. |
| Komponen dalam `features/` | 31 | Kontrak yang digunakan fitur, termasuk bentuk desktop dan mobile, state dan perilaku yang relevan. |
| Modul UI lokal dalam `app/` selain halaman dan fixture | 170 | Termasuk 23 layout dan 78 tampilan loading. Periksa shell, navigasi, safe area, Back dan pemulihan. |
| Halaman Student | 50 | Dashboard, kursus dan materi, pembaca, kuis atau tryout, diskusi, jadwal, profil. Uji peserta berhak dan akses yang dicabut. |
| Halaman Tutor | 18 | Kursus yang ditugaskan, peserta, penilaian, jadwal dan diskusi. Uji penolakan pada kursus di luar penugasan. |
| Halaman Admin | 72 | Pengguna, kursus, konten, analitik, operasi dan aksi dengan konfirmasi. Uji otorisasi server, pengiriman berulang serta konsekuensi aksi. |
| Halaman marketing | 16 | Termasuk login, daftar, logout, blog, formulir, demo dan rute publik. |
| Halaman bersama dan rute lain | 12 | Termasuk dua rute handoff auth, dua halaman MCP, kompatibilitas Murid, preview authoring, formulir publik, meet, offline, tautan dan v4. |

Hitung satu pola dinamis sebagai satu halaman. Uji parameter yang valid, hilang dan ditolak melalui navigasi yang benar. Untuk halaman alias, rekam tujuan aktual dan Back. Untuk halaman yang dilayani browser sistem, rekam handoff, izin dan kembalinya pengguna ke Expo. Setiap halaman memerlukan keadaan berisi, kosong/loading dan error/pemulihan bila berlaku. Catat tema, bahasa, teks panjang dan penggunaan dengan teknologi bantu pada kontrol terkait. [Peta fitur](features.md), [urutan migrasi dan kasus per komponen](mobile-native.md).

## Batas hitung backend

Terdapat 179 modul `app/api/**/route.ts` dengan 247 pasangan metode dan pola rute. Pemilahan awal memisahkan 14 metode milik cron, queue internal, transport MCP, schema authoring atau callback layanan live, serta 11 metode dari delapan berkas yang mengembalikan respons authoring pensiun. Tersisa 222 kandidat untuk dicocokkan dengan alur produk. Pada `app`, `lib`, `components`, dan `features`, 47 modul berawalan `use server` mengekspor 245 fungsi. Satu tindakan inline tambahan adalah `disconnect` pada halaman koneksi MCP. Di luar `app/api` terdapat sembilan Route Handlers, termasuk App/Universal Links, metadata OAuth, runtime coding dan tautan pendek. Tinjau pemakaian masing-masing pada alur terkait.

Satu unit fungsi produk adalah satu operasi dengan input, hasil atau efek dan aturan otorisasi yang dapat diuji dari sebuah alur. Hubungkan ID operasi ke pemanggil web, peran, kontrak server dan pemanggil Expo. Satukan alias setelah efek dan batas izin dicocokkan. Pecah rute catch-all seperti Better Auth dan `/api/murid/[...path]` menurut operasi yang dipakai. Tambahkan pembacaan implisit dari Server Components. Contohnya, dashboard Admin melakukan query server, dashboard Tutor memanggil read model, dan dashboard Student menyatukan sesi, enrollment serta bagian yang dimuat menggunakan Suspense. Pemindahan query ke klien harus mempertahankan otorisasi di server. [Dashboard Admin](<../app/(admin)/admin/page.tsx>), [dashboard Tutor](<../app/(tutor)/tutor/page.tsx>), [dashboard Student](<../app/(student)/dashboard/page.tsx>).

Simpan operasi internal, pensiun, duplikat dan operasi khusus web beserta alasannya. Untuk fungsi asinkron, verifikasi aksi pengguna sampai hasil job, termasuk status, retry dan pemulihan. Bukti Expo untuk operasi aktif memerlukan panggilan terhadap kontrak server yang sama, respons sukses, penolakan izin, validasi dan pemulihan yang relevan. Uji identitas ulang untuk mutasi, pembatalan dan putus koneksi untuk stream, serta lease, cursor, perubahan hak dan pergantian akun untuk offline. Jumlah 222 dan 246 tidak dapat langsung dijumlahkan menjadi target fungsi akhir. [Kontrak offline](operations/offline-data-sync.md), [stream Zyra](../app/api/zyra/chat/route.ts), [katalog operasi MCP](../lib/admin-mcp/operations-catalog.ts).

## Autentikasi dan perangkat

| Gerbang | Status Expo saat baseline | Bukti untuk keputusan kesiapan |
|---|---|---|
| Sesi dan peran | 0 dari 3 peran memiliki alur login hingga halaman berotorisasi pada kedua platform. | Untuk Student, Tutor dan Admin, uji login, pembatalan, sesi kedaluwarsa, logout, ganti akun dan pembukaan ulang dengan sesi tersimpan. Buktikan penolakan peran lain, hak per kursus dan isolasi cache. |
| Tautan dan identitas aplikasi | Konfigurasi galeri menggunakan ID terpisah `com.zyx.academy.nativeparity`. | Uji callback melalui browser sistem dan deep link saat aplikasi tertutup/terbuka, tujuan awal sesudah login, dan binding scheme, origin serta signing pada lingkungan yang diuji. |
| Perangkat | Bukti CI tersedia pada satu emulator Android dan satu simulator iOS untuk galeri. 0 dari 2 platform memiliki bukti alur produk pada perangkat fisik yang diperiksa dalam audit ini. | Sertakan model, versi OS, build, skala, font, tema, safe area, ukuran teks, TalkBack/VoiceOver, gestur dan perilaku kembali. Jalankan alur terkait notifikasi, kamera dan pemulihannya, share/file, haptik, offline, suspend/resume serta pembaruan pada perangkat nyata. |

Pisahkan keputusan kelulusan produk dari keputusan rilis. Bukti distribusi mencakup instalasi dan pembaruan aplikasi bertanda tangan, pemisahan nightly/staging dan stable/production, migrasi akun, serta rollback ke Capacitor. Commit, run, artefak dan hasil tiap platform perlu dicatat untuk setiap kredit. Peninjau utama memeriksa gambar yang disyaratkan sesuai proses visual repositori. Tidak ada build lokal, pengujian perangkat fisik, publikasi, perubahan MCP atau deployment dalam audit ini. [Konfigurasi galeri](../apps/mobile-native/app.json), [kontrak autentikasi dan rilis](mobile-native.md).

## Mengulang hitungan sumber

Jalankan dari root checkout. Perintah berikut hanya membaca objek Git di commit baseline. Daftar `ui`, `pages`, `methods` dan `actions` dapat dicetak untuk melihat ID sumber. Saat mengaudit commit berikutnya, periksa kembali bentuk ekspor, direktif inline, ekstensi baru, lokasi fixture dan perubahan daftar eksklusi.

```python
import re
import subprocess
from collections import Counter

ref = "fa3ce04ed78181810b31ff1b3bf5852c24f6ec5f"

def git(*args):
    return subprocess.check_output(["git", *args]).decode()

files = git("ls-tree", "-r", "--name-only", ref).splitlines()
app = [p for p in files if p.startswith("app/") and "/visual-fixtures/" not in p]
pages = [p for p in app if p.endswith("/page.tsx")]
ui = [p for p in files if p.endswith(".tsx") and
      (p.startswith(("components/", "features/")) or (p in app and p not in pages))]
print("UI", Counter(p.split("/")[0] for p in ui))
print("Pages", Counter(p.split("/")[1] for p in pages))

methods = {}
for p in files:
    if p.startswith("app/api/") and p.endswith("/route.ts"):
        src = git("show", f"{ref}:{p}")
        group = "candidate"
        if p.startswith(("app/api/cron/", "app/api/internal/", "app/api/mcp/",
                         "app/api/authoring/contracts/")) or p == "app/api/live/callback/route.ts":
            group = "service, agent or schema"
        if "retiredAdminAuthoringResponse" in src or "BROWSER_MANUAL_AUTHORING_RETIRED" in src:
            group = "retired"
        for verb in re.findall(r"^export (?:async )?(?:function|const) (GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b", src, re.M):
            methods[p, verb] = group
print("HTTP", Counter(methods.values()))

roots = ["app", "components", "lib", "features"]
directive = r"""^[[:space:]]*["']use server["'];"""
hits = git("grep", "-n", "-E", directive, ref, "--", *roots).splitlines()
actions = []
for hit in hits:
    _, path, line, _ = hit.split(":", 3)
    if line == "1":
        src = git("show", f"{ref}:{path}")
        actions.extend((path, name) for name in re.findall(r"^export async function (\w+)", src, re.M))
    else:
        print("Inspect inline action", path, line)
print("Exported actions", len(actions))
```
