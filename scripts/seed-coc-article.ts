import { db } from "../db";
import { blogArticles } from "../db/schema";
import { nanoid } from "nanoid";

async function main() {
  const existingUser = await db.query.user.findFirst();
  if (!existingUser) {
    console.log("No user found.");
    return;
  }

  const content = `
*Keseruan masih berlanjut di episode 3 Clash of Champions Season 3. Setelah hadirnya Universe 3 dari Sekolah Kedinasan, kira-kira kejutan game apa lagi yang akan dihadirkan kali ini? Simak aturan main, sistem penilaian, dan strategi menyelesaikannya.*

---

**WHAT, ini ada Universe 3 juga?**

Kirain *season* ini cukup Universe 1 sama Universe 2 aja kayak *season* sebelumnya. Ternyata di Clash of Champions Season 3 masih ada kejutan lagi, *guys*!

Kali ini, kita kedatangan **15 peserta dari Sekolah Kedinasan**. Wah, pas mereka muncul, langsung beda banget *vibes*-nya. Seragamnya itu *lho*, bikin auranya kelihatan serius, tegas, dan agak *intimidating* ya *hahaha*. Baru muncul aja udah terasa kalau persaingannya bakal makin ketat.

Tapi justru itu yang bikin episode 3 makin menarik, *guys*. Karena sekarang, mahasiswa dan mahasiswi Kedinasan resmi masuk ke arena **Clash of Champions**. Kira-kira *game* apa ya yang bakal mereka mainkan kali ini? Dan bakal sejauh apa mereka bertahan di tengah persaingan para Champions lainnya? Yuk, simak artikel *games* episode 3 Clash of Champions Season 3 sampai tuntas ya!

## Scholastic Stamina

:::media {src="https://cdn-web-2.ruangguru.com//landing-pages/assets/71956c1b-4896-4284-bcab-c1f4b473af37.png" caption="Scholastic stamina - game coc 3 episode 3" sourceLabel="YouTube Ruangguru" sourceUrl="https://youtube.com"}
:::

Di tantangan kali ini, para Champions dari Kedinasan sudah siap pakai *uniform sport*. Begitu masuk arena, di depan mereka udah ada *treadmill* dan tablet dong, *guys*! Omo, ini sih *vibes*-nya langsung kayak *reality show* **Physical: 100**, nggak sih? *Hahaha.* Bedanya, kalau Physical: 100 yang diuji *full* fisik, kalau di Clash of Champions otak juga ikut diajak kerja keras, *nih*.

*Game* kali ini berjudul **Scholastic Stamina**. Sesuai namanya, tantangan ini menguji kombinasi kemampuan skolastik dan fisik dari para Champions. Jadi mereka harus tetap fokus mengerjakan soal lewat tablet, sambil tubuh mereka terus bergerak atau lari di atas *treadmill*.

Kebayang kan, biasanya ngerjain soal aja udah butuh konsentrasi penuh. Tapi kali ini, mereka harus sambil jaga napas, jaga ritme, dan jangan sampai fokusnya buyar. Sedikit aja kehilangan konsentrasi, bisa-bisa jawaban langsung meleset. Gokil ya!

### Aturan Permainan

- Champions akan bermain dalam **3 set** atau **3 fase**.
- Sebanyak **15 Champions** akan berlari di *treadmill* sambil mengerjakan **30 soal skolastik**.
- Soal yang diberikan akan menguji kemampuan **numerik**, **spasial**, dan **logika**.
- Tantangan ini akan dibagi ke dalam **tiga fase**.
- Di setiap fase, Champions akan mendapatkan 10 soal yang muncul satu per satu di layar **AdaptoX**.
- Setiap soal harus dijawab dalam waktu maksimal **satu menit**.
- Pada setiap fase, ***speed* pada *treadmill* akan meningkat**, sehingga tantangan fisik para Champions juga semakin berat.

:::media {src="https://cdn-web-2.ruangguru.com//landing-pages/assets/4bb02bb6-cafe-4d8a-88e3-c3d47354be50.png" caption="Game CoC season 3 episode 3" sourceLabel="YouTube Ruangguru" sourceUrl="https://youtube.com"}
:::

### Sistem Penilaian

- Pada akhir setiap fase, Champions dengan **skor akumulasi terendah** akan masuk ke babak **Deathmatch**.
- Di akhir fase pertama, **2 Champions** dengan skor terendah akan masuk Deathmatch.
- Di akhir fase kedua, **2 Champions** dengan skor terendah berikutnya akan masuk Deathmatch.
- Di akhir fase ketiga, **1 Champion** dengan skor terendah akan masuk Deathmatch.
- Hanya **10 Champions terbaik** yang mampu bertahan hingga akhir fase tiga yang akan mendapatkan tempat di babak berikutnya.
- Sementara itu, **5 Champions dengan skor terendah** harus memperjuangkan nasibnya di babak **Deathmatch**.

### Strategi Menyelesaikan Tantangan

:::media {src="https://cdn-web-2.ruangguru.com//landing-pages/assets/19b0323d-fc29-4a73-a150-913ea277ebb6.png" caption="Dihya - peserta coc season 3" sourceLabel="YouTube Ruangguru" sourceUrl="https://youtube.com"}
:::

Capeknya berasa sampai sini nggak sih, *guys*? Ngerjain soal sambil lari di *treadmill* tuh kelihatannya aja udah bikin ngos-ngosan, apalagi kalau harus tetap fokus baca soal dan mikir cepat.

Nah, ada satu tips menarik dari **Dihya**, mahasiwa Kedinasan dari **UNHAN jurusan Kedokteran Militer**. Menurutnya, saat berada di *treadmill*, jangan lari dengan posisi seperti orang lari biasa. Lebih baik posisi kepala agak menunduk supaya tubuh terasa lebih stabil. Dengan begitu, pandangan ke tablet juga lebih mudah dijaga, jadi soal bisa dibaca dengan lebih jelas tanpa terlalu banyak goyang.

Kelihatannya simpel, tapi di *game* seperti ini, hal kecil kayak posisi tubuh bisa ngaruh banget, *guys*! Karena kalau badan terlalu banyak bergerak, fokus bisa gampang buyar, baca soal jadi nggak stabil, dan waktu satu menit per soal bisa terasa makin cepat habis.

:::media {src="https://cdn-web-2.ruangguru.com//landing-pages/assets/d6ddeaf4-2dd2-4732-920f-a48d2a786445.png" caption="Eran - peserta kedinasan coc season 3" sourceLabel="YouTube Ruangguru" sourceUrl="https://youtube.com"}
:::

Masing-masing Champions punya cara sendiri buat menaklukkan **Scholastic Stamina**. Misalnya di **Fase 1** yaitu bagian **numerik**, **Eran mahasiswa PKN STAN jurusan Manajemen Keuangan Negara** ini memilih untuk memecah soal ke beberapa bagian kecil dulu.

Jadi, Eran nggak langsung menghitung semuanya dari kiri ke kanan, tapi melihat urutan operasinya dulu. Mana yang harus dikerjakan lebih awal, seperti pangkat, perkalian, pembagian, atau akar, baru setelah itu hasilnya digabung dengan penjumlahan dan pengurangan.

Intinya, di tipe soal seperti ini, kuncinya ada di urutan operasi matematika. Kalau salah urutan sedikit aja, hasil akhirnya bisa langsung beda. Jadi, strategi Eran adalah membaca pola soal dengan cepat, mengelompokkan hitungan, lalu mengerjakannya sesuai prioritas operasi supaya dapat angka yang tepat.

:::media {src="https://cdn-web-2.ruangguru.com//landing-pages/assets/e250abbc-fccf-4631-8ea6-2d8fa1249e4c.png" caption="Dihya UNHAN - games scholastic stamina" sourceLabel="YouTube Ruangguru" sourceUrl="https://youtube.com"}
:::

*Next* di **Fase 2** yaitu bagian **spasial**, menurut **Dihya dari UNHAN jurusan Kedokteran Militer**, tantangannya bukan menghitung angka, tapi membaca perubahan pola dari gambar pertama ke gambar berikutnya.

Pada soal ini, kita perlu memperhatikan beberapa objek di dalam kotak, mulai dari panah, lingkaran, persegi panjang, sampai segitiga. Setiap objek punya perubahan masing-masing. Ada yang berpindah posisi, ada yang berubah dari *outline* menjadi solid, dan ada juga yang berputar arah.

Kuncinya adalah melihat perubahan itu satu per satu, lalu menerapkan pola yang sama ke gambar setelah tanda sama dengan. Jadi, jangan hanya memilih gambar yang sekilas mirip, tapi cek lagi apakah posisi, bentuk, arah, dan isi tiap objeknya sudah mengikuti pola yang sama. Di tipe soal seperti ini, yang paling penting adalah teliti membaca relasi antar gambar dan cepat menangkap analoginya.

:::media {src="https://cdn-web-2.ruangguru.com//landing-pages/assets/13996380-d1f7-47a1-96a9-f8473bba8a85.png" caption="Kafka - peserta kedinasan coc season 3" sourceLabel="YouTube Ruangguru" sourceUrl="https://youtube.com"}
:::

Di **Fase 3**, para Champions masuk ke tipe soal **logika** dengan bentuk akar bersusun. Menurut **Kafka dari UNHAN jurusan Kedokteran Militer**, kunci mengerjakan soal seperti ini adalah mulai dari bagian akar yang paling dalam dulu.

Jadi, jangan langsung panik melihat bentuk soalnya yang panjang. Fokus aja dari bagian terdalam, lalu selesaikan satu per satu ke arah luar. Setelah hasil akar terdalam ketemu, hasil itu dipakai untuk menyelesaikan bagian akar berikutnya, begitu terus sampai sampai ke akar paling luar.

Setelah melewati tiga fase yang menguras otak dan stamina, akhirnya ada **5 Champions** yang harus gugur dari tantangan ini. Mereka adalah Champions dengan skor terendah dari fase 1, fase 2, dan fase 3.

Tapi perjalanan mereka belum benar-benar selesai, karena 5 Champions ini masih harus menghadapi babak **Deathmatch** melawan peserta dari **Universe 1** dan **Universe 2**.

Nah, kira-kira seperti apa *game* Deathmatch kali ini? Apakah tantangannya akan lebih menegangkan dari Scholastic Stamina? Kita lihat lanjutannya!

## Deathmatch: Gateway Call

Tantangan Deathmatch kali ini berjudul **Gateway Call**. Wah, dari namanya aja udah bikin penasaran. Ini maksudnya para Champions bakal saling *call*-an, atau gimana nih?

Di babak ini, ada **24 Champions dari Universe 1, Universe 2, dan Universe 3** yang punya satu tujuan yang sama, yaitu bertahan di Clash of Champions Season 3. Tantangan ini akan menguji kemampuan numerik dan logika para Champions. Misi utamanya adalah menemukan 12 digit nomor telepon yang tepat untuk menghubungi *handphone* Realme yang berada di tengah arena.

Kedengarannya simpel, ya? Tapi namanya juga Deathmatch, pasti nggak akan semudah itu, *guys*, berikut *rules* permainannya.

### Aturan Permainan

- Champions harus mengerjakan **tiga soal** yang tersedia di aplikasi **AdaptoX** melalui *handphone* **Realme** masing-masing.
- Aurora akan melakukan **video call** ke HP masing-masing Champions untuk menjelaskan soal yang harus mereka selesaikan.
- **Problem 1** disajikan dalam bentuk gambar dan akan menghasilkan **4 digit pertama**.
- **Problem 2** disajikan dalam bentuk video dan akan menghasilkan **4 digit berikutnya**.
- **Problem 3** disajikan dalam bentuk audio atau suara dan akan menghasilkan **4 digit terakhir**.

:::media {src="https://cdn-web-2.ruangguru.com//landing-pages/assets/e2c60eff-7918-4dc1-b0b1-920296270588.png" caption="Deathmatch gateway call" sourceLabel="YouTube Ruangguru" sourceUrl="https://youtube.com"}
:::

### Sistem Penilaian

- Dari ketiga *problem* tersebut, Champions harus menemukan total **12 digit nomor telepon** yang tepat.

:::media {src="https://cdn-web-2.ruangguru.com//landing-pages/assets/05d24f38-3b96-41d4-99dc-572d3521908f.png" caption="Deathmatch gateway call" sourceLabel="YouTube Ruangguru" sourceUrl="https://youtube.com"}
:::

- Setelah semua digit ditemukan, Champions dapat mencoba melakukan panggilan ke *handphone* **Realme** yang berada di tengah arena.

:::media {src="https://cdn-web-2.ruangguru.com//landing-pages/assets/a698eac7-025b-41b0-b09c-0912af0ca525.png" caption="Realme - deathmatch gateway call" sourceLabel="YouTube Ruangguru" sourceUrl="https://youtube.com"}
:::

- *Handphone* Realme di tengah arena hanya akan berdering jika jawaban dari ketiga *problem* benar.
- Jika salah satu *problem* salah, nomor telepon yang disusun tidak akan berhasil membuat *handphone* Realme di tengah arena berdering.
- Hanya **8 Champions tercepat** yang berhasil melakukan panggilan telepon yang akan lolos dari babak Deathmatch ini.
- Sementara itu, **16 Champions lainnya** harus tereliminasi dari **Clash of Champions Season 3**.

### Strategi Menyelesaikan Tantangan

Untuk menaklukkan Deathmatch **Gateway Call**, para Champions harus benar-benar teliti sejak *problem* pertama. Di *game* ini, mereka akan menghadapi **3 soal berbeda** dan setiap soal akan menghasilkan **4 digit angka**.

Jadi, strateginya bukan cuma cepat menjawab, tapi juga harus rapi menyusun alurnya. Mulai dari problem gambar, video, sampai audio, setiap jawaban harus dicatat dengan tepat karena semua digit itu akan digabung menjadi satu nomor telepon.

:::media {src="https://cdn-web-2.ruangguru.com//landing-pages/assets/30b338ee-466d-4dcf-8769-53dc4f06b769.png" caption="Niko peserta coc season 3" sourceLabel="YouTube Ruangguru" sourceUrl="https://youtube.com"}
:::

Untuk menyelesaikan **Cryptarithm** ini, menurut **Niko** peserta Kedinasan dari **Polstat STIS jurusan Statistika**, kuncinya adalah membaca penjumlahan dari kolom paling kanan ke kiri karena setiap kolom bisa menghasilkan *carry* atau simpanan angka.

Pertama, perhatikan kolom satuan. Dari situ, nilai **L + E** menghasilkan angka akhir **N** dan membawa simpanan ke kolom berikutnya. Lalu di kolom berikutnya, ada pola menarik karena hasil akhirnya tetap **A**, sehingga nilai **M** harus “menggenapkan” hitungan agar kembali ke angka A. Dari sini bisa didapat bahwa **M = 9**.

Setelah itu, hubungan di kolom tengah membantu menentukan nilai huruf lain. Karena setiap huruf harus punya angka yang unik, dan ada petunjuk **E < L < M**, maka susunan angkanya makin mengerucut. Hasil akhirnya ditemukan **E = 7**, **L = 8**, **N = 5**, dan **A = 6**. Jadi, 4 digit yang dicari dari **A – M – A – N** adalah **6965**.

:::media {src="https://cdn-web-2.ruangguru.com//landing-pages/assets/632a3939-e79c-4846-a213-be94a42d5658.png" caption="Derrick peserta coc season 3" sourceLabel="YouTube Ruangguru" sourceUrl="https://youtube.com"}
:::

Untuk **Problem 3**, unik banget nih *guys*, soalnya berupa audio! Suaranya seperti ini “*Aku adalah bilangan 4 digit dengan semua digit berbeda. Aku habis dibagi 6. Digit ratusanku adalah bilangan ganjil yang bukan prima. Digit ribuanku adalah dua kali digit satuanku. Hasil penjumlahan digit-digitku adalah 12. Bilangan apakah aku?*” Hayoo ada yang bisa nebak nggak jawabannya?

Nah, kalau menurut **Derrick mahasiswa NUS jurusan Chemical Engineering**, untuk menyelesaikan soal ini harus menggabungkan semua petunjuk dari audio sampai menemukan satu bilangan 4 digit yang paling cocok. Dari *clue*, bilangannya harus punya digit berbeda, habis dibagi 6, jumlah semua digitnya 12, digit ribuannya dua kali digit satuannya, dan digit ratusannya adalah bilangan ganjil yang bukan prima.

Dari sini, angka **4152** memenuhi semua syarat. Digit satuannya adalah 2, jadi digit ribuannya 4 karena dua kali dari 2. Digit ratusannya adalah 1, yang termasuk ganjil dan bukan bilangan prima. Lalu, karena jumlah digitnya harus 12, maka digit puluhannya adalah 5, sebab 4 + 1 + 5 + 2 = 12.

Angka 4152 juga habis dibagi 6, karena digit terakhirnya genap dan jumlah digitnya habis dibagi 3. Jadi, jawaban untuk problem audio ini adalah **4152**.

:::media {src="https://www.youtube.com/watch?v=u0-srwFlVxs" caption="Saksikan keseruan lengkap babak Deathmatch: Gateway Call." sourceLabel="YouTube Ruangguru" sourceUrl="https://youtube.com"}
:::

Yuk, pantengin terus sosial media dan media Zyx Academy biar kamu nggak ketinggalan update seru, aksi menegangkan, dan kejutan yang pastinya bakal pecah banget di panggung COC Season 3!

:::media {src="https://cdn-web-2.ruangguru.com//landing-pages/assets/58901536-e417-45be-8584-681dda6477be.png" caption="clash of champions season 3 ruangguru banner" sourceLabel="Ruangguru Official" sourceUrl="https://youtube.com"}
:::
  `;

  const articleId = nanoid();
  const slug = "game-coc-season-3-episode-3-scholastic-stamina-deathmatch";

  await db.insert(blogArticles).values({
    id: articleId,
    slug: slug,
    title: "Game COC Season 3 Episode 3: Scholastic Stamina & Deathmatch",
    summary: "Keseruan masih berlanjut di episode 3 Clash of Champions Season 3. Setelah hadirnya Universe 3 dari Sekolah Kedinasan, simak aturan main, sistem penilaian, dan strategi menyelesaikannya.",
    content: content,
    thumbnailUrl: "https://cdn-web-2.ruangguru.com//landing-pages/assets/27b13be5-5e0e-4fc0-930e-419203b4e8b0.png",
    category: "fakta_seru",
    readMinutes: 9,
    tags: ["Clash of Champions", "COC Season 3", "Scholastic Stamina", "Deathmatch"],
    status: "published",
    publishedAt: new Date(),
    createdById: existingUser.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log("Inserted CoC article with ID:", articleId);
  console.log("Slug:", slug);
  console.log("URL: http://localhost:3000/blog/" + slug);
}

main().catch(console.error).finally(() => process.exit(0));
