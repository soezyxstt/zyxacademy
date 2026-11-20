import type { DiscussionPerson } from "@/components/discussions/view-model";
import { addCalendarDays } from "@/lib/date-utils";
import { demoCommunitySeed } from "./community-seed";
import { demoPeople } from "./gamification";

export const demoDiscussionViewerId = "demo-self";
export const demoGeneralChannel = "demo-general";
export const demoCourseChannel = (id: string) => `demo-course-${id}`;

type Participant = "self" | "alya" | "ayu" | "bima" | "citra" | "dimas" | "intan" | "nadia" | "raka" | "tutor";
type SeedPost = {
  by: Participant;
  at: string;
  body: string;
  replyTo?: number;
  likes?: number;
};

type SeedThread = {
  id: string;
  title: string;
  daysAgo: number;
  posts: SeedPost[];
  resolved?: boolean;
  unread?: number;
};

const general: SeedThread[] = [
  {
    id: "review-sela-jadwal", title: "Cara mengulang flashcard kalau jadwal padat?", daysAgo: 0, unread: 1,
    posts: [
      { by: "citra", at: "07:42", body: "Selasa habis praktikum aku cuma punya jeda 15 menit sebelum kelas berikutnya. Ada cara milih kartu yang perlu diulang dulu? Kalau buka semua set, ujungnya cuma baca bagian depan." },
      { by: "ayu", at: "08:16", body: "Aku mulai dari kartu yang jatuh tempo. Sebelum dibalik, jawab dulu seingatnya, satu kalimat pun cukup. Kalau cuma terasa familier setelah lihat jawabannya, aku tandai masih sulit. Biasanya aku sempat 6 sampai 8 kartu.", likes: 2 },
    ],
  },
  {
    id: "catatan-tutorial", title: "Catatan yang dibawa ke tutorial", daysAgo: 3, resolved: true,
    posts: [
      { by: "raka", at: "12:09", body: "Buat tutorial pertemuan pertama, kalian bawa catatan lengkap atau cukup soal yang mau ditanyakan? Aku punya dua soal yang berhenti di langkah berbeda." },
      { by: "self", at: "13:22", body: "Aku bawa dua soal itu beserta coretannya. Aku lingkari langkah terakhir yang masih yakin dan tulis alasan kenapa ragu di langkah berikutnya. Waktu tutorial, jadi bisa langsung nunjuk bagian yang mau dibahas.", likes: 3 },
      { by: "raka", at: "15:04", replyTo: 1, body: "Aku coba tadi. Ternyata dua soalnya sama-sama berhenti karena aku belum gambar diagram gaya. Catatan pendeknya cukup." },
    ],
  },
];

const subjects: Record<string, SeedThread[]> = {
  "Kalkulus bersama": [
    {
      id: "limit-lubang", title: "Limit di x = 2 ketika fungsi tidak terdefinisi", daysAgo: 0, unread: 1,
      posts: [
        { by: "dimas", at: "08:03", body: "Waktu menghitung limit $\\frac{x^2-4}{x-2}$ aku dapat 4 setelah mencoret $x-2$. Tapi kalau $x=2$, pembaginya nol. Kenapa boleh dicoret?" },
        { by: "alya", at: "08:24", body: "Pencoretannya hanya berlaku saat $x\\ne 2$. Di sekitar 2, nilai pecahan itu sama dengan $x+2$. Saat $x$ mendekati 2, $x+2$ mendekati 4. Nilai fungsi tepat di 2 tetap tidak terdefinisi.", likes: 3 },
        { by: "dimas", at: "09:11", replyTo: 1, body: "Aku coba pakai 1,99 dan 2,01. Dapat 3,99 dan 4,01. Berarti angka 4 itu nilai yang didekati dari dua sisi." },
      ],
    },
    {
      id: "turunan-sudut", title: "Garis singgung di titik sudut grafik |x|", daysAgo: 1,
      posts: [{ by: "self", at: "20:47", body: "Aku gambar $y=|x|$. Di sebelah kiri $x=0$ kemiringannya −1, di sebelah kanan 1. Kalau di $x=0$, apa masuk akal pakai rata-ratanya supaya garis singgungnya datar?" }],
    },
  ],
  "Tim Newton": [
    {
      id: "gaya-meja", title: "Berat dan gaya normal, apakah pasangan aksi-reaksi?", daysAgo: 0, unread: 2,
      posts: [
        { by: "raka", at: "10:02", body: "Di diagram buku yang diam di meja, gaya normal ke atas dan berat ke bawah besarnya sama. Kenapa pasangan ini tidak dihitung sebagai aksi-reaksi?" },
        { by: "nadia", at: "10:19", body: "Coba kasih label siapa yang memberi gaya dan siapa yang menerima. Meja mendorong buku ke atas, Bumi menarik buku ke bawah. Dua gaya itu sama-sama bekerja pada buku.", likes: 1 },
        { by: "tutor", at: "11:06", replyTo: 1, body: "Untuk mencari pasangan gaya normal tadi, tukar yang memberi dan menerima gaya. Pasangannya ialah buku mendorong meja ke bawah. Untuk berat, pasangannya ialah buku menarik Bumi. Masing-masing pasangan bekerja pada dua benda berbeda.", likes: 4 },
      ],
    },
    {
      id: "diam-di-bus", title: "Kecepatan penumpang di dua kerangka acuan", daysAgo: 2,
      posts: [
        { by: "raka", at: "19:06", body: "Di bus yang bergerak 36 km/jam, aku jalan 1 m/s ke arah belakang. Dari trotoar berarti kecepatanku 9 m/s searah bus? Aku masih ragu bagian tanda minusnya." },
      ],
    },
    {
      id: "grafik-kecepatan", title: "Bagian grafik kecepatan yang ada di bawah sumbu", daysAgo: 4, resolved: true,
      posts: [
        { by: "nadia", at: "18:13", body: "Benda bergerak dengan $v=2$ m/s selama 3 s, lalu $v=-1$ m/s selama 2 s. Kalau ditanya jarak tempuh, apakah luas di bawah sumbu ikut dikurangi?" },
        { by: "raka", at: "18:35", body: "Untuk perpindahan, area di bawah sumbu bernilai negatif, jadi $6-2=4$ m. Untuk jarak tempuh, kedua bagian dihitung positif. Benda sudah berjalan 6 m lalu balik 2 m, jadi total 8 m.", likes: 2 },
      ],
    },
  ],
  "Ikatan belajar": [
    {
      id: "co2-polaritas", title: "Ikatan C=O polar, kenapa CO₂ nonpolar?", daysAgo: 1, unread: 1,
      posts: [
        { by: "self", at: "16:35", body: "Kalau setiap ikatan C=O polar, kenapa molekul CO₂ justru nonpolar? Aku baru bisa menentukan arah tarikan elektronnya, belum tahu cara pakai bentuk molekulnya." },
        { by: "citra", at: "17:02", body: "Gambar CO₂ sebagai O=C=O. Dua dipol ikatannya sama besar dan mengarah ke sisi yang berlawanan, jadi jumlahnya nol. Coba bandingkan dengan H₂O. Bentuknya bengkok, jadi dua dipol O-H tidak saling meniadakan.", likes: 2 },
        { by: "intan", at: "19:18", replyTo: 1, body: "Ini yang kelewat waktu aku bikin kartu hafalan. Aku pecah jadi dua pertanyaan: arah dipol tiap ikatan, lalu jumlah dipolnya setelah digambar bentuk molekulnya." },
      ],
    },
    {
      id: "pereaksi-pembatas", title: "Menentukan pereaksi pembatas dari mol awal", daysAgo: 2,
      posts: [
        { by: "intan", at: "08:31", body: "Kalau ada 3 mol H₂ dan 2 mol O₂ untuk reaksi $2\\mathrm{H_2}+\\mathrm{O_2}\\to2\\mathrm{H_2O}$, aku awalnya pilih O₂ sebagai pembatas karena molnya lebih sedikit. Bagian mana yang perlu aku cek lagi?" },
        { by: "tutor", at: "09:12", body: "Bandingkan mol awal setelah dibagi koefisien. Untuk H₂ hasilnya $3/2=1{,}5$, untuk O₂ $2/1=2$. H₂ habis lebih dulu. Untuk menghabiskan 3 mol H₂ diperlukan 1,5 mol O₂, jadi masih tersisa 0,5 mol O₂.", likes: 3 },
      ],
    },
  ],
  "Logika runtut": [
    {
      id: "kasus-uji-rata-rata", title: "Kasus uji untuk rata-rata saat daftar kosong", daysAgo: 0, unread: 1,
      posts: [
        { by: "bima", at: "09:43", body: "Algoritme rata-rata kelompokku lolos untuk [70, 80, 90]. Begitu dicoba dengan daftar kosong, panjangnya nol. Lebih masuk akal keluarkan 0 atau pesan belum ada nilai?" },
        { by: "ayu", at: "10:08", body: "Aku pilih pesan belum ada nilai. Daftar [0] punya rata-rata 0, sedangkan daftar kosong belum punya rata-rata. Jadikan keduanya kasus uji terpisah supaya perilakunya bisa dibedakan.", likes: 2 },
      ],
    },
    {
      id: "batas-kelulusan", title: "Nilai tepat 70 terlewat di kasus uji", daysAgo: 2,
      posts: [
        { by: "ayu", at: "18:54", body: "Aturan latihan kelompok kami: nilai 70 ke atas lulus. Pengecekan `nilai > 70` lolos untuk 66 dan 85, baru ketahuan salah waktu dicoba dengan 70. Untuk kasus batas ini, nilai uji mana yang sebaiknya disimpan?" },
        { by: "bima", at: "20:03", body: "Kalau nilainya bilangan bulat, simpan 69, 70, dan 71. Dengan `nilai >= 70`, 69 gagal, sedangkan 70 dan 71 lulus. Kasus 70 yang akan menangkap kalau tanda `=` hilang lagi.", likes: 2 },
      ],
    },
    {
      id: "dekomposisi-absensi", title: "Memecah proses rekap presensi", daysAgo: 5, resolved: true,
      posts: [
        { by: "self", at: "15:28", body: "Aku bagi alur rekap jadi baca masukan, hitung jumlah hadir, lalu tampilkan hasil. Kalau ada satu nama tercatat dua kali, pengecekannya masuk di bagian mana?" },
        { by: "bima", at: "16:01", body: "Cek duplikat setelah baca masukan, sebelum menghitung. Kalau rekamannya punya nomor mahasiswa, pakai nomor itu sebagai identitas. Nama yang sama bisa milik dua orang berbeda.", likes: 1 },
        { by: "self", at: "20:11", replyTo: 1, body: "Sudah aku pakai untuk dua kasus uji: satu nomor muncul dua kali, lalu dua nomor berbeda dengan nama sama. Hitungannya sekarang sesuai." },
      ],
    },
  ],
};

export function demoDiscussionSeed(courses: readonly { id: string; title: string }[], asOf: string, viewer: DiscussionPerson) {
  const people: Record<string, DiscussionPerson> = Object.fromEntries(demoPeople.map(person => [person.publicId.slice(5), {
    id: person.publicId, name: person.displayName, role: "student" as const,
  }]));
  people.self = viewer;
  function build(thread: SeedThread, channelId: string, tutor?: DiscussionPerson) {
    const id = `${channelId}-${thread.id}`;
    return {
      id, channelId, title: thread.title, resolved: thread.resolved ?? false, unread: thread.unread ?? 0,
      messages: thread.posts.map((post, index) => ({
        id: `${id}-${index + 1}`, author: post.by === "tutor" && tutor ? tutor : people[post.by],
        body: post.body, createdAt: new Date(`${addCalendarDays(asOf, -thread.daysAgo)}T${post.at}:00+07:00`).toISOString(),
        messageType: index === 0 ? "question" as const : post.replyTo === undefined ? "answer" as const : "reply" as const,
        replyTo: post.replyTo === undefined ? undefined : `${id}-${post.replyTo + 1}`,
        likes: post.likes ?? 0,
      })),
    };
  }
  const threads = general.map(thread => build(thread, demoGeneralChannel));
  for (const course of courses) {
    if (!/matematika|kalkulus|ma1101|fisika|fi1101|kimia|ki1101|komputasional|wi1102/i.test(`${course.title} ${course.id}`)) continue;
    const group = demoCommunitySeed(course.id, course.title);
    const tutor: DiscussionPerson = { id: `demo-tutor-${course.id}`, name: group.tutor, role: "tutor" };
    for (const thread of subjects[group.group] ?? []) threads.push(build(thread, demoCourseChannel(course.id), tutor));
  }
  return threads;
}
